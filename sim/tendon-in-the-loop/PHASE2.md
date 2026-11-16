# Phase 2: dimensioned transmission and motor-only joint estimation

This numerical study extends the existing TiL prototype. It does not validate physical hardware.
The published Phase 1 dataset, metrics and figures remain unchanged. The original 40-test suite
passed, and the 60-epoch seed-0 observer was reproduced into `figures/phase1-reproduction/`, giving
the same 0.422830 N unseen-contact tension MAE. See `PHASE2_DESIGN.md` for the source audit.

## Reproduce

Run from `sim/tendon-in-the-loop` in the existing environment. `requirements-observer.txt` enables
the optional PyTorch workflow. `requirements-phase2-verified.txt` records the executed environment;
its CPU PyTorch wheel can be resolved with `--extra-index-url https://download.pytorch.org/whl/cpu`.
The commands below are implemented entry points.

```powershell
# Mechanical, coupling, sensor, data-boundary and learning tests
.\.venv\Scripts\python.exe -m pytest -q

# Small pilot; inspect .manifest.json and per-split logs before expanding
.\.venv\Scripts\python.exe scripts/phase2_dataset.py --config experiments/phase2.json --scale pilot --all --workers 4 --out data/phase2/pilot.h5

# Full dataset: fixed split manifest, persistent specimen histories, streamed HDF5
.\.venv\Scripts\python.exe scripts/phase2_dataset.py --config experiments/phase2.json --scale full --all --workers 4 --out data/phase2/phase2.h5

# Quiet smaller-timestep/ideal-servo comparisons and local sensitivity experiment
.\.venv\Scripts\python.exe scripts/phase2_verify.py --out figures/phase2/physics

# Three 32-unit joint GRUs; two-output, 16-unit, quarter/half-data controls
.\.venv\Scripts\python.exe scripts/phase2_experiments.py --dataset data/phase2/phase2.h5 --out figures/phase2/full --epochs 60 --workers 2

# Independent frozen-checkpoint held-out evaluation, with no fitting
.\.venv\Scripts\python.exe scripts/phase2_evaluate.py --dataset data/phase2/phase2.h5 --checkpoint figures/phase2/full/joint-seed0/checkpoint.pt --out figures/phase2/full/replayed-test.json

# All 22 figures and the public numerical report
.\.venv\Scripts\python.exe scripts/phase2_report.py --dataset data/phase2/phase2.h5 --experiments figures/phase2/full --physics figures/phase2/physics --report ../../public/assets/data/tendon-in-the-loop/phase2-verification.json --figures ../../public/assets/img/tendon-in-the-loop/phase2
```

Raw HDF5, split manifests, logs, checkpoints and prediction archives remain under ignored `data/` and
`figures/`. The public JSON exports configurations, quality flags, versions, seeds, training histories,
normalization, per-run/regime errors, source hashes and Git provenance. Source hashes normalize CRLF
to LF. The exported Git hash is the base at execution; `worktree_dirty_at_export` and source hashes
identify work executed before its final commit. Exact cross-platform floating-point replay is not assumed.

## Physical model and assumptions

`transmission.py` is an opt-in Phase 2 reference plant; `cable.py` remains available for Phase 1.

| Component | Implementation | Boundary of the claim |
|---|---|---|
| Axial elasticity | Effective modulus and diameter give area; equilibrium segment stiffness is `EA/L`. Cubic stiffening scales with axial strain. Guide arc lengths contribute to compliance. | Hypothetical effective fiber properties; no measured material specification |
| Rate dependence | A unilateral Maxwell branch parallels equilibrium elasticity; a Kelvin term supplies additional rate loss. Delayed extensions are internal states. | SLS response in the active tensile branch; compression is suppressed |
| Slack | Tension is nonnegative. Supplemental payout trials regularize dashpot engagement over 10 um. | Training trajectories were taut; slack behavior is a held-out regime |
| Guide losses | A return-mapped elastic/plastic presliding element stores spring energy and dissipates plastic work. A regularized sliding reference is also available. | Fixed rigid guides, condensed to one equivalent pulley; not distributed cable-contact simulation |
| Wrap/radius | The ideal guide limit uses `tanh(mu * total_wrap / 2)`. Radius enters arc length and a separate phenomenological bending-loss term. | No radius term in the capstan exponent; bearing/inertia/bending effects are distinct |
| Slow history | Conditioning grows with sliding distance; settling and irreversible creep depend on load. Recorded states persist between sessions of a specimen series. | Accelerated engineering hypotheses; no wear chemistry or material-aging calibration |
| Intervention | Explicit timed stiffness/slack change, marked in a truth channel and signed energy exchange. | Deliberate OOD intervention, not natural aging |
| Input motor | True torque constant differs from nominal calibration; single-lump heating changes its effective value. Current dynamics, inertia, friction and saturation remain active. | Thermal state is a proxy, not a calibrated winding/magnet model |
| Emulation motor | Finite effective mass, force limit, bandwidth, delay, stroke, velocity and acceleration limits; cable tension loads the actuator. | Control/constraint dynamics are lumped, not a detailed drive model |
| Telemetry | Quantization, current gain/bias, correlated and white noise, bounded bias drift, causal low-pass, slower update, delay and sample hold/dropout. | Motor command is immediately known; held sensor channels retain past observations |

Free spans and guide arcs are condensed into two axial lengths. Multiple guides share an equivalent
cable-flow coordinate; local guide tensions and deformation are not resolved. Small-strain elasticity
uses the original material reference length, with creep/settling represented by additive rest-length
offsets. Sessions are rested/re-tensioned at a new calibrated zero; accumulated irreversible history
is retained. Split series are independent numerical replicas, not an ability to reset physical cable age.

In the tensile regime, the segment reference is

\[
T=\left[k_\infty e+k_3e^3+k_M(e-z)_++c\,a(e)\dot e\right]_+,
\qquad \dot z=(e-z)/\tau.
\]

The branch can relax at fixed extension and produce recoverable creep under fixed force. The
long-term creep state is separate from this recoverable memory. The optional colored stiffness
perturbation in the earlier effective-stiffness plant is **not used as Phase 2 natural aging**.

The energy boundary contains the transmission, pulley inertia and presliding storage:

\[
W_{in}+W_{out}+W_{parameter}
=\Delta E_{stored}+E_{diss}+E_{aging}+r_E.
\]

Both port displacements are positive into extension, so both signed works enter the left side.
Parameter exchange is signed; rest-length relaxation releases energy into the aging-loss channel.
This is not a whole-system electrical/control energy balance. The motor's internal PD still reads
simulated rotor position/velocity, and the emulation servo reads its true position; imperfect telemetry
is modeled at the observation interface. Control-sensor imperfections, magnet/winding separation,
guide compliance, distributed bending and calibrated friction/material laws remain important gaps.

## Dataset, validity and leakage

The initial pilot contained 26 sessions; a subsequent two-session payout pilot exercises slack.
The full study contains **128 simulated sessions**: 48 training, 8 validation, and nine 8-session test
groups (in-range, contact, specimen, routing, drift, combined OOD, observability, sensor sensitivity,
and payout/slack). These include linked specimen histories and matched-factor replays, so session
count must not be interpreted as an independent-sample confidence bound.

The design combines stratified excitation amplitudes, structured fixture/specimen assignments,
repeated specimen sessions and controlled one-factor sensor sweeps. Six training specimen families
and two fixtures are used; complete specimen families and fixtures are withheld for their designated
tests. Constant, conditioning, creep and combined-history series are separate specimen instances.
Actual end-of-session creep, settling, conditioning and sliding distance initialize the next session.

Force/strain finiteness, requested contact, both joint ranges, tracking and current saturation are
checked. The 120-session core completed numerically; all 48 training sessions passed eligibility.
Eight weak-excitation stress sessions are explicitly flagged. One validation session exceeded the
50% saturation diagnostic (51.2%); it is retained and scored, not described as a missing-contact run.
Diagnostic thresholds are study gates, not hardware safety specifications. Failed/flagged runs remain
in the HDF5/manifest. Test evaluation retains physically difficult completed cases.

The core data had **no slack samples**. Eight payout sessions were added as a frozen-model diagnostic,
with four offset levels and independent sensor realizations for repeats. The original 120-session data
and checkpoints remain available. `phase2_extend_evaluation.py` added those tests without changing
weights, normalization or selected epochs; replay hashes distinguish training/evaluation datasets.
The configuration now includes the supplemental split, so the full commands above regenerate it
directly. Payout controls that remain taut are distinguished from runs that actually reach slack.

Schema v3 retains `motor`, `emulator`, `transmission`, `simulation`, `ground_truth` and metadata
attributes. The four motor channels are the only neural inputs. Joint positions, geometry, contact,
specimen/fixture IDs, age and true parameters are evaluation references or metadata only. The QDD
baseline uses nominal calibration, never the randomized true torque constant. Apparent deformation
uses measured input/output boundaries; true boundary sum and dimensionless Phase 2 strains are separate.
Timestamp denotes recording time; telemetry may contain delayed/held values according to its saved
frontend configuration. Filtering is causal; no zero-phase filter or future interpolation enters inputs.
Episode/dataset unit attributes are authoritative: Phase 1's friction state is a torque, while Phase 2's
presliding state is an angle; effective friction is a guide coefficient in Phase 2. Merge normalization
clarifies those metadata units without changing arrays, neural inputs or targets.

## Learning and executed results

The primary GRU keeps 32 hidden units and the original 128-sample / 32-sample burn-in procedure.
It predicts **distal tension, q1 and q2**, with train-only target normalization. Three seeds use the
same 60-epoch budget and validation-only checkpoint selection. Full-run tests include initialization.
Errors below are mean +/- sample standard deviation across training seeds; each seed first averages
per-run MAE equally. This spread is not a hardware or population confidence interval.

| Test | Tension MAE [N] | q1 MAE [deg] | q2 MAE [deg] |
|---|---|---|---|
| In range | 0.482 +/- 0.016 | 1.173 +/- 0.073 | 1.240 +/- 0.033 |
| Unseen contact | 0.700 +/- 0.007 | 3.282 +/- 0.050 | 2.913 +/- 0.157 |
| Unseen specimen | 0.467 +/- 0.032 | 1.297 +/- 0.085 | 1.821 +/- 0.030 |
| Unseen routing | 1.141 +/- 0.064 | 1.517 +/- 0.178 | 1.609 +/- 0.093 |
| Unseen evolution | 0.577 +/- 0.015 | 1.878 +/- 0.123 | 4.201 +/- 0.218 |
| Combined OOD | 1.266 +/- 0.081 | 3.732 +/- 0.694 | 4.219 +/- 0.390 |
| Weak / ambiguous setup | 0.188 +/- 0.107 | 11.397 +/- 0.001 | 22.919 +/- 0.001 |
| Payout / slack diagnostic | 0.584 +/- 0.104 | 6.621 +/- 0.390 | 3.239 +/- 0.434 |

Full MAE, RMSE, p95 and maxima are exported per run, contact/free motion, reversal, initialization and
after settling. Aggregate p95/max entries average the corresponding per-run statistic; they are not a
pooled percentile or worst case over the entire test set. Raw per-run maxima remain available.

The rigid baseline assumes `q1=q2`, nominal geometry and initial zero posture, and zero cable strain.
It therefore does not claim unconstrained two-joint reconstruction from one displacement. Its in-range
joint MAE is 23.03/20.31 deg; violating that coupling makes it a weak baseline, not a full physics observer.
The QDD tension baseline gives 1.038 N and the frozen Phase 1 observer 1.016 N on this same in-range set.

Multitask tension estimation is not uniformly better: seed-0 tension/deformation training gives
0.414 N in-range tension MAE versus 0.480 N for the joint model, while combined OOD gives 1.388 versus
1.355 N. The comparison uses equal training budgets; it does not identify the cause of the difference.
The 0.066 N in-range multitask gap is smaller than the nominal-step tension discrepancy against the
finest reference, so it cannot establish a physical performance difference.
The 16-unit model has 1,107 parameters; the 32-unit joint model has 3,747. Quarter/half/full data
controls use 12/24/48 training sessions. More data also changes condition coverage. Reported CPU
latency is a post-experiment batch-1, two-thread benchmark, not a real-time-control certification.

## Observability and numerical limits

An explicit search over valid weak/free trajectories finds two calibrated equilibria with identical
four-channel motor input at the float32 observer interface over 0.5 s, but joint angles differ by
22.92 and 45.84 deg. Their spring preloads and tendon zeros differ. This establishes ambiguity across
unknown setup conditions; it does **not** establish non-observability for a known fixed-preload robot.
The search conditions, comparison scales and pair IDs are exported, not inferred from NN error.

A separate finite-difference experiment perturbs actual initial joint states with preload/reference
held fixed. Its two-column local sensitivity condition number is 28.53, with q1/q2 column correlation
0.9976. This is conditional finite-horizon sensitivity, not full-system or global observability; other
hidden states are fixed and the noise scaling is a comparison metric, not a Fisher-information bound.

Against a 0.0625 ms MuJoCo / 31.25 us plant reference, the nominal 0.5 ms / 100 us run differs by
0.209 N distal-tension RMSE and 0.088/0.293 deg joint RMSE. A MuJoCo refinement with plant/controller
step held at 31.25 us reduces state errors; the 0.125 ms run gives 0.052 N and 0.029/0.052 deg.
Contact-force RMSE remains about 0.59-0.74 N. A separate plant/controller-step sweep holds MuJoCo at
0.5 ms: 100 us versus 25 us differs by 0.246 N and 0.121/0.342 deg. Contact peaks are not fully
converged, and controller update also changes in the plant-step sweep. Transmission energy residuals
are on the order of 1e-6 to 1e-5 J in these quiet comparisons and do not decrease monotonically.
An ideal position servo retaining the same 0.5 ms communication delay gives 0.142 mm peak tracking
error versus 0.549 mm for the finite servo; the ideal option does not remove the interface delay.

## Hypotheses and hardware implications

- **H1, mismatch:** routing and combined OOD increase errors and degrade the frozen Phase 1 observer.
  The unseen-specimen test is not uniformly harder than in-range. These results support sensitivity
  to some changes, not a completed forward-model identification or universal mismatch claim.
- **H2, joint observability:** task-constrained trajectories support useful joint prediction, while
  the setup-ambiguity test admits distinct joints with the same observations. NN accuracy is not proof.
- **H3, coupled uncertainty:** near-collinear joint sensitivities and reference-length coupling make
  attribution difficult. The study does not separately identify stiffness, friction and joint uncertainty.
- **H4, adaptation:** untested. A larger/adaptive model cannot resolve identical input histories without
  additional assumptions. A structured adaptive observer is deferred pending an identifiable context
  variable and independent evidence that adaptation improves held-out mechanical changes.

The proposed HIL testbed should measure input/output force separately, establish motor calibration,
record routing and preload/zero setup, and use independent joint encoders for validation. Deployment
may require repeatable homing, specified mechanical coupling or additional sensing in ambiguous
conditions. Simulation cannot establish which assumptions the physical hardware will satisfy.

## Figures

The report command creates all 22 numbered SVGs under `public/assets/img/tendon-in-the-loop/phase2/`:
force/extension, hysteresis, two-port tensions, reversal, routing, history, finger motion, joint/Jacobian,
contact/tension, emulation, predicted tension/q1/q2, regime errors, effective history, stiffness/slack,
routing/aging errors, ambiguity, noise/delay, timestep convergence, data budget, and CPU complexity.
Every curve comes from stored experiments or the explicitly controlled isolated plant replay. Plot
decimation changes display density only; metrics use all recorded observer-rate samples.
[Browse the 22 figures](../../public/assets/img/tendon-in-the-loop/phase2).

The full validation suite passes **66 tests**. Checkpoint-only evaluation reproduces stored test metrics
without an optimizer. The payout supplement includes taut controls and actual slack intervals; it is a
small stress sweep, not evidence of broad slack-regime generalization. Some observed extrema occur
during cold-start inference; mean task error must not hide those initialization failures.
