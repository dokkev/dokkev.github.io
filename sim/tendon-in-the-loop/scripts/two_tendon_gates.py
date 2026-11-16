"""Check the declared pre-learning mechanical/control gates against saved experiments."""
import argparse,json
from pathlib import Path
import numpy as np


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--results",default="figures/two-tendon");ap.add_argument("--pilot",default="data/two-tendon/pilot.manifest.json");a=ap.parse_args()
    p=Path(a.results);physics=json.loads((p/"physics/verification.json").read_text());control=json.loads((p/"control/control.json").read_text())
    pilot=json.loads(Path(a.pilot).read_text());geometry=physics["geometry"]["rows"]
    free=[v for k,v in control.items() if "_free_elastic_feedforward" in k]
    nominal=[v for k,v in physics["numerics"].items() if "_o0.0005_p0.0001_c0.0001_d0_s0.004" in k]
    gates=dict(jacobian=max(np.max(abs(np.array(v["finite_difference"])-v["analytic"])) for v in geometry)<1e-8,
        torque=max(v["torque_error_max_Nm"] for v in geometry)<1e-8,
        isolated_energy=max(v["peak_residual_J"] for v in physics["energy"])<1e-5,
        free_positioning=all(max(v["mae_deg"])<2 and not v["flags"] for v in free),
        proximal_held_joint=control["proximal_free_elastic_feedforward"]["mae_deg"][1]<1,
        distal_held_joint=control["distal_free_elastic_feedforward"]["mae_deg"][0]<1,
        nominal_numerics=all(max(v["joint_rmse_vs_ref_deg"])<(.5 if v["config"]["contact"] else .25) and max(v["tension_rmse_vs_ref_N"])<1 for v in nominal),
        pilot=all(not v["quality"]["flags"] for v in pilot))
    gates={name:bool(value) for name,value in gates.items()}
    report=dict(passed=all(gates.values()),gates=gates,note="Pre-learning gates for this constant-arm numerical reference. Contact tracking and perturbed numerics are diagnostic results, not hidden exclusions.")
    (p/"gates.json").write_text(json.dumps(report,indent=2)+"\n");print(json.dumps(report,indent=2))
    if not report["passed"]:raise SystemExit(1)


if __name__=="__main__":main()
