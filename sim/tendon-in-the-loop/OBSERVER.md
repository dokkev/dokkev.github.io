# Synthetic Data Verification: initial motor-only observer

This pilot trains a causal GRU on the numerical TiL testbed before physical HIL implementation.
It estimates distal tension and apparent deformation. Stiffness/friction recovery, uncertainty and
hardware transfer are not evaluated. Coupling verification is documented separately in `RESULTS.md`.

## Reproduce

From this directory, install the optional observer dependency into the local environment. The executed
environment used Python 3.13.5, PyTorch 2.15.0+cpu, MuJoCo 4.0.1 and NumPy 2.5.5.

```powershell
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements-observer.txt
.\.venv\Scripts\python.exe scripts/observer_dataset.py --out data/observer-verification.h5
.\.venv\Scripts\python.exe scripts/train_observer.py --dataset data/observer-verification.h5 --out figures/observer --epochs 60 --seed 0 --report ../../public/assets/data/tendon-in-the-loop/observer-verification.json --plot ../../public/assets/img/tendon-in-the-loop/observer-verification.svg
.\.venv\Scripts\python.exe -m pytest -q
```

The JSON records versions, source hashes (CRLF normalized to LF), dataset hash, complete episode
configurations, normalization, baseline fits, splits, training history and per-run errors. Exact
floating-point reproducibility across hardware or library versions is not assumed. HDF5 data,
checkpoint (`figures/observer/observer.pt`) and PNG preview remain local and are ignored by Git.

## Protocol

- 12 training runs: nonlinear cable, three contact conditions and four excitation/pretension settings.
- 3 validation runs: intermediate contact and excitation settings; checkpoint selection only.
- 3 contact test runs: withheld object placement/stiffness combinations.
- 3 changed-law test runs: Coulomb instead of Dahl friction, changed friction level and cubic stiffness.
- 3 drift test runs: 20 cycles each with accelerated creep and degradation, absent from training.

The split is defined before training in `scripts/observer_dataset.py`. Each run is an independent
simulation. Samples are taken at 200 Hz from the 1 kHz records without smoothing. This downsampling
is part of the numerical setup, not a hardware antialiasing validation.

Only `motor/position`, `motor/velocity`, `motor/current`, and `motor/applied_command` enter the GRU.
Labels are `ground_truth/output_tension_true` and `transmission/apparent_elongation`. The latter includes
emulator sensing effects and is not pure cable strain. Emulator state, contact, configuration and cable
parameters never enter the GRU. Baselines assume calibrated actuator constants.

A single-layer GRU with 32 hidden units and a linear two-output head is trained with Adam (0.003),
batch size 32, gradient norm clipped at 1, and normalized two-output MSE. Windows have 128 samples
(0.64 s), stride 64 and 32 samples of burn-in excluded from the training loss. Windows never cross a
run boundary. Normalization uses training samples only. Validation uses complete causal sequences to
select the epoch. Test sequences begin with zero hidden state; no initialization samples are dropped.
Predicted tension is clipped at zero for all models. The first experiment uses seed 0 and a fixed
budget of 60 epochs; test errors are read after checkpoint selection.

The QDD baseline uses `max(K_t * current / r_drum, 0)`. The dynamics-corrected baseline subtracts
rotor inertia, viscous and motor Coulomb losses; acceleration uses a backward difference with zero at
the first sample. Each baseline fits deformation as an affine function of its tension estimate using
training labels only. This is a fitted effective compliance, not a calibrated nonlinear cable model.

## Executed result

Validation selected epoch 57. Errors are equal-weight means of per-run MAE, with three runs in each
test set. Full per-run MAE/RMSE and the uncorrected QDD baseline are in the exported JSON.

| Test | Dynamics + compliance tension [N] | GRU tension [N] | Dynamics + compliance deformation [mm] | GRU deformation [mm] |
|---|---|---|---|---|
| Contact | 0.790 | 0.423 | 0.189 | 0.040 |
| Changed law | 0.702 | 0.467 | 0.348 | 0.261 |
| Drift | 0.835 | 0.439 | 0.154 | 0.089 |

These runs support distal-state estimation in the tested numerical conditions. Deformation error grows
under law shift and drift; improvement over these baselines does not establish unique mechanics
identification. Test runs have related tasks and share the same robot/contact engine. Additional
seeds, broader independent plants and hardware measurements are needed before generalizing.

The current full suite passes 40 tests, including checks that held-out targets cannot influence scaling
or training windows, future inputs cannot alter past GRU outputs, and streaming and full-run inference
agree.
