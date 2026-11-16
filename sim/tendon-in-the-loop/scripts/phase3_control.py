"""Optional reachable-set posture demonstration; no joint encoders enter neural feedback."""
import argparse,copy,json,sys
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3 import base_episode,CalibratedSimulator
from til.observer import Observer


def simulator(seed=9001,quiet=False):
    ep=base_episode("C_passive",0,"test");ep.seed=seed;cfg=ep.sim_config()
    if quiet:
        cfg.sensors.tension_noise=0.;cfg.motor.current_noise=cfg.motor.current_colored_noise=cfg.motor.velocity_noise=0.
    sim=CalibratedSimulator(cfg);sim.initialize(ep);return sim


def reachable_bank():
    entries=[]
    for x in (0.,.002,.004,.005,.008):
        sim=simulator(quiet=True);angles=[]
        for _ in range(round(3./sim.mj_dt)):
            t=sim.t;ramp=.5*(1-np.cos(np.pi*min(1.,t/.5)))
            velocity=x*.5*np.pi/.5*np.sin(np.pi*t/.5) if t<.5 else 0.
            sim.step(x*ramp/.02,velocity/.02)
            if sim.t>2.7:angles.append(sim.finger.q)
        entries.append(dict(motor_reference_m=x,reachable_q_rad=np.mean(angles,axis=0).tolist()))
    return entries


def feedback_correction(desired,estimate,tangent):
    return float(np.clip(.3*(tangent@(desired-estimate))/(tangent@tangent),-.0015,.0015))


def run(mode,checkpoint,bank):
    model=Observer(outputs=2);model.load_state_dict(checkpoint["state_dict"]);model.eval()
    scaler={k:np.array(v,np.float32) for k,v in checkpoint["scaler"].items()}
    sim=simulator();state=None;xcommand=0.;previous=0.;velocity=0.;rows=[]
    target_x=[.002,.005,.008,.004];lookup={e["motor_reference_m"]:np.array(e["reachable_q_rad"]) for e in bank}
    tangent=(lookup[.008]-lookup[.002])/.006
    for _ in range(round(13.2/sim.mj_dt)):
        sim.step(xcommand/.02,velocity/.02)
        if sim.log_due:
            rec=sim.record()
            if sim.k%10:continue  # 200 Hz sensor interface / control update
            obs=np.array([rec["motor"][k] for k in ("position","velocity","current","applied_command")],np.float32)
            with torch.no_grad():
                y,state=model(torch.tensor((obs-scaler["x_mean"])/scaler["x_std"])[None,None],state)
            estimate=y[0,0].numpy()*scaler["y_std"]+scaler["y_mean"]
            index=max(0,min(3,int((sim.t-1.2)/3.)))
            desired=lookup[0.] if sim.t<1.2 else lookup[target_x[index]]
            base=0. if sim.t<1.2 else target_x[index]
            correction=0.
            if sim.t>=1.2 and mode=="neural":correction=feedback_correction(desired,estimate,tangent)
            if sim.t>=1.2 and mode=="oracle":correction=feedback_correction(desired,sim.finger.q,tangent)
            target=float(np.clip(base+correction,0.,.012))
            delta=float(np.clip((target-xcommand)*.005/.12,-.02*.005,.02*.005))
            previous=xcommand;xcommand+=delta;velocity=delta/.005
            rows.append([sim.t,*sim.finger.q,*estimate,*desired,xcommand,rec["motor"]["current"],sim.plant.s.T2])
    data=np.array(rows);mask=data[:,0]>=1.2
    elapsed=(data[:,0]-1.2)%3;settled=mask&(elapsed>=1.)
    error=(data[:,1:3]-data[:,5:7])*180/np.pi
    return dict(mode=mode,MAE_deg=np.mean(abs(error[mask]),axis=0).tolist(),
        settled_MAE_deg=np.mean(abs(error[settled]),axis=0).tolist(),
        max_error_deg=np.max(abs(error[mask]),axis=0).tolist(),
        peak_tension_N=float(data[:,9].max()),current_rms_A=float(np.sqrt(np.mean(data[:,8]**2)))),data


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--checkpoint",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);torch.set_num_threads(2)
    cp=torch.load(a.checkpoint,weights_only=True);bank=reachable_bank();metrics=[];arrays={}
    for mode in ("open_loop","neural","oracle"):
        row,data=run(mode,cp,bank);metrics.append(row);arrays[mode]=data;print("completed "+mode,flush=True)
    np.savez_compressed(out/"control.npz",**arrays)
    report=dict(bank=bank,metrics=metrics,seed=9001,observer_seed=cp["seed"],warmup_s=1.2,
        feedback_update_Hz=200,scope="One-input reachable free-space postures, not arbitrary independent two-joint targets. Feedforward map comes from offline synthetic joint-reference calibration shared by all controllers.",
        inference="Neural feedback reads four motor channels only. True joints are used by the oracle and offline scoring only.")
    (out/"control.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
