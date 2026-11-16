"""Save executed fixed-setup study trajectories in the existing TiL HDF5 namespaces."""
import argparse,json,sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.recorder import DatasetFile


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--study",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    meta=json.loads((Path(a.study)/"probing.json").read_text());raw=np.load(Path(a.study)/"probing.npz")
    lookup={r["id"]:r for r in meta["probes"]};Path(a.out).parent.mkdir(parents=True,exist_ok=True);ds=DatasetFile(a.out)
    try:
        for key in raw:
            if not key.endswith("__trace") and not key.startswith("ambiguity_"):continue
            name=key.replace("__trace","");trace=raw[key]
            config=dict(scenario_id="analysis_fixed_setup",metadata=lookup.get(name,meta["ambiguity"]),
                note="Quiet executed analysis; no fabricated missing states. Noncyclic trial cycle_count=0.")
            writer=ds.episode(name,config)
            writer.units.update({"protocol/reference_displacement":"m","diagnostic/d_motor_per_deg":"1/deg (sensor-normalized)"})
            sensitivity=raw[name+"__sensitivity"].reshape(len(trace),4,2) if name in lookup else None
            for i,row in enumerate(trace):
                rec=dict(motor={k:row[3+j] for j,k in enumerate(("position","velocity","current","applied_command"))},
                    simulation=dict(joint_positions=row[1:3],contact_state=row[8]),
                    ground_truth=dict(output_tension_true=row[7]),protocol=dict(reference_displacement=row[9]))
                if sensitivity is not None:rec["diagnostic"]=dict(d_motor_per_deg=sensitivity[i])
                writer.append(row[0],0.,rec)
            writer.close()
    finally:ds.close()
    print("Exported executed probing and fixed-setup ambiguity trajectories")


if __name__=="__main__":main()
