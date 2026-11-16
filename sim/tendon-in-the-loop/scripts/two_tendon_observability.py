"""Conditional released-state sensitivities and identical-setup ambiguity search."""
import argparse,copy,json,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import numpy as np
import mujoco
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon import HOME,ARM,TwoTendonSimulator,channel_config

SCALES=np.tile([2*np.pi/16384,.002,np.sqrt(2)*.005,.001],2)


def prepare(delta=(0.,0.)):
    sim=TwoTendonSimulator([channel_config(271116,noise=False),channel_config(281116,noise=False)])
    sim.finger.data.qpos[sim.finger.qadr]+=delta;mujoco.mj_forward(sim.finger.model,sim.finger.data)
    boundary=sim.finger.tendon_displacement()
    for i,c in enumerate(sim.chains):
        c.emulator.s.x=c.emulator.s.x_cmd=c.emulator.s.x_cmd_raw=float(boundary[i])
        for _ in range(round(.2/c.cfg.timing.plant_dt)):c.plant.step(c.cfg.timing.plant_dt,0.,0.,float(boundary[i]),0.)
        for _ in range(c._tdelay.maxlen or 0):c._tdelay.append(c.plant.s.T2)
    return sim


def observe(sim,kind="hold",duration=1.2):
    rows=[]
    for _ in range(round(duration/sim.dt)):
        t=sim.t
        if kind=="hold":x=np.zeros(2);v=np.zeros(2)
        else:
            w=2*np.pi*(1. if kind=="coordinated" else 2.);a=np.sin(np.pi*t/duration)**2
            x=np.array([.0004*np.sin(w*t),.0004*np.sin(w*t+.7)])*a
            adot=np.pi/duration*np.sin(2*np.pi*t/duration)
            v=np.array([.0004*w*np.cos(w*t),.0004*w*np.cos(w*t+.7)])*a+np.array([.0004*np.sin(w*t),.0004*np.sin(w*t+.7)])*adot
        sim.step(x,v)
        if sim.k%10==0:
            rec=sim.record();obs=[rec[f"motor{i}"][key] for i in (1,2) for key in ("position","velocity","current","applied_command")]
            rows.append([sim.t,*sim.finger.q,*obs])
    return np.array(rows)


def sensitivity(kind):
    columns=[];epsilon=.002;fingerprints=[]
    for j in range(2):
        delta=np.eye(2)[j]*epsilon;left=prepare(delta);right=prepare(-delta)
        for sim in (left,right):fingerprints.append([sim.finger.l0.tolist(),sim.finger.spring_ref.tolist()])
        a=observe(left,kind);b=observe(right,kind)
        columns.append(((a[:,3:11]-b[:,3:11])/(2*epsilon)/SCALES).ravel()*np.pi/180)
    assert all(v==fingerprints[0] for v in fingerprints)
    S=np.column_stack(columns);sv=np.linalg.svd(S,compute_uv=False);normal=observe(prepare(),kind)
    return dict(protocol=kind,epsilon_rad=epsilon,rms_singular_values_per_degree=(sv/np.sqrt(len(normal))).tolist(),
        singular_values_per_degree=sv.tolist(),condition_number=float(sv[0]/sv[1]),column_correlation=float(np.corrcoef(S.T)[0,1]),
        setup=fingerprints[0]),normal,S


def search_pairs(traces):
    pairs=[]
    for horizon in (.005,.01,.025,.05,.1,.25,.6):
        for i,left in enumerate(traces):
            for j,right in enumerate(traces[i+1:],i+1):
                mask=left[:,0]<=horizon+1e-10
                distance=float(np.sqrt(np.mean(((left[mask,3:11]-right[mask,3:11])/SCALES)**2)))
                gap=float(np.sqrt(np.mean(np.degrees(left[mask,1:3]-right[mask,1:3])**2)))
                pairs.append(dict(a=i,b=j,horizon_s=horizon,motor_normalized_rms=distance,joint_rms_gap_deg=gap,qualifies=distance<=1 and gap>=3))
    return pairs


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--workers",type=int,default=3);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);rows=[];arrays={}
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        for f in as_completed([pool.submit(sensitivity,k) for k in ("hold","coordinated","oscillation")]):
            row,normal,S=f.result();rows.append(row);arrays[row["protocol"]]=normal;arrays[row["protocol"]+"_S"]=S
    traces=[];initials=[]
    for q1 in (-.04,0.,.04):
        for q2 in (-.04,0.,.04):
            initial=HOME+np.array([q1,q2]);initials.append(initial.tolist());traces.append(observe(prepare([q1,q2]),duration=.6))
    pairs=search_pairs(traces)
    for i,d in enumerate(traces):arrays[f"search{i}"]=d
    # Exact zero-deformation algebra is evaluated on a joint grid, distinct from a dynamic stiff cable.
    q=np.array([[a,b] for a in np.linspace(-np.pi/6,np.pi/3,20) for b in np.linspace(0,5*np.pi/6,20)])
    reconstructed=HOME+np.linalg.solve(ARM,((q-HOME)@ARM.T).T).T
    report=dict(sensitivities=rows,comparison_scales=SCALES.tolist(),ambiguity=dict(initial_states_rad=initials,pairs=pairs,
        criteria=dict(maximum_motor_rms=1.,minimum_joint_rms_gap_deg=3.),found=sum(v["qualifies"] for v in pairs),
        angular_candidates=sum(v["joint_rms_gap_deg"]>=3 for v in pairs)),
        ideal_inextensible_max_error_rad=float(np.max(abs(q-reconstructed))),
        scope="Quiet prepared/released state family, fixed known calibration. Cable deformation is prepared consistently with each state; no global observability or sensor uncertainty proof.")
    (out/"observability.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8");np.savez_compressed(out/"observability.npz",**arrays)


if __name__=="__main__":main()
