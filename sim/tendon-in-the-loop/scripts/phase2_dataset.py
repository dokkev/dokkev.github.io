"""Generate or merge Phase 2 split files. Failed/flagged runs are retained."""
import argparse,json,subprocess,sys
from pathlib import Path
import h5py
from concurrent.futures import ThreadPoolExecutor,as_completed

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase2_data import design,make_episodes,diagnose
from til.runner import run_experiment


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--config");ap.add_argument("--scale",choices=["pilot","full"],default="pilot")
    ap.add_argument("--split");ap.add_argument("--out",required=True);ap.add_argument("--merge",nargs="+")
    ap.add_argument("--all",action="store_true");ap.add_argument("--workers",type=int,default=4)
    a=ap.parse_args();cfg=design(a.config);Path(a.out).parent.mkdir(parents=True,exist_ok=True)
    if a.all:
        paths=[]
        def generate(split):
            path=Path(a.out).with_name(Path(a.out).stem+"-"+split+".h5")
            command=[sys.executable,__file__,"--scale",a.scale,"--split",split,"--out",str(path)]
            if a.config:command.extend(["--config",a.config])
            with path.with_suffix(".log").open("w",encoding="utf8") as log:
                subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
            return str(path)
        with ThreadPoolExecutor(max_workers=a.workers) as pool:
            tasks={pool.submit(generate,split):split for split in cfg["counts"][a.scale]}
            for future in as_completed(tasks):
                paths.append(future.result());print("completed "+tasks[future],flush=True)
        command=[sys.executable,__file__,"--scale",a.scale,"--out",a.out,"--merge",*sorted(paths)]
        if a.config:command.extend(["--config",a.config])
        subprocess.run(command,check=True)
        return
    if a.merge:
        with h5py.File(a.out,"w") as dst:
            for n,path in enumerate(a.merge):
                with h5py.File(path) as src:
                    if n==0:dst.attrs.update(dict(src.attrs));dst.require_group("episodes")
                    for name,g in src["episodes"].items():src.copy(g,dst["episodes"],name=name)
    else:
        if a.split not in cfg["counts"][a.scale]:ap.error("choose a configured --split")
        runs=make_episodes(a.split,a.scale,cfg)
        # Each split is an independent numerical replica series. Within it, carry actual aging.
        from til.recorder import DatasetFile
        from til.runner import run_episode,SimulationFailure
        ds=DatasetFile(a.out);histories={};manifest=[]
        try:
            for i,ep in enumerate(runs):
                sid=ep.cable_specimen_id
                if sid in histories:ep.transmission["initial_history"]=histories[sid]
                writer=ds.episode(ep.episode_id,ep.to_dict())
                print(f"{a.split} {i+1}/{len(runs)} {ep.episode_id}",flush=True)
                try:run_episode(ep,writer)
                except (SimulationFailure,FloatingPointError) as e:writer.close({"failed":str(e)})
                ds.f.flush();g=writer.g
                quality=diagnose(g,cfg);g.attrs["quality"]=json.dumps(quality)
                if "failed" not in g.attrs:
                    histories[sid]={"creep":float(g["ground_truth/creep_state"][-1]),
                        "settle":float(g["ground_truth/settle_state"][-1]),"d":float(g["ground_truth/degradation_state"][-1]),
                        "sliding_distance":float(g["ground_truth/sliding_distance"][-1])}
                manifest.append(dict(id=ep.episode_id,config=ep.to_dict(),quality=quality))
        finally:ds.close()
    with h5py.File(a.out,"a") as f:
        from til.recorder import normalize_episode_units
        normalize_episode_units(f)
        f.attrs["phase2_design"]=json.dumps(cfg);f.attrs["scale"]=a.scale
        try:f.attrs["git_commit"]=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
        except Exception:f.attrs["git_commit"]="unavailable"
        manifest=[dict(id=name,config=json.loads(g.attrs["config"]),quality=json.loads(g.attrs["quality"])) for name,g in f["episodes"].items()]
    Path(a.out).with_suffix(".manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    print(json.dumps(dict(runs=len(manifest),eligible=sum(r["quality"]["eligible"] for r in manifest)),indent=2))


if __name__=="__main__":main()
