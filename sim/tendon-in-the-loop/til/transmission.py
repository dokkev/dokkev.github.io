"""Phase 2 dimensioned, unilateral viscoelastic two-port transmission.

Rigid fixed guides are condensed into two axial segments and one equivalent moving pulley.
This is a lumped numerical reference, not a distributed cable/guide contact solver.
"""
from dataclasses import dataclass, field, asdict
from math import pi, exp, tanh, sqrt

import numpy as np


@dataclass
class Routing:
    fixture_id: str = "large_guide"
    segment_lengths_m: tuple = (.2, .2)  # free spans; arc length is added separately
    guide_radii_m: tuple = (.03,)
    wrap_angles_rad: tuple = (pi/2,)
    guide_material_ids: tuple = ("hypothetical_polymer",)
    bearing_types: tuple = ("fixed_sliding_guide",)
    alignment_offsets_m: tuple = ()  # no unsupported alignment-loss law

    def __post_init__(self):
        if len(self.guide_radii_m) != len(self.wrap_angles_rad) or min(self.segment_lengths_m) <= 0:
            raise ValueError("invalid routing dimensions")
        if any(r <= 0 for r in self.guide_radii_m) or any(b < 0 for b in self.wrap_angles_rad):
            raise ValueError("radius must be positive and wrap nonnegative")

    @property
    def lengths(self):
        arc = sum(r*b for r, b in zip(self.guide_radii_m, self.wrap_angles_rad))
        return (self.segment_lengths_m[0]+arc/2, sum(self.segment_lengths_m[1:])+arc/2)


FIXTURES = {
    "straight": Routing("straight", (.2,.2), (), (), (), ()),
    "large_guide": Routing(),
    "small_guide": Routing("small_guide", (.2,.2), (.01,), (pi/2,)),
    "two_guides": Routing("two_guides", (.15,.18,.12), (.015,.025), (pi/2,pi/2),
                          ("hypothetical_polymer",)*2, ("fixed_sliding_guide",)*2),
    "wide_wrap": Routing("wide_wrap", (.22,.18), (.02,), (pi,)),
}


@dataclass
class Specimen:
    id: str = "hypothetical_A"
    material_id: str = "hypothetical_effective_fiber"
    diameter_m: float = .0005
    modulus_pa: float = 1e10  # effective, hypothetical; no measured material claim
    nonlinear_strain_coefficient: float = 400.
    maxwell_ratio: float = .35
    relaxation_time_s: float = .5
    damping_Ns_per_m: float = 1.
    friction_mu: float = .05
    presliding_stiffness_Nm_per_rad: float = 2.
    bending_loss_Nm: float = 1e-4  # phenomenological force coefficient times sum(beta/r)
    creep_rate_m_per_s: float = 0.
    creep_threshold_N: float = 12.
    creep_reference_N: float = 30.
    settle_rate_m_per_Ns: float = 0.
    settle_cap_m: float = .0004
    conditioning_per_m: float = 0.
    stiffness_loss_fraction: float = .15
    friction_growth_fraction: float = .5

    def __post_init__(self):
        if min(self.diameter_m, self.modulus_pa, self.relaxation_time_s, self.presliding_stiffness_Nm_per_rad) <= 0:
            raise ValueError("specimen dimensions, modulus and time scales must be positive")
        if not 0 <= self.stiffness_loss_fraction < 1 or min(self.maxwell_ratio, self.friction_mu, self.creep_rate_m_per_s) < 0:
            raise ValueError("invalid constitutive parameters")


@dataclass
class TransmissionParams:
    specimen: Specimen = field(default_factory=Specimen)
    routing: Routing = field(default_factory=Routing)
    pretension: float = 10.
    R_p: float = .02
    J_p: float = 2e-6
    bearing_viscous: float = 1e-5
    bearing_coulomb: float = .001
    friction: str = "presliding"  # or regularized sliding reference
    static_ratio: float = 1.
    taut_transition_m: float = 0.  # optional regularized dashpot engagement; 0 keeps original taut model
    stribeck_rad_per_s: float = .02
    initial_history: dict = field(default_factory=dict)
    intervention_time_s: float = -1.
    intervention_slack_m: float = 0.
    intervention_stiffness_factor: float = 1.

    @classmethod
    def from_dict(cls, values):
        d = dict(values)
        d["specimen"] = Specimen(**d.get("specimen", {}))
        d["routing"] = Routing(**d.get("routing", {}))
        return cls(**d)


@dataclass
class TransmissionState:
    phi: float = 0.
    phi_d: float = 0.
    z: float = 0.  # presliding angular spring deflection
    v1: float = 0.  # recoverable delayed extension
    v2: float = 0.
    settle: float = 0.
    creep: float = 0.
    d: float = 0.
    sliding_distance: float = 0.
    t: float = 0.
    T1: float = 0.
    T2: float = 0.
    delta1: float = 0.
    delta2: float = 0.
    tau_f: float = 0.
    P_diss: float = 0.
    E_diss: float = 0.
    W_in: float = 0.
    W_out: float = 0.
    W_parameter: float = 0.
    E_aging: float = 0.
    intervention_done: float = 0.


class TransmissionPlant:
    def __init__(self, params=None):
        self.p = params or TransmissionParams()
        p, m = self.p, self.p.specimen
        self.lengths = p.routing.lengths
        EA = m.modulus_pa*pi*m.diameter_m**2/4
        self.k = (EA/self.lengths[0], EA/self.lengths[1])
        self.k3 = tuple(m.nonlinear_strain_coefficient*k/L**2 for k,L in zip(self.k,self.lengths))
        self.reset()

    @property
    def factor(self):
        return (1-self.p.specimen.stiffness_loss_fraction*self.s.d) * self._intervention_factor

    @property
    def k_eff(self):
        return 2/(1/self.k[0]+1/self.k[1])*self.factor

    def reset(self):
        p = self.p
        self.s = TransmissionState(**{k: float(v) for k,v in p.initial_history.items()})
        self._intervention_factor = 1.
        self.e0 = []
        for k,k3 in zip(self.k,self.k3):
            lo, hi = 0., p.pretension/(k*self.factor)
            for _ in range(55):
                e = (lo+hi)/2
                if self.factor*(k*e+k3*e**3) < p.pretension:
                    lo=e
                else:
                    hi=e
            self.e0.append((lo+hi)/2)
        # Re-tensioned/calibrated session zero; accumulated history remains recorded.
        self._history_origin = self.s.creep+self.s.settle
        self.s.v1, self.s.v2 = self.e0
        self.s.T1=self.s.T2=p.pretension
        self._prev_x=(0.,0.)
        self._stored = self._energy(0.,0.)
        self.initial_energy=self._stored

    def _extensions(self, x1,x2,phi=None):
        if phi is None: phi=self.s.phi
        return (max(0., x1-self.p.R_p*phi+self.e0[0]),
                max(0., x2+self.p.R_p*phi+self.e0[1]-(self.s.creep+self.s.settle-self._history_origin)))

    def _segment(self, e, velocity, old_v, index, dt):
        m=self.p.specimen
        v=(old_v+dt/m.relaxation_time_s*e)/(1+dt/m.relaxation_time_s)
        km=m.maxwell_ratio*self.k[index]
        delayed=max(0.,e-v)
        elastic=self.factor*(self.k[index]*e+self.k3[index]*e**3)+km*delayed
        activation=min(1.,e/self.p.taut_transition_m) if self.p.taut_transition_m>0 else 1.
        tension=max(0.,elastic+m.damping_Ns_per_m*activation*velocity) if e>0 else 0.
        tangent=self.factor*(self.k[index]+3*self.k3[index]*e*e)+(km/(1+dt/m.relaxation_time_s) if delayed>0 else 0.)
        return tension,elastic,tangent,v

    def _energy(self,x1,x2):
        m=self.p.specimen
        e=self._extensions(x1,x2)
        total=.5*self.p.J_p*self.s.phi_d**2+.5*m.presliding_stiffness_Nm_per_rad*self.s.z**2
        for i,v in enumerate((self.s.v1,self.s.v2)):
            total+=self.factor*(.5*self.k[i]*e[i]**2+.25*self.k3[i]*e[i]**4)
            total+=.5*m.maxwell_ratio*self.k[i]*max(0.,e[i]-v)**2
        return total

    def _friction(self, velocity, tension_sum, dt):
        p,m=self.p,self.p.specimen
        mu=m.friction_mu*(1+m.friction_growth_fraction*self.s.d)
        beta=sum(p.routing.wrap_angles_rad)
        # |T1-T2|/(T1+T2) <= tanh(mu*beta/2) for the isolated ideal static guide limit.
        level=p.R_p*tension_sum*tanh(mu*beta/2)+p.bearing_coulomb
        level+=p.R_p*m.bending_loss_Nm*sum(b/r for b,r in zip(p.routing.wrap_angles_rad,p.routing.guide_radii_m))
        level*=1+(p.static_ratio-1)*exp(-(velocity/p.stribeck_rad_per_s)**2)
        ks=m.presliding_stiffness_Nm_per_rad
        if p.friction=="sliding":
            torque=level*tanh(velocity/.01)
            return torque,0.,0.,max(0.,torque*velocity*dt)
        trial=ks*(self.s.z+dt*velocity)
        torque=max(-level,min(level,trial))
        z=torque/ks
        tangent=ks*dt if abs(trial)<level else 0.
        plastic=dt*velocity-(z-self.s.z)
        return torque,z,tangent,max(0.,torque*plastic)

    def step(self,dt,x_in,xd_in,x_out,xd_out):
        p,m,s=self.p,self.p.specimen,self.s
        phi0,omega0=s.phi,s.phi_d
        v=s.phi_d
        def evaluate(w):
            phi=phi0+dt*w
            e1,e2=self._extensions(x_in,x_out,phi)
            a=self._segment(e1,xd_in-p.R_p*w,s.v1,0,dt)
            b=self._segment(e2,xd_out+p.R_p*w,s.v2,1,dt)
            f=self._friction(w,a[0]+b[0],dt)
            residual=p.J_p*(w-omega0)/dt-p.R_p*(a[0]-b[0])+f[0]+p.bearing_viscous*w
            jac=p.J_p/dt+p.R_p**2*(dt*(a[2]+b[2])+2*m.damping_Ns_per_m)+f[2]+p.bearing_viscous
            return residual,jac,a,b,f,e1,e2
        for _ in range(18):
            result=evaluate(v)
            if abs(result[0])<1e-10: break
            v-=result[0]/result[1]
        else:
            lo,hi=-max(10.,abs(v)*2),max(10.,abs(v)*2)
            for _ in range(20):
                if evaluate(lo)[0]<=0<=evaluate(hi)[0]: break
                lo*=2; hi*=2
            for _ in range(45):
                v=(lo+hi)/2
                if evaluate(v)[0]>0: hi=v
                else: lo=v
        residual,_,a,b,f,e1,e2=evaluate(v)
        if not np.isfinite(v) or abs(residual)>1e-6:
            raise FloatingPointError(f"pulley solve failed: residual={residual}")
        s.phi_d=v; s.phi=phi0+dt*v
        old_T1,old_T2=s.T1,s.T2
        s.v1,s.v2=a[3],b[3]
        s.z=f[1]
        vel1,vel2=xd_in-p.R_p*v,xd_out+p.R_p*v
        visc=max(0.,(a[0]-a[1])*vel1+(b[0]-b[1])*vel2)*dt
        relax=m.maxwell_ratio*(self.k[0]*max(0.,e1-s.v1)**2+self.k[1]*max(0.,e2-s.v2)**2)/m.relaxation_time_s*dt
        diss=visc+relax+f[3]+p.bearing_viscous*v*v*dt
        s.E_diss+=diss
        before=self._energy(x_in,x_out)
        if b[0]>m.creep_threshold_N:
            s.creep+=dt*m.creep_rate_m_per_s*(b[0]/m.creep_reference_N)**2
            if m.settle_cap_m>0:
                s.settle+=dt*m.settle_rate_m_per_Ns*(b[0]-m.creep_threshold_N)*max(0.,1-s.settle/m.settle_cap_m)
        after_rest=self._energy(x_in,x_out)
        s.E_aging+=max(0.,before-after_rest)
        s.sliding_distance+=abs(p.R_p*v)*dt
        s.d=min(1.,s.d+m.conditioning_per_m*abs(p.R_p*v)*dt)
        after_age=self._energy(x_in,x_out)
        s.W_parameter+=after_age-after_rest
        s.t+=dt
        if p.intervention_time_s>=0 and s.t>=p.intervention_time_s and not s.intervention_done:
            pre=self._energy(x_in,x_out)
            s.creep+=p.intervention_slack_m
            self._intervention_factor=p.intervention_stiffness_factor
            s.intervention_done=1.
            s.W_parameter+=self._energy(x_in,x_out)-pre
        # Recompute force after slow reference/parameter changes, holding internal states fixed.
        e=self._extensions(x_in,x_out)
        tensions=[]
        for i,sv in enumerate((s.v1,s.v2)):
            elastic=self.factor*(self.k[i]*e[i]+self.k3[i]*e[i]**3)+m.maxwell_ratio*self.k[i]*max(0.,e[i]-sv)
            velocity=vel1 if i==0 else vel2
            activation=min(1.,e[i]/p.taut_transition_m) if p.taut_transition_m>0 else 1.
            tensions.append(max(0.,elastic+m.damping_Ns_per_m*activation*velocity) if e[i]>0 else 0.)
        s.T1,s.T2=tensions
        s.delta1,s.delta2=e
        s.tau_f=f[0]+p.bearing_viscous*v
        s.P_diss=diss/dt
        s.W_in+=.5*(old_T1+s.T1)*(x_in-self._prev_x[0])
        s.W_out+=.5*(old_T2+s.T2)*(x_out-self._prev_x[1])
        self._prev_x=(x_in,x_out)
        self._stored=self._energy(x_in,x_out)
        return s.T1,s.T2

    def stored_energy(self): return self._stored

    def ground_truth(self):
        s,m=self.s,self.p.specimen
        residual=s.W_in+s.W_out+s.W_parameter-(self._stored-self.initial_energy)-s.E_diss-s.E_aging
        return dict(cable_segment_extensions=np.array([s.delta1,s.delta2]),
                    cable_segment_strains=np.array([s.delta1/self.lengths[0],s.delta2/self.lengths[1]]),
                    viscoelastic_state=np.array([s.v1,s.v2]), friction_state=s.z,
                    friction_torque=s.tau_f,effective_stiffness=self.k_eff,
                    effective_friction=m.friction_mu*(1+m.friction_growth_fraction*s.d),
                    slack_state=np.array([s.T1<=0,s.T2<=0],dtype=float),settle_state=s.settle,
                    creep_state=s.creep,degradation_state=s.d,dissipated_energy=s.E_diss,
                    stored_energy=self._stored,parameter_work=s.W_parameter,aging_dissipation=s.E_aging,
                    energy_residual=residual,sliding_distance=s.sliding_distance,
                    effective_reference_length=sum(self.lengths)+s.creep+s.settle,
                    intervention_state=s.intervention_done)
