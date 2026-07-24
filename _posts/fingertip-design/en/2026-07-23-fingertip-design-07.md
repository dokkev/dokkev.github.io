---
title: "Fingertip Design 07: Can Contact Location Be Read from Deformation?"
description: CODTM measures how contact location and indentation become paired sidewall displacement signatures.
layout: distill
editorial: true
published: true
hidden: true
date: 2026-07-23 08:07:00
permalink: /fingertip-design/07-contact-location/
img: assets/img/fingertip-design/codtm-overview.webp
tags: [Robotics, Hardware Development, Fingertip Design, FEM, Sensing]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 07 / 10 · DESCRIPTIVE SEPARABILITY</p>

If contact at the left, center, and right of a fingertip produces different sidewall deformation, then the mechanics contain information about contact location.

That statement sounds obvious. It is not yet a sensing result.

The differences could be smaller than mesh error. They could come only from different force levels rather than different shapes. They could disappear after camera projection. They could be overwhelmed by illumination drift or silicone hysteresis.

The first task is narrower: define the mechanical transfer map carefully enough that those questions can be asked without changing coordinates between cases.

## Contact-to-observation deformation transfer map

The current map is

$$
\operatorname{CODTM}:
(\xi_\text{cmd},\delta_n)
\longrightarrow
\left[
\mathbf{b}_L(\eta),
\mathbf{b}_R(\eta),
F_n,
\ell_c,
\xi_c
\right].
$$

- $\xi_\text{cmd}$ is the commanded contact location along the undeformed outer arc.
- $\delta_n$ is indenter motion along the fixed loading direction.
- $\mathbf{b}_L$ and $\mathbf{b}_R$ are the left and right sidewall normal-displacement profiles.
- $F_n$ is the indenter reaction.
- $\ell_c$ and $\xi_c$ are contact length and centroid when pressure-resultant force closure is verified.

The coordinate runs from $\xi=0$ at the right bonded endpoint, through $\xi=0.5$ at the crown, to $\xi=1$ at the left bonded endpoint.

Each observation side uses 41 fixed samples on the **reference arc**. The values are interpolated with the boundary element shape functions rather than chosen from whatever mesh nodes happen to be nearby.

This is important. If the sample points move with mesh refinement, a profile difference mixes physical deformation with a changing measurement operator.

## The observed channel is normal bulging

For a reference point $\mathbf{X}_0(\eta)$,

$$
b(\eta)
=
\mathbf{u}(\mathbf{X}_0(\eta))
\cdot
\mathbf{n}_0(\eta),
$$

where $\mathbf{n}_0$ is the reference outward normal.

The sign is chosen so outward bulging is positive on both sides. Global $u_x$, $u_y$, tangential displacement, and current coordinates are preserved, but the primary sensing-oriented channel is the normal profile.

<div class="editorial-full">
  <img src="/assets/img/fingertip-design/codtm-overview.webp" alt="Overview of the contact-to-observation deformation transfer map">
  <p class="caption">CODTM keeps left and right sidewalls as independent material chains. The central contact-facing region is deliberately unsampled.</p>
</div>

The two sidewall chains do not share a crown sample. The center gap is real: the current observation is designed for camera-facing sidewalls, not for the object-contact surface.

## Location changes both force and shape

At 1.5 mm indentation, the medium-mesh final reactions were:

| Commanded $\xi$ | Final reaction |
| --------------: | -------------: |
|            0.20 |     0.132235 N |
|            0.35 |     0.432058 N |
|            0.50 |     0.861926 N |
|            0.65 |     0.422103 N |
|            0.80 |     0.130621 N |

The crown is much stiffer than locations near the bonded-side regions under the fixed global loading direction. Comparing raw displacement signatures therefore mixes two effects:

1. different structural shape transfer,
2. different contact force.

The analysis keeps both fixed-indentation and fixed-force comparisons.

At fixed indentation, the off-diagonal signature distances increased from approximately 0.0351–0.1244 mm at 0.25 mm indentation to 0.2654–0.9821 mm at 1.5 mm.

At fixed force, all five locations were interpolated over their common force range. At the highest common force, off-diagonal distances spanned approximately 0.1350–0.7523 mm.

The differences therefore do not vanish when force is controlled. That is evidence of location-dependent profile shape, not only amplitude.

## A distance matrix is descriptive, not a classifier

For two concatenated sidewall signatures $\mathbf{s}_i$ and $\mathbf{s}_j$,

$$
D_{ij}
=
\left\|
\mathbf{s}_i-\mathbf{s}_j
\right\|_2.
$$

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/location-distance-matrices.webp" alt="Pairwise distance matrices between fingertip deformation signatures">
  <p class="caption">Pairwise distances show that sampled locations produce different mechanical signatures. They do not include optical projection or noise.</p>
</div>

Amplitude-normalized shape distances at 1.5 mm ranged from approximately 0.5526 to 1.9685. The mean-centered five-location signature matrix had singular values

$$
[5.5853,\;2.4213,\;0.6252,\;0.3407,\;\approx0]\ \text{mm}.
$$

Four nonzero modes are expected after centering five samples. These values describe the sampled mechanical variation. They are not a noise-based observable rank.

The near-zero fifth value should not be read as “the sensor has rank four.” No sensor has been modeled yet.

## Mesh agreement was favorable but remains provisional

Fine-mesh spot checks were run at $\xi=0.20$, $0.50$, and $0.80$.

At 1.5 mm:

- reaction differences were 1.078%, 0.319%, and 0.641%,
- normal-profile relative $L_2$ differences were 0.635%, 0.255%, and 0.659%,
- normalized-shape correlations exceeded 0.99996.

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/medium-fine-profiles.webp" alt="Medium and fine mesh sidewall profile comparison at 1.5 millimeter indentation">
  <p class="caption">The medium and fine profiles are visually and numerically close at the three spot-check locations.</p>
</div>

Those numbers are favorable. The scientific status remains **provisional** because a CODTM-specific profile threshold was not declared before the simulations were run.

This may sound overly cautious. It prevents a subtle form of hindsight: choosing the tolerance after seeing the difference.

## The pressure-derived descriptors were only partially verified

All eight logical location/mesh cases reached 48 converged steps with finite fields and positive $\det(F)$.

However, the pressure-resultant force closure exceeded the 2% gate on some right-side cases. For those cases, the displacement signature and canonical indenter reaction were retained, but contact centroid and contact length were not published as trusted descriptors.

Across the full dataset, 256 of 384 load-bearing records passed the contact-distribution closure gate.

This is why CODTM stores a vector of outputs rather than reducing the case to one PASS flag. Different observables can have different validity.

## What has been shown

The current result supports this statement:

> In the no-void 2D fingertip baseline, the sampled contact locations produce distinct sidewall deformation signatures whose medium/fine differences are small at three checked locations.

It does **not** yet support:

> A camera can reliably estimate contact location.

The missing transformation is

$$
\mathbf{s}_\text{mechanical}
\rightarrow
\mathbf{I}_\text{camera}.
$$

That transformation needs illumination, surface optics, camera geometry, pixel sampling, and noise. Article 9 will define that boundary.

Before that, the next article explains why the internal void could not simply be added to the successful baseline. It changed the constraint topology and exposed a contact-multiplier failure at a bonded–contact crosspoint.

---

[Previous: A Solid Fingertip Was Easy](/fingertip-design/06-solid-fingertip/) · [Series index](/fingertip-design/) · [Next: Then I Added a Hole](/fingertip-design/08-added-a-hole/)
