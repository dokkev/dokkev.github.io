"""Replay one prefix per mechanical condition, including eight noisy motor channels."""
import argparse,json,sys
from pathlib import Path
import h5py
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_experiment import simulate
from til.two_tendon import MOTOR_CHANNELS


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    checks={}
    with h5py.File(a.dataset) as f:
        for name,g in f["episodes"].items():
            spec=json.loads(g.attrs["config"]);condition=spec["condition"]
            if condition in checks:continue
            _,data=simulate(spec,duration=.8);n=len(data)
            reference=np.column_stack([g["simulation/joint_positions"][:n],*[g[k][:n] for k in MOTOR_CHANNELS]])
            actual=data[:,[1,2,*range(5,13)]]
            checks[condition]=dict(exact=bool(np.array_equal(actual,reference)),maximum_absolute_error=float(np.max(abs(actual-reference))))
    Path(a.out).write_text(json.dumps(checks,indent=2)+"\n");print(json.dumps(checks,indent=2))
    if not all(v["exact"] for v in checks.values()):raise SystemExit(1)


if __name__=="__main__":main()
