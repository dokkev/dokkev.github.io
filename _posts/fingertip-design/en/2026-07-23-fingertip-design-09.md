---
title: "Fingertip Design 09: Mechanical Separability Is Not Sensing"
description: Distinct FEM deformation fields become a tactile signal only after optical projection, sampling, calibration, and noise are modeled.
layout: distill
editorial: true
published: true
hidden: false
date: 2026-07-23 08:09:00
permalink: /fingertip-design/09-mechanics-vs-sensing/
img: assets/img/fingertip-design/location-distance-matrices.webp
tags: [Robotics, Hardware Development, Fingertip Design, Sensing]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 09 / 10 · RESEARCH BOUNDARY</p>

The current finite-element results show that five contact locations produce different sidewall deformation signatures.

That is a mechanical result.

It is not yet evidence that a camera can identify the location.

The distinction matters because a sensor does not receive the displacement vector used in the simulation. It receives pixels after geometry, lighting, surface reflectance, occlusion, lens distortion, exposure, and noise have transformed the deformation.

## The missing forward model

The mechanical pipeline currently ends at

$$
\mathbf{s}
=
\begin{bmatrix}
\mathbf{b}_L\\
\mathbf{b}_R
\end{bmatrix},
$$

where $\mathbf{b}_L$ and $\mathbf{b}_R$ are sampled normal-displacement profiles.

The sensor pipeline should continue:

$$
\mathbf{s}
\xrightarrow{\ \mathcal{R}\ }
\mathbf{I}_\text{ideal}
\xrightarrow{\ \mathcal{N}\ }
\mathbf{I}_\text{measured}.
$$

$\mathcal{R}$ is an optical rendering or image-formation map. $\mathcal{N}$ represents measurement disturbances.

For the LIT concept, $\mathcal{R}$ may need:

- the deformed three-dimensional surface,
- LED positions and angular emission,
- scattering and absorption through the compliant material,
- internal occlusion by the stem and separators,
- camera intrinsics and pose,
- lens distortion,
- and pixel integration.

$\mathcal{N}$ may need:

- photon and read noise,
- exposure variation,
- LED intensity mismatch,
- temperature drift,
- material aging,
- camera motion,
- manufacturing tolerance,
- and hysteresis between loading and unloading.

Without those maps, a distance in millimeters cannot be converted into a classification margin in image space.

## Three ways a mechanical difference can disappear

### 1. It moves in an invisible direction

A large tangential surface displacement may cause little image change if the camera sees only a nearly uniform diffuse patch. Conversely, a small normal motion at a sharp light–dark boundary can move many pixels.

Mechanical amplitude is not optical sensitivity.

### 2. The camera projects two shapes onto the same image

Different three-dimensional surfaces can generate similar two-dimensional projections, especially under symmetric illumination or self-occlusion.

The CODTM retains independent left and right material chains. A camera view may partially hide one chain or mix both through scattering.

### 3. The difference is smaller than nuisance variation

The FEM distance matrix compares deterministic simulations at fixed parameters. A real sensor must distinguish contact locations across variations in indentation, force, friction, temperature, cure ratio, camera pose, and assembly.

If within-location variation is larger than between-location variation, the deterministic pairwise distance is not useful.

## The correct comparison lives in observation space

Let $\mathbf{z}$ be an image feature extracted from the measured image:

$$
\mathbf{z}
=
\phi\!\left(
\mathcal{N}\left[
\mathcal{R}(\mathbf{s},\boldsymbol{\theta}_o)
\right]
\right),
$$

where $\boldsymbol{\theta}_o$ contains optical and manufacturing parameters.

A useful local observability quantity is the Jacobian

$$
\mathbf{J}_z
=
\begin{bmatrix}
\dfrac{\partial\mathbf{z}}{\partial\xi}
&
\dfrac{\partial\mathbf{z}}{\partial\delta_n}
\end{bmatrix}.
$$

Its singular values describe local sensitivity to contact location and indentation in the chosen feature space. But even this is not enough without a noise scale.

If feature noise has covariance $\mathbf{\Sigma}_z$, the meaningful geometry is whitened:

$$
\widetilde{\mathbf{J}}_z
=
\mathbf{\Sigma}_z^{-1/2}\mathbf{J}_z.
$$

A mechanically large mode that lies in a high-noise image direction can then receive less weight than a smaller but stable optical feature.

## The current distance matrix is still valuable

<div class="editorial-wide">
  <img src="/assets/img/fingertip-design/location-distance-matrices.webp" alt="Mechanical distance matrices for sidewall deformation signatures">
  <p class="caption">These distances establish that the deterministic mechanical map is not degenerate at the sampled cases. They do not establish an optical signal-to-noise ratio.</p>
</div>

The current CODTM analysis already removes several bad designs from consideration.

If two contact locations produce identical mechanical signatures, no camera can recover the lost information from those signatures. Mechanical separability is therefore a **necessary condition** for this sensing route.

It is simply not sufficient.

The current result also tells us which simulations the optical model must render. The five locations, 48 indentation steps, two sidewall chains, and medium/fine spot checks form a controlled mechanics dataset. The optical layer should consume these artifacts without rerunning or modifying the mechanics.

## What the first optical validation should do

A defensible first optical study does not need a full learned estimator.

It should:

1. define camera and LED geometry,
2. map the deformed surface into image space,
3. include at least exposure, intensity, pose, and pixel noise,
4. compare within-location and between-location distributions,
5. test whether location remains distinguishable at matched indentation and matched force,
6. and verify the model against real images at several controlled loads.

The output should be a curve, not a single accuracy number:

$$
P(\text{correct location})
\quad\text{versus}\quad
F_n,\ \delta_n,\ \text{noise level},\ \text{manufacturing variation}.
$$

Low-load performance is especially important. The current mechanical distances shrink substantially at low force. A design that is separable only near 1.5 mm indentation may miss the operating range where early contact detection is needed.

## Why 09 is not a result post

No optical forward/noise model exists in the current `lit_ws` artifact set. This article therefore defines the missing contract instead of presenting synthetic camera images or a sensing accuracy.

The scientific status remains:

```text
Mechanical signature extraction: PASS
Mechanical separability:         DESCRIPTIVE
Optical forward model:           NOT IMPLEMENTED
Noise-aware observability:       NOT EVALUATED
Contact-location sensing:        NOT CLAIMED
```

This boundary makes the next optimization question much clearer. A fingertip should not be optimized for the largest displacement or the prettiest FEM field. It should be optimized for a noise-aware, mechanically valid, physically usable observation.

---

[Previous: Then I Added a Hole](/fingertip-design/08-added-a-hole/) · [Series index](/fingertip-design/) · [Next: What Should a Good Fingertip Optimize?](/fingertip-design/10-optimization-objective/)
