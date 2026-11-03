"""1-DoF hammer impact vs gear ratio (MuJoCo), for the Robot Hardware 03 demo.

A hinge arm (0.3 m, 1 kg head -> link inertia ~0.09 kg m^2) coasts into a wall plate
at the same head speed for every gear ratio. The plate sits on a slide joint with a
physical spring (WALL_K, WALL_C), and the head-plate contact is made very stiff, so the
impact stiffness is set by the plate spring rather than by MuJoCo's mass-scaled solref. The motor rotor is modeled as joint
armature N^2 J_m (J_m = 1e-5 kg m^2). The gearbox is rigid; compliance and backlash
are not modeled.

Writes src/lib/demos/data/hammer-impact.json with, per gear ratio:
  contact force F(t), reflected-inertia torque N^2 J_m qdd(t), joint angle q(t),
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
WALL_ANGLE = 0.0  # rad, head touches the wall when q ~ 0
DT = 1e-5
CONTACT_TC = 0.0002  # s, very stiff head-plate contact
WALL_K = 2.0e5  # N/m, wall plate spring
WALL_C = 50.0  # N s/m, wall plate damping
PLATE_MASS = 0.02  # kg

MJCF = """
<mujoco>
  <option timestep="{dt}" gravity="0 0 0" integrator="implicitfast"/>
  <worldbody>
    <body name="arm">
      <joint name="hinge" type="hinge" axis="0 0 1" armature="{armature}" damping="0"/>
      <geom type="capsule" fromto="0 0 0 {arm_inner} 0 0" size="0.008" mass="0.0001" contype="0" conaffinity="0"/>
      <geom name="head" type="sphere" pos="{arm} 0 0" size="{r}" mass="{m}" solref="{tc} 1" solimp="0.95 0.99 0.001"/>
    </body>
    <body name="plate" pos="{arm} {wall_y} 0">
      <joint name="plate_slide" type="slide" axis="0 1 0" stiffness="{k}" damping="{c}"/>
      <geom name="wall" type="box" size="0.05 0.01 0.05" mass="{pm}" solref="{tc} 1" solimp="0.95 0.99 0.001"/>
    </body>
  </worldbody>
</mujoco>
"""


def simulate(N: int):
    armature = N * N * J_M
    xml = MJCF.format(
        dt=DT, armature=armature, arm=ARM, arm_inner=ARM - HEAD_R, r=HEAD_R, m=HEAD_MASS,
        tc=CONTACT_TC, wall_y=-(HEAD_R + 0.01), k=WALL_K, c=WALL_C, pm=PLATE_MASS,
    )
    model = mujoco.MjModel.from_xml_string(xml)
    data = mujoco.MjData(model)
    w0 = -TIP_SPEED / ARM  # rad/s, swinging toward -y (the wall)
    gap = 0.15  # rad before contact
    data.qpos[0] = gap
    data.qvel[0] = w0
    mujoco.mj_forward(model, data)

    link_inertia = float(model.body_inertia[1][2] + HEAD_MASS * ARM**2)  # about the hinge (approx.)
    t_hit = None
    rows = []
    f6 = np.zeros(6)
    prev_v = data.qvel[0]
    t_end = gap / abs(w0) + 0.06
    while data.time < t_end:
        mujoco.mj_step(model, data)
        qdd = (data.qvel[0] - prev_v) / DT
        prev_v = data.qvel[0]
        force = 0.0
        for i in range(data.ncon):
            mujoco.mj_contactForce(model, data, i, f6)
            force += abs(f6[0])
        if force > 1e-6 and t_hit is None:
            t_hit = data.time
        rows.append((data.time, force, armature * qdd, float(data.qpos[0]), float(data.qvel[0])))
        if t_hit is not None and data.time > t_hit + 0.03:
            break

    rows = np.array(rows)
    t = rows[:, 0] - t_hit
    F, tau_gear, q, qd = rows[:, 1], rows[:, 2], rows[:, 3], rows[:, 4]
    impulse = float(np.trapezoid(F, rows[:, 0]))
    in_contact = F > 1e-3
    contact_time = float(in_contact.sum() * DT)
    rebound_tip = float(qd[-1] * ARM)

    # resample around the impact for the web demo (0.05 ms steps, -2 ms .. +12 ms)
    grid = np.arange(-0.002, 0.022 + 1e-9, 1e-4)
    series = {
        "t_ms": [round(x * 1e3, 3) for x in grid],
        "force": [round(float(v), 2) for v in np.interp(grid, t, F)],
        "gear_torque": [round(float(v), 3) for v in np.interp(grid, t, tau_gear)],
        "q": [round(float(v), 5) for v in np.interp(grid, t, q)],
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
        "series": series,
    }


def main():
    results = [simulate(N) for N in RATIOS]
    meta = {
        "arm_m": ARM, "head_mass_kg": HEAD_MASS, "tip_speed_mps": TIP_SPEED, "rotor_inertia": J_M,
        "wall_stiffness_N_per_m": WALL_K, "wall_damping_Ns_per_m": WALL_C, "timestep_s": DT,
        "mujoco": mujoco.__version__,
        "note": "Rigid gearbox; impact stiffness from a spring-mounted wall plate.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"meta": meta, "results": results}, separators=(",", ":")))
    for r in results:
        print(f"N={r['N']:4d}  I={r['apparent_inertia']:.4f}  impulse={r['impulse']:.3f} N s  "
              f"peak={r['peak_force']:.0f} N  contact={r['contact_time_ms']:.2f} ms  "
              f"rebound={r['rebound_tip_speed']:.2f} m/s  gearT={r['peak_gear_torque']:.1f} N m")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
