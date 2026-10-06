"""V4 full-circumference weight maps and unretouched render comparisons."""
import hashlib
import json
import math
from pathlib import Path
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v4_weights import REGIONS, REVISION, joint_coordinates

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/authored-human-v4'
DEST = ROOT / 'docs/assets/authored-human-v4'
PACKAGE = ROOT / 'tools/blender-character/experimental/authored-human-v4'
CASES = ('dressed-neutral', 'combined')
POSES = ('rest', 'idle', 'walk', 'elbow', 'crouch', 'raised-arm')
FONT = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
INDEX = {}


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def weight_map():
    source = json.loads((OUT / 'source-inspection.json').read_text())
    changes = json.loads((OUT / REVISION / 'weights.json').read_text())['changedVertices']
    after = {v['id']: v['after'] for v in changes}
    fig, axes = plt.subplots(2, 2, figsize=(12, 7.8), constrained_layout=True)
    sectors = {}
    for row, (joint, settings) in enumerate(REGIONS.items()):
        child = settings['child'] + '_l'
        parent = settings['parent'] + '_l'
        pivot = source['rig'][child]['head']
        vertices = []
        for v in source['vertices']:
            length, outward, transverse = joint_coordinates(v['co'], joint, pivot, 1)
            if v['co'][0] <= 0 or abs(length) >= settings['limit'] or not set(v['w']) <= {parent, child}:
                continue
            vertices.append((v, length * 1000, math.degrees(math.atan2(transverse, outward))))
        sectors[joint] = {}
        for column, version in enumerate(('V3 source', 'V4 local repair (rejected)')):
            ax = axes[row, column]
            positions = {v['id']: (x, angle) for v, x, angle in vertices}
            for a, b in source['edges']:
                if a in positions and b in positions and abs(positions[a][1] - positions[b][1]) < 180:
                    ax.plot([positions[a][0], positions[b][0]], [positions[a][1], positions[b][1]], color='#b8b8b8', linewidth=.35, zorder=1)
            scatter = ax.scatter([x for _, x, _ in vertices], [a for _, _, a in vertices],
                c=[(after.get(v['id'], v['w']) if column else v['w']).get(child, 0) for v, _, _ in vertices],
                cmap='viridis', vmin=0, vmax=1, s=28, edgecolors='#333333', linewidths=.2, zorder=2)
            ax.axvline(0, color='#b03040', linewidth=.8, linestyle='--')
            ax.set(xlim=(-130, 130), ylim=(-185, 185), title=f'{joint.capitalize()} / {version}',
                xlabel='Longitudinal distance from unchanged pivot (mm)',
                ylabel='Circumference angle (degrees)')
            ax.set_yticks([-180, -90, 0, 90, 180], ['inner -180', '-90', 'outer 0', '+90', 'inner +180'])
        fig.colorbar(scatter, ax=axes[row, :], label=f'{child} influence', fraction=.028)
        for label in ('outer', 'inner', 'cross-positive', 'cross-negative'):
            def sector(angle):
                return 'outer' if abs(angle) <= 45 else 'inner' if abs(angle) >= 135 else 'cross-positive' if angle > 0 else 'cross-negative'
            sectors[joint][label] = {'vertices': sum(sector(a) == label for _, _, a in vertices)}
    fig.suptitle('Full left-joint circumference; the right side is mirrored\nOuter = rear elbow / anterior knee. Lines are original topology edges.', fontsize=13)
    fig.savefig(DEST / 'weight-circumference.png', dpi=150)
    plt.close(fig)
    return sectors


def sheet(name, cells, columns, width=340):
    height, label = round(width * 840 / 720), 32
    canvas = Image.new('RGB', (columns * width, ((len(cells) + columns - 1) // columns) * (height + label)), '#f5f5f5')
    draw = ImageDraw.Draw(canvas)
    rows = []
    for i, (revision, case, pose, view, title) in enumerate(cells):
        path = OUT / revision / 'renders' / case / pose / (view + '.png')
        x, y = (i % columns) * width, (i // columns) * (height + label)
        with Image.open(path) as picture:
            canvas.paste(picture.convert('RGB').resize((width, height), Image.Resampling.LANCZOS), (x, y + label))
        draw.text((x + 7, y + 6), title, font=FONT, fill='#181818')
        rows.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': hash_file(path)})
    canvas.save(DEST / name, quality=94)
    INDEX[name] = rows


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    PACKAGE.mkdir(parents=True, exist_ok=True)
    sectors = weight_map()
    for case in CASES:
        for revision in ('baseline', REVISION):
            sheet(f'{case}-{revision}.jpg', [(revision, case, pose, view, f'{pose} / {view}')
                for view in ('front', 'side', 'torso-back') for pose in POSES], 6, 300)
    for name, pose, close in [('elbow', 'elbow', 'elbow-side'), ('knee', 'crouch', 'knee-side')]:
        sheet(name + '-comparison.jpg', [(revision, case, pose, view, f'{"Neutral" if case == "dressed-neutral" else "Combined"} / {"V3" if revision == "baseline" else "V4"} / {view}')
            for case in CASES for view in (close, 'back') for revision in ('baseline', REVISION)], 4, 400)
    measurements = {}
    for revision in ('baseline', REVISION):
        measurements[revision] = {case: {pose: json.loads((OUT / revision / 'renders' / case / pose / 'measurements.json').read_text())
            for pose in POSES} for case in CASES}
    evidence = {'status': 'FAIL: new visible creases relocate the defect; no further repaint',
        'revision': REVISION, 'weightMapSectors': sectors,
        'sourceTests': json.loads((OUT / 'source-tests.json').read_text()),
        'roundtrip': json.loads((OUT / REVISION / 'roundtrip.json').read_text()),
        'measurements': measurements, 'renders': INDEX,
        'sourceScripts': {name: hash_file(ROOT / 'tools/blender-character' / name) for name in
            ('authored_human_v4.py', 'authored_human_v4_weights.py', 'authored_human_v4_test.py', 'authored_human_v4_evidence.py', 'validate-authored-human-v4.mjs')},
        'v3PoseCameraScript': hash_file(ROOT / 'tools/blender-character/authored_human_v3.py'),
        'v2InheritedPoseLightingScript': hash_file(ROOT / 'tools/blender-character/render_authored_human_v2.py')}
    (PACKAGE / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps({'comparisonSheets': len(INDEX), 'circumferenceMap': True}))


if __name__ == '__main__':
    main()

