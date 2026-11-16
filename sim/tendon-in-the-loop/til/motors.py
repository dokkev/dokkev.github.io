"""Actuator models of the synthetic dynamometer: the input QDD motor and the emulation motor.

SI units. Sign conventions follow :mod:`til.cable`: the input motor reels cable in with positive angle
(``x_in = r_drum * theta``) and the emulation motor's position is ``x_out`` (positive away from the pulley).
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, asdict
from typing import Literal

import numpy as np


# --------------------------------------------------------------------------------------------------
@dataclass
class QDDMotorParams:
    J_m: float = 2e-5  # kg m^2, rotor + drum inertia
    K_t: float = 0.1  # N m / A
    K_t_nominal: float = 0.1  # controller / estimator calibration; not the plant's true K_t
    winding_resistance: float = 0.0  # ohm; zero disables heating
    thermal_capacity: float = 20.0  # J/K, exploratory single-lump thermal proxy
    thermal_resistance: float = 8.0  # K/W
    ambient_temperature: float = 25.0  # deg C
    K_t_temperature_coeff: float = 0.0  # 1/K, effective magnet-temperature proxy
    r_drum: float = 0.02  # m
    b_m: float = 2e-5  # N m s/rad, viscous
    tau_c_m: float = 0.0  # N m, Coulomb
    v_eps: float = 0.05  # rad/s
    i_max: float = 8.0  # A, current (torque) limit
    tau_elec: float = 1e-3  # s, current-loop time constant (0 = instantaneous)
    # controller: PD on the motor angle, producing a current command
    Kp: float = 60.0  # A/rad
    Kd: float = 0.6  # A s/rad
    # measurement
    encoder_cpr: int = 0  # counts per revolution of the encoder (0 = continuous)
    velocity_noise: float = 0.0  # rad/s, std
    current_noise: float = 0.0  # A, std
    current_gain: float = 1.0
    current_bias: float = 0.0  # A
    current_colored_noise: float = 0.0  # A, stationary std
    current_correlation_time: float = 0.05  # s
    encoder_offset: float = 0.0  # rad

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class QDDMotorState:
    theta: float = 0.0
    omega: float = 0.0
    i: float = 0.0  # actual current
    u: float = 0.0  # commanded current
    T_load: float = 0.0  # cable tension at the drum
    i_ff: float = 0.0  # feedforward current holding the nominal pretension (set at reset)
    temperature: float = 25.0
    current_noise_state: float = 0.0


class QDDMotor:
    """Quasi-direct-drive input motor with a drum, a current loop, and a position PD controller."""

    def __init__(self, params: QDDMotorParams | None = None, rng: np.random.Generator | None = None):
        self.p = params or QDDMotorParams()
        if min(self.p.K_t, self.p.K_t_nominal, self.p.thermal_capacity, self.p.thermal_resistance, self.p.current_correlation_time) <= 0:
            raise ValueError("motor constants and thermal/noise time scales must be positive")
        self.s = QDDMotorState()
        self.rng = rng or np.random.default_rng(0)

    def reset(self, T_hold: float = 0.0) -> None:
        """Start at rest holding the cable tension ``T_hold`` (the current needed to balance it at the drum)."""
        self.s = QDDMotorState()
        self.s.temperature = self.p.ambient_temperature
        self.s.i_ff = self.p.r_drum * T_hold / self.p.K_t_nominal
        self.s.i = self.s.u = float(np.clip(self.s.i_ff, -self.p.i_max, self.p.i_max))
        self.s.T_load = T_hold

    @property
    def x_in(self) -> float:
        return self.p.r_drum * self.s.theta

    @property
    def xd_in(self) -> float:
        return self.p.r_drum * self.s.omega

    @property
    def effective_K_t(self) -> float:
        factor = 1 + self.p.K_t_temperature_coeff * (self.s.temperature - self.p.ambient_temperature)
        return self.p.K_t * float(np.clip(factor, .5, 1.5))

    def command_from_reference(self, theta_ref: float, omega_ref: float = 0.0) -> float:
        """Motor-side PD position controller with pretension feedforward: returns the current command (A), saturated."""
        p, s = self.p, self.s
        u = s.i_ff + p.Kp * (theta_ref - s.theta) + p.Kd * (omega_ref - s.omega)
        return float(np.clip(u, -p.i_max, p.i_max))

    def step(self, dt: float, u: float, T_in: float) -> None:
        """Advance the rotor by ``dt`` under current command ``u`` and cable tension ``T_in`` at the drum."""
        p, s = self.p, self.s
        s.u = float(np.clip(u, -p.i_max, p.i_max))
        if p.tau_elec > 0.0:
            s.i += dt / p.tau_elec * (s.u - s.i)
        else:
            s.i = s.u
        # Single-lump approximation; not a calibrated winding/magnet thermal model.
        heat = s.i**2 * p.winding_resistance
        s.temperature += dt * (heat - (s.temperature - p.ambient_temperature) / p.thermal_resistance) / p.thermal_capacity
        tau = self.effective_K_t * s.i - p.b_m * s.omega - p.tau_c_m * np.tanh(s.omega / p.v_eps) - p.r_drum * T_in
        s.omega += tau / p.J_m * dt
        s.theta += s.omega * dt
        s.T_load = T_in

    def observation(self, sample_dt: float = 1e-3) -> dict[str, float]:
        """Motor-only observation ``[q_m, qd_m, i_m, u_m]`` with the modelled sensing imperfections."""
        p, s = self.p, self.s
        q = s.theta + p.encoder_offset
        if p.encoder_cpr > 0:
            q = np.round(q * p.encoder_cpr / (2 * np.pi)) * (2 * np.pi) / p.encoder_cpr
        qd = s.omega + (self.rng.normal(0.0, p.velocity_noise) if p.velocity_noise > 0 else 0.0)
        if p.current_colored_noise > 0:
            rho = np.exp(-sample_dt / p.current_correlation_time)
            s.current_noise_state = rho * s.current_noise_state + p.current_colored_noise * np.sqrt(1-rho*rho) * self.rng.normal()
        i = p.current_gain * s.i + p.current_bias + s.current_noise_state + (self.rng.normal(0.0, p.current_noise) if p.current_noise > 0 else 0.0)
        return {"position": float(q), "velocity": float(qd), "current": float(i), "applied_command": float(s.u), "estimated_motor_torque": float(p.K_t_nominal * i)}


# --------------------------------------------------------------------------------------------------
@dataclass
class EmulationMotorParams:
    mode: Literal["servo", "ideal"] = "servo"
    Kp: float = 1.5e5  # 1/s^2, position loop (acceleration per metre of error): ~60 Hz
    Kd: float = 780.0  # 1/s (critically damped)
    v_max: float = 0.5  # m/s
    a_max: float = 100.0  # m/s^2
    x_min: float = -0.05  # m, stroke limits
    x_max: float = 0.05
    delay: float = 0.0  # s, command (communication + control) delay
    velocity_feedforward: bool = True  # track the command velocity (finite-differenced) as well as its position

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def bandwidth_hz(self) -> float:
        """Natural frequency of the position loop, as a rough tracking-bandwidth figure."""
        return float(np.sqrt(self.Kp) / (2 * np.pi))


@dataclass
class EmulationMotorState:
    x: float = 0.0
    v: float = 0.0
    x_cmd: float = 0.0  # command currently being tracked (after the delay)
    x_cmd_raw: float = 0.0  # command as issued by the simulation


class EmulationMotor:
    """Position-controlled output actuator that renders the virtual finger's tendon displacement."""

    def __init__(self, params: EmulationMotorParams | None = None, dt: float = 1e-4):
        self.p = params or EmulationMotorParams()
        self.dt = dt
        self.s = EmulationMotorState()
        n = int(round(self.p.delay / dt))
        if dt <= 0 or self.p.delay < 0 or abs(n * dt - self.p.delay) > 1e-12:
            raise ValueError("emulator delay must be a nonnegative integer multiple of dt")
        self._buf: deque[float] = deque([0.0] * n, maxlen=n) if n > 0 else deque(maxlen=0)

    def reset(self) -> None:
        self.s = EmulationMotorState()
        for _ in range(self._buf.maxlen or 0):
            self._buf.append(0.0)

    def step(self, x_cmd: float) -> None:
        p, s = self.p, self.s
        s.x_cmd_raw = x_cmd
        if self._buf.maxlen:
            delayed = self._buf.popleft()
            self._buf.append(x_cmd)
            x_cmd = delayed
        v_cmd = (x_cmd - s.x_cmd) / self.dt if p.velocity_feedforward else 0.0
        s.x_cmd = x_cmd
        if p.mode == "ideal":
            s.v = (x_cmd - s.x) / self.dt
            s.x = x_cmd
            return
        a = p.Kp * (x_cmd - s.x) + p.Kd * (v_cmd - s.v)
        a = float(np.clip(a, -p.a_max, p.a_max))
        s.v = float(np.clip(s.v + a * self.dt, -p.v_max, p.v_max))
        s.x += s.v * self.dt
        if s.x < p.x_min or s.x > p.x_max:  # hard stroke limit
            s.x = float(np.clip(s.x, p.x_min, p.x_max))
            s.v = 0.0

    @property
    def tracking_error(self) -> float:
        return self.s.x_cmd_raw - self.s.x
