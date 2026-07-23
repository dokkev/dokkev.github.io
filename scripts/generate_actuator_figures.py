"""Generate reproducible model-based figures for Robot Hardware 05-07.

The parameter values are illustrative rather than tied to a specific product.
Each plot states the assumptions needed to interpret the result.
"""

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "img" / "hardware" / "models"

PAPER = "#f4f0e8"
INK = "#181714"
MUTED = "#777168"
GRID = "#d8d1c5"
ORANGE = "#ef5b2a"
TEAL = "#287b82"
BLUE = "#4169a1"


def configure_style() -> None:
    mpl.rcParams.update(
        {
            "figure.facecolor": PAPER,
            "axes.facecolor": PAPER,
            "savefig.facecolor": PAPER,
            "axes.edgecolor": INK,
            "axes.labelcolor": INK,
            "axes.titlecolor": INK,
            "text.color": INK,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "grid.color": GRID,
            "grid.linewidth": 0.7,
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "axes.spines.top": False,
            "axes.spines.right": False,
        }
    )


def finish(fig: plt.Figure, filename: str) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT / filename, dpi=220, bbox_inches="tight", pad_inches=0.18)
    plt.close(fig)


def torque_ripple_model() -> None:
    theta = np.linspace(0.0, 2.0 * np.pi, 2400)
    command = 5.0
    cogging = 0.11 * np.sin(12.0 * theta)
    flux_harmonic = 0.07 * np.sin(6.0 * theta + 0.55)
    inverter = 0.045 * np.sin(48.0 * theta - 0.35)
    encoder_error = np.deg2rad(3.0) * np.sin(theta)
    angle_coupling = command * (np.cos(encoder_error) - 1.0)
    measured = command + cogging + flux_harmonic + inverter + angle_coupling

    fig, axes = plt.subplots(2, 1, figsize=(10.5, 6.3), constrained_layout=True)
    ax = axes[0]
    degrees = np.rad2deg(theta)
    ax.plot(degrees, measured, color=INK, linewidth=1.4, label="realized torque")
    ax.axhline(command, color=ORANGE, linewidth=1.2, linestyle="--", label="5 Nm command")
    ax.set(xlim=(0, 360), ylabel="Torque [Nm]", title="A constant command produces position-synchronous torque ripple")
    ax.grid(True)
    ax.legend(frameon=False, ncol=2, loc="upper right")

    ax = axes[1]
    for signal, label, color in (
        (cogging, "cogging: 12/rev", TEAL),
        (flux_harmonic, "flux / winding: 6/rev", BLUE),
        (inverter, "PWM / inverter: 48/rev", ORANGE),
    ):
        ax.plot(degrees, signal, linewidth=1.0, label=label, color=color)
    ax.set(xlim=(0, 120), xlabel="Mechanical angle [deg]", ylabel="Torque error [Nm]")
    ax.grid(True)
    ax.legend(frameon=False, ncol=3, loc="upper right")
    fig.suptitle("ILLUSTRATIVE PMSM RIPPLE MODEL", x=0.01, ha="left", fontsize=11, fontweight="bold")
    finish(fig, "05-torque-ripple-model.png")


def angle_error_sensitivity() -> None:
    error_deg = np.linspace(-20.0, 20.0, 500)
    error = np.deg2rad(error_deg)
    torque_ratio = np.cos(error)
    unwanted_d = np.sin(error)

    fig, ax = plt.subplots(figsize=(9.4, 5.2), constrained_layout=True)
    ax.plot(error_deg, 100.0 * torque_ratio, color=INK, linewidth=2.0, label=r"$i_q/I=\cos(\Delta\theta_e)$")
    ax.plot(error_deg, 100.0 * unwanted_d, color=ORANGE, linewidth=2.0, label=r"$i_d/I=\sin(\Delta\theta_e)$")
    ax.axvspan(-5, 5, color=TEAL, alpha=0.1, label="±5° electrical error")
    ax.axhline(0, color=INK, linewidth=0.8)
    ax.set(
        xlabel="Electrical angle error [deg]",
        ylabel="Current component [% of commanded current]",
        title="Encoder angle error rotates commanded q-axis current into the d-axis",
    )
    ax.grid(True)
    ax.legend(frameon=False, loc="lower right")
    finish(fig, "05-angle-error-sensitivity.png")


def pwm_sampling_model() -> None:
    period_us = 50.0
    duty = 0.62
    blanking_us = 3.0
    t = np.linspace(0.0, period_us, 1200)
    on_time = duty * period_us
    slope_on = 0.085
    slope_off = -slope_on * on_time / (period_us - on_time)
    current = np.where(t <= on_time, slope_on * t, slope_on * on_time + slope_off * (t - on_time))
    current -= np.mean(current)

    switching_transient = 0.42 * np.exp(-t / 1.1) - 0.32 * np.exp(-np.maximum(t - on_time, 0.0) / 1.0) * (t >= on_time)
    measured = current + switching_transient
    valid = (t > blanking_us) & (t < on_time - blanking_us)

    fig, ax = plt.subplots(figsize=(10.0, 5.3), constrained_layout=True)
    ax.plot(t, current, color=INK, linewidth=2.0, label="phase current")
    ax.plot(t, measured, color=ORANGE, linewidth=1.4, label="ADC path with switching transient")
    ax.fill_between(t, -2.8, 2.8, where=valid, color=TEAL, alpha=0.12, label="valid sampling window")
    ax.axvline(on_time, color=MUTED, linestyle="--", linewidth=1.0, label="PWM edge")
    ax.set(
        xlim=(0, period_us),
        ylim=(-2.0, 2.4),
        xlabel="Time within one PWM period [µs]",
        ylabel="Current ripple about mean [A]",
        title="Sampling too close to a switching edge turns settling error into current error",
    )
    ax.grid(True)
    ax.legend(frameon=False, ncol=2, loc="upper right")
    finish(fig, "05-pwm-sampling-model.png")


def backlash_hysteresis() -> None:
    b = np.deg2rad(0.18)
    stiffness = 1200.0
    delta = np.concatenate((np.linspace(-0.55, 0.55, 500), np.linspace(0.55, -0.55, 500)))
    delta_rad = np.deg2rad(delta)
    torque = np.zeros_like(delta_rad)
    contact = -1
    for index, value in enumerate(delta_rad):
        if contact < 0 and value >= b:
            contact = 1
        elif contact > 0 and value <= -b:
            contact = -1
        torque[index] = stiffness * (value - contact * b)

    fig, ax = plt.subplots(figsize=(8.8, 5.5), constrained_layout=True)
    split = len(delta) // 2
    ax.plot(delta[:split], torque[:split], color=ORANGE, linewidth=2.0, label="increasing deflection")
    ax.plot(delta[split:], torque[split:], color=TEAL, linewidth=2.0, label="decreasing deflection")
    ax.axvspan(-np.rad2deg(b), np.rad2deg(b), color=INK, alpha=0.07, label="2b clearance")
    ax.axhline(0, color=INK, linewidth=0.8)
    ax.axvline(0, color=INK, linewidth=0.8)
    ax.set(
        xlabel="Transmission deflection δ [deg]",
        ylabel="Transmitted torque [Nm]",
        title="Backlash is a direction-dependent torque–deflection loop",
    )
    ax.grid(True)
    ax.legend(frameon=False)
    finish(fig, "06-backlash-hysteresis.png")


def preload_response() -> None:
    delta_deg = np.linspace(-0.55, 0.55, 800)
    delta = np.deg2rad(delta_deg)
    stiffness = 1100.0
    clearance = np.deg2rad(0.18)
    no_preload = stiffness * np.sign(delta) * np.maximum(np.abs(delta) - clearance, 0.0)
    preload_torques = (1.5, 3.5, 6.0)

    fig, ax = plt.subplots(figsize=(9.2, 5.4), constrained_layout=True)
    ax.plot(delta_deg, no_preload, color=INK, linewidth=2.0, label="no preload")
    for preload, color in zip(preload_torques, (BLUE, TEAL, ORANGE), strict=True):
        response = np.clip(stiffness * delta, -preload, preload)
        released = np.abs(stiffness * delta) > preload
        response[released] = np.sign(delta[released]) * (
            preload + 0.45 * stiffness * (np.abs(delta[released]) - preload / stiffness)
        )
        ax.plot(delta_deg, response, linewidth=1.7, color=color, label=f"preload = {preload:g} Nm")
    ax.set(
        xlabel="Relative gear displacement [deg]",
        ylabel="Transmitted torque [Nm]",
        title="Preload removes the zero-torque gap but raises internal mesh load",
    )
    ax.grid(True)
    ax.legend(frameon=False, ncol=2)
    finish(fig, "06-preload-response.png")


def cartesian_error_propagation() -> None:
    lengths = np.array([0.45, 0.35, 0.25])
    q = np.deg2rad(np.array([25.0, -40.0, 35.0]))
    error = np.deg2rad(np.linspace(-0.12, 0.12, 25))
    dq = np.array(np.meshgrid(error, error, error)).reshape(3, -1).T

    def fk(joints: np.ndarray) -> np.ndarray:
        cumulative = np.cumsum(joints, axis=-1)
        return np.stack(
            (
                np.sum(lengths * np.cos(cumulative), axis=-1),
                np.sum(lengths * np.sin(cumulative), axis=-1),
            ),
            axis=-1,
        )

    nominal = fk(q)
    points = fk(q + dq)
    offset_mm = 1000.0 * (points - nominal)
    magnitude = np.linalg.norm(offset_mm, axis=1)

    fig, ax = plt.subplots(figsize=(7.4, 6.2), constrained_layout=True)
    scatter = ax.scatter(offset_mm[:, 0], offset_mm[:, 1], c=magnitude, cmap="magma", s=7, alpha=0.65)
    ax.scatter([0], [0], marker="+", s=130, linewidth=2.0, color=TEAL, label="nominal endpoint")
    ax.set(
        xlabel="Endpoint x error [mm]",
        ylabel="Endpoint y error [mm]",
        title="Small joint lost motion becomes a pose-dependent endpoint error cloud",
        aspect="equal",
    )
    ax.grid(True)
    ax.legend(frameon=False)
    colorbar = fig.colorbar(scatter, ax=ax, pad=0.02)
    colorbar.set_label("Error magnitude [mm]")
    finish(fig, "06-cartesian-error.png")


def thermal_transient() -> None:
    dt = 0.05
    time = np.arange(0.0, 900.0 + dt, dt)
    ambient = 25.0
    resistance_25 = 0.09
    alpha_cu = 0.0039
    torque_constant_25 = 0.32
    magnet_temp_coeff = -0.001
    thermal_resistance = 0.42
    thermal_capacity = 105.0
    target_torque = 11.0
    current_limit = 38.0
    derating_onset = 80.0
    shutdown_temperature = 115.0

    temperature = np.full_like(time, ambient)
    current = np.zeros_like(time)
    available_torque = np.zeros_like(time)
    copper_loss = np.zeros_like(time)
    for index in range(1, len(time)):
        kt = torque_constant_25 * (1.0 + magnet_temp_coeff * (temperature[index - 1] - ambient))
        current[index - 1] = min(target_torque / kt, current_limit)
        resistance = resistance_25 * (1.0 + alpha_cu * (temperature[index - 1] - ambient))
        copper_loss[index - 1] = current[index - 1] ** 2 * resistance
        dtemp = (
            copper_loss[index - 1] - (temperature[index - 1] - ambient) / thermal_resistance
        ) / thermal_capacity
        temperature[index] = temperature[index - 1] + dt * dtemp
        derating = np.clip(
            1.0
            - max(temperature[index] - derating_onset, 0.0)
            / (shutdown_temperature - derating_onset),
            0.35,
            1.0,
        )
        available_torque[index] = kt * current_limit * derating
    current[-1] = current[-2]
    copper_loss[-1] = copper_loss[-2]
    available_torque[0] = torque_constant_25 * current_limit

    fig, ax_temp = plt.subplots(figsize=(10.0, 5.5), constrained_layout=True)
    minutes = time / 60.0
    ax_temp.plot(minutes, temperature, color=ORANGE, linewidth=2.2, label="winding temperature")
    ax_temp.axhline(
        derating_onset,
        color=ORANGE,
        linestyle="--",
        linewidth=1.0,
        label="derating onset",
    )
    ax_temp.set(xlabel="Time [min]", ylabel="Winding temperature [°C]", title="Thermal state changes the torque envelope during a repeated task")
    ax_temp.grid(True)

    ax_torque = ax_temp.twinx()
    ax_torque.plot(minutes, available_torque, color=TEAL, linewidth=2.0, label="available torque")
    ax_torque.axhline(target_torque, color=INK, linestyle=":", linewidth=1.2, label="target torque")
    ax_torque.set_ylabel("Torque [Nm]")
    handles = ax_temp.get_lines() + ax_torque.get_lines()
    ax_temp.legend(handles, [line.get_label() for line in handles], frameon=False, ncol=2, loc="center right")
    finish(fig, "07-thermal-transient.png")


def efficiency_map() -> None:
    speed = np.linspace(0.0, 420.0, 260)
    torque = np.linspace(0.0, 14.0, 220)
    omega, tau = np.meshgrid(speed, torque)
    kt = 0.32
    resistance = 0.09
    current = tau / kt
    mechanical = tau * omega
    copper = current**2 * resistance
    iron = 0.0018 * omega**2
    friction = (0.13 + 0.0007 * omega) * omega
    inverter = 18.0 + 0.012 * current**2
    efficiency = np.divide(mechanical, mechanical + copper + iron + friction + inverter, out=np.zeros_like(mechanical), where=mechanical > 0)

    fig, ax = plt.subplots(figsize=(9.2, 6.0), constrained_layout=True)
    levels = np.arange(0.1, 1.0, 0.1)
    contour = ax.contourf(speed, torque, efficiency, levels=levels, cmap="YlOrBr")
    lines = ax.contour(speed, torque, efficiency, levels=(0.5, 0.7, 0.8, 0.9), colors=INK, linewidths=0.65)
    ax.clabel(lines, inline=True, fontsize=8, fmt=lambda value: f"{value:.0%}")
    phase = np.linspace(0.0, 2.0 * np.pi, 500)
    trajectory_speed = 165.0 + 145.0 * np.sin(phase)
    trajectory_torque = 5.5 + 4.2 * np.sin(phase + 1.15)
    ax.plot(trajectory_speed, trajectory_torque, color=TEAL, linewidth=2.0, label="example joint duty cycle")
    ax.scatter([0], [9.7], color=ORANGE, s=35, zorder=4, label="near-stall hold")
    ax.set(xlabel="Motor speed [rad/s]", ylabel="Motor torque [Nm]", title="Efficiency follows operating point, not a single motor rating")
    ax.legend(frameon=False, loc="upper right")
    colorbar = fig.colorbar(contour, ax=ax, pad=0.02)
    colorbar.set_label("Efficiency")
    finish(fig, "07-efficiency-map.png")


def gear_ratio_tradeoff() -> None:
    ratio = np.logspace(np.log10(3.0), np.log10(120.0), 400)
    joint_torque = 30.0
    efficiency = 0.85
    kt = 0.22
    resistance = 0.075
    rotor_inertia = 2.2e-4
    current = joint_torque / (efficiency * ratio * kt)
    copper_loss = 3.0 * current**2 * resistance
    reflected_inertia = ratio**2 * rotor_inertia

    fig, ax_loss = plt.subplots(figsize=(9.5, 5.5), constrained_layout=True)
    ax_loss.loglog(ratio, copper_loss, color=ORANGE, linewidth=2.2, label="copper loss at 30 Nm")
    ax_loss.set(xlabel="Gear ratio N", ylabel="Copper loss [W]", title="Gear ratio trades motor heating against reflected inertia")
    ax_loss.grid(True, which="both")

    ax_inertia = ax_loss.twinx()
    ax_inertia.loglog(ratio, reflected_inertia, color=TEAL, linewidth=2.2, label=r"$N^2J_m$ reflected inertia")
    ax_inertia.set_ylabel("Reflected inertia [kg·m²]")
    ax_loss.axvspan(5, 15, color=TEAL, alpha=0.08, label="typical low-ratio design region")
    handles = ax_loss.get_lines() + ax_inertia.get_lines() + [ax_loss.patches[0]]
    ax_loss.legend(handles, [item.get_label() for item in handles], frameon=False, loc="upper center", ncol=3)
    finish(fig, "07-gear-ratio-tradeoff.png")


def main() -> None:
    configure_style()
    torque_ripple_model()
    angle_error_sensitivity()
    pwm_sampling_model()
    backlash_hysteresis()
    preload_response()
    cartesian_error_propagation()
    thermal_transient()
    efficiency_map()
    gear_ratio_tradeoff()


if __name__ == "__main__":
    main()
