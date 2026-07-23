---
title: "Fingertip Design 01: A Robotic Fingertip Is Not a Rubber Cap"
description: Why the contact behavior of a robotic fingertip cannot be specified by material hardness alone.
layout: distill
editorial: true
published: true
hidden: false
date: 2026-07-23 08:01:00
permalink: /fingertip-design/01-not-a-rubber-cap/
img: assets/img/plato/hybrid.png
tags: [Robotics, Hardware Development, Fingertip Design]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 01 / 10 · ESTABLISHED</p>

When a robotic fingertip is described as “soft silicone,” most of the mechanically important information is still missing.

Which surface is bonded? How thick is the compliant layer? Is there a rigid structure behind it? Where can the material bulge? Does the contact load travel into a plate, a stem, a cavity wall, or a floating skin? Which deformation is visible to a sensor, and which disappears inside the bulk?

Two fingertips can be cast from the same silicone and still produce different contact patches, different force–displacement curves, different slip behavior, and different sensor signals. The material defines a constitutive response. The **morphology defines the boundary-value problem**.

That distinction is the starting point of this series.

## Hardness is a material shorthand, not a contact model

Shore hardness is useful for comparing cured elastomers under a standardized indentation test. It does not uniquely determine Young's modulus, and Young's modulus does not uniquely determine a fingertip response.

A fingertip contact depends on at least four coupled descriptions:

| Layer               | What must be specified                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Material            | Constitutive law, rate dependence, hysteresis, compressibility, friction |
| Geometry            | Curvature, thickness, internal cavities, rigid inclusions                |
| Boundary conditions | Bonded, sliding, clamped, or contacting interfaces                       |
| Observation         | Which displacement, strain, light field, or force is actually measured   |

Calling a pad “soft” collapses all four layers into one adjective. It hides the load path.

For a simple elastic half-space, contact mechanics can be summarized with a local modulus and curvature. A robotic fingertip is rarely a half-space. Its dimensions are comparable to the contact patch, it is attached to a rigid distal link, and its internal structure often interrupts the stress field. Once that happens, a local indentation can create global bending, sidewall bulging, internal self-contact, or torsion. Those modes are not material properties.

## PLATO made the contact boundary visible

The PLATO Hand was built around a deliberately obvious contrast: a compliant pulp and a rigid fingernail occupy different sides of the same fingertip.[1]

The nail is not merely a protective cover. It changes which deformation modes are available. A load applied through the compliant side can spread through the pulp and build a larger distributed contact. A load applied through the nail is transmitted through a much stiffer path and preserves smaller geometric features. The robot does not obtain these two behaviors by changing the controller gain. It obtains them by changing the structure that sits behind the contact.

This is a useful example because the material explanation alone fails immediately. The interesting variable is not “hard versus soft material.” It is the **arrangement of rigid and compliant regions around the load path**.

The same idea extends beyond a visible nail. A dorsal backing, a bonded plate, a centered stem, or an internal void can reshape the contact even when the exterior looks unchanged.

## Contact is a mapping, not a scalar stiffness

It is tempting to replace the whole fingertip with one spring:

$$
F_n = k\,\delta_n.
$$

That can be useful near one operating point. It is not a design description.

A more honest view treats the fingertip as a map from contact conditions to a distributed deformation:

$$
\mathcal{M}:
(\xi,\delta_n,\mathbf{t},\dot{\delta},\text{history})
\longrightarrow
\bigl[
\mathbf{u}(\mathbf{X}),\,
F_n,\,
\ell_c,\,
\xi_c
\bigr].
$$

Here $\xi$ is the contact location, $\delta_n$ is indentation, $\mathbf{t}$ represents tangential loading, $\mathbf{u}(\mathbf{X})$ is the displacement field, $\ell_c$ is contact length in the 2D model, and $\xi_c$ is the achieved contact centroid.

Even this is incomplete for real silicone because the response can depend on loading rate and history. But it exposes the key point: stiffness is one projection of a much larger transfer map.

For sensing, the map matters more than the scalar stiffness. A camera does not directly observe $k$. It observes an image produced by deformation, illumination, occlusion, texture, and noise. If two contact locations create nearly identical visible deformation, a perfect material model does not make the sensor informative.

## The fingertip is part of the measurement chain

Sensor design is often described as:

$$
\text{contact} \rightarrow \text{sensor} \rightarrow \text{estimate}.
$$

For a compliant fingertip, the first arrow contains a mechanical encoder:

$$
\text{contact}
\rightarrow
\text{structural deformation}
\rightarrow
\text{optical or electrical observation}
\rightarrow
\text{estimate}.
$$

The structure can amplify a useful deformation, suppress an unwanted mode, spread local strain over a larger visible region, or make different contacts collapse onto the same observation.

This is why “add a camera” or “add more taxels” does not automatically solve the sensing problem. The sensor can only read what the mechanics make observable.

## A design question with three different answers

Suppose the same normal force is applied at three places along a fingertip:

- near the right bonded edge,
- at the crown,
- near the left bonded edge.

Three different questions follow:

1. **Mechanical response:** Do the three cases produce different displacement fields?
2. **Numerical reliability:** Are those differences larger than discretization and solver error?
3. **Sensor observability:** Do the visible images remain distinguishable after optical projection and noise?

The current `lit_ws` work reaches the second question for a no-void 2D baseline. It does not yet answer the third. That boundary will become important later in the series.

## The working definition

In this series, **fingertip design** means designing the full contact morphology:

- the exterior surface that meets the object,
- the internal rigid and compliant regions,
- the interfaces that are bonded or allowed to contact,
- the path by which load reaches the distal link,
- and the surface or field from which contact will be observed.

The goal is not softness for its own sake. The goal is a contact response that is useful to the robot: stable where it should be stable, sensitive where it should be sensitive, and measurable in the variables the controller will actually receive.

The next article reduces this broad idea to the smallest geometry that can still expose the essential design choices: a half-ellipse pad, a bonded top plate, a centered stem, and two clearance parameters.

---

[Series index](/fingertip-design/) · [Next: The Simplest Parametric Fingertip](/fingertip-design/02-parametric-fingertip/)

## Reference

[1] D. H. Kang et al., “PLATO Hand: Shaping Contact Behavior With Fingernails for Precise Manipulation,” _IEEE Robotics and Automation Letters_, 2026. [arXiv:2602.05156](https://arxiv.org/abs/2602.05156)
