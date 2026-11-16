"""Eight-channel, causal joint inference; no emulator or distal channels are read as inputs."""
import json
import h5py
import numpy as np
import torch
from torch import nn
from .two_tendon import ARM,HOME,MOTOR_CHANNELS,TwoTendonFinger
from .two_tendon_experiment import gravity,target
from .phase3_observer import contact_phases,score


class TwoMotorObserver(nn.Module):
    def __init__(self,hidden=32):
        super().__init__();self.gru=nn.GRU(8,hidden,batch_first=True);self.head=nn.Linear(hidden,2)
    def forward(self,x,hidden=None):
        state,hidden=self.gru(x,hidden);return self.head(state),hidden


def load_runs(path,splits=None):
    runs=[]
    with h5py.File(path) as f:
        for name,g in f["episodes"].items():
            spec=json.loads(g.attrs["config"])
            if splits is not None and spec["scenario_id"] not in splits:continue
            if "failed" in g.attrs:raise ValueError("failed run "+name)
            t=g["time"][::5];x=np.column_stack([g[k][::5] for k in MOTOR_CHANNELS]).astype(np.float32)
            y=g["simulation/joint_positions"][::5].astype(np.float32);contact=contact_phases(g["simulation/contact_force"][::5])
            if not np.isfinite(x).all() or not np.isfinite(y).all():raise ValueError("nonfinite observer run")
            release=np.zeros(len(t),bool);onset=release.copy();recovery=release.copy()
            for i in np.flatnonzero(np.diff(contact.astype(int))==-1)+1:
                release[i:i+40]=True;recovery[i+40:i+100]=True
            for i in np.flatnonzero(np.diff(contact.astype(int))==1)+1:onset[i:i+40]=True
            desired_velocity=np.array([target(float(ti),spec)[1] for ti in t]);reversal=np.zeros(len(t),bool);last=0.
            for i,value in enumerate(desired_velocity.sum(1)):
                sign=np.sign(value) if abs(value)>.01 else 0.
                if sign and last and sign!=last:reversal[max(0,i-20):i+20]=True
                if sign:last=sign
            runs.append(dict(id=name,split=spec["scenario_id"],config=spec,time=t,x=x,y=y,
                quality=json.loads(g.attrs["quality"]),masks=dict(all=np.ones(len(t),bool),initialization=t<.3,motion=t>=.6,
                    steady=(t>=.6)&(np.max(abs(desired_velocity),axis=1)<.01),reversal=reversal,
                    contact=contact,onset=onset,sustained=contact&~onset,release=release,recovery=recovery,
                    free_before_contact=(~contact)&(np.cumsum(contact)==0),free=~contact)))
    return runs


def predict(model,run,scaler):
    model.eval()
    with torch.no_grad():
        y,_=model(torch.tensor((run["x"]-scaler["x_mean"])/scaler["x_std"])[None])
    return y[0].numpy()*scaler["y_std"]+scaler["y_mean"]


def tension(run):
    """Dynamics-corrected input force and nominal presliding proxy, using only motor histories."""
    dt=float(np.median(np.diff(run["time"])));tin=[];tout=[]
    for i in (0,4):
        x=run["x"];omega=x[:,i+1];derivative=np.r_[0.,np.diff(omega)/dt]
        force=np.maximum(0.,(.1*x[:,i+2]-2e-5*derivative-2e-5*omega)/.02)
        distal=[];torque=0.;previous=.02*x[0,i]
        for k,T in enumerate(force):
            current=.02*x[k,i];limit=.02*T*(1-np.exp(-.05*np.pi/2))+.001
            torque=float(np.clip(torque+2.*(current-previous)/.02,-limit,limit));previous=current
            distal.append(max(0.,T-torque/.02))
        tin.append(force);tout.append(distal)
    return np.column_stack(tin),np.column_stack(tout)


def fit_compliance(runs):
    training=[r for r in runs if r["split"]=="train"]
    if not training:raise ValueError("training-only reference calibration required")
    slopes=[];offsets=[]
    for i in range(2):
        features=[];labels=[]
        for r in training:
            ti,to=tension(r);features.append((ti[:,i]+to[:,i])/2-10.)
            labels.append(.02*r["x"][:,4*i]-(r["y"]-HOME)@ARM[i])
        z=np.concatenate(features);y=np.concatenate(labels)
        slope,offset=np.linalg.lstsq(np.column_stack((z,np.ones(len(z)))),y,rcond=None)[0]
        if slope<=0:raise ValueError("nonpositive compliance calibration")
        slopes.append(float(slope));offsets.append(float(offset))
    calibration=dict(compliance_m_per_N=slopes,offset_m=offsets,training_ids=[r["id"] for r in training],home=HOME.tolist(),
                scope="Train-only joint-reference supervision; nominal friction/dynamics, no per-test true parameters.")
    # Calibrate both update confidence and reduced-model discrepancy from the same
    # reference runs. A guessed, large length R can suppress both independent sensors.
    observer=PhysicsObserver(calibration);length_residuals=[];process_residuals=[]
    for r in training:
        dt=float(np.median(np.diff(r["time"])));ti,to=tension(r)
        measured=.02*r["x"][:,[0,4]]-((ti+to)/2-10.)*slopes-offsets
        length_residuals.append(measured-(r["y"]-HOME)@ARM.T)
        qd=np.gradient(r["y"].astype(float),dt,axis=0);state=np.column_stack((r["y"],qd))
        forecast=np.array([observer.transition(x,T,dt) for x,T in zip(state[:-1],to[:-1])])
        process_residuals.append(state[1:]-forecast)
    calibration["length_measurement_covariance_m2"]=(np.cov(np.concatenate(length_residuals).T)+np.eye(2)*1e-12).tolist()
    calibration["state_process_covariance"]=(np.cov(np.concatenate(process_residuals).T)+np.diag([1e-12,1e-12,1e-6,1e-6])).tolist()
    calibration["noise_calibration"]="Empirical residual covariance on the same training references; offline joint differentiation is used only for calibration. No test labels or contact labels used."
    return calibration


def rigid(run):return HOME+np.linalg.solve(ARM,.02*run["x"][:,[0,4]].T).T


def corrected(run,calibration):
    ti,to=tension(run);delta=((ti+to)/2-10.)*calibration["compliance_m_per_N"]+calibration["offset_m"]
    return HOME+np.linalg.solve(ARM,(.02*run["x"][:,[0,4]]-delta).T).T


class PhysicsObserver:
    """Reduced free-space dynamics, corrected two-length EKF update; contact dynamics omitted."""
    def __init__(self,calibration):
        import mujoco
        self.c=calibration;f=TwoTendonFinger();full=np.zeros((f.model.nv,f.model.nv));mujoco.mj_fullM(f.model,f.data,full)
        self.M=full[np.ix_(f.dof,f.dof)];self.K=np.eye(2)*.08;self.B=np.eye(2)*.004

    def transition(self,x,T,dt):
        q,v=x[:2],x[2:];force=ARM.T@(T-10.)-.08*(q-HOME)+gravity(q)-gravity(HOME)
        vnew=np.linalg.solve(self.M+dt*self.B+dt*dt*self.K,self.M@v+dt*force)
        return np.r_[q+dt*vnew,vnew]

    def predict(self,run):
        ti,to=tension(run);dt=float(np.median(np.diff(run["time"])));x=np.r_[HOME,[0.,0.]]
        P=np.diag([np.deg2rad(.2)**2]*2+[.05**2]*2)
        Q=np.array(self.c.get("state_process_covariance",np.diag([np.deg2rad(.01)**2]*2+[.03**2]*2)))
        H=np.column_stack((ARM,np.zeros((2,2))));R=np.array(self.c.get("length_measurement_covariance_m2",np.eye(2)*(.00015**2)));estimates=[]
        for i,T in enumerate(to):
            a=self.transition(x,T,dt);F=np.column_stack([(self.transition(x+np.eye(4)[j]*1e-5,T,dt)-a)/1e-5 for j in range(4)])
            P=F@P@F.T+Q;gain=np.linalg.solve(H@P@H.T+R,H@P).T
            measured=.02*run["x"][i,[0,4]]-((ti[i]+to[i])/2-10.)*self.c["compliance_m_per_N"]-self.c["offset_m"]
            x=a+gain@(measured-ARM@(a[:2]-HOME));I=np.eye(4)-gain@H;P=I@P@I.T+gain@R@gain.T
            estimates.append(x[:2].copy())
        return np.array(estimates)


def scores(run,estimate):return {name:score(run["y"],estimate,mask) for name,mask in run["masks"].items()}
