"""Normalize two-channel metadata without changing any numerical signal."""
import argparse,sys
from pathlib import Path
import h5py
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.two_tendon_experiment import normalize_units


if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("paths",nargs="+");a=ap.parse_args()
    for path in a.paths:
        with h5py.File(path,"a") as file:normalize_units(file)
