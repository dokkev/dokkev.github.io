"""Fit a frozen nominal compliance reference from calibration-training runs only."""
import argparse,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase3_observer import load_runs,fit_physics

if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    result=fit_physics(load_runs(a.dataset,splits={"train"}))
    result["dataset_sha256"]=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest()
    Path(a.out).parent.mkdir(parents=True,exist_ok=True);Path(a.out).write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
    print(json.dumps(result,indent=2))
