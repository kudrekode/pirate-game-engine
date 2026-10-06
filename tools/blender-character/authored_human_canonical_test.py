"""Source preservation and morph migration checks, run inside Blender."""
import json
from pathlib import Path
import sys
import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_canonical import SOURCE, PACKAGE, subject, digest
from authored_human_v4 import protected_state, weights


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    body, rig = subject()
    return {
        'protected': protected_state(),
        'faces': [list(p.vertices) for p in body.data.polygons],
        'uv': [[list(v.uv) for v in layer.data] for layer in body.data.uv_layers],
        'keys': {k.name: np.array([v.co[:] for v in k.data]) for k in body.data.shape_keys.key_blocks},
        'values': [k.value for k in body.data.shape_keys.key_blocks],
        'weights': weights(body), 'rig': rig.name, 'body': body.name,
    }


before = snapshot(SOURCE)
after = snapshot(PACKAGE / 'candidate.blend')
assert before['faces'] == after['faces']
assert before['uv'] == after['uv']
assert list(before['keys']) == list(after['keys'])
assert all(v == 0 for v in after['values'])
assert before['protected'][before['rig']] == after['protected'][after['rig']]
for name, value in before['protected'].items():
    if name != before['body']:
        assert after['protected'][name] == value, name
for values in after['weights']:
    assert len(values) <= 4 and all(0 <= v <= 1 for v in values.values())
    assert abs(sum(values.values()) - 1) < 1e-6
original, revised = before['keys']['Basis'], after['keys']['Basis']
face = original[:, 2] > 1.57
hands = abs(original[:, 0]) > .69
ankles = original[:, 2] < .31
for name in before['keys']:
    assert np.array_equal(before['keys'][name][face | hands | ankles], after['keys'][name][face | hands | ankles]), name
    assert np.isfinite(after['keys'][name]).all()
    if name != 'Basis':
        assert np.max(np.linalg.norm(after['keys'][name] - revised, axis=1)) > .001
aliases = {}
for i, point in enumerate(original):
    key = tuple(np.round(point, 6))
    if key in aliases:
        assert np.linalg.norm(revised[i] - revised[aliases[key]]) < 2e-6
    aliases[key] = i
report = {'passed': True, 'sourceSha256': digest(SOURCE),
          'candidateSha256': digest(PACKAGE / 'candidate.blend'),
          'checks': ['Golden rest unchanged', 'triangles and UVs exact', 'six migrated targets',
                     'face hands ankles exact in all targets', 'hair eyes brows tank exact',
                     'normalized max-four weights', 'coincident seam continuity', 'zero source key values'],
          'maxWeightError': max(abs(sum(w.values()) - 1) for w in after['weights'])}
(PACKAGE / 'source-validation.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
