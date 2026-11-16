"""Motor-displacement control experiments and existing-schema two-channel recording."""
from dataclasses import asdict
import copy,json
import numpy as np
from .two_tendon import ARM,HOME,TwoTendonSimulator,channel_config,MOTOR_CHANNELS
from .finger import FingerParams
from .recorder import DatasetFile,PHASE2_UNITS
from .coupling import CHANNEL_UNITS
from .transmission import FIXTURES


def specification(index=0,split="test",condition="nominal",motion="coordinated"):
    seed=271116+{"train":0,"validation":1000,"test":2000}[split]+index
    rng=np.random.default_rng(seed)
    return dict(id=f"tt_{split}_{condition}_{index:03d}",scenario_id=split,seed=seed,condition=condition,motion=motion,
                amplitude=[float(rng.uniform(.18,.32)),float(rng.uniform(.22,.40))],period_s=float(rng.uniform(2.4,3.2)),
                cycles=2,contact=index%2==1,object_x=.055,object_stiffness=1000.,controller="elastic_feedforward")


def target(t,spec):
    if t<.6:return HOME.copy(),np.zeros(2)
    period=spec["period_s"];s=(t-.6)%period/period
    # Ramp/hold/release/rest gives explicit contact and release windows.
    if s<.35:a=.5*(1-np.cos(np.pi*s/.35));v=.5*np.pi/(.35*period)*np.sin(np.pi*s/.35)
    elif s<.55:a=1.;v=0.
    elif s<.9:a=.5*(1+np.cos(np.pi*(s-.55)/.35));v=-.5*np.pi/(.35*period)*np.sin(np.pi*(s-.55)/.35)
    else:a=v=0.
    amp=np.array(spec["amplitude"])
    if spec["motion"]=="proximal":amp[1]=0.
    elif spec["motion"]=="distal":amp[0]=0.
    elif spec["motion"]=="reversal":
        a=np.sin(2*np.pi*s)**3;v=6*np.pi/period*np.sin(2*np.pi*s)**2*np.cos(2*np.pi*s)
        amp=np.minimum(amp,[.12,.15])
    return HOME+amp*a,amp*v


def gravity(q):
    distal=9.81*.012*.035/2*np.cos(q.sum())
    return np.array([9.81*(.020*.05/2+.012*.05)*np.cos(q[0])+distal,distal])


def static_tension(q,spring_reference):
    return np.linalg.solve(ARM.T,.08*(q-spring_reference)-gravity(q))


def resolved_configuration(spec,outer=.0005,plant=.0001,emulator_delay=0.,noise=True):
    """Deterministic configuration factory shared by execution and report metadata."""
    configs=[channel_config(spec["seed"]+i*10000,outer=outer,plant=plant,noise=noise) for i in range(2)]
    for c in configs:c.emulator.delay=emulator_delay
    condition=spec["condition"]
    for i,c in enumerate(configs):
        m=c.transmission["specimen"]
        if condition in ("elastic","ideal_stiff"):
            m.update(friction_mu=0.,bending_loss_Nm=0.,maxwell_ratio=0.);c.transmission["bearing_coulomb"]=0.;c.transmission["bearing_viscous"]=0.
        if condition=="ideal_stiff":m["modulus_pa"]*=20  # finite stiff limit; exact inextensible algebra is separate
        if condition=="friction":m["maxwell_ratio"]=0.
        if condition=="stiffness" and i==1:m["modulus_pa"]*=.65
        if condition=="routing" and i==1:c.transmission["routing"]=asdict(FIXTURES["two_guides"])
        if condition=="pretension":c.cable.pretension=12. if i==0 else 8.;c.transmission["pretension"]=c.cable.pretension
        if condition=="zero":c.motor.encoder_offset=(.0005 if i==0 else -.0005)/c.motor.r_drum
        if condition=="drift":m.update(creep_rate_m_per_s=8e-6,conditioning_per_m=1.5)
    fp=FingerParams(obj_x=spec["object_x"] if spec["contact"] else .2,k_obj=spec["object_stiffness"],
                    q1_range=(-np.pi/6,np.pi/3),q2_range=(0.,5*np.pi/6),T_max=80.)
    return configs,fp


def simulate(spec,writer=None,outer=.0005,plant=.0001,controller_period=.0001,emulator_delay=0.,solref=.004,noise=True,duration=None):
    configs,fp=resolved_configuration(spec,outer,plant,emulator_delay,noise)
    if writer:writer.g.attrs["resolved_configuration"]=json.dumps(dict(channels=[c.to_dict() for c in configs],finger=asdict(fp)))
    sim=TwoTendonSimulator(configs,fp)
    sim.finger.model.geom_solref[:,0]=solref
    # The controller retains nominal 10/10 N calibration when actual pretension changes.
    nominal_reference=HOME+(-gravity(HOME)-ARM.T@np.array([10.,10.]))/.08
    for c in sim.chains:
        c.motor.command_period=controller_period
        c.motor.s.i_ff=.02*10/.1
    # Nominal linear incremental compliance comes from declared geometry/material, not true run parameters.
    lengths=FIXTURES["large_guide"].lengths
    compliance=sum(lengths)/(1e10*np.pi*.0005**2/4)
    length=(duration or (.6+spec["cycles"]*spec["period_s"]))
    data=[];flags=[];limits=0;slack=np.zeros(2);infeasible=0;peaktracking=np.zeros(2)
    for _ in range(round(length/sim.dt)):
        qref,vref=target(sim.t,spec);Tref=static_tension(qref,nominal_reference)
        infeasible+=int(np.any(Tref<0)|np.any(Tref>40))
        commands=ARM@(qref-HOME)
        if spec["controller"]=="elastic_feedforward":commands+=compliance*(Tref-10.)
        # Quasistatic feedforward, only desired joints and the nominal calibrated model.
        for i,c in enumerate(sim.chains):c.motor.s.i_ff=float(np.clip(.02*Tref[i]/.1,-8.,8.))
        sim.step(commands,ARM@vref)
        if sim.log_due:
            rec=sim.record();rec["protocol"]=dict(desired_joints=qref,motor_displacements=commands,static_required_tensions=Tref,
                reversal=float(np.any(vref<-.01)))
            if writer:writer.append(sim.t,max(0.,(sim.t-.6)/spec["period_s"]),rec)
            obs=[rec[f"motor{i}"][k] for i in (1,2) for k in ("position","velocity","current","applied_command")]
            # Stable trace layout: time, true q(2), desired q(2), motor observations(8),
            # Tin(2), Tout(2), deformation(2), contact force, tracking error(2), energy residual(2), command x(2).
            tin=[c.plant.s.T1 for c in sim.chains];tout=[c.plant.s.T2 for c in sim.chains]
            deformation=[c.motor.x_in+c.emulator.s.x for c in sim.chains]
            tracking=[c.emulator.tracking_error for c in sim.chains]
            residual=[c.plant.ground_truth()["energy_residual"] for c in sim.chains]
            data.append([sim.t,*sim.finger.q,*qref,*obs,*tin,*tout,*deformation,rec["simulation"]["contact_force"],*tracking,*residual,*commands])
            limits+=int(any(c.motor.limit_hit or c.emulator.s.force_saturated or abs(c.motor.s.u)>=7.999 for c in sim.chains))
            slack+=np.array(tout)<.05;peaktracking=np.maximum(peaktracking,np.abs(tracking))
    a=np.array(data)
    if not np.isfinite(a).all():raise FloatingPointError("nonfinite two-tendon trial")
    e=np.degrees(a[:,1:3]-a[:,3:5]);moving=a[:,0]>=.6
    if limits:flags.append("actuator_limit")
    if max(peaktracking)>.002:flags.append("emulator_tracking")
    if max(a[:,13:17].max(0))>40.:flags.append("above_nominal_tension_envelope")
    if np.max(np.abs(e))>30.:flags.append("large_tracking_error")
    summary=dict(config=spec,flags=flags,finite=True,mae_deg=np.mean(abs(e[moving]),0).tolist(),rmse_deg=np.sqrt(np.mean(e[moving]**2,0)).tolist(),
        peak_error_deg=np.max(abs(e),0).tolist(),limit_fraction=limits/len(a),slack_fraction=(slack/len(a)).tolist(),
        static_free_torque_infeasible_fraction=infeasible/max(1,round(length/sim.dt)),
        peak_input_output_tension_N=a[:,13:17].max(0).tolist(),motor_travel_mm=(np.ptp(a[:,[5,9]],axis=0)*20).tolist(),
        motor_current_peak_A=np.max(abs(a[:,[7,11]]),axis=0).tolist(),contact_force_peak_N=float(a[:,19].max()),
        emulator_tracking_peak_mm=(peaktracking*1000).tolist(),energy_residual_J=a[-1,22:24].tolist(),
        port_work_mismatch_J=sim.record()["coupling"]["port_work_mismatch"].tolist(),
        calibration=dict(home=HOME.tolist(),nominal_tension_N=[10,10],spring_reference_rad=nominal_reference.tolist(),
            source="One-time joint-reference and input/output load-cell setup; not motor-only initialization"),
        simulation=dict(outer_dt=outer,plant_dt=plant,controller_period=controller_period,emulator_delay=emulator_delay,contact_solref=solref))
    if writer:writer.close(dict(quality=json.dumps(summary)))
    return summary,a


def dataset_file(path):
    ds=DatasetFile(path);ds.f.attrs["schema"]="tendon-in-the-loop/two-channel/v1"
    ds.f.attrs["motor_only_channels"]=json.dumps(MOTOR_CHANNELS)
    ds.f.attrs["coupling_notes"]="Two pre-step boundary adapters; inherited causal scalar chains; shared finger integrates once. Constant-moment-arm reference, not verified spatial routing."
    return ds


def episode_writer(ds,spec):
    w=ds.episode(spec["id"],spec)
    w.units={}
    for prefix in ("motor","emulator","transmission","ground_truth"):
        for key,value in CHANNEL_UNITS.items():
            if key.startswith(prefix+"/"):
                for i in (1,2):w.units[prefix+str(i)+key[len(prefix):]]=value
    w.units.update({"simulation/joint_positions":"rad","simulation/joint_velocities":"rad/s",
        "simulation/tendon_lengths":"m","simulation/tendon_jacobian":"m/rad","simulation/contact_force":"N",
        "simulation/tendon_joint_torque":"N m","simulation/applied_tensions":"N","protocol/desired_joints":"rad",
        "protocol/motor_displacements":"m","protocol/static_required_tensions":"N","coupling/port_work_mismatch":"J"})
    w.g.attrs["units"]=json.dumps(w.units)
    return w


def normalize_units(file):
    """Retain existing streaming recorder; make its scalar legacy unit map channel-specific."""
    units={"time":"s","cycle_count":"cycles"}
    for prefix in ("motor","emulator","transmission","ground_truth"):
        for key,value in {**CHANNEL_UNITS,**PHASE2_UNITS}.items():
            if key.startswith(prefix+"/"):
                for i in (1,2):units[prefix+str(i)+key[len(prefix):]]=value
    units.update({key:value for key,value in CHANNEL_UNITS.items() if key.startswith("simulation/")})
    units.update({"simulation/tendon_lengths":"m","simulation/tendon_jacobian":"m/rad","simulation/applied_tensions":"N",
        "protocol/desired_joints":"rad","protocol/motor_displacements":"m","protocol/static_required_tensions":"N",
        "protocol/reversal":"bool (negative reference velocity)","coupling/virtual_work":"J",
        "coupling/physical_output_work":"J","coupling/port_work_mismatch":"J"})
    for i in (1,2):units[f"emulator{i}/motor_limit_hit"]="bool"
    for group in file["episodes"].values():
        group.attrs["units"]=json.dumps(units)
        group.visititems(lambda name,obj:obj.attrs.__setitem__("units",units.get(name,"unspecified")) if hasattr(obj,"shape") else None)
    file.attrs["units"]=json.dumps(units)
