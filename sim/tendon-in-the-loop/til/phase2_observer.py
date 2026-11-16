"""Strict motor-only joint-state learning and diagnostics; metadata is used only for scoring."""
import json
import numpy as np
import h5py
import torch
from .coupling import MOTOR_ONLY_CHANNELS
from .observer import motor_tension,predict


def load_runs(path,auxiliary=False,stride=5):
    runs=[]
    with h5py.File(path) as f:
        for name,g in f["episodes"].items():
            if "failed" in g.attrs:continue  # failure remains in the manifest/report
            cfg=json.loads(g.attrs["config"]);quality=json.loads(g.attrs["quality"])
            x=np.column_stack([g[k][::stride] for k in MOTOR_ONLY_CHANNELS]).astype(np.float32)
            T=g["ground_truth/output_tension_true"][::stride]
            q=g["simulation/joint_positions"][::stride]
            deformation=g["transmission/apparent_elongation"][::stride]
            y=np.column_stack((T,q)).astype(np.float32)
            if auxiliary:y=np.column_stack((y,deformation)).astype(np.float32)
            contact=g["simulation/contact_state"][::stride]>0
            velocity=x[:,1]; reversal=np.zeros(len(x),dtype=bool)
            strong=np.flatnonzero(abs(velocity)>.05)
            for left,right in zip(strong[:-1],strong[1:]):
                if velocity[left]*velocity[right]<0:reversal[max(0,right-10):right+11]=True
            runs.append(dict(id=name,split=cfg["scenario_id"],config=cfg,quality=quality,
                time=g["time"][::stride],x=x,y=y,deformation=deformation,
                contact=contact,reversal=reversal,stiffness=g["ground_truth/effective_stiffness"][::stride],
                slack=g["ground_truth/slack_state"][::stride].max(axis=1)))
    return runs


def score(truth,prediction,mask=None):
    if mask is not None:truth,prediction=truth[mask],prediction[mask]
    if not len(truth):return None
    names=[("tension","N",1.),("q1","deg",180/np.pi),("q2","deg",180/np.pi),("deformation","mm",1000.)]
    result={}
    for column,(name,unit,factor) in enumerate(names[:prediction.shape[1]]):
        error=(prediction[:,column]-truth[:,column])*factor
        result.update({f"{name}_mae_{unit}":float(abs(error).mean()),
            f"{name}_rmse_{unit}":float(np.sqrt(np.mean(error**2))),
            f"{name}_p95_{unit}":float(np.quantile(abs(error),.95)),f"{name}_max_{unit}":float(abs(error).max())})
    return result


def score_run(run,prediction):
    t=run["time"]-run["time"][0]
    return {name:score(run["y"],prediction,mask) for name,mask in
        dict(all=np.ones(len(t),bool),contact=run["contact"],free=~run["contact"],
             reversal=run["reversal"],initialization=t<.3,after_settling=t>=1.).items()}


def rigid_prediction(run):
    """Documented equal-joint coupling q1=q2 and nominal q0=0, rigid cable, nominal geometry."""
    from .finger import Finger
    import mujoco
    if not hasattr(rigid_prediction,"grid"):
        f=Finger();l0=f.l0;grid=np.linspace(0,1.6,500);length=[]
        for angle in grid:
            f.data.qpos[f.qadr]=angle;mujoco.mj_forward(f.model,f.data);length.append(f.tendon_length()-l0)
        rigid_prediction.grid=(np.array(length)[::-1],grid[::-1])
    length,angle=rigid_prediction.grid
    q=np.interp(-.02*run["x"][:,0],length,angle)
    return np.column_stack((motor_tension(run,dynamic=True),q,q))


def truncated_prediction(model,run,scaler,history):
    """Periodic memory resets every H samples; not a noncausal centered window."""
    x=(run["x"]-scaler["x_mean"])/scaler["x_std"]
    count=int(np.ceil(len(x)/history));padded=np.zeros((count*history,4),np.float32)
    padded[:len(x)]=x
    with torch.no_grad():output,_=model(torch.tensor(padded.reshape(count,history,4)))
    prediction=output.numpy().reshape(-1,output.shape[-1])[:len(x)]*scaler["y_std"]+scaler["y_mean"]
    prediction[:,0]=np.maximum(prediction[:,0],0)
    return prediction
