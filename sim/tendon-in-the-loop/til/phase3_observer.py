"""Small joint-only recurrent observer and calibrated reduced-order baseline."""
import json
import numpy as np
import h5py
import torch
from .coupling import MOTOR_ONLY_CHANNELS
from .phase3 import geometry,design,mechanism
from .observer import motor_tension


def contact_phases(force,dt=.005):
    """Causal force hysteresis for offline regime labels, avoiding solver-contact chatter."""
    settings=design()["evaluation"];state=False;filtered=0.;dwell=0.;result=[]
    alpha=1-np.exp(-dt/settings["contact_force_filter_s"])
    for value in force:
        filtered+=alpha*(value-filtered)
        candidate=filtered<settings["contact_off_N"] if state else filtered>settings["contact_on_N"]
        dwell=dwell+dt if candidate else 0.
        if dwell+1e-12>=settings["contact_dwell_s"]:state=not state;dwell=0.
        result.append(state)
    return np.array(result,dtype=bool)


def load_runs(path,splits=None):
    result=[]
    with h5py.File(path) as f:
        for name,g in f["episodes"].items():
            if "failed" in g.attrs:continue
            c=json.loads(g.attrs["config"]);s=slice(None,None,5)
            if splits is not None and c["scenario_id"] not in splits:continue
            q=json.loads(g.attrs["quality"])
            x=np.column_stack([g[k][s] for k in MOTOR_ONLY_CHANNELS]).astype(np.float32)
            y=g["simulation/joint_positions"][s].astype(np.float32);t=g["time"][s]
            contact=contact_phases(g["simulation/contact_force"][s])
            onset=np.zeros(len(t),bool);release=np.zeros(len(t),bool)
            for i in np.flatnonzero(np.diff(contact.astype(int))==1)+1:onset[i:min(len(t),i+40)]=True
            for i in np.flatnonzero(np.diff(contact.astype(int))==-1)+1:release[i:min(len(t),i+40)]=True
            recovery=np.zeros(len(t),bool)
            for i in np.flatnonzero(np.diff(contact.astype(int))==-1)+1:recovery[min(len(t),i+40):min(len(t),i+100)]=True
            prefix=c["metadata"]["protocol"]["probe_duration"]
            result.append(dict(id=name,split=c["scenario_id"],config=c,quality=q,x=x,y=y,time=t,contact=contact,
                masks=dict(all=np.ones(len(t),bool),post_probe=t>=prefix,initialization=t<.3,
                    settled=t>=1.,free_before_contact=(~contact)&(np.cumsum(contact)==0),
                    onset=onset,sustained=contact&~onset,release=release,recovery=recovery)))
    return result


def prediction(model,run,scaler):
    model.eval()
    with torch.no_grad():
        x=torch.tensor((run["x"]-scaler["x_mean"])/scaler["x_std"])[None]
        y,_=model(x)
    return y[0].numpy()*scaler["y_std"]+scaler["y_mean"]


def score(y,estimate,mask=None):
    if mask is not None:y,estimate=y[mask],estimate[mask]
    if not len(y):return None
    e=(estimate-y)*180/np.pi
    return {f"q{i+1}_{metric}_deg":float(value) for i in range(2) for metric,value in
        (("mae",np.mean(abs(e[:,i]))),("rmse",np.sqrt(np.mean(e[:,i]**2))),
         ("p95",np.quantile(abs(e[:,i]),.95)),("max",np.max(abs(e[:,i]))))}


def score_run(run,estimate):return {name:score(run["y"],estimate,mask) for name,mask in run["masks"].items()}


def kinematic(run,home=None):
    home=np.array(home if home is not None else design()["home_q_rad"])
    if not hasattr(kinematic,"lookup"):
        increment=np.linspace(-.1,1.4,600)
        lengths=np.array([geometry(home+v)[0]-geometry(home)[0] for v in increment])
        kinematic.lookup=(lengths[::-1],increment[::-1])
    lengths,increment=kinematic.lookup
    delta=np.interp(-.02*run["x"][:,0],lengths,increment)
    return home[None,:]+delta[:,None]


def transmitted_force(run):
    """Nominal actuator calibration and causal reduced presliding estimate, no distal measurements."""
    tin=motor_tension(run,dynamic=True);x=.02*run["x"][:,0]
    out=np.zeros(len(tin));torque=0.;previous=x[0]
    for i,T in enumerate(tin):
        limit=.02*T*(1-np.exp(-.05*np.pi/2))+.001
        torque=float(np.clip(torque+2.*(x[i]-previous)/.02,-limit,limit))
        out[i]=max(0.,T-torque/.02);previous=x[i]
    return tin,out


def fit_physics(runs,config=None):
    """One-time compliance calibration from the same train-only joint-reference supervision."""
    cfg=config or design();home=np.array(cfg["home_q_rad"]);length0=geometry(home)[0]
    features=[];deformations=[]
    for r in runs:
        if r["split"]!="train" or r["config"]["metadata"]["case"]!="C_passive" or not r["quality"]["eligible"]:continue
        tin,tout=transmitted_force(r)
        features.append((tin+tout)/2-cfg["pretension_N"])
        deformations.append(.02*r["x"][:,0]+np.array([geometry(q)[0]-length0 for q in r["y"]]))
    if not features:raise ValueError("calibrated passive training references required")
    x=np.concatenate(features);y=np.concatenate(deformations)
    slope,intercept=np.linalg.lstsq(np.column_stack((x,np.ones(len(x)))),y,rcond=None)[0]
    if slope<=0:raise ValueError("nonpositive fitted compliance")
    return dict(compliance_m_per_N=float(slope),offset_m=float(intercept),home=home.tolist(),
        nominal_pretension_N=cfg["pretension_N"],mechanism=cfg["mechanism"],
        calibration_runs=[r["id"] for r in runs if r["split"]=="train" and r["config"]["metadata"]["case"]=="C_passive"],
        measurement_sigma_m=.0003,velocity_process_sigma_rad_per_s=.03,
        interpretation="Reference joints used only for one-time train-set compliance calibration. Free-space reduced model; no inference contact labels.")


class PhysicsObserver:
    def __init__(self,calibration,mechanism_override=None):
        from .finger import Finger
        import mujoco
        self.c=calibration;self.home=np.array(calibration["home"])
        self.m=mechanism_override or calibration["mechanism"]
        f=Finger();mechanism(f,self.m);f.reset(tuple(self.home),pretension=calibration["nominal_pretension_N"])
        full=np.zeros((f.model.nv,f.model.nv));mujoco.mj_fullM(f.model,f.data,full)
        self.M=full[np.ix_(f.dof,f.dof)]
        self.K=np.diag([self.m["k1"],self.m["k2"]]);self.B=np.eye(2)*self.m["damping"]
        self.l0,self.J0=geometry(self.home,self.m["h1"],self.m["h2"])
        self.g0=self.gravity(self.home)

    def gravity(self,q):
        m1,m2=.02,.012;L1,L2=.05,.035
        g2=9.81*m2*L2/2*np.cos(q.sum())
        return np.array([9.81*(m1*L1/2+m2*L1)*np.cos(q[0])+g2,g2])

    def transition(self,x,T,dt):
        q,v=x[:2],x[2:]
        _,J=geometry(q,self.m["h1"],self.m["h2"])
        force=-J*T+self.J0*self.c["nominal_pretension_N"]+self.gravity(q)-self.g0-self.K@(q-self.home)
        velocity=np.linalg.solve(self.M+dt*self.B+dt*dt*self.K,self.M@v+dt*force)
        qnew=q+dt*velocity
        bounded=np.clip(qnew,[-.3,0.],[1.6,2.]);velocity=np.where(bounded==qnew,velocity,0.)
        return np.r_[bounded,velocity]

    def predict(self,run):
        tin,tout=transmitted_force(run);dt=float(np.median(np.diff(run["time"])))
        x=np.r_[self.home,np.zeros(2)]
        P=np.diag([np.deg2rad(.2)**2]*2+[.05**2]*2)
        Q=np.diag([np.deg2rad(.01)**2]*2+[self.c["velocity_process_sigma_rad_per_s"]**2]*2)
        R=self.c["measurement_sigma_m"]**2;result=[]
        for i,T in enumerate(tout):
            predicted=self.transition(x,T,dt);F=np.empty((4,4));epsilon=1e-5
            for j in range(4):
                perturbed=x.copy();perturbed[j]+=epsilon
                F[:,j]=(self.transition(perturbed,T,dt)-predicted)/epsilon
            P=F@P@F.T+Q
            length,J=geometry(predicted[:2],self.m["h1"],self.m["h2"])
            H=np.r_[J,0.,0.]
            measured=self.c["compliance_m_per_N"]*((tin[i]+tout[i])/2-self.c["nominal_pretension_N"])+self.c["offset_m"]-.02*run["x"][i,0]
            gain=P@H/(H@P@H+R)
            x=predicted+gain*(measured-(length-self.l0))
            I=np.eye(4)-np.outer(gain,H);P=I@P@I.T+np.outer(gain,gain)*R
            x[:2]=np.clip(x[:2],[-.3,0.],[1.6,2.])
            result.append(x[:2].copy())
        return np.array(result)
