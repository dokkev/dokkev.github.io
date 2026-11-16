import copy
import json
import numpy as np
import pytest
torch=pytest.importorskip("torch")
from til.phase2_data import make_episodes,design
from til.phase2_observer import score,rigid_prediction
from til.observer import Observer


def test_joint_head_preserves_strict_four_inputs_and_causality():
    model=Observer(outputs=3).eval();x=torch.randn(1,15,4);other=x.clone();other[:,8:]=99
    with torch.no_grad():a,_=model(x);b,_=model(other)
    assert a.shape==(1,15,3)
    torch.testing.assert_close(a[:,:8],b[:,:8])


def test_specimen_and_fixture_holdouts_and_persistent_properties():
    cfg=design();train=make_episodes("train","full",cfg)
    hold=make_episodes("test_specimen","full",cfg)
    assert {r.metadata["specimen_family"] for r in train}.isdisjoint({r.metadata["specimen_family"] for r in hold})
    routing=make_episodes("test_routing","full",cfg)
    assert {r.metadata["fixture_id"] for r in train}.isdisjoint({r.metadata["fixture_id"] for r in routing})
    first=train[0];again=next(r for r in train[1:] if r.cable_specimen_id==first.cable_specimen_id)
    assert first.transmission["specimen"]==again.transmission["specimen"]


def test_sensitivity_sweep_is_controlled_not_randomized_all_at_once():
    rows=make_episodes("test_sensitivity","full")
    for r in rows[1:]:
        assert r.transmission==rows[0].transmission
        assert r.q0==rows[0].q0
        assert r.profile==rows[0].profile


def test_joint_errors_are_degrees_and_labels_not_rigid_baseline_inputs():
    truth=np.zeros((3,3));estimate=np.tile([1.,np.pi/180,2*np.pi/180],(3,1))
    result=score(truth,estimate)
    assert result["q1_mae_deg"]==pytest.approx(1.)
    assert result["q2_mae_deg"]==pytest.approx(2.)
    r=dict(x=np.zeros((3,4)),time=np.arange(3)*.005,config={"q0":[1.,1.]},y=np.zeros((3,3)))
    a=rigid_prediction(r);r["y"][:]=999;r["config"]["q0"]=[2.,2.]
    np.testing.assert_array_equal(a,rigid_prediction(r))


def test_phase2_loader_never_uses_privileged_labels_or_metadata_as_features(tmp_path):
    import h5py
    from til.recorder import DatasetFile
    from til.runner import run_episode
    from til.scenarios import MotorProfile
    from til.phase2_data import diagnose
    from til.phase2_observer import load_runs
    ep=make_episodes("train","pilot")[0]
    ep.profile=MotorProfile(period=.1,n_cycles=1,settle_time=.01,amplitude=.001)
    path=str(tmp_path/"run.h5");ds=DatasetFile(path);writer=ds.episode(ep.episode_id,ep.to_dict())
    run_episode(ep,writer);writer.g.attrs["quality"]=json.dumps(diagnose(writer.g));ds.close()
    before=load_runs(path)[0]
    with h5py.File(path,"a") as f:
        g=f["episodes"][ep.episode_id];g["simulation/joint_positions"][:]=1.
        assert g["ground_truth/friction_state"].attrs["units"].startswith("rad")
        assert g["ground_truth/effective_friction"].attrs["units"].startswith("1 ")
        cfg=json.loads(g.attrs["config"]);cfg["metadata"]["fixture_id"]="hidden_shortcut"
        g.attrs["config"]=json.dumps(cfg)
    after=load_runs(path)[0]
    np.testing.assert_array_equal(before["x"],after["x"])
    assert before["x"].shape[1]==4 and after["y"].shape[1]==3
    assert not np.array_equal(before["y"],after["y"])
