"""Exploratory parameter/history randomization; ranges are hypotheses, not hardware fits."""
import argparse
import json
import sys
from pathlib import Path

import h5py
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from til.runner import run_experiment
from til.scenarios import EpisodeConfig, MotorProfile

COUNTS = {"train": 28, "validation": 6, "test_in_range": 3,
          "test_contact": 6, "test_law": 6, "test_drift": 6}
PROTOCOL = {
    "version": "randomized-v1", "design_seed": 20261116,
    "status": "Exploratory robustness ranges, not measured hardware distributions.",
    "calibration": {"K_t": .1, "J_m": 2e-5, "b_m": 2e-5, "r_drum": .02},
    "ranges": {
        "K_t_Nm_per_A": [.09, .11], "k0_N_per_m": [7000, 13000],
        "k3_N_per_m3": [1.5e9, 4.5e9], "c_Ns_per_m": [1., 4.],
        "creep_rate_m_per_s": [1e-6, 6e-6], "drift_rate_per_J": [.15, .6],
        "stiffness_log_noise_std": [.01, .04], "stiffness_correlation_s": [1., 5.],
        "stiffness_smoothing_s": [.25, .7], "pulley_radius_m": [.016, .024],
        "friction_torque_Nm": [.002, .008], "pretension_N": [6, 14],
        "current_gain": [.98, 1.02], "current_bias_A": [-.04, .04],
        "current_white_noise_A": [.005, .03], "current_colored_noise_A": [.005, .02],
        "tension_white_noise_N": [.05, .2], "load_cell_bias_N": [-.15, .15],
        "tension_delay_s": [.001, .002], "tension_jitter_s": .0005,
        "thermal_model": "single-lump proxy; all constants explicitly saved per run",
    },
    "holdouts": {"test_contact": "unseen 4000/8000 N/m objects and selected placements",
                 "test_law": "Coulomb instead of Dahl, friction torque .008-.012 N m",
                 "test_drift": "20 cycles; drift rate 1-2 per J, creep 8-15 um/s at reference load"},
}


def episodes(split):
    if split not in COUNTS:
        raise ValueError(split)
    runs = []
    group = list(COUNTS).index(split)
    for index in range(COUNTS[split]):
        seed = PROTOCOL["design_seed"] + group * 1000 + index
        rng = np.random.default_rng(seed)
        u = rng.uniform
        cable = dict(k0=u(7000, 13000), k3=u(1.5e9, 4.5e9), c=u(1, 4),
                     R_p=u(.016, .024), tau_c=u(.002, .008), mu_load=u(.01, .04),
                     dahl_sigma=u(40, 100), settle_rate=u(1e-7, 5e-7), settle_cap=u(.0002, .0008),
                     creep_rate=u(1e-6, 6e-6), drift_rate=u(.15, .6), alpha_k=u(.1, .25), beta_f=u(.5, 1.5),
                     stiffness_noise_std=u(.01, .04), stiffness_correlation_time=u(1, 5), stiffness_smoothing_time=u(.25, .7))
        motor = dict(K_t=u(.09, .11), K_t_nominal=.1, J_m=2e-5*u(.8, 1.2), b_m=u(1e-5, 4e-5), tau_c_m=u(0, .003),
                     winding_resistance=u(.3, .8), thermal_capacity=u(10, 25), thermal_resistance=u(4, 12),
                     K_t_temperature_coeff=u(-.0015, -.0005), ambient_temperature=u(20, 35),
                     encoder_cpr=int(rng.choice([8192, 16384, 32768])), encoder_offset=u(-.0005, .0005),
                     current_gain=u(.98, 1.02), current_bias=u(-.04, .04), current_noise=u(.005, .03),
                     current_colored_noise=u(.005, .02), current_correlation_time=u(.03, .15), velocity_noise=u(.002, .01))
        sensors = dict(tension_noise=u(.05, .2), emulator_pos_noise=u(1e-6, 5e-6),
                       emulator_pos_bias=u(-1e-5, 1e-5), input_tension_bias=u(-.15, .15), output_tension_bias=u(-.15, .15),
                       tension_delay=float(rng.choice([.001, .0015, .002])), tension_jitter=.0005)
        kp = u(1.2e5, 1.8e5)
        emulator = dict(Kp=kp, Kd=2*np.sqrt(kp), delay=float(rng.integers(2, 11))*1e-4)
        if split == "test_law":
            cable.update(friction_model="coulomb", tau_c=u(.008, .012))
        if split == "test_drift":
            cable.update(drift_rate=u(1, 2), creep_rate=u(8e-6, 15e-6), alpha_k=u(.3, .4))
        x = float(rng.choice([.05, .055, .06]))
        stiffness = float(rng.choice([500, 1000, 2000]))
        if split == "validation":
            x, stiffness = float(rng.choice([.052, .058])), 1500.
        if split == "test_contact":
            x, stiffness = float(rng.choice([.045, .055, .065])), float(rng.choice([4000, 8000]))
        cycles = 20 if split == "test_drift" else (10 if (split == "train" and index >= 24) or (split == "validation" and index >= 4) else 3)
        ramp, release = u(.25, .35), u(.25, .35)
        hold = min(u(.2, .4), .95-ramp-release)
        runs.append(EpisodeConfig(split, f"random_{split}_{index:02d}", seed=seed, cable_preset="drift",
            cable_specimen_id=f"random-specimen-{group}-{index}", obj_x=x, k_obj=stiffness,
            pretension=u(6, 14), q0=(float(u(0, .15)), float(u(0, .2))),
            profile=MotorProfile(amplitude=u(.014, .018), period=u(1.5, 2.2), n_cycles=cycles,
                                 ramp_frac=ramp, hold_frac=hold, release_frac=release),
            sim_overrides=dict(cable=cable, motor=motor, sensors=sensors, emulator=emulator)))
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=list(COUNTS))
    ap.add_argument("--out", required=True)
    ap.add_argument("--merge", nargs="+", help="merge completed split files instead of simulating")
    a = ap.parse_args()
    if bool(a.split) == bool(a.merge):
        ap.error("choose --split or --merge")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    if a.merge:
        with h5py.File(a.out, "w") as dst:
            for index, source in enumerate(a.merge):
                with h5py.File(source) as src:
                    if index == 0:
                        dst.attrs.update(dict(src.attrs))
                        dst.require_group("episodes")
                    for name, group in src["episodes"].items():
                        if "failed" in group.attrs:
                            raise ValueError(f"cannot merge failed episode {name}")
                        src.copy(group, dst["episodes"], name=name)
            dst.attrs["summaries"] = json.dumps([json.loads(g.attrs["summary"]) for g in dst["episodes"].values()])
            dst.attrs["randomization_protocol"] = json.dumps(PROTOCOL)
    else:
        result = run_experiment(episodes(a.split), a.out)
        with h5py.File(a.out, "a") as f:
            f.attrs["randomization_protocol"] = json.dumps(PROTOCOL)
        if any("failed" in r for r in result):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
