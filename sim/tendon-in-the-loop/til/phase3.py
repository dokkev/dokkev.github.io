"""Calibration and excitation wrappers around the unchanged Phase 2 TiL simulator."""
import copy,json
from dataclasses import asdict,dataclass,field
from pathlib import Path
import numpy as np
import mujoco

from .coupling import TiLSimulator
from .scenarios import EpisodeConfig,MotorProfile
from .transmission import Specimen,FIXTURES

ROOT=Path(__file__).resolve().parents[1]


def design(path=None):
    return json.loads(Path(path or ROOT/"experiments/phase3.json").read_text(encoding="utf8"))


def geometry(q,h1=.008,h2=.008):
    """Exact site-chain length/Jacobian of the existing planar finger, without simulator labels."""
    q=np.asarray(q);length=.05-2*.008+.012;J=[]
    for angle,a,ha,hb in ((q[0],.02,h1,h1),(q[1],.008,h1,h2)):
        c,s=np.cos(angle),np.sin(angle);b=.008
        v=np.array([a+b*c-hb*s,ha-b*s-hb*c])
        derivative=np.array([-b*s-hb*c,-b*c+hb*s])
        distance=np.linalg.norm(v);length+=distance;J.append(float(v@derivative/distance))
    return float(length),np.array(J)


def mechanism(finger,values):
    """Model-local mechanism changes; never mutate a Phase 2 reference model."""
    m,d=finger.model,finger.data
    for j,k in zip(finger.jq,(values["k1"],values["k2"])):m.jnt_stiffness[j]=k
    for dof in finger.dof:m.dof_damping[dof]=values["damping"]
    body=mujoco.mj_name2id(m,mujoco.mjtObj.mjOBJ_BODY,"link2")
    if not hasattr(finger,"_phase3_original_inertia"):
        finger._phase3_original_inertia=(float(m.body_mass[body]),m.body_inertia[body].copy())
    mass,inertia=finger._phase3_original_inertia
    # Vary rotational inertia at fixed mass and COM; do not confound it with gravity.
    m.body_mass[body]=mass
    m.body_inertia[body]=inertia*values["distal_inertia_ratio"]
    for name,height in (("s0",values["h1"]),("s1a",values["h1"]),("s1b",values["h1"]),
                        ("s2a",values["h2"]),("s2b",values["h2"])):
        index=mujoco.mj_name2id(m,mujoco.mjtObj.mjOBJ_SITE,name);m.site_pos[index,2]=-height
    mujoco.mj_setConst(m,d)


def probe(t,kind="multisine",amplitude=.0005,duration=1.2):
    if t<0 or t>duration:return 0.
    envelope=np.sin(np.pi*t/duration)**2
    if kind=="hold":return 0.
    if kind=="pulse":shape=np.sin(2*np.pi*t/duration)
    elif kind=="oscillation":shape=np.sin(2*np.pi*2*t)
    elif kind=="chirp":shape=np.sin(2*np.pi*(.5*t+1.25*t*t/duration))
    elif kind=="reversal":shape=np.tanh(4*np.sin(2*np.pi*2*t))
    elif kind=="multisine":shape=.5*np.sin(2*np.pi*t)+.3*np.sin(2*np.pi*2*t)+.2*np.sin(2*np.pi*3*t)
    elif kind=="low":shape=.1*np.sin(2*np.pi*t/duration)
    elif kind=="flexion":return float(amplitude*.5*(1-np.cos(np.pi*t/duration)))
    elif kind=="extension":return float(-amplitude*.5*(1-np.cos(np.pi*t/duration)))
    else:raise ValueError(kind)
    return float(amplitude*envelope*shape)


@dataclass
class Protocol:
    task: MotorProfile=field(default_factory=MotorProfile)
    active: bool=False
    probe_kind: str="multisine"
    probe_amplitude: float=.0005
    probe_duration: float=1.2

    @property
    def duration(self):return self.task.duration+self.probe_duration

    def x_ref(self,t):
        if t<self.probe_duration:
            return probe(t,self.probe_kind,self.probe_amplitude,self.probe_duration) if self.active else 0.
        return self.task.x_ref(t-self.probe_duration)

    def cycle_count(self,t):return self.task.cycle_count(max(0,t-self.probe_duration))


class CalibratedSimulator(TiLSimulator):
    def initialize(self,episode,initial_delta=None):
        settings=episode.metadata["phase3"];nominal=settings["nominal_mechanism"]
        actual=settings["actual_mechanism"];home=np.array(settings["home"])
        mechanism(self.finger,nominal)
        super().reset(tuple(home))
        # A one-time angle/load-cell reference, explicitly a privileged setup procedure.
        self.finger.reset(tuple(home),pretension=settings["nominal_pretension"])
        reference=self.finger.spring_ref.copy();l0=self.finger.l0
        self.calibration=dict(home=home.tolist(),motor_zero=0.,tendon_zero_m=l0,
            spring_reference_rad=reference.tolist(),pretension_N=settings["nominal_pretension"],
            fixture="large_guide",sources=design()["calibration_sources"])
        if settings["calibration"]=="A":
            self.finger.reset(tuple(settings["actual_q0"]),pretension=episode.pretension)
            reference=self.finger.spring_ref.copy();l0=self.finger.l0+settings["zero_error"]
        # Nominal and actual may differ only in declared residuals / one-factor OOD tests.
        for j,k in zip(self.finger.jq,(actual["k1"],actual["k2"])):self.finger.model.jnt_stiffness[j]=k
        for dof in self.finger.dof:self.finger.model.dof_damping[dof]=actual["damping"]
        self.finger.model.qpos_spring[self.finger.qadr]=reference+np.array(settings.get("preload_error",[0.,0.]))
        self.finger.l0=l0 if settings["calibration"]=="A" else l0+settings["zero_error"]
        q0=np.array(settings["actual_q0"])
        if initial_delta is not None:q0+=np.array(initial_delta)
        self.finger.data.qpos[self.finger.qadr]=q0
        self.finger.data.qvel[self.finger.dof]=0.
        mujoco.mj_forward(self.finger.model,self.finger.data)
        xout=self.finger.tendon_displacement()
        self.emulator.reset(T_hold=settings["nominal_pretension"])
        self.emulator.s.x=self.emulator.s.x_cmd=self.emulator.s.x_cmd_raw=xout
        self.motor.reset(T_hold=settings["nominal_pretension"])
        if abs(xout)>1e-12:
            for _ in range(round(.2/self.cfg.timing.plant_dt)):
                self.plant.step(self.cfg.timing.plant_dt,0,0,xout,0)
        # The jig-style static preparation is outside the evaluated energy/time boundary.
        s=self.plant.s
        s.W_in=s.W_out=s.W_parameter=s.E_diss=s.E_aging=s.t=0.
        self.plant.initial_energy=self.plant.stored_energy()
        self.plant._prev_x=(0.,xout)
        self.T_applied=self.T_out_meas=self.plant.s.T2;self.T_in_meas=self.plant.s.T1
        for _ in range(self._tdelay.maxlen or 0):self._tdelay.append(self.plant.s.T2)
        self.initial_setup=dict(spring_reference_rad=self.finger.model.qpos_spring[self.finger.qadr].tolist(),
            tendon_zero_m=self.finger.l0,initial_q_rad=q0.tolist(),output_position_m=xout,
            prepared_tension_N=[self.plant.s.T1,self.plant.s.T2])


def base_episode(case,index,split,scale="full",config=None):
    cfg=config or design();seed=cfg["seed"]+(100000 if scale=="pilot" else 0)+index+{"train":0,"validation":1000,"test":2000}[split]
    rng=np.random.default_rng(seed);task_rng=np.random.default_rng(seed)
    home=np.array(cfg["home_q_rad"]);T0=cfg["pretension_N"]
    calibration="C" if case.startswith("C") else case
    active=case=="C_probe" or (case in ("A","B") and (index//2)%2==1)
    nominal=copy.deepcopy(cfg["mechanism"]);actual=copy.deepcopy(nominal)
    actual_q=home.copy();zero=0.;pretension=T0
    if calibration=="A":
        actual_q+=rng.uniform([-.12,-.08],[.25,.5]);zero=float(rng.uniform(-.0008,.0008));pretension=float(rng.uniform(8,12))
    elif calibration=="B":
        pretension=float(rng.uniform(9,11));actual["k1"]*=float(rng.uniform(.95,1.05));actual["k2"]*=float(rng.uniform(.95,1.05))
    contact=index%2==1
    ep=EpisodeConfig(split,f"p3_{scale}_{split}_{case}_{index:03d}",seed=seed,
        cable_specimen_id=f"phase3-{split}-{case}-{index}",q0=tuple(actual_q),obj_x=.055 if contact else .2,
        k_obj=(1000.,4000.)[(index//2)%2],pretension=pretension,cable_preset="linear",
        profile=MotorProfile(amplitude=float(task_rng.uniform(.010,.018)),period=float(task_rng.uniform(1.8,2.4)),n_cycles=2),
        transmission=dict(specimen=asdict(Specimen(id="phase3-fixed")),routing=asdict(FIXTURES[cfg["fixture"]]),pretension=pretension),
        sim_overrides=dict(motor=dict(K_t=.1,K_t_nominal=.1,encoder_cpr=16384,velocity_noise=.002,current_noise=.005,
                current_colored_noise=.005,current_correlation_time=.08),
            sensors=dict(tension_noise=.05,tension_delay=.001,emulator_pos_noise=1e-6),
            motor_sensor=dict(filter_tau=.002,delay=.001,sample_period=.001),
            emulator=dict(effective_mass=.5,force_max=80.,delay=.0005)))
    ep.metadata=dict(case=case,condition="contact" if contact else "free",active=active,paired_id=f"{split}-{index}",
        expected_contact=contact,study_group=("unknown_setup" if calibration=="A" else "homed" if calibration=="B" else
            "calibrated_contact" if contact else "calibrated_active_probing" if active else "calibrated_free"),
        phase3=dict(calibration=calibration,home=home.tolist(),actual_q0=actual_q.tolist(),zero_error=zero,
            nominal_pretension=T0,nominal_mechanism=nominal,actual_mechanism=actual),
        protocol=dict(active=active,probe_kind="multisine",probe_amplitude=cfg["probe"]["amplitude_m"],probe_duration=cfg["probe"]["duration_s"]))
    return ep


def protocol(episode):return Protocol(task=episode.profile,**episode.metadata["protocol"])


def run_episode(episode,writer=None,initial_delta=None,dt=None,duration=None,quiet=False):
    cfg=episode.sim_config()
    if dt is not None:cfg.finger.timestep=dt;cfg.timing.plant_dt=.000025
    if quiet:
        cfg.sensors.tension_noise=0.;cfg.sensors.tension_jitter=0.
        cfg.motor.current_noise=cfg.motor.current_colored_noise=cfg.motor.velocity_noise=0.;cfg.motor.encoder_cpr=0
        cfg.motor_sensor.bias_drift_A_per_sqrt_s=cfg.motor_sensor.dropout_probability=0.
    sim=CalibratedSimulator(cfg);sim.initialize(episode,initial_delta)
    p=protocol(episode);rows=[];contacts=0;saturated=0;peakT=0.;peakV=0.;energy=0.;flags=[]
    for _ in range(round((duration or p.duration)/sim.mj_dt)):
        t=sim.t;ref=p.x_ref(t);velocity=(p.x_ref(t+1e-4)-p.x_ref(t-1e-4))/2e-4
        sim.step(ref/.02,velocity/.02)
        if sim.log_due:
            rec=sim.record();q=rec["simulation"]["joint_positions"];o=rec["motor"]
            if not np.isfinite([*q,o["current"],sim.plant.s.T2]).all():raise FloatingPointError("non-finite phase3 state")
            contact=bool(rec["simulation"]["contact_state"]);contacts+=contact
            saturated+=abs(o["applied_command"])>=cfg.motor.i_max-1e-5
            peakT=max(peakT,sim.plant.s.T1,sim.plant.s.T2);peakV=max(peakV,abs(sim.motor.xd_in))
            rows.append([sim.t,*q,o["position"],o["velocity"],o["current"],o["applied_command"],
                         sim.plant.s.T2,float(contact),rec["simulation"]["contact_force"],sim.emulator.tracking_error,sim.plant.ground_truth()["energy_residual"],ref])
            if writer:writer.append(sim.t,p.cycle_count(sim.t),rec)
    data=np.array(rows);prefix=data[:,0]<=p.probe_duration
    if episode.metadata["expected_contact"] and not contacts:flags.append("requested_contact_absent")
    if peakT>100:flags.append("tension_diagnostic")
    if saturated/max(1,len(data))>.5:flags.append("saturation_dominated")
    if np.max(abs(data[:,10]))>.005:flags.append("tracking_diagnostic")
    probe_contact_changes=int(np.count_nonzero(np.diff(data[prefix,8])))
    if probe_contact_changes:flags.append("prefix_contact_transition")
    result=dict(flags=flags,eligible=not bool(set(flags)&{"tension_diagnostic","requested_contact_absent"}),
        contact_fraction=contacts/len(data),joint_range_deg=(np.ptp(data[:,1:3],axis=0)*180/np.pi).tolist(),
        peak_tension_N=peakT,peak_input_velocity_m_per_s=peakV,saturation_fraction=saturated/len(data),
        probe_duration_s=p.probe_duration,probe_command_peak_mm=float(np.max(abs(data[prefix,12]))*1000),
        probe_motor_travel_mm=float(np.ptp(data[prefix,3])*.02*1000),
        probe_current_rms_A=float(np.sqrt(np.mean(data[prefix,5]**2))),probe_contact_transitions=probe_contact_changes,
        energy_residual_J=float(data[-1,11]),calibration=sim.calibration,initial_setup=sim.initial_setup)
    if writer:writer.close({"quality":json.dumps(result),"summary":json.dumps(result)})
    return result,data
