"""Evaluate a saved strict motor-only checkpoint without optimizer, refitting or test calibration."""
import argparse,json,sys
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.observer import Observer,predict
from til.phase2_observer import load_runs,score_run,truncated_prediction


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--checkpoint",required=True)
    ap.add_argument("--out",required=True);ap.add_argument("--history-reset",type=int)
    a=ap.parse_args();torch.set_num_threads(2)
    checkpoint=torch.load(a.checkpoint,weights_only=True)
    model=Observer(hidden=checkpoint["hidden"],outputs=checkpoint["outputs"])
    model.load_state_dict(checkpoint["state_dict"]);model.eval()
    scaler={k:np.array(v,dtype=np.float32) for k,v in checkpoint["scaler"].items()}
    result={}
    for run in load_runs(a.dataset):
        if not run["split"].startswith("test"):continue
        estimate=truncated_prediction(model,run,scaler,a.history_reset) if a.history_reset else predict(model,run,scaler)
        if checkpoint["variant"]=="transmission":estimate=estimate[:,:1]
        result[run["id"]]=score_run(run,estimate)
    Path(a.out).parent.mkdir(parents=True,exist_ok=True)
    Path(a.out).write_text(json.dumps(result,indent=2,allow_nan=False)+"\n",encoding="utf8")
    print(f"Evaluated {len(result)} held-out runs; checkpoint seed={checkpoint['seed']}, epoch={checkpoint['selected_epoch']}")


if __name__=="__main__":main()
