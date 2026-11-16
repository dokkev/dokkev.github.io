"""Execute fixed-calibration probing, ambiguity and optional mechanism sweeps."""
import argparse,json,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3_study import sensitivity,ambiguity,mechanism_designs,design_task,SCALES


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--workers",type=int,default=4)
    ap.add_argument("--mechanisms",action="store_true");a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    if a.mechanisms:
        records=[];arrays={}
        with ProcessPoolExecutor(max_workers=a.workers) as pool:
            futures=[pool.submit(design_task,*row) for row in mechanism_designs()]
            for f in as_completed(futures):
                r=f.result();name=r["name"];arrays[name+"__probe"]=r.pop("trace")
                for i,ep in enumerate(r["episodes"]):arrays[name+f"__episode{i}"]=ep.pop("data")
                records.append(r);print("completed design "+name,flush=True)
        np.savez_compressed(out/"mechanisms.npz",**arrays)
        (out/"mechanisms.json").write_text(json.dumps(sorted(records,key=lambda r:r["name"]),indent=2)+"\n",encoding="utf8")
        return
    tasks=[]
    for condition in ("home","flexed","contact"):
        for kind in ("hold","flexion","extension","low","pulse","oscillation","chirp","multisine","reversal"):
            tasks.append((kind,condition,.0005,1.2))
    for amplitude in (.00025,.001):
        for duration in (.6,1.2):tasks.append(("multisine","home",amplitude,duration))
    tasks.append(("multisine","home",.0005,.6))
    metrics=[];arrays={}
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        futures={pool.submit(sensitivity,*task):task for task in tasks}
        for f in as_completed(futures):
            task=futures[f];m,trace,S=f.result();key=f"{task[0]}_{task[1]}_{task[2]:g}_{task[3]:g}"
            m["id"]=key;metrics.append(m);arrays[key+"__trace"]=trace;arrays[key+"__sensitivity"]=S
            print("completed probe "+key,flush=True)
    search,traces=ambiguity()
    for i,trace in enumerate(traces):arrays[f"ambiguity_{i}"]=trace
    np.savez_compressed(out/"probing.npz",**arrays)
    (out/"probing.json").write_text(json.dumps(dict(probes=metrics,ambiguity=search,comparison_scales=SCALES.tolist()),indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
