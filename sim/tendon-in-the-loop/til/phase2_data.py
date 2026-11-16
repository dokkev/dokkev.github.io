"""Phase 2 experiment design, persistent specimens and transparent session diagnostics."""
import json
import copy
from dataclasses import asdict
from pathlib import Path
import h5py
import numpy as np

from .scenarios import EpisodeConfig, MotorProfile
from .transmission import Specimen, FIXTURES

ROOT=Path(__file__).resolve().parents[1]


def design(path=None):
    return json.loads(Path(path or ROOT/"experiments/phase2.json").read_text(encoding="utf8"))


def specimen(identifier,config):
    rng=np.random.default_rng(config["design_seed"]+identifier)
    ranges=config["specimen_priors"]
    return Specimen(id=f"hypothetical_{identifier:02d}",
        **{k:float(rng.uniform(*bounds)) for k,bounds in ranges.items()},
        nonlinear_strain_coefficient=float(rng.uniform(200,600)),
        damping_Ns_per_m=float(rng.uniform(.5,2.)),
        bending_loss_Nm=float(rng.uniform(.5e-4,1.5e-4)))


def make_episodes(split,scale="pilot",config=None):
    cfg=config or design(); count=cfg["counts"][scale][split]
    if split=="test_slack":
        base=make_episodes("test_in_range",scale,cfg)[0];runs=[]
        for i in range(count):
            ep=copy.deepcopy(base);ep.scenario_id=split;ep.episode_id=f"p2_{scale}_{split}_{i:03d}"
            ep.seed=base.seed+100+i  # independent measurement realizations for repeated payout levels
            ep.cable_specimen_id=f"slack-replica-{i}";ep.profile.kind="press";ep.profile.period=2.
            ep.profile.offset=-float((.004,.006,.008,.010)[i%4])
            ep.transmission["taut_transition_m"]=1e-5
            ep.metadata.update(condition="slack_cycle",expected_contact=False,payout_offset_m=ep.profile.offset,
                protocol="Supplemental predeclared payout OOD; frozen models, no retuning")
            runs.append(ep)
        return runs
    if split=="test_sensitivity":
        base=make_episodes("test_in_range",scale,cfg)[0]
        choices=[("current_noise",v) for v in (0.,.01,.05,.1)]+[("telemetry_delay",v) for v in (0.,.001,.005,.01)]
        if scale=="pilot":choices=[choices[i] for i in (0,3,4,7)]
        runs=[]
        for i,(factor,value) in enumerate(choices):
            ep=copy.deepcopy(base);ep.scenario_id=split;ep.episode_id=f"p2_{scale}_{split}_{i:03d}"
            ep.cable_specimen_id=f"sensitivity-replica-{i}"
            if factor=="current_noise":ep.sim_overrides["motor"]["current_noise"]=value
            else:ep.sim_overrides["motor_sensor"]["delay"]=value
            ep.metadata.update(sensitivity_factor=factor,sensitivity_value=value)
            runs.append(ep)
        return runs
    offset=100000 if scale=="pilot" else 0
    group=list(cfg["counts"][scale]).index(split)
    # Stratified factors; persistent specimen and instrument draws use separate seeds.
    rng=np.random.default_rng(cfg["design_seed"]+offset+group*1000)
    strata=(np.arange(count)+rng.random(count))/count
    rng.shuffle(strata)
    runs=[]
    for i in range(count):
        sid=i%6
        if split=="test_specimen":sid=6+i%2
        if split=="test_combined":sid=8+i%2
        m=specimen(sid,cfg)
        fixture=cfg["training_fixtures"][i%2]
        if split=="test_routing":fixture=cfg["held_out_fixtures"][i%2]
        if split=="test_combined":fixture=cfg["combined_fixture"]
        evolution=("constant","conditioning","creep","combined")[i%4]
        if evolution in ("conditioning","combined"):
            m.conditioning_per_m=.6; m.settle_rate_m_per_Ns=2e-7
        if evolution in ("creep","combined"):m.creep_rate_m_per_s=3e-6
        if split in ("test_drift","test_combined"):
            evolution="combined"; m.conditioning_per_m=2.;m.creep_rate_m_per_s=8e-6
        transmission=dict(specimen=asdict(m),routing=asdict(FIXTURES[fixture]),pretension=float(8+4*strata[i]))
        if split=="test_drift" and i%2:
            evolution="intervention"
            transmission.update(intervention_time_s=3.,intervention_slack_m=.0006,intervention_stiffness_factor=.8)
        instrument=np.random.default_rng(cfg["design_seed"]+5000+sid%3)
        motor=dict(K_t=float(instrument.uniform(.09,.11)),K_t_nominal=.1,
            J_m=float(instrument.uniform(1.6e-5,2.4e-5)),b_m=float(instrument.uniform(1e-5,4e-5)),
            tau_c_m=float(instrument.uniform(0,.002)),winding_resistance=.5,thermal_capacity=15.,
            thermal_resistance=8.,K_t_temperature_coeff=-.001,
            encoder_cpr=16384,encoder_offset=float(instrument.uniform(-.0005,.0005)),
            current_gain=float(instrument.uniform(.98,1.02)),current_bias=float(instrument.uniform(-.03,.03)),
            current_noise=.01,current_colored_noise=.01,current_correlation_time=.08,velocity_noise=.005)
        sensors=dict(tension_noise=.1,input_tension_bias=float(instrument.uniform(-.1,.1)),
            output_tension_bias=float(instrument.uniform(-.1,.1)),emulator_pos_noise=2e-6,
            emulator_pos_bias=float(instrument.uniform(-1e-5,1e-5)),tension_delay=.001,tension_jitter=.0005)
        telemetry=dict(sample_period=.001 if i%2 else .002,filter_tau=.002,delay=.001,
            bias_drift_A_per_sqrt_s=.001,bias_bound_A=.02,dropout_probability=.002)
        condition=("free","press","dynamic","dwell","recontact","limit")[i%6]
        if split=="test_contact":condition="press"
        x=float((.05,.055,.06)[i%3]);k=float((500,1000,2000)[i%3])
        if split=="validation":x=.052;k=1500.
        if split in ("test_contact","test_combined"):x=float((.045,.065)[i%2]);k=float((4000,8000)[i%2])
        if condition=="free":x=.2
        family=("press","triangle","oscillation","chirp","multisine")[i%5]
        period=1.6+.6*float(strata[i]);amp=.014+.004*float(strata[i])
        if condition=="dynamic":period=.8;family="chirp"
        if condition=="limit":amp=.026
        cycles=2 if scale=="pilot" else 3
        if split=="test_drift":cycles=4 if scale=="pilot" else 10
        if split=="train" and i>=count-2:cycles=4 if scale=="pilot" else 8
        profile=MotorProfile(amplitude=amp,period=period,n_cycles=cycles,kind=family)
        if condition=="dwell":profile=MotorProfile(amplitude=amp,period=3.,n_cycles=cycles,ramp_frac=.15,hold_frac=.6,release_frac=.15)
        q0=(float(.03+.12*strata[i]),float(.04+.18*(1-strata[i])))
        if split=="test_observability":
            sid=99;fixture="straight";evolution="constant";condition="weak_free"
            q0=(0.,0.) if i%2==0 else (.4,.8)
            m=Specimen(id="ambiguity_reference",maxwell_ratio=0.,nonlinear_strain_coefficient=0.,friction_mu=0.,bending_loss_Nm=0.)
            transmission=dict(specimen=asdict(m),routing=asdict(FIXTURES[fixture]),pretension=10.,bearing_coulomb=0.,bearing_viscous=0.)
            motor={};sensors={};telemetry={};x=.2
            profile=MotorProfile(amplitude=0. if i<2 else .0002,period=2.,n_cycles=2)
        transmission["specimen"]["id"]+=f"-{evolution}"
        runs.append(EpisodeConfig(split,f"p2_{scale}_{split}_{i:03d}",seed=cfg["design_seed"]+offset+group*1000+i,
            cable_specimen_id=f"{split}-replica-{sid}-{evolution}",cable_preset="linear",q0=q0,obj_x=x,k_obj=k,
            pretension=transmission["pretension"],profile=profile,transmission=transmission,
            sim_overrides=dict(motor=motor,sensors=sensors,motor_sensor=telemetry,
                emulator=dict(effective_mass=.5,force_max=80.,delay=.0005),
                finger=dict(k_joint=float(.07+.02*strata[i]),b_joint=.004)),
            metadata=dict(specimen_family=sid,fixture_id=fixture,evolution=evolution,condition=condition,
                instrument_id=sid%3,session_index=i//6,expected_contact=condition not in ("free","weak_free"),
                calibration="nominal motor constants; joint-zero/preload setup is hidden from the observer")))
    return runs


def diagnose(group,config=None):
    cfg=config or design(); limits=cfg["quality_diagnostics"]
    if "failed" in group.attrs:return dict(status="numerical_failure",flags=[group.attrs["failed"]],eligible=False)
    q=group["simulation/joint_positions"][()]
    ranges=np.ptp(q,axis=0)*180/np.pi
    contact=group["simulation/contact_state"][()]>0
    strain=group["ground_truth/cable_segment_strains"][()]
    tension=group["ground_truth/output_tension_true"][()]
    error=group["emulator/tracking_error"][()]
    episode=json.loads(group.attrs["config"])
    current=group["motor/applied_command"][()]
    max_i=episode["sim_overrides"].get("motor",{}).get("i_max",8.)
    saturation=float(np.mean(abs(current)>=max_i-1e-5))
    flags=[]
    if episode["metadata"]["expected_contact"] and not contact.any():flags.append("requested_contact_absent")
    if min(ranges)<limits["minimum_joint_range_deg"]:flags.append("weak_joint_motion")
    if np.max(strain)>limits["maximum_strain"]:flags.append("strain_outside_study_envelope")
    if np.max(tension)>limits["maximum_tension_N"]:flags.append("tension_outside_study_envelope")
    if np.max(abs(error))>limits["maximum_tracking_error_m"]:flags.append("tracking_diagnostic")
    if saturation>limits["maximum_saturation_fraction"]:flags.append("saturation_dominated")
    severe={"strain_outside_study_envelope","tension_outside_study_envelope","saturation_dominated","requested_contact_absent"}
    return dict(status="completed_with_flags" if flags else "completed",flags=flags,
        eligible=not bool(severe.intersection(flags)),joint_range_deg=ranges.tolist(),
        contact_fraction=float(contact.mean()),peak_tension_N=float(np.max(tension)),
        peak_strain=float(np.max(strain)),peak_tracking_error_mm=float(np.max(abs(error))*1000),
        saturation_fraction=saturation,energy_residual_J=float(group["ground_truth/energy_residual"][-1]))
