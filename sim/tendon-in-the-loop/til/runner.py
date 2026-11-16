"""Experiment runner: executes episode configurations and streams them into an HDF5 dataset.

Usage::

    python -m til.runner smoke --out data/smoke.h5
    python -m til.runner contact_sweep --out data/contact.h5 --cycles 4 --seeds 0 1
    python -m til.runner long_horizon --out data/long.h5 --cycles 500 --preset drift
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np

from .coupling import TiLSimulator
from .recorder import DatasetFile
from .scenarios import EpisodeConfig, MODES


class SimulationFailure(RuntimeError):
    pass


def run_episode(ep: EpisodeConfig, writer=None, progress: bool = False) -> dict:
    """Run one episode. Returns a summary; raises :class:`SimulationFailure` on non-finite states."""
    cfg = ep.sim_config()
    sim = TiLSimulator(cfg)
    sim.reset(ep.q0)
    prof = ep.profile
    r = cfg.motor.r_drum
    n_steps = int(round(prof.duration / sim.mj_dt))
    t0 = time.time()
    peak_T = 0.0
    contact_steps = 0
    rec = None
    for k in range(n_steps):
        t = sim.t
        x_ref = prof.x_ref(t)
        xd_ref = (prof.x_ref(t + 1e-4) - prof.x_ref(t - 1e-4)) / 2e-4
        sim.step(x_ref / r, xd_ref / r)
        if sim.log_due:
            rec = sim.record()
            T1, T2 = rec["ground_truth"]["input_tension_true"], rec["ground_truth"]["output_tension_true"]
            q = rec["simulation"]["joint_positions"]
            if not (np.isfinite(T1) and np.isfinite(T2) and np.all(np.isfinite(q))):
                raise SimulationFailure(f"non-finite state at t={sim.t:.4f}s in {ep.episode_id}: T=({T1},{T2}), q={q}")
            peak_T = max(peak_T, T1, T2)
            contact_steps += int(rec["simulation"]["contact_state"])
            if writer is not None:
                writer.append(sim.t, prof.cycle_count(sim.t), rec)
        if progress and k % int(5.0 / sim.mj_dt) == 0 and k:
            print(f"  {ep.episode_id}: t={sim.t:.1f}/{prof.duration:.1f}s  cycles={prof.cycle_count(sim.t):.1f}  peak T={peak_T:.1f} N", flush=True)
    summary = {
        "episode_id": ep.episode_id,
        "duration_s": prof.duration,
        "n_cycles": prof.n_cycles,
        "peak_tension_N": float(peak_T),
        "contact_fraction": contact_steps / max(1, n_steps // sim.log_every),
        "final_degradation": float(sim.plant.s.d),
        "final_creep_m": float(sim.plant.s.creep),
        "final_settle_m": float(sim.plant.s.settle),
        "wall_time_s": time.time() - t0,
    }
    if writer is not None:
        writer.close({"summary": json.dumps(summary)})
    return summary


def run_experiment(episodes: list[EpisodeConfig], out: str, progress: bool = True) -> list[dict]:
    ds = DatasetFile(out, "w")
    summaries = []
    try:
        for ep in episodes:
            if progress:
                print(f"[{len(summaries) + 1}/{len(episodes)}] {ep.episode_id}", flush=True)
            w = ds.episode(ep.episode_id, ep.to_dict())
            try:
                s = run_episode(ep, w, progress=progress)
            except SimulationFailure as e:
                w.close({"failed": str(e)})
                s = {"episode_id": ep.episode_id, "failed": str(e)}
                print(f"  FAILED: {e}", flush=True)
            summaries.append(s)
        ds.f.attrs["summaries"] = json.dumps(summaries)
    finally:
        ds.close()
    return summaries


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Tendon-in-the-Loop SIL experiment runner")
    ap.add_argument("mode", choices=sorted(MODES))
    ap.add_argument("--out", required=True)
    ap.add_argument("--seeds", type=int, nargs="+", default=[0])
    ap.add_argument("--cycles", type=int, default=None, help="loading cycles per episode")
    ap.add_argument("--preset", default=None, help="cable preset: rigid, linear, nonlinear, drift")
    ap.add_argument("--period", type=float, default=None, help="cycle period (s); long_horizon only")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    kw = {"seeds": a.seeds}
    if a.cycles is not None:
        kw["n_cycles"] = a.cycles
    if a.preset is not None:
        kw["preset"] = a.preset
    if a.period is not None and a.mode == "long_horizon":
        kw["period"] = a.period
    episodes = MODES[a.mode](**kw)
    summaries = run_experiment(episodes, a.out, progress=not a.quiet)
    print(json.dumps(summaries, indent=1))


if __name__ == "__main__":
    main()
