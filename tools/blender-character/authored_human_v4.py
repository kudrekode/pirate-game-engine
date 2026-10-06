"""Frozen-V3 body skinning experiment; no garment fitting or garment validation."""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v2 import export
from authored_human_v3 import pose, VIEWS
from render_authored_human_v2 import lighting
from authored_human_v4_weights import correction, joint_coordinates, REGIONS, REVISION

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/blender-character/experimental/authored-human-v2'
OUT = ROOT / 'test-results/authored-human-v4'
CASES = ('dressed-neutral', 'combined')
POSES = ('rest', 'idle', 'walk', 'elbow', 'crouch', 'raised-arm')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def json_hash(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def weights(obj):
    return [{obj.vertex_groups[g.group].name: g.weight for g in v.groups} for v in obj.data.vertices]


def protected_state():
    """Hash all source geometry/keys/UVs/rest rig and every non-body weight."""
    result = {}
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            data = {'vertices': [list(v.co) for v in obj.data.vertices],
                'polygons': [list(p.vertices) for p in obj.data.polygons],
                'uv': [[list(v.uv) for v in uv.data] for uv in obj.data.uv_layers],
                'keys': {k.name: [list(v.co) for v in k.data] for k in obj.data.shape_keys.key_blocks} if obj.data.shape_keys else {},
                'materials': [m.name for m in obj.data.materials],
                'matrix': [list(row) for row in obj.matrix_world]}
            if not obj.name.startswith('SuperHero_Male'):
                data['weights'] = weights(obj)
            result[obj.name] = json_hash(data)
        elif obj.type == 'ARMATURE':
            result[obj.name] = json_hash({b.name: {'matrix': [list(row) for row in b.matrix_local],
                'parent': b.parent.name if b.parent else None} for b in obj.data.bones})
    return result


def build(revision):
    target = OUT / revision
    target.mkdir(parents=True, exist_ok=True)
    hashes = {p.name: digest(p) for p in SOURCE.iterdir() if p.is_file()}
    assert hashes['candidate.blend'] == json.loads((SOURCE / 'manifest.json').read_text())['sourceFiles']['candidate.blend']
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'candidate.blend'))
    body = next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male'))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    original = weights(body)
    if revision == 'baseline':
        inspection = {'rig': {b.name: {'head': list(b.head_local), 'tail': list(b.tail_local),
            'parent': b.parent.name if b.parent else None} for b in rig.data.bones},
            'vertices': [{'id': v.index, 'co': list(v.co), 'w': original[v.index]} for v in body.data.vertices],
            'edges': [list(e.vertices) for e in body.data.edges]}
        (OUT / 'source-inspection.json').write_text(json.dumps(inspection))
    protected = protected_state()
    pivots = {b.name: list(b.head_local) for b in rig.data.bones}
    changed = []
    if revision != 'baseline':
        assert revision == REVISION
        for vertex, source in zip(body.data.vertices, original):
            corrected, region = correction(vertex.co, source, pivots)
            difference = sum(abs(source.get(b, 0) - corrected.get(b, 0)) for b in source.keys() | corrected.keys())
            if difference < 1e-7:
                continue
            for bone in source:
                body.vertex_groups[bone].remove([vertex.index])
            for bone, weight in corrected.items():
                body.vertex_groups[bone].add([vertex.index], weight, 'REPLACE')
            changed.append({'id': vertex.index, 'position': list(vertex.co), 'region': region, 'before': source, 'after': corrected})
    assert protected_state() == protected, 'Changed protected source data'
    actual = weights(body)
    assert all(0 < len(w) <= 4 and abs(sum(w.values()) - 1) < 1e-6 and all(0 <= v <= 1 for v in w.values()) for w in actual)
    source_path = target / 'candidate.blend'
    # Keep all six values at zero in the editable source.
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                key.value = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
    targets = json.loads((SOURCE / 'targets.json').read_text())['cases']
    for case in CASES:
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH' and obj.data.shape_keys:
                for key in obj.data.shape_keys.key_blocks:
                    key.value = targets[case].get(key.name, 0)
        export(target / (case + '.glb'))
    assert hashes == {p.name: digest(p) for p in SOURCE.iterdir() if p.is_file()}
    manifest = {'revision': revision, 'sourceInputs': hashes, 'protectedState': protected,
        'settings': REGIONS if revision != 'baseline' else None, 'changedVertices': changed,
        'sourceSha256': digest(source_path), 'bodyVertices': len(original), 'joints': len(rig.data.bones),
        'cases': {case: {'values': targets[case], 'sha256': digest(target / (case + '.glb'))} for case in CASES}}
    (target / 'weights.json').write_text(json.dumps(manifest, indent=2))
    print('V4_BUILD', revision, len(changed), flush=True)


def body_evidence(body, rig):
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(deps)
    mesh = evaluated.to_mesh()
    original = weights(body)
    source_ids = next(a for a in body.data.attributes if a.name.lower() == '_source_vertex')
    regions = {}
    for joint, settings in REGIONS.items():
        for suffix, sign in (('l', 1), ('r', -1)):
            pivot = rig.data.bones[settings['child'] + '_' + suffix].head_local
            records = []
            for edge in body.data.edges:
                a, b = edge.vertices
                pa, pb = body.data.vertices[a].co, body.data.vertices[b].co
                midpoint = (pa + pb) / 2
                s, outward, transverse = joint_coordinates(midpoint, joint, pivot, sign)
                if midpoint.x * sign <= 0 or abs(s) >= settings['limit']:
                    continue
                expected = {settings['parent'] + '_' + suffix, settings['child'] + '_' + suffix}
                if any(bone not in expected for i in (a, b) for bone in original[i]):
                    continue
                before = (pa - pb).length
                if before < .001:
                    continue
                after = (mesh.vertices[a].co - mesh.vertices[b].co).length
                # Four circumferential sectors, including flexion and extension.
                sector = ('outer' if outward >= 0 else 'inner') if abs(outward) >= abs(transverse) else ('cross-positive' if transverse >= 0 else 'cross-negative')
                records.append({'ids': [round(source_ids.data[i].value) for i in (a, b)],
                    'sector': sector, 'ratio': after / before, 'restMm': before * 1000, 'posedMm': after * 1000,
                    'position': list(midpoint), 'childWeights': [original[i].get(settings['child'] + '_' + suffix, 0) for i in (a, b)]})
            regions[joint + '_' + suffix] = {sector: {'edges': len(rows),
                'min': min((e['ratio'] for e in rows), default=None), 'max': max((e['ratio'] for e in rows), default=None),
                'top': sorted(rows, key=lambda e: e['ratio'], reverse=True)[:3],
                'compressed': sorted(rows, key=lambda e: e['ratio'])[:3]}
                for sector in ('outer', 'inner', 'cross-positive', 'cross-negative')
                for rows in [[e for e in records if e['sector'] == sector]]}
    evaluated.to_mesh_clear()
    return regions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', default=REVISION)
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--cases', default=','.join(CASES))
    parser.add_argument('--poses', default=','.join(POSES))
    parser.add_argument('--views', default='front,side,back')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--measure-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    cases, poses, views = args.cases.split(','), args.poses.split(','), args.views.split(',')
    assert args.revision == 'baseline' or args.revision == REVISION
    assert all(c in CASES for c in cases) and all(p in POSES for p in poses) and all(v in VIEWS for v in views)
    if args.list:
        print(json.dumps({'revision': args.revision, 'cases': cases, 'poses': poses, 'views': views,
            'garmentHidden': True, 'renders': 0 if args.measure_only else len(cases) * len(poses) * len(views)}))
        return
    if args.build:
        build(args.revision)
        return
    for case in cases:
        for name in poses:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            path = OUT / args.revision / (case + '.glb')
            bpy.ops.import_scene.gltf(filepath=str(path))
            body = next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male'))
            rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
            for obj in bpy.context.scene.objects:
                if obj.name.startswith('V2_Tank'):
                    obj.hide_render = True
            pose(rig, name)
            target = OUT / args.revision / 'renders' / case / name
            target.mkdir(parents=True, exist_ok=True)
            (target / 'measurements.json').write_text(json.dumps({'modelSha256': digest(path), 'pose': name,
                'cameraDefinitions': 'authored_human_v3.VIEWS (including crouch close-camera offset)',
                'regions': body_evidence(body, rig)}, indent=2))
            if args.measure_only:
                continue
            camera = lighting()
            for view in views:
                position, aim, scale = VIEWS[view]
                if name == 'crouch' and view.startswith(('torso', 'shoulder')):
                    position = (position[0], position[1], position[2] - .42)
                    aim = (aim[0], aim[1], aim[2] - .42)
                camera.location = position
                camera.rotation_euler = (Vector(aim) - camera.location).to_track_quat('-Z', 'Y').to_euler()
                camera.data.ortho_scale = scale
                bpy.context.scene.render.filepath = str(target / (view + '.png'))
                bpy.ops.render.render(write_still=True)
                print('V4_REVIEW', args.revision, case, name, view, flush=True)


if __name__ == '__main__':
    main()

