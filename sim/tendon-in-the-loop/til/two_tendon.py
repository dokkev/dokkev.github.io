"""Two-channel constant-moment-arm reference; legacy single-tendon models are untouched."""
from dataclasses import asdict
import copy
import xml.etree.ElementTree as ET
import numpy as np
import mujoco
from .finger import Finger, FingerParams, build_mjcf
from .coupling import TiLSimulator, SimConfig
from .motors import QDDMotor
from .transmission import Specimen, FIXTURES

ARM = np.array([[.015, 0.], [.010, .010]])  # positive reel-in / positive flexion
HOME = np.array([.10, .20])
MOTOR_CHANNELS = tuple(f"motor{j}/{k}" for j in (1, 2) for k in
                       ("position", "velocity", "current", "applied_command"))


class TwoTendonFinger(Finger):
    """MuJoCo fixed-tendon pulley approximation, retaining the original contact/body model."""
    def __init__(self, params=None):
        self.p = params or FingerParams(q1_range=(-np.pi/6, np.pi/3), q2_range=(0., 5*np.pi/6), T_max=80.)
        root = ET.fromstring(build_mjcf(self.p))
        for tag in ("tendon", "actuator", "sensor"):root.remove(root.find(tag))
        tendons = ET.SubElement(root, "tendon");actuators = ET.SubElement(root, "actuator")
        for i, row in enumerate(ARM):
            tendon = ET.SubElement(tendons, "fixed", name=f"flexor{i+1}", stiffness="0", damping="0", frictionloss="0")
            for j, coefficient in enumerate(-row):
                if coefficient:ET.SubElement(tendon, "joint", joint=f"q{j+1}", coef=str(coefficient))
            ET.SubElement(actuators, "general", name=f"pull{i+1}", tendon=f"flexor{i+1}",
                          gainprm="1 0 0", biasprm="0 0 0", ctrlrange=f"-{self.p.T_max} 0")
        self.model = mujoco.MjModel.from_xml_string(ET.tostring(root, encoding="unicode"))
        self.data = mujoco.MjData(self.model)
        self.tids = [mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_TENDON, f"flexor{i}") for i in (1,2)]
        self.aids = [mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_ACTUATOR, f"pull{i}") for i in (1,2)]
        self.jq = [mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, n) for n in ("q1","q2")]
        self.dof = [self.model.jnt_dofadr[j] for j in self.jq]
        self.qadr = [self.model.jnt_qposadr[j] for j in self.jq]
        self.obj_j = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT,"obj_z")
        self.obj_qadr = self.model.jnt_qposadr[self.obj_j];self.obj_dof = self.model.jnt_dofadr[self.obj_j]
        self.obj_geom = mujoco.mj_name2id(self.model,mujoco.mjtObj.mjOBJ_GEOM,"object_geom")
        self.finger_geoms = {mujoco.mj_name2id(self.model,mujoco.mjtObj.mjOBJ_GEOM,n) for n in ("link1_geom","link2_geom")}
        self.tip_site = mujoco.mj_name2id(self.model,mujoco.mjtObj.mjOBJ_SITE,"tip")
        self._force6 = np.zeros(6);self.length_offsets=np.array([.15,.20]);self.reset()

    def reset(self, q0=HOME, pretension=(10.,10.)):
        mujoco.mj_resetData(self.model,self.data);self.data.qpos[self.qadr]=q0
        mujoco.mj_forward(self.model,self.data)
        torque=-self.tendon_jacobian().T@np.broadcast_to(pretension,2)
        for i,j in enumerate(self.jq):
            self.model.qpos_spring[self.qadr[i]]=q0[i]+(self.data.qfrc_bias[self.dof[i]]-torque[i])/self.model.jnt_stiffness[j]
        self.spring_ref=self.model.qpos_spring[self.qadr].copy()
        mujoco.mj_forward(self.model,self.data);self.l0=self.tendon_length().copy();self.home=np.array(q0)

    def tendon_length(self):return self.length_offsets+self.data.ten_length[self.tids]

    def tendon_jacobian(self):
        result=np.zeros((2,self.model.nv));d=self.data
        for i,aid in enumerate(self.aids):
            start=d.moment_rowadr[aid]
            for k in range(d.moment_rownnz[aid]):result[i,d.moment_colind[start+k]]=d.actuator_moment[start+k]
        return result[:,self.dof]

    def tendon_displacement(self):return self.tendon_length()-self.l0

    def apply_tension(self,tension):
        tension=np.asarray(tension,float)
        if tension.shape!=(2,) or not np.isfinite(tension).all():raise ValueError("two finite tensions required")
        self.data.ctrl[self.aids]=-np.clip(tension,0.,self.p.T_max)

    def required_tension(self,q):
        """Static calibrated inverse dynamics, no contact; used for feasibility and feedforward."""
        d=mujoco.MjData(self.model);d.qpos[self.qadr]=q;mujoco.mj_forward(self.model,d)
        required=(d.qfrc_bias-d.qfrc_passive)[self.dof]
        return np.linalg.solve(ARM.T,required)


class LimitedMotor(QDDMotor):
    """Inherited current/rotor dynamics with explicit dissipative stroke/velocity stops."""
    def __init__(self,*args,stroke=.06,velocity=1.,**kwargs):
        super().__init__(*args,**kwargs);self.stroke=stroke;self.velocity=velocity;self.limit_hit=False
        self.command_period=.0001;self.command_clock=1.;self.held_command=0.

    def command_from_reference(self,theta_ref,omega_ref=0.):
        if self.command_clock>=self.command_period-1e-12:
            self.held_command=super().command_from_reference(theta_ref,omega_ref);self.command_clock=0.
        return self.held_command

    def step(self,dt,u,T_in):
        super().step(dt,u,T_in)
        self.command_clock+=dt
        theta=float(np.clip(self.s.theta,-self.stroke/self.p.r_drum,self.stroke/self.p.r_drum))
        omega=float(np.clip(self.s.omega,-self.velocity/self.p.r_drum,self.velocity/self.p.r_drum))
        self.limit_hit=(theta!=self.s.theta or omega!=self.s.omega)
        self.s.theta=theta;self.s.omega=0. if theta in (-self.stroke/self.p.r_drum,self.stroke/self.p.r_drum) else omega


class TendonPort:
    """A causal scalar view; only the owner integrates the shared finger."""
    def __init__(self,finger,index):self.finger=finger;self.index=index;self.tension=0.
    def __getattr__(self,name):return getattr(self.finger,name)
    def tendon_displacement(self):return self.finger.tendon_displacement()[self.index]
    def tendon_length(self):return self.finger.tendon_length()[self.index]
    def tendon_jacobian(self):return self.finger.tendon_jacobian()[self.index]
    def tendon_joint_torque(self):return -self.tendon_jacobian()*self.tension
    def apply_tension(self,T):self.tension=max(0.,float(T))
    def step(self):pass


def channel_config(seed=0,pretension=10.,outer=.0005,plant=.0001,noise=True):
    c=SimConfig(seed=seed);c.finger.timestep=outer;c.timing.plant_dt=plant
    c.cable.pretension=pretension
    c.transmission=dict(specimen=asdict(Specimen(id=f"two-tendon-{seed}")),routing=asdict(FIXTURES["large_guide"]),pretension=pretension)
    c.emulator.effective_mass=.5;c.emulator.force_max=80.;c.emulator.delay=0.
    c.motor.encoder_cpr=16384 if noise else 0
    c.motor.velocity_noise=.002 if noise else 0.;c.motor.current_noise=.005 if noise else 0.
    c.motor.current_colored_noise=.005 if noise else 0.
    c.motor_sensor.filter_tau=.002 if noise else 0.;c.motor_sensor.delay=.001 if noise else 0.
    c.sensors.tension_noise=.02 if noise else 0.
    return c


class TwoTendonSimulator:
    """Two inherited causal two-port chains advance one shared MuJoCo model once."""
    def __init__(self,configs=None,finger_params=None,home=HOME):
        self.configs=copy.deepcopy(configs or [channel_config(0),channel_config(100)])
        p=copy.deepcopy(finger_params or FingerParams(q1_range=(-np.pi/6,np.pi/3),q2_range=(0.,5*np.pi/6),T_max=80.))
        p.timestep=self.configs[0].finger.timestep
        if any(c.finger.timestep!=p.timestep for c in self.configs):raise ValueError("shared outer timestep required")
        self.finger=TwoTendonFinger(p);self.finger.reset(home,[c.cable.pretension for c in self.configs])
        self.chains=[]
        for i,c in enumerate(self.configs):
            chain=TiLSimulator(c);chain.reset()
            motor=LimitedMotor(c.motor,rng=np.random.default_rng(c.seed+1));motor.reset(c.cable.pretension);chain.motor=motor
            chain.finger=TendonPort(self.finger,i);self.chains.append(chain)
        self.t=0.;self.k=0;self.virtual_work=np.zeros(2);self.physical_output_work=np.zeros(2)

    @property
    def dt(self):return self.finger.dt
    @property
    def log_due(self):return self.chains[0].log_due

    def step(self,displacement,velocity=(0.,0.)):
        old=self.finger.tendon_displacement().copy()
        for i,chain in enumerate(self.chains):
            chain.step(float(displacement[i])/chain.motor.p.r_drum,float(velocity[i])/chain.motor.p.r_drum)
        tension=np.array([c.finger.tension for c in self.chains])
        self.finger.apply_tension(tension);self.finger.step()
        delta=self.finger.tendon_displacement()-old
        self.virtual_work+=-tension*delta
        self.physical_output_work=np.array([c.plant.s.W_out for c in self.chains])
        self.t+=self.dt;self.k+=1

    def record(self):
        result={}
        for i,c in enumerate(self.chains,1):
            rec=c.record()
            for namespace in ("motor","emulator","transmission","ground_truth"):result[f"{namespace}{i}"]=rec[namespace]
            result[f"emulator{i}"]["motor_limit_hit"]=float(c.motor.limit_hit)
        f=self.finger;con=f.contact();pos,vel=f.object_state()
        result["simulation"]=dict(joint_positions=f.q,joint_velocities=f.qd,tendon_lengths=f.tendon_length(),
            tendon_jacobian=f.tendon_jacobian(),tendon_joint_torque=f.tendon_joint_torque(),
            applied_tensions=np.array([-f.data.ctrl[a] for a in f.aids]),contact_state=con["contact_state"],
            contact_force=con["contact_force"],contact_location=con["contact_location"],object_position=pos,
            object_velocity=vel,tip_position=f.tip_position())
        result["coupling"]=dict(virtual_work=self.virtual_work.copy(),physical_output_work=self.physical_output_work.copy(),
                                port_work_mismatch=self.virtual_work+self.physical_output_work)
        return result
