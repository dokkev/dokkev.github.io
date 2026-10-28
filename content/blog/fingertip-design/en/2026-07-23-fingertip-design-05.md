---
title: "Fingertip Design 05: A Converged Contact Solver Can Still Be Wrong"
description: Contact validation requires active-set stability, force closure, positive deformation, and mesh-aware field checks—not only Newton convergence.
layout: distill
editorial: true
published: true
hidden: true
date: 2026-07-23 08:05:00
permalink: /fingertip-design/05-contact-solver/
img: assets/img/fingertip-design/solid-indentation-1p5mm.webp
tags: [Robotics, Hardware Development, Fingertip Design, FEM]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 05 / 10 · VALIDATED NUMERICS</p>

Contact is not a boundary condition that stays fixed while Newton's method solves the material. The solver is also deciding which surfaces are active, which nodes own contact multipliers, and where force is transmitted.

A small change in displacement can activate a node. That changes the algebraic system. The new system can push the node out of contact, changing it again. A Newton residual may decrease inside each temporary system while the contact state itself cycles.

This is why “the solver converged” is neither a necessary nor a sufficient physical verdict.

## The first fine-mesh failure was not material divergence

The localized validation pressed a rounded rigid indenter into a nearly incompressible hyperelastic block using frictionless augmented-Lagrangian mortar contact.

On the initial 48-step setup:

- coarse and medium meshes reached 0.5 mm indentation,
- the fine mesh stopped at step 23,
- all recorded fields remained finite,
- the minimum $\det(F)$ remained positive,
- and the last converged force curve was smooth.

The failure was an **active-set cycle**, not an inverted solid.

From iteration 5 onward, the fine case entered a period-11 multi-state pattern. Active slave nodes and reaction force repeated rather than settling. Increasing the maximum Newton iteration count would only let the cycle continue longer.

That diagnosis protected the solid formulation. Without iteration-level contact state, the same failure could have been blamed on hyperelasticity, mesh density, or an aggressive load.

## Master and slave are not labels

In mortar contact, the master/slave choice determines interpolation, search behavior, and multiplier ownership.

The initial runtime placed the deformable block top as `MASTER` and the rounded indenter as `SLAVE`. Recovery reversed the roles:

```text
MASTER = rigid rounded indenter
SLAVE  = deformable block top
```

The final 96-step recovery also halved the displacement increment while preserving the same total indentation. No fine-only penalty tuning or extra Newton budget was used.

All three meshes then converged through 0.5 mm:

| Mesh   | Final reaction | Minimum $\det(F)$ | Pressure roughness | Maximum Newton iterations |
| ------ | -------------: | ----------------: | -----------------: | ------------------------: |
| Coarse |     0.396967 N |          0.692145 |           0.743654 |                         3 |
| Medium |     0.466330 N |          0.767874 |           0.241555 |                         3 |
| Fine   |     0.500125 N |          0.854401 |           0.092973 |                         3 |

The medium–fine reaction difference was 6.757%, below the predeclared 10% gate. All force curves were smooth and monotonic, every active set converged, and all solid elements preserved positive $\det(F)$.

## A formal failure can still contain an adopted model

The original Phase 3R acceptance required pressure roughness below 0.5 on **every** mesh. The coarse result was 0.743654, so the literal overall status remained `FORMAL FAIL`.

That status was preserved instead of rewritten after seeing the result.

But the coarse contact patch had only three nonzero pressure nodes. It did not have enough spatial resolution to represent a smooth pointwise pressure field. Roughness dropped rapidly with refinement:

$$
0.743654
\;\rightarrow\;
0.241555
\;\rightarrow\;
0.092973.
$$

The application decision was therefore more specific:

- mixed solid: **adopt**,
- $\nu=0.49$: **adopt**,
- frictionless ALM mortar contact: **conditional adopt**,
- coarse pointwise pressure: **do not adopt**.

A single PASS/FAIL field could not express that result without losing information.

## Reaction force and contact pressure must close

The rigid indenter reaction is the canonical external force:

$$
F_n = -\sum_{\text{indenter}} R_y.
$$

The contact field provides another estimate by integrating the pressure over the slave surface. In the current Kratos runtime, the diagnostic uses `NODAL_AREA` multiplied by `AUGMENTED_NORMAL_CONTACT_PRESSURE`, projected onto the loading direction.

These values should agree within a declared tolerance:

$$
\epsilon_F
=
\frac{|F_\text{contact}-F_n|}
{\max(|F_n|,F_\text{floor})}.
$$

If closure fails, contact centroid and contact length are not trusted, even if displacement and reaction remain usable.

This exact distinction appears later in the CODTM sweep: every location solve completed, but right-side pressure-resultant closure exceeded 2% in some cases. The mechanical displacement signatures were retained while contact centroid and length were marked unavailable.

## Penetration needs a geometric domain

Another diagnostic failure came from post-processing rather than the solver.

An early penetration calculation projected every node on the full outer arc onto a much smaller indenter. Nodes that were nowhere near the active contact produced an apparent penetration as large as 12.5 mm.

The fix was not a different contact penalty. It was a correct measurement domain: external penetration is evaluated only on the actual active slave nodes.

This is a recurring lesson in simulation:

> A correct field sampled on the wrong set can produce a physically absurd metric.

## The minimum acceptance stack

For each contact load step, the current fingertip workflow checks:

| Check                            | Failure it catches                          |
| -------------------------------- | ------------------------------------------- |
| finite displacement and reaction | numerical overflow hidden by solver status  |
| positive elementwise $\det(F)$   | collapse or inversion                       |
| finite gap and pressure          | corrupted contact state                     |
| stable active set                | cycling between changing constraint systems |
| force closure                    | inconsistent contact resultant              |
| smooth, monotonic force curve    | step-level discontinuity or branch jumping  |
| medium/fine comparison           | discretization sensitivity                  |
| pressure roughness               | under-resolved local contact field          |
| volumetric checkerboard metric   | mesh-scale mixed-field oscillation          |

No single check proves the model correct. Together they make failure classification much more informative.

## What convergence really means

Newton convergence means that one discretized system satisfied its residual tolerance. It does not prove:

- that the system represents the intended contact topology,
- that the active surfaces are physically correct,
- that the pressure field is spatially resolved,
- that the force balance closes,
- or that a different mesh gives the same engineering conclusion.

For fingertip design, the useful output is not “Kratos returned success.” It is a traceable statement such as:

> The displacement field and reaction are finite, orientation-preserving, smooth over load, consistent across medium and fine meshes, and accompanied by a contact field whose resultant closes within 2%.

That is a longer sentence. It is also much closer to what the next design decision needs.

---

[Previous: Why Silicone FEM Lies So Easily](/fingertip-design/04-silicone-fem/) · [Series index](/fingertip-design/) · [Next: A Solid Fingertip Was Easy](/fingertip-design/06-solid-fingertip/)
