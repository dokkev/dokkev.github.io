"""Synthetic cable plant: a two-port tendon transmission with its own mechanics, independent of MuJoCo.

Units are SI throughout (m, N, s, rad, kg).

Geometry and sign convention
----------------------------
    input motor drum --(segment 1)-- pulley --(segment 2)-- output end (emulation motor = finger tendon port)

* ``x_in``  : displacement of the input cable end along the cable path, positive toward the input motor
              (reeling in). ``x_in = r_drum * theta_motor``.
* ``x_out`` : displacement of the output cable end along the path, positive toward the output motor,
              i.e. away from the pulley (the finger *extending* and pulling cable out of the transmission).
* ``phi``   : pulley angle, positive when cable flows from the output side to the input side. The cable
              contact point then moves ``R_p * phi`` along the path toward the input motor.

Segment stretches (from the calibrated zero, where both ends are at rest with the pretension applied)::

    delta_1 = x_in  - R_p * phi
    delta_2 = x_out + R_p * phi - creep - settle

The pretension is represented as an initial stretch ``delta_0 = T_0 / k_0`` of both segments, so that at
``x_in = x_out = phi = 0`` both tensions equal ``T_0``. A cable only pulls: tensions are clipped at zero
(slack).

Pulley torque balance (``T_1`` pulls the contact point toward the input side, ``T_2`` toward the output side)::

    J_p * phi_dd = R_p * (T_1 - T_2) - tau_friction(phi_d, T_1 + T_2, z)

Apparent transmission deformation seen from the two boundaries is ``x_in + x_out`` (it equals
``delta_1 + delta_2 + creep + settle``: the pulley motion cancels out). A rigid, friction-free cable gives
``x_in + x_out = 0``.

Optional nonlinear effects (all documented constitutive toys, not material laws):

* cubic stiffening ``k3 * (delta + delta_0)^3``
* Coulomb + viscous + load-proportional bearing friction, optionally through a Dahl presliding state ``z``
  (gives hysteresis loops and direction-reversal behaviour)
* termination settling: irreversible, saturating lengthening of the output side under tension
* creep: irreversible lengthening of the output side growing with ``(T_2 / T_ref)^2`` while above a threshold
* degradation state ``d`` in [0, 1] driven by dissipated energy: ``k_eff = k_0 (1 - alpha d)``,
  ``tau_c_eff = tau_c (1 + beta d)``

All hidden states are exposed through :meth:`CablePlant.ground_truth` for recording. They must never be
given to a motor-only estimator.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal

import numpy as np

FrictionModel = Literal["none", "viscous", "coulomb", "dahl"]


@dataclass
class CableParams:
    # elastic segments
    k0: float = 10_000.0  # N/m, linear stiffness of each segment (10 N/mm)
    k3: float = 0.0  # N/m^3, cubic stiffening (0 = linear)
    c: float = 2.0  # N s/m, viscous damping of each segment
    pretension: float = 10.0  # N

    # pulley
    R_p: float = 0.02  # m
    J_p: float = 2e-6  # kg m^2
    b_p: float = 1e-5  # N m s/rad, viscous bearing drag
    friction_model: FrictionModel = "viscous"
    tau_c: float = 0.0  # N m, Coulomb friction torque at zero load
    mu_load: float = 0.0  # load-proportional bearing friction: adds mu_load * R_p * (T1 + T2) to the Coulomb level
    dahl_sigma: float = 50.0  # N m / rad, presliding stiffness of the Dahl model
    v_eps: float = 1e-2  # rad/s, smoothing width of the Coulomb sign function

    # termination settling (output side)
    settle_rate: float = 0.0  # m / (N s)
    settle_cap: float = 0.0  # m, maximum settling
    settle_T_thresh: float = 0.0  # N, tension above which settling proceeds

    # creep (output side)
    creep_rate: float = 0.0  # m/s at T_2 = creep_T_ref
    creep_T_ref: float = 30.0  # N
    creep_T_thresh: float = 0.0  # N

    # degradation driven by dissipated energy
    drift_enabled: bool = False
    drift_rate: float = 0.0  # 1/J: d increases by drift_rate per joule dissipated (saturates at 1)
    alpha_k: float = 0.0  # stiffness loss at d = 1
    beta_f: float = 0.0  # Coulomb friction gain at d = 1

    def to_dict(self) -> dict:
        return asdict(self)


# Presets used by the baseline experiments.
PRESETS: dict[str, CableParams] = {
    "rigid": CableParams(k0=2.0e6, c=50.0, J_p=1e-8, b_p=0.0, friction_model="none"),
    "linear": CableParams(),
    "nonlinear": CableParams(
        k3=3.0e9,
        friction_model="dahl",
        tau_c=0.004,
        mu_load=0.02,
        dahl_sigma=80.0,
        settle_rate=2e-7,
        settle_cap=4e-4,
        settle_T_thresh=15.0,
    ),
    "drift": CableParams(
        k3=3.0e9,
        friction_model="dahl",
        tau_c=0.004,
        mu_load=0.02,
        dahl_sigma=80.0,
        settle_rate=2e-7,
        settle_cap=4e-4,
        settle_T_thresh=15.0,
        creep_rate=4e-6,
        creep_T_ref=30.0,
        creep_T_thresh=12.0,
        drift_enabled=True,
        drift_rate=0.5,
        alpha_k=0.25,
        beta_f=1.0,
    ),
}


@dataclass
class CableState:
    phi: float = 0.0  # rad
    phi_d: float = 0.0  # rad/s
    z: float = 0.0  # N m, Dahl friction torque state
    settle: float = 0.0  # m
    creep: float = 0.0  # m
    d: float = 0.0  # degradation in [0, 1]
    E_diss: float = 0.0  # J, cumulative dissipated energy
    W_in: float = 0.0  # J, cumulative work done on the plant through the input port
    W_out: float = 0.0  # J, cumulative work done on the plant through the output port
    # last-step outputs
    T1: float = 0.0
    T2: float = 0.0
    delta1: float = 0.0
    delta2: float = 0.0
    tau_f: float = 0.0
    P_diss: float = 0.0


class CablePlant:
    """Two-port synthetic tendon transmission. Call :meth:`step` once per plant substep."""

    def __init__(self, params: CableParams | None = None):
        self.p = params or CableParams()
        self.s = CableState()
        self._prev_x_in = 0.0
        self._prev_x_out = 0.0
        # calibrated zero: both ends at rest with the pretension applied
        self.reset()

    # ----------------------------------------------------------------------------------------------
    def reset(self) -> None:
        self.s = CableState()
        p = self.p
        self.s.T1 = self.s.T2 = p.pretension
        self._prev_x_in = 0.0
        self._prev_x_out = 0.0
        self._E_el = 2.0 * self._elastic(0.0)[2]  # pretension energy of both segments

    # ----------------------------------------------------------------------------------------------
    @property
    def k_eff(self) -> float:
        return self.p.k0 * (1.0 - self.p.alpha_k * self.s.d)

    @property
    def tau_c_eff(self) -> float:
        return self.p.tau_c * (1.0 + self.p.beta_f * self.s.d)

    @property
    def delta0(self) -> float:
        """Pretension stretch (uses the nominal stiffness: the pretension was set when the cable was new)."""
        return self.p.pretension / self.p.k0

    def _elastic(self, delta: float) -> tuple[float, float, float]:
        """Elastic tension, tangent stiffness and stored energy of one segment at stretch ``delta``
        (measured from the calibrated zero). A slack segment returns zeros."""
        e = delta + self.delta0
        if e <= 0.0:
            return 0.0, 0.0, 0.0
        k = self.k_eff
        return k * e + self.p.k3 * e**3, k + 3.0 * self.p.k3 * e * e, 0.5 * k * e * e + 0.25 * self.p.k3 * e**4

    def _friction(self, phi_d: float, load: float, dt: float) -> float:
        """Pulley friction torque opposing ``phi_d``. Updates the Dahl state when that model is active."""
        p = self.p
        s = self.s
        level = self.tau_c_eff + p.mu_load * p.R_p * load  # Coulomb level, load dependent
        if p.friction_model == "none":
            return 0.0
        if p.friction_model == "viscous":
            return p.b_p * phi_d
        if p.friction_model == "coulomb":
            return level * np.tanh(phi_d / p.v_eps) + p.b_p * phi_d
        # dahl: dz/dt = sigma * phi_d * (1 - z / level * sign(phi_d)); z is the presliding friction torque
        if level > 0.0:
            sgn = np.tanh(phi_d / p.v_eps)
            z = s.z + dt * p.dahl_sigma * phi_d * (1.0 - (s.z / level) * sgn)
            s.z = float(np.clip(z, -level, level))
        else:
            s.z = 0.0
        return s.z + p.b_p * phi_d

    # ----------------------------------------------------------------------------------------------
    def step(self, dt: float, x_in: float, xd_in: float, x_out: float, xd_out: float) -> tuple[float, float]:
        """Advance the plant by ``dt`` given the boundary motions; returns ``(T_in, T_out)``."""
        p = self.p
        s = self.s
        R = p.R_p
        T1_prev, T2_prev = s.T1, s.T2

        # elastic state at the start of the step
        d1 = x_in - R * s.phi
        d2 = x_out + R * s.phi - s.creep - s.settle
        T1e, k1, _ = self._elastic(d1)
        T2e, k2, _ = self._elastic(d2)
        c1 = p.c if T1e > 0.0 else 0.0  # a slack segment has no viscous force either
        c2 = p.c if T2e > 0.0 else 0.0

        # Pulley update, implicit in the (stiff) spring and viscous terms so that near-rigid cables stay stable:
        #   J (phi_d' - phi_d) / dt = R (T1e - T2e) + R (c1 xd_in - c2 xd_out) - K_phi dt phi_d' - D_phi phi_d' - tau_f
        # with K_phi = R^2 (k1 + k2) and D_phi = R^2 (c1 + c2) + b_p (the viscous bearing term lives here too).
        tau_f = self._friction(s.phi_d, T1e + T2e, dt) - p.b_p * s.phi_d  # non-viscous part only
        K_phi = R * R * (k1 + k2)
        D_phi = R * R * (c1 + c2) + p.b_p
        num = s.phi_d + dt / p.J_p * (R * (T1e - T2e) + R * (c1 * xd_in - c2 * xd_out) - tau_f)
        s.phi_d = num / (1.0 + dt / p.J_p * (D_phi + dt * K_phi))
        s.phi += s.phi_d * dt

        # tensions at the end of the step (elastic + viscous), cables only pull
        d1 = x_in - R * s.phi
        d2 = x_out + R * s.phi - s.creep - s.settle
        d1_d = xd_in - R * s.phi_d
        d2_d = xd_out + R * s.phi_d
        T1e, _, E1 = self._elastic(d1)
        T2e, _, E2 = self._elastic(d2)
        T1 = max(0.0, T1e + c1 * d1_d) if T1e > 0.0 else 0.0
        T2 = max(0.0, T2e + c2 * d2_d) if T2e > 0.0 else 0.0
        tau_f = tau_f + p.b_p * s.phi_d

        # hidden irreversible states (output side)
        if p.settle_rate > 0.0 and T2 > p.settle_T_thresh and s.settle < p.settle_cap:
            s.settle = min(p.settle_cap, s.settle + dt * p.settle_rate * (T2 - p.settle_T_thresh) * (1.0 - s.settle / p.settle_cap))
        if p.creep_rate > 0.0 and T2 > p.creep_T_thresh:
            s.creep += dt * p.creep_rate * (T2 / p.creep_T_ref) ** 2

        # power bookkeeping (work through the ports by the trapezoid rule, exact for a linear spring)
        P_visc = c1 * d1_d * d1_d + c2 * d2_d * d2_d
        P_fric = tau_f * s.phi_d
        P_diss = P_visc + P_fric
        s.E_diss += P_diss * dt
        s.W_in += 0.5 * (T1 + T1_prev) * (x_in - self._prev_x_in)
        s.W_out += 0.5 * (T2 + T2_prev) * (x_out - self._prev_x_out)
        self._prev_x_in, self._prev_x_out = x_in, x_out
        if p.drift_enabled:
            s.d = min(1.0, s.d + p.drift_rate * max(0.0, P_diss) * dt)

        s.T1, s.T2, s.delta1, s.delta2, s.tau_f, s.P_diss = T1, T2, d1, d2, tau_f, P_diss
        self._E_el = E1 + E2
        return T1, T2

    # ----------------------------------------------------------------------------------------------
    def stored_energy(self) -> float:
        return getattr(self, "_E_el", 0.0) + 0.5 * self.p.J_p * self.s.phi_d**2

    def ground_truth(self) -> dict[str, float]:
        """Hidden plant states and current effective parameters (privileged information)."""
        s = self.s
        return {
            "cable_segment_strains": np.array([s.delta1 + self.delta0, s.delta2 + self.delta0]),
            "friction_state": s.z,
            "friction_torque": s.tau_f,
            "effective_stiffness": self.k_eff,
            "effective_friction": self.tau_c_eff,
            "slack_state": np.array([float(s.T1 <= 0.0), float(s.T2 <= 0.0)]),
            "settle_state": s.settle,
            "creep_state": s.creep,
            "degradation_state": s.d,
            "dissipated_energy": s.E_diss,
            "stored_energy": self.stored_energy(),
        }
