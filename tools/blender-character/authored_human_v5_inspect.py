"""Fresh source topology inspection for the elbow-only V5 experiment."""
import hashlib
import json
from pathlib import Path
import sys
import bpy
from mathutils.kdtree import KDTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v4 import SOURCE, weights, protected_state, digest
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/authored-human-v5'

def inspect():
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'candidate.blend'))
    body = next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male'))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    original = weights(body)
    tree = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    data = {'sourceSha256': digest(SOURCE / 'candidate.blend'), 'protectedState': protected_state(),
        'rig': {b.name: {'head': list(b.head_local), 'tail': list(b.tail_local), 'parent': b.parent.name if b.parent else None,
            'matrix': [list(row) for row in b.matrix_local]} for b in rig.data.bones},
        'vertices': [{'id': v.index, 'co': list(v.co), 'normal': list(v.normal), 'w': original[v.index],
            'mirror': tree.find((-v.co.x, v.co.y, v.co.z))[1],
            'mirrors': [i for _, i, distance in tree.find_range((-v.co.x, v.co.y, v.co.z), 1e-6)],
            'mirrorDistance': tree.find((-v.co.x, v.co.y, v.co.z))[2]} for v in body.data.vertices],
        'edges': [list(e.vertices) for e in body.data.edges],
        'faces': [list(p.vertices) for p in body.data.polygons]}
    (OUT / 'source-inspection.json').write_text(json.dumps(data))
    print('V5_INSPECTION', data['sourceSha256'], len(data['vertices']), len(data['faces']))

if __name__ == '__main__':
    inspect()
