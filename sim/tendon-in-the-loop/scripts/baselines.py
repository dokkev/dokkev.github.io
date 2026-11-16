"""Baseline experiments: the same contact scenario with four transmission presets.

    python scripts/baselines.py --out figures/baselines [--cycles 3]

Writes a comparison figure (motor-side motion, distal tension, finger motion) and a summary table.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from til.recorder import DatasetFile, load_episode
from til.runner import run_episode
from til.scenarios import EpisodeConfig, MotorProfile

PRESETS = ["rigid", "linear", "nonlinear", "drift"]
CASES = [("rigid_ideal_emulator", "rigid", {"emulator": {"mode": "ideal"}})] + [(p, p, {}) for p in PRESETS]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="figures/baselines")
    ap.add_argument("--cycles", type=int, default=3)
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    h5 = os.path.join(a.out, "baselines.h5")
    ds = DatasetFile(h5, "w")
    rows = []
    for name, preset, ov in CASES:
        ep = EpisodeConfig("baseline", name, cable_preset=preset, profile=MotorProfile(n_cycles=a.cycles), sim_overrides=ov)
        w = ds.episode(name, ep.to_dict())
        s = run_episode(ep, w)
        rows.append(s)
        print(name, json.dumps(s))
    ds.close()

    fig, ax = plt.subplots(4, 1, figsize=(9, 10), sharex=True)
    for name, _, _ in CASES:
        e = load_episode(h5, name)
        t = e["time"]
        ax[0].plot(t, e["motor/position"], label=name)
        ax[1].plot(t, e["transmission/output_tension"], label=name)
        ax[2].plot(t, e["transmission/apparent_elongation"] * 1e3, label=name)
        ax[3].plot(t, e["simulation/joint_positions"][:, 1], label=name)
    ax[0].set_ylabel("motor angle [rad]")
    ax[1].set_ylabel("T_out [N]")
    ax[2].set_ylabel("apparent elongation [mm]")
    ax[3].set_ylabel("q2 [rad]")
    ax[3].set_xlabel("time [s]")
    for x in ax:
        x.legend(fontsize=8)
    ax[0].set_title("Same motor command, four transmission presets")
    fig.savefig(os.path.join(a.out, "baselines_comparison.png"), dpi=140, bbox_inches="tight")

    with open(os.path.join(a.out, "baselines_summary.md"), "w", encoding="utf8") as f:
        f.write("| preset | peak T [N] | contact fraction | final degradation | creep [mm] | settle [mm] |\n|---|---|---|---|---|---|\n")
        for s in rows:
            f.write(f"| {s['episode_id']} | {s['peak_tension_N']:.1f} | {s['contact_fraction']:.2f} | {s['final_degradation']:.3f} | {s['final_creep_m'] * 1e3:.3f} | {s['final_settle_m'] * 1e3:.3f} |\n")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
