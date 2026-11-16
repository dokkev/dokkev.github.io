"""Numerical-robustness sweeps. Each case runs a short contact scenario and is reported as OK or FAILED with
its peak tension and emulator tracking error. Failures are reported, never hidden.

    python scripts/robustness.py --out figures/robustness.md
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np

from til.coupling import TiLSimulator
from til.runner import SimulationFailure
from til.scenarios import EpisodeConfig, MotorProfile


def run_case(label: str, ep: EpisodeConfig) -> dict:
    try:
        cfg = ep.sim_config()
        sim = TiLSimulator(cfg)
        sim.reset(ep.q0)
        r = cfg.motor.r_drum
        peak, err, contact = 0.0, 0.0, 0
        n = 0
        while sim.t < ep.profile.duration:
            sim.step(ep.profile.x_ref(sim.t) / r)
            if sim.log_due:
                rec = sim.record()
                T = max(rec["ground_truth"]["input_tension_true"], rec["ground_truth"]["output_tension_true"])
                if not np.isfinite(T) or not np.all(np.isfinite(rec["simulation"]["joint_positions"])) or T > 1e4:
                    raise SimulationFailure(f"non-finite or exploding state at t={sim.t:.3f}s (T={T})")
                peak = max(peak, T)
                err = max(err, abs(rec["emulator"]["tracking_error"]))
                contact += int(rec["simulation"]["contact_state"])
                n += 1
        status = "OK" if err < 5e-3 else "OK (oscillation suspected: tracking error > 5 mm)"
        return {"case": label, "status": status, "peak_T": peak, "max_track_err_mm": err * 1e3, "contact_frac": contact / max(1, n)}
    except Exception as e:  # report explicitly
        return {"case": label, "status": f"FAILED: {type(e).__name__}: {e}", "peak_T": float("nan"), "max_track_err_mm": float("nan"), "contact_frac": float("nan")}


def cases() -> list[tuple[str, EpisodeConfig]]:
    base = dict(profile=MotorProfile(n_cycles=2, period=1.5, settle_time=0.1), cable_preset="nonlinear")
    out = []
    for ts in (2.5e-4, 5e-4, 1e-3, 2e-3):
        n_sub = int(np.ceil(ts / 1e-4))  # plant substep <= 0.1 ms and an exact divisor of the MuJoCo step
        out.append((f"mujoco timestep {ts}", EpisodeConfig("rob", "ts", sim_overrides={"finger": {"timestep": ts}, "timing": {"plant_dt": ts / n_sub}}, **base)))
    for kp in (4e2, 4e3, 4e4, 4e5):
        out.append((f"emulator Kp {kp:g} (~{np.sqrt(kp) / 2 / np.pi:.0f} Hz)", EpisodeConfig("rob", "bw", sim_overrides={"emulator": {"Kp": kp, "Kd": 2 * np.sqrt(kp)}}, **base)))
    for n in (0.0, 0.2, 1.0, 5.0):
        out.append((f"tension noise {n} N", EpisodeConfig("rob", "noise", sim_overrides={"sensors": {"tension_noise": n}}, **base)))
    for d in (0.0, 0.002, 0.01, 0.03):
        out.append((f"latency {d * 1e3:.0f} ms", EpisodeConfig("rob", "lat", sim_overrides={"sensors": {"tension_delay": d}, "emulator": {"delay": d}}, **base)))
    for k in (200.0, 2000.0, 20000.0, 200000.0):
        out.append((f"object stiffness {k:g} N/m", EpisodeConfig("rob", "kobj", k_obj=k, **base)))
    for imax in (1.0, 2.0, 8.0):
        out.append((f"motor current limit {imax} A", EpisodeConfig("rob", "sat", sim_overrides={"motor": {"i_max": imax}}, **base)))
    for vmax in (0.02, 0.1, 0.5):
        out.append((f"emulator v_max {vmax} m/s", EpisodeConfig("rob", "vmax", sim_overrides={"emulator": {"v_max": vmax}}, **base)))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="figures/robustness.md")
    a = ap.parse_args(argv)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    rows = []
    for label, ep in cases():
        r = run_case(label, ep)
        rows.append(r)
        print(f"{r['case']:<40} {r['status'][:40]:<40} peak T {r['peak_T']:.1f} N  track err {r['max_track_err_mm']:.3f} mm  contact {r['contact_frac']:.2f}")
    with open(a.out, "w", encoding="utf8") as f:
        f.write("| case | status | peak T [N] | max emulator tracking error [mm] | contact fraction |\n|---|---|---|---|---|\n")
        for r in rows:
            f.write(f"| {r['case']} | {r['status']} | {r['peak_T']:.1f} | {r['max_track_err_mm']:.3f} | {r['contact_frac']:.2f} |\n")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
