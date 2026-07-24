---
title: "Fingertip Design 04: Why Silicone FEM Lies So Easily"
description: Nearly incompressible elastomers expose volumetric locking, unstable formulations, and false-positive solver success.
layout: distill
editorial: true
published: true
hidden: true
date: 2026-07-23 08:04:00
permalink: /fingertip-design/04-silicone-fem/
img: assets/img/fingertip-design/medium-mixed-t3-mesh.webp
tags: [Robotics, Hardware Development, Fingertip Design, FEM]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 04 / 10 · VALIDATED NUMERICS</p>

Silicone is difficult to simulate for a reason that is easy to hide in a good-looking contour plot: it changes shape much more readily than it changes volume.

For a linear elastic material,

$$
K
=
\frac{E}{3(1-2\nu)},
$$

where $K$ is bulk modulus, $E$ is Young's modulus, and $\nu$ is Poisson's ratio. As $\nu$ approaches $0.5$, the bulk modulus grows rapidly. The material can shear and distort, but volumetric deformation becomes expensive.

That is physically reasonable for a nearly incompressible elastomer. It is numerically dangerous for a displacement-only finite element.

## Volumetric locking is artificial stiffness

A low-order displacement element may not have enough kinematic freedom to satisfy near-incompressibility while also representing the actual deformation. Instead of finding the correct nearly volume-preserving shape, it suppresses deformation altogether.

The result is **volumetric locking**:

- the simulated structure appears too stiff,
- reaction force becomes mesh- and formulation-dependent,
- deformation patterns can look smooth while being quantitatively wrong,
- and refining the mesh may not fix the underlying constraint problem efficiently.

This matters directly for fingertip design. If a void appears to “reduce stiffness,” the result is useless when the solid reference was artificially stiff. Geometry optimization will exploit the numerical artifact.

## The benchmark came before the fingertip

The `lit_ws` validation did not begin with the full pad. It first separated three questions:

1. Can the Kratos build solve a finite-strain hyperelastic solid?
2. Can it solve frictionless contact?
3. Which element formulation remains reliable near $\nu=0.49$?

The nearly incompressible benchmark used a 10 mm by 10 mm, 1 mm-thick plane-strain block under prescribed compression. The production candidate became:

```text
Element:
  TotalLagrangianMixedVolumetricStrainElement2D3N

Constitutive law:
  HyperElasticPlaneStrain2DLaw

Primary unknowns:
  DISPLACEMENT_X
  DISPLACEMENT_Y
  VOLUMETRIC_STRAIN
```

The mixed T3 formulation adds volumetric strain as an independent nodal unknown. It does not force the displacement interpolation alone to carry the incompressibility constraint.

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/medium-mixed-t3-mesh.webp" alt="Medium triangular mixed-element mesh of the LIT fingertip">
  <p class="caption">The adopted fingertip mesh uses three-node mixed volumetric-strain elements. The element choice is part of the physical model, not a plotting preference.</p>
</div>

## Why identical mesh forces were not enough

At $\nu=0.49$, the mixed T3 compression benchmark gave a final reaction of approximately $7.057615$ N on coarse, medium, and fine meshes. The medium–fine difference was effectively numerical zero.

That sounds like perfect mesh convergence. It is not a result that can be generalized to the fingertip.

The benchmark deformation was close to affine, and a P1 triangle can represent that deformation exactly. The exercise behaved like a nonlinear patch test. It established formulation consistency for the simple field. It did not prove that contact, curved geometry, or localized strain would be mesh-independent.

This distinction is essential:

> A benchmark should validate the mechanism it was designed to test, not every mechanism that will appear later.

## Why $\nu=0.499$ was rejected

If $\nu=0.49$ is nearly incompressible, why not use $0.499$ and get closer to the ideal?

Because a more extreme parameter is not automatically a more accurate model.

In the current benchmark:

- the $\nu=0.499$ medium case became non-finite at 30% compression,
- the fine case completed but required as many as 11 Newton iterations,
- and its elementwise $\det(F)$ range widened to approximately $0.8553$–$1.1056$.

The coarse and fine final reactions were close, but the medium failure broke the expected refinement behavior. The formulation was therefore adopted at $\nu=0.49$ and not adopted at $\nu=0.499$.

This is an engineering choice, not a claim that all silicone has $\nu=0.49$. The model parameter must eventually be identified from material tests. The numerical system must first show that it can handle the chosen range reliably.

## A solver can return success with non-finite fields

One of the most useful failures came from the ordinary total-Lagrangian comparison.

The fine displacement-only case reached 8% compression and returned `True` from `SolveSolutionStep()`. Independent field validation then found non-finite displacement and reaction values.

This is the difference between **algorithmic return status** and **physical acceptance**.

A production load step needs more than a boolean:

```text
DISPLACEMENT              finite
REACTION                  finite
VOLUMETRIC_STRAIN         finite
elementwise det(F)        positive and finite
force curve               smooth and monotonic
mesh-scale oscillation    absent
```

For contact cases, gap, pressure, active-set state, and force closure must be added.

## What $\det(F)$ protects

The deformation gradient $\mathbf{F}$ maps a material neighborhood from the reference configuration to the current configuration. Its determinant

$$
J = \det(\mathbf{F})
$$

measures local area change in the 2D kinematics used here.

- $J>0$ preserves orientation.
- $J\rightarrow0$ indicates local collapse.
- $J<0$ indicates element inversion.

The mixed element did not expose the desired integration-point deformation gradient through the current runtime interface, so `lit_ws` computed $\mathbf{F}$ from each affine T3's reference and current nodal edge matrices. The area-weighted mean was cross-checked against the global deformed-area ratio.

That agreement is a consistency check, not an independent validation—the two quantities are geometrically linked for affine triangles. It is still better than accepting a mesh because the picture looks plausible.

## The adopted numerical contract

For the 2D baseline, the current contract is:

- plane strain,
- mixed finite-strain T3 solid,
- hyperelastic constitutive law,
- $\nu=0.49$,
- medium/fine comparison for nonuniform problems,
- independent finite-value and $\det(F)$ checks.

It does not establish the final three-dimensional fingertip behavior. It establishes a numerical floor below which geometry conclusions should not be trusted.

The next difficulty is contact. A contact algorithm can converge while using an under-resolved pressure field, a wrong master/slave direction, or an unverified contact resultant. Conversely, a formally failed acceptance gate can preserve a perfectly usable displacement field. We need a richer definition of “correct.”

---

[Previous: Where Does the Internal Structure Send Deformation Energy?](/fingertip-design/03-deformation-path/) · [Series index](/fingertip-design/) · [Next: A Converged Contact Solver Can Still Be Wrong](/fingertip-design/05-contact-solver/)

## Implementation reference

The adopted element and its runtime contract are recorded in the `lit_ws` hyperelastic-contact validation. The corresponding Kratos implementation is in the official [Kratos StructuralMechanicsApplication source](https://github.com/KratosMultiphysics/Kratos/tree/v10.3.0/applications/StructuralMechanicsApplication).
