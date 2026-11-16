# Two-tendon architecture audit and pre-test design

The existing Python `Finger`, `TiLSimulator` and Phase 1–3 observers represent one tendon,
one robot motor and one emulator coupled to two joints. Their published results remain
single-tendon results. All 88 tests passed before this extension. No legacy source, dataset,
checkpoint or published figure is to be overwritten.

The website `TendonInTheLoop2DoFDemo.tsx` describes two robot motors, two emulators and
two paths. Its joint dynamics are independently integrated PD equations, not the MuJoCo
mass/contact dynamics. The imposed excursions are e1 = 0.015 q1 and e2 = 0.010(q1+q2).
They are not derived from the SVG centerline. In the drawing, the proximal idler arcs vary
by +q1 and −q1, so their total length is constant; the two inter-pulley straight spans and
distal half-wrap are constant. q2 does not change those path coordinates at all. Pulley
rotation, cable material transport, no-slip constraints and termination attachments would
be needed to derive a winding excursion from this drawing. It cannot verify that routing.

This extension therefore uses an explicitly labeled **constant-moment-arm pulley reference**,
implemented as two MuJoCo fixed tendons, not two independent joint motors. With positive
flexion and positive input reel-in, A = [[0.015,0],[0.010,0.010]] m/rad,
e = A(q−q_home), l = l_home−e and J_l = −A. Additive reference lengths affect no forces.
Tendon 2 applies coupled torque to both joints. Its topology is an equivalent winding
constraint, not a validated spatial routing of the four-motor physical rig. Full intended
joint-range checks use q1 = −30…60 deg and q2 = 0…150 deg. Physical routing clearance,
wrap loss, rig-link actuation and the hardware's moving-link work remain unverified.

Each channel reuses the unchanged TiLSimulator motor, finite-force emulator, Phase 2 cable
plant and telemetry frontend. A boundary adapter suppresses each channel's private finger
integration; the shared two-tendon finger advances once after both forces are available.
Both channels read the same pre-step virtual state. The emulator is a finite-mass force
actuator driven by a boundary-position servo; it is not an independently verified pure
force-control HIL renderer. Transmission work and virtual-port mismatch must be reported
separately; no whole-loop passivity claim follows from the cable energy ledger.

Home [0.10,0.20] rad and 10 N per tendon use a one-time joint-reference / load-cell setup.
Return springs balance both tendon torques and gravity. Tensions are unilateral; the
nominal feasible absolute torque parallelogram is A.T [0,40 N]^2, shifted by passive and
gravity terms for net torque. Full rank alone does not give arbitrary signed torque.

Gates before learning: grid Jacobian/torque errors <1e-8 SI; finite cable states and
nonnegative tension; no motor/emulator limit hits on primary free trajectories; free
tracking MAE <2 deg per joint, held-joint MAE <1 deg; refined free joint RMSE <0.25 deg,
contact <0.5 deg, tension RMSE <1 N relative to the declared finest numerical reference.
Contact feasibility and solver sensitivity are reported even when a gate fails. Energy
verification uses isolated boundary-driven cable trials with no aging before interpreting
the full coupled loop. Numerical tolerances are engineering gates, not hardware limits.

Independent q1, independent q2, coordinated, reversal and controlled contact trajectories
precede dataset expansion. Start with inverse geometry and a train-only calibrated elastic
correction. Any use of joint-reference feedback for a mechanical control diagnostic must
be labeled explicitly; it must not leak into motor-only inference. No RL or adaptation.

After mechanical/control gates, compare eight-input rigid, compliance-corrected, reduced
physics and 32-unit GRU estimates on identical held-out episodes. Keep whole histories in
one split. Use training-only scaling/calibration, validation checkpoint selection, three
seeds and frozen-checkpoint replay. Report full/startup/motion/reversal/contact/release
errors. Known deformation invertibility, conditional dynamic sensitivities and empirical
prediction error remain separate claims.
