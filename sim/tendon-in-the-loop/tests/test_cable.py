"""Mechanical-consistency tests of the synthetic cable plant (no MuJoCo needed)."""

import numpy as np
import pytest

from til.cable import CablePlant, CableParams, PRESETS

DT = 1e-4


def settle(plant: CablePlant, x_in: float, x_out: float, t: float = 0.2):
    for _ in range(int(t / DT)):
        plant.step(DT, x_in, 0.0, x_out, 0.0)
    return plant.s.T1, plant.s.T2


def test_pretension_equilibrium():
    p = CablePlant(CableParams(pretension=12.0))
    T1, T2 = settle(p, 0.0, 0.0)
    assert T1 == pytest.approx(12.0, abs=1e-6)
    assert T2 == pytest.approx(12.0, abs=1e-6)
    assert abs(p.s.phi) < 1e-9


def test_slack_gives_zero_force():
    p = CablePlant(CableParams(pretension=10.0, k0=10_000.0))
    # move both ends toward the pulley by more than the pretension stretch (1 mm each)
    T1, T2 = settle(p, -0.003, -0.003)
    assert T1 == 0.0 and T2 == 0.0
    assert p.stored_energy() == pytest.approx(0.0, abs=1e-12)


def test_small_elastic_displacement_splits_between_segments():
    """Reeling in x with the output held: a friction-free pulley equalises the tensions, so each segment
    stretches x/2 and T = T0 + k x / 2. The pulley turns by x / (2 R_p)."""
    prm = CableParams(pretension=10.0, k0=10_000.0, friction_model="viscous", b_p=1e-6)
    p = CablePlant(prm)
    x = 0.002
    T1, T2 = settle(p, x, 0.0, t=0.5)
    assert T1 == pytest.approx(T2, rel=1e-4)
    assert T1 == pytest.approx(10.0 + prm.k0 * x / 2, rel=1e-3)
    assert prm.R_p * p.s.phi == pytest.approx(x / 2, rel=1e-3)


def test_pulley_torque_balance_while_sliding_with_coulomb_friction():
    """Steady cable flow over the pulley (reel in at v, feed from the output at v): the tension drop across
    the pulley is tau_c / R_p plus the viscous bearing term."""
    prm = CableParams(pretension=20.0, friction_model="coulomb", tau_c=0.01, b_p=1e-5, c=0.0)
    p = CablePlant(prm)
    v = 0.01  # m/s
    t = 0.0
    for _ in range(int(0.5 / DT)):
        t += DT
        p.step(DT, v * t, v, -v * t, -v)
    phi_d = v / prm.R_p
    assert p.s.phi_d == pytest.approx(phi_d, rel=1e-3)
    assert (p.s.T1 - p.s.T2) == pytest.approx((prm.tau_c + prm.b_p * phi_d) / prm.R_p, rel=0.02)


def test_dahl_friction_holds_a_static_tension_difference():
    """Presliding (Dahl) friction sticks: a tension difference below tau_c / R_p is held without creep."""
    prm = CableParams(pretension=10.0, friction_model="dahl", tau_c=0.01, b_p=0.0, dahl_sigma=200.0)
    p = CablePlant(prm)
    # slow ramp to 0.6 mm reel-in (quasi-static, no pulley overshoot); a frictionless pulley would split it 0.3/0.3
    x, v = 0.0006, 0.0006 / 0.5
    t = 0.0
    for _ in range(int(0.5 / DT)):
        t += DT
        p.step(DT, v * t, v, 0.0, 0.0)
    T1, T2 = settle(p, x, 0.0, t=0.5)
    assert T1 - T2 > 0.3  # the pulley held most of the sliding-friction difference after stopping
    assert (T1 - T2) <= prm.tau_c / prm.R_p + 1e-6
    phi_after = p.s.phi
    settle(p, x, 0.0, t=1.0)
    assert p.s.phi == pytest.approx(phi_after, abs=1e-6)  # no further creep of the pulley


def test_sign_conventions():
    """Reeling in raises both tensions; extending the output (x_out > 0) raises them too; paying out lowers."""
    p = CablePlant()
    T1a, T2a = settle(p, 0.001, 0.0)
    assert T1a > 10.0 and T2a > 10.0
    p.reset()
    T1b, T2b = settle(p, 0.0, 0.001)
    assert T1b > 10.0 and T2b > 10.0
    p.reset()
    T1c, T2c = settle(p, -0.0005, 0.0)
    assert T1c < 10.0 and T2c < 10.0


def test_energy_balance_viscous():
    """W_in + W_out = ΔE_stored + E_diss for a sinusoidal input with viscous losses (taut throughout)."""
    prm = CableParams(pretension=15.0, k0=10_000.0, c=1.0, friction_model="viscous", b_p=2e-5)
    p = CablePlant(prm)
    E0 = p.stored_energy()
    A, w = 0.001, 2 * np.pi * 3.0
    t = 0.0
    for _ in range(int(2.0 / DT)):
        t += DT
        p.step(DT, A * np.sin(w * t), A * w * np.cos(w * t), 0.0, 0.0)
    lhs = p.s.W_in + p.s.W_out
    rhs = (p.stored_energy() - E0) + p.s.E_diss
    assert lhs == pytest.approx(rhs, abs=2e-5 + 0.01 * abs(lhs))


def test_dahl_friction_dissipates_and_makes_a_loop():
    prm = PRESETS["nonlinear"]
    p = CablePlant(prm)
    A, w = 0.002, 2 * np.pi * 1.0
    t = 0.0
    loop_up, loop_down = [], []
    for _ in range(int(3.0 / DT)):
        t += DT
        x = A * (1 - np.cos(w * t)) / 2
        xd = A * w * np.sin(w * t) / 2
        p.step(DT, x, xd, 0.0, 0.0)
        if t > 2.0:
            (loop_up if xd > 0 else loop_down).append((x, p.s.T2))
    assert p.s.E_diss > 0.0
    # at the same elongation the output tension is lower while loading than while unloading? No: with
    # friction at the pulley, T_out lags T_in; on loading T_out is lower, on unloading higher.
    up = np.array(loop_up)
    dn = np.array(loop_down)
    xm = A / 2
    Tu = up[np.argmin(np.abs(up[:, 0] - xm)), 1]
    Td = dn[np.argmin(np.abs(dn[:, 0] - xm)), 1]
    assert Td > Tu


def test_all_states_finite_under_presets():
    for name, prm in PRESETS.items():
        p = CablePlant(prm)
        t = 0.0
        for _ in range(int(1.0 / DT)):
            t += DT
            p.step(DT, 0.003 * np.sin(2 * np.pi * 2 * t), 0.003 * 2 * np.pi * 2 * np.cos(2 * np.pi * 2 * t), 0.0, 0.0)
        gt = p.ground_truth()
        assert np.isfinite(p.s.T1) and np.isfinite(p.s.T2), name
        assert all(np.all(np.isfinite(v)) for v in gt.values()), name


def test_degradation_lowers_stiffness_and_raises_friction():
    prm = PRESETS["drift"]
    p = CablePlant(prm)
    p.s.d = 0.5
    assert p.k_eff == pytest.approx(prm.k0 * (1 - 0.5 * prm.alpha_k))
    assert p.tau_c_eff == pytest.approx(prm.tau_c * (1 + 0.5 * prm.beta_f))
