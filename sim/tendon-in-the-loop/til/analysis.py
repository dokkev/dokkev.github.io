"""Automatic analysis figures for a recorded episode.

Usage::

    python -m til.analysis data/smoke.h5 --out figures/smoke [--episode <id>]
"""

from __future__ import annotations

import argparse
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from .recorder import load_episode, list_episodes

MM = 1e3


def _save(fig, out: str, name: str) -> str:
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, name)
    fig.savefig(path, dpi=140, bbox_inches="tight")
    plt.close(fig)
    return path


def _loading_mask(e: np.ndarray) -> np.ndarray:
    """True where the apparent elongation is increasing (loading), smoothed over 5 samples."""
    d = np.gradient(e)
    k = np.ones(5) / 5
    return np.convolve(d, k, mode="same") > 0


def fig_configuration(ep: dict, out: str) -> str:
    """Finger configurations during contact (and the first free pose), with the object pad."""
    q = ep["simulation/joint_positions"]
    cs = ep["simulation/contact_state"] > 0.5
    cfg = ep["_config"]
    L1, L2 = 0.05, 0.035
    fig, ax = plt.subplots(figsize=(5.5, 4))
    idx = [0]
    if cs.any():
        ci = np.flatnonzero(cs)
        idx += list(ci[np.linspace(0, len(ci) - 1, 5).astype(int)])
    for j, i in enumerate(idx):
        q1, q2 = q[i]
        k = np.array([L1 * np.cos(q1), -L1 * np.sin(q1)])
        t = k + np.array([L2 * np.cos(q1 + q2), -L2 * np.sin(q1 + q2)])
        col = "0.6" if j == 0 else plt.cm.viridis(j / max(1, len(idx) - 1))
        ax.plot([0, k[0], t[0]], [0, k[1], t[1]], "-o", color=col, lw=4, ms=5, alpha=0.9, label=f"t={ep['time'][i]:.2f}s" + (" (free)" if j == 0 else " (contact)"))
    hx, hz = 0.012, 0.004
    ox, oz = cfg["obj_x"], cfg["obj_z"]
    ax.add_patch(plt.Rectangle((ox - hx, oz - 2 * hz), 2 * hx, 2 * hz, color="tab:green", alpha=0.4, label="object pad (rest)"))
    cl = ep["simulation/contact_location"]
    ok = np.isfinite(cl[:, 0])
    if ok.any():
        ax.plot(cl[ok, 0], cl[ok, 2], ".", color="k", ms=2, alpha=0.3, label="contact points")
    ax.set_aspect("equal")
    ax.set_xlabel("x [m]")
    ax.set_ylabel("z [m]")
    ax.set_title("Finger configuration during object contact")
    ax.legend(fontsize=7, loc="upper right")
    return _save(fig, out, "01_configuration.png")


def fig_displacements(ep: dict, out: str) -> str:
    t = ep["time"]
    fig, ax = plt.subplots(2, 1, figsize=(8, 5), sharex=True)
    ax[0].plot(t, ep["transmission/input_displacement"] * MM, label="input x_in (reeled in)")
    ax[0].plot(t, -ep["transmission/output_displacement"] * MM, label="−x_out (finger side, flexion = +)")
    ax[0].plot(t, ep["transmission/apparent_elongation"] * MM, label="apparent elongation x_in + x_out", color="k", lw=1)
    ax[0].set_ylabel("mm")
    ax[0].legend(fontsize=8)
    ax[0].set_title("Input and output motor displacement")
    ax[1].plot(t, ep["emulator/commanded_position"] * MM, label="emulator command l(q)−l(q0)")
    ax[1].plot(t, ep["emulator/actual_position"] * MM, "--", label="emulator actual")
    ax[1].plot(t, ep["emulator/tracking_error"] * MM, color="tab:red", lw=1, label="tracking error")
    ax[1].set_ylabel("mm")
    ax[1].set_xlabel("time [s]")
    ax[1].legend(fontsize=8)
    return _save(fig, out, "02_displacements.png")


def fig_tensions(ep: dict, out: str) -> str:
    t = ep["time"]
    fig, ax = plt.subplots(2, 1, figsize=(8, 5), sharex=True, gridspec_kw={"height_ratios": [3, 1]})
    ax[0].plot(t, ep["transmission/input_tension"], label="T_in (motor side)", color="tab:red")
    ax[0].plot(t, ep["transmission/output_tension"], label="T_out (finger side)", color="tab:blue")
    cs = ep["simulation/contact_state"] > 0.5
    ax[0].fill_between(t, 0, ax[0].get_ylim()[1], where=cs, color="tab:green", alpha=0.12, label="contact")
    ax[0].set_ylabel("N")
    ax[0].legend(fontsize=8)
    ax[0].set_title("Input and output tendon tension")
    ax[1].plot(t, ep["simulation/contact_force"], color="tab:green")
    ax[1].set_ylabel("contact N")
    ax[1].set_xlabel("time [s]")
    return _save(fig, out, "03_tensions.png")


def fig_tension_vs_elongation(ep: dict, out: str) -> str:
    e = ep["transmission/apparent_elongation"] * MM
    fig, ax = plt.subplots(1, 2, figsize=(9, 4))
    ax[0].plot(e, ep["transmission/input_tension"], lw=0.7, color="tab:red", label="T_in")
    ax[0].plot(e, ep["transmission/output_tension"], lw=0.7, color="tab:blue", label="T_out")
    ax[0].set_xlabel("apparent elongation x_in + x_out [mm]")
    ax[0].set_ylabel("tension [N]")
    ax[0].set_title("Tension vs apparent elongation")
    ax[0].legend(fontsize=8)
    k = ep["ground_truth/effective_stiffness"]
    s = ep["ground_truth/cable_segment_strains"] * MM
    ax[1].plot(s[:, 0], ep["ground_truth/input_tension_true"], lw=0.7, color="tab:red", label="segment 1")
    ax[1].plot(s[:, 1], ep["ground_truth/output_tension_true"], lw=0.7, color="tab:blue", label="segment 2")
    ax[1].set_xlabel("true segment stretch [mm] (ground truth)")
    ax[1].set_title(f"Constitutive view · k_eff {k.min() / MM:.2f}–{k.max() / MM:.2f} N/mm")
    ax[1].legend(fontsize=8)
    return _save(fig, out, "04_tension_vs_elongation.png")


def fig_hysteresis(ep: dict, out: str) -> str:
    e = ep["transmission/apparent_elongation"] * MM
    T = ep["transmission/output_tension"]
    load = _loading_mask(e)
    cyc = ep["cycle_count"]
    fig, ax = plt.subplots(1, 2, figsize=(9, 4))
    for m, col, lab in ((load, "tab:red", "loading"), (~load, "tab:blue", "unloading")):
        ax[0].plot(np.where(m, e, np.nan), np.where(m, T, np.nan), lw=0.8, color=col, label=lab)
    ax[0].set_xlabel("apparent elongation [mm]")
    ax[0].set_ylabel("T_out [N]")
    ax[0].set_title("Loading / unloading")
    ax[0].legend(fontsize=8)
    n = int(np.nanmax(cyc)) + 1 if np.isfinite(cyc).any() else 1
    picks = sorted(set([0, n // 2, max(0, n - 1)]))
    for c in picks:
        m = (cyc >= c) & (cyc < c + 1)
        if m.any():
            ax[1].plot(e[m], T[m], lw=0.9, label=f"cycle {c}")
    ax[1].set_xlabel("apparent elongation [mm]")
    ax[1].set_title("Hysteresis loop by cycle")
    ax[1].legend(fontsize=8)
    return _save(fig, out, "05_hysteresis.png")


def fig_tension_ratio(ep: dict, out: str) -> str:
    t = ep["time"]
    Ti, To = ep["transmission/input_tension"], ep["transmission/output_tension"]
    ratio = np.where(Ti > 0.5, To / np.maximum(Ti, 1e-9), np.nan)
    fig, ax = plt.subplots(1, 2, figsize=(9, 3.8))
    ax[0].plot(t, ratio, lw=0.8)
    ax[0].axhline(1, color="k", lw=0.5, ls="--")
    ax[0].set_ylabel("T_out / T_in")
    ax[0].set_xlabel("time [s]")
    ax[0].set_title("Input/output tension ratio")
    v = ep["transmission/pulley_velocity"]
    ax[1].scatter(v, Ti - To, s=2, alpha=0.4)
    ax[1].set_xlabel("pulley velocity [rad/s]")
    ax[1].set_ylabel("T_in − T_out [N]")
    ax[1].set_title("Tension drop across the pulley")
    return _save(fig, out, "06_tension_ratio.png")


def fig_hidden_states(ep: dict, out: str) -> str:
    t = ep["time"]
    fig, ax = plt.subplots(3, 1, figsize=(8, 6), sharex=True)
    ax[0].plot(t, ep["ground_truth/effective_stiffness"] / MM)
    ax[0].set_ylabel("k_eff [N/mm]")
    ax[1].plot(t, ep["ground_truth/creep_state"] * MM, label="creep")
    ax[1].plot(t, ep["ground_truth/settle_state"] * MM, label="termination settling")
    ax[1].set_ylabel("mm")
    ax[1].legend(fontsize=8)
    ax[2].plot(t, ep["ground_truth/degradation_state"], label="degradation d")
    ax[2].plot(t, ep["ground_truth/dissipated_energy"], label="dissipated energy [J]")
    ax[2].set_xlabel("time [s]")
    ax[2].legend(fontsize=8)
    ax[0].set_title("Hidden transmission states (ground truth, privileged)")
    return _save(fig, out, "07_hidden_states.png")


def fig_motor_only(ep: dict, out: str) -> str:
    t = ep["time"]
    fig, ax = plt.subplots(3, 1, figsize=(8, 6), sharex=True)
    ax[0].plot(t, ep["motor/position"], label="q_m [rad]")
    ax[0].plot(t, ep["motor/velocity"] / 10, label="q̇_m / 10 [rad/s]")
    ax[0].legend(fontsize=8)
    ax[1].plot(t, ep["motor/current"], label="i_m [A]")
    ax[1].plot(t, ep["motor/applied_command"], "--", lw=0.8, label="u_m [A]")
    ax[1].legend(fontsize=8)
    ax[2].plot(t, ep["simulation/joint_positions"][:, 0], label="q1 (hidden)")
    ax[2].plot(t, ep["simulation/joint_positions"][:, 1], label="q2 (hidden)")
    ax[2].plot(t, ep["simulation/contact_force"] / 10, color="tab:green", lw=0.8, label="contact force / 10 [N] (hidden)")
    ax[2].set_xlabel("time [s]")
    ax[2].legend(fontsize=8)
    ax[0].set_title("Motor-only observation vs hidden finger state")
    return _save(fig, out, "08_motor_only_vs_hidden.png")


ALL_FIGURES = [fig_configuration, fig_displacements, fig_tensions, fig_tension_vs_elongation, fig_hysteresis, fig_tension_ratio, fig_hidden_states, fig_motor_only]


def analyse(path: str, out: str, episode: str | None = None) -> list[str]:
    ep = load_episode(path, episode)
    return [f(ep, out) for f in ALL_FIGURES]


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset")
    ap.add_argument("--out", required=True)
    ap.add_argument("--episode", default=None)
    a = ap.parse_args(argv)
    eps = list_episodes(a.dataset)
    print("episodes:", eps)
    for p in analyse(a.dataset, a.out, a.episode):
        print("wrote", p)


if __name__ == "__main__":
    main()
