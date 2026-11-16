"""Train joint-only 32-unit GRUs; this entry point does not read test trajectories."""
import argparse,copy,hashlib,json,subprocess,sys,time
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import DataLoader,TensorDataset

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.observer import Observer,fit_scaler,windows
from til.phase3 import design
from til.phase3_observer import load_runs,prediction,fit_physics


def select(runs,case):
    if case!="pooled":return [r for r in runs if r["config"]["metadata"]["case"]==case]
    selected=[]
    for split in ("train","validation"):
        groups=[[r for r in runs if r["split"]==split and r["config"]["metadata"]["case"]==c] for c in design()["cases"]]
        budget=min(map(len,groups));indices=[0]*len(groups)
        while sum(r["split"]==split for r in selected)<budget:
            for i,group in enumerate(groups):
                if sum(r["split"]==split for r in selected)>=budget:break
                index=(i+3*indices[i])%len(group);indices[i]+=1
                candidate=group[index]
                if candidate not in selected:selected.append(candidate)
    return selected


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True)
    ap.add_argument("--case",choices=["A","B","C_passive","C_probe","pooled"],default="C_passive")
    ap.add_argument("--seed",type=int,default=0);ap.add_argument("--epochs",type=int,default=60);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    torch.manual_seed(a.seed);np.random.seed(a.seed);torch.set_num_threads(2);torch.use_deterministic_algorithms(True)
    available=load_runs(a.dataset,splits={"train","validation"})
    selected=select(available,a.case)
    selected=[r for r in selected if r["split"]!="train" or r["quality"]["eligible"]]
    scaler=fit_scaler(selected);x,y=windows(selected,scaler)
    model=Observer(hidden=32,outputs=2);optimizer=torch.optim.Adam(model.parameters(),lr=.003)
    loader=DataLoader(TensorDataset(x,y),batch_size=32,shuffle=True,generator=torch.Generator().manual_seed(a.seed))
    validation=[r for r in selected if r["split"]=="validation"]
    if not validation:raise ValueError("validation required")
    best=float("inf");state=None;epoch_selected=0;history=[];start=time.perf_counter()
    for epoch in range(a.epochs):
        model.train();losses=[]
        for xb,yb in loader:
            estimate,_=model(xb);loss=((estimate[:,32:]-yb[:,32:])**2).mean()
            optimizer.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.);optimizer.step();losses.append(loss.item())
        val=float(np.mean([np.mean(((prediction(model,r,scaler)[r["masks"]["post_probe"]]-r["y"][r["masks"]["post_probe"]])/scaler["y_std"])**2) for r in validation]))
        history.append(dict(epoch=epoch+1,training_loss=float(np.mean(losses)),validation_loss=val))
        if val<best:best=val;epoch_selected=epoch+1;state=copy.deepcopy(model.state_dict())
        if epoch%10==0 or epoch==a.epochs-1:print(f"{a.case} seed {a.seed} epoch {epoch+1}: train={np.mean(losses):.5f} validation={val:.5f}",flush=True)
    model.load_state_dict(state)
    checkpoint=dict(state_dict=state,scaler={k:v.tolist() for k,v in scaler.items()},hidden=32,outputs=2,
        targets=["q1","q2"],case=a.case,seed=a.seed,selected_epoch=epoch_selected)
    torch.save(checkpoint,out/"checkpoint.pt")
    report={k:v for k,v in checkpoint.items() if k!="state_dict"}
    report.update(training_runs=[r["id"] for r in selected if r["split"]=="train"],
        validation_runs=[r["id"] for r in validation],training_windows=len(x),epochs=a.epochs,history=history,
        selection="Post-prefix normalized joint MSE, equal weight per validation run",training_seconds=time.perf_counter()-start,
        input_channels=["motor/position","motor/velocity","motor/current","motor/applied_command"],
        parameters=sum(p.numel() for p in model.parameters()),dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),
        versions=dict(torch=torch.__version__,numpy=np.__version__,python=sys.version.split()[0]),
        git_commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip())
    (out/"training.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
    print(f"selected epoch {epoch_selected}; test data was not read")


if __name__=="__main__":main()
