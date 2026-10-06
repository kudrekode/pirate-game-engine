"""Unretouched V5 contact sheets and reproducible evidence package."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'test-results/authored-human-v5'
DEST=ROOT/'docs/assets/authored-human-v5'
PACKAGE=ROOT/'tools/blender-character/experimental/authored-human-v5'
FONT=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
CASES=('dressed-neutral','combined')
VIEWS=('elbow-side','elbow-front','elbow-rear','elbow-quarter')
LABELS={'dressed-neutral':'Neutral','combined':'Combined','baseline':'V3','v4':'V4','final':'V5',
    'rest':'Rest','intermediate':'70 deg','elbow':'115 deg','elbow-side':'Side','elbow-front':'Front','elbow-rear':'Rear','elbow-quarter':'Three-quarter'}
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def render(stage,case,pose,view):return OUT/stage/'renders'/case/pose/(view+'.png')
def sheet(path,cells,columns=4,width=400):
    h=round(width*840/720);out=Image.new('RGB',(width*columns,(h+30)*((len(cells)+columns-1)//columns)), '#ededed');draw=ImageDraw.Draw(out)
    for n,(label,p) in enumerate(cells):
        x=n%columns*width;y=n//columns*(h+30);im=Image.open(p).convert('RGB').resize((width,h),Image.Resampling.LANCZOS)
        out.paste(im,(x,y+30));draw.text((x+7,y+4),label,font=FONT,fill='#161616')
    path.parent.mkdir(parents=True,exist_ok=True);out.save(path,quality=94)

def checkpoints():
    for case in CASES:
        cells=[(f'{LABELS[pose]} / {LABELS[view]}',render('circumference',case,pose,view)) for pose in ('intermediate','elbow') for view in VIEWS]
        sheet(OUT/(case+'-checkpoint.jpg'),cells)

def package():
    DEST.mkdir(parents=True,exist_ok=True);PACKAGE.mkdir(parents=True,exist_ok=True)
    for case in CASES:
        sheet(DEST/(case+'-poses.jpg'),[(f'{LABELS[p]} / {LABELS[v]}',render('final',case,p,v)) for p in ('rest','intermediate','elbow') for v in VIEWS])
        sheet(DEST/(case+'-extreme-comparison.jpg'),[(f'{LABELS[s]} / {LABELS[v]}',render(s,case,'elbow',v)) for v in VIEWS for s in ('baseline','v4','final')],3)
    sheet(DEST/'intermediate-comparison.jpg',[(f'{LABELS[c]} {LABELS[s]} / {LABELS[v]}',render(s,c,'intermediate',v)) for c in CASES for v in ('elbow-side','elbow-quarter') for s in ('baseline','v4','final')],3)
    sheet(DEST/'intermediate-front-rear-comparison.jpg',[(f'{LABELS[c]} {LABELS[s]} / {LABELS[v]}',render(s,c,'intermediate',v)) for c in CASES for v in ('elbow-front','elbow-rear') for s in ('baseline','v4','final')],3)
    sheet(DEST/'context.jpg',[(f'{LABELS[c]} / {LABELS.get(p,p.title())}',render('final',c,p,'front')) for c in CASES for p in ('rest','idle','walk','intermediate','elbow')],5,280)
    sheet(DEST/'animation.jpg',[(f'{LABELS[c]} {p} / {v}',render('final',c,p,v)) for c in CASES for p in ('idle','walk') for v in ('front','side','torso-back')],3,360)
    sheet(DEST/'iteration.jpg',[(f'{s.title()} / {LABELS[v]}',render(s,'dressed-neutral','elbow',v)) for s in ('outer','circumference') for v in VIEWS])
    for name in ('topology-rings.png','weights-circumference.png'):
        shutil.copy2(OUT/name,DEST/name)
    for source in (OUT/'final/candidate.blend',OUT/'final/weights.json',OUT/'final/roundtrip.json',OUT/'source-tests.json',OUT/'topology.json'):
        shutil.copy2(source,PACKAGE/source.name)
    topology=json.loads((OUT/'topology.json').read_text());expected={v['id'] for v in topology['vertices']}
    evidence={'scope':'Elbow only. Visual fail; no new weight strategy after full-circumference checkpoint.',
        'identities':json.loads((OUT/'final/weights.json').read_text())['cases'],
        'measurementDomain':{'leftSourceVertices':len(expected),'sourceEdgesLongerThan1mm':463,'notes':'Same explicit nine-ring patch in V3/V4/V5; original edges, not exported triangulation diagonals. Values are posed/rest edge lengths.'},
        'measurements':{},'renderHashes':{},'scripts':{},'preservation':{},'sourceTests':json.loads((OUT/'source-tests.json').read_text()),
        'roundtrip':json.loads((OUT/'final/roundtrip.json').read_text()),
        'iteration':[{'stage':'outer','leftVertices':58,'review':'Outer wedge reduced; upper/inner shelf remains. Continue adjacent side/fold ring completion.'},
                     {'stage':'circumference','leftVertices':118,'review':'70-degree shelf and 115-degree pinched/bulbous joint persist in neutral and combined. Stop rule reached.'},
                     {'stage':'final','leftVertices':118,'rightVertices':118,'review':'Same tested left weights copied to mirrored right vertices, including seam aliases. No additional strategy.'}]}
    for stage in ('baseline','v4','outer','circumference','final'):
        evidence['measurements'][stage]={}
        for path in sorted((OUT/stage/'renders').glob('*/*/measurements.json')):
            case,pose=path.parts[-3:-1];data=json.loads(path.read_text())
            if stage in ('baseline','v4','final'):
                assert len(data['regions']['l']['edges'])==463
            evidence['measurements'][stage][case+'/'+pose]=data
        for path in sorted((OUT/stage/'renders').rglob('*.png')):
            evidence['renderHashes'][str(path.relative_to(ROOT)).replace('\\','/')]=digest(path)
    # Camera equality is checked on actual render metadata for every comparison.
    for case in CASES:
        for pose in ('intermediate','elbow'):
            reference=evidence['measurements']['baseline'][case+'/'+pose]
            for stage in ('v4','final'):
                other=evidence['measurements'][stage][case+'/'+pose]
                for view in VIEWS:assert reference['cameras'][view]==other['cameras'][view]
    evidence['identicalComparisonCameras']=True
    manifest=json.loads((ROOT/'tools/blender-character/experimental/authored-human-v2/manifest.json').read_text())
    initial_inputs=json.loads((OUT/'outer/weights.json').read_text())['sourceInputs']
    assert initial_inputs==json.loads((OUT/'final/weights.json').read_text())['sourceInputs']
    evidence['historicalSidecarHashDifferences']={}
    for name,expected_hash in initial_inputs.items():
        path=ROOT/'tools/blender-character/experimental/authored-human-v2'/name
        assert digest(path)==expected_hash
        evidence['preservation'][str(path.relative_to(ROOT)).replace('\\','/')]=expected_hash
        historical=manifest['sourceFiles'].get(name)
        if name.endswith('.blend'):assert expected_hash==historical
        elif historical and historical!=expected_hash:
            evidence['historicalSidecarHashDifferences'][name]={'historicalManifest':historical,'unchangedV5Input':expected_hash}
    for case in CASES:
        assert digest(OUT/'baseline'/(case+'.glb'))==manifest['localExports'][case+'.glb']['sha256']
    v4=json.loads((ROOT/'tools/blender-character/experimental/authored-human-v4/weights.json').read_text())
    assert digest(ROOT/'tools/blender-character/experimental/authored-human-v4/candidate.blend')==v4['sourceSha256']
    for case in CASES:
        assert digest(ROOT/'test-results/authored-human-v4/joint-centred-v1'/(case+'.glb'))==v4['cases'][case]['sha256']
    inherited=json.loads((ROOT/'tools/blender-character/experimental/authored-human-v4/evidence.json').read_text())
    inherited_scripts=dict(inherited['sourceScripts'], authored_human_v3=inherited['v3PoseCameraScript'], render_authored_human_v2=inherited['v2InheritedPoseLightingScript'])
    for name,expected_hash in inherited_scripts.items():
        filename=name if '.' in name else name+'.py'
        path=ROOT/'tools/blender-character'/filename
        assert digest(path)==expected_hash
        evidence['preservation'][str(path.relative_to(ROOT)).replace('\\','/')]=expected_hash
    for name in ('idle','walk-in-place'):
        path=ROOT/'public/assets/derived/humanoid-animations/golden-reference-v0'/(name+'.glb')
        evidence['preservation'][str(path.relative_to(ROOT)).replace('\\','/')]=digest(path)
    for path in sorted((ROOT/'tools/blender-character').glob('*v5*')):
        if path.is_file():evidence['scripts'][path.name]=digest(path)
    evidence['candidateSha256']=digest(PACKAGE/'candidate.blend')
    (PACKAGE/'evidence.json').write_text(json.dumps(evidence,indent=2))
    print('V5_EVIDENCE',len(evidence['renderHashes']),'renders',len(list(DEST.iterdir())),'sheets/maps',evidence['candidateSha256'])
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--checkpoint',action='store_true');args=parser.parse_args()
    checkpoints() if args.checkpoint else package()
