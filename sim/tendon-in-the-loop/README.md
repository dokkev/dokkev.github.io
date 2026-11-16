# Tendon-in-the-Loop — software-in-the-loop prototype

A software-in-the-loop (SIL) prototype of the *Tendon-in-the-Loop* (TiL) hardware-in-the-loop tendon
dynamometer described in the project post. The proposed physical dynamometer has not been built; here it is
replaced by a **synthetic, physics-based transmission plant** so that the force–motion coupling architecture
can be exercised, synthetic datasets generated, and future system-identification / state-estimation
experiments set up reproducibly.

**This is an engineering feasibility study. No hardware validation, system-identification result or
Sim2Real improvement is claimed.**

## Layout

Phase 2 adds dimensioned viscoelastic mechanics, routing/specimen experiments, motor/sensor realism
and strict motor-only joint-state estimation. See [PHASE2.md](PHASE2.md) for executed results, limits
and reproduction commands; [PHASE2_DESIGN.md](PHASE2_DESIGN.md) records the source audit. Phase 1
artifacts remain the historical reference.

```
til/
  cable.py      synthetic two-port cable plant (compliance, damping, slack, pulley inertia + friction,
                Dahl hysteresis, termination settling, creep, dissipation-driven degradation)
  motors.py     input QDD motor (rotor, current loop, encoder, PD controller) and emulation motor (position
                servo with bandwidth, velocity / acceleration limits, delay, ideal mode)
  finger.py     MuJoCo 2-DoF planar finger, flexor tendon (sites, no native tendon forces), sprung object pad
  coupling.py   causal time-stepped coupling of the four subsystems; channel list and units
  recorder.py   chunked HDF5 writer / readers with motor-only vs privileged namespaces
  scenarios.py  motor command profiles and the smoke / contact_sweep / long_horizon experiment modes
  runner.py     CLI experiment runner
  analysis.py   automatic figures
tests/          mechanical-consistency and coupling tests (pytest)
scripts/        baselines.py (four transmission presets), robustness.py (numerical sweeps)
```

## Setup

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt      # Windows; use .venv/bin/python elsewhere
.venv/Scripts/python -m pytest -q
```

## Run

```bash
python -m til.runner smoke          --out data/smoke.h5
python -m til.runner contact_sweep  --out data/contact.h5 --cycles 4 --seeds 0 1
python -m til.runner long_horizon   --out data/long.h5 --cycles 500 --period 1.5 --preset drift
python -m til.analysis data/smoke.h5 --out figures/smoke [--episode <id>]
python scripts/baselines.py  --out figures/baselines
python scripts/robustness.py --out figures/robustness.md
```

Run times and cycle counts are arguments, never hard-coded. Datasets are written in chunks, so long runs do
not accumulate in memory.

## Architecture

```
MuJoCo finger  --l(q) - l(q0)-->  emulation motor  --x_out, xd_out-->  cable plant  <--x_in, xd_in--  QDD motor
      ^                                                                   |
      +----------------------- ctrl = -T_out (measured, delayed) ---------+
```

One MuJoCo step (`mj_dt`, default 0.5 ms) runs `n = mj_dt / plant_dt` plant substeps (default 0.1 ms):

1. read the virtual tendon displacement `x_cmd = l(q_k) − l(q_0)` from the current MuJoCo state;
2. for each substep: input motor (PD → current → rotor, loaded by the previous `T_in`), emulation motor servo
   toward `x_cmd`, then the cable plant with the new boundary motions → `(T_in, T_out)`;
3. measure `T_out` (noise, delay), apply it to MuJoCo as a pulling force on the tendon (`ctrl = −T_out` on a
   unit-gain general actuator);
4. `mj_step`.

There is no algebraic loop: the tension used in step *k* comes from the plant at the end of step *k*, driven
by the finger pose at the start of step *k*. This one-step lag plus the configured `tension_delay` is the
modelled interface and is written into the dataset metadata.

The two motors are the **input and output ports of one physical transmission**, not two finger joints.

### Sign conventions (SI units everywhere)

| symbol | meaning | positive direction |
|---|---|---|
| `x_in = r_drum·θ_m` | input cable end | toward the input motor (reeling in) |
| `x_out` | output cable end (finger tendon port) | away from the pulley = finger **extending** |
| `φ_p` | pulley angle | cable flowing from the output side to the input side |
| `q_1, q_2` | finger joints (about +y) | **flexion** (toward −z, palm side, where the object is) |
| `l(q)` | MuJoCo tendon length | flexion shortens it, so `J_l = dl/dq < 0` |
| `T_in, T_out` | tensions at the two ports | always ≥ 0 (a cable only pulls) |

The emulator command `x_out = l(q) − l(q0)` therefore goes negative during flexion (cable fed toward the
pulley). The apparent transmission deformation seen from the boundaries is `x_in + x_out` (zero for a rigid,
friction-free cable).

### No double counting

The MuJoCo tendon has `stiffness = damping = frictionloss = 0` and the only actuator is the unit-gain tension
input (asserted by `tests/test_coupling.py`). MuJoCo contributes rigid-body dynamics, passive joint springs and
damping, gravity, joint limits and contact; every transmission force comes from the synthetic plant.

### Pretension equilibrium

At reset the passive return springs are preloaded (`qpos_spring`) so that the initial configuration `q0` is an
equilibrium under gravity and the tendon pretension; the input motor starts holding the pretension current.
Without this the pretension alone would flex the finger.

## Synthetic cable plant (`til/cable.py`)

Two elastic segments joined by a pulley with inertia and bearing friction:

```
δ1 = x_in − R_p φ,   δ2 = x_out + R_p φ − creep − settle
T_i = max(0, k_eff(δ_i + δ0) + k3(δ_i + δ0)^3 + c δ̇_i)        δ0 = T0 / k0 (pretension stretch)
J_p φ̈ = R_p (T1 − T2) − τ_f(φ̇, T1 + T2, z)
```

The pulley update is implicit in the spring and viscous terms, so near-rigid cables (`k0 = 2 MN/m`) stay
stable at the 0.1 ms substep. Friction models: `none`, `viscous`, `coulomb` (smoothed), `dahl` (presliding
state `z`, holds a static tension difference and produces hysteresis loops). The Coulomb level is
`τ_c,eff + μ_load R_p (T1 + T2)`.

Hidden irreversible states (all recorded under `ground_truth/`): termination settling (saturating),
creep (`∝ (T2/T_ref)^2` above a threshold), and a degradation state `d ∈ [0, 1]` driven by dissipated energy
with `k_eff = k0 (1 − α d)` and `τ_c,eff = τ_c (1 + β d)`. These are **hypothetical constitutive toys for
algorithm testing**, not material laws. Power through both ports, stored energy and dissipation are tracked;
`tests/test_cable.py` checks the energy balance.

Presets (`CableParams` in `PRESETS`): `rigid`, `linear`, `nonlinear` (cubic stiffening + Dahl + load-dependent
friction + settling), `drift` (nonlinear + creep + degradation).

## MuJoCo finger (`til/finger.py`)

Two revolute joints (links 50 mm / 35 mm, 20 g / 12 g, passive springs and dampers, joint limits), one
spatial flexor tendon routed through sites 8 mm below each link axis. At `q = 0` the moment arm of each joint
is exactly 8 mm; it grows with flexion (verified against finite differences). A box pad on a vertical slide
joint with an explicit spring (`k_obj`) is the object; its position and stiffness are the sweep variables.
Contact state, normal force and location come from MuJoCo's contact list (`mj_contactForce`), never from the
motor command.

The single tendon does not control both joints independently: the distal joint takes most of the motion and
the proximal joint responds through passive mechanics, gravity and contact. Different postures come from
`q0`, object placement and stiffness, and pretension, not from prescribed joint trajectories.

### Fixed routing

The synthetic plant's pulley geometry (`R_p`, friction) is fixed; MuJoCo's configuration-dependent tendon
geometry changes `l(q)` and the moment arms only. Routing variation is a separate experiment
(`CableParams.R_p`, friction levels), and configuration-synchronised routing hardware is **not** modelled.

## Dataset (`til/recorder.py`)

HDF5, one group per episode, every channel chunked and resizable, units in dataset attributes, the full
episode configuration / seed / preset as JSON attributes, library versions and the coupling notes at the root.

```
time, cycle_count
motor/        position velocity current applied_command estimated_motor_torque      <- motor-only observation
emulator/     commanded_position actual_position velocity tracking_error
transmission/ input_tension output_tension input_displacement output_displacement
              apparent_elongation pulley_position pulley_velocity
simulation/   joint_positions joint_velocities tendon_length tendon_moment_arms tendon_joint_torque
              applied_tension contact_state contact_force contact_location object_position
              object_velocity tip_position
ground_truth/ cable_segment_extensions friction_state friction_torque effective_stiffness effective_friction
              slack_state settle_state creep_state degradation_state dissipated_energy stored_energy
              input_tension_true output_tension_true pulley_friction_torque
```

`motor/` is the only namespace a motor-only observer may read: `recorder.load_motor_only()` returns exactly
`time` plus the channels listed in the file attribute `motor_only_channels`. Everything else is privileged.

## Reproducible experiment settings

All three modes accept `--period`, `--amplitude` (metres of motor reel-in reference), and
`--pretension` (newtons). The motor follows this reference through a current-limited PD controller;
joint motion remains dynamic. This runner does not implement a separate open-loop torque waveform.

For routing and sensor experiments, use the checked-in manifest:

```powershell
.\.venv\Scripts\python.exe -m til.runner --config experiments/routing-contact.json --out data/routing-contact.h5 --plots figures/routing-contact --quiet
```

The manifest merges `defaults` with explicit `episodes`, including nested `profile` and
`sim_overrides` settings. It varies pulley radius, friction, pretension, contact stiffness, initial
finger posture, excitation and seed. Each episode records its merged configuration in HDF5.
Routing is fixed within an episode. Radius and bearing/friction parameters describe the implemented
two-port pulley model; wrap-angle-dependent capstan friction and multi-guide routing are not implemented.

`--plots` writes eight diagnostic figures per completed episode. Episode summaries include recorded
contact entry/exit counts; these raw transitions include contact chatter and are not completed press cycles.
Check the contact-force trace against the excitation phases to assess repeated loading and release. Numerical failure
is stored in the episode and causes a nonzero runner exit code. Finite states are checked every dynamics
step; this guard is not a hardware safety specification.

Schema **v2** names true segment stretches `ground_truth/cable_segment_extensions` in metres.
The old v1 name `cable_segment_strains` also contained metres, not dimensionless strain; plotting accepts
both. Segment rest lengths are not defined, so dimensionless cable strain is not reported.
Nonlinear pretension is calibrated using the complete nominal elastic law. Sensor and emulator delays
must be representable on their respective timestep grids, and `log_dt` must be an integer multiple of
the MuJoCo timestep. Separate seeded noise streams prevent logging from changing the plant trajectory;
reset restores each stream.

## Validation

* `tests/test_cable.py` — pretension equilibrium, slack gives zero force and energy, small-displacement
  response (tension split, pulley rotation), sliding tension drop `τ_c/R_p + b_p φ̇/R_p`, Dahl stiction holds a
  static difference without creep, sign conventions, energy balance (`W_in + W_out = ΔE + E_diss`), hysteresis
  loop direction, finite states for every preset, degradation effects.
* `tests/test_motors.py` — ideal emulator, servo settling and bandwidth, delay and limits, motor loading,
  observation keys and encoder quantisation.
* `tests/test_coupling.py` — moment arm analytic / finite-difference, pulling flexes (`τ = −Jᵀ T`), no native
  tendon force, displacement follows the configuration, contact raises the distal tension, emulator tracking
  within its bandwidth, ideal-emulator run.
* `scripts/baselines.py` — the same contact scenario with the four presets.
* `scripts/robustness.py` — timestep, emulator bandwidth, tension noise, latency, object stiffness, current
  limit and velocity limit sweeps; each case reported as OK or FAILED with its peak tension and tracking error.

Results of the runs that were performed are summarised in `RESULTS.md`.

The first motor-only GRU study is documented in [OBSERVER.md](OBSERVER.md), including independent
training/validation/test runs, QDD/compliance baselines, changed-law and drift stress tests, and
reproduction commands. Install `requirements-observer.txt` for this optional training workflow.
