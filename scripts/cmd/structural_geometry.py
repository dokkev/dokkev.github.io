"""Rounded hybrid, honeycomb, and solid sections; dimensions in SI outputs."""
import numpy as np

WIDTH, DEPTH, HEIGHT = .030, .012, .014
STOP_TOP = .006
INDENTER_HALF_WIDTH = .017
CARRIER_MM = [[-15,-2],[-15,0],[-3.8,0],[-3.8,6],
              [3.8,6],[3.8,0],[15,0],[15,-2]]
BACKING_MM = [[-15,-2],[-15,0],[15,0],[15,-2]]
KINDS = [('hybrid','Hybrid Structure'),('compliant','Compliant Structure'),('solid','Solid Structure')]


def bonded_nodes(p, kind):
    """Bond all silicone at the common backing plane; Hybrid stem surfaces are also bonded."""
    fixed=np.abs(p[:,2])<1e-8
    if kind=='hybrid':
        fixed |= ((np.abs(np.abs(p[:,0])-.0038)<1e-8)&(p[:,2]>=0)&(p[:,2]<=.006+1e-8))
        fixed |= (np.abs(p[:,2]-.006)<1e-8)&(np.abs(p[:,0])<=.0038+1e-8)
    return fixed


def honeycomb_holes():
    """Pointy hexagonal cells, retained only inside a 1.2 mm outer skin."""
    holes=[]
    for row,z in enumerate([3.,6.65,10.3]):
        for col in range(-3,4):
            x=col*4.2+(2.1 if row%2 else 0)
            angles=np.deg2rad(np.arange(30,390,60))
            poly=np.column_stack([x+1.8*np.cos(angles),z+1.8*np.sin(angles)])
            if all(abs(px)<13.8 and pz>=1.2 and pz<=5+9*np.sqrt(1-(px/15)**2)-1.2 for px,pz in poly):
                holes.append(poly)
    return holes


def pad_mesh(kind, spacing=.0008):
    import gmsh
    gmsh.initialize()
    try:
        gmsh.option.setNumber('General.Terminal',0)
        gmsh.model.add('contact_structure')
        o=gmsh.model.occ
        flat=o.addRectangle(-15,0,-6,30,5)
        ellipse=o.addDisk(0,5,-6,15,9)
        clip=o.addRectangle(-15,5,-6,30,9)
        curved,_=o.intersect([(2,ellipse)],[(2,clip)])
        pad,_=o.fuse([(2,flat)],curved)
        if kind=='hybrid':
            cut=o.addRectangle(-3.8,0,-6,7.6,6)
            pad,_=o.cut(pad,[(2,cut)])
        elif kind=='compliant':
            cuts=[]
            for poly in honeycomb_holes():
                points=[o.addPoint(float(x),float(z),-6) for x,z in poly]
                lines=[o.addLine(points[i],points[(i+1)%6]) for i in range(6)]
                cuts.append((2,o.addPlaneSurface([o.addCurveLoop(lines)])))
            pad,_=o.cut(pad,cuts)
        volume=[t for d,t in o.extrude(pad,0,0,12) if d==3]
        if len(volume)!=1:
            raise RuntimeError('Specimen must be a connected body')
        o.synchronize()
        gmsh.option.setNumber('Mesh.MeshSizeMin',spacing*1000)
        gmsh.option.setNumber('Mesh.MeshSizeMax',spacing*1000)
        gmsh.model.mesh.generate(3)
        tags,xyz,_=gmsh.model.mesh.getNodes()
        lookup={int(tag):i for i,tag in enumerate(tags)}
        xyz=np.array(xyz).reshape(-1,3)
        positions=xyz[:,[0,2,1]]*.001
        types,_,nodes=gmsh.model.mesh.getElements(3,volume[0])
        raw=next(n for t,n in zip(types,nodes) if t==4)
        tets=np.array([lookup[int(n)] for n in raw],dtype=np.int32).reshape(-1,4)
        det=np.linalg.det((positions[tets[:,1:]]-positions[tets[:,0],None,:]).transpose(0,2,1))
        bad=det<0
        tets[bad,1],tets[bad,2]=tets[bad,2].copy(),tets[bad,1].copy()
        return positions,tets
    finally:
        gmsh.finalize()

def front_triangles(positions,tets):
    # One exterior face: y = -DEPTH/2; shared faces are removed by counting.
    faces = {}
    for tet in tets:
        for face in [(tet[0],tet[2],tet[1]),(tet[0],tet[1],tet[3]),(tet[0],tet[3],tet[2]),(tet[1],tet[2],tet[3])]:
            key = tuple(sorted(face))
            faces[key] = None if key in faces else list(face)
    return [f for f in faces.values() if f is not None and np.all(np.abs(positions[f,1]+DEPTH/2)<1e-8)]


def write_vtk(path,positions,tets):
    with path.open('w') as stream:
        stream.write('# vtk DataFile Version 3.0\nCMD structural contact specimen\nASCII\nDATASET UNSTRUCTURED_GRID\n')
        stream.write(f'POINTS {len(positions)} double\n')
        for row in positions:
            stream.write(' '.join(map(str,row))+'\n')
        stream.write(f'CELLS {len(tets)} {len(tets)*5}\n')
        for row in tets:
            stream.write('4 '+' '.join(map(str,row))+'\n')
        stream.write(f'CELL_TYPES {len(tets)}\n')
        stream.write('10\n'*len(tets))
