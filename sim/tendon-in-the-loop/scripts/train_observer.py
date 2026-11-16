"""Train and evaluate the first synthetic-data GRU observer; never tune on test runs."""
import argparse
import copy
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from til.observer import Observer, load_runs, fit_scaler, windows, predict, baseline_predictions, metrics, TARGETS
from til.coupling import MOTOR_ONLY_CHANNELS


def train(runs, seed, epochs, hidden=32):
    torch.manual_seed(seed)
    np.random.seed(seed)
    torch.set_num_threads(2)
    torch.use_deterministic_algorithms(True)
    scaler = fit_scaler(runs)
    x, y = windows(runs, scaler)
    model = Observer(hidden=hidden, outputs=y.shape[-1])
    optimizer = torch.optim.Adam(model.parameters(), lr=.003)
    loader = DataLoader(TensorDataset(x, y), batch_size=32, shuffle=True,
                        generator=torch.Generator().manual_seed(seed))
    best, selected, history, checkpoint = float("inf"), 0, [], None
    validation = [r for r in runs if r["split"] == "validation"]
    if not validation:
        raise ValueError("validation runs are required for checkpoint selection")
    for epoch in range(epochs):
        model.train()
        losses = []
        for xb, yb in loader:
            output, _ = model(xb)
            # Burn-in lets each independent training window build its causal memory.
            loss = torch.mean((output[:, 32:] - yb[:, 32:])**2)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
            losses.append(loss.item())
        score = float(np.mean([np.mean(((predict(model, r, scaler) - r["y"]) / scaler["y_std"])**2)
                               for r in validation]))
        history.append(dict(epoch=epoch + 1, train_loss=float(np.mean(losses)), validation_loss=score))
        if score < best:
            best, selected, checkpoint = score, epoch + 1, copy.deepcopy(model.state_dict())
        if epoch % 10 == 0 or epoch == epochs - 1:
            print(f"epoch {epoch+1}: train={np.mean(losses):.5f} validation={score:.5f}", flush=True)
    model.load_state_dict(checkpoint)
    return model, scaler, history, selected, len(x)


def plot(runs, predictions, history, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    matplotlib.rcParams.update({"svg.fonttype": "none", "svg.hashsalt": "til-observer-v1", "font.size": 10})
    fig, axes = plt.subplots(3, 2, figsize=(11, 9), layout="constrained")
    colors = {"QDD torque": "#b28b63", "QDD dynamics + linear compliance": "#6a8fa0", "GRU": "#b7473b"}
    for row, split in enumerate(("test_contact", "test_law", "test_drift")):
        run = next(r for r in runs if r["split"] == split)
        t = run["time"]
        for col, unit in enumerate(("Distal tension [N]", "Apparent deformation [mm]")):
            ax = axes[row, col]
            scale = 1 if col == 0 else 1000
            ax.plot(t, run["y"][:, col] * scale, color="#202b35", lw=1.6, label="Reference")
            for name, values in predictions.items():
                ax.plot(t, values[run["id"]][:, col] * scale, color=colors[name], lw=.9, alpha=.85, label=name)
            ax.set(xlabel="Time [s]", ylabel=unit, title=f"{split.replace('_', ' ')} / {run['id']}")
            ax.grid(alpha=.2)
    axes[0, 0].legend(fontsize=8)
    fig.savefig(path, metadata={"Date": None})
    preview = ROOT / "figures/observer/verification.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(preview, dpi=130)
    plt.close(fig)
    p = Path(path)
    p.write_text("\n".join(line.rstrip() for line in p.read_text(encoding="utf8").splitlines()) + "\n", encoding="utf8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--out", default="figures/observer")
    ap.add_argument("--report", required=True)
    ap.add_argument("--plot", required=True)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    runs = load_runs(a.dataset)
    model, scaler, history, selected, n_windows = train(runs, a.seed, a.epochs)
    predictions, calibration = baseline_predictions(runs)
    predictions["GRU"] = {r["id"]: predict(model, r, scaler) for r in runs}
    per_run, aggregate = {}, {}
    for run in runs:
        per_run[run["id"]] = {name: metrics(run["y"], values[run["id"]]) for name, values in predictions.items()}
    for split in sorted({r["split"] for r in runs}):
        ids = [r["id"] for r in runs if r["split"] == split]
        aggregate[split] = {name: {metric: float(np.mean([per_run[i][name][metric] for i in ids]))
                                 for metric in next(iter(per_run.values()))[name]} for name in predictions}
    import h5py
    import mujoco
    files = sorted([*ROOT.glob("til/*.py"), ROOT / "scripts/observer_dataset.py", Path(__file__), ROOT / "tests/test_observer.py"])
    report = dict(
        scope="Single-seed synthetic-data pilot; no hardware or mechanics-parameter recovery claim.",
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
        versions=dict(python=sys.version.split()[0], torch=torch.__version__, numpy=np.__version__, h5py=h5py.__version__, mujoco=mujoco.__version__),
        input_channels=MOTOR_ONLY_CHANNELS, targets=TARGETS, sample_period_s=float(runs[0]["time"][1] - runs[0]["time"][0]),
        training=dict(seed=a.seed, epochs=a.epochs, selected_epoch=selected, hidden_size=32, window_samples=128,
                      burn_in_samples=32, stride_samples=64, batch_size=32, learning_rate=.003,
                      training_windows=n_windows, selection="validation normalized MSE, equal weight per run and output"),
        normalization={k: v.tolist() for k, v in scaler.items()}, baseline_compliance_fits=calibration,
        splits={split: [r["id"] for r in runs if r["split"] == split] for split in aggregate},
        configurations={r["id"]: r["config"] for r in runs}, history=history,
        metrics_macro_by_run=aggregate, metrics_per_run=per_run,
        dataset_sha256=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest(),
        source_sha256={str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest() for p in files},
        caveats=["Training and test windows never share a run; normalization and compliance fits use training runs only.",
                 "Checkpoint selection reads validation runs only. Test runs are evaluated after model selection.",
                 "Inference resets recurrent memory at each run and uses only present/past motor observations.",
                 "Test-contact conditions are withheld. Law-shift and accelerated-drift tests are separate stress sets.",
                 "Deformation reference includes encoder/emulator sensor-model effects; it is not pure cable strain.",
                 "Actuator constants are assumed calibrated for both baselines; cable mechanics are not oracle inputs.",
                 "One training seed and three runs per test set do not establish broad generalization.",
                 "Explicit evolving-mechanics estimation, uncertainty calibration and hardware transfer remain untested."])
    for path in (a.report, a.plot):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).mkdir(parents=True, exist_ok=True)
    torch.save(dict(state_dict=model.state_dict(), scaler={k: v.tolist() for k, v in scaler.items()}, selected_epoch=selected), Path(a.out) / "observer.pt")
    Path(a.report).write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf8")
    plot(runs, predictions, history, a.plot)
    print(json.dumps(dict(selected_epoch=selected, metrics=aggregate), indent=2))


if __name__ == "__main__":
    main()
