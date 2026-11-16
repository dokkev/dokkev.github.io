"""Frozen-checkpoint evaluation and train-only reduced-model calibration."""
import argparse,hashlib,json,sys,time
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.observer import Observer,predict as phase2_prediction
from til.phase3_observer import load_runs,prediction,score_run,fit_physics,PhysicsObserver,kinematic


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--experiments",required=True)
    ap.add_argument("--out",required=True);ap.add_argument("--phase2",default="figures/phase2/full")
    ap.add_argument("--calibration",required=True);ap.add_argument("--only",nargs="+")
    ap.add_argument("--skip-baselines",action="store_true");ap.add_argument("--baseline-only",action="store_true")
    a=ap.parse_args();torch.set_num_threads(2)
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);runs=load_runs(a.dataset)
    tests=[r for r in runs if r["split"].startswith("test")]
    calibration=json.loads(Path(a.calibration).read_text(encoding="utf8"))
    (out/"physics-calibration.json").write_text(json.dumps(calibration,indent=2)+"\n",encoding="utf8")
    metrics={};all_predictions={}
    for path in sorted(Path(a.experiments).glob("*/checkpoint.pt")):
        name=path.parent.name
        if a.baseline_only:continue
        if a.only and name not in a.only:continue
        cp=torch.load(path,weights_only=True);model=Observer(hidden=cp["hidden"],outputs=cp["outputs"]);model.load_state_dict(cp["state_dict"])
        scaler={k:np.array(v,dtype=np.float32) for k,v in cp["scaler"].items()}
        estimates={r["id"]:prediction(model,r,scaler) for r in tests}
        metrics[name]={r["id"]:score_run(r,estimates[r["id"]]) for r in tests}
        np.savez_compressed(out/f"{name}-predictions.npz",**estimates)
        x=torch.zeros(1,1,4);hidden=None;times=[]
        with torch.no_grad():
            for i in range(500):
                start=time.perf_counter_ns();_,hidden=model(x,hidden)
                if i>=100:times.append((time.perf_counter_ns()-start)/1000)
        (out/f"{name}-runtime.json").write_text(json.dumps(dict(parameters=sum(p.numel() for p in model.parameters()),
            median_us=float(np.median(times)),p95_us=float(np.quantile(times,.95)),parameter_bytes=sum(p.numel()*p.element_size() for p in model.parameters()),
            checkpoint_sha256=hashlib.sha256(path.read_bytes()).hexdigest()),indent=2)+"\n",encoding="utf8")
        print("evaluated "+name,flush=True)
    # Nominal calibrated model, no privileged per-episode mechanism or contact configuration.
    for name,method in ([] if a.skip_baselines else [("kinematic",lambda r:kinematic(r)),("physics_ekf",lambda r:PhysicsObserver(calibration).predict(r))]):
        estimates={}
        for i,r in enumerate(tests):
            estimates[r["id"]]=method(r)
            if i%16==0:print(f"{name}: {i+1}/{len(tests)}",flush=True)
        metrics[name]={r["id"]:score_run(r,estimates[r["id"]]) for r in tests}
        np.savez_compressed(out/f"{name}-predictions.npz",**estimates)
    for seed in (0,1,2):
        if a.skip_baselines:continue
        path=Path(a.phase2)/f"joint-seed{seed}/checkpoint.pt"
        if not path.exists():continue
        cp=torch.load(path,weights_only=True);model=Observer(hidden=cp["hidden"],outputs=cp["outputs"]);model.load_state_dict(cp["state_dict"])
        scaler={k:np.array(v,dtype=np.float32) for k,v in cp["scaler"].items()};name=f"phase2-frozen-seed{seed}"
        estimates={r["id"]:phase2_prediction(model,r,scaler)[:,1:3] for r in tests}
        metrics[name]={r["id"]:score_run(r,estimates[r["id"]]) for r in tests}
    report=dict(metrics=metrics,physics_calibration=calibration,test_ids=[r["id"] for r in tests],
        dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),
        note="No checkpoint refitting. Physics compliance uses C_passive training references only.")
    (out/"evaluation.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")


if __name__=="__main__":main()
