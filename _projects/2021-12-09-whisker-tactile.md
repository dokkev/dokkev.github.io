---
layout: distill
title: Whisker-based Tactile Sensing and Shape Classification
description: with background image
img: assets/img/whisker/thumbnail.gif
importance: 10
category: other
related_publications: false
---

## Overview

The objective of this project aims to replicate a rat’s active vibrissal sensing to classify concave and convex objects using artificial neural networks in simulations. Moreover, we investigated how individual whiskers affect neurons in the neural networks of the deep-q learning algorithm, which enabled the rat in simulation to find an optimal whisking orientation that maximizes the symmetry of contacting whiskers.

- The logistic regression model of 4 whiskers was able to classify concave and convex shapes with __contact numbers__ with 0.81 accuracy.
- The neural network model of 4 whiskers was able to classify concave and convex shapes with __peak moment__ with 0.92 accuracy.
- Inaccessibility to modify whisking amplitude in WHISKiT Physics simulator limited replicating Chris Rodger’s experiments.
- The neural network model of 54 whiskers was able to classify concave and convex shapes with __contact duration__ with 0.92 accuracy while the rat was actively rotating its yaw.
- Image classification performed better than tabular data classification due to convolutional neural network that can process temporal and spatial data sufficiently
- Image classifier training was more time consuming than tabular data classifier
DQN algorithm was implemented to investigate how individual whiskers affect the neural network which outputs a rat’s action to maximize symmetrical whiskers contact

## Introduction
Inspired by the ability of animals to maneuver effectively in their environment, biomimetic robotics has led to the diverse shapes and sizes of robot design. Biomimetic robot designs attempt to translate biological principles into engineered systems, replacing more classical engineering solutions to achieve a function observed in the natural system <sup>1</sup>.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/whisker/rat.png" title="example image" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    *Figure 1: A rat exploring a tunnel*
</div>



**Code: [[GitHub](https://github.com/dokkev/Whisker-Based-Tactile-Sensing-and-Shape-Classification)]**