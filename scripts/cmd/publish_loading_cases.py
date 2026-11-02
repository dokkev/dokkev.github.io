"""Compact display geometry and publish one JSON recording per loading case."""
import json
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'scripts/cmd/meshes/structural-loading.json'
OUTPUT=ROOT/'public/assets/demos/cmd'


def main():
    raw=json.loads(SOURCE.read_text())
    largest_error=0.
    for mode in ['normal','cyclic','lateral']:
        cases=[]
        for case in raw['cases']:
            run=case['runs'][mode]
            frames=[]
            for f in run['frames']:
                polygons=[shapely.set_precision(shapely.make_valid(Polygon(p)),.001) for p in f['contact_patch']]
                footprint=shapely.union_all(polygons).simplify(.002,preserve_topology=True)
                rings=[]
                if not footprint.is_empty:
                    for p in ([footprint] if footprint.geom_type=='Polygon' else footprint.geoms):
                        if p.geom_type!='Polygon':
                            continue
                        p=orient(p,sign=1.)
                        rings.extend(np.round(np.asarray(r.coords)[:-1],3).tolist() for r in [p.exterior,*p.interiors])
                largest_error=max(largest_error,abs(footprint.area-f['patch_area_mm2']))
                frames.append({**f,'front_positions':np.round(f['front_positions'],3).tolist(),
                    'contact_patch':rings,'contact_nodes':[[round(x,3),round(y,3),v] for x,y,v in f['contact_nodes']]})
            cases.append({**case,'runs':{mode:{**run,'frames':frames}}})
        metadata={**raw['metadata'],
            'contact_surface_display':'Original fully active boundary triangles indexed into contact_nodes; mean nodal normal force sets fill opacity; partial-contact faces omitted',
            'patch_display':'Unioned rings with even-odd fill; snapped at 0.001 mm and simplified at 0.002 mm. Reported area uses original clipped triangles.'}
        path=OUTPUT/f'structural-{mode}.json'
        path.write_text(json.dumps({'metadata':metadata,'cases':cases},separators=(',',':'),allow_nan=False)+'\n')
        print(path.name,path.stat().st_size,'bytes',flush=True)
    if largest_error>.1:
        raise RuntimeError(f'Patch outline differs excessively: {largest_error} mm²')
    print('Maximum display-outline / recorded area difference:',largest_error,'mm²')

if __name__=='__main__':
    main()
