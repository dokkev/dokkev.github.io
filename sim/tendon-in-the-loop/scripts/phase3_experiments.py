"""Independent fixed-budget calibration-aware GRUs. Evaluation is a separate command."""
import argparse,subprocess,sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True)
    ap.add_argument("--epochs",type=int,default=60);ap.add_argument("--workers",type=int,default=2)
    ap.add_argument("--cases",nargs="+",default=["A","B","C_passive","C_probe","pooled"])
    ap.add_argument("--seeds",nargs="+",type=int,default=[0,1,2]);a=ap.parse_args()
    def execute(case,seed):
        out=Path(a.out)/f"{case}-seed{seed}";out.mkdir(parents=True,exist_ok=True)
        command=[sys.executable,str(Path(__file__).with_name("phase3_train.py")),"--dataset",a.dataset,"--out",str(out),
            "--case",case,"--seed",str(seed),"--epochs",str(a.epochs)]
        with (out/"training.log").open("w",encoding="utf8") as log:subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
        return f"{case}-seed{seed}"
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        jobs=[pool.submit(execute,c,s) for c in a.cases for s in a.seeds]
        for f in as_completed(jobs):print("completed "+f.result(),flush=True)


if __name__=="__main__":main()
