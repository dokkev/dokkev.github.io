import numpy as np
import mujoco
import pytest
from til.two_tendon import ARM,HOME,TwoTendonFinger,TwoTendonSimulator,channel_config


def test_two_tendon_jacobian_grid_and_torque_match():
    f=TwoTendonFinger()
    for q1 in np.linspace(-np.pi/6,np.pi/3,5):
        for q2 in np.linspace(0,5*np.pi/6,5):
            f.data.qpos[f.qadr]=[q1,q2];mujoco.mj_forward(f.model,f.data)
            np.testing.assert_allclose(f.tendon_jacobian(),-ARM,atol=1e-14)
            for j in range(2):
                q=f.q;eps=np.eye(2)[j]*1e-6;f.data.qpos[f.qadr]=q+eps;mujoco.mj_forward(f.model,f.data);a=f.tendon_length().copy()
                f.data.qpos[f.qadr]=q-eps;mujoco.mj_forward(f.model,f.data);b=f.tendon_length().copy()
                np.testing.assert_allclose((a-b)/2e-6,-ARM[:,j],atol=1e-10)
                f.data.qpos[f.qadr]=q;mujoco.mj_forward(f.model,f.data)
            for T in ([0,0],[10,10],[0,40],[40,0],[40,40],[-1,10]):
                f.apply_tension(T);mujoco.mj_forward(f.model,f.data)
                np.testing.assert_allclose(f.tendon_joint_torque(),ARM.T@np.clip(T,0,f.p.T_max),atol=1e-12)


def test_two_tendon_home_equilibrium_and_unilateral_feasibility():
    f=TwoTendonFinger();f.apply_tension([10,10]);mujoco.mj_forward(f.model,f.data)
    np.testing.assert_allclose(f.required_tension(HOME),[10,10],atol=1e-10)
    np.testing.assert_allclose(f.data.qacc[f.dof],0,atol=1e-8)
    assert np.linalg.det(ARM)>0
    assert np.linalg.solve(ARM.T,[-.1,0.])[0]<0  # full rank does not imply signed torque authority


def test_two_channels_are_independent_and_shared_finger_steps_once():
    configs=[channel_config(3,noise=False),channel_config(4,noise=False)]
    a=TwoTendonSimulator(configs);b=TwoTendonSimulator(configs)
    assert a.chains[0].plant.s is not a.chains[1].plant.s
    for _ in range(100):a.step([0,0]);b.step([0,0])
    np.testing.assert_array_equal(a.finger.q,b.finger.q)
    np.testing.assert_allclose(a.finger.q,HOME,atol=1e-10)
    assert a.finger.data.time==pytest.approx(a.t)
    a.chains[0].plant.s.creep=.001
    assert a.chains[1].plant.s.creep==0.
    assert a.chains[0].motor is not a.chains[1].motor


def test_two_channel_force_limits_and_no_negative_tension():
    sim=TwoTendonSimulator([channel_config(5,noise=False),channel_config(6,noise=False)])
    for _ in range(100):sim.step([.0002,-.0002])
    for chain in sim.chains:
        assert 0<=chain.plant.s.T1 and 0<=chain.plant.s.T2
        assert abs(chain.motor.s.i)<=chain.motor.p.i_max+1e-10
        assert abs(chain.emulator.s.actuator_force)<=chain.emulator.p.force_max
    assert np.isfinite(sim.finger.q).all()


def test_input_stroke_and_emulator_force_limits_are_active():
    sim=TwoTendonSimulator([channel_config(7,noise=False),channel_config(8,noise=False)])
    c=sim.chains[0];c.motor.s.theta=c.motor.stroke/c.motor.p.r_drum-.00001;c.motor.s.omega=100.
    c.motor.step(.0001,8.,0.)
    assert c.motor.limit_hit and c.motor.x_in<=c.motor.stroke and c.motor.s.omega==0.
    c.emulator.step(.1,0.)
    assert c.emulator.s.force_saturated and abs(c.emulator.s.actuator_force)<=c.emulator.p.force_max


def test_each_two_port_is_unilateral_and_accounts_boundary_work():
    from til.transmission import TransmissionPlant,TransmissionParams
    plants=[TransmissionPlant(TransmissionParams()),TransmissionPlant(TransmissionParams())]
    for plant in plants:
        for i in range(1000):
            t=(i+1)*.0001;w=2*np.pi
            plant.step(.0001,.0002*np.sin(w*t),.0002*w*np.cos(w*t),0.,0.)
        assert abs(plant.ground_truth()["energy_residual"])<1e-5
        plant.step(.0001,-.02,0.,-.02,0.)
        assert plant.s.T1==plant.s.T2==0.
