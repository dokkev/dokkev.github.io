"""How calibration nuisance directions overlap joint-state sensitivity, by fixed design."""
import argparse,copy,json,sys
from concurrent.futures import ProcessPoolExecutor,as_completed
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3_study import prepared,release,observe,sensitivity,mechanism_designs,SCALES


def task(name,values,T):
    metric,normal,S=sensitivity("hold","home",mechanism_values=values,pretension=T)
    base,offset=prepared("home",values,T);Z=[]
    for kind in ("zero","preload"):
        traces=[]
        for sign in (-1,1):
            trial=copy.deepcopy(base)
            if kind=="zero":trial.finger.l0+=sign*.0002
            else:trial.finger.model.qpos_spring[trial.finger.qadr]+=sign*np.array([.01,-.01])
            traces.append(observe(release(trial),"hold",offset))
        Z.append(((traces[1][:,3:7]-traces[0][:,3:7])/2/SCALES).ravel())
    nuisance=np.column_stack(Z);projected=S-nuisance@np.linalg.lstsq(nuisance,S,rcond=None)[0]
    before=np.linalg.svd(S,compute_uv=False)/np.sqrt(len(normal));after=np.linalg.svd(projected,compute_uv=False)/np.sqrt(len(normal))
    return dict(name=name,known_setup_singular_values=before.tolist(),nuisance_projected_singular_values=after.tolist(),
        retained_minimum_fraction=float(after[-1]/max(before[-1],1e-20)),
        zero_error_bound_m=.0002,preload_error_vector_rad=[.01,-.01],
        interpretation="Local joint sensitivity projected off two linearized nuisance directions. Not a structural-identifiability proof or calibrated uncertainty bound.")


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--workers",type=int,default=4);a=ap.parse_args()
    rows=[]
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        for f in as_completed([pool.submit(task,*r) for r in mechanism_designs()]):
            r=f.result();rows.append(r);print("completed calibration sensitivity "+r["name"],flush=True)
    Path(a.out).parent.mkdir(parents=True,exist_ok=True);Path(a.out).write_text(json.dumps(rows,indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
