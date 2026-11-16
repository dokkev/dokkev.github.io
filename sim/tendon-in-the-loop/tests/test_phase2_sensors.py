from dataclasses import replace
import numpy as np
import pytest
from til.motors import QDDMotor,QDDMotorParams,EmulationMotor,EmulationMotorParams
from til.sensing import MotorSensor,MotorSensorParams


def test_true_motor_constant_is_not_controller_or_telemetry_calibration():
    m=QDDMotor(QDDMotorParams(K_t=.08,K_t_nominal=.1,current_noise=0,current_gain=1.1,current_bias=.02))
    m.reset(10.)
    assert m.s.i==2.
    m.step(.0001,m.command_from_reference(0),10.)
    assert m.s.omega<0
    obs=m.observation()
    assert obs["current"]==pytest.approx(2.22)
    assert obs["estimated_motor_torque"]==pytest.approx(.222)


def test_baseline_does_not_read_randomized_true_motor_parameters():
    pytest.importorskip("torch")
    from til.observer import motor_tension
    r=dict(x=np.array([[0.,0.,2.,2.],[0.,0.,2.,2.]]),time=np.array([.005,.01]),config={"sim_overrides":{"motor":{"K_t":.08}}})
    a=motor_tension(r)
    r["config"]["sim_overrides"]["motor"]["K_t"]=.12
    np.testing.assert_array_equal(a,motor_tension(r))


def test_thermal_proxy_changes_torque_constant_slowly():
    m=QDDMotor(QDDMotorParams(winding_resistance=.5,thermal_capacity=10.,K_t_temperature_coeff=-.001))
    m.reset(10.)
    for _ in range(10000):m.step(.0001,2.,10.)
    assert m.s.temperature>25.
    assert 0.099<m.effective_K_t<.1


def test_causal_filter_delay_and_lower_sensor_rate():
    s=MotorSensor(MotorSensorParams(sample_period=.002,filter_tau=.002,delay=.002))
    raw=dict(position=0.,velocity=0.,current=0.,applied_command=0.)
    assert s.sample(0.,raw)["current"]==0.
    changed={**raw,"current":1.,"applied_command":1.}
    assert s.sample(.001,changed)["current"]==0.
    assert s.sample(.002,changed)["current"]==0.
    assert s.sample(.003,changed)["applied_command"]==1.
    assert 0.<s.sample(.004,changed)["current"]<1.


def test_motor_sensor_bias_drift_is_seeded_and_bounded():
    p=MotorSensorParams(bias_drift_A_per_sqrt_s=.01,bias_bound_A=.02)
    a,b=MotorSensor(p,seed=3),MotorSensor(p,seed=3)
    raw=dict(position=0.,velocity=0.,current=1.,applied_command=1.)
    for n in range(1000):
        assert a.sample(n*.001,raw)==b.sample(n*.001,raw)
        assert abs(a.bias)<=.02


def test_finite_effort_emulator_load_causes_tracking_error():
    a=EmulationMotor(EmulationMotorParams(effective_mass=.5,force_max=15.))
    a.reset(T_hold=10.)
    for _ in range(1000):a.step(0.,30.)
    assert a.s.x<0
    assert abs(a.s.actuator_force)<=15.
    assert a.s.force_saturated


def test_optional_stiffness_perturbation_is_bounded_and_repeatable():
    from til.cable import CablePlant,CableParams
    p=CableParams(stiffness_noise_std=.03)
    a,b=CablePlant(p,seed=3),CablePlant(p,seed=3)
    for _ in range(3000):
        a.step(.0001,0,0,0,0);b.step(.0001,0,0,0,0)
        assert a.k_eff==b.k_eff
        assert p.k0*np.exp(-.09)<=a.k_eff<=p.k0*np.exp(.09)
    assert a.s.W_stiffness!=0
