"""Add newly generated diagnostic test runs to frozen experiments without any retraining."""
import argparse,hashlib,json,sys
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.observer import Observer,predict
from til.phase2_observer import load_runs,score_run,score,rigid_prediction,truncated_prediction


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--experiments",required=True)
    ap.add_argument("--phase1-checkpoint",default="figures/observer/observer.pt")
    ap.add_argument("--refresh-split",help="explicitly re-evaluate a regenerated diagnostic split")
    a=ap.parse_args()
    torch.set_num_threads(2);runs=load_runs(a.dataset)
    for path in sorted(Path(a.experiments).glob("*/metrics.json")):
        report=json.loads(path.read_text());checkpoint=torch.load(path.parent/"checkpoint.pt",weights_only=True)
        model=Observer(hidden=checkpoint["hidden"],outputs=checkpoint["outputs"]);model.load_state_dict(checkpoint["state_dict"]);model.eval()
        scaler={k:np.array(v,dtype=np.float32) for k,v in checkpoint["scaler"].items()}
        with np.load(path.parent/"predictions.npz") as archive:predictions={k:archive[k] for k in archive}
        added=[]
        for run in runs:
            if run["id"] in report["per_run"] and run["split"]!=a.refresh_split:continue
            if not run["split"].startswith("test"):raise ValueError("extension must contain test runs only")
            y=predict(model,run,scaler);predictions[run["id"]]=y
            report["per_run"][run["id"]]=score_run(run,y[:,:1] if report["variant"]=="transmission" else y)
            added.append(run["id"])
            if report["baselines"]:
                mean=scaler["y_mean"]
                report["baselines"][run["id"]]={"rigid_equal_joint":score_run(run,rigid_prediction(run)),
                    "training_mean":score_run(run,np.tile(mean,(len(run["y"]),1)))}
                for h in report["periodic_history_reset"]:
                    report["periodic_history_reset"][h][run["id"]]=score(run["y"],truncated_prediction(model,run,scaler,int(h)))
                old=torch.load(a.phase1_checkpoint,weights_only=True);frozen=Observer();frozen.load_state_dict(old["state_dict"])
                old_scaler={k:np.array(v,dtype=np.float32) for k,v in old["scaler"].items()}
                report["phase1_frozen_tension"][run["id"]]=score(run["y"][:,:1],predict(frozen,run,old_scaler)[:,:1])
        for split in sorted({r["split"] for r in runs}):
            ids=[r["id"] for r in runs if r["split"]==split];report["metrics"][split]={}
            for regime in ("all","contact","free","reversal","initialization","after_settling"):
                rows=[report["per_run"][i][regime] for i in ids if report["per_run"][i][regime] is not None]
                report["metrics"][split][regime]={key:float(np.mean([r[key] for r in rows])) for key in rows[0]} if rows else None
        report["evaluation_dataset_sha256"]=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest()
        report["supplemental_frozen_test_runs"]=sorted(set(report.get("supplemental_frozen_test_runs",[])+added))
        path.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")
        np.savez_compressed(path.parent/"predictions.npz",**predictions)
        print(path.parent.name+f": {len(added)} new diagnostic runs; checkpoint unchanged",flush=True)


if __name__=="__main__":main()
