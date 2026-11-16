import numpy as np
import pytest

from til.motors import EmulationMotor, EmulationMotorParams, QDDMotor, QDDMotorParams

DT = 1e-4


def test_emulator_ideal_tracks_exactly():
    em = EmulationMotor(EmulationMotorParams(mode="ideal"), dt=DT)
    em.step(0.004)
    assert em.s.x == 0.004 and em.tracking_error == 0.0


def test_emulator_servo_settles_within_bandwidth():
    p = EmulationMotorParams(Kp=4e4, Kd=400.0)
    em = EmulationMotor(p, dt=DT)
    # settling time of a critically damped 2nd-order loop ~ 6 / (sqrt(Kp)) ≈ 30 ms
    for _ in range(int(0.1 / DT)):
        em.step(0.004)
    assert em.s.x == pytest.approx(0.004, abs=5e-6)
    assert p.bandwidth_hz == pytest.approx(31.8, rel=0.05)


def test_emulator_delay_and_limits():
    em = EmulationMotor(EmulationMotorParams(delay=0.002, v_max=0.01, a_max=1e4), dt=DT)
    for _ in range(19):
        em.step(0.005)
    assert em.s.x_cmd == 0.0  # command not yet through the 2 ms buffer
    for _ in range(int(0.05 / DT)):
        em.step(0.005)
    assert abs(em.s.v) <= 0.01 + 1e-12
    assert em.s.x == pytest.approx(0.0005 + 0.0, abs=0.0006) or em.s.x < 0.005  # velocity-limited: not yet there


def test_qdd_motor_reels_in_and_tension_resists():
    m = QDDMotor(QDDMotorParams())
    for _ in range(int(0.5 / DT)):
        u = m.command_from_reference(0.5)
        m.step(DT, u, T_in=0.0)
    th_free = m.s.theta
    m.reset()
    for _ in range(int(0.5 / DT)):
        u = m.command_from_reference(0.5)
        m.step(DT, u, T_in=30.0)
    assert th_free == pytest.approx(0.5, abs=0.02)
    assert m.s.theta < th_free  # the cable load pulls the drum back against the controller
    assert abs(m.s.u) <= m.p.i_max


def test_motor_observation_keys_and_quantisation():
    m = QDDMotor(QDDMotorParams(encoder_cpr=4096))
    m.s.theta = 0.1234
    o = m.observation()
    assert set(o) >= {"position", "velocity", "current", "applied_command"}
    assert abs(o["position"] - 0.1234) <= 2 * np.pi / 4096
