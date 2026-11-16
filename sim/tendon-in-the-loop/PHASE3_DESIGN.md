# Phase 3 audit and preregistered design

Phase 2 remains the reference plant. Its transmission, finger, actuator and sensor source files and
published artifacts are not rewritten for this study. The audit inspected `PHASE2_DESIGN.md`, the
verification JSON, `transmission.py`, the existing dataset/training/evaluation scripts, calibration
reset code, telemetry, and observer normalization. The 66-test suite and frozen Phase 2 checkpoint
evaluation are reproduced into a Phase 3 directory before new experiments.

The principal calibration issue is `Finger.reset(q0, pretension)`: it recalculates spring preload
and tendon zero for each q0. Phase 2 correctly qualified its ambiguity example as unknown setup.
Phase 3 uses an opt-in wrapper: establish a reference once, retain preload and tendon zero, and
then initialize actual states. Initial distal boundary displacement follows actual tendon geometry;
the two-port plant is statically prepared while a hypothetical jig holds that state. The motor
controller uses nominal pretension, never a hidden force/current initialization oracle.

## Calibration privileges

- A: motor zero is available; actual home, tendon zero and preload are unknown.
- B: a referenced jig supplies home/tendon zero; pretension and passive stiffness retain residual error.
- C: referenced home, zero, preload, nominal pretension, material and fixed fixture are repeatable.

The simulation constructs the reference using true states. Hardware would require the one-time
joint-angle reference, boundary encoders and load-cell setup listed in `experiments/phase3.json`.
This is **not** a demonstration of motor-only calibration. All deployed neural features remain the
four motor channels; calibration regime is known by the operator, not a hidden true-state input.

## Controlled comparisons

Four training cases (A, B, C passive, C probe) have equal run counts and the same 32-unit joint-only
GRU, training budget and causal windows. A balanced pooled model supplies an unconditioned GRU
control. Three seeds are predeclared. A frozen Phase 2 GRU remains an additional reference, with
its different training distribution/output task documented. Passive/probe C tasks are paired, share
post-prefix commands and observation duration, and differ only in the initial probing action.
Probe displacement is 0.5 mm with a 1.2 s envelope; the passive prefix holds for the same duration.
Compare post-prefix errors as well as full-run error, since a stationary prefix must not inflate a
positive result. Probe motion can change the state; record that consequence and contact transitions.

Baselines: calibrated rigid equal-joint kinematics, and a reduced four-state dynamics/length EKF.
The latter uses nominal geometry, passive mechanics and a train-only compliance calibration; it
does not receive true force, joints or contact. It intentionally lacks a contact model. Do not force
an interpretation of covariance as calibrated uncertainty. Known design parameters are allowed in
this physics baseline, not supplied to the strict GRU.

Sensitivity analysis fixes reference length, preload, material, routing, instrument and environment.
Only physically consistent initial q is perturbed. Compare singular values and scaled column
correlations across passive/active probes and operating points. The fixed-setup ambiguity search
uses complete valid released trajectories; unlike Phase 2, the preload/zero fingerprint must match.
Failing to find a pair is not a proof of global observability.

Mechanism experiments vary one factor at a time, including independent joint stiffnesses. Report
joint ranges and trajectory singular-value ratio so that confinement to a one-dimensional manifold
is not mistaken for independent joint information. Frozen-GRU transfer error and calibrated
physics-model error are different design metrics; neither is a fully optimized design-specific NN.

## Acceptance and numerical gates

Targets are <2 deg per joint for calibrated free motion and <5 deg for controlled contact, fixed
before test outcomes. Active probing must demonstrate its own paired benefit; negative results
remain results. Inspect pilot before expansion. Keep all diagnostic failures and initial extrema.
Separate outer coupling timestep and plant/controller-step effects, and compare free/contact
trajectories. No contact weakening or phase-2 dynamics changes are permitted to improve a score.
Optional closed-loop posture control is deferred unless errors and reachable-target evidence justify
it; this phase does not require RL or a larger network.
