"""Small 8-input/2-output GRU; only training and validation groups are opened."""
import argparse,copy,hashlib,json,sys,time
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import DataLoader,TensorDataset
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_observer import TwoMotorObserver,load_runs,predict
from til.observer import fit_scaler,windows


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True)
    ap.add_argument("--seed",type=int,default=0);ap.add_argument("--epochs",type=int,default=60);a=ap.parse_args()
    torch.set_num_threads(2);torch.manual_seed(a.seed);np.random.seed(a.seed);torch.use_deterministic_algorithms(True)
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);runs=load_runs(a.dataset,{"train","validation"})
    scaler=fit_scaler(runs);x,y=windows(runs,scaler);model=TwoMotorObserver();optimizer=torch.optim.Adam(model.parameters(),lr=.003)
    loader=DataLoader(TensorDataset(x,y),batch_size=32,shuffle=True,generator=torch.Generator().manual_seed(a.seed))
    best=float("inf");history=[];selected=0;state=None;start=time.perf_counter()
    for epoch in range(a.epochs):
        model.train();losses=[]
        for xb,yb in loader:
            estimate,_=model(xb);loss=((estimate[:,32:]-yb[:,32:])**2).mean();optimizer.zero_grad();loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.);optimizer.step();losses.append(loss.item())
        val=float(np.mean([np.mean(((predict(model,r,scaler)-r["y"])/scaler["y_std"])**2) for r in runs if r["split"]=="validation"]))
        history.append(dict(epoch=epoch+1,training_loss=float(np.mean(losses)),validation_loss=val))
        if val<best:best=val;state=copy.deepcopy(model.state_dict());selected=epoch+1
    cp=dict(state_dict=state,scaler={k:v.tolist() for k,v in scaler.items()},hidden=32,inputs=8,outputs=2,seed=a.seed,selected_epoch=selected)
    torch.save(cp,out/"checkpoint.pt")
    (out/"training.json").write_text(json.dumps(dict(seed=a.seed,selected_epoch=selected,epochs=a.epochs,history=history,
        training_ids=[r["id"] for r in runs if r["split"]=="train"],validation_ids=[r["id"] for r in runs if r["split"]=="validation"],
        scaler=cp["scaler"],parameters=sum(v.numel() for v in model.parameters()),training_seconds=time.perf_counter()-start,
        dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),versions=dict(python=sys.version,numpy=np.__version__,torch=torch.__version__)),indent=2)+"\n",encoding="utf8")
    print("selected",selected,"test groups were not opened",flush=True)


if __name__=="__main__":main()
