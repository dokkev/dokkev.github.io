import math
from dataclasses import replace

import numpy as np
import pytest

from til.transmission import Routing, FIXTURES, Specimen, TransmissionParams, TransmissionPlant


def plant(**spec):
    return TransmissionPlant(TransmissionParams(specimen=Specimen(**spec), routing=FIXTURES["straight"],
        bearing_coulomb=0., bearing_viscous=0.))


@pytest.mark.parametrize("fixture", FIXTURES)
def test_phase2_initial_pretension_and_dimensions(fixture):
    p=TransmissionPlant(TransmissionParams(routing=FIXTURES[fixture]))
    for _ in range(50): p.step(1e-4,0,0,0,0)
    assert p.s.T1==pytest.approx(10.,abs=1e-8)
    assert p.s.T2==pytest.approx(10.,abs=1e-8)
    EA=p.p.specimen.modulus_pa*math.pi*p.p.specimen.diameter_m**2/4
    assert p.k[0]==pytest.approx(EA/p.lengths[0])
    larger=plant(diameter_m=.001)
    base=plant()
    assert larger.k[0]==pytest.approx(4*base.k[0])


def test_phase2_slack_relaxation_and_recovery():
    p=plant(nonlinear_strain_coefficient=0.,damping_Ns_per_m=0.,maxwell_ratio=.5)
    p.step(1e-4,.001,0,.001,0)
    initial=p.s.T1
    for _ in range(30000): p.step(1e-4,.001,0,.001,0)
    equilibrium=10+p.k[0]*.001
    assert initial>equilibrium+4
    assert p.s.T1==pytest.approx(equilibrium,rel=.002)
    for _ in range(10000): p.step(1e-4,-.01,0,-.01,0)
    assert p.s.T1==p.s.T2==0
    assert p.s.v1<p.e0[0]
    assert p.stored_energy()>=0


def test_recoverable_creep_under_constant_force():
    p=plant(nonlinear_strain_coefficient=0.,damping_Ns_per_m=0.,maxwell_ratio=.5)
    dt=1e-3; target=20.; values=[]
    for _ in range(3000):
        k=p.k[0]; km=.5*k; a=dt/p.p.specimen.relaxation_time_s
        e=(target+km*p.s.v1/(1+a))/(k+km/(1+a))
        x=e-p.e0[0]
        p.step(dt,x,0,x,0)
        values.append(x)
    assert values[-1]>values[0]*1.3
    assert p.s.T1==pytest.approx(target,abs=1e-6)


def test_wrap_limit_separates_radius_and_bending():
    m=Specimen(friction_mu=.1,bending_loss_Nm=0.)
    vals=[]
    for radius,wrap in ((.01,1.),(.03,1.),(.03,2.)):
        p=TransmissionPlant(TransmissionParams(specimen=m,routing=Routing(guide_radii_m=(radius,),wrap_angles_rad=(wrap,)),bearing_coulomb=0.))
        torque,_,_,diss=p._friction(1.,40.,1.)
        assert torque==pytest.approx(.02*40*math.tanh(.1*wrap/2))
        assert diss>=0
        vals.append(torque)
    assert vals[0]==vals[1]
    assert vals[2]>vals[1]


def energy_trial(dt):
    p=plant(nonlinear_strain_coefficient=100.,maxwell_ratio=.3,damping_Ns_per_m=1.)
    for n in range(int(.37/dt)):
        t=(n+1)*dt; w=2*math.pi
        p.step(dt,.0004*math.sin(w*t),.0004*w*math.cos(w*t),0,0)
    return abs(p.ground_truth()["energy_residual"]),p


def test_phase2_energy_converges_and_losses_nonnegative():
    coarse,_=energy_trial(.001)
    fine,p=energy_trial(.0001)
    assert fine<coarse
    assert fine<2e-5
    assert p.s.E_diss>=0
    assert p.stored_energy()>=0


def test_forward_reverse_hold_and_history_dependent_creep():
    p=TransmissionPlant(TransmissionParams(specimen=Specimen(creep_rate_m_per_s=2e-6),routing=FIXTURES["small_guide"]))
    for direction in (1.,-1.):
        for n in range(2000):
            t=n*1e-4
            p.step(1e-4,.002+direction*.005*t,direction*.005,.002-direction*.005*t,-direction*.005)
            assert min(p.s.T1,p.s.T2)>=0
        assert p.s.E_diss>=0
    assert p.s.creep>0
    prior=p.s.creep
    for _ in range(1000): p.step(1e-4,-.02,0,-.02,0)
    assert p.s.creep==pytest.approx(prior,abs=1e-8)


def test_intervention_is_explicit_energy_exchange():
    p=TransmissionPlant(TransmissionParams(intervention_time_s=.01,intervention_stiffness_factor=.8))
    for _ in range(200):p.step(.0001,0,0,0,0)
    assert p.s.intervention_done
    assert p.s.W_parameter<0


def test_presliding_storage_and_plastic_loss_close_port_energy_balance():
    p=TransmissionPlant()
    dt=.0001
    for n in range(10000):
        t=(n+1)*dt;x=.002*(1-math.cos(2*math.pi*t));v=.002*2*math.pi*math.sin(2*math.pi*t)
        p.step(dt,x,v,-x,-v)
    assert p.s.E_diss>0
    assert abs(p.ground_truth()["energy_residual"])<1e-5
    assert abs(p.s.z)>0


def test_forward_and_reverse_friction_sign_with_zero_velocity_hold():
    # Isolate friction: a viscoelastic branch can legitimately relax and move the pulley at hold.
    p=TransmissionPlant(TransmissionParams(specimen=Specimen(maxwell_ratio=0.)));x=0.;dt=.0001
    for direction in (1.,-1.):
        for _ in range(3000):
            v=.01*direction;x+=v*dt;p.step(dt,x,v,-x,-v)
        assert (p.s.T1-p.s.T2)*direction>0
    for _ in range(2000):p.step(dt,x,0,-x,0)
    phi=p.s.phi
    for _ in range(1000):p.step(dt,x,0,-x,0)
    assert abs(p.s.phi-phi)<1e-5


def test_regularized_dashpot_engagement_has_no_force_jump_at_zero_extension():
    p=TransmissionPlant(TransmissionParams(pretension=0.,taut_transition_m=1e-5))
    p.step(1e-6,-1e-10,.1,-1e-10,.1)
    assert p.s.T1==p.s.T2==0
    p.step(1e-6,1e-10,.1,1e-10,.1)
    assert 0<=p.s.T1<1e-4
    assert 0<=p.s.T2<1e-4
