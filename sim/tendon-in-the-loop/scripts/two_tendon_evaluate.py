"""Train-only calibration or frozen evaluation are separate CLI actions."""
import argparse,hashlib,json,sys,time
from pathlib import Path
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_observer import load_runs,fit_compliance,rigid,corrected,PhysicsObserver,TwoMotorObserver,predict,scores


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True)
    ap.add_argument("--calibrate",action="store_true");ap.add_argument("--fixed-physics-noise",action="store_true")
    ap.add_argument("--calibration");ap.add_argument("--models");a=ap.parse_args()
    out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True)
    if a.calibrate:
        c=fit_compliance(load_runs(a.dataset,{"train"}))
        if a.fixed_physics_noise:
            for key in ("state_process_covariance","length_measurement_covariance_m2","noise_calibration"):c.pop(key)
        out.write_text(json.dumps(c,indent=2)+"\n",encoding="utf8");return
    if not a.calibration or not a.models:ap.error("evaluation requires saved calibration and models")
    out.mkdir(parents=True,exist_ok=True);torch.set_num_threads(2);c=json.loads(Path(a.calibration).read_text())
    runs=[r for r in load_runs(a.dataset) if r["split"].startswith("test")];metrics={};runtime={}
    for name,method in (("rigid",rigid),("compliance",lambda r:corrected(r,c)),("physics",lambda r:PhysicsObserver(c).predict(r))):
        estimates={r["id"]:method(r) for r in runs};metrics[name]={r["id"]:scores(r,estimates[r["id"]]) for r in runs}
        np.savez_compressed(out/f"{name}.npz",**estimates);print(name,flush=True)
    for seed in (0,1,2):
        path=Path(a.models)/f"seed{seed}/checkpoint.pt";cp=torch.load(path,weights_only=True)
        model=TwoMotorObserver();model.load_state_dict(cp["state_dict"]);scaler={k:np.array(v,np.float32) for k,v in cp["scaler"].items()}
        estimates={r["id"]:predict(model,r,scaler) for r in runs};name=f"gru-seed{seed}"
        metrics[name]={r["id"]:scores(r,estimates[r["id"]]) for r in runs};np.savez_compressed(out/f"{name}.npz",**estimates)
        timings=[];hidden=None
        with torch.no_grad():
            for i in range(500):
                start=time.perf_counter_ns();_,hidden=model(torch.zeros(1,1,8),hidden)
                if i>=100:timings.append((time.perf_counter_ns()-start)/1000)
        runtime[name]=dict(median_us=float(np.median(timings)),p95_us=float(np.quantile(timings,.95)),
            checkpoint_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),parameters=sum(p.numel() for p in model.parameters()))
    (out/"evaluation.json").write_text(json.dumps(dict(metrics=metrics,runtime=runtime,calibration=c,
        dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),test_ids=[r["id"] for r in runs],
        scope="Frozen eight-motor-channel inference; true joints and contact used for scoring only."),indent=2,allow_nan=False)+"\n",encoding="utf8")


if __name__=="__main__":main()
