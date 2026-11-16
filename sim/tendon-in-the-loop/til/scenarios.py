"""Experiment definitions: motor command profiles, episode configurations and the three experiment modes.

The single flexor tendon is the only actuated input. The finger approaches, presses, holds and releases an
object because the input motor reels cable in and pays it out along a smooth profile; different contact
locations, object stiffnesses and initial configurations come from the finger/object parameters and the
initial joint angles, not from prescribed joint trajectories.
"""

from __future__ import annotations

import copy
import itertools
import json
from pathlib import Path
from dataclasses import dataclass, field, asdict, replace

import numpy as np

from .cable import CableParams, PRESETS
from .coupling import SimConfig
from .finger import FingerParams
from .motors import QDDMotorParams, EmulationMotorParams


@dataclass
class MotorProfile:
    """Cable reel-in reference ``x_ref(t)`` (m): cosine ramp in, hold, cosine ramp out, rest; repeated."""

    amplitude: float = 0.016  # m of cable reeled in at the peak
    period: float = 2.0  # s per cycle
    n_cycles: int = 3
    ramp_frac: float = 0.3
    hold_frac: float = 0.3
    release_frac: float = 0.3  # rest = remainder
    settle_time: float = 0.3  # s at rest before the first cycle

    def __post_init__(self):
        if not all(np.isfinite(v) for v in asdict(self).values()):
            raise ValueError("profile values must be finite")
        if self.period <= 0 or self.n_cycles < 1 or int(self.n_cycles) != self.n_cycles:
            raise ValueError("period must be positive and n_cycles a positive integer")
        if self.amplitude < 0 or self.settle_time < 0 or min(self.ramp_frac, self.release_frac) <= 0 or self.hold_frac < 0:
            raise ValueError("invalid amplitude, settling time or phase fractions")
        if self.ramp_frac + self.hold_frac + self.release_frac > 1 + 1e-12:
            raise ValueError("profile phase fractions must sum to at most one")

    @property
    def duration(self) -> float:
        return self.settle_time + self.period * self.n_cycles

    def x_ref(self, t: float) -> float:
        if t < self.settle_time:
            return 0.0
        tc = (t - self.settle_time) % self.period / self.period
        A = self.amplitude
        if tc < self.ramp_frac:
            return A * 0.5 * (1 - np.cos(np.pi * tc / self.ramp_frac))
        tc -= self.ramp_frac
        if tc < self.hold_frac:
            return A
        tc -= self.hold_frac
        if tc < self.release_frac:
            return A * 0.5 * (1 + np.cos(np.pi * tc / self.release_frac))
        return 0.0

    def cycle_count(self, t: float) -> float:
        return max(0.0, (t - self.settle_time) / self.period)


@dataclass
class EpisodeConfig:
    scenario_id: str
    episode_id: str
    seed: int = 0
    cable_preset: str = "linear"
    cable_specimen_id: str = "synthetic-01"
    q0: tuple[float, float] = (0.0, 0.0)
    obj_x: float = 0.055
    obj_z: float = -0.030
    k_obj: float = 2000.0
    pretension: float = 10.0
    profile: MotorProfile = field(default_factory=MotorProfile)
    sim_overrides: dict = field(default_factory=dict)  # nested dicts: {"emulator": {...}, "motor": {...}, "sensors": {...}, "cable": {...}, "timing": {...}}

    def to_dict(self) -> dict:
        return asdict(self)

    def sim_config(self) -> SimConfig:
        unknown = set(self.sim_overrides) - {"finger", "cable", "motor", "emulator", "sensors", "timing"}
        if unknown:
            raise ValueError(f"unknown simulation namespaces: {sorted(unknown)}")
        cable = replace(PRESETS[self.cable_preset], **{"pretension": self.pretension, **self.sim_overrides.get("cable", {})})
        finger = FingerParams(**{"obj_x": self.obj_x, "obj_z": self.obj_z, "k_obj": self.k_obj, **self.sim_overrides.get("finger", {})})
        cfg = SimConfig(finger=finger, cable=cable, seed=self.seed)
        for ns in ("motor", "emulator", "sensors", "timing"):
            if ns in self.sim_overrides:
                setattr(cfg, ns, replace(getattr(cfg, ns), **self.sim_overrides[ns]))
        return cfg


# ---------------------------------------------------------------------------------------------- modes
def smoke(seeds: list[int] = (0,), n_cycles: int = 3, preset: str = "linear") -> list[EpisodeConfig]:
    return [EpisodeConfig("smoke", f"smoke_s{s}", seed=s, cable_preset=preset, profile=MotorProfile(n_cycles=n_cycles)) for s in seeds]


def contact_sweep(
    seeds: list[int] = (0,),
    n_cycles: int = 4,
    preset: str = "nonlinear",
    obj_x: list[float] = (0.045, 0.055, 0.065),
    k_obj: list[float] = (500.0, 2000.0, 8000.0),
    q0: list[tuple[float, float]] = ((0.0, 0.0), (0.2, 0.3)),
    pretension: list[float] = (10.0,),
) -> list[EpisodeConfig]:
    eps = []
    for s, x, k, q, T0 in itertools.product(seeds, obj_x, k_obj, q0, pretension):
        eid = f"contact_x{x * 1000:.0f}_k{k:.0f}_q{q[0]:.1f}-{q[1]:.1f}_T{T0:.0f}_s{s}"
        eps.append(EpisodeConfig("contact_sweep", eid, seed=s, cable_preset=preset, q0=q, obj_x=x, k_obj=k, pretension=T0, profile=MotorProfile(n_cycles=n_cycles)))
    return eps


def long_horizon(seeds: list[int] = (0,), n_cycles: int = 200, period: float = 1.5, preset: str = "drift") -> list[EpisodeConfig]:
    return [
        EpisodeConfig("long_horizon", f"long_{preset}_c{n_cycles}_s{s}", seed=s, cable_preset=preset, cable_specimen_id=f"synthetic-{preset}", profile=MotorProfile(n_cycles=n_cycles, period=period))
        for s in seeds
    ]


MODES = {"smoke": smoke, "contact_sweep": contact_sweep, "long_horizon": long_horizon}


def load_manifest(path: str) -> list[EpisodeConfig]:
    """Explicit episodes with shared defaults; nested namespaces merge without mutating presets."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if set(doc) - {"defaults", "episodes"} or not doc.get("episodes"):
        raise ValueError("manifest requires nonempty episodes and optional defaults")
    episodes = []
    for row in doc["episodes"]:
        values = {**doc.get("defaults", {}), **row}
        for key in ("profile", "sim_overrides"):
            base = copy.deepcopy(doc.get("defaults", {}).get(key, {}))
            for name, value in row.get(key, {}).items():
                base[name] = {**base.get(name, {}), **value} if key == "sim_overrides" else value
            values[key] = MotorProfile(**base) if key == "profile" else base
        ep = EpisodeConfig(**values)
        if "/" in ep.episode_id or not ep.episode_id or any(ep.episode_id == e.episode_id for e in episodes):
            raise ValueError("episode IDs must be nonempty, unique and contain no slash")
        ep.sim_config()  # reject unknown parameter names before opening the output file
        episodes.append(ep)
    return episodes
