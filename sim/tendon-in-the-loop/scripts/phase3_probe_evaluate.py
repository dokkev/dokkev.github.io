"""Frozen observers on executed quiet diagnostic probe trials, without refitting."""
import argparse,json,sys
from pathlib import Path
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.observer import Observer
from til.phase3_observer import prediction,score,PhysicsObserver


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--study",required=True);ap.add_argument("--models",required=True)
    ap.add_argument("--calibration",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    torch.set_num_threads(2);study=Path(a.study);data=json.loads((study/"probing.json").read_text());arrays=np.load(study/"probing.npz")
    models=[]
    for seed in range(3):
        cp=torch.load(Path(a.models)/f"C_passive-seed{seed}/checkpoint.pt",weights_only=True)
        model=Observer(outputs=2);model.load_state_dict(cp["state_dict"])
        models.append((model,{k:np.array(v,np.float32) for k,v in cp["scaler"].items()}))
    rows=[]
    for row in data["probes"]:
        # Study.observe already records at the 200 Hz observer rate; native episode
        # traces used by mechanism evaluation instead record at 1 kHz.
        d=arrays[row["id"]+"__trace"]
        if not np.allclose(np.diff(d[:,0]),.005,atol=1e-10,rtol=0):raise ValueError("expected 200 Hz diagnostic trajectory")
        run=dict(time=d[:,0],x=d[:,3:7].astype(np.float32),y=d[:,1:3].astype(np.float32))
        estimates=[prediction(model,run,scaler) for model,scaler in models]
        rows.append(dict(id=row["id"],full_by_seed=[score(run["y"],e) for e in estimates],
            after_300ms_by_seed=[score(run["y"],e,d[:,0]>=.3) for e in estimates],
            physics_full=score(run["y"],PhysicsObserver(json.loads(Path(a.calibration).read_text())).predict(run))))
    Path(a.out).write_text(json.dumps(dict(probes=rows,note="Quiet diagnostic trials with cold recurrent state; flexed/contact start differs from training home. Scores include initialization; not the primary noisy paired task benchmark."),indent=2)+"\n",encoding="utf8")


if __name__=="__main__":main()
