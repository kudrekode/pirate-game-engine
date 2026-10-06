"""V3 isolated deformation gate. Reads the frozen V2 package; never rebuilds its art."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v2 import export
from render_authored_human_v2 import pose as old_pose, lighting, deformation_evidence, VIEWS

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/blender-character/experimental/authored-human-v2'
OUT = ROOT / 'test-results/authored-human-v3'
CASES = ('dressed-neutral', 'combined')
POSES = ('rest', 'idle', 'walk', 'raised-arm', 'raised-arm-old', 'elbow', 'crouch')
VIEWS = dict(VIEWS, **{
    'shoulder-front': ((0, -2.4, 1.58), (0, 0, 1.43), .80),
    'elbow-side': ((2.4, 0, 1.30), (0, 0, 1.30), .65),
    'knee-side': ((2.4, -.18, .55), (0, -.18, .55), .82),
    'joints-front': ((0, -3, .73), (0, 0, .72), 1.15),
    'joints-side': ((3, 0, .74), (0, 0, .72), 1.15),
})

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    inputs = {p.name: digest(p) for p in SOURCE.iterdir() if p.is_file()}
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    for name, expected in manifest['sourceFiles'].items():
        if name.endswith('.blend'):
            assert inputs[name] == expected, name
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'canonical-neutral.blend'))
    export(OUT / 'neutral.glb')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'candidate.blend'))
    targets = json.loads((SOURCE / 'targets.json').read_text())['cases']
    for case in CASES:
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH' and obj.data.shape_keys:
                for key in obj.data.shape_keys.key_blocks:
                    key.value = targets[case].get(key.name, 0)
        export(OUT / (case + '.glb'))
    assert inputs == {p.name: digest(p) for p in SOURCE.iterdir() if p.is_file()}
    (OUT / 'inputs.json').write_text(json.dumps({'preservedV2': inputs,
        'cases': {case: targets[case] for case in CASES},
        'exports': {case: digest(OUT / (case + '.glb')) for case in ('neutral', *CASES)},
        'animations': {name: digest(ROOT / f'public/assets/derived/humanoid-animations/golden-reference-v0/{name}.glb') for name in ('idle', 'walk-in-place')}}, indent=2))


def pose(rig, name):
    if name != 'raised-arm':
        old_pose(rig, 'raised-arm' if name == 'raised-arm-old' else name)
        return
    # Same left-arm elevation as V2 (60 degrees above T): divide the motion
    # between clavicle and humerus instead of rotating the humerus alone.
    for bone, axis, degrees in (
        ('clavicle_l', (0, 1, 0), -20),
        ('upperarm_l', (0, 1, 0), -40),
        ('lowerarm_l', (0, 0, 1), -15),
        ('upperarm_r', (0, 1, 0), -70),
    ):
        p = rig.pose.bones[bone]
        rest = p.bone.matrix_local.to_quaternion()
        p.rotation_mode = 'QUATERNION'
        p.rotation_quaternion = rest.inverted() @ Quaternion(Vector(axis), math.radians(degrees)) @ rest
    bpy.context.view_layer.update()


def local_evidence(rig):
    evidence = {'joints': {b.name: {'head': list(b.head), 'tail': list(b.tail)}
        for b in rig.pose.bones if b.name.startswith(('clavicle', 'upperarm', 'lowerarm', 'thigh', 'calf'))}}
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.name.startswith(('SuperHero_Male', 'V2_Tank')):
            continue
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        regions = {'shoulder': [], 'elbow': [], 'knee': [], 'groin': [], 'torso': []}
        for edge in obj.data.edges:
            a, b = edge.vertices
            pa, pb = obj.data.vertices[a].co, obj.data.vertices[b].co
            midpoint = (pa + pb) / 2
            length = (pa - pb).length
            if length < .001:
                continue
            x, y, z = midpoint
            region = ('shoulder' if z > 1.27 and .10 < abs(x) < .34 else
                      'elbow' if abs(x) > .36 and z > 1.25 else
                      'knee' if .42 < z < .62 else
                      'groin' if .83 < z < 1.04 and abs(x) < .18 else 'torso')
            ratio = (mesh.vertices[a].co - mesh.vertices[b].co).length / length
            regions[region].append({'vertices': [a, b], 'ratio': ratio, 'restMm': length * 1000,
                'midpoint': list(midpoint), 'weights': [{obj.vertex_groups[g.group].name: g.weight
                    for g in obj.data.vertices[i].groups} for i in (a, b)]})
        evidence[obj.name] = {region: {'edges': len(items),
            'over2x': sum(e['ratio'] > 2 for e in items),
            'top': sorted(items, key=lambda e: e['ratio'], reverse=True)[:3]}
            for region, items in regions.items()}
        evaluated.to_mesh_clear()
    return evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--cases', default='dressed-neutral,combined')
    parser.add_argument('--poses', default='rest,idle,walk,raised-arm,crouch')
    parser.add_argument('--views', default='front,side,torso-back')
    parser.add_argument('--bare', action='store_true')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--measure-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    cases, poses, views = args.cases.split(','), args.poses.split(','), args.views.split(',')
    assert all(c in CASES for c in cases)
    assert all(p in POSES for p in poses)
    assert all(v in VIEWS for v in views)
    if args.list:
        print(json.dumps({'cases': cases, 'poses': poses, 'views': views, 'bare': args.bare,
            'renders': 0 if args.measure_only else len(cases) * len(poses) * len(views)}))
        return
    if args.build:
        build()
        return
    for case in cases:
        for name in poses:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            path = OUT / (case + '.glb')
            bpy.ops.import_scene.gltf(filepath=str(path))
            rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
            if args.bare:
                for obj in bpy.context.scene.objects:
                    if obj.name.startswith('V2_Tank'):
                        obj.hide_render = True
            pose(rig, name)
            destination = OUT / 'renders' / (case + ('-bare' if args.bare else '')) / name
            destination.mkdir(parents=True, exist_ok=True)
            (destination / 'measurements.json').write_text(json.dumps({'modelSha256': digest(path),
                'pose': name, 'bare': args.bare, 'measurements': deformation_evidence(),
                'local': local_evidence(rig)}, indent=2))
            if args.measure_only:
                continue
            camera = lighting()
            for view in views:
                position, target, scale = VIEWS[view]
                if name == 'crouch' and view.startswith(('torso', 'shoulder')):
                    position = (position[0], position[1], position[2] - .42)
                    target = (target[0], target[1], target[2] - .42)
                camera.location = position
                camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
                camera.data.ortho_scale = scale
                bpy.context.scene.render.filepath = str(destination / (view + '.png'))
                bpy.ops.render.render(write_still=True)
                print('V3_REVIEW', case, name, view, flush=True)


if __name__ == '__main__':
    main()




