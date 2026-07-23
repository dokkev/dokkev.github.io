---
layout: page
title: Fingertip Design
description: Designing how contact deforms, transmits, and becomes observable.
permalink: /fingertip-design/
nav: false
published: true
---

<p class="editorial-kicker">MAJOR SERIES · 10 ESSAYS</p>

# Designing the contact before designing the sensor

A robotic fingertip is often specified with a material name and a Shore hardness. That is convenient for purchasing silicone. It is not enough to explain what the fingertip will do.

The same elastomer can behave like a local force probe, a broad stabilizing contact, a mechanical low-pass filter, or an almost unreadable lump of rubber. The difference comes from geometry: the outer curvature, the rigid backing, the bonded interface, the internal stem, the voids, and the route by which deformation reaches an observable surface.

This series follows one engineering question:

> Can fingertip morphology make contact more predictable and measurable before a more complicated sensor or controller is added?

The articles are based on the PLATO Hand contact design and the `lit_ws` fingertip framework: a parametric half-ellipse pad, solver-independent meshing, a nearly incompressible hyperelastic model, frictionless contact validation, a no-void indentation baseline, and the contact-to-observation deformation transfer map (CODTM).

The status labels matter:

- **Established** means the claim is supported by the current geometry, validation, or numerical results.
- **Diagnostic** means the result explains a failure but is not yet a production remedy.
- **Research boundary** means the required model or experiment has not been completed.

## The series

1. [A Robotic Fingertip Is Not a Rubber Cap](/fingertip-design/01-not-a-rubber-cap/) — Why hardness alone cannot describe contact behavior.

2. [The Simplest Parametric Fingertip](/fingertip-design/02-parametric-fingertip/) — What a half-ellipse pad, bonded plate, stem, and two clearance parameters can control.

3. [Where Does the Internal Structure Send Deformation Energy?](/fingertip-design/03-deformation-path/) — Why backing and load path matter as much as the elastomer.

4. [Why Silicone FEM Lies So Easily](/fingertip-design/04-silicone-fem/) — Volumetric locking, mixed elements, and why a solver return value is not validation.

5. [A Converged Contact Solver Can Still Be Wrong](/fingertip-design/05-contact-solver/) — Active sets, force closure, mesh resolution, and physical acceptance gates.

6. [A Solid Fingertip Was Easy](/fingertip-design/06-solid-fingertip/) — The external-contact-only baseline and what it actually establishes.

7. [Can Contact Location Be Read from Deformation?](/fingertip-design/07-contact-location/) — CODTM, sidewall signatures, distance matrices, and provisional mesh convergence.

8. [Then I Added a Hole](/fingertip-design/08-added-a-hole/) — How an internal void changes the mathematical problem, not just the compliance.

9. [Mechanical Separability Is Not Sensing](/fingertip-design/09-mechanics-vs-sensing/) — Why distinguishable FEM fields do not yet imply camera observability.

10. [What Should a Good Fingertip Optimize?](/fingertip-design/10-optimization-objective/) — A research contract for combining contact mechanics, optical transfer, noise, and robustness.

The first eight articles report what the current models and diagnostics can support. Articles 9 and 10 define the next missing layer. They deliberately do not present an optical result or an optimized fingertip that does not yet exist.
