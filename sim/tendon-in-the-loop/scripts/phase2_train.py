"""Fixed-budget Phase 2 multi-seed GRU, capacity/data-budget and multitask comparisons."""
import argparse,copy,hashlib,json,subprocess,sys,time
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/"scripts"))
from train_observer import train
from til.observer import predict,Observer
from til.phase2_observer import load_runs,score_run,score,rigid_prediction,truncated_prediction


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True)
    ap.add_argument("--seed",type=int,default=0);ap.add_argument("--epochs",type=int,default=60)
    ap.add_argument("--variant",choices=["joint","transmission","small","large","quarter","half"],default="joint")
    ap.add_argument("--phase1-checkpoint",default="figures/observer/observer.pt")
    a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    runs=load_runs(a.dataset)
    # Explicit protocol failures are excluded from optimizer/calibration, retained in evaluation/report.
    learning=[r for r in runs if r["split"]!="train" or r["quality"]["eligible"]]
    hidden={"small":16,"large":64}.get(a.variant,32)
    if a.variant in ("quarter","half"):
        ids=[r["id"] for r in learning if r["split"]=="train"]
        keep=set(ids[::4 if a.variant=="quarter" else 2])
        learning=[r for r in learning if r["split"]!="train" or r["id"] in keep]
    if a.variant=="transmission":
        learning=copy.deepcopy(learning)
        for r in learning:r["y"]=np.column_stack((r["y"][:,0],r["deformation"])).astype(np.float32)
    start=time.perf_counter()
    model,scaler,history,epoch,n_windows=train(learning,a.seed,a.epochs,hidden=hidden)
    training_s=time.perf_counter()-start
    predictions={};per_run={};history_scores={}
    for r in runs:
        y=predict(model,r,scaler)
        predictions[r["id"]]=y
        per_run[r["id"]]=score_run(r,y[:,:1] if a.variant=="transmission" else y)
    aggregate={}
    for split in sorted({r["split"] for r in runs}):
        ids=[r["id"] for r in runs if r["split"]==split]
        aggregate[split]={}
        for regime in ("all","contact","free","reversal","initialization","after_settling"):
            rows=[per_run[i][regime] for i in ids if per_run[i][regime] is not None]
            aggregate[split][regime]={key:float(np.mean([r[key] for r in rows])) for key in rows[0]} if rows else None
    baselines={};reference={}
    if a.variant=="joint" and a.seed==0:
        mean=np.concatenate([r["y"] for r in learning if r["split"]=="train"]).mean(0)
        for r in runs:
            baselines[r["id"]]={"rigid_equal_joint":score_run(r,rigid_prediction(r)),
                "training_mean":score_run(r,np.tile(mean,(len(r["y"]),1)))}
        if Path(a.phase1_checkpoint).exists():
            old=torch.load(a.phase1_checkpoint,weights_only=True)
            old_model=Observer();old_model.load_state_dict(old["state_dict"]);old_model.eval()
            old_scaler={k:np.array(v,dtype=np.float32) for k,v in old["scaler"].items()}
            reference={r["id"]:score(r["y"][:,:1],predict(old_model,r,old_scaler)[:,:1]) for r in runs}
        for h in (1,16,64,128,512):
            rows={r["id"]:score(r["y"],truncated_prediction(model,r,scaler,h)) for r in runs if r["split"].startswith("test")}
            history_scores[str(h)]=rows
    # Stateful single-sample CPU latency, batch=1, 200 warmups then 500 measurements.
    model.eval();x=torch.zeros(1,1,4);state=None;samples=[]
    with torch.no_grad():
        for i in range(700):
            t=time.perf_counter_ns();_,state=model(x,state)
            elapsed=(time.perf_counter_ns()-t)/1000
            if i>=200:samples.append(elapsed)
    checkpoint=dict(state_dict=model.state_dict(),scaler={k:v.tolist() for k,v in scaler.items()},hidden=hidden,
        outputs=len(scaler["y_mean"]),variant=a.variant,seed=a.seed,selected_epoch=epoch)
    torch.save(checkpoint,out/"checkpoint.pt")
    np.savez_compressed(out/"predictions.npz",**predictions)
    report=dict(variant=a.variant,seed=a.seed,epochs=a.epochs,selected_epoch=epoch,hidden=hidden,
        input_channels=["motor/position","motor/velocity","motor/current","motor/applied_command"],
        targets=["T_out","deformation"] if a.variant=="transmission" else ["T_out","q1","q2"],
        normalization=checkpoint["scaler"],training_runs=[r["id"] for r in learning if r["split"]=="train"],
        training_windows=n_windows,history=history,training_seconds=training_s,
        parameters=sum(p.numel() for p in model.parameters()),checkpoint_bytes=(out/"checkpoint.pt").stat().st_size,
        cpu_latency_us=dict(median=float(np.median(samples)),p95=float(np.quantile(samples,.95)),threads=2,batch=1),
        metrics=aggregate,per_run=per_run,baselines=baselines,phase1_frozen_tension=reference,
        periodic_history_reset=history_scores,
        versions=dict(torch=torch.__version__,numpy=np.__version__,python=sys.version.split()[0]),
        dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),
        git_commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip())
    (out/"metrics.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
    print(json.dumps({"variant":a.variant,"seed":a.seed,"selected_epoch":epoch,"test":aggregate},indent=2))


if __name__=="__main__":main()
