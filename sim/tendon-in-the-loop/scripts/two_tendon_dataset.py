"""Whole-history two-channel dataset; pilot follows the same schema as full runs."""
import argparse,json,sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import h5py
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_experiment import specification,simulate,dataset_file,episode_writer,normalize_units


def run_part(part,scale,path):
    count=({"train":16,"validation":8,"test":8}.get(part,4) if scale=="full" else 2)
    ds=dataset_file(path);manifest=[]
    try:
        for i in range(count):
            split=part if part in ("train","validation","test") else "test"
            condition="nominal" if part in ("train","validation","test") else part
            spec=specification(i,split,condition,motion=("proximal","distal","coordinated","reversal")[(i//2)%4])
            if part not in ("train","validation","test"):
                spec["scenario_id"]="test_"+part;spec["seed"]+=3000
                spec["motion"]="coordinated"
            if part=="contact":
                spec.update(contact=True,object_x=[.045,.065,.055,.055][i%4],object_stiffness=[1000.,1000.,500.,8000.][i%4])
            if part in ("drift","long_reference"):spec["cycles"]=6
            w=episode_writer(ds,spec)
            try:row,_=simulate(spec,w)
            except (FloatingPointError,ValueError) as e:
                w.close(dict(failed=str(e)));raise
            manifest.append(dict(id=spec["id"],quality=row));print(spec["id"],row["flags"],flush=True)
    finally:ds.close()
    return manifest


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);ap.add_argument("--scale",choices=["pilot","full"],default="pilot")
    ap.add_argument("--workers",type=int,default=4);ap.add_argument("--part");a=ap.parse_args()
    out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True)
    parts=(["train","validation","test"] if a.scale=="pilot" else
           ["train","validation","test","elastic","friction","ideal_stiff","stiffness","routing","pretension","zero","drift","contact","long_reference"])
    if a.part:run_part(a.part,a.scale,str(out));return
    if out.exists():raise FileExistsError("choose a fresh output path")
    paths=[];manifest=[]
    with ProcessPoolExecutor(max_workers=a.workers) as pool:
        futures={pool.submit(run_part,part,a.scale,str(out.with_name(out.stem+"-"+part+".h5"))):part for part in parts}
        for f in as_completed(futures):
            manifest+=f.result();part=futures[f];paths.append(out.with_name(out.stem+"-"+part+".h5"));print("completed "+part,flush=True)
    with h5py.File(out,"w") as dst:
        for i,path in enumerate(sorted(paths)):
            with h5py.File(path) as src:
                if i==0:dst.attrs.update(dict(src.attrs));dst.require_group("episodes")
                for name,g in src["episodes"].items():src.copy(g,dst["episodes"],name=name)
        normalize_units(dst)
    out.with_suffix(".manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    print("sessions",len(manifest))


if __name__=="__main__":main()
