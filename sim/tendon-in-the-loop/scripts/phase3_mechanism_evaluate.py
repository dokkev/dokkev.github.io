"""Frozen nominal GRU transfer vs a design-calibrated reduced physics observer."""
import argparse,copy,json,sys
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.observer import Observer
from til.phase3_observer import prediction,score,PhysicsObserver


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--study",required=True);ap.add_argument("--models",required=True)
    ap.add_argument("--calibration",required=True);ap.add_argument("--out",required=True);a=ap.parse_args();torch.set_num_threads(2)
    rows=json.loads((Path(a.study)/"mechanisms.json").read_text());arrays=np.load(Path(a.study)/"mechanisms.npz")
    calibration=json.loads(Path(a.calibration).read_text());models=[]
    for seed in (0,1,2):
        cp=torch.load(Path(a.models)/f"C_probe-seed{seed}/checkpoint.pt",weights_only=True)
        model=Observer(outputs=2);model.load_state_dict(cp["state_dict"])
        models.append((model,{k:np.array(v,np.float32) for k,v in cp["scaler"].items()}))
    predictions={}
    for row in rows:
        for i,episode in enumerate(row["episodes"]):
            data=arrays[row["name"]+f"__episode{i}"][::5]
            run=dict(time=data[:,0],x=data[:,3:7].astype(np.float32),y=data[:,1:3].astype(np.float32),config=episode["config"])
            mask=data[:,0]>=episode["config"]["metadata"]["protocol"]["probe_duration"]
            errors=[]
            for seed,(model,scaler) in enumerate(models):
                estimate=prediction(model,run,scaler);errors.append(score(run["y"],estimate,mask))
                if seed==0:predictions[row["name"]+f"__gru{i}"]=estimate
            episode["frozen_gru_by_seed"]=errors
            c=copy.deepcopy(calibration);c["nominal_pretension_N"]=row["pretension_N"]
            estimate=PhysicsObserver(c,row["mechanism"]).predict(run)
            episode["known_design_physics"]=score(run["y"],estimate,mask);predictions[row["name"]+f"__physics{i}"]=estimate
            q=data[:,1:3];episode["joint_limit_fraction"]=float(np.mean((q[:,0]<-.28)|(q[:,0]>1.58)|(q[:,1]<.02)|(q[:,1]>1.98)))
        print("evaluated design "+row["name"],flush=True)
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(out/"mechanism-predictions.npz",**predictions)
    (out/"mechanism-evaluation.json").write_text(json.dumps(dict(designs=rows,
        interpretation="GRUs are frozen nominal-design models: errors measure transfer, not design-specific optimized estimation. Physics observer is given the declared static design; no true joint/contact measurements enter inference."),indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
