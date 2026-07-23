---
title: "Fingertip Design 06: A Solid Fingertip Was Easy"
description: The no-void external-contact baseline establishes a trustworthy deformation field without pretending to validate internal contact.
layout: distill
editorial: true
published: true
hidden: false
date: 2026-07-23 08:06:00
permalink: /fingertip-design/06-solid-fingertip/
img: assets/img/fingertip-design/solid-indentation-1p5mm.webp
tags: [Robotics, Hardware Development, Fingertip Design, FEM]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 06 / 10 · BASELINE PASS</p>

After the mixed solid and external contact formulation were validated separately, the obvious next step was to run the actual fingertip.

The default geometry looked simple: a rigid plate and stem inserted into a compliant half-ellipse pad, with zero side and bottom clearance.

Numerically, it was not simple. The coincident internal stem–pad surfaces introduced three zero-clearance contact pairs and caused a rank-deficient first step.

Instead of tuning that failure until it disappeared, the internal contact was removed from the baseline. The zero-clearance geometry retained its declared upper bonded interface, while only the external rounded-indenter contact remained active.

This was not a workaround presented as the final design. It was a controlled question:

> Can the adopted mixed solid and external contact produce a trustworthy deformation map on the real outer fingertip geometry?

The answer was yes.

## The baseline contract

The external-contact-only model used:

- `void_width = 0`,
- `void_height = 0`,
- no internal ALM process or generated internal contact conditions,
- one external pair: `PadOuterArc` against `IndenterContactArc`,
- mixed finite-strain T3 elements,
- plane-strain hyperelasticity,
- $\nu=0.49$,
- 48 displacement-controlled steps to 1.5 mm indentation.

Although Kratos added scalar contact multiplier DOF objects broadly through its auxiliary setup, the assembled multiplier rows belonged only to the external pair. No internal-exclusive multiplier entered the system.

That distinction matters. Counting DOF objects is not the same as checking which DOFs are assembled into the equations.

## Medium and fine meshes agreed on the engineering outputs

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/solid-indentation-1p5mm.webp" alt="Deformed mixed-element LIT fingertip at 1.5 millimeter indentation">
  <p class="caption">Phase 4J medium model at 1.5 mm indentation. The displacement scale is 1×.</p>
</div>

The two production-scale cases reached all 48 steps:

| Case | Mesh   | Final reaction | Minimum $\det(F)$ | Maximum strain | Maximum Newton iterations |
| ---- | ------ | -------------: | ----------------: | -------------: | ------------------------: |
| J1   | medium |     0.861926 N |           0.76282 |        0.17165 |                         3 |
| J2   | fine   |     0.864680 N |           0.69839 |        0.17278 |                         3 |

The final reaction difference was 0.319%, well below the 10% gate.

Both force curves were monotonic and smooth. Every load step passed finite-field, positive-$\det(F)$, force-equilibrium, active-set, penetration, and volumetric-checkerboard checks.

The minimum $\det(F)$ was lower on the fine mesh. That is not automatically a contradiction. A finer mesh can resolve a more localized deformation minimum that a coarser mesh smears. The key facts are that it remained positive and that the primary reaction and profile outputs remained close.

## The force curve is necessary but not sufficient

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/solid-reaction-curve.webp" alt="Reaction force versus indentation for the no-void fingertip baseline">
  <p class="caption">The reaction rises smoothly over the 1.5 mm loading path. A smooth global curve does not by itself establish a trustworthy spatial field.</p>
</div>

The reaction–indentation curve is useful because discontinuities can reveal branch jumps, contact instability, or numerical failure.

Its external-work proxy is

$$
W_\text{ext}
\approx
\int_0^{\delta_\text{max}} F_n(\delta)\,d\delta.
$$

Using trapezoidal integration, the medium and fine cases gave approximately 0.59817 and 0.60065 N·mm.

This quantity was intentionally called a proxy. `STRAIN_ENERGY` was not an accepted runtime output in the preceding validation, so a new energy acceptance metric was not invented after the run.

That bookkeeping prevents a common failure mode in research code: promoting whichever quantity is easiest to plot into a physically stronger claim than the solver interface supports.

## The important output was the outer arc

The baseline was not built only to estimate stiffness. Its purpose was to provide a full displacement field from which a sensing-oriented observation could be extracted.

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/solid-outer-arc-profiles.webp" alt="Outer arc displacement profiles during no-void fingertip indentation">
  <p class="caption">The outer boundary moves as a distributed field. The sidewall profile is the mechanical signal available to a remote optical observer.</p>
</div>

The outer arc connects the object-facing crown to the bonded side regions. During indentation, the crown deforms strongly, but the sidewalls also move. That far-field motion is what a wrist or internal camera could potentially use.

The baseline therefore established:

- a stable external-contact solve,
- an orientation-preserving displacement field,
- a reproducible outer-arc observation,
- and close medium/fine global response.

It did not establish:

- that internal clearance improves the response,
- that the pressure field is fully verified at every off-center location,
- that a camera can distinguish the deformations,
- or that the design is optimal.

## “Easy” means the problem class stayed controlled

The solid fingertip was easy only relative to what came next.

With one external contact pair, the active contact region formed on a free outer surface. There was no internal bonded–contact crosspoint, no initially coincident stem wall, and no internal multiplier whose displacement trace was already constrained by the rigid attachment.

The baseline removed a difficult topology while keeping the outer geometry, material formulation, and observation question intact.

That is good experimental design in simulation. When the complete system fails, simplify the **constraint structure** without changing every other variable. A passing reduced model tells us which parts are not responsible.

The next article uses this baseline at multiple contact locations. The goal is no longer only “does it solve?” It is “does contact location leave a distinct mechanical signature on the sidewalls?”

---

[Previous: A Converged Contact Solver Can Still Be Wrong](/fingertip-design/05-contact-solver/) · [Series index](/fingertip-design/) · [Next: Can Contact Location Be Read from Deformation?](/fingertip-design/07-contact-location/)
