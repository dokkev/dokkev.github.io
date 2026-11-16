"""Export reproducible page metrics from completed TiL verification runs.

Run baselines.py and robustness.py first; this script does not train or assess an observer.
HDF5 datasets remain local. The exported JSON contains configurations, software versions,
source hashes, observed metrics and an explicit distinction from hardware acceptance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

import h5py
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from til.cable import CablePlant, CableParams
from robustness import cases


def phase_lag(t, command, actual, period):
    """Fundamental phase only, not a broadband frequency-response identification."""
    w = 2 * np.pi / period
    design = np.column_stack((np.sin(w * t), np.cos(w * t), np.ones_like(t)))
    c = np.linalg.lstsq(design, command, rcond=None)[0]
    a = np.linalg.lstsq(design, actual, rcond=None)[0]
    if np.hypot(*c[:2]) < 1e-10 or np.hypot(*a[:2]) < 1e-10:
        return None
    angle = np.arctan2(c[1], c[0]) - np.arctan2(a[1], a[0])
    return float(np.rad2deg(np.arctan2(np.sin(angle), np.cos(angle))))


def baseline_metrics(filename):
    rows = []
    with h5py.File(filename, "r") as f:
        versions = json.loads(f.attrs["versions"])
        for name, g in f["episodes"].items():
            cfg = json.loads(g.attrs["config"])
            summary = json.loads(g.attrs["summary"])
            # Wall time depends on the machine and is not a mechanical result.
            summary.pop("wall_time_s", None)
            t = g["time"][()]
            error = g["emulator/tracking_error"][()]
            active = t >= cfg["profile"]["settle_time"]
            summary.update({
                "configuration": cfg,
                "emulator_rmse_mm": float(np.sqrt(np.mean(error ** 2)) * 1e3),
                "emulator_peak_error_mm": float(np.max(np.abs(error)) * 1e3),
                "fundamental_phase_lag_deg": phase_lag(
                    t[active], g["emulator/commanded_position"][()][active],
                    g["emulator/actual_position"][()][active], cfg["profile"]["period"]),
            })
            rows.append(summary)
    return versions, rows


def robustness_metrics(filename):
    rows = []
    configurations = {label: episode.to_dict() for label, episode in cases()}
    for line in Path(filename).read_text(encoding="utf8").splitlines()[2:]:
        fields = [v.strip() for v in line.strip("|").split("|")]
        if len(fields) != 5:
            continue
        rows.append(dict(case=fields[0], configuration=configurations[fields[0]], diagnostic_status=fields[1],
                         peak_tension_N=float(fields[2]),
                         peak_tracking_error_mm=float(fields[3]),
                         contact_fraction=float(fields[4])))
    return rows


def energy_check():
    dt, duration, amplitude, frequency = 1e-4, 2., .001, 3.
    plant = CablePlant(CableParams(pretension=15., k0=10000., c=1.,
                                   friction_model="viscous", b_p=2e-5))
    initial = plant.stored_energy()
    w = 2 * np.pi * frequency
    for i in range(round(duration / dt)):
        t = (i + 1) * dt
        plant.step(dt, amplitude * np.sin(w * t), amplitude * w * np.cos(w * t), 0., 0.)
    work = plant.s.W_in + plant.s.W_out
    accounted = plant.stored_energy() - initial + plant.s.E_diss
    return dict(duration_s=duration, timestep_s=dt, input_amplitude_m=amplitude,
                input_frequency_Hz=frequency, port_work_J=float(work),
                storage_change_plus_dissipation_J=float(accounted),
                residual_J=float(work - accounted),
                relative_residual=float(abs(work - accounted) / max(abs(work), 1e-12)))


def drift_metrics(filename):
    with h5py.File(filename, "r") as f:
        name = next(iter(f["episodes"]))
        g = f["episodes"][name]
        summary = json.loads(g.attrs["summary"])
        summary.pop("wall_time_s", None)
        summary["configuration"] = json.loads(g.attrs["config"])
        for channel in ("effective_stiffness", "effective_friction", "creep_state", "degradation_state"):
            values = g["ground_truth/" + channel][()]
            summary[channel] = dict(first=float(values[0]), last=float(values[-1]))
        return summary


def plot_report(rows, filename):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"svg.fonttype": "none", "svg.hashsalt": "til-verification", "font.size": 10})
    fig, ax = plt.subplots(1, 2, figsize=(9.6, 3.3), constrained_layout=True)
    latency = [r for r in rows if r["case"].startswith("latency ")]
    current = [r for r in rows if r["case"].startswith("motor current limit ")]
    ax[0].plot([float(r["case"].split()[1]) for r in latency],
               [r["peak_tracking_error_mm"] for r in latency], "o-", color="#48675b")
    ax[0].set(xlabel="Added delay [ms]", ylabel="Peak emulator tracking error [mm]",
              title="Coupling sensitivity to delay")
    ax[1].plot([float(r["case"].split()[3]) for r in current],
               [100 * r["contact_fraction"] for r in current], "o-", color="#8b642b")
    ax[1].set(xlabel="Motor current limit [A]", ylabel="Time in contact [%]",
              title="Finite motion does not ensure contact", ylim=(-2, 100))
    for a in ax:
        a.grid(alpha=.2)
        a.spines[["top", "right"]].set_visible(False)
    fig.savefig(filename, metadata={"Date": None})
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baselines", required=True)
    ap.add_argument("--robustness", required=True)
    ap.add_argument("--drift", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--plot", required=True)
    a = ap.parse_args()
    versions, baselines = baseline_metrics(a.baselines)
    robustness = robustness_metrics(a.robustness)
    sources = sorted([*ROOT.glob("til/*.py"), *ROOT.glob("scripts/*.py"), *ROOT.glob("tests/*.py")])
    report = dict(
        scope="Numerical pre-hardware verification; not a hardware acceptance or learned-model benchmark.",
        generated_at_utc=datetime.now(timezone.utc).isoformat(), versions=versions,
        source_hash_encoding="Source bytes with CRLF normalized to LF for cross-platform Git checkouts.",
        source_sha256={str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest() for p in sources},
        baselines=baselines, robustness=robustness,
        viscous_energy_balance=energy_check(), drift=drift_metrics(a.drift),
        caveats=["The robustness script's OK means only that its numerical guards did not abort.",
                 "Its 5 mm warning is a diagnostic, not a hardware design tolerance.",
                 "No system ID, learned model, neural observer, or physical-finger estimator is trained here.",
                 "Energy accounting is verified in a taut viscous case, not for every degradation law.",
                 "The drift constitutive law and accelerated time scale are algorithm-testing assumptions."])
    for filename in (a.out, a.plot):
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf8")
    plot_report(robustness, a.plot)
    print(json.dumps({"versions": versions, "energy": report["viscous_energy_balance"], "drift": report["drift"],
                      "baseline_tracking": [{k: r[k] for k in ("episode_id", "emulator_rmse_mm", "fundamental_phase_lag_deg")} for r in baselines]}, indent=2))


if __name__ == "__main__":
    main()
