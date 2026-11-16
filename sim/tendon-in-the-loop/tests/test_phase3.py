import copy,json
import numpy as np
import pytest
from til.phase3 import design,base_episode,CalibratedSimulator,geometry,probe,run_episode
from til.finger import Finger
import mujoco


def test_phase3_geometry_matches_existing_mujoco_sites():
    f=Finger()
    for q in ((0.,0.),(.1,.15),(.5,1.)):
        f.reset(q);length,jac=geometry(q)
        assert length==pytest.approx(f.tendon_length(),abs=1e-12)
        np.testing.assert_allclose(jac,f.tendon_jacobian(),atol=1e-10)


def test_phase3_home_repeatability_and_physical_boundary_consistency():
    ep=base_episode("C_passive",0,"train","pilot");a=CalibratedSimulator(ep.sim_config());a.initialize(ep)
    first=copy.deepcopy(a.initial_setup);a.initialize(ep)
    assert a.initial_setup==first
    qhome=np.array(design()["home_q_rad"])
    np.testing.assert_allclose(a.finger.q,qhome,atol=1e-12)
    assert a.emulator.s.x==pytest.approx(a.finger.tendon_displacement())
    assert a.motor.s.theta==0


def test_phase3_fixed_setup_perturbation_does_not_recalibrate_preload_or_zero():
    ep=base_episode("C_passive",0,"train","pilot")
    a,b=CalibratedSimulator(ep.sim_config()),CalibratedSimulator(ep.sim_config())
    a.initialize(ep);b.initialize(ep,initial_delta=(.01,-.01))
    assert a.initial_setup["spring_reference_rad"]==b.initial_setup["spring_reference_rad"]
    assert a.initial_setup["tendon_zero_m"]==b.initial_setup["tendon_zero_m"]
    assert b.emulator.s.x==pytest.approx(b.finger.tendon_displacement())
    assert not np.array_equal(a.finger.q,b.finger.q)


@pytest.mark.parametrize("kind",["hold","pulse","oscillation","chirp","multisine","reversal","low","flexion","extension"])
def test_phase3_probes_bounded_and_deterministic(kind):
    values=np.array([probe(t,kind) for t in np.linspace(0,1.2,300)])
    assert np.isfinite(values).all() and max(abs(values))<=.0005+1e-12
    assert probe(-.01,kind)==probe(1.21,kind)==0
    assert probe(.35,kind)==probe(.35,kind)


def test_homed_residuals_do_not_use_true_pretension_as_controller_feedforward():
    ep=base_episode("B",0,"train","pilot");sim=CalibratedSimulator(ep.sim_config());sim.initialize(ep)
    assert sim.motor.s.i_ff==pytest.approx(.02*10/.1)
    assert ep.pretension!=10.
    assert sim.finger.l0==sim.calibration["tendon_zero_m"]


def test_primary_calibration_comparisons_share_task_commands():
    for index in range(8):
        cases=[base_episode(case,index,"train") for case in ("A","B","C_passive","C_probe")]
        assert all(ep.profile==cases[0].profile for ep in cases)
    for condition in (0,1):
        assert {base_episode("A",i,"train").metadata["active"] for i in range(condition,8,2)}=={False,True}


def test_inertia_sweep_keeps_mass_and_gravity_parameters_fixed():
    from til.phase3 import mechanism
    a,b=Finger(),Finger();cfg=design()["mechanism"];changed=copy.deepcopy(cfg);changed["distal_inertia_ratio"]=2.
    mechanism(a,cfg);mechanism(b,changed)
    np.testing.assert_array_equal(a.model.body_mass,b.model.body_mass)
    body=mujoco.mj_name2id(a.model,mujoco.mjtObj.mjOBJ_BODY,"link2")
    np.testing.assert_allclose(b.model.body_inertia[body],2*a.model.body_inertia[body])


def test_drift_and_long_reference_have_identical_task_and_setup():
    import sys
    from pathlib import Path
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
    from phase3_dataset import episodes
    cfg=design();drift=episodes("drift","full",cfg);reference=episodes("long_reference","full",cfg)
    for a,b in zip(drift,reference):
        assert a.profile==b.profile
        assert a.metadata["phase3"]==b.metadata["phase3"]
        assert a.seed==b.seed
        assert a.transmission["routing"]==b.transmission["routing"]
