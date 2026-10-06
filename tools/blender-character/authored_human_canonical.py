"""Canonical art-source revision and compact, explicit deformation review.

The frozen V2 source is read only. The candidate is a new package; identity
targets receive the same local linear contour operator as Basis.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v2 import export, CASES
from authored_human_v3 import pose as existing_pose, VIEWS
from render_authored_human_v2 import lighting

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/blender-character/experimental/authored-human-v2/candidate.blend'
PACKAGE = ROOT / 'tools/blender-character/experimental/authored-human-canonical-v1'
OUT = ROOT / 'test-results/authored-human-canonical-v1'
REVISION = 'authored-human-canonical-v1'
SELECTION = [
    ('rest', 'front'), ('idle', 'three-quarter'), ('walk', 'side'),
    ('raised-arm', 'torso-back'), ('elbow70', 'torso-side'),
    ('elbow', 'torso-side'), ('hip', 'joints-side'),
    ('crouch', 'knee-side'), ('head-turn', 'face-three-quarter'),
]
VIEWS = dict(VIEWS, **{'hand-close': ((.8, -1.2, 1.7), (.78, .04, 1.44), .42)})


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def subject():
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('SuperHero_Male'))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    return body, rig


def rotate(rig, name, axis, degrees):
    bone = rig.pose.bones[name]
    rest = bone.bone.matrix_local.to_quaternion()
    bone.rotation_mode = 'QUATERNION'
    bone.rotation_quaternion = rest.inverted() @ Quaternion(Vector(axis), math.radians(degrees)) @ rest


def pose(rig, name):
    if name == 'hand':
        rotate(rig, 'hand_l', (0, 1, 0), 25)
        for finger in ('index', 'middle', 'ring', 'pinky'):
            for segment in ('01', '02', '03'):
                rotate(rig, finger + '_' + segment + '_l', (0, 1, 0), 25)
    elif name == 'elbow70':
        existing_pose(rig, 'elbow')
        for side, sign in [('l', -1), ('r', 1)]:
            rotate(rig, 'lowerarm_' + side, (0, 0, 1), sign * 70)
    elif name == 'hip':
        rotate(rig, 'thigh_l', (1, 0, 0), -85)
        rotate(rig, 'calf_l', (1, 0, 0), 70)
        rotate(rig, 'upperarm_l', (0, 1, 0), 65)
        rotate(rig, 'upperarm_r', (0, 1, 0), -65)
    else:
        existing_pose(rig, name)
    bpy.context.view_layer.update()


def set_identity(values):
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                key.value = values.get(key.name, 0)


def export_cases(directory, cases):
    directory.mkdir(parents=True, exist_ok=True)
    for obj in list(bpy.data.objects):
        if obj.name.startswith('V2_Tank'):
            bpy.data.objects.remove(obj, do_unlink=True)
    for case in cases:
        set_identity(CASES[case])
        export(directory / (case + '.glb'))
    set_identity({})


def smoothstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def revise_body(body, rig):
    """Local seam-aware fairing, with identical operators on every identity.

    Existing connected rings remain adequate after removing sculpted joint
    grooves. UV/normal splits stay separate; coincident aliases share neighbours.
    No remeshing, bone edits, pose correctives or per-identity weight changes.
    """
    keys = body.data.shape_keys.key_blocks
    original = np.array([v.co[:] for v in keys[0].data])
    unique, inverse = np.unique(np.round(original, 6), axis=0, return_inverse=True)
    neighbours = [set() for _ in unique]
    for edge in body.data.edges:
        a, b = (inverse[i] for i in edge.vertices)
        if a != b:
            neighbours[a].add(b)
            neighbours[b].add(a)
    # All masks use Basis only, so this is a fixed linear target migration.
    x, y, z = original.T
    elbow = (1 - smoothstep(.040, .125, np.abs(np.abs(x) - .463012))) * (z > 1.25)
    knee = (1 - smoothstep(.035, .125, np.abs(z - rig.data.bones['calf_l'].head_local.z))) * (np.abs(x) > .04)
    shoulder = smoothstep(.13, .20, np.abs(x)) * (1 - smoothstep(.28, .36, np.abs(x))) * smoothstep(1.29, 1.40, z)
    groin = (1 - smoothstep(.04, .17, np.abs(z - .94))) * (1 - smoothstep(.12, .23, np.abs(x)))
    strength = np.maximum.reduce([elbow * .64, knee * .60, shoulder * .28, groin * .16])
    moved = {}
    for key in keys:
        coords = np.array([v.co[:] for v in key.data])
        before = coords.copy()
        for _ in range(6):
            sums = np.zeros_like(unique)
            np.add.at(sums, inverse, coords)
            counts = np.bincount(inverse)
            centres = sums / counts[:, None]
            means = np.array([centres[list(n)].mean(axis=0) if n else centres[i] for i, n in enumerate(neighbours)])
            coords += strength[:, None] * (means[inverse] - coords)
        key.data.foreach_set('co', coords.ravel())
        moved[key.name] = {'vertices': int(np.count_nonzero(np.linalg.norm(coords - before, axis=1) > 1e-7)),
                          'maxDisplacementMm': float(np.linalg.norm(coords - before, axis=1).max() * 1000)}
    body.data.vertices.foreach_set('co', np.array([v.co[:] for v in keys[0].data]).ravel())
    names = [g.name for g in body.vertex_groups]
    weights = np.zeros((len(original), len(names)))
    for vertex in body.data.vertices:
        for g in vertex.groups:
            weights[vertex.index, g.group] = g.weight
    old_weights = weights.copy()
    # Shoulder/back and pelvis transitions keep existing anatomical groups.
    weight_strength = np.maximum(shoulder * .70, groin * .55)
    for _ in range(5):
        sums = np.zeros((len(unique), len(names)))
        np.add.at(sums, inverse, weights)
        centres = sums / np.bincount(inverse)[:, None]
        means = np.array([centres[list(n)].mean(axis=0) if n else centres[i] for i, n in enumerate(neighbours)])
        weights += weight_strength[:, None] * (means[inverse] - weights)
    coords = np.array([v.co[:] for v in keys[0].data])
    for index, point in enumerate(coords):
        side, suffix = (1, 'l') if point[0] > 0 else (-1, 'r')
        for region, parent, child, mask in [('elbow', 'upperarm', 'lowerarm', elbow), ('knee', 'thigh', 'calf', knee)]:
            if mask[index] <= 0:
                continue
            p, c = names.index(parent + '_' + suffix), names.index(child + '_' + suffix)
            if old_weights[index, p] + old_weights[index, c] < .999:
                continue
            pivot = rig.data.bones[child + '_' + suffix].head_local
            length = side * (point[0] - pivot.x) if region == 'elbow' else pivot.z - point[2]
            outer = point[1] - pivot.y if region == 'elbow' else pivot.y - point[1]
            transverse = point[2] - pivot.z if region == 'elbow' else point[0] - pivot.x
            extension = .5 + .5 * outer / max(math.hypot(outer, transverse), 1e-8)
            width = .055 + .045 * extension
            child_weight = float(smoothstep(-width, width, length))
            influence = np.zeros(len(names))
            influence[p], influence[c] = 1 - child_weight, child_weight
            blend = float(1 - smoothstep(.09, .125, abs(length)))
            weights[index] += blend * (influence - weights[index])
    for index, row in enumerate(weights):
        if np.max(np.abs(row - old_weights[index])) < 1e-7:
            continue
        row[np.argsort(row)[:-4]] = 0
        row[row < 1e-6] = 0
        row /= row.sum()
        for g in body.vertex_groups:
            g.remove([index])
        for group in np.flatnonzero(row):
            body.vertex_groups[int(group)].add([index], float(row[group]), 'REPLACE')
    body.data.update()
    return {'contours': moved, 'changedWeights': int(np.count_nonzero(np.max(abs(weights - old_weights), axis=1) > 1e-6)),
            'vertices': len(original), 'triangles': len(body.data.polygons),
            'topology': 'Original vertex order, triangles and per-corner UVs preserved',
            'targetMigration': 'Same six local fairing iterations, adjacency and Basis masks on every key'}


def build(baseline=False):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    body, rig = subject()
    if baseline:
        export_cases(OUT / 'baseline', ['dressed-neutral', 'combined'])
        return
    PACKAGE.mkdir(parents=True, exist_ok=True)
    before = digest(SOURCE)
    changes = revise_body(body, rig)
    set_identity({})
    bpy.ops.wm.save_as_mainfile(filepath=str(PACKAGE / 'candidate.blend'))
    export_cases(OUT / 'candidate', list(CASES))
    assert digest(SOURCE) == before
    (PACKAGE / 'revision.json').write_text(json.dumps({'revision': REVISION,
        'source': SOURCE.relative_to(ROOT).as_posix(), 'sourceSha256': before,
        'candidateSha256': digest(PACKAGE / 'candidate.blend'),
        'rigProfile': 'golden-humanoid-v0', 'changes': changes, 'identities': CASES}, indent=2))
    print('CANONICAL_CHANGES', json.dumps(changes))


def render(stage, cases, selection):
    for case in cases:
        for name, view in selection:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            source = OUT / stage / (case + '.glb')
            bpy.ops.import_scene.gltf(filepath=str(source))
            body, rig = subject()
            pose(rig, name)
            camera = lighting()
            position, target, scale = VIEWS[view]
            camera.location = position
            camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
            camera.data.ortho_scale = scale
            scene = bpy.context.scene
            scene.render.resolution_x, scene.render.resolution_y = 640, 760
            scene.cycles.samples = 16
            destination = OUT / stage / 'renders' / case
            destination.mkdir(parents=True, exist_ok=True)
            scene.render.filepath = str(destination / (name + '-' + view + '.png'))
            bpy.ops.render.render(write_still=True)
            print('CANONICAL_REVIEW', case, name, view, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--stage', choices=['baseline', 'candidate', 'tank'], default='candidate')
    parser.add_argument('--cases', default='dressed-neutral,combined')
    parser.add_argument('--selection', help='Explicit pose:view comma-separated pairs')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    selection = [tuple(pair.split(':')) for pair in args.selection.split(',')] if args.selection else SELECTION
    cases = args.cases.split(',')
    assert all(c in CASES for c in cases)
    assert all(v in VIEWS for p, v in selection)
    if args.list:
        print(json.dumps({'stage': args.stage, 'cases': cases, 'selection': selection, 'renders': len(cases) * len(selection)}))
    elif args.build:
        build(args.stage == 'baseline')
    else:
        render(args.stage, cases, selection)
