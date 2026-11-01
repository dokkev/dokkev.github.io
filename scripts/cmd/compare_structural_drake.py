"""Nominal-geometry hydroelastic comparison; no structural deformation solve."""
import json
from importlib.metadata import version
from pathlib import Path

import numpy as np
from pydrake.geometry import (SceneGraph,GeometryFrame,GeometryInstance,Mesh,Box,
    ProximityProperties,AddCompliantHydroelasticProperties,AddRigidHydroelasticProperties,
    FramePoseVector,HydroelasticContactRepresentation)
from pydrake.math import RigidTransform
from structural_geometry import HEIGHT,DEPTH,INDENTER_HALF_WIDTH

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT/'scripts/cmd/meshes/structural-loading.json'


class HydroContact:
    def __init__(self,path,modulus):
        self.scene = SceneGraph()
        source = self.scene.RegisterSource('indenter')
        self.frame = self.scene.RegisterFrame(source,GeometryFrame('indenter'))
        p = ProximityProperties()
        AddRigidHydroelasticProperties(.001,p)
        geom = GeometryInstance(RigidTransform(),Box(2*INDENTER_HALF_WIDTH,DEPTH+.02,.05),'indenter')
        geom.set_proximity_properties(p)
        self.scene.RegisterGeometry(source,self.frame,geom)
        p = ProximityProperties()
        AddCompliantHydroelasticProperties(.001,modulus,p)
        geom = GeometryInstance(RigidTransform(),Mesh(str(path)),'pad')
        geom.set_proximity_properties(p)
        self.scene.RegisterAnchoredGeometry(source,geom)
        self.context = self.scene.CreateDefaultContext()
        self.port = self.scene.get_source_pose_port(source)

    def force(self,delta):
        poses = FramePoseVector()
        poses.set_value(self.frame,RigidTransform([0,0,HEIGHT+.025-delta]))
        self.port.FixValue(self.context,poses)
        surfaces = self.scene.get_query_output_port().Eval(self.context).ComputeContactSurfaces(HydroelasticContactRepresentation.kTriangle)
        force = 0.
        for surface in surfaces:
            mesh,field = surface.tri_mesh_W(),surface.tri_e_MN()
            # Flat lower indenter face is the normal-load contact. Side faces
            # contribute zero z traction; retain signed normal orientation.
            for i in range(mesh.num_triangles()):
                normal_z = abs(mesh.face_normal(i)[2])
                force += normal_z*mesh.area(i)*sum(field.EvaluateAtVertex(mesh.element(i).vertex(j)) for j in range(3))/3
        return float(force)


def main():
    data = json.loads(OUTPUT.read_text())
    bulk = next(c for c in data['cases'] if c['kind']=='solid')
    reference_delta = .0005
    frames=bulk['runs']['normal']['frames']
    reference_force = float(np.interp(reference_delta,[f['indentation'] for f in frames],[f['force'] for f in frames]))
    trial = HydroContact(ROOT/'scripts/cmd/meshes/solid.vtk',1e5)
    trial_force = trial.force(reference_delta)
    if trial_force <= 0:
        raise RuntimeError('No hydroelastic surface at calibration point')
    modulus = 1e5*reference_force/trial_force
    for case in data['cases']:
        filename=case['kind']
        contact = HydroContact(ROOT/f'scripts/cmd/meshes/{filename}.vtk',modulus)
        # Restrict the nominal-geometry contact query to 1 mm. Hydroelastic
        # queries do not solve the cellular deformation or internal support interaction.
        case['drake_curve'] = [{'indentation':float(d),'force':contact.force(float(d))} for d in np.linspace(0,.001,21)]
    data['metadata']['drake'] = {'version':version('drake'),'hydroelastic_modulus':modulus,
        'calibration':'Match Solid Structure Newton normal force at 0.5 mm only; same modulus applied to all three shapes',
        'range_max':.001,'reference_indentation':reference_delta,'reference_force':reference_force,
        'model':'Elastic pressure-field contact on undeformed tetrahedral geometry; no structural load path'}
    OUTPUT.write_text(json.dumps(data,separators=(',',':'),allow_nan=False)+'\n')
    print('Drake modulus',modulus,'calibration F',reference_force)
    for case in data['cases']:
        print(case['name'],'Drake 1mm',case['drake_curve'][-1]['force'])


if __name__ == '__main__':
    main()
