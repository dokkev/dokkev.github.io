---
title: "Fingertip Design 08: Then I Added a Hole"
description: An internal void changes a single-domain deformation problem into zero-clearance self-contact with multiplier and crosspoint constraints.
layout: distill
editorial: true
published: true
hidden: false
date: 2026-07-23 08:08:00
permalink: /fingertip-design/08-added-a-hole/
img: assets/img/fingertip-design/geometry-four-cases.webp
tags: [Robotics, Hardware Development, Fingertip Design, FEM]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 08 / 10 · DIAGNOSTIC BLOCKER</p>

The no-void fingertip reached 1.5 mm indentation on medium and fine meshes. Its force curve was smooth, its displacement field remained finite, and its sidewall signatures were reproducible.

Then the internal stem–pad contact was enabled.

The first nonlinear step failed.

The geometry was symmetric. Only the right-side internal pair was sufficient to reproduce the failure. Reversing the right boundary order made the physical normal wrong. Joining the three internal pairs into one continuous U-shaped contact did not recover convergence.

The problem was not “a hole makes the fingertip softer.” The hole changed the mathematical structure of the model.

## From one continuum to multiple constraint states

The no-void external baseline has one deformable pad domain, a rigid inclusion bonded into the assembly, and one external contact pair that activates on the free outer arc.

An internal clearance introduces additional boundaries:

- left stem wall against left pad cutout,
- right stem wall against right pad cutout,
- stem bottom against pad cutout bottom.

When $w_v=h_v=0$, each pair begins with zero normal gap. The contact algorithm must decide their active states at the reference configuration.

At the upper endpoints, an internal contact boundary meets the bonded pad–plate boundary. These points are **crosspoints**: one part of the kinematics is constrained by the bond while the contact formulation may still allocate an independent pressure multiplier.

The resulting system is saddle-point-like:

$$
\begin{bmatrix}
\mathbf{K} & \mathbf{G}^{T}\\
\mathbf{G} & \mathbf{0}
\end{bmatrix}
\begin{bmatrix}
\Delta\mathbf{u}\\
\Delta\boldsymbol{\lambda}
\end{bmatrix}
=
-
\begin{bmatrix}
\mathbf{r}_u\\
\mathbf{r}_c
\end{bmatrix}.
$$

If an active multiplier row has no effective coupling to a free displacement direction, the lower block contributes an algebraic constraint without a usable primal trace. The system can become singular or nearly singular.

## Isolation changed the diagnosis

The internal contact was tested in controlled variants:

- no internal contact,
- left only,
- right only,
- bottom only,
- left + right,
- all three pairs,
- continuous U-shaped contact.

The important result was:

- external-only: solved,
- bottom-only: solved,
- left-only: converged,
- right-only: reproduced the first-step failure.

That immediately ruled out the mixed solid as the general cause. The same solid, mesh, material, and external contact worked when the right internal pair was absent.

It also showed that a visually symmetric model could enter an asymmetric runtime state.

## Source symmetry was not enough

The audit checked:

- source geometry,
- boundary ordering,
- physical normals,
- nodal normals,
- semantic boundary membership,
- master/slave roles,
- initial gaps.

The left and right source contracts were mirrored correctly.

The first asymmetry appeared **after contact search**.

At the right upper endpoint, the search generated:

1. the valid pair with the intended adjacent master segment,
2. an extra pair with the neighboring lower master segment.

The extra pair projected outside the segment domain with a parameter value of 2.0. Its local multiplier row contribution was exactly zero. The endpoint multiplier nevertheless remained active during the failed first step.

At the mirrored left endpoint, only the valid pair was generated, and that endpoint became inactive during nonlinear iteration.

The most data-consistent interpretation is:

> The search asymmetry acts as a trigger that leaves an already fragile bonded–contact crosspoint multiplier active.

That is still a working interpretation, not a proven library-level root cause.

## The zero row was local and constraint-dependent

The right endpoint had fully prescribed displacement components through the bonded/rigid boundary. Its contact pressure multiplier remained free.

For the valid local pair, the multiplier row had substantial coupling before Dirichlet elimination, but almost none to the remaining free displacement columns:

$$
\lVert \mathbf{g}_{\lambda,\text{free}}\rVert
\approx 6.31\times10^{-17}.
$$

The out-of-domain extra pair contributed an exactly zero local row.

The mirrored left endpoint was also weak after Dirichlet elimination, so endpoint fixity alone was not a sufficient explanation. In a minimal mirrored patch, fixed endpoints retained nonzero coupling through neighboring free slave traces. A blanket rule that removes every fixed-endpoint multiplier would therefore delete valid physical coupling in other cases.

This is why the tempting “just constrain or remove the multiplier” patch was rejected.

## Why the obvious fixes were not adopted

Several interventions could make the matrix easier to solve:

- reverse condition ordering,
- fix selected multiplier DOFs,
- deactivate the endpoint by node ID,
- omit all crosspoint multipliers,
- increase penalty or Newton iterations.

None was accepted as a production correction.

- Reversing the right side produced a physically incorrect zero nodal normal.
- A node-ID rule is mesh-dependent.
- Topology-only endpoint exclusion was overbroad in the minimal patch.
- The installed Kratos 10.3 interface exposed no supported pre-DOF multiplier-basis restriction or complete condensation hook for this condition.
- More Newton iterations cannot repair a missing algebraic coupling.

The final status remained:

```text
Mixed hyperelastic solid:        ADOPT
External contact baseline:       PASS
Zero-clearance internal contact: BLOCKED
Production crosspoint remedy:    NOT VERIFIED
```

## The research lesson is larger than the bug

An internal void is often introduced as a compliance feature. In a real manufactured fingertip, the cavity may close, slide, stick, wrinkle, or trap air. In simulation, each of those behaviors requires a contact and interface model.

The design variable therefore changes two things at once:

1. the physical deformation route,
2. the numerical constraint topology.

If a geometry optimizer is allowed to create or remove internal contacts without tracking that topology, it may compare solver artifacts instead of fingertip designs.

This is also why the solid baseline remains scientifically valuable. It provides a trustworthy deformation-transfer reference while the internal-contact formulation is unresolved.

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/geometry-four-cases.webp" alt="Four internal clearance topologies for the LIT fingertip">
  <p class="caption">The four geometries are not only different amounts of removed material. They begin with different sets of coincident and separated internal surfaces.</p>
</div>

## What comes next

A verified internal-contact study needs one of the following:

- a contact formulation with explicit crosspoint multiplier treatment,
- a physically justified compliant or tied transition near the bonded endpoint,
- a small positive manufactured clearance that avoids coincident initialization,
- or a different structural topology that removes the contact–bond crosspoint.

Each option changes the physical model and must be justified as a design decision, not hidden as solver stabilization.

The mechanics series now reaches a clean boundary. The no-void model shows distinct location-dependent deformation. The void model exposes a real unresolved contact topology. Neither result tells us what the camera sees.

---

[Previous: Can Contact Location Be Read from Deformation?](/fingertip-design/07-contact-location/) · [Series index](/fingertip-design/) · [Next: Mechanical Separability Is Not Sensing](/fingertip-design/09-mechanics-vs-sensing/)
