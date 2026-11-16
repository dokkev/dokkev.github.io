"""Generate disjoint runs for the initial motor-only observer study."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from til.runner import run_experiment
from til.scenarios import EpisodeConfig, MotorProfile


def episodes():
    runs = []
    # Split by complete experiment, never adjacent windows from a shared run.
    settings = {
        "train": [(x, k, a, p, t) for x, k in ((.05, 500), (.06, 2000), (.055, 500))
                  for a, p, t in ((.014, 1.5, 8), (.018, 2.0, 12), (.016, 2.0, 10), (.018, 1.5, 8))],
        "validation": [(.052, 1000, .015, 1.75, 9), (.058, 1000, .017, 1.75, 11), (.055, 1500, .016, 1.5, 10)],
        "test_contact": [(.045, 8000, .016, 2, 10), (.065, 8000, .018, 1.5, 12), (.055, 4000, .014, 1.75, 8)],
        "test_law": [(.05, 500, .014, 1.5, 8), (.06, 2000, .018, 2, 12), (.055, 500, .016, 2, 10)],
        "test_drift": [(.05, 500, .014, 1.5, 8), (.06, 2000, .018, 2, 12), (.055, 500, .016, 2, 10)],
    }
    for split, cases in settings.items():
        for i, (x, k, amp, period, tension) in enumerate(cases):
            overrides = {"sensors": {"tension_noise": .05, "emulator_pos_noise": 1e-6},
                         "motor": {"encoder_cpr": 16384, "current_noise": .005, "velocity_noise": .002}}
            if split == "test_law":
                overrides["cable"] = {"friction_model": "coulomb", "tau_c": .008, "k3": 1e9}
            runs.append(EpisodeConfig(
                split, f"{split}_{i:02d}", seed=100 * list(settings).index(split) + i,
                cable_preset="drift" if split == "test_drift" else "nonlinear",
                obj_x=x, k_obj=k, pretension=tension,
                profile=MotorProfile(amplitude=amp, period=period, n_cycles=20 if split == "test_drift" else 3),
                sim_overrides=overrides))
    return runs


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    result = run_experiment(episodes(), args.out)
    if any("failed" in r for r in result):
        raise SystemExit(1)
