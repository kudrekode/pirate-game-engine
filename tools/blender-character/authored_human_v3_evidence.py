"""Make labelled contact sheets from actual V3 renders; no image retouching."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/authored-human-v3'
RENDERS = OUT / 'renders'
DEST = ROOT / 'docs/assets/authored-human-v3'
PACKAGE = ROOT / 'tools/blender-character/experimental/authored-human-v3'
POSES = ('rest', 'idle', 'walk', 'raised-arm', 'crouch')
CASES = ('dressed-neutral', 'combined')
FONT = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 19)
INDEX = {}


def sheet(name, cells, columns, width=360):
    height, label_height = round(width * 840 / 720), 34
    canvas = Image.new('RGB', (columns * width, ((len(cells) + columns - 1) // columns) * (height + label_height)), '#f5f5f5')
    draw = ImageDraw.Draw(canvas)
    paths = []
    for i, (case, pose, view, label) in enumerate(cells):
        path = RENDERS / case / pose / (view + '.png')
        x, y = (i % columns) * width, (i // columns) * (height + label_height)
        with Image.open(path) as source:
            canvas.paste(source.convert('RGB').resize((width, height), Image.Resampling.LANCZOS), (x, y + label_height))
        draw.text((x + 8, y + 6), label, font=FONT, fill='#151515')
        paths.append({'render': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'label': label})
    canvas.save(DEST / name, quality=94)
    INDEX[name] = paths


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    PACKAGE.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        for bare in (True, False):
            variant = case + ('-bare' if bare else '')
            sheet(variant + '.jpg', [(variant, pose, view, f'{pose} / {view}') for view in ('front', 'side', 'torso-back') for pose in POSES], 5)
    sheet('body-stop.jpg', [(case + '-bare', pose, view, f'{case.replace("dressed-", "")} / {pose}')
        for case in CASES for pose, view in [('elbow', 'elbow-side'), ('crouch', 'knee-side')]], 2, 600)
    sheet('raise-comparison.jpg', [(case + suffix, pose, view, label)
        for case in CASES for suffix, pose, view, label in [
            ('-bare', 'raised-arm-old', 'torso-back', 'Body / old raise'),
            ('-bare', 'raised-arm', 'torso-back', 'Body / clavicle-assisted'),
            ('', 'raised-arm-old', 'torso-side', 'Tank / old raise'),
            ('', 'raised-arm', 'torso-side', 'Tank / clavicle-assisted')]], 4, 400)
    measurements = {}
    for case in CASES:
        measurements[case] = {}
        for pose in (*POSES, 'raised-arm-old', 'elbow'):
            record = json.loads((RENDERS / (case + '-bare') / pose / 'measurements.json').read_text())
            measurements[case][pose] = {'modelSha256': record['modelSha256'], 'measurements': record['measurements']}
    evidence = {'status': 'FAIL: body-deformation stop condition; garment correction not attempted',
        'inputs': json.loads((OUT / 'inputs.json').read_text()),
        'localWeightDiagnosis': json.loads((OUT / 'local-weight-diagnosis.json').read_text()),
        'roundtrip': json.loads((OUT / 'roundtrip.json').read_text()),
        'measurements': measurements, 'renders': INDEX,
        'sourceScripts': {name: hashlib.sha256((ROOT / 'tools/blender-character' / name).read_bytes()).hexdigest()
            for name in ('authored_human_v3.py', 'authored_human_v3_test.py', 'validate-authored-human-v3.mjs', 'authored_human_v3_evidence.py')}}
    (PACKAGE / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps({'contactSheets': len(INDEX), 'renderReferences': sum(map(len, INDEX.values()))}))


if __name__ == '__main__':
    main()
