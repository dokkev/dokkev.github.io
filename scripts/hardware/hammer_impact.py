"""1-DoF hammer impact vs gear ratio (MuJoCo), for the Robot Hardware 03 demo.

A hinge arm (0.3 m, 1 kg head -> link inertia ~0.09 kg m^2) coasts at the same head speed for
every gear ratio into a free 5 kg stone on a frictionless slide joint (the demo slides the
stone afterwards on ice with friction coefficient ICE_MU). MuJoCo's contact solref is normalized by the
effective mass of the contact, which would give every ratio the same contact time. To keep a
fixed physical contact stiffness CONTACT_K (N/m), the direct solref (-k, -b) is divided by the
contact's effective mass, the reduced mass m_eff m_s / (m_eff + m_s) with m_eff = I / ARM^2. The motor rotor is modeled as joint
armature N^2 J_m (J_m = 1e-5 kg m^2). The gearbox is rigid; compliance and backlash
are not modeled. Contacts are frictionless (condim=1): with the default friction pyramid,
mj_contactForce overstated the normal impulse by ~11% relative to the joint momentum change.

Writes src/lib/demos/data/hammer-impact.json with, per gear ratio:
  contact force F(t), reflected-inertia torque N^2 J_m qdd(t), joint angle q(t), stone travel x(t),
  and summary values (impulse, peak force, contact time, rebound speed).

Usage (needs mujoco, numpy):
  python scripts/hardware/hammer_impact.py
"""

import json
from pathlib import Path

import mujoco
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/lib/demos/data/hammer-impact.json"

J_M = 1e-5  # kg m^2, series example rotor inertia
RATIOS = [1, 10, 30, 60, 100, 160]
ARM = 0.3  # m
HEAD_MASS = 1.0  # kg
HEAD_R = 0.03  # m
TIP_SPEED = 1.8  # m/s at impact
DT = 1e-5
CONTACT_K = 1.0e6  # N/m, physical head-stone contact stiffness
CONTACT_ZETA = 0.1  # contact damping ratio
STONE_MASS = 5.0  # kg
STONE_R = 0.04  # m
ICE_MU = 0.05  # sliding friction used by the demo after the hit

STONE = (
    '<body name="stone" pos="{arm} {y} 0"><joint name="slide" type="slide" axis="0 1 0" damping="0"/>'
    '<geom type="sphere" size="{r}" mass="{m}" condim="1" solref="{sr}" solimp="0.99 0.99 0.001"/></body>'
)

GEAR_K = 1.0e4  # N m/rad, joint-side torsional stiffness of the compliant gearbox (series example)
GEAR_ZETA = 0.05  # damping ratio of the link-rotor mode

ROTOR = (
    '<body name="rotor"><joint name="rotor" type="hinge" axis="0 0 1" armature="{armature}" damping="0"/>'
    '<geom type="sphere" size="0.005" mass="1e-6" contype="0" conaffinity="0"/></body>'
)
SPRING = (
    '<tendon><fixed name="gear" stiffness="{k}" damping="{b}">'
    '<joint joint="hinge" coef="1"/><joint joint="rotor" coef="-1"/></fixed></tendon>'
)

MJCF = """
<mujoco>
  <option timestep="{dt}" gravity="0 0 0" integrator="implicitfast"/>
  <worldbody>
    <body name="arm">
      <joint name="hinge" type="hinge" axis="0 0 1" armature="{link_armature}" damping="0"/>
      <geom type="capsule" fromto="0 0 0 {arm_inner} 0 0" size="0.008" mass="0.0001" contype="0" conaffinity="0"/>
      <geom name="head" type="sphere" condim="1" pos="{arm} 0 0" size="{r}" mass="{m}" solref="{sr}" solimp="0.99 0.99 0.001"/>
    </body>
    {rotor}
    {target}
  </worldbody>
  {spring}
</mujoco>
"""


def simulate(N: int, compliant: bool = False):
    """Rigid gearbox: rotor inertia is armature on the link joint.
    Compliant gearbox: rotor is a second hinge (armature N^2 J_m, joint coordinates) tied to the
    link through a torsional spring GEAR_K, so a hit shorter than the link-rotor mode period sees
    mostly the link inertia."""
    armature = N * N * J_M
    link_I = HEAD_MASS * ARM**2
    # mass the contact sees at the instant of impact: link + rotor if rigid, link only if compliant
    m_inst = (link_I + (0 if compliant else armature)) / ARM**2
    m_c = m_inst * STONE_MASS / (m_inst + STONE_MASS)
    k_ref = CONTACT_K / m_c  # MuJoCo direct solref is per unit effective contact mass
    b_ref = 2 * CONTACT_ZETA * np.sqrt(k_ref)
    sr = f"{-k_ref:.6g} {-b_ref:.6g}"
    tgt = STONE.format(arm=ARM, y=-(HEAD_R + STONE_R), r=STONE_R, m=STONE_MASS, sr=sr)
    if compliant:
        j_red = link_I * armature / (link_I + armature)
        b_gear = 2 * GEAR_ZETA * np.sqrt(GEAR_K * j_red)
        rotor, spring, link_arm = ROTOR.format(armature=armature), SPRING.format(k=GEAR_K, b=f"{b_gear:.6g}"), 0
    else:
        rotor, spring, link_arm = "", "", armature
    xml = MJCF.format(
        dt=DT, link_armature=link_arm, arm=ARM, arm_inner=ARM - HEAD_R, r=HEAD_R, m=HEAD_MASS,
        sr=sr, target=tgt, rotor=rotor, spring=spring,
    )
    model = mujoco.MjModel.from_xml_string(xml)
    data = mujoco.MjData(model)
    hinge = data.joint("hinge")
    slide = data.joint("slide")
    rot = data.joint("rotor") if compliant else None
    w0 = -TIP_SPEED / ARM  # rad/s, swinging toward -y (the stone)
    gap = 0.15  # rad before contact
    hinge.qpos[0] = gap
    hinge.qvel[0] = w0
    if compliant:
        rot.qpos[0] = gap
        rot.qvel[0] = w0
    mujoco.mj_forward(model, data)

    link_inertia = float(model.body_inertia[1][2] + HEAD_MASS * ARM**2)  # about the hinge (approx.)
    t_hit = None
    rows = []
    f6 = np.zeros(6)
    prev_v = hinge.qvel[0]
    t_end = gap / abs(w0) + 0.1
    while data.time < t_end:
        mujoco.mj_step(model, data)
        qdd = (hinge.qvel[0] - prev_v) / DT
        prev_v = hinge.qvel[0]
        force = 0.0
        for i in range(data.ncon):
            mujoco.mj_contactForce(model, data, i, f6)
            force += abs(f6[0])
        if force > 1e-6 and t_hit is None:
            t_hit = data.time
        if compliant:  # torque through the gear teeth, joint side, positive when braking the rotor
            tau_g = -(GEAR_K * (rot.qpos[0] - hinge.qpos[0]) + b_gear * (rot.qvel[0] - hinge.qvel[0]))
        else:
            tau_g = armature * qdd
        rows.append((data.time, force, tau_g, float(hinge.qpos[0]), float(hinge.qvel[0]), float(-slide.qpos[0])))
        if t_hit is not None and data.time > t_hit + 0.08:
            break

    rows = np.array(rows)
    t = rows[:, 0] - t_hit
    F, tau_gear, q, qd, xs = rows[:, 1], rows[:, 2], rows[:, 3], rows[:, 4], rows[:, 5]
    impulse = float(np.trapezoid(F, rows[:, 0]))
    in_contact = F > 1e-3
    contact_time = float(in_contact.sum() * DT)
    rebound_tip = float(qd[-1] * ARM)
    stone_speed = float(-slide.qvel[0])
    n_hits = int(np.sum(np.diff(in_contact.astype(int)) == 1) + in_contact[0])

    # resample around the impact for the web demo (0.05 ms steps, -2 ms .. +12 ms)
    grid = np.arange(-0.002, 0.022 + 1e-9, 1e-4)
    series = {
        "t_ms": [round(x * 1e3, 3) for x in grid],
        "force": [round(float(v), 2) for v in np.interp(grid, t, F)],
        "gear_torque": [round(float(v), 3) for v in np.interp(grid, t, tau_gear)],
        "q": [round(float(v), 5) for v in np.interp(grid, t, q)],
        "x": [round(float(v), 5) for v in np.interp(grid, t, xs)],
    }
    return {
        "N": N,
        "armature": armature,
        "link_inertia": link_inertia,
        "apparent_inertia": link_inertia + armature,
        "impulse": round(impulse, 4),
        "peak_force": round(float(F.max()), 1),
        "contact_time_ms": round(contact_time * 1e3, 2),
        "rebound_tip_speed": round(rebound_tip, 3),
        "peak_gear_torque": round(float(np.abs(tau_gear).max()), 2),
        "stone_speed": round(stone_speed, 3),
        "hits": n_hits,
        "slide_m": round(stone_speed**2 / (2 * ICE_MU * 9.81), 3),
        "series": series,
    }


def main():
    results = [simulate(N) for N in RATIOS]
    meta = {
        "arm_m": ARM, "head_mass_kg": HEAD_MASS, "tip_speed_mps": TIP_SPEED, "rotor_inertia": J_M,
        "contact_stiffness_N_per_m": CONTACT_K, "contact_damping_ratio": CONTACT_ZETA, "timestep_s": DT,
        "stone_mass_kg": STONE_MASS, "ice_mu": ICE_MU,
        "gear_stiffness_Nm_per_rad": GEAR_K, "gear_damping_ratio": GEAR_ZETA,
        "mujoco": mujoco.__version__,
        "note": "Rigid gearbox; free stone; contact stiffness fixed in N/m by scaling solref with the effective contact mass.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"meta": meta, "results": results}, separators=(",", ":")))
    for r in results:
        print(f"hits={r['hits']} N={r['N']:4d}  I={r['apparent_inertia']:.4f}  impulse={r['impulse']:.3f} N s  "
              f"peak={r['peak_force']:.0f} N  contact={r['contact_time_ms']:.2f} ms  "
              f"rebound={r['rebound_tip_speed']:.2f} m/s  gearT={r['peak_gear_torque']:.1f} N m  "
              f"stone={r['stone_speed']:.2f} m/s slide={r['slide_m']:.2f} m")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
