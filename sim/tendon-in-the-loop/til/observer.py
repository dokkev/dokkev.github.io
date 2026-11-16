"""Causal motor-only recurrent observer. Privileged channels are labels only."""
import json

import h5py
import numpy as np
import torch
from torch import nn

from .coupling import MOTOR_ONLY_CHANNELS

TARGETS = ["ground_truth/output_tension_true", "transmission/apparent_elongation"]


class Observer(nn.Module):
    def __init__(self, hidden=32):
        super().__init__()
        self.gru = nn.GRU(4, hidden, batch_first=True)
        self.head = nn.Linear(hidden, 2)

    def forward(self, x, hidden=None):
        state, hidden = self.gru(x, hidden)
        return self.head(state), hidden


def load_runs(path, stride=5):
    """Read a strict input whitelist, downsample to 200 Hz, retain complete-run split IDs."""
    runs = []
    with h5py.File(path) as f:
        for name, group in f["episodes"].items():
            if "failed" in group.attrs:
                raise ValueError(f"failed run cannot enter the dataset: {name}")
            cfg = json.loads(group.attrs["config"])
            time = group["time"][::stride]
            x = np.column_stack([group[k][::stride] for k in MOTOR_ONLY_CHANNELS]).astype(np.float32)
            y = np.column_stack([group[k][::stride] for k in TARGETS]).astype(np.float32)
            if not np.isfinite(x).all() or not np.isfinite(y).all():
                raise ValueError(f"non-finite observer data: {name}")
            runs.append(dict(id=name, split=cfg["scenario_id"], config=cfg, time=time, x=x, y=y))
    return runs


def fit_scaler(runs):
    training = [r for r in runs if r["split"] == "train"]
    if not training:
        raise ValueError("training runs are required")
    x = np.concatenate([r["x"] for r in training])
    y = np.concatenate([r["y"] for r in training])
    return dict(x_mean=x.mean(0), x_std=np.maximum(x.std(0), 1e-6),
                y_mean=y.mean(0), y_std=np.maximum(y.std(0), 1e-6))


def windows(runs, scaler, length=128, stride=64):
    """Windows never cross run boundaries. Only training runs may enter the optimizer."""
    xs, ys = [], []
    for run in runs:
        if run["split"] != "train":
            continue
        for start in range(0, len(run["x"]) - length + 1, stride):
            xs.append((run["x"][start:start + length] - scaler["x_mean"]) / scaler["x_std"])
            ys.append((run["y"][start:start + length] - scaler["y_mean"]) / scaler["y_std"])
    if not xs:
        raise ValueError("no complete training windows")
    return torch.tensor(np.stack(xs)), torch.tensor(np.stack(ys))


def predict(model, run, scaler):
    """One causal pass, resetting memory at the beginning of each independent run."""
    model.eval()
    with torch.no_grad():
        x = torch.tensor((run["x"] - scaler["x_mean"]) / scaler["x_std"])[None]
        output, _ = model(x)
    y = output[0].numpy() * scaler["y_std"] + scaler["y_mean"]
    y[:, 0] = np.maximum(y[:, 0], 0)
    return y


def motor_tension(run, dynamic=False):
    """Calibrated actuator model only; no distal measurements or cable truth enter inference."""
    from .scenarios import EpisodeConfig, MotorProfile
    cfg = dict(run["config"])
    cfg["profile"] = MotorProfile(**cfg["profile"])
    p = EpisodeConfig(**cfg).sim_config().motor
    _, velocity, current, _ = run["x"].T
    torque = p.K_t * current
    if dynamic:
        acceleration = np.r_[0., np.diff(velocity) / np.diff(run["time"])]
        torque = torque - p.J_m * acceleration - p.b_m * velocity - p.tau_c_m * np.tanh(velocity / p.v_eps)
    return np.maximum(torque / p.r_drum, 0)


def baseline_predictions(runs):
    """Linear compliance is calibrated on training labels; effective fit, not material stiffness."""
    predictions, calibration = {}, {}
    for name, dynamic in (("QDD torque", False), ("QDD dynamics + linear compliance", True)):
        train = [r for r in runs if r["split"] == "train"]
        tension = np.concatenate([motor_tension(r, dynamic) for r in train])
        deformation = np.concatenate([r["y"][:, 1] for r in train])
        coeff = np.linalg.lstsq(np.column_stack((tension, np.ones_like(tension))), deformation, rcond=None)[0]
        calibration[name] = coeff.tolist()
        predictions[name] = {}
        for run in runs:
            tension = motor_tension(run, dynamic)
            predictions[name][run["id"]] = np.column_stack((tension, coeff[0] * tension + coeff[1]))
    return predictions, calibration


def metrics(truth, prediction):
    error = (prediction - truth) * np.array([1., 1000.])
    return {"tension_mae_N": float(np.abs(error[:, 0]).mean()),
            "tension_rmse_N": float(np.sqrt((error[:, 0]**2).mean())),
            "deformation_mae_mm": float(np.abs(error[:, 1]).mean()),
            "deformation_rmse_mm": float(np.sqrt((error[:, 1]**2).mean()))}
