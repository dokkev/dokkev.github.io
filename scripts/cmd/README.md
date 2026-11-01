# Three structures under prescribed loading

The `/whatiscmd/` demo compares Hybrid, Compliant, and Solid structures under
normal, cyclic, and frictional lateral platen motion. Every displayed loading
path comes from a Newton dynamics solve. There is no force-curve lookup
controller or reversed-frame cyclic replay.

## Geometry

`structural_geometry.py` builds three 12 mm extruded sections. Their common
outer profile is a 30 × 5 mm rectangle plus a semiellipse with horizontal
radius 15 mm and vertical radius 9 mm, giving a 14 mm contact-side depth.

- Hybrid: a T-shaped rigid carrier consists of a 30 × 2 mm backing bar and a
  7.6 mm wide stem extending 6 mm into the pad. The soft mesh removes only the
  volume occupied by that stem. There is no lateral void or intentional gap.
  All silicone nodes on the stem sides/tip and backing plane are bonded.
- Compliant: fourteen pointy hexagonal through-channels of 1.8 mm circumradius.
  Horizontal pitch 4.2 mm; row pitch 3.65 mm; alternate rows offset 2.1 mm.
  Coordinate tests retain an outer skin. Nodes at the backing plane are bonded.
- Solid: the same outer envelope is filled, with backing-plane nodes bonded.

The two non-hybrid cases share the backing bar, without an internal stem.
The soft material law and outer envelope match; soft material volume and mass
do not. Gmsh 4.15.2 generates positively oriented TET4 meshes at 0.8 mm target
size. Generated VTK meshes are ignored by Git. The physical model uses positive
z toward the platen; the website places the backing above the pad.

## Run in sequence

Use isolated Newton and Drake environments:

```sh
python -m pip install -r scripts/cmd/requirements-newton.txt
env -u PYTHONPATH OPENBLAS_NUM_THREADS=1 python scripts/cmd/generate_loading_cases.py
# Separate environment:
python -m pip install -r scripts/cmd/requirements.txt
env -u PYTHONPATH python scripts/cmd/compare_structural_drake.py
# Return to the Newton environment (Shapely is included there):
env -u PYTHONPATH python scripts/cmd/publish_loading_cases.py
```

The first two commands update the ignored intermediate
`scripts/cmd/meshes/structural-loading.json`; do not run them concurrently.
The publisher unions contact triangles into boundary rings, retains holes, and
splits the public payload into `structural-normal.json`, `structural-cyclic.json`,
and `structural-lateral.json`. The UI fetches and caches only the selected mode.
Display positions are rounded to 0.001 mm; patch outlines are snapped at
0.001 mm and simplified at 0.002 mm. Reported patch areas retain the original
clipped-triangle values. A maximum 0.1 mm² outline/area discrepancy is enforced. `generate_structural_contact.py` supplies the shared
Newton model and stepping kernel, rather than an independent data pipeline.

Newton 1.6.0 / Warp 1.17.0 uses `SolverVBD`, 30 iterations, stable Neo-Hookean
material (E=100 kPa, nu=0.35, density 1000 kg/m³), element damping 0.01, and a
0.5 ms time step. Mass-proportional damping multiplies velocity by exp(-200*dt)
before each step. All rigid objects are fixed or kinematic; the solver explicitly
uses `rigid_compliant_alm=False`. Self-contact is off, so cell-wall contact
after collapse is outside the model. These are illustrative numerical settings,
without a material fit, spatial mesh convergence study, or hardware validation.

Contact uses vertex normal penalties (ke=5000 N/m, zero normal damping), a
5 µm particle radius, and a 0.5 mm detection margin. Platen friction is 0.6;
carrier-shape friction is zero, with its soft interfaces fixed by bonding.
Friction regularization uses a 0.1 mm/s threshold. Platen dimensions are
34 × 32 × 50 mm. The initial platen position compensates the particle radius.

## Prescribed loading

- Normal: d = 2.4 mm * smoothstep(t/1.2), over 1.2 s.
- Cyclic: d = 1.2 mm * (1 - cos(pi*t)), over 4 s, giving two 2 s cycles.
- Lateral: preload d = 1.5 mm * smoothstep(t/0.6), followed by
  x = 3 mm * smoothstep((t-0.6)/2), over 2.6 s total. Hold d at 1.5 mm during
  translation. Contact generates shear and sliding through the friction law.

All three structures receive the same trajectory, rather than matched force.
Snapshots are saved every 50 ms. The soft-body deformation is integrated
through both loading and release. Hyperelasticity is not a viscoelastic material
model; hysteresis in these trajectories can include friction, mass/element
damping, and finite-rate dynamics. No physical fatigue claim is made.

## Reactions and contact patch

Normal and tangential platen reactions are reconstructed from the solver's
final contact rows, per-row penalty, friction coefficient, particle previous
positions, and effective rigid-body history. The implementation matches Newton
1.6's normal penalty and regularized Coulomb law. Below the smoothing threshold,
the reciprocal slip continuation is `(2 - u/eps)/eps`, not `1/max(u,eps)`.
Positive normal reaction opposes compression; negative lateral reaction
opposes positive platen translation.

The patch estimate clips outward-facing boundary triangles against the platen
plane including the contact radius, then sums their projected areas. Colored
polygons show those projected pieces. Dots mark active platen contact nodes;
their tooltips report discrete normal nodal force, not pressure. The estimate
is mesh- and penalty-dependent and does not identify sticking/sliding regions
or constitute a measured pressure image. The platen remains broad enough to
cover the contact region over the specified motion.

Each snapshot checks finite particle positions and minimum deformation
Jacobian above 0.15; contact buffer saturation raises an error. The UI
interpolates front-face positions and force between snapshots, while patch
geometry uses the nearest recorded snapshot.

## Drake overlay

`compare_structural_drake.py` loads the nominal VTK soft meshes and queries
hydroelastic pressure traction against a rigid platen. One hydroelastic modulus
is calibrated to Solid's finite-rate normal reaction at 0.5 mm, then used for
all three shapes. Dashed curves stop at 1 mm. This query does not solve the
embedded insert constraint, cellular deformation, cyclic motion, or lateral
friction dynamics. The modulus is a contact-model parameter, not the material
Young's modulus. This is not a ranking of the engines against hardware or a
comparison of every available deformable model.
