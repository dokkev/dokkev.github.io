# Phase 2 design and audit

Phase 1 artifacts (`observer-verification.json/.svg`, 24-run HDF5 and original checkpoint) remain
historical references. The original 40 tests passed before the Phase 2 plant was introduced.
The original 60-epoch seed-0 GRU is reproduced into `figures/phase1-reproduction/`, never over the
published result. Phase 2 uses separate datasets, checkpoints, manifests and reports.

## Source audit

- `finger.py`: two 50/35 mm capsule links, positive masses, passive hinge springs/damping, gravity,
  soft joint limits and one flexor spatial tendon. A sprung box object uses MuJoCo contact forces.
  No prescribed joint trajectories or independent joint actuators. Reset preloads passive springs
  to balance gravity and the specified initial tendon tension. This privileged initialization is
  a fixture/setup assumption; different q0 values also change spring preload and tendon zero.
- Tendon length and its Jacobian come from MuJoCo (`ten_length`, sparse actuator moment row).
  The tendon itself has zero stiffness/damping/friction; `ctrl=-T_out` applies its only force.
- `cable.py`: two equal effective-stiffness segments, cubic elasticity, Kelvin damping, tension-only
  force, rigid equivalent rotating pulley with inertia, viscous/Coulomb/Dahl bearing losses.
  It does not represent distributed sliding guides, wrap angle, dimensions-derived compliance,
  recoverable viscoelasticity or bending. Settling and irreversible creep are load-dependent;
  the degradation law is an accelerated hypothesis, not an identified material law.
- Input QDD has rotor inertia, saturated current command, first-order current response, viscous
  and optional Coulomb loss. The finite-bandwidth emulation servo has stroke/velocity/acceleration
  limits and delay, but Phase 1 has no tension-dependent actuator effort limit.
- Plant/motor step 0.1 ms; MuJoCo step 0.5 ms; recording 1 ms; observer 5 ms. The motor PD updates
  every plant step. Coupling reads the current tendon displacement, advances plant, measures tension,
  then advances MuJoCo: causal, with one interface-step lag and optional extra delay.
- Phase 1 sensors: 16,384-count encoder, 0.005 A current noise, 0.002 rad/s velocity noise,
  0.05 N load-cell noise and 1 um emulator noise. Motor/cable constants are otherwise shared.
- Namespaces: `motor` (strict four-channel whitelist), `emulator`, `transmission`, `simulation`,
  `ground_truth`; configurations/versions/seeds are attributes. These existing names are retained.
- `observer.py`: 32-unit causal GRU, two outputs (tension/apparent deformation); 200 Hz input,
  128-sample training windows, 32-sample burn-in, train-only normalization, full-run validation.
  The original 12/3/9 run split contains contact, changed-law and accelerated-drift test sets.
- Existing isolated energy test is taut/viscous only. Dahl hidden storage and full aging energy
  are not validated by that test. Numerical completion is not contact success or hardware safety.

## Extensions and boundaries

1. Add an independent Phase 2 two-port plant with dimensions-derived compliance (`EA/L`), a
   unilateral Maxwell branch in parallel with equilibrium elasticity (SLS in its active tensile
   regime), nonlinear strain stiffening and Kelvin loss. Record recoverable states and energy.
2. Fixed routing fixtures describe segment lengths, sliding-guide radii/wrap and material labels.
   A condensed equivalent pulley transfers motion; a return-mapped presliding element has explicit
   spring storage and plastic dissipation. Sliding loss uses the ideal capstan limit as a reference,
   not universal dynamic equality. Radius affects separate assumed bending loss, not its exponent.
3. Separate persistent specimen properties, fixture variation, session excitation, carried aging,
   sensor parameters and explicit interventions. Hypothetical material/dimension priors are labeled.
   The exploratory colored stiffness perturbation added during initial work is optional external
   parameter variation with a signed work channel; it is not used as a physical aging explanation.
4. Motor true torque constant, thermal proxy and sensing errors are separate from nominal controller
   and estimator calibration. Extend finite-effort emulation and causal sensor filtering/delay.
5. Keep the strict four motor inputs. Add joint targets and a rigid-tendon baseline with explicitly
   assumed equal joint coupling and nominal initial posture. Those assumptions are deliberately
   challenged by varied postures/passive properties; geometry is not a neural input.
6. Pilot first, then expand via a checked-in split manifest. Specimen/routing holdouts are distinct;
   final OOD is evaluated after model selection. Invalid or weakly excited runs retain diagnostics.
7. Train three seeds of the same 32-unit GRU. Compare tension-only training, history truncation,
   small capacity and data-budget variants. Search valid trajectory pairs in sensor-normalized
   motor-history space. Failure to find a pair does not establish global observability.

## Validation gate

Before learning: test pretension, dimensions/compliance, slack, relaxation/creep, forward/reverse
friction, wrap/radius separation, energy/storage/dissipation, actuator limits and causal timing.
Run smaller-step convergence checks on isolated mechanics and contact trajectories. Record energy
exchange from rest-length/parameter interventions instead of calling it spontaneous dissipation.
Inspect pilot contact coverage, both joint ranges, strain, saturation and tracking before expansion.
All material, thermal, bending and aging constants are hypothetical until measured. Detailed cable
microstructure, wear chemistry, thermal magnet/winding separation, guide deformation and hardware
transfer remain outside this numerical pilot. A structured adaptive model is deferred unless the
baseline and observability results provide a specific, testable reason for it.
