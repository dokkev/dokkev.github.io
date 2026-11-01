"""Newton VBD displacement-controlled compression of hybrid, honeycomb, and solid structures.

Illustrative stable Neo-Hookean specimens, not fitted material or hardware data.
World z is up. A kinematic indenter follows a prescribed trajectory.
Mass-proportional velocity damping is applied before each step. Backing-plane silicone nodes are fixed.
"""
import os
from pathlib import Path

os.environ.setdefault('WARP_CACHE_PATH', str(Path.home()/'.cache/warp-cmd-blog'))
import newton
import numpy as np
import warp as wp

from structural_geometry import DEPTH,HEIGHT,INDENTER_HALF_WIDTH,bonded_nodes,pad_mesh,front_triangles

ROOT = Path(__file__).resolve().parents[2]
DT = .0005
MODULUS = 1e5
POISSON = .35
PARTICLE_RADIUS = .000005
CONTACT_KE = 5000.
DAMPING_RATE = 200.


@wp.kernel
def damp_velocity(velocity: wp.array[wp.vec3], factor:float):
    i = wp.tid()
    velocity[i] *= factor


class Compression:
    def __init__(self,kind,iterations=30,full_surface=False,friction=0.):
        self.kind = kind
        self.rest,self.tets = pad_mesh(kind)
        self.fixed = bonded_nodes(self.rest,kind)
        self.rest_inverse = np.linalg.inv((self.rest[self.tets[:,1:]]-self.rest[self.tets[:,0],None,:]).transpose(0,2,1))
        builder = newton.ModelBuilder(gravity=(0.,0.,0.))
        mu = MODULUS/(2*(1+POISSON))
        lam = MODULUS*POISSON/((1+POISSON)*(1-2*POISSON))
        builder.add_soft_mesh(pos=(0,0,0),rot=wp.quat_identity(),scale=1.,vel=(0,0,0),
            vertices=self.rest.tolist(),indices=self.tets.ravel().tolist(),density=1000.,
            k_mu=mu,k_lambda=lam,k_damp=.01,particle_radius=PARTICLE_RADIUS)
        for i in np.flatnonzero(self.fixed):
            builder.particle_mass[i] = 0.
        cfg = newton.ModelBuilder.ShapeConfig(ke=CONTACT_KE,kd=0.,mu=friction,density=0.)
        indenter = builder.add_body(xform=wp.transform(wp.vec3(0,0,HEIGHT+.025+PARTICLE_RADIUS),wp.quat_identity()),is_kinematic=True)
        builder.add_shape_box(indenter,hx=INDENTER_HALF_WIDTH,hy=DEPTH/2+.01,hz=.025,cfg=cfg)
        cfg = newton.ModelBuilder.ShapeConfig(ke=CONTACT_KE,kd=0.,mu=0.,density=0.)
        # Common backing bar, with a connected central stem only for Hybrid.
        boxes=[(.015,-.002,0.)]
        if kind=='hybrid':
            boxes.append((.0038,0.,.006))
        for hx,lo,hi in boxes:
            builder.add_shape_box(-1,xform=wp.transform(wp.vec3(0,0,(lo+hi)/2),wp.quat_identity()),
                hx=hx,hy=DEPTH/2+.001,hz=(hi-lo)/2,cfg=cfg)
        builder.color()
        self.model = builder.finalize(device='cuda:0')
        self.model.soft_contact_ke = CONTACT_KE
        self.model.soft_contact_kd = 0.
        self.model.soft_contact_mu = friction
        self.a,self.b = self.model.state(),self.model.state()
        self.control = self.model.control()
        self.pipeline = newton.CollisionPipeline(self.model,soft_contact_gap=.0005,enable_rigid_soft_full_surface_contact=full_surface)
        self.contacts = self.pipeline.contacts()
        self.solver = newton.solvers.SolverVBD(self.model,iterations=iterations,
            rigid_body_particle_contact_buffer_size=4096,rigid_compliant_alm=False,friction_epsilon=.0001)
        self.step();self.step()
        faces = np.array(front_triangles(self.rest,self.tets))
        self.front_ids = np.unique(faces)
        lookup = {int(n):i for i,n in enumerate(self.front_ids)}
        self.front_faces = [[lookup[int(n)] for n in face] for face in faces]

    def step(self):
        wp.launch(damp_velocity,dim=self.model.particle_count,
            inputs=[self.a.particle_qd,float(np.exp(-DAMPING_RATE*DT))],device=self.model.device)
        self.a.clear_forces()
        self.pipeline.collide(self.a,self.contacts)
        self.solver.step(self.a,self.b,self.control,self.contacts,DT)
        self.a,self.b = self.b,self.a

