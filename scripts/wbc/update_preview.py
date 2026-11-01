"""Keep the server-rendered preview and summary aligned with playback files."""
import json
from pathlib import Path

preview = {}
for scenario in ['near', 'far']:
    path = Path(f'public/assets/demos/wbc/{scenario}.json')
    data = json.loads(path.read_text())
    preview[scenario] = dict(metadata=data['metadata'], frames=[data['frames'][0], data['frames'][-1]])
Path('src/lib/demos/data/wbc-reach-preview.json').write_text(json.dumps(preview, separators=(',', ':'), allow_nan=False))

data = json.loads(Path('public/assets/demos/wbc/balance/combined.json').read_text())
Path('src/lib/demos/data/wbc-balance-preview.json').write_text(json.dumps(dict(metadata=data['metadata'], frames=[data['frames'][0], data['frames'][-1]]), separators=(',', ':'), allow_nan=False))
