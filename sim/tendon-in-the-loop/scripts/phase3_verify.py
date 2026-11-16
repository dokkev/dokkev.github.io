"""Phase 3 repeatability and separated free/contact integration checks."""
import argparse,copy,json,sys
from concurrent.futures import ProcessPoolExecutor,as_completed
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3 import base_episode,run_episode


def trial(condition,outer,plant):
    ep=base_episode("C_passive",0 if condition=="free" else 1,"test")
    ep.profile.n_cycles=1;ep.sim_overrides["timing"]=dict(plant_dt=plant)
    # run_episode(dt) fixes plant at 25 us, otherwise use nominal outer 0.5 ms.
    if outer!=.0005 or plant==.000025:q,trace=run_episode(ep,dt=outer,quiet=True)
    else:q,trace=run_episode(ep,quiet=True)
    return condition,outer,plant,q,trace


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--workers",type=int,default=4);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    tasks=[(condition,dt,.000025) for condition in ("free","contact") for dt in (.001,.0005,.00025,.000125)]
    tasks +=[(c,.0005,p) for c in ("free","contact") for p in (.0001,.00005)]
    rows=[];arrays={}
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        for f in as_completed([pool.submit(trial,*x) for x in tasks]):
            c,dt,p,q,data=f.result();key=f"{c}_{dt:g}_{p:g}";arrays[key]=data
            rows.append(dict(id=key,condition=c,outer_dt_s=dt,plant_dt_s=p,quality=q))
            print("completed "+key,flush=True)
    for row in rows:
        reference=arrays[f"{row['condition']}_0.000125_2.5e-05"];data=arrays[row["id"]]
        mask=data[:,0]<=reference[-1,0]+1e-9;data=data[mask]
        qref=np.column_stack([np.interp(data[:,0],reference[:,0],reference[:,i]) for i in (1,2)])
        e=(data[:,1:3]-qref)*180/np.pi
        Tref=np.interp(data[:,0],reference[:,0],reference[:,7]);Fref=np.interp(data[:,0],reference[:,0],reference[:,9])
        row.update(q_rmse_deg=np.sqrt(np.mean(e**2,axis=0)).tolist(),tension_rmse_N=float(np.sqrt(np.mean((data[:,7]-Tref)**2))),
            contact_force_rmse_N=float(np.sqrt(np.mean((data[:,9]-Fref)**2))),energy_residual_J=float(data[-1,11]))
    np.savez_compressed(out/"numerics.npz",**arrays)
    report=dict(comparisons=rows,scope="Outer sweep fixes plant/controller 25 us. Additional 100/50 us plant/controller cases fix outer step 0.5 ms. Quiet sensors; transmission energy boundary only.")
    (out/"numerics.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
