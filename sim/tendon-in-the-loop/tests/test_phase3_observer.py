import copy,json
import numpy as np
import pytest
torch=pytest.importorskip("torch")
from til.phase3 import design,base_episode,run_episode,protocol
from til.phase3_observer import load_runs,PhysicsObserver,fit_physics,prediction,contact_phases
from til.observer import Observer,fit_scaler
from til.recorder import DatasetFile


def calibration():
    d=design()
    return dict(home=d["home_q_rad"],nominal_pretension_N=10.,mechanism=d["mechanism"],
        compliance_m_per_N=.0002,offset_m=0.,measurement_sigma_m=.0003,velocity_process_sigma_rad_per_s=.03)


def fixture(split="train",case="C_passive"):
    n=40;x=np.zeros((n,4),np.float32);x[:,2]=np.linspace(2,4,n);x[:,3]=x[:,2];x[:,0]=np.linspace(0,.3,n)
    return dict(id=split,split=split,quality=dict(eligible=True),time=np.arange(n)*.005,x=x,
        y=np.tile(design()["home_q_rad"],(n,1)).astype(np.float32),config=dict(metadata=dict(case=case)))


def test_physics_calibration_uses_training_labels_only():
    train,test=fixture(),fixture("test")
    first=fit_physics([train,test]);test["y"][:]=99.;test["x"][:]=99.
    assert fit_physics([train,test])==first
    assert first["calibration_runs"]==["train"]


def test_physics_filter_never_reads_reference_joints_or_true_setup():
    run=fixture();run["x"][:]=[0,0,2,2]
    a=PhysicsObserver(calibration()).predict(run)
    run["y"][:]=999.;run["config"]["true_joint_zero"]=[9.,9.]
    b=PhysicsObserver(calibration()).predict(run)
    np.testing.assert_array_equal(a,b)
    # Motor telemetry is float32; force conversion introduces sub-microradian roundoff.
    np.testing.assert_allclose(a,np.tile(design()["home_q_rad"],(len(a),1)),atol=1e-6,rtol=0)


def test_phase3_loader_features_ignore_privileged_reference_changes(tmp_path):
    ep=base_episode("C_passive",0,"train","pilot");path=str(tmp_path/"run.h5")
    ds=DatasetFile(path);w=ds.episode(ep.episode_id,ep.to_dict());run_episode(ep,w,duration=.1);ds.close()
    before=load_runs(path)[0]
    with __import__("h5py").File(path,"a") as f:
        g=f["episodes"][ep.episode_id];g["simulation/joint_positions"][:]=1.
        c=json.loads(g.attrs["config"]);c["metadata"]["phase3"]["actual_q0"]=[9.,9.];g.attrs["config"]=json.dumps(c)
    after=load_runs(path)[0]
    np.testing.assert_array_equal(before["x"],after["x"])
    assert before["x"].shape[1]==4 and after["y"].shape[1]==2
    assert not np.array_equal(before["y"],after["y"])
    assert load_runs(path,splits={"validation"})==[]


def test_phase3_prediction_is_causal_and_does_not_clip_negative_joint_angles():
    model=Observer(outputs=2).eval();run=fixture();scaler=dict(x_mean=np.zeros(4,np.float32),x_std=np.ones(4,np.float32),
        y_mean=np.array([-1.,-1.],np.float32),y_std=np.ones(2,np.float32)*.01)
    first=prediction(model,run,scaler);run["x"][20:]=99.
    second=prediction(model,run,scaler)
    np.testing.assert_array_equal(first[:20],second[:20]);assert first.max()<0


def test_paired_probe_and_passive_tasks_match_after_common_prefix():
    a,b=protocol(base_episode("C_passive",0,"test")),protocol(base_episode("C_probe",0,"test"))
    t=np.linspace(a.probe_duration,a.duration,100)
    np.testing.assert_array_equal([a.x_ref(x) for x in t],[b.x_ref(x) for x in t])
    assert any(a.x_ref(x)!=b.x_ref(x) for x in np.linspace(0,a.probe_duration,20))


def test_offline_contact_phases_reject_brief_solver_switches():
    force=np.r_[np.zeros(20),[.3,0,.3,0],np.zeros(20),np.ones(80),np.zeros(100)]
    phase=contact_phases(force)
    assert not phase[:44].any()
    assert phase[80:120].all()
    assert not phase[-20:].any()
