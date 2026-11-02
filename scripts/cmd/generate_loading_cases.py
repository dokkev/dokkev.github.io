"""Computed normal, cyclic, and frictional lateral loading with patch estimates."""
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
import numpy as np
import warp as wp
from generate_structural_contact import Compression,DT,HEIGHT,PARTICLE_RADIUS,ROOT
from structural_geometry import CARRIER_MM,BACKING_MM,KINDS,write_vtk

FRICTION=.6
DURATIONS={'normal':1.2,'cyclic':4.,'lateral':2.6}

@wp.kernel
def prescribe(pose:wp.array[wp.transform], time:wp.array[float], mode:int):
    t=time[0]+DT
    time[0]=t
    shift=float(0.)
    delta=float(0.)
    if mode==0:
        u=wp.clamp(t/1.2,0.,1.)
        delta=.0024*u*u*(3.-2.*u)
    elif mode==1:
        delta=.0012*(1.-wp.cos(wp.pi*t))
    else:
        u=wp.clamp(t/.6,0.,1.)
        delta=.0015*u*u*(3.-2.*u)
        v=wp.clamp((t-.6)/2.,0.,1.)
        shift=.003*v*v*(3.-2.*v)
    pose[0]=wp.transform(wp.vec3(shift,0.,HEIGHT+.025+PARTICLE_RADIUS-delta),wp.quat_identity())


def exterior_faces(tets):
    faces={}
    for a,b,c,d in tets:
        for f in [(a,c,b),(a,b,d),(a,d,c),(b,c,d)]:
            key=tuple(sorted(f))
            faces[key]=None if key in faces else f
    return np.array([f for f in faces.values() if f is not None])


def clip_patch(tri,height):
    """Clip a linear surface triangle to the platen plane + contact radius."""
    out=[]
    previous=tri[-1]
    gp=previous[2]+PARTICLE_RADIUS-height
    for current in tri:
        gc=current[2]+PARTICLE_RADIUS-height
        if (gc>0)!=(gp>0):
            out.append(previous+(current-previous)*(gp/(gp-gc)))
        if gc>0:
            out.append(current)
        previous,gp=current,gc
    return np.array(out)


class Loading(Compression):
    def __init__(self,kind,mode):
        self.ready=False
        super().__init__(kind,friction=FRICTION)
        self.clock=wp.zeros(1,dtype=float,device=self.model.device)
        self.loading_mode=list(DURATIONS).index(mode)
        self.previous_body=wp.clone(self.a.body_q)
        self.surface_faces=exterior_faces(self.tets)
        self.ready=True
        with wp.ScopedCapture(device=self.model.device) as capture:
            for _ in range(10):
                self.step()
        self.loading_graph=capture.graph

    def step(self):
        if self.ready:
            wp.copy(self.previous_body,self.solver.body_q_prev)
            wp.launch(prescribe,dim=1,inputs=[self.a.body_q,self.clock,self.loading_mode],device=self.model.device)
        super().step()

    def snapshot(self):
        pos=self.a.particle_q.numpy()
        count=int(self.contacts.soft_contact_count.numpy()[0])
        if count>=self.contacts.soft_contact_max:
            raise RuntimeError('Contact capacity reached')
        corners=self.contacts.soft_contact_indices.numpy()[:count]
        bary=self.contacts.soft_contact_barycentric.numpy()[:count]
        safe=np.maximum(corners,0)
        point=np.sum(pos[safe]*bary[:,:,None]*(corners>=0)[:,:,None],axis=1)
        prev=self.solver.particle_q_prev.numpy()
        prev_point=np.sum(prev[safe]*bary[:,:,None]*(corners>=0)[:,:,None],axis=1)
        shapes=self.contacts.soft_contact_shape.numpy()[:count]
        bodies=self.model.shape_body.numpy()[shapes]
        rigid=self.contacts.soft_contact_body_pos.numpy()[:count].copy()
        attached=bodies>=0
        poses=self.a.body_q.numpy()
        rigid[attached]+=poses[bodies[attached],:3]
        n=self.contacts.soft_contact_normal.numpy()[:count]
        depth=np.maximum(0,-np.sum(n*(point-rigid),axis=1)+PARTICLE_RADIUS)
        ke=self.solver.body_particle_contact_penalty_k.numpy()[:count]
        mu=self.solver.body_particle_contact_material_mu.numpy()[:count]
        fn=ke*depth
        rigid_step=np.zeros_like(point)
        rigid_step[attached]=poses[bodies[attached],:3]-self.previous_body.numpy()[bodies[attached],:3]
        slip=point-prev_point-rigid_step
        tangent=slip-n*np.sum(slip*n,axis=1)[:,None]
        length=np.linalg.norm(tangent,axis=1)
        eps=self.solver.friction_epsilon*DT
        # Newton 1.6 continues reciprocal slip linearly below eps with
        # matching value and slope; this is not 1/max(length,eps).
        scale=np.where(length>eps,1/np.maximum(length,eps),(2-length/eps)/eps)
        force=n*fn[:,None]-tangent*(mu*fn*scale)[:,None]
        force[np.all((corners<0)|self.fixed[safe],axis=1)]=0
        platen=shapes==0
        reaction=-force[platen].sum(axis=0)
        active=platen&(depth>1e-9)&(fn>1e-7)
        nodes=np.zeros(len(pos))
        for k in range(3):
            valid=active&(corners[:,k]>=0)
            np.add.at(nodes,corners[valid,k],fn[valid]*bary[valid,k])
        height=float(poses[0,2]-.025)
        patches=[]
        area=0.
        surface=pos[self.surface_faces]
        normals=np.cross(surface[:,1]-surface[:,0],surface[:,2]-surface[:,0])
        candidate=(normals[:,2]>0)&(surface[:,:,2].max(axis=1)+PARTICLE_RADIUS>height)
        for tri in surface[candidate]:
            poly=clip_patch(tri,height)
            if len(poly)<3:
                continue
            xy=poly[:,:2]*1000
            a=abs(np.dot(xy[:,0],np.roll(xy[:,1],1))-np.dot(xy[:,1],np.roll(xy[:,0],1)))/2
            if a>1e-8:
                patches.append(np.round(xy,4).tolist());area+=a
        F=(pos[self.tets[:,1:]]-pos[self.tets[:,0],None,:]).transpose(0,2,1)@self.rest_inverse
        min_j=float(np.linalg.det(F).min())
        if min_j<.15 or not np.isfinite(pos).all():
            raise RuntimeError(f'Invalid element: Jmin={min_j}')
        ids=np.flatnonzero(nodes>1e-7)
        # Preserve surface adjacency: fill only outward faces whose three
        # vertices carry active platen contact. Mixed faces remain unresolved.
        active_vertices=nodes>1e-7
        active_counts=active_vertices[self.surface_faces].sum(axis=1)
        facing=normals[:,2]>0
        contact_faces=self.surface_faces[facing&(active_counts==3)]
        partial_faces=int(np.count_nonzero(facing&(active_counts>0)&(active_counts<3)))
        lookup=np.full(len(pos),-1,dtype=int)
        lookup[ids]=np.arange(len(ids))
        face_normals=np.cross(pos[contact_faces[:,1]]-pos[contact_faces[:,0]],
                              pos[contact_faces[:,2]]-pos[contact_faces[:,0]])
        contact_area=float(face_normals[:,2].sum()*.5e6)
        return {'time':float(self.clock.numpy()[0]),'indentation':float(HEIGHT+PARTICLE_RADIUS-height),
            'lateral_displacement':float(poses[0,0]),'force':float(reaction[2]),'lateral_force':float(reaction[0]),
            'contact_faces':lookup[contact_faces].tolist(),'contact_area_mm2':contact_area,
            'partial_contact_faces':partial_faces,
            'min_jacobian':min_j,'patch_area_mm2':float(area),'contact_patch':patches,
            'contact_nodes':np.round(np.column_stack([pos[ids,:2]*1000,nodes[ids]]),6).tolist(),
            'front_positions':np.round(pos[self.front_ids][:,[0,2]]*1000,5).tolist()}


def main():
    cases=[]
    mesh_dir=ROOT/'scripts/cmd/meshes'
    mesh_dir.mkdir(exist_ok=True)
    for kind,name in KINDS:
        runs={}
        for mode,duration in DURATIONS.items():
            sim=Loading(kind,mode)
            frames=[sim.snapshot()]
            for index in range(round(duration/.05)):
                for _ in range(10):
                    wp.capture_launch(sim.loading_graph)
                frames.append(sim.snapshot())
                if index%10==0:
                    f=frames[-1]
                    print(kind,mode,f"t={f['time']:.2f} Fn={f['force']:.4f} Ft={f['lateral_force']:.4f} patch={f['patch_area_mm2']:.2f} Jmin={f['min_jacobian']:.3f}",flush=True)
            runs[mode]={'duration':duration,'frames':frames}
        write_vtk(mesh_dir/f'{kind}.vtk',sim.rest,sim.tets)
        cases.append({'name':name,'kind':kind,'particle_count':len(sim.rest),'tet_count':len(sim.tets),
            'rest_front':np.round(sim.rest[sim.front_ids][:,[0,2]]*1000,5).tolist(),
            'front_faces':sim.front_faces,'carrier_polygon':CARRIER_MM if kind=='hybrid' else BACKING_MM,'runs':runs})
    metadata={'newton_version':version('newton'),'warp_version':version('warp-lang'),
        'young_modulus':1e5,'poisson_ratio':.35,'friction':FRICTION,'friction_velocity_epsilon':.0001,
        'dt':DT,'iterations':30,'sample_period':.05,'mesh_spacing':.0008,
        'contact_surface_method':'Original outward boundary triangles with all three vertices carrying active platen normal force > 1e-7 N; projected area; mixed triangles omitted',
        'contact_force_threshold':1e-7,
        'patch_method':'Projected boundary triangles clipped at platen plane including 5 um contact radius; mesh-dependent estimate',
        'geometry':'Hybrid: bonded embedded T carrier, no void. Compliant: 14 hexagonal channels. Solid: filled envelope.',
        'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'geometry_sha256':hashlib.sha256(Path(__file__).with_name('structural_geometry.py').read_bytes()).hexdigest()}
    output=ROOT/'scripts/cmd/meshes/structural-loading.json'
    output.write_text(json.dumps({'metadata':metadata,'cases':cases},separators=(',',':'),allow_nan=False)+'\n')
    print('Saved',output,flush=True)

if __name__=='__main__':
    main()
