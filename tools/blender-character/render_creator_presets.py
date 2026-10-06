"""Compact review of compiled product presets; no source geometry edits."""
import argparse
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_canonical import subject, pose, VIEWS
from render_authored_human_v2 import lighting

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/creator-product'
THUMBS = ROOT / 'public/assets/creator-presets'

def selections(cases):
    result = []
    for case in cases:
        if case.startswith('combined-'):
            views = [('idle', 'three-quarter'), ('walk', 'side'), ('raised-arm', 'torso-back'), ('elbow', 'torso-side'), ('crouch', 'knee-side')]
        elif case.startswith('body-'):
            views = [('rest', 'front'), ('rest', 'side'), ('rest', 'three-quarter')]
        else:
            views = [('rest', 'face-front'), ('rest', 'face-three-quarter')]
        result.extend((case, p, v) for p, v in views)
    return result

def render(selected):
    THUMBS.mkdir(parents=True, exist_ok=True)
    for case, posture, view in selected:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(OUT / case / 'mannequin.glb'))
        body, rig = subject()
        pose(rig, posture)
        camera = lighting()
        position, target, scale = VIEWS[view]
        camera.location = position
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        scene = bpy.context.scene
        scene.render.resolution_x, scene.render.resolution_y = 420, 560
        scene.cycles.samples = 12
        folder = OUT / 'renders' / case
        folder.mkdir(parents=True, exist_ok=True)
        scene.render.image_settings.file_format = 'JPEG'
        scene.render.image_settings.quality = 88
        scene.render.filepath = str(folder / f'{posture}-{view}.jpg')
        bpy.ops.render.render(write_still=True)
        if (posture == 'rest' or (posture == 'idle' and case.startswith('body-'))) and view in ('front', 'face-front'):
            thumb = THUMBS / f'{case}.jpg'
            thumb.write_bytes(Path(scene.render.filepath).read_bytes())
            if case == 'face-balanced':
                (THUMBS / 'hair-short.jpg').write_bytes(thumb.read_bytes())
        print('PRODUCT_RENDER', case, posture, view, flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--case', required=True)
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--cards', action='store_true', help='Three relaxed body card portraits only')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    selected = selections(args.case.split(','))
    if args.cards:
        assert all(case.startswith('body-') for case in args.case.split(','))
        selected = [(case, 'idle', 'front') for case in args.case.split(',')]
    assert all(view in VIEWS for _, _, view in selected)
    if args.list:
        print(json.dumps({'selection': selected, 'renders': len(selected)}))
    else:
        render(selected)
