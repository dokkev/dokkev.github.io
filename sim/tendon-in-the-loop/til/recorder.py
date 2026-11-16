"""Chunked HDF5 recorder with separate namespaces for motor-only, privileged and ground-truth channels.

File layout::

    /                         attrs: schema, created, versions, motor_only_channels, coupling notes
    /episodes/<episode_id>/   attrs: config (JSON), scenario_id, seed, cable_specimen_id, units (JSON)
        time, cycle_count
        motor/..., emulator/..., transmission/..., simulation/..., ground_truth/...

Every dataset is resizable and written in chunks, so long runs never hold the whole episode in memory.
"""

from __future__ import annotations

import json
import platform
import sys
import time
from typing import Any

import h5py
import numpy as np

from .coupling import CHANNEL_UNITS, MOTOR_ONLY_CHANNELS

PHASE2_UNITS = {
    "ground_truth/friction_state": "rad (presliding spring deflection)",
    "ground_truth/effective_friction": "1 (sliding guide friction coefficient)",
}


def episode_units(config):
    units=dict(CHANNEL_UNITS)
    if config.get("transmission") is not None:units.update(PHASE2_UNITS)
    return units


def normalize_episode_units(file):
    """Clarify plant-dependent units after merging; never change signal values."""
    has_phase2=False
    for group in file["episodes"].values():
        config=json.loads(group.attrs["config"]);units=episode_units(config)
        group.attrs["units"]=json.dumps(units)
        if config.get("transmission") is not None:
            has_phase2=True
            for key,unit in PHASE2_UNITS.items():
                if key in group:group[key].attrs["units"]=unit
    if has_phase2:
        root_units=dict(CHANNEL_UNITS)
        for key in PHASE2_UNITS:root_units[key]="plant-dependent; see episode/dataset units"
        file.attrs["units"]=json.dumps(root_units)

COUPLING_NOTES = (
    "Causal coupling: the distal tension applied in MuJoCo step k is the plant output at the end of step k, "
    "driven by the finger configuration at the start of step k (one MuJoCo step of lag), plus the configured "
    "tension_delay. The emulation motor tracks l(q)-l(q0) with its own servo dynamics; commanded and actual "
    "positions are both recorded. Time stamps are synchronous across channels at log_dt."
)


def _versions() -> dict[str, str]:
    import mujoco

    return {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "mujoco": mujoco.__version__,
        "numpy": np.__version__,
        "h5py": h5py.__version__,
    }


class EpisodeWriter:
    """Appends records of one episode; flushes to disk every ``chunk`` rows."""

    def __init__(self, group: h5py.Group, chunk: int = 2000):
        self.g = group
        self.units=json.loads(group.attrs.get("units",json.dumps(CHANNEL_UNITS)))
        self.chunk = chunk
        self._buf: dict[str, list] = {}
        self._ds: dict[str, h5py.Dataset] = {}
        self.n = 0

    def append(self, time_s: float, cycle_count: float, rec: dict[str, dict[str, Any]]) -> None:
        self._put("time", time_s)
        self._put("cycle_count", cycle_count)
        for ns, channels in rec.items():
            for name, value in channels.items():
                self._put(f"{ns}/{name}", value)
        self.n += 1
        if self.n % self.chunk == 0:
            self.flush()

    def _put(self, key: str, value: Any) -> None:
        self._buf.setdefault(key, []).append(np.asarray(value, dtype=np.float64))

    def flush(self) -> None:
        for key, rows in self._buf.items():
            if not rows:
                continue
            arr = np.stack(rows)
            if key not in self._ds:
                shape = arr.shape[1:]
                ds = self.g.create_dataset(key, shape=(0, *shape), maxshape=(None, *shape), chunks=(self.chunk, *shape), dtype=np.float64, compression="gzip", compression_opts=4)
                ds.attrs["units"] = self.units.get(key, "")
                self._ds[key] = ds
            ds = self._ds[key]
            ds.resize(ds.shape[0] + arr.shape[0], axis=0)
            ds[-arr.shape[0] :] = arr
            rows.clear()

    def close(self, extra_attrs: dict[str, Any] | None = None) -> None:
        self.flush()
        self.g.attrs["n_samples"] = self.n
        for k, v in (extra_attrs or {}).items():
            self.g.attrs[k] = v


class DatasetFile:
    def __init__(self, path: str, mode: str = "w"):
        self.f = h5py.File(path, mode)
        if mode == "w":
            self.f.attrs["schema"] = "tendon-in-the-loop/sil/v3"
            self.f.attrs["created"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            self.f.attrs["versions"] = json.dumps(_versions())
            self.f.attrs["motor_only_channels"] = json.dumps(MOTOR_ONLY_CHANNELS)
            self.f.attrs["coupling_notes"] = COUPLING_NOTES
            self.f.attrs["units"] = json.dumps(CHANNEL_UNITS)
            self.f.require_group("episodes")

    def episode(self, episode_id: str, config: dict, chunk: int = 2000) -> EpisodeWriter:
        g = self.f["episodes"].create_group(episode_id)
        g.attrs["config"] = json.dumps(config, default=str)
        g.attrs["units"]=json.dumps(episode_units(config))
        for k in ("scenario_id", "seed", "cable_specimen_id", "cable_preset"):
            if k in config:
                g.attrs[k] = config[k]
        return EpisodeWriter(g, chunk=chunk)

    def close(self) -> None:
        self.f.close()


# ---------------------------------------------------------------------------------------------- readers
def list_episodes(path: str) -> list[str]:
    with h5py.File(path, "r") as f:
        return list(f["episodes"].keys())


def load_episode(path: str, episode_id: str | None = None) -> dict[str, np.ndarray]:
    """Load every channel of one episode (privileged + motor-only) as ``{channel: array}``."""
    out: dict[str, np.ndarray] = {}
    with h5py.File(path, "r") as f:
        eps = f["episodes"]
        g = eps[episode_id or list(eps.keys())[0]]
        out["_config"] = json.loads(g.attrs["config"])  # type: ignore[assignment]
        g.visititems(lambda name, obj: out.__setitem__(name, obj[()]) if isinstance(obj, h5py.Dataset) else None)
    return out


def load_motor_only(path: str, episode_id: str | None = None) -> dict[str, np.ndarray]:
    """The observation a motor-only estimator may use: ``time`` plus the ``motor/`` channels, nothing else."""
    with h5py.File(path, "r") as f:
        allowed = json.loads(f.attrs["motor_only_channels"])
        eps = f["episodes"]
        g = eps[episode_id or list(eps.keys())[0]]
        return {"time": g["time"][()], **{k: g[k][()] for k in allowed}}
