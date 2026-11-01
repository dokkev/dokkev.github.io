# WBC article calculations

The WBC 01 demo replays Pinocchio/TSID trajectories on a Talos mesh model.
The browser loads static files; it does not run the dynamics solver.

## Generate the data

```sh
conda env create -f scripts/wbc/environment.yml
conda activate wbc-blog
unset PYTHONPATH
export PYTHONNOUSERSITE=1
python scripts/wbc/prepare_talos_assets.py
python scripts/wbc/generate_reach.py --reach 0.08 --output /tmp/wbc-near.npz \
  --playback-json public/assets/demos/wbc/near.json
python scripts/wbc/generate_reach.py --reach 0.45 --output /tmp/wbc-far.npz \
  --playback-json public/assets/demos/wbc/far.json
python scripts/wbc/update_preview.py
```

The separate environment avoids importing ROS's Python bindings into Conda.
The environment file fixes Pinocchio 4.0.0, TSID 1.10.0, and
example-robot-data 5.0.0. It is not a transitive dependency lock.

`prepare_talos_assets.py` copies unchanged STL visual meshes and records each
visual's parent joint, fixed placement, material color, and scale from the URDF.
The source URDF and license notices accompany the assets. Five primitive visual
objects in the source model are omitted; the 47 mesh objects are retained.

## Controller and interpretation

The model is `talos_data/robots/talos_reduced.urdf`, initialized with the
`half_sitting` SRDF configuration. The hard level includes floating-base dynamics,
both six-dimensional stationary sole contacts, the initial CoM reference, initial
torso orientation, and torque/joint-motion bounds. The soft level includes the
hand task with weight 1 and posture with weight 0.01. This is a constrained QP
with one soft objective level, not a multilevel lexicographic HQP over all tasks.

Both feet use a 0.20 by 0.13 m support rectangle and TSID's linear friction
inequalities with coefficient 0.3. Total normal force per foot is bounded between
5 and 1000 N. Torque bounds are the URDF effort limits without scaling. Joint
acceleration bounds use critically damped position-limit feedback with gain 80,
an absolute acceleration cap of 50 rad/s², and model velocity limits. The script
also aborts if integrated joint positions cross the model limits by over 1e-5 rad.
This feedback bound is not a general viability guarantee.

A quintic reference moves the hand along world +x for six seconds after a
0.5-second settling period. Hand orientation remains at its initial reference.
The default calculation lasts ten seconds, integrates at 1 ms with midpoint
velocity and `pin.integrate`, and stores 501 frames at 50 Hz.

The chosen balance policy keeps the CoM and torso reference fixed. The far reach
leaves hand error while preserving these higher-priority requirements; an
actuator bound also becomes active. This does not prove the target is unreachable
under every stable posture or with a step. CoM tracking is a control policy here,
not a complete definition of dynamic balance.

The script integrates solved accelerations without an independent physics
engine. It does not simulate impact, slipping, self-collision, recovery, or hardware
performance. Solver failure, nonfinite results, or failed consistency checks abort
without writing a new file. An older output file, if present, remains untouched.
Checks include dynamics residuals, contact-force inequalities, contact acceleration,
foot drift, torque limits, and joint positions. Mixed translation/angular residual
norms are numerical diagnostics, not physical metrics with a single unit.

## Data contract

NPZ files load with `numpy.load(path, allow_pickle=False)`. Arrays share the sample
axis: `time`, `q`, `v`, `dv`, `tau`, `com`, `hand`, `hand_target`,
`foot_positions_world`, `foot_force_world`, `joint_poses`, and residual diagnostics.
`metadata` is a JSON string with versions, the URDF SHA-256, priorities, conventions,
and maximum diagnostics. The compact JSON holds the fields needed for playback.

Joint poses are world transforms in `x y z qx qy qz qw` order. Joint indices follow
`joint_names` in metadata. Visual placement is composed after the parent joint
transform. Hand/CoM/foot positions use world coordinates in metres. Forces are
left/right ground forces acting on the robot in world axes, in newtons.

`WbcReachDemo.tsx` loads trajectories on scenario selection and provides playback
and an error plot. `WbcMeshScene.tsx` uses Three.js with STLLoader and OrbitControls;
camera interaction never alters the calculated trajectory. No viewer or hardware
server is started by either Python script.

## Sources

The API/contact setup was checked against the
[official TSID biped exercise](https://github.com/stack-of-tasks/tsid/blob/079b2250378d6bc5aaf035ffbd4f124f6b0e1de7/exercizes/tsid_biped.py)
and its
[Talos configuration](https://github.com/stack-of-tasks/tsid/blob/079b2250378d6bc5aaf035ffbd4f124f6b0e1de7/exercizes/talos_conf.py).
The scripts are separate examples and do not vendor those modules. Robot assets
come from [example-robot-data](https://github.com/Gepetto/example-robot-data), with
PAL Robotics attribution and the source notices preserved under
`public/assets/models/talos/`.


## Additional floating-base demo

`WbcBalanceDemo.tsx` is a separate example; it does not replace the hand-reach
comparison. Generate its seven cases with:

```sh
for motion in x y z roll pitch yaw combined; do
  python scripts/wbc/generate_balance.py --motion "$motion" \
    --output "/tmp/wbc-balance-$motion.npz" \
    --playback-json "public/assets/demos/wbc/balance/$motion.json"
done
python scripts/wbc/update_preview.py
```

The active motion task tracks the full pose of `base_link` with weight 10.
Weak joint-posture regularization uses weight 0.001. There is no hand task,
fixed-CoM task, or separate torso task. Contacts and actuator/joint bounds use
the same construction as the reach example. CoM is an output of the motion,
not a separate controlled reference.

Each eight-second cycle starts and ends at neutral. A quintic phase advances a
sine through positive and negative targets with zero endpoint velocity and
acceleration. X/Y amplitudes are 20 mm, Z is 15 mm, and single-axis rotations are
3 degrees. The combined case uses 15 mm X, 10 mm Y, and a rotation vector of
2 degrees about each of world Y and Z, scaled by the same phase. It is an
axis-angle rotation-vector construction, not independent Euler interpolation.

Frames include current and desired pelvis poses (`base`, `base_target`) in
x y z qx qy qz qw order. Each case has 201 samples at 25 Hz from a 1 kHz solve.
The browser plays independently computed cycles and does not blend solutions
or offer a live arbitrary six-axis solver. Small supported pose tracking is
not a demonstration of disturbance recovery or impact dynamics.

## WBC 04: one-state task combination

`generate_task_comparison.py` replaces the 2D toy examples with a computed Talos
snapshot. Run it from the repository root in the environment above:

```sh
env -u PYTHONPATH PYTHONNOUSERSITE=1 OPENBLAS_NUM_THREADS=1 \
  /home/dk/miniconda3/envs/wbc-blog/bin/python scripts/wbc/generate_task_comparison.py
```

It writes `src/lib/demos/data/wbc-task-comparison.json`. The data records the URDF
hash, Pinocchio/SciPy versions, matrix ranks, constraints, and residual checks.
The state is half-sitting at zero velocity; a 0.30 m position error with Kp=100
requests 30 m/s² forward hand acceleration. The other hand translation axes,
CoM acceleration, and posture acceleration have zero references. There is no
hand orientation or torso task in this comparison.

The weighted QP and three lexicographic levels share 94 variables: 38 generalized
accelerations, 32 torques, and 24 point-force components. Hard constraints are
all dynamics rows, two stationary sole spatial accelerations, URDF torque limits,
±10 rad/s² actuated acceleration limits, four unilateral friction-pyramid point
forces per sole (mu=0.3), and 5–1000 N normal force per sole. Four support points
per foot are (±0.10, ±0.065, 0) metres. Point forces are sole-local; the force
mapping produces world-aligned sole-origin wrenches paired with LWA Jacobians.
This comparison has no joint prediction bounds, collision constraints, contact
switches, or integration.

SciPy SLSQP solves the quadratic subproblems after eliminating equalities by SVD.
The NP example is equality-only: foot-consistent reach, primary-space projection,
then re-solving the hand task in the combined foot/CoM nullspace. It does not
solve inverse dynamics or prove force feasibility. It exceeds the acceleration
cap imposed by QP/HQP at this snapshot.

The QP contour plane contains a static-reference solution and the full QP/HQP
solutions. Inequalities clip that plane; a display window only crops the plot.
The polygon clipping tolerance is 1e-6; solver and hierarchy residuals are checked
separately at 1e-5. The plot is not a replacement for the full 94-variable solve.
The mesh remains at the input state and uses QP support-force arrows. Browser
animation interpolates plotted task outputs or cost contours, not robot dynamics
or solver iterations. These are offline calculations, not real-time benchmarks
or physical stability evidence.

### NP SVD animation

The NP panel uses the full SVD of P = [Jc; Jcom]. At this state P has rank 15,
and V0 contains 23 orthonormal nullspace directions. Exported alpha and beta
coefficients reconstruct the original foot-consistent acceleration. The panel
removes alpha, checks all 15 primary outputs, then changes beta to the
least-squares solution of Jh V0 beta = bh. The generator compares both filtered
and re-solved accelerations against the existing projector construction, and
checks P V0 and reconstruction errors below 1e-8. Exported P, Jh, Vr, and V0 let
the browser calculate the task residuals from the displayed coefficients.
Bars use one fixed scale. The Euclidean metric includes the chosen generalized
acceleration coordinate scaling; coefficients are not individual joint commands.
All six steps use Previous/Next with 600 ms interruptible transitions.

## Planar arm null-space introduction

`generate_nullspace_toy.py` computes a separate planar 3R kinematic example.
Run it with the same isolated Python environment to write
`src/lib/demos/data/wbc-nullspace-toy.json`. Link lengths are [1, .8, .6] m,
initial joint angles [0.2, 1.5, -1.6] rad, and the joint-3 posture goal is -2.1 rad.
The unfiltered velocity is z=[0,0,2*(q3_goal-q3)] rad/s; the filtered velocity
is (I-J†J)z, where J is the 2x3 endpoint-position Jacobian. RK4 at 5 ms recomputes
J and the projector at every substage over three seconds. No endpoint pinning,
post-integration correction, dynamics, torque limits, or collision checks are
used. The generator aborts near a singularity or if projected endpoint drift
exceeds 1e-7 m. Exported frames contain actual FK points and task-velocity/error
metrics. The UI replays this computed interval over a 2.4 s motion transition.

### Smooth timing and 3D command space

The toy trajectory now multiplies both velocity commands by
c(t)=30u²(1-u)², u=t/T. This is the derivative of quintic progress and preserves
the integral virtual duration T while starting/ending at zero velocity and
acceleration. Every exported sample stores qdot. The browser uses cubic Hermite
interpolation in joint coordinates and recomputes FK and J; the generator also
checks endpoint drift at nine interpolation locations per sample interval.
The moving step replays over 2.4 s, with Previous/Next always available.

`WbcNullspaceSpaceScene` renders the actual three-dimensional joint-velocity
space, with a nullspace line and perpendicular row-space plane. For rank-two
J, its row cross product gives a unit null vector n and N=n nᵀ. The unscaled
posture request z, allowed Nz, and removed (I-N)z use the same rad/s scale.
The common time envelope is factored out of the arrows. Spaces are recomputed
from the current interpolated posture, rather than kept at the initial pose.

### Whole-space projection

The toy panel now has five steps. It starts from a 5x5x5 lattice in joint-velocity
space, applies Ny=I-Jy†Jy to show a rank-one height constraint collapsing it onto
a plane, then applies the full endpoint projector Nxy to collapse that plane onto
a line. Ny and Nxy use the same current planar-arm Jacobian; the nested nullspaces
ensure Nxy Ny=Nxy. All 125 samples and all 300 connecting edges are transformed,
with a faint original bounding cube for reference. During an animated transition
the interpolated linear map need not be an idempotent projector; completed stages
are the exact maps. The height-only step is geometric; replayed robot trajectories
continue to use the full two-coordinate endpoint constraint.
