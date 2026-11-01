"""Copy unmodified Talos visual meshes and export their parent-joint transforms."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import urllib.request

import pinocchio as pin

root = Path(sys.prefix) / 'share/example-robot-data/robots/talos_data'
output = Path('public/assets/models/talos')
output.mkdir(parents=True, exist_ok=True)
urdf = root / 'robots/talos_reduced.urdf'
model = pin.buildModelFromUrdf(str(urdf), pin.JointModelFreeFlyer())
visuals = pin.buildGeomFromUrdf(model, str(urdf), pin.GeometryType.VISUAL, package_dirs=[str(root.parent.parent.parent)])
objects = []
for visual in visuals.geometryObjects:
    if not Path(visual.meshPath).is_file():
        continue
    path = Path(visual.meshPath)
    relative = path.relative_to(root)
    destination = output / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, destination)
    objects.append(dict(name=visual.name, parent=int(visual.parentJoint),
        mesh='/assets/models/talos/' + relative.as_posix(),
        placement=pin.SE3ToXYZQUAT(visual.placement).tolist(),
        scale=visual.meshScale.tolist(), color=visual.meshColor.tolist(),
        sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
(output / 'visuals.json').write_text(json.dumps(objects, separators=(',', ':')))
shutil.copyfile(urdf, output / 'talos_reduced.urdf')
# Keep model notices and both upstream license texts alongside the unchanged assets.
for filename, url in {
    'COPYING.LESSER': 'https://raw.githubusercontent.com/stack-of-tasks/talos-data/master/LICENSE',
    'COPYING': 'https://www.gnu.org/licenses/gpl-3.0.txt',
}.items():
    with urllib.request.urlopen(url, timeout=30) as response:
        (output / filename).write_bytes(response.read())
(output / 'README.txt').write_text('''Talos robot model and unchanged visual meshes: PAL Robotics.
Source: example-robot-data 5.0.0, talos_data.
https://github.com/Gepetto/example-robot-data/tree/v5.0.0/robots/talos_data
Upstream: https://github.com/stack-of-tasks/talos-data
The upstream package identifies LGPL-3.0; its included URDF also carries the
original PAL Robotics CC BY-NC-ND 3.0 notice, retained verbatim in talos_reduced.urdf.
https://creativecommons.org/licenses/by-nc-nd/3.0/
Mesh files are copied without conversion or geometry modifications.
visuals.json records their model placements and SHA-256 hashes.
''')
print(f'Exported {len(objects)} visual objects to {output}')
