# Initial numerical verification

Executed with Python 3.13.5, MuJoCo 4.0.1, NumPy 2.5.5 and h5py 3.16.0.
These are numerical prototype results, not physical HIL measurements, material-property measurements,
system-identification accuracy, or neural-observer performance. These coupling runs did not train a
learned model or observer. A subsequent synthetic-data observer pilot is documented in [OBSERVER.md](OBSERVER.md).

## Reproduce

From this directory, using an environment with the recorded dependencies:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe scripts/baselines.py --out figures/project-review/baselines --cycles 3
.\.venv\Scripts\python.exe scripts/robustness.py --out figures/project-review/robustness.md
.\.venv\Scripts\python.exe -m til.runner long_horizon --out data/project-review-long.h5 --cycles 50 --period 1.5 --preset drift --quiet
.\.venv\Scripts\python.exe -m til.runner --config experiments/routing-contact.json --out data/routing-contact.h5 --plots figures/routing-contact --quiet
.\.venv\Scripts\python.exe scripts/project_report.py --baselines figures/project-review/baselines/baselines.h5 --robustness figures/project-review/robustness.md --drift data/project-review-long.h5 --routing data/routing-contact.h5 --out ../../public/assets/data/tendon-in-the-loop/verification.json --plot ../../public/assets/img/tendon-in-the-loop/verification-sensitivity.svg
```

The exported JSON records source-file SHA-256 hashes, versions and episode configurations.
Raw HDF5 files and intermediate plots remain local and can be regenerated. Per-run wall-clock time is
excluded from the mechanical comparison. `requirements-verified.txt` captures the environment used.

## Observations

- **Mechanical/coupling tests:** 38 passed. These check the cases and numerical tolerances defined in
  `tests/`, not hardware acceptance specifications.
- **Five three-cycle presets:** all completed. The nonlinear baseline had emulator RMSE **0.044432 mm**
  and fundamental phase lag **0.126879 deg** at the **0.5 Hz** cycle fundamental. This is not a measured
  broadband bandwidth. The near-rigid ideal-emulator case reached **407.736 N** peak tension; finite
  states alone are not a safe-operation or stability certificate.
- **26 sensitivity cases:** none triggered the script's numerical abort. Added latency **0 / 2 / 10 /
  30 ms** gave peak emulator tracking error **0.814 / 1.544 / 10.791 / 14.534 mm**. The 10 and 30 ms cases,
  and the 0.02 m/s emulator velocity limit, triggered the script's oscillation warning. The 5 mm warning
  threshold is diagnostic, not an engineering acceptance limit.
- **Contact failure:** current limits **1 and 2 A** produced **zero recorded contact**, despite completing
  numerically. Low tracking error does not establish successful contact loading.
- **Drift-law exercise:** **50 cycles / 75.3 s** with the `drift` preset. Recorded segment stiffness changed
  from approximately **10,000 to 8,309.136 N/m**, and creep state reached **0.087409 mm**. These are the
  implemented, accelerated constitutive states; they are not material measurements or estimated parameters.
- **Restricted energy check:** a taut viscous plant driven for **2 s at 3 Hz** had port-work accounting
  residual **1.193024e-7 J** (**0.065355%** relative to port work). This does not validate energy balance
  for every nonlinear drift or degradation law.

## Routing/contact experiment

The four manifest episodes completed three loading cycles each with 15 or 25 mm pulley radii,
8 or 12 N pretension, and 0.002 or 0.006 N m nominal friction levels. Contact occupied
57.44%, 57.44%, 42.98%, and 37.04% of recorded samples, respectively. Eight plots per episode
were generated in `figures/routing-contact/`; the tension/contact trace shows loading and release
across the three cycles. Raw contact entry/exit counts include solver chatter and must not be
interpreted as press-cycle counts. This sweep does not validate capstan or multi-guide routing physics.

The refreshed results include full-law nonlinear pretension calibration and exact discrete delays;
they supersede the earlier numerical values. `verification.json` records the routing configurations
and summaries as well as baseline, sensitivity and drift results.

## Still to evaluate

Parameter recovery, model identification on held-out loads, hybrid/fully learned model comparison, neural
state-and-mechanics observation, uncertainty calibration, and physical-finger force estimation have not
been evaluated by these runs. Acceptance limits must come from the intended hardware and task specification.
