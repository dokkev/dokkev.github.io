"""Small controlled Phase 3 datasets in the existing TiL HDF5 schema."""
import argparse,copy,json,subprocess,sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from dataclasses import asdict
import h5py

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3 import design,base_episode,run_episode
from til.transmission import FIXTURES
from til.recorder import DatasetFile,normalize_episode_units


def episodes(part,scale,cfg):
    cases=cfg["cases"];counts=cfg["counts"][scale]
    if part in ("train","validation","test"):
        return [base_episode(case,i,part,scale,cfg) for case in cases for i in range(counts[part])]
    if part not in cfg["stress_tests"]:raise ValueError(part)
    runs=[]
    for i in range(counts["stress"]):
        ep=base_episode("C_probe" if i%2 and part!="contact" else "C_passive",i,"test",scale,cfg)
        ep.scenario_id="test_"+part;ep.episode_id=f"p3_{scale}_test_{part}_{i:03d}"
        ep.metadata["study_group"]={"preload":"unknown_preload","zero":"unknown_tendon_zero","routing":"changed_routing","passive":"changed_passive","drift":"drift_after_calibration","contact":"calibrated_contact","long_reference":"constant_mechanics_long_reference"}[part]
        if part=="preload":ep.metadata["phase3"]["preload_error"]=[.02*(-1 if i%2 else 1),-.02*(-1 if i%2 else 1)]
        if part=="zero":ep.metadata["phase3"]["zero_error"]=(.0005 if i%2 else -.0005)
        if part=="routing":ep.transmission["routing"]=asdict(FIXTURES["small_guide" if i%2 else "two_guides"])
        if part=="passive":ep.metadata["phase3"]["actual_mechanism"]["k2"]*=1.5
        if part=="drift":
            ep.transmission["specimen"].update(creep_rate_m_per_s=6e-6,conditioning_per_m=1.5)
            ep.profile.n_cycles=6 if scale=="full" else 2
        if part=="long_reference":ep.profile.n_cycles=6 if scale=="full" else 2
        if part=="contact":
            ep.obj_x,ep.k_obj=[(.055,1000),(.045,1000),(.065,1000),(.055,500),(.055,8000),(.055,50000)][i%6]
            ep.profile.amplitude=.016;ep.profile.period=2.
            ep.seed=cfg["seed"]+6000
            ep.metadata.update(condition="contact",expected_contact=True,contact_variant=i%6)
        runs.append(ep)
    return runs


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--config");ap.add_argument("--scale",choices=["pilot","full"],default="pilot")
    ap.add_argument("--part");ap.add_argument("--all",action="store_true");ap.add_argument("--workers",type=int,default=4)
    ap.add_argument("--out",required=True);ap.add_argument("--merge",nargs="+")
    ap.add_argument("--cases",nargs="+");ap.add_argument("--replace-episodes",action="store_true")
    a=ap.parse_args()
    cfg=design(a.config);Path(a.out).parent.mkdir(parents=True,exist_ok=True)
    parts=["train","validation","test",*cfg["stress_tests"]]
    if a.all:
        def job(part):
            target=Path(a.out).with_name(Path(a.out).stem+"-"+part+".h5")
            cmd=[sys.executable,__file__,"--scale",a.scale,"--part",part,"--out",str(target)]
            if a.config:cmd.extend(["--config",a.config])
            with target.with_suffix(".log").open("w",encoding="utf8") as log:subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,check=True)
            return str(target)
        paths=[]
        with ThreadPoolExecutor(max_workers=a.workers) as pool:
            futures={pool.submit(job,p):p for p in parts}
            for f in as_completed(futures):paths.append(f.result());print("completed "+futures[f],flush=True)
        subprocess.run([sys.executable,__file__,"--scale",a.scale,"--out",a.out,"--merge",*sorted(paths)],check=True)
        return
    if a.merge:
        with h5py.File(a.out,"w") as dst:
            for i,path in enumerate(a.merge):
                with h5py.File(path) as src:
                    if i==0:dst.attrs.update(dict(src.attrs));dst.require_group("episodes")
                    for name,g in src["episodes"].items():
                        if name in dst["episodes"] and a.replace_episodes:del dst["episodes"][name]
                        src.copy(g,dst["episodes"],name=name)
    else:
        if a.part not in parts:ap.error("choose --part, --all or --merge")
        ds=DatasetFile(a.out)
        try:
            runs=episodes(a.part,a.scale,cfg)
            if a.cases:runs=[r for r in runs if r.metadata["case"] in a.cases]
            for i,ep in enumerate(runs):
                print(f"{a.part}: {i+1}/{len(runs)} {ep.episode_id}",flush=True)
                w=ds.episode(ep.episode_id,ep.to_dict())
                try:run_episode(ep,w)
                except (FloatingPointError,ValueError) as e:w.close({"failed":str(e),"quality":json.dumps(dict(flags=[str(e)],eligible=False))})
        finally:ds.close()
    with h5py.File(a.out,"a") as f:
        normalize_episode_units(f);f.attrs["phase3_design"]=json.dumps(cfg)
        f.attrs["git_commit"]=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
        manifest=[dict(id=n,config=json.loads(g.attrs["config"]),quality=json.loads(g.attrs["quality"])) for n,g in f["episodes"].items()]
    Path(a.out).with_suffix(".manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    print(json.dumps(dict(sessions=len(manifest),eligible=sum(r["quality"]["eligible"] for r in manifest))))


if __name__=="__main__":main()
