"""Causal, time-stepped coupling of the MuJoCo finger, the emulation motor, the synthetic cable plant and
the input QDD motor.

One MuJoCo step of length ``mj_dt`` runs as follows (``n = mj_dt / plant_dt`` plant substeps):

1. Read the virtual tendon displacement ``x_cmd = l(q_k) - l(q_0)`` from the *current* MuJoCo state.
2. For each plant substep: the input motor advances under its current command and the previous input
   tension; the emulation motor servo advances toward ``x_cmd``; the cable plant advances with the new
   boundary motions and returns ``(T_in, T_out)``.
3. The distal tension is *measured* (noise, delay) and applied to MuJoCo as ``ctrl = -T_out``.
4. MuJoCo advances by ``mj_dt``.

So the tension used by MuJoCo in step k comes from the plant state at the end of step k, driven by the
finger configuration at the start of step k. There is no implicit algebraic loop; the one-step lag is part of
the modelled interface and is documented in the dataset metadata.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field, asdict

import numpy as np

from .cable import CablePlant, CableParams
from .finger import Finger, FingerParams
from .motors import QDDMotor, QDDMotorParams, EmulationMotor, EmulationMotorParams


@dataclass
class TimingParams:
    plant_dt: float = 1e-4  # s, cable / motor substep
    log_dt: float = 1e-3  # s, recording period


@dataclass
class SensorParams:
    tension_noise: float = 0.0  # N, std of both load cells
    tension_delay: float = 0.0  # s, delay of the distal tension fed to the simulation (sensing + communication)
    emulator_pos_noise: float = 0.0  # m, std on the emulator position measurement


@dataclass
class SimConfig:
    finger: FingerParams = field(default_factory=FingerParams)
    cable: CableParams = field(default_factory=CableParams)
    motor: QDDMotorParams = field(default_factory=QDDMotorParams)
    emulator: EmulationMotorParams = field(default_factory=EmulationMotorParams)
    timing: TimingParams = field(default_factory=TimingParams)
    sensors: SensorParams = field(default_factory=SensorParams)
    seed: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


class TiLSimulator:
    def __init__(self, cfg: SimConfig | None = None):
        self.cfg = cfg or SimConfig()
        c = self.cfg
        self.rng = np.random.default_rng(c.seed)
        self.finger = Finger(c.finger)
        self.plant = CablePlant(c.cable)
        self.motor = QDDMotor(c.motor, rng=np.random.default_rng(c.seed + 1))
        self.emulator = EmulationMotor(c.emulator, dt=c.timing.plant_dt)
        self.mj_dt = self.finger.dt
        self.n_sub = int(round(self.mj_dt / c.timing.plant_dt))
        if abs(self.n_sub * c.timing.plant_dt - self.mj_dt) > 1e-12:
            raise ValueError(f"plant_dt {c.timing.plant_dt} must divide the MuJoCo timestep {self.mj_dt}")
        n_delay = int(round(c.sensors.tension_delay / self.mj_dt))
        self._tdelay: deque[float] = deque([c.cable.pretension] * n_delay, maxlen=n_delay) if n_delay > 0 else deque(maxlen=0)
        self.log_every = max(1, int(round(c.timing.log_dt / self.mj_dt)))
        self.t = 0.0
        self.k = 0
        self.T_applied = c.cable.pretension
        self.T_in_meas = c.cable.pretension
        self.T_out_meas = c.cable.pretension

    # ----------------------------------------------------------------------------------------------
    def reset(self, q0: tuple[float, float] = (0.0, 0.0)) -> None:
        self.finger.reset(q0, pretension=self.cfg.cable.pretension)
        self.plant.reset()
        self.motor.reset(T_hold=self.cfg.cable.pretension)
        self.emulator.reset()
        T0 = self.cfg.cable.pretension
        for _ in range(self._tdelay.maxlen or 0):
            self._tdelay.append(T0)
        self.t = 0.0
        self.k = 0
        self.T_applied = self.T_in_meas = self.T_out_meas = T0

    def _measure(self, T: float) -> float:
        n = self.cfg.sensors.tension_noise
        return float(T + (self.rng.normal(0.0, n) if n > 0 else 0.0))

    # ----------------------------------------------------------------------------------------------
    def step(self, theta_ref: float, omega_ref: float = 0.0) -> None:
        """Advance the coupled system by one MuJoCo step with the given motor position reference."""
        x_cmd = self.finger.tendon_displacement()
        dt = self.cfg.timing.plant_dt
        for _ in range(self.n_sub):
            u = self.motor.command_from_reference(theta_ref, omega_ref)
            self.motor.step(dt, u, self.plant.s.T1)
            self.emulator.step(x_cmd)
            self.plant.step(dt, self.motor.x_in, self.motor.xd_in, self.emulator.s.x, self.emulator.s.v)
        self.T_in_meas = self._measure(self.plant.s.T1)
        self.T_out_meas = self._measure(self.plant.s.T2)
        T = self.T_out_meas
        if self._tdelay.maxlen:
            self._tdelay.append(T)
            T = self._tdelay[0]
        self.T_applied = T
        self.finger.apply_tension(T)
        self.finger.step()
        self.t += self.mj_dt
        self.k += 1

    @property
    def log_due(self) -> bool:
        return self.k % self.log_every == 0

    # ----------------------------------------------------------------------------------------------
    def record(self) -> dict[str, dict[str, float | np.ndarray]]:
        """All channels, split by information category. Only ``motor`` is available to a motor-only observer."""
        f, pl, em, mo = self.finger, self.plant, self.emulator, self.motor
        gt = pl.ground_truth()
        con = f.contact()
        x_e_meas = em.s.x + (self.rng.normal(0.0, self.cfg.sensors.emulator_pos_noise) if self.cfg.sensors.emulator_pos_noise > 0 else 0.0)
        obj_pos, obj_vel = f.object_state()
        return {
            "motor": mo.observation(),
            "emulator": {
                "commanded_position": em.s.x_cmd_raw,
                "actual_position": float(x_e_meas),
                "velocity": em.s.v,
                "tracking_error": em.tracking_error,
            },
            "transmission": {
                "input_tension": self.T_in_meas,
                "output_tension": self.T_out_meas,
                "input_displacement": mo.x_in,
                "output_displacement": float(x_e_meas),
                "apparent_elongation": mo.x_in + float(x_e_meas),
                "pulley_position": pl.s.phi,
                "pulley_velocity": pl.s.phi_d,
            },
            "simulation": {
                "joint_positions": f.q,
                "joint_velocities": f.qd,
                "tendon_length": f.tendon_length(),
                "tendon_moment_arms": f.tendon_jacobian(),
                "tendon_joint_torque": f.tendon_joint_torque(),
                "applied_tension": self.T_applied,
                "contact_state": con["contact_state"],
                "contact_force": con["contact_force"],
                "contact_location": con["contact_location"],
                "object_position": obj_pos,
                "object_velocity": obj_vel,
                "tip_position": f.tip_position(),
            },
            "ground_truth": {
                **gt,
                "input_tension_true": pl.s.T1,
                "output_tension_true": pl.s.T2,
                "pulley_friction_torque": pl.s.tau_f,
            },
        }


CHANNEL_UNITS: dict[str, str] = {
    "time": "s",
    "cycle_count": "cycles",
    "motor/position": "rad",
    "motor/velocity": "rad/s",
    "motor/current": "A",
    "motor/applied_command": "A",
    "motor/estimated_motor_torque": "N m",
    "emulator/commanded_position": "m",
    "emulator/actual_position": "m",
    "emulator/velocity": "m/s",
    "emulator/tracking_error": "m",
    "transmission/input_tension": "N",
    "transmission/output_tension": "N",
    "transmission/input_displacement": "m",
    "transmission/output_displacement": "m",
    "transmission/apparent_elongation": "m",
    "transmission/pulley_position": "rad",
    "transmission/pulley_velocity": "rad/s",
    "simulation/joint_positions": "rad",
    "simulation/joint_velocities": "rad/s",
    "simulation/tendon_length": "m",
    "simulation/tendon_moment_arms": "m (dl/dq, negative = flexion shortens)",
    "simulation/tendon_joint_torque": "N m",
    "simulation/applied_tension": "N",
    "simulation/contact_state": "bool",
    "simulation/contact_force": "N (normal)",
    "simulation/contact_location": "m (world x y z; NaN when no contact)",
    "simulation/object_position": "m (pad slide, negative = pressed down)",
    "simulation/object_velocity": "m/s",
    "simulation/tip_position": "m (world x y z)",
    "ground_truth/cable_segment_strains": "m (absolute stretch of segments 1, 2 incl. pretension)",
    "ground_truth/friction_state": "N m (Dahl presliding torque)",
    "ground_truth/friction_torque": "N m",
    "ground_truth/effective_stiffness": "N/m",
    "ground_truth/effective_friction": "N m (Coulomb level at zero load)",
    "ground_truth/slack_state": "bool (segments 1, 2)",
    "ground_truth/settle_state": "m",
    "ground_truth/creep_state": "m",
    "ground_truth/degradation_state": "1",
    "ground_truth/dissipated_energy": "J",
    "ground_truth/stored_energy": "J",
    "ground_truth/input_tension_true": "N",
    "ground_truth/output_tension_true": "N",
    "ground_truth/pulley_friction_torque": "N m",
}

MOTOR_ONLY_CHANNELS = ["motor/position", "motor/velocity", "motor/current", "motor/applied_command"]
