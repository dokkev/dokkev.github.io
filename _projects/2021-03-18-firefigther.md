---
layout: distill
title: Autonomous Fire Fighting Robot 
description: Sensing and Localization of Fire, Grasping, and Operating Fire Extinguisher
img: assets/img/adroit/fire.jpg
importance: 11
category: robotics
related_publications: false
---

HDT Adroit 6DOF A24 Pincer Manipulation of a fire extinguisher using a thermal camera

This is a Winter Project of MSR Program at Northwestern University. 

**Code: [[GitHub](https://github.com/rubberdk/Firefighting_Robot_Arm)]**

# Background
The idea of a firefighting robot is not a new concept, and there have been a lot of propositions of using firefighter robots. In fact, a robot called Colossus helped save much of the historic structure by braving conditions deemed too dangerous for human firefighters after Notre Dame Cathedral in Paris caught fire in 2019 [1], and LA Fire Department tested autonomous fire fighting robots in the major Downtown blaze in 2020 [2].

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/colossus.jpg" title="colossus" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Firefighting Robot "Colossus"
</div>

The problems with currently existing firefighting robots are that they are not suitable for domestic or commercial usages because they are big and built specifically to operate in firefighting missions. I believe that manipulating a robot arm to detect a fire and use a fire extinguisher can be beneficial in industrial settings such as warehouses that have already adapted using robot arms. Especially, maintenance costs of fire sprinkles due to frozen pipes can be deducted in warehouses. Additionally, implementing a fire safety feature to domestic service robot arms can appeal to the general crowd.

Therefore, I implemented a firefighting mechanism using HDT Adroit 6 DOF A24 Pincer robot arm (I will refer it as an Adroit throughout this post) and FLIR Lepton 2.5 thermal camera for this project. The goal of this project is to detect a heat source (fire), grab the fire extinguisher, and operate it.

# Hardwares

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/adroit.jpg" title="adroit" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fireext.png" title="fe" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/lepton.jpg" title="lepton" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/purethermal.jpg" title="purethermal" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   HDT Adroit 6DOF A24 Pincer, Fixed-hose fire extinguisher, FLIR Lepton 2.5 - Thermal Imaging Module, PureThermal 2 - FLIR Lepton Smart I/O Board
</div>

# SYSTEM OVERVIEW

The Adroit operates on ROS. I used `ROS-noetic` version for this project. 

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/block.jpg" title="block" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   This block diagram shows the overall flow and communication between different ROS packages for the project. I implemented two packages which are `thermal_image_processing` and `control`. Besides, I used packages provided by HDT to control the basic movements of the robot.
</div>

# ROS Packages Overview

## Package: `thermal_image_processing`
This package takes care of detecting a highest spot in the camera view and reading its temperature from the thermal camera. I implemented the package from PureThermal 1 / PureThermal 2 FLIR Lepton Dev Kit (https://github.com/groupgets/purethermal1-uvc-capture).

### Thermal Image Processing

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/self.jpg" title="self" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Image of a human through a thermal camera
</div>

FLIR Lepton 2.5 thermal camera can detect the temperature using its radiometry in a gray scale. The pixel value in the gray scale, for example, shows some value such as 40,000 which represents 400.00 K. The node `thermal_detection` detects the pixel with the highest temperature and converts it into Celsius scale. In addition, it publishes the temperature value and 2D x-y coordinates of the image as `rostopic` so that the Adroit can execute its movements based on those values.

### Contour Detection From Thermal Image

The previous method of detecting the heat source was getting the pixel of highest value from the radiometric image. This method was rather unstable due to often bounce of target pixel. Therefore, I calculated the contour from the radiometric image and its centroid to get a target pixel of the heat source.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/contour.png" title="contour" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Contour of an electric heater 
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fcontour.png" title="fcontour" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Contour of fire 
</div>

### Combined Vision Processing

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/process.png" title="process" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Process Flow Diagram
</div>

Getting the pixel coordinate (u,v) from the centroid of thermal image's contour, it's fed into the Realsense depth camera to get depth data at (u,v).

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/ruler_color_image.png" title="ruler" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Depth Measurement with Ruler and Color Image
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/combined.png" title="combined" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Combined Thermal and Depth Image
</div>

The evaluate depth sensing, the result was compared to measurement with a ruler. The error range was about ±100 mm at maximum when measuring distance from 1.2 m to 0.3 m. The error got greater as the depth camera was more far away from the target object.

When it comes to combining two cameras, thermal image and depth image are deviated from each other. Therefore it's important to align two cameras properly. `rostopic` `combined_image2` provides combined images of color image and thermal image to provide how well two cameras are aligned while `combined_image` provides combined images of aligned color to depth image and thermal image. Thermal camera and Realsense camera should be calibrated to avoid error due to cameras deviation.

### Testing with Electric Heater
<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/eh1.png" title="heater1" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Electric Heater Setup 1
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/eh2.png" title="heater2" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Electric Heater Setup 2
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/aeh.png" title="aheater1" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Mounted Electric Heater on Adroit
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/aeh2.png" title="aheater2" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Mounted Electric Heater on Adroit - Side View
</div>

### Testing with Fire

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire1.png" title="fire1" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Fire Setup 1
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire2.png" title="fire2" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Fire Setup 2
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire3.png" title="fire3" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Fire Setup 3
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire4.png" title="fire4" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Fire Setup 4
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire_color.png" title="firecolor" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Thermal Image + Color Image
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire_comc.png" title="firecolorc" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Thermal Image + Aligned Color to Depth Image
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/fire_comd.png" title="firecolord" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   Thermal Image + Aligned Color to Depth Image
</div>

## Package: `control`
This package controls the Adroit's arm joints through MoveIt and the pincer through the pincer joint controller.
I have implemented the node `arm_control` for Adroit to detect the fire, grab the fire extinguisher, aim it to the fire, and press the lever.

### Fire Detection
`arm_control` node subscribes to the temperature value and x-y coordinates that `thermal_detection` is publishing.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/search.gif" title="search" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Adroit Searching Mode*
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/joints.jpg" title="joints" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Joints Movements*
</div>

The Adroit makes joint movements on its joint 1 and 6 to scan the environment until it detects something with a high temperature value. The threshold for the temperature was set to 70°C (~158°F) for this project since I used a heater as my heat source, but this value would have been set higher if it were to work with a real fire.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/search2.gif" title="search2" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Thermal Camera View*
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/algo.jpg" title="algo" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Align Mechanism*
</div>

When the Adroit detects something above 70°C, it will try to align the center of the camera view to the heat source by adjusting joint 1 and 3. The figure above represents its mechanism. When the robot aligns with the heat source, it remembers joint positions so that Adroit can return to this position after grabbing the fire extinguisher. In this case, the Adroit's joint 1 is a little bit smaller than the remembered joint position because the fire extinguisher will be located slightly left to the thermal camera.

### Grab & Aim

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/attach.jpg" title="attach" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Safety pins and laser pointer*
</div>

Since I am working with a single arm robot, it is necessary for the pincers to be able to perform two tasks: picking up the fire extinguisher & pressing the lever. Therefore, I implemented custom safety pins to prevent the Adroit from accidentally pressing the lever when it is trying to grab the fire extinguisher. I made two types of pins: the first one is an electric wire covered by rubber, and the other one is a 16-gauge copper wire. The copper wire one is sturdier, so the Adroit needs to exert more force to press the lever compared to the rubber one. I attached anti-slip stickers on the levers of the fire extinguisher to get a better grip.

I used a fixed coordinate for the location of the fire extinguisher, and I found this reasonable because fire extinguishers are usually located at specific and fixed spots. The Adroit successfully grabs the fire extinguisher 8 out of 10 times, and this error was due to incorrect orientation of the fire extinguisher.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/aim.gif" title="aim" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Aiming the Fire Extinguisher*
</div>

I installed a laser pointer to accurately evaluate the Adroit's aim to the heat source. When the Adroit goes back to its remembered joint positions, the fire extinguisher hose's aim is aligned to the heat source.

### Press

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/adroit/press_laser.gif" title="press" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
   *Pressing the Lever*
</div>

`arm_control` publishes `std_msgs/Float64` to `pincer_position_controller` to control the pincers. When the Adroit presses the lever, the fire extinguisher's aim goes down a little bit. Besides, this project achieved its goal.

# Future Improvements

- Testing with a real fire
- Publishing transformation of the fire
    - Separating the thermal camera from the robot's pincer
    - Implementing depth sensing of the fire
- Mounting the Adroit on a wheeled mobile robot
    - Applying SLAM to the mobile robot
- Using a fire extinguisher with a flexible hose
- Picking up a fire extinguisher using object detection
