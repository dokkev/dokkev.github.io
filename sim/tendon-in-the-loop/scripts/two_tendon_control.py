"""Execute independent joint motion before any neural training."""
import argparse,json,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_experiment import specification,simulate


def trial(motion,contact,controller):
    spec=specification(0);spec.update(motion=motion,contact=contact,controller=controller,amplitude=[.25,.35],period_s=3.)
    return f"{motion}_{'contact' if contact else 'free'}_{controller}",*simulate(spec)


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--workers",type=int,default=4);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);rows={};arrays={}
    tasks=[(m,c,ctl) for m in ("proximal","distal","coordinated","reversal") for c in (False,True) for ctl in ("rigid_feedforward","elastic_feedforward")]
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        for f in as_completed([pool.submit(trial,*task) for task in tasks]):
            key,row,data=f.result();rows[key]=row;arrays[key]=data;print(key,row["mae_deg"],row["flags"],flush=True)
    (out/"control.json").write_text(json.dumps(rows,indent=2)+"\n",encoding="utf8");np.savez_compressed(out/"control.npz",**arrays)


if __name__=="__main__":main()
