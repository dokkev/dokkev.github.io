"""One-time known-home encoder-zero reference, without online adaptation or test-label fitting."""
import argparse,copy,json,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_observer import load_runs,corrected,scores


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--calibration",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    c=json.loads(Path(a.calibration).read_text());rows={}
    for r in load_runs(a.dataset):
        if r["split"]!="test_zero":continue
        referenced=copy.copy(r);referenced["x"]=r["x"].copy()
        offset=referenced["x"][0,[0,4]].copy();referenced["x"][:,[0,4]]-=offset
        rows[r["id"]]=dict(encoder_reference_rad=offset.tolist(),before=scores(r,corrected(r,c)),after=scores(r,corrected(referenced,c)))
    Path(a.out).write_text(json.dumps(dict(runs=rows,procedure="Known-home jig reference at the first acquired encoder frame. The simulation constructs repeatable home; the jig procedure is assumed, not physically implemented. No true test joint or force is used to fit the offset; all later estimates use current/past motor observations.",
        scope="One-time zero recalibration, an additional setup privilege versus the uncertain-zero test. Not online learning or evidence that other mechanical errors can be removed by rehoming."),indent=2)+"\n")


if __name__=="__main__":main()
