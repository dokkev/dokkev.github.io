---
layout: distill
title: Cup Tower Stacking with Baxter
description: Baxter stacks tower of cups with Moveit, Apriltag, and OpenCV
img: assets/img/baxter/fasttower.gif
importance: 13
category: robotics
related_publications: false
---

# Project Overview

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/baxter/3-cups-tower.gif" title="3cups-gif" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *3 Cups Tower Demo*
</div>

This is a ROS project developed as part of the ME495 - Embedded Systems in Robotics course at Northwestern University.

The goal of this project is to use the BAXTER robot to build a "HUGE" tower from plastic cups.

<!-- You can find the Github repository at the following link:

[github_repo](https://github.com/rubberdk/final-project-fast-tower) -->

My role in this project was image processing using AprilTags. I implemented AprilTag detection using the `apriltag_ros` wrapper package and published the cups' transformations so that the Baxter would detect and keep track of the locations of the cups.

# Demonstration

### 10 Cups Tower

<figure>
  <iframe
    width="720"
    height="405"
    src="https://www.youtube.com/embed/YzLpgf8ozkA"
    title="10 Cups Tower Demonstration"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
  <figcaption style="text-align: center;">
    <em>10 Cups Tower Demonstration</em>
  </figcaption>
</figure>




### 6 Cups Tower

<figure>
  <iframe
    width="720"
    height="405"
    src="https://www.youtube.com/embed/H2U9Fk785CE"
    title="6 Cups Tower Demonstration"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
  <figcaption style="text-align: center;">
    <em>6 Cups Tower Demonstration</em>
  </figcaption>
</figure>

### 6 Cups Sorting

<figure>
  <iframe
    width="720"
    height="405"
    src="https://www.youtube.com/embed/yFVovQYhw8g"
    title="6 Cups Sorting Demonstration"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
  <figcaption style="text-align: center;">
    <em>6 Cups Sorting Demonstration</em>
  </figcaption>
</figure>

# Project Details

## Gazebo Simulation

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/baxter/baxter_gazebo.png" title="gazebo" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Gazebo Simulation Environment*
</div>

- **Baxter Simulator**
- Tool utilized to test code without a real robot
- Get the position of the cups with `get_model_state` service
- Set cup pose with `set_model_state`

## Rviz

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/baxter/baxter_rviz.png" title="rviz" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Rviz Visualization*
</div>

- MoveIt to set the planning scene and Rviz visualizer
- Set the positions of the cups and tables
- Add objects to the scene 
- Return information about the scene

## Robot Control

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/baxter/baxter_control.png" title="control" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Robot Control Interface*
</div>

Let one hand first place what it’s grabbing, then let the other hand grab the next cup to place.

## Computer Vision

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/baxter/baxter_cv.png" title="cv" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Computer Vision Setup*
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/baxter/baxter_cvr.png" title="cvr" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Computer Vision Results*
</div>

- We used `apriltag_ros`, which is a ROS wrapper of the AprilTag, to get x, y, z positions of the cups.
- We mainly used Baxter's right-hand camera for tag detection, but we provided options to use the left camera or the head camera.
- `simulator.py`, which is a MoveIt Python API, converts tf data to x, y, z positions and adds positions and visual cylinders that represent cups to the scene, which can be seen in Rviz.
- `arm_control` nodes use those positions for Baxter's tasks of sorting or building cups.

# Project Team Members

- Dimitrios Chamzas
- Dong Ho Kang
- Yuxiao Lai
- Gabrielle Wink
