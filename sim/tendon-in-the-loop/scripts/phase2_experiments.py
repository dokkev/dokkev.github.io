"""Run predeclared learning comparisons in independent processes; no test-driven model selection."""
import argparse,subprocess,sys
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--dataset",required=True);ap.add_argument("--out",required=True)
    ap.add_argument("--epochs",type=int,default=60);ap.add_argument("--workers",type=int,default=2)
    a=ap.parse_args();root=Path(a.out);root.mkdir(parents=True,exist_ok=True)
    tasks=[("joint",seed) for seed in (0,1,2)]+[(v,0) for v in ("transmission","small","quarter","half")]
    def execute(variant,seed):
        out=root/f"{variant}-seed{seed}";out.mkdir(parents=True,exist_ok=True)
        command=[sys.executable,str(Path(__file__).with_name("phase2_train.py")),"--dataset",a.dataset,
            "--out",str(out),"--epochs",str(a.epochs),"--seed",str(seed),"--variant",variant]
        with (out/"training.log").open("w",encoding="utf8") as log:
            subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
        return f"{variant}-seed{seed}"
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        futures=[pool.submit(execute,*task) for task in tasks]
        for f in as_completed(futures):print("completed "+f.result(),flush=True)


if __name__=="__main__":main()
