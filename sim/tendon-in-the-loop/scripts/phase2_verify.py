"""Numerical convergence and conditional local sensitivity using actual coupled trajectories."""
import argparse,copy,json,sys
from pathlib import Path
import numpy as np
import mujoco

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from til.phase2_data import make_episodes
from til.coupling import TiLSimulator
from til.transmission import TransmissionPlant,TransmissionParams,Specimen,FIXTURES


def quiet(config):
    c=copy.deepcopy(config)
    c.sensors.tension_noise=0.;c.sensors.tension_jitter=0.
    c.motor.current_noise=c.motor.current_colored_noise=c.motor.velocity_noise=0.
    c.motor.encoder_cpr=0
    c.motor_sensor.dropout_probability=c.motor_sensor.bias_drift_A_per_sqrt_s=0.
    return c


def trajectory(ep,dt=.0005,ideal=False,perturb=None,duration=None,plant_dt=.0001):
    cfg=quiet(ep.sim_config());cfg.finger.timestep=dt
    cfg.timing.plant_dt=plant_dt
    if ideal:cfg.emulator.mode="ideal"
    sim=TiLSimulator(cfg);sim.reset(ep.q0)
    if perturb:
        name,amount=perturb
        if name in ("q1","q2"):
            sim.finger.data.qpos[sim.finger.qadr[int(name[-1])-1]]+=amount
            mujoco.mj_forward(sim.finger.model,sim.finger.data)
        elif name=="Kt":sim.motor.p.K_t+=amount
        elif name=="reference":sim.plant.s.creep+=amount
    rows=[]
    steps=round((duration or ep.profile.duration)/dt)
    for _ in range(steps):
        t=sim.t;ref=ep.profile.x_ref(t);v=(ep.profile.x_ref(t+1e-4)-ep.profile.x_ref(t-1e-4))/2e-4
        sim.step(ref/.02,v/.02)
        if sim.log_due:
            rec=sim.record();o=rec["motor"]
            rows.append([sim.t,sim.plant.s.T2,*sim.finger.q,rec["simulation"]["contact_force"],
                         sim.emulator.tracking_error,rec["ground_truth"]["energy_residual"],
                         o["position"],o["velocity"],o["current"],o["applied_command"]])
    return np.array(rows)


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True);a=ap.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    ep=make_episodes("train","pilot")[1];ep.profile.n_cycles=1
    time_steps=[.001,.0005,.00025,.000125,.0000625]
    # Hold plant/controller update fixed when varying the MuJoCo/coupling timestep.
    runs=[trajectory(ep,dt,plant_dt=.00003125) for dt in time_steps]
    fine=runs[-1];convergence=[]
    for dt,run in zip(time_steps,runs):
        expected=np.column_stack([np.interp(run[:,0],fine[:,0],fine[:,j]) for j in range(1,5)])
        error=run[:,1:5]-expected
        convergence.append(dict(mujoco_dt_s=dt,plant_dt_s=.00003125,tension_rmse_N=float(np.sqrt(np.mean(error[:,0]**2))),
            q1_rmse_deg=float(np.sqrt(np.mean(error[:,1]**2))*180/np.pi),
            q2_rmse_deg=float(np.sqrt(np.mean(error[:,2]**2))*180/np.pi),
            contact_force_rmse_N=float(np.sqrt(np.mean(error[:,3]**2))),
            energy_residual_J=float(run[-1,6])))
    nominal=trajectory(ep)
    expected=np.column_stack([np.interp(nominal[:,0],fine[:,0],fine[:,j]) for j in range(1,5)])
    err=nominal[:,1:5]-expected
    nominal_error=dict(mujoco_dt_s=.0005,plant_dt_s=.0001,
        tension_rmse_N=float(np.sqrt(np.mean(err[:,0]**2))),q1_rmse_deg=float(np.sqrt(np.mean(err[:,1]**2))*180/np.pi),
        q2_rmse_deg=float(np.sqrt(np.mean(err[:,2]**2))*180/np.pi),contact_force_rmse_N=float(np.sqrt(np.mean(err[:,3]**2))))
    plant_steps=[.000125,.0001,.00005,.000025]
    plant_runs=[trajectory(ep,plant_dt=dt) for dt in plant_steps]
    plant_convergence=[]
    for dt,run in zip(plant_steps,plant_runs):
        err=run[:,1:5]-plant_runs[-1][:,1:5]
        plant_convergence.append(dict(plant_dt_s=dt,mujoco_dt_s=.0005,
            tension_rmse_N=float(np.sqrt(np.mean(err[:,0]**2))),q1_rmse_deg=float(np.sqrt(np.mean(err[:,1]**2))*180/np.pi),
            q2_rmse_deg=float(np.sqrt(np.mean(err[:,2]**2))*180/np.pi),contact_force_rmse_N=float(np.sqrt(np.mean(err[:,3]**2))),
            energy_residual_J=float(run[-1,6])))
    ideal=trajectory(ep,ideal=True)
    # All nuisance states fixed; perturb actual initial q without resetting/calibrating the fixture.
    base=make_episodes("train","pilot")[0]
    normal=trajectory(base,duration=.5)
    scales=np.array([2*np.pi/16384,.005,.01,.001])
    columns=[]
    perturbations=[("q1",1e-4),("q2",1e-4),("Kt",.001),("reference",1e-5)]
    for name,delta in perturbations:
        changed=trajectory(base,perturb=(name,delta),duration=.5)
        columns.append(((changed[:,7:11]-normal[:,7:11])/scales).ravel()/delta)
    jac=np.column_stack(columns)
    singular=np.linalg.svd(jac[:,:2],compute_uv=False)
    normalized=jac*np.array([.01,.01,.001,1e-5])[None,:]
    corr=np.corrcoef(normalized.T)
    np.savez_compressed(out/"verification.npz",**{f"dt_{i}":r for i,r in enumerate(runs)},ideal=ideal,nominal=nominal,
                        sensitivity=normalized,local_reference=normal)
    report=dict(convergence=convergence,plant_convergence=plant_convergence,nominal_against_joint_refinement=nominal_error,
        convergence_scope="MuJoCo sweep fixes plant/controller at 31.25 us. Plant sweep fixes MuJoCo at 0.5 ms; controller updates with plant step.",
        ideal_tracking_peak_mm=float(np.max(abs(ideal[:,5]))*1000),
        finite_tracking_peak_mm=float(np.max(abs(nominal[:,5]))*1000),
        local_sensitivity=dict(horizon_s=.5,sensor_comparison_scales=scales.tolist(),
            perturbations=perturbations,joint_singular_values=singular.tolist(),
            joint_condition_number=float(singular[0]/max(singular[-1],1e-30)),
            scaled_column_correlation=corr.tolist(),
            interpretation="Conditional finite-horizon initial-q sensitivity with fixed nuisance states and fixed preload/reference. Not full-system or global observability."))
    (out/"verification.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    print(json.dumps(report,indent=2))


if __name__=="__main__":main()
