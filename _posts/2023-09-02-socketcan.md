---
title: "[CAN] 02 - Setting up SocketCAN on Linux"
description: Setting up SocketCAN 
layout: distill
published: true
date: 2023-09-02 00:00:00
img: /assets/img/can/socketcan.jpg
permalink: /socketcan/
tags: [Hardware Development]
# categories: robotics101

---

In the previous post [What is CAN?](/aboutcan/), we discussed the basics of CAN bus and its applications in robotics. In this post, we will learn how to set up SocketCAN on Ubuntu computers to set up CAN communication.

## Hardware
I will be using USB-CAN adapter to connect my Ubuntu computer to ESP32 with TJA1050 CAN transceiver. Since [ESP32 already includes CAN controller](https://docs.espressif.com/projects/esp-idf/en/release-v3.3/api-reference/peripherals/can.html), we only need CAN transceiver. Note that not every microcontroller comes with CAN controller, so you may need to use external CAN controller like MCP2515.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/esp32.jpg" title="esp32" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/tja.jpg" title="tja1050" class="img-fluid rounded z-depth-1" %}
    </div>
        <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/usb-can.jpg" title="usb-can" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
  Left: ESP32 Middle: TJA1050 Right: USB-CAN Adapter
</div>

I have tested the following USB-CAN adapters with SocketCAN on Ubuntu 22.04 with 6.8.0-48-generic kerneal and 5.15.129-rt67 real-time kernel.
- [Makerbase CANable 2.0 USB to CAN adapter](https://makerbase3d.com/product/makerbase-canable-v2/?srsltid=AfmBOoo8SgfMBKoPkINomkXkyG8g6XlvwngQso5DAq0qLKPFEoTqkcba)
- [USB CAN Converter Module](https://www.amazon.com/dp/B07P9JGXXB?ref=ppx_yo2ov_dt_b_product_details&th=1)
- [PCAN-USB FD](https://www.peak-system.com/PCAN-USB-FD.365.0.html?&L=1) - make sure to compile the driver with `netdev` option. The default is `chardev` which is not compatible with SocketCAN.

## Install `can-utils`
