---
title: "Fingertip Design 10: What Should a Good Fingertip Optimize?"
description: A useful objective must combine noise-aware observability with contact stability, strain, force capacity, topology validity, and manufacturing robustness.
layout: distill
editorial: true
published: true
hidden: false
date: 2026-07-23 08:10:00
permalink: /fingertip-design/10-optimization-objective/
img: assets/img/fingertip-design/codtm-overview.webp
tags: [Robotics, Hardware Development, Fingertip Design, Optimization]
---

<p class="editorial-kicker">FINGERTIP DESIGN · 10 / 10 · RESEARCH CONTRACT</p>

“Maximize deformation” is a bad fingertip objective.

A very thin sidewall can produce large motion and fail mechanically. A large void can amplify bulging and introduce unstable self-contact. A soft pad can increase contact area and erase spatial differences. A stiff pad can preserve location and produce too little optical signal. An extreme geometry can win in a deterministic model and become unusable after a 0.2 mm manufacturing error.

The optimization target has to represent what the complete robot needs.

## Start with the map, not a shape variable

Let the design parameters be

$$
\boldsymbol{\theta}_g
=
[w_p,h_p,t_l,w_s,h_s,w_v,h_v,\ldots].
$$

The mechanics produce a CODTM:

$$
\mathcal{M}_{\boldsymbol{\theta}_g}:
(\xi,\delta_n)
\rightarrow
[\mathbf{s},F_n,\ell_c,\xi_c,\mathbf{q}],
$$

where $\mathbf{q}$ collects quality and safety fields such as strain and minimum $\det(F)$.

The optics then produce an observation distribution:

$$
p(\mathbf{z}\mid
\xi,\delta_n,\boldsymbol{\theta}_g,\boldsymbol{\theta}_o).
$$

The design objective should score the **distribution of observations across the intended operating range**, not one deformed image.

## Objective 1: noise-aware separability

For sampled contact states $i$ and $j$, a simple mechanical distance is

$$
D_{ij}
=
\lVert\mathbf{s}_i-\mathbf{s}_j\rVert_2.
$$

The sensing objective should instead use observation-space variation. One option is a Mahalanobis distance:

$$
d_{ij}^2
=
(\boldsymbol{\mu}_i-\boldsymbol{\mu}_j)^T
\mathbf{\Sigma}_{ij}^{-1}
(\boldsymbol{\mu}_i-\boldsymbol{\mu}_j),
$$

where $\boldsymbol{\mu}_i$ is the mean feature for contact state $i$ and $\mathbf{\Sigma}_{ij}$ captures within-state variation.

A conservative objective can maximize the worst adjacent-location margin:

$$
J_\text{sep}
=
\min_{(i,j)\in\mathcal{A}}
d_{ij}.
$$

Using the minimum instead of the average prevents the optimizer from making easy pairs more distinct while leaving one local ambiguity.

## Objective 2: useful signal over the operating range

Contact should be observable before the pad is heavily compressed.

A weighted operating-range objective can be

$$
J_\text{range}
=
\int_{\xi\in\Xi}
\int_{\delta\in\Delta}
w(\xi,\delta)\,
\sigma_\text{min}
\left(
\widetilde{\mathbf{J}}_z
\right)
\,d\delta\,d\xi.
$$

The weight $w$ should reflect actual task use. If the hand needs early contact localization, low indentation receives more weight. If the sensor must survive forceful grasping, high-load validity remains a constraint even when it is not the primary sensing region.

The current CODTM data already shows why this matters: fixed-indentation signature distances grow substantially with indentation. Optimizing only at 1.5 mm would overstate low-load performance.

## Constraint 1: force and contact behavior

An informative fingertip still has to manipulate objects.

Constraints may include:

$$
F_\text{min}(\delta)
\leq
F_n(\xi,\delta)
\leq
F_\text{max}(\delta),
$$

and limits on contact length, pressure concentration, or tangential stability.

Too little normal reaction can make a grasp fragile. Too much can saturate the actuator or damage an object. A broad contact can improve torsional stability while reducing spatial resolution.

These are genuine tradeoffs, not penalties that should be hidden inside one arbitrary weighted sum.

## Constraint 2: deformation validity

Every candidate must preserve the numerical and physical acceptance stack:

- all fields finite,
- $\det(F)>0$ in every element,
- strain below a material-specific limit,
- smooth monotonic loading where expected,
- active-set convergence,
- contact-force closure,
- and medium/fine agreement under predeclared tolerances.

A candidate that fails these checks does not receive a poor score. It is outside the feasible set.

This prevents an optimizer from exploiting inverted elements, non-finite fields, or an unverified contact descriptor.

## Constraint 3: topology must be explicit

The internal-clearance study showed that $w_v$ and $h_v$ can change which surfaces begin coincident and which contacts may activate later.

The design space is therefore mixed:

- continuous dimensions within one topology,
- discrete transitions between zero-clearance, side-clearance, bottom-clearance, and U-clearance.

An optimizer should not cross those boundaries as though the response were smooth.

A safer workflow is:

1. validate each topology separately,
2. define a feasible parameter region within it,
3. optimize continuous dimensions only inside that region,
4. compare topology-level Pareto fronts afterward.

The current zero-clearance internal-contact topology is blocked. It should not enter the optimization until a production contact treatment is verified.

## Constraint 4: manufacturing robustness

Let $\boldsymbol{\epsilon}$ represent uncertain geometry, material, and assembly parameters:

$$
\boldsymbol{\theta}
=
\boldsymbol{\theta}_0+\boldsymbol{\epsilon}.
$$

A robust objective should penalize both mean performance loss and sensitivity:

$$
J_\text{robust}
=
\mathbb{E}_{\boldsymbol{\epsilon}}[J]
-
\lambda
\operatorname{Std}_{\boldsymbol{\epsilon}}[J].
$$

Relevant variations include:

- silicone modulus and cure ratio,
- void and ligament dimensions,
- bond thickness and alignment,
- camera and LED pose,
- surface finish and optical scattering,
- and temperature.

A design with a narrow high-performing peak may be worse than a slightly weaker design with a broad manufacturing plateau.

## Use a Pareto front, not one magic score

The main objectives conflict:

- sensing separability,
- force capacity,
- contact stability,
- strain margin,
- energy or hysteresis,
- and manufacturing robustness.

The result should be a Pareto set, not a single “optimal fingertip.”

An engineer can then choose a design based on the intended hand:

| Application              | Likely priority                          |
| ------------------------ | ---------------------------------------- |
| early touch localization | low-load optical sensitivity             |
| stable power grasp       | contact area and strain margin           |
| precision manipulation   | location separability and low hysteresis |
| low-cost fabrication     | tolerance robustness and simple topology |

## The order of work matters

The current evidence supports the following sequence:

1. **Keep the no-void mechanics baseline immutable.**
2. **Implement and validate the optical forward/noise model.**
3. **Declare CODTM and observation-space convergence thresholds before new sweeps.**
4. **Resolve or redesign the internal-contact topology.**
5. **Define feasible design regions and manufacturing distributions.**
6. **Run multi-objective optimization.**
7. **Validate selected candidates in 3D and on physical prototypes.**

Starting optimization earlier would produce a precise answer to an incomplete question.

## The final research claim should be earned in layers

The eventual claim should not be:

> This geometry deforms more.

It should look more like:

> Across the declared contact and manufacturing range, this fingertip produces observation-space contact signatures with larger noise-normalized separation while satisfying force, strain, contact, and mesh-validity constraints.

That sentence requires mechanics, optics, statistics, and hardware experiments. The current `lit_ws` work supplies the mechanics framework and a validated no-void reference. It also records exactly where the internal-contact model is blocked.

That is enough to begin the design program without pretending it is finished.

---

[Previous: Mechanical Separability Is Not Sensing](/fingertip-design/09-mechanics-vs-sensing/) · [Series index](/fingertip-design/)
