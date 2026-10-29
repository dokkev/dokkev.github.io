---
title: "[CAN 02] - Bring Up a CAN Interface on Linux"
description: "Find your adapter, configure SocketCAN, and distinguish a working Linux interface from a working actuator link."
layout: distill
published: true
lang: en
date: 2023-09-02 00:00:00
img: /assets/img/can/socketcan.jpg
permalink: /can02/
series: "CAN Bus for Robotic Hardware"
series_order: 2
tags: [Hardware Development, CAN, Linux]
---

Plugging in a USB-to-CAN adapter establishes a USB connection. It does not tell us whether the adapter can receive an actuator's feedback. We need to identify the Linux interface, set its bitrate, and observe a frame whose meaning we know.

SocketCAN exposes CAN channels as Linux network interfaces such as `can0`. Applications use the same socket API across supported adapters. The adapter driver handles the hardware-specific part. [Linux kernel, SocketCAN](https://www.kernel.org/doc/html/latest/networking/can.html)

The commands below target Ubuntu with `iproute2` and `can-utils`, using Classical CAN at **500 kbit/s**. Replace that bitrate with the actuator's documented value. These are setup instructions and illustrative outputs, rather than a new hardware test record.

## Find out what the adapter exposes

Install the tools used to inspect interfaces and receive frames:

```bash
sudo apt update
sudo apt install iproute2 can-utils usbutils
```

Connect the adapter, then check USB enumeration and the available network interfaces:

```bash
lsusb
ip -brief link
```

Identify which new device belongs to the adapter, especially when several CAN channels are connected. This post uses `can0`; substitute the actual name in every command.

| What appears after connection | Where to continue |
| --- | --- |
| A CAN network interface such as `can0` | Configure the native interface below |
| A serial port such as `/dev/ttyACM0`, with documented SLCAN firmware | Attach the serial interface below |
| A PEAK adapter in `lsusb`, but no CAN interface | Follow [CAN 02A: PCAN Device Installation](/can02/pcan/) |
| No new USB device | Check the USB connection before changing CAN bitrate or termination |

The firmware determines the path for a CANable-compatible adapter. `candleLight` uses the Linux `gs_usb` driver and appears as a network interface. SLCAN firmware exposes a serial protocol that needs an attachment step. A serial port alone does not establish SLCAN compatibility; check the firmware documentation. [CANable getting started](https://canable.io/getting-started.html)

PCAN installation is a separate branch of this lesson. Many PEAK adapters already have mainline kernel support, so start with the interface check before installing a vendor driver. The [PCAN sub-post](/can02/pcan/) also distinguishes SocketCAN from PCAN-Basic applications.

## Configure a native CAN interface

Stop programs using the selected channel before changing its configuration. Take it down, set the bitrate, and bring it up:

```bash
sudo ip link set can0 down
sudo ip link set can0 type can bitrate 500000
sudo ip link set can0 up
ip -details -statistics link show can0
```

For a native interface, inspect the administrative `UP` flag and the reported `bitrate 500000`. The top-level operational state can appear as `UNKNOWN` on a usable CAN interface. The CAN-specific state, such as `ERROR-ACTIVE` or `BUS-OFF`, is a separate field. `ERROR-ACTIVE` is a protocol state, not a report that the setup has already failed. [SocketCAN network interface details](https://www.kernel.org/doc/html/latest/networking/can.html#can-network-device-driver-interface)

These settings stay in effect for this interface session. Reconnecting an adapter or rebooting may require configuration again. First establish a working manual setup before adding automatic startup rules.

## Attach SLCAN firmware through its serial port

Skip this section if the adapter already exposes a native CAN interface. Locate the serial port and any persistent USB serial links:

```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
ls -l /dev/serial/by-id/
```

Use the entry belonging to the adapter. A `/dev/serial/by-id/` link, when available and unique, avoids depending on the order of USB enumeration. The following example assumes the correct port is `/dev/ttyACM0` and the name `can0` is unused:

```bash
sudo modprobe slcan
sudo slcand -o -c -s6 /dev/ttyACM0 can0
sudo ip link set can0 up
ip -brief link show can0
```

For SLCAN, `-s6` selects 500 kbit/s; `-s8` selects 1 Mbit/s. This configures the CAN side through the firmware's serial command protocol. The native-interface `type can bitrate` command is not the configuration path for this serial attachment. Confirm the rate codes and serial settings supported by the exact firmware. [CANable SLCAN instructions](https://canable.io/getting-started.html)

Reconnecting the USB device breaks the serial attachment. Close the old `slcand` instance before attaching the new port. A firmware change is a separate operation; it is unnecessary when the existing firmware already provides the required interface.

## Receive one documented feedback frame

Use the terminated twisted pair described in [CAN 01](/can01/). Power the actuator according to its manual and establish whether it sends feedback automatically or needs a documented request. Keep the actuator in its documented non-motion state during communication setup.

Listen without sending an application frame:

```bash
candump -tz can0
```

`-tz` starts timestamps at zero for the first received frame. An illustrative decoded frame looks like:

```text
(000.000000)  can0  123   [2]  34 12
(000.010000)  can0  123   [2]  34 12
```

Compare the identifier, payload length, and byte layout with the device manual. The hex identifier `123` and bytes `34 12` here are examples, not a command or a known actuator response. If the device specifies periodic feedback, compare successive timestamps with that expected period. [can-utils, candump options and filters](https://github.com/linux-can/can-utils/blob/master/candump.c)

`candump` reads frames delivered by the interface. Running it does not put the controller into hardware listen-only mode: a normally configured receiver can still acknowledge valid bus frames. Also, SocketCAN can deliver locally transmitted frames to other local sockets. Seeing your own transmission in a logger does not establish that the actuator received or acted on it. [SocketCAN local loopback](https://www.kernel.org/doc/html/latest/networking/can.html#local-loopback-of-sent-frames)

## Separate an empty log from a failed link

An empty capture can mean that no device is transmitting. Check the feedback behavior before treating silence as a wiring failure. Inspect native-interface statistics before and after a receive attempt:

```bash
ip -details -statistics link show can0
```

Increasing error counters or a transition to `BUS-OFF` calls for checking bitrate, wiring, termination, and the other active nodes. A transmitted frame needs acknowledgement from another normally participating CAN node. A USB adapter alone on a cable does not provide that peer. Serial firmware may expose fewer diagnostic counters than a native driver, so absence of a counter is not evidence of an error-free link.

After correcting a bus-off cause, a native interface can be restarted manually:

```bash
sudo ip link set can0 type can restart
```

This resumes a stopped controller; it does not repair the cause. Keep automatic restart out of the first diagnosis so repeated faults remain visible. [Linux kernel, CAN device states and bus-off recovery](https://www.kernel.org/doc/html/latest/networking/can.html#can-network-device-driver-interface)

## Practice frame syntax without a motor

A virtual CAN interface lets you check the command format without assigning arbitrary bytes to a physical actuator. Create `vcan0`:

```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set vcan0 up
```

Run a receiver in one terminal:

```bash
candump vcan0
```

Send the example payload from a second terminal:

```bash
cansend vcan0 123#3412
```

The receiver should display identifier `123` and the two bytes `34 12`. In `cansend` syntax, `#` separates the identifier from the payload. This checks a local software path. Virtual CAN has no physical bitrate, termination, acknowledgement wiring, or motor behavior to verify. [can-utils, cansend syntax](https://github.com/linux-can/can-utils/blob/master/cansend.c)

Remove the virtual interface when finished:

```bash
sudo ip link delete vcan0
```

For the physical interface, save a short feedback capture with its bitrate and device protocol reference. The [ESP32 example in CAN 03](/can03/) can then build on an identified channel and a known frame, rather than an interface that merely reports `UP`.
