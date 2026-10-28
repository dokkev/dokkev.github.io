---
title: "Fingertip Design 03: Where Does the Internal Structure Send Deformation Energy?"
description: Why a bonded dorsal plate and internal stem change the deformation path even when the exterior pad is unchanged.
layout: distill
editorial: true
published: true
hidden: true
date: 2026-07-23 08:03:00
permalink: /fingertip-design/03-deformation-path/
img: assets/img/fingertip-design/displacement-vector-atlas.webp
tags: [Robotics, Hardware Development, Fingertip Design]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 03 / 10 · MODEL INTERPRETATION</p>

Pressing a soft fingertip does not produce one deformation mode.

Part of the material compresses beneath the contact. Part moves laterally because silicone is nearly incompressible. Part bends around the rigid backing. Part transfers load into the distal link through the bonded interface and stem. If a void exists, its walls may move toward one another and eventually make contact.

The observed response is the result of how these modes share the external work:

$$
W_\text{ext}
=
U_\text{bulk}
+
U_\text{shear}
+
U_\text{bending-like}
+
U_\text{contact}
+
W_\text{diss}.
$$

This is a conceptual decomposition, not a set of independent Kratos output variables. In a finite-strain continuum, the modes are coupled. The decomposition is still useful because it asks the right design question:

> When contact work enters the fingertip, which structural path makes it visible and which path hides it?

## Local indentation is only one path

If a thick pad is pressed at its crown, the deformation can remain concentrated beneath the indenter. That creates a strong local force response, but it may produce little motion on a camera-facing sidewall.

If the same pad is thin, backed, or interrupted by a rigid stem, the local load interacts with the boundaries sooner. Sidewalls can bulge, bonded segments can rotate, and the exterior shape can change far from the contact.

Neither behavior is universally better.

- Localized deformation can preserve spatial resolution near a dense tactile array.
- Distributed deformation can amplify contact for a remote camera.
- Excessively global deformation can make different contacts look alike.
- Excessively local deformation can disappear outside the contact patch.

The useful mode depends on where the sensor is.

## The dorsal plate is a boundary condition

The rigid top plate in the LIT model spans the full pad width, but only the two upper segments outside the stem cutout are bonded to the compliant material.

That creates a dorsal boundary with two roles:

1. It anchors the pad to the distal link.
2. It constrains lateral and vertical motion near the bonded endpoints.

The outer arc therefore does not behave like a free silicone blob. Its sidewall motion is shaped by how far each material point lies from the bonded endpoints and by how the load path reaches those endpoints.

This is also why a free-standing material coupon cannot validate the complete fingertip. A coupon may validate the constitutive law. It does not validate the structural transfer created by the backing.

## The stem is an internal load-path selector

The centered stem introduces a rigid region inside the pad. In the zero-clearance geometry it exactly fills the cutout. With positive clearance, some or all stem faces are initially separated from the pad.

Those cases distribute load differently:

- **Zero-clearance fit:** internal surfaces begin coincident, so internal constraints can engage immediately.
- **Side clearance:** lateral motion is available until a side wall closes.
- **Bottom clearance:** the pad can move beneath the stem before bottom contact.
- **U-clearance:** both side and bottom gaps allow an initially freer deformation mode.

The important variable is not void area alone. Two voids with equal area can place clearance on different faces and therefore activate different constraints under the same external load.

This is analogous to mechanism design: topology matters before dimensions are optimized.

## A neutral-axis analogy—and its limit

The term “neutral axis” is useful when a compliant ligament behaves approximately like a beam. Moving rigid material or changing ligament thickness shifts where tensile and compressive strains develop. A dorsal backing can then turn local normal contact into bending-like deformation along a sidewall.

But the analogy must be used carefully.

The LIT pad is a finite-strain, nearly incompressible continuum with curved boundaries and changing contact. It is not an Euler–Bernoulli beam. There may be no single global neutral axis, and the effective bending region can move as contact location and indentation change.

The right use of the analogy is qualitative:

- identify which thin ligaments carry bending-like deformation,
- predict where strain changes sign,
- and ask whether a sensor surface lies on a high-transfer side of that deformation.

The wrong use is to compute one neutral axis from the undeformed section and treat it as a complete contact model.

## A field view makes the transfer visible

The full-field indentation atlas in `lit_ws` stores displacement over the pad rather than only a force curve. That makes it possible to see where the response travels.

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/displacement-vector-atlas.webp" alt="Full-field displacement vector atlas for three contact locations on the LIT fingertip">
  <p class="caption">The useful quantity is not only displacement at the indenter. It is how the entire field changes with contact location.</p>
</div>

A deformation field supports several observations:

- local compression near the contact,
- normal bulging on the left and right observation sidewalls,
- asymmetric far-field motion for off-center contact,
- and regions whose motion is small despite large local indentation.

For sensing, those far-field differences are the mechanical signal.

## Transfer efficiency needs an explicit output

It is easy to say that a structure “amplifies deformation.” That statement is meaningless until the input and output are defined.

For the current model, one useful output is the outward-normal displacement profile on each sidewall:

$$
b(\eta)
=
\mathbf{u}\bigl(\mathbf{X}_0(\eta)\bigr)
\cdot
\mathbf{n}_0(\eta),
$$

where $\eta$ parameterizes a fixed reference arc and $\mathbf{n}_0$ is the reference outward normal.

A scalar transfer gain can then be formed from the signature norm:

$$
G_b(\xi,\delta_n)
=
\frac{\lVert \mathbf{b}(\xi,\delta_n)\rVert_2}
{\delta_n}.
$$

This does not declare the design observable. It simply states how much camera-side mechanical motion is produced per unit indentation.

In the current no-void baseline at $\delta_n=1.5$ mm, the indentation-normalized gains vary with location rather than remaining constant. That is evidence that backing and geometry create a nonuniform transfer map.

## The unresolved design problem

The current results establish a deformation-transfer pipeline for the no-void geometry. They do not yet decompose strain energy into independent “local indentation” and “bending” terms, and they do not establish that a particular stem or void improves sensing.

That distinction is deliberate.

The structural hypothesis is:

> Internal morphology can route contact work toward a surface that is easier to observe.

The completed evidence is narrower:

> For the no-void parametric fingertip, different contact locations produce different full-field and sidewall deformation signatures, and those signatures can be extracted reproducibly.

Before comparing more aggressive internal structures, the numerical model itself must be trusted. Nearly incompressible silicone is exactly where a visually plausible FEM result can become numerically stiff for the wrong reason. That is the next article.

---

[Previous: The Simplest Parametric Fingertip](/fingertip-design/02-parametric-fingertip/) · [Series index](/fingertip-design/) · [Next: Why Silicone FEM Lies So Easily](/fingertip-design/04-silicone-fem/)
