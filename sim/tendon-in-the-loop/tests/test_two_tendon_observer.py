import copy,json
import numpy as np
import pytest
torch=pytest.importorskip("torch")
from til.two_tendon import ARM,HOME,MOTOR_CHANNELS
from til.two_tendon_observer import TwoMotorObserver,load_runs,predict,fit_compliance,corrected,rigid,PhysicsObserver
from til.two_tendon_experiment import specification,simulate,dataset_file,episode_writer


def run(split="train"):
    t=np.arange(100)*.005;x=np.zeros((100,8),np.float32)
    x[:,2]=x[:,3]=np.linspace(2,2.4,100);x[:,6]=x[:,7]=np.linspace(2,2.5,100)
    x[:,0]=np.linspace(0,.2,100);x[:,4]=np.linspace(0,.3,100)
    y=rigid(dict(x=x));y-=np.linspace(0,.02,100)[:,None]
    return dict(id=split,split=split,time=t,x=x,y=y,config={})


def test_two_motor_strict_whitelist_and_causality(tmp_path):
    spec=specification(0,"train");path=str(tmp_path/"two.h5");ds=dataset_file(path)
    simulate(spec,episode_writer(ds,spec),duration=.65);ds.close()
    a=load_runs(path)[0]
    with __import__("h5py").File(path,"a") as f:
        g=f["episodes"][spec["id"]];g["simulation/joint_positions"][:]=99.
        g["emulator1/actual_position"][:]=99.;g["ground_truth2/output_tension_true"][:]=99.
        c=json.loads(g.attrs["config"]);c["true_zero"]=999.;g.attrs["config"]=json.dumps(c)
    b=load_runs(path)[0];np.testing.assert_array_equal(a["x"],b["x"]);assert a["x"].shape[1]==8
    assert len(MOTOR_CHANNELS)==8 and load_runs(path,{"validation"})==[]
    model=TwoMotorObserver();r=run();scaler=dict(x_mean=np.zeros(8,np.float32),x_std=np.ones(8,np.float32),y_mean=np.zeros(2,np.float32),y_std=np.ones(2,np.float32))
    first=predict(model,r,scaler);r["x"][50:]=999.;second=predict(model,r,scaler)
    np.testing.assert_array_equal(first[:50],second[:50])


def test_two_tendon_calibration_train_only_and_physics_no_truth():
    train,test=run(),run("test");c=fit_compliance([train,test]);test["y"][:]=999.
    assert fit_compliance([train,test])==c
    a=PhysicsObserver(c).predict(train);train["y"][:]=999.;train["config"]["actual_parameters"]=[999.]*8
    np.testing.assert_array_equal(a,PhysicsObserver(c).predict(train))


def test_exact_inextensible_reconstruction_and_deformation_error():
    rng=np.random.default_rng(40);q=HOME+rng.uniform(-.05,.2,(100,2));e=(q-HOME)@ARM.T
    x=np.zeros((100,8));x[:,[0,4]]=e/.02
    np.testing.assert_allclose(rigid(dict(x=x)),q,atol=1e-14)
    x[:,0]+=.0005/.02
    np.testing.assert_allclose(rigid(dict(x=x))-q,np.tile(np.linalg.solve(ARM,[.0005,0.]),(100,1)),atol=1e-14)
