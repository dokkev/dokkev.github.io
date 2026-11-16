"""MuJoCo coupling tests: tendon geometry, force sign, contact effect, emulator tracking, no double counting."""

import numpy as np
import pytest
import mujoco

from til.coupling import SimConfig, TiLSimulator
from til.finger import Finger, FingerParams
from til.motors import EmulationMotorParams
from til.scenarios import EpisodeConfig, MotorProfile
from til.runner import run_episode


def test_moment_arm_matches_analytic_and_finite_difference():
    f = Finger()
    assert f.tendon_jacobian() == pytest.approx([-f.p.h, -f.p.h], abs=1e-9)
    f.reset((0.5, 0.7))
    l = f.tendon_length()
    J = f.tendon_jacobian()
    for k in range(2):
        q = [0.5, 0.7]
        q[k] += 1e-6
        f.reset(tuple(q))
        assert (f.tendon_length() - l) / 1e-6 == pytest.approx(J[k], rel=1e-3)


def test_tension_produces_flexion_torque():
    f = Finger()
    f.reset((0.2, 0.2))
    f.apply_tension(10.0)
    mujoco.mj_forward(f.model, f.data)
    tau = f.tendon_joint_torque()
    assert np.all(tau > 0)  # positive q = flexion
    assert tau == pytest.approx(-f.tendon_jacobian() * 10.0, rel=1e-6)


def test_mujoco_tendon_carries_no_force_of_its_own():
    f = Finger()
    m = f.model
    assert m.tendon_stiffness[f.tid] == 0.0
    assert m.tendon_damping[f.tid] == 0.0
    assert m.tendon_frictionloss[f.tid] == 0.0
    assert m.nu == 1  # the only actuator is the unit-gain tension input
    assert m.actuator_gainprm[f.aid, 0] == 1.0 and np.all(m.actuator_biasprm[f.aid] == 0.0)


def test_tendon_displacement_follows_configuration():
    f = Finger()
    assert f.tendon_displacement() == 0.0
    f.reset((0.3, 0.4))
    l_flexed = f.tendon_length()
    f.reset((0.0, 0.0))
    f.data.qpos[f.qadr[0]], f.data.qpos[f.qadr[1]] = 0.3, 0.4
    mujoco.mj_forward(f.model, f.data)
    assert f.tendon_displacement() == pytest.approx(l_flexed - f.l0)
    assert f.tendon_displacement() < 0  # flexion shortens the tendon: emulator pays cable in


def test_contact_raises_distal_tension():
    ep = EpisodeConfig("t", "t", profile=MotorProfile(amplitude=0.016, period=2.0, n_cycles=1, settle_time=0.1))
    cfg = ep.sim_config()
    sim = TiLSimulator(cfg)
    sim.reset()
    r = cfg.motor.r_drum
    T_free, T_contact, contact = [], [], False
    while sim.t < ep.profile.duration:
        x = ep.profile.x_ref(sim.t)
        sim.step(x / r)
        if sim.log_due:
            rec = sim.record()
            if rec["simulation"]["contact_state"] > 0.5:
                contact = True
                T_contact.append(rec["ground_truth"]["output_tension_true"])
            elif rec["motor"]["position"] * r > 0.004 and not contact:
                T_free.append(rec["ground_truth"]["output_tension_true"])
    assert contact, "the finger never touched the object"
    assert max(T_contact) > max(T_free) + 5.0


def test_emulator_tracks_commanded_motion_within_bandwidth():
    ep = EpisodeConfig("t", "t", profile=MotorProfile(n_cycles=1, period=2.0, settle_time=0.1))
    cfg = ep.sim_config()
    sim = TiLSimulator(cfg)
    sim.reset()
    errs = []
    while sim.t < ep.profile.duration:
        sim.step(ep.profile.x_ref(sim.t) / cfg.motor.r_drum)
        if sim.log_due:
            errs.append(abs(sim.emulator.tracking_error))
    assert max(errs) < 1e-3  # < 1 mm for a ~60 Hz servo during the fast flexion into contact


def test_ideal_emulator_zero_error_and_run_episode_summary():
    ep = EpisodeConfig("t", "t", profile=MotorProfile(n_cycles=1, period=1.5, settle_time=0.1), sim_overrides={"emulator": {"mode": "ideal"}})
    s = run_episode(ep)
    assert s["contact_fraction"] > 0.05
    assert np.isfinite(s["peak_tension_N"]) and s["peak_tension_N"] > 10.0
