---
title: "[CAN 02] - Setting up SocketCAN on Linux"
description: Setting up SocketCAN
layout: distill
published: true
date: 2023-09-02 00:00:00
img: /assets/img/can/socketcan.jpg
permalink: /can02/
series: "CAN Bus for Robotic Hardware"
series_order: 2
tags: [Hardware Development]
# categories: robotics101
---

Previous Post:

- [What Is CAN?](/can01/)

The previous post introduced CAN and its use in robotic systems. This post shows how to configure a USB-to-CAN adapter as a SocketCAN interface on Ubuntu.

## Hardware

I tested the following USB-to-CAN adapters with SocketCAN on Ubuntu 22.04 using the 6.8.0-48-generic kernel and a 5.15.129-rt67 real-time kernel:

- [Makerbase CANable 2.0 USB to CAN adapter](https://makerbase3d.com/product/makerbase-canable-v2/?srsltid=AfmBOoo8SgfMBKoPkINomkXkyG8g6XlvwngQso5DAq0qLKPFEoTqkcba)
- [USB CAN Converter Module](https://www.amazon.com/dp/B07P9JGXXB?ref=ppx_yo2ov_dt_b_product_details&th=1)
- [DSD TECH USB to CAN Adapter](https://a.co/d/6rcsDxE)
- [PCAN-USB FD](https://www.peak-system.com/PCAN-USB-FD.365.0.html?&L=1) — normally supported by the mainline `peak_usb` SocketCAN driver; PEAK's optional out-of-tree driver must be built in `netdev` mode for SocketCAN

## Setting up SocketCAN

Install [`can-utils`](https://github.com/linux-can/can-utils) by running:

```
sudo apt install can-utils
```

The `can-utils` package provides command-line tools for configuring, monitoring, and testing CAN interfaces.

Connect the USB-to-CAN adapter and confirm that the USB device is visible:

```
lsusb
```

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/lsusb.jpg" title="lsusb" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    The `lsusb` output shows two connected USB-to-CAN adapters.
</div>

The next step depends on the firmware running on the adapter. With `candleLight` firmware, a compatible CANable device appears directly as a native SocketCAN network interface through the Linux `gs_usb` driver. Check the available interfaces with:

```
ip link ls
```

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/iplinkls.jpg" title="iplinkls" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Output of `ip link ls`. The SocketCAN interface `can0` is in the `DOWN` state. A PCAN device using the proprietary `chardev` interface does not appear as a SocketCAN network interface.
</div>

If an interface such as `can0` is present, continue with Option 1. If the adapter instead appears as a serial device such as `/dev/ttyACM0`, attach it through `slcan` as described in Option 2.

### Changing USB-to-CAN Adapter Firmware

If the adapter is compatible with CANable firmware, the [CANable updater](https://canable.io/updater/) can switch between `candleLight` and `slcan`.

With `candleLight`, the adapter appears as a native SocketCAN interface and avoids the serial-line overhead of `slcan`. CAN FD support is firmware- and hardware-specific: the CANable 2.0 documentation currently notes that its `candleLight` build does not support FD frames, while its stock `slcan` firmware provides initial CAN FD support. Verify the exact adapter and firmware version before enabling CAN FD.

### Option 1: Configure a Native `candleLight` Interface

To configure `can0` for 500 kbit/s and bring it up:

```
sudo ip link set can0 up type can bitrate 500000
```

Change the `bitrate` value to match every other node on the bus.

Use `ip -details -statistics link show can0` to verify the state, configured bit rate, and error counters.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/up.png" title="up" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    The SocketCAN interface `can0` is in the `UP` state.
</div>

### Option 2: Attach an `slcan` Serial Interface

Find the serial device created by the adapter:

```
ls /dev/ttyACM*
```

The adapter may appear as `/dev/ttyACMx`, where `x` depends on the order in which USB devices were detected. Replace `x` in the following command with the correct number:

```
sudo slcand -o -c -s6 /dev/ttyACMx can0
```

The `-s6` argument selects the CAN bit rate. Common `slcan` values are:

```
-s0 = 10k
-s1 = 20k
-s2 = 50k
-s3 = 100k
-s4 = 125k
-s5 = 250k
-s6 = 500k
-s7 = 750k
-s8 = 1M
```

After `slcand` starts, check `ip link ls`. The new `can0` interface should initially be in the `DOWN` state.

Bring the interface up before sending or receiving frames:

```
sudo ip link set can0 up
```

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/can/up.png" title="up" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    The SocketCAN interface `can0` is in the `UP` state.
</div>

> **Important:** After reconnecting the adapter, its `/dev/ttyACMx` number may change. A udev rule can assign a stable symlink based on the device vendor and product IDs.

#### Create a Stable udev Symlink for `slcan`

The following example uses a Makerbase CANable 2.0. Find the adapter's vendor and product IDs:

```
lsusb
```

A matching line looks similar to:

```
==> Bus 001 Device 042: ID 16d0:117e MCS CANable2 b158aa7 GitHub - normaldotcom/canable2-fw
```

Here, `16d0` is `ATTRS{idVendor}` and `117e` is `ATTRS{idProduct}`.

Create a udev rule:

```
sudo nano /etc/udev/rules.d/99-usb-serial.rules
```

Add the following line, substituting the IDs reported by your adapter:

```
ACTION=="add", SUBSYSTEM=="tty", ATTRS{idVendor}=="16d0", ATTRS{idProduct}=="117e", SYMLINK+="ttycan"
```

Save the file and exit. Replace `ttycan` with another lowercase symlink name if desired.

Reload the rules:

```
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Reconnect the adapter and inspect the symlink:

```
ls -l /dev/ttycan
```

The output should resemble:

```
==> lrwxrwxrwx 1 root root 7 Sep 12 14:01 /dev/ttycan -> ttyACM5
```

This shows that `/dev/ttycan` points to the detected `/dev/ttyACMx` device. If needed, compare `udevadm info -a /dev/ttyACM5` with `udevadm info -a /dev/ttycan` to confirm that both paths resolve to the same hardware.

Use `/dev/ttycan` instead of a changing `/dev/ttyACMx` path:

```
sudo slcand -o -c -s6 /dev/ttycan can0
sudo ip link set can0 up
```

## References

- [Linux kernel documentation: SocketCAN](https://www.kernel.org/doc/html/latest/networking/can.html)
- [CANable documentation: SocketCAN and firmware options](https://canable.io/getting-started.html)

Next Post: [Communicating with an ESP32 Using SocketCAN](/can03/)
