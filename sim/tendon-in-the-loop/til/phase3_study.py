"""Fixed-setup released-state sensitivity and one-factor mechanism experiments."""
import copy,json
import numpy as np
import mujoco
from .phase3 import base_episode,CalibratedSimulator,probe,geometry,design,run_episode

SCALES=np.array([2*np.pi/16384,.002,np.sqrt(2)*.005,.001])


def advance(sim,reference,velocity=0.):
    sim.step(reference/.02,velocity/.02)
    return sim.record() if sim.log_due else None


def prepared(condition="home",mechanism_values=None,pretension=10.):
    ep=base_episode("C_passive",0,"test")
    ep.obj_x=.055 if condition=="contact" else .2
    if mechanism_values:
        ep.metadata["phase3"]["nominal_mechanism"]=copy.deepcopy(mechanism_values)
        ep.metadata["phase3"]["actual_mechanism"]=copy.deepcopy(mechanism_values)
    ep.pretension=pretension;ep.transmission["pretension"]=pretension;ep.metadata["phase3"]["nominal_pretension"]=pretension
    cfg=ep.sim_config();cfg.sensors.tension_noise=0.;cfg.sensors.tension_jitter=0.
    cfg.motor.current_noise=cfg.motor.current_colored_noise=cfg.motor.velocity_noise=0.;cfg.motor.encoder_cpr=0
    cfg.motor_sensor.dropout_probability=cfg.motor_sensor.bias_drift_A_per_sqrt_s=0.
    sim=CalibratedSimulator(cfg);sim.initialize(ep)
    offset=0.
    if condition!="home":
        offset=.012 if condition=="contact" else .006
        for _ in range(round(1.6/sim.mj_dt)):
            t=sim.t;reference=offset*.5*(1-np.cos(np.pi*min(t/1.2,1.)))
            velocity=offset*.5*np.pi/1.2*np.sin(np.pi*t/1.2) if t<1.2 else 0.
            advance(sim,reference,velocity)
    return sim,offset


def release(base,delta=(0.,0.)):
    sim=copy.deepcopy(base);f=sim.finger
    f.data.qpos[f.qadr]+=np.array(delta);f.data.qvel[f.dof]=0.
    f.data.qvel[f.obj_dof]=0.;mujoco.mj_forward(f.model,f.data)
    xout=f.tendon_displacement();xin=sim.motor.x_in
    sim.motor.s.omega=0.;sim.emulator.s.x=sim.emulator.s.x_cmd=sim.emulator.s.x_cmd_raw=xout;sim.emulator.s.v=0.
    for _ in range(sim.emulator._buf.maxlen or 0):sim.emulator._buf.append(xout)
    # Known fixed fixture, but physically compatible cable strain/memory for the released q family.
    for _ in range(round(.2/sim.cfg.timing.plant_dt)):sim.plant.step(sim.cfg.timing.plant_dt,xin,0,xout,0)
    sim.motor_sensor.reset()
    for _ in range(sim._tdelay.maxlen or 0):sim._tdelay.append(sim.plant.s.T2)
    return sim


def observe(sim,kind,offset,amplitude=.0005,duration=1.2):
    start=sim.t;rows=[]
    for _ in range(round(duration/sim.mj_dt)):
        t=sim.t-start;x=offset+probe(t,kind,amplitude,duration)
        v=(probe(t+1e-4,kind,amplitude,duration)-probe(t-1e-4,kind,amplitude,duration))/2e-4
        rec=advance(sim,x,v)
        if rec and sim.k%round(.005/sim.mj_dt)==0:
            o=rec["motor"];rows.append([sim.t-start,*sim.finger.q,o["position"],o["velocity"],o["current"],o["applied_command"],
                sim.plant.s.T2,rec["simulation"]["contact_state"],x,rec["emulator"]["tracking_error"]])
    return np.array(rows)


def sensitivity(kind="hold",condition="home",amplitude=.0005,duration=1.2,mechanism_values=None,pretension=10.):
    base,offset=prepared(condition,mechanism_values,pretension)
    epsilon=.002;columns=[]
    normal=observe(release(base),kind,offset,amplitude,duration)
    fingerprints=[]
    for j in range(2):
        plus=np.zeros(2);plus[j]=epsilon
        left,right=release(base,plus),release(base,-plus)
        for sim in (left,right):fingerprints.append((sim.finger.l0,sim.finger.model.qpos_spring[sim.finger.qadr].tolist()))
        a=observe(left,kind,offset,amplitude,duration);b=observe(right,kind,offset,amplitude,duration)
        columns.append(((a[:,3:7]-b[:,3:7])/(2*epsilon)/SCALES).ravel()*np.pi/180)
    S=np.column_stack(columns);sv=np.linalg.svd(S,compute_uv=False)
    assert all(x==fingerprints[0] for x in fingerprints)
    cfg=design();baseline_current=pretension*.02/.1
    metrics=dict(kind=kind,condition=condition,duration_s=duration,amplitude_bound_mm=amplitude*1000,
        achieved_command_peak_mm=float(np.max(abs(normal[:,9]-offset))*1000),
        achieved_motor_travel_mm=float(np.ptp(normal[:,3])*.02*1000),
        current_rms_A=float(np.sqrt(np.mean(normal[:,5]**2))),
        incremental_current_rms_A=float(np.sqrt(np.mean((normal[:,5]-baseline_current)**2))),
        peak_tension_N=float(normal[:,7].max()),saturation_fraction=float(np.mean(abs(normal[:,6])>=8-1e-5)),
        contact_changes=int(np.count_nonzero(np.diff(normal[:,8]))),
        singular_values_per_degree=sv.tolist(),rms_singular_values_per_degree=(sv/np.sqrt(len(normal))).tolist(),
        condition_number=float(sv[0]/max(sv[-1],1e-20)),column_correlation=float(np.corrcoef(S.T)[0,1]),
        joint_range_deg=(np.ptp(normal[:,1:3],axis=0)*180/np.pi).tolist(),
        initial_q_rad=normal[0,1:3].tolist(),fingerprint=dict(tendon_zero_m=fingerprints[0][0],spring_reference_rad=fingerprints[0][1]),
        definition="Central released-state-family derivative, epsilon 0.002 rad, sensor-scaled per degree. Cable strain/memory prepared consistently; not full-system/global observability.")
    return metrics,normal,S


def ambiguity():
    base,offset=prepared("home");home=np.array(design()["home_q_rad"]);length=geometry(home)[0]
    trajectories=[];initials=[]
    for delta1 in np.linspace(-.08,.08,7):
        q1=home[0]+delta1;lo,hi=.005,.5
        for _ in range(50):
            mid=(lo+hi)/2
            if geometry([q1,mid])[0]>length:lo=mid
            else:hi=mid
        initial=np.array([q1,(lo+hi)/2]);initials.append(initial)
        trajectories.append(observe(release(base,initial-home),"hold",offset,duration=1.2))
    pairs=[]
    for horizon in (.1,.25,.5,1.2):
        for i,a in enumerate(trajectories):
            for j,b in enumerate(trajectories[i+1:],i+1):
                mask=a[:,0]<=horizon
                dist=float(np.sqrt(np.mean(((a[mask,3:7]-b[mask,3:7])/SCALES)**2)))
                gap=float(np.sqrt(np.mean(((a[mask,1:3]-b[mask,1:3])*180/np.pi)**2)))
                pairs.append(dict(a=i,b=j,horizon_s=horizon,motor_normalized_rms=dist,joint_rms_gap_deg=gap,
                    ambiguous_by_study_criterion=dist<=1 and gap>=5.))
    eligible=[p for p in pairs if p["joint_rms_gap_deg"]>=5]
    best=min(eligible,key=lambda p:p["motor_normalized_rms"]) if eligible else min(pairs,key=lambda p:p["motor_normalized_rms"])
    return dict(pairs=pairs,best=best,initial_states_rad=[q.tolist() for q in initials],
        setup=dict(zero_m=base.finger.l0,preload_rad=base.finger.model.qpos_spring[base.finger.qadr].tolist()),
        criteria=dict(maximum_motor_rms_in_comparison_scales=1.,minimum_joint_rms_gap_deg=5.),
        interpretation="Identical fixed mechanism/preload/zero/environment. Equal-length initial states released from a jig; absence of a matching pair does not establish global observability."),trajectories


def mechanism_designs():
    nominal=design()["mechanism"];rows=[("nominal",nominal,10.)]
    for field,values in (("k1",(.04,.16)),("k2",(.04,.16)),("damping",(.002,.008)),
            ("distal_inertia_ratio",(.5,2.)),("h2",(.006,.010))):
        for value in values:
            m=copy.deepcopy(nominal);m[field]=value;rows.append((f"{field}_{value:g}",m,10.))
    for T in (6.,14.):rows.append((f"pretension_{T:g}",copy.deepcopy(nominal),T))
    return rows


def design_task(name,values,pretension):
    metrics,trace,S=sensitivity("multisine","home",mechanism_values=values,pretension=pretension)
    episodes=[]
    for index in (0,1):
        ep=base_episode("C_probe",index,"test");ep.episode_id=f"p3_design_{name}_{index}"
        ep.metadata["phase3"]["nominal_mechanism"]=copy.deepcopy(values);ep.metadata["phase3"]["actual_mechanism"]=copy.deepcopy(values)
        ep.pretension=pretension;ep.transmission["pretension"]=pretension;ep.metadata["phase3"]["nominal_pretension"]=pretension
        quality,data=run_episode(ep)
        centered=data[:,1:3]-data[:,1:3].mean(0)
        eig=np.linalg.svd(centered,compute_uv=False)
        episodes.append(dict(config=ep.to_dict(),quality=quality,trajectory_manifold_ratio=float(eig[1]/max(eig[0],1e-20)),data=data))
    return dict(name=name,mechanism=values,pretension_N=pretension,sensitivity=metrics,episodes=episodes,trace=trace)
