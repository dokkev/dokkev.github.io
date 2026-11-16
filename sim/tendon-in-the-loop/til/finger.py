"""MuJoCo 2-DoF planar finger with one flexor tendon and a sprung object it can press.

Frame and sign convention
-------------------------
* The finger lies in the x–z plane and hangs from a fixed base at the origin, pointing along +x at ``q = 0``.
* Both joints rotate about +y. A positive joint angle rotates +x toward −z, so **positive q = flexion
  (downward, palm side)**. Gravity acts along −z.
* The flexor tendon is routed through sites on the palm side (−z) of each link. Flexion shortens it, so the
  tendon length Jacobian ``J_l = dl/dq`` is negative. At ``q = 0`` the moment arm of each joint is exactly the
  site offset ``h`` below the link axis (verified in the tests).
* The tendon in this model carries **no stiffness, damping, or friction of its own**. Its force comes only
  from the synthetic cable plant, applied through a general actuator with unit gain: ``ctrl = -T_out``
  (negative force on a MuJoCo tendon shortens it, i.e. pulls).
* The object is a pad on a vertical slide joint with an explicit spring (``k_obj``) and damper, placed on the
  palm side so the fingertip presses it during flexion. Its stiffness is the "object stiffness" of the sweeps.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import mujoco
import numpy as np


@dataclass
class FingerParams:
    L1: float = 0.05  # m
    L2: float = 0.035  # m
    r_link: float = 0.006  # m, link capsule radius
    m1: float = 0.020  # kg
    m2: float = 0.012  # kg
    k_joint: float = 0.08  # N m/rad, passive return spring (both joints), preloaded at reset
    b_joint: float = 0.004  # N m s/rad
    q1_range: tuple[float, float] = (-0.3, 1.6)  # rad
    q2_range: tuple[float, float] = (0.0, 2.0)
    h: float = 0.008  # m, tendon site offset below the link axis (moment arm at q = 0)
    a_base: float = 0.02  # m, anchor site distance behind joint 1
    b_site: float = 0.008  # m, routing site distance past each joint
    # object (sprung pad)
    obj_x: float = 0.055  # m, pad centre, along the finger
    obj_z: float = -0.030  # m, pad top surface height at rest (negative = below the finger)
    obj_half: tuple[float, float, float] = (0.012, 0.012, 0.004)  # m, pad half sizes
    k_obj: float = 2000.0  # N/m, pad spring
    b_obj: float = 6.0  # N s/m (damping ratio ~0.5 with the 20 g pad)
    obj_travel: float = 0.02  # m, slide range below the rest height
    gravity: float = -9.81
    timestep: float = 5e-4  # s
    T_max: float = 300.0  # N, ctrl range for the tendon actuator

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def build_mjcf(p: FingerParams) -> str:
    """Return the MJCF XML for the finger, the object, the flexor tendon and its unit-gain actuator."""
    hx, hy, hz = p.obj_half
    return f"""
<mujoco model="til_finger">
  <option timestep="{p.timestep}" gravity="0 0 {p.gravity}" integrator="implicitfast"/>
  <compiler angle="radian" autolimits="true"/>
  <default>
    <joint type="hinge" axis="0 1 0" damping="{p.b_joint}" stiffness="{p.k_joint}" springref="0"/>
    <geom condim="3" friction="0.8 0.005 0.0001" solref="0.004 1" solimp="0.95 0.99 0.001"/>
    <site size="0.001" rgba="0.9 0.2 0.1 1"/>
  </default>
  <worldbody>
    <light pos="0 -1 1" dir="0 1 -1"/>
    <body name="base" pos="0 0 0">
      <geom name="base_geom" type="box" size="0.01 0.01 0.02" pos="-0.02 0 0" rgba="0.3 0.3 0.3 1" contype="0" conaffinity="0"/>
      <site name="s0" pos="-{p.a_base} 0 -{p.h}"/>
      <body name="link1" pos="0 0 0">
        <joint name="q1" range="{p.q1_range[0]} {p.q1_range[1]}"/>
        <geom name="link1_geom" type="capsule" fromto="0 0 0 {p.L1} 0 0" size="{p.r_link}" mass="{p.m1}" rgba="0.5 0.3 0.9 1"/>
        <site name="s1a" pos="{p.b_site} 0 -{p.h}"/>
        <site name="s1b" pos="{p.L1 - p.b_site} 0 -{p.h}"/>
        <body name="link2" pos="{p.L1} 0 0">
          <joint name="q2" range="{p.q2_range[0]} {p.q2_range[1]}"/>
          <geom name="link2_geom" type="capsule" fromto="0 0 0 {p.L2} 0 0" size="{p.r_link}" mass="{p.m2}" rgba="0.5 0.3 0.9 1"/>
          <site name="s2a" pos="{p.b_site} 0 -{p.h}"/>
          <site name="s2b" pos="{p.b_site + 0.012} 0 -{p.h}"/>
          <site name="tip" pos="{p.L2} 0 0"/>
        </body>
      </body>
    </body>
    <body name="object" pos="{p.obj_x} 0 {p.obj_z - hz}">
      <joint name="obj_z" type="slide" axis="0 0 1" range="-{p.obj_travel} 0.0005" stiffness="{p.k_obj}" damping="{p.b_obj}" springref="0"/>
      <geom name="object_geom" type="box" size="{hx} {hy} {hz}" mass="0.02" rgba="0.1 0.5 0.2 0.8"/>
    </body>
  </worldbody>
  <tendon>
    <spatial name="flexor" width="0.0008" rgba="0.8 0.2 0.1 1" stiffness="0" damping="0" frictionloss="0">
      <site site="s0"/>
      <site site="s1a"/>
      <site site="s1b"/>
      <site site="s2a"/>
      <site site="s2b"/>
    </spatial>
  </tendon>
  <actuator>
    <general name="flexor_force" tendon="flexor" gainprm="1 0 0" biasprm="0 0 0" ctrlrange="-{p.T_max} 0"/>
  </actuator>
  <sensor>
    <tendonpos name="flexor_len" tendon="flexor"/>
  </sensor>
</mujoco>
"""


class Finger:
    """Wrapper around the MuJoCo model: tendon geometry, tension input, contact readout."""

    def __init__(self, params: FingerParams | None = None):
        self.p = params or FingerParams()
        self.model = mujoco.MjModel.from_xml_string(build_mjcf(self.p))
        self.data = mujoco.MjData(self.model)
        self.tid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_TENDON, "flexor")
        self.aid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_ACTUATOR, "flexor_force")
        self.jq = [mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, n) for n in ("q1", "q2")]
        self.dof = [self.model.jnt_dofadr[j] for j in self.jq]
        self.qadr = [self.model.jnt_qposadr[j] for j in self.jq]
        self.obj_j = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, "obj_z")
        self.obj_qadr = self.model.jnt_qposadr[self.obj_j]
        self.obj_dof = self.model.jnt_dofadr[self.obj_j]
        self.obj_geom = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, "object_geom")
        self.finger_geoms = {mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, n) for n in ("link1_geom", "link2_geom")}
        self.tip_site = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_SITE, "tip")
        self._force6 = np.zeros(6)
        self.reset()

    # ----------------------------------------------------------------------------------------------
    def reset(self, q0: tuple[float, float] = (0.0, 0.0), pretension: float = 0.0) -> None:
        """Put the finger at ``q0`` and preload the passive joint springs so that ``q0`` is an equilibrium
        under gravity and the tendon pretension (a tendon finger's return springs are preloaded against the
        pretension; without this the pretension alone would flex the finger)."""
        mujoco.mj_resetData(self.model, self.data)
        self.data.qpos[self.qadr[0]] = q0[0]
        self.data.qpos[self.qadr[1]] = q0[1]
        self.data.ctrl[:] = 0.0
        mujoco.mj_forward(self.model, self.data)
        # equilibrium: qfrc_passive + qfrc_actuator = qfrc_bias  ->  -k (q0 - ref) = bias - (-J^T T0)
        J = self.tendon_jacobian()
        tau_t = -J * pretension
        for i, (jq, dof) in enumerate(zip(self.jq, self.dof)):
            k = self.model.jnt_stiffness[jq]
            bias = self.data.qfrc_bias[dof]
            self.model.qpos_spring[self.qadr[i]] = q0[i] + (bias - tau_t[i]) / k
        self.spring_ref = np.array([self.model.qpos_spring[a] for a in self.qadr])
        mujoco.mj_forward(self.model, self.data)
        self.l0 = self.tendon_length()

    @property
    def dt(self) -> float:
        return float(self.model.opt.timestep)

    @property
    def q(self) -> np.ndarray:
        return np.array([self.data.qpos[a] for a in self.qadr])

    @property
    def qd(self) -> np.ndarray:
        return np.array([self.data.qvel[a] for a in self.dof])

    def tendon_length(self) -> float:
        return float(self.data.ten_length[self.tid])

    def tendon_jacobian(self) -> np.ndarray:
        """``dl/dq`` for the two finger joints (negative: flexion shortens the tendon).

        MuJoCo 4 stores actuator moments sparsely; the unit-gain tendon actuator's moment row is exactly the
        tendon length Jacobian, so it is rebuilt densely from ``moment_rownnz/rowadr/colind``.
        """
        d = self.data
        J = np.zeros(self.model.nv)
        adr = d.moment_rowadr[self.aid]
        for k in range(d.moment_rownnz[self.aid]):
            J[d.moment_colind[adr + k]] = d.actuator_moment[adr + k]
        return np.array([J[self.dof[0]], J[self.dof[1]]])

    def tendon_displacement(self) -> float:
        """Emulation motor command ``x_out = l(q) - l(q0)`` (positive when the finger extends)."""
        return self.tendon_length() - self.l0

    def apply_tension(self, T_out: float) -> None:
        """Apply the distal cable tension as a pulling force on the tendon."""
        self.data.ctrl[self.aid] = -max(0.0, float(T_out))

    def step(self) -> None:
        mujoco.mj_step(self.model, self.data)

    def tendon_joint_torque(self) -> np.ndarray:
        """Generalised force the tendon actuator applies to the joints (``-J^T T``)."""
        return np.array([self.data.qfrc_actuator[d] for d in self.dof])

    # ----------------------------------------------------------------------------------------------
    def contact(self) -> dict:
        """Actual MuJoCo contact between the finger links and the object (summed normal force, mean location)."""
        total = 0.0
        pos = np.zeros(3)
        n = 0
        for i in range(self.data.ncon):
            c = self.data.contact[i]
            pair = {c.geom1, c.geom2}
            if self.obj_geom in pair and (pair & self.finger_geoms):
                mujoco.mj_contactForce(self.model, self.data, i, self._force6)
                total += abs(float(self._force6[0]))  # normal component in the contact frame
                pos += c.pos
                n += 1
        return {
            "contact_state": float(n > 0),
            "contact_force": total,
            "contact_location": (pos / n) if n else np.full(3, np.nan),
            "n_contacts": n,
        }

    def object_state(self) -> tuple[float, float]:
        return float(self.data.qpos[self.obj_qadr]), float(self.data.qvel[self.obj_dof])

    def tip_position(self) -> np.ndarray:
        return np.array(self.data.site_xpos[self.tip_site])

    def link_points(self) -> np.ndarray:
        """Base, joint 2 and tip positions in the x–z plane, for plotting."""
        q1, q2 = self.q
        k = np.array([self.p.L1 * np.cos(q1), -self.p.L1 * np.sin(q1)])
        t = k + np.array([self.p.L2 * np.cos(q1 + q2), -self.p.L2 * np.sin(q1 + q2)])
        return np.array([[0.0, 0.0], k, t])
