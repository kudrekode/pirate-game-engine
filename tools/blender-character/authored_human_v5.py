"""Elbow-only authored experiment; frozen V3 art and exact legacy pose/cameras."""
import argparse
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Quaternion, Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v4 import SOURCE, weights, protected_state, digest
from authored_human_v2 import export
from authored_human_v3 import pose as legacy_pose, VIEWS
from render_authored_human_v2 import lighting
from authored_human_v5_weights import RINGS, ALIASES, PATCHES, STAGES, left_paint
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/authored-human-v5'
CASES = ('dressed-neutral','combined')
POSES = ('rest','idle','walk','intermediate','elbow')
CLOSE = {'elbow-front': (0,-2.4,0), 'elbow-rear': (0,2.4,0), 'elbow-quarter': (1.8,1.8,.15)}

def source_data():
    return json.loads((OUT / 'source-inspection.json').read_text())

def build(stage):
    target=OUT/stage;target.mkdir(parents=True,exist_ok=True)
    inputs={p.name:digest(p) for p in SOURCE.iterdir() if p.is_file()}
    assert inputs['candidate.blend'] == source_data()['sourceSha256']
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'candidate.blend'))
    body=next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male'))
    before=weights(body);protected=protected_state();data=source_data()
    paint={} if stage=='baseline' else left_paint(stage)
    if stage=='final':
        paint.update({m:w for i,w in list(paint.items()) for m in data['vertices'][i]['mirrors']})
    changed=[]
    for i,w in paint.items():
        suffix='l' if body.data.vertices[i].co.x>0 else 'r'
        pair={f'upperarm_{suffix}',f'lowerarm_{suffix}'}
        assert set(before[i])<=pair
        after={f'upperarm_{suffix}':1-w,f'lowerarm_{suffix}':w}
        for bone in before[i]:body.vertex_groups[bone].remove([i])
        for bone,value in after.items():body.vertex_groups[bone].add([i],value,'REPLACE')
        changed.append({'id':i,'region':f'elbow_{suffix}','position':list(body.data.vertices[i].co),'before':before[i],'after':after})
    assert protected_state()==protected
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:key.value=0
    bpy.ops.wm.save_as_mainfile(filepath=str(target/'candidate.blend'))
    targets=json.loads((SOURCE/'targets.json').read_text())['cases']
    for case in CASES:
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH' and obj.data.shape_keys:
                for key in obj.data.shape_keys.key_blocks:key.value=targets[case].get(key.name,0)
        export(target/(case+'.glb'))
    assert inputs=={p.name:digest(p) for p in SOURCE.iterdir() if p.is_file()}
    (target/'weights.json').write_text(json.dumps({'revision':stage,'sourceInputs':inputs,'protectedState':protected,
        'changedVertices':changed,'sourceSha256':digest(target/'candidate.blend'),
        'cases':{case:{'values':targets[case],'sha256':digest(target/(case+'.glb'))} for case in CASES}},indent=2))
    print('V5_BUILD',stage,len(changed),flush=True)

def pose(rig,name):
    if name!='intermediate':
        legacy_pose(rig,name)
        return
    # Same humeral positioning as the original diagnostic; only a new 70-degree sample.
    legacy_pose(rig,'elbow')
    for suffix,angle in [('l',-70),('r',70)]:
        b=rig.pose.bones['lowerarm_'+suffix];rest=b.bone.matrix_local.to_quaternion()
        b.rotation_quaternion=rest.inverted() @ Quaternion(Vector((0,0,1)),math.radians(angle)) @ rest
    bpy.context.view_layer.update()

def measure(body):
    data=source_data();original=weights(body)
    ids=next(a for a in body.data.attributes if a.name.lower()=='_source_vertex')
    evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    mapped={round(ids.data[i].value):i for i in range(len(body.data.vertices))}
    left=set(i for row in RINGS.values() for i in row)|set(ALIASES.values())|set(i for row in PATCHES.values() for i in row)
    regions={}
    for suffix,members in [('l',left),('r',{m for i in left for m in data['vertices'][i]['mirrors']})]:
        p=Vector(data['rig']['lowerarm_'+suffix]['head']);rows=[]
        for a,b in data['edges']:
            if a not in members or b not in members:continue
            ia,ib=mapped[a],mapped[b]
            rest=(body.data.vertices[ia].co-body.data.vertices[ib].co).length
            if rest<.001:continue
            after=(mesh.vertices[ia].co-mesh.vertices[ib].co).length
            midpoint=(Vector(data['vertices'][a]['co'])+Vector(data['vertices'][b]['co']))/2-p
            sector=('outer' if midpoint.y>=0 else 'inner') if abs(midpoint.y)>=abs(midpoint.z) else ('superior' if midpoint.z>=0 else 'inferior')
            child=[original[i].get('lowerarm_'+suffix,0) for i in (ia,ib)]
            rows.append({'ids':[a,b],'sector':sector,'restMm':rest*1000,'posedMm':after*1000,'ratio':after/rest,
                'childWeights':child,'weightDelta':abs(child[0]-child[1]),'weightDeltaPerMm':abs(child[0]-child[1])/(rest*1000)})
        regions[suffix]={'edges':rows,'sectors':{s:{'min':min(r['ratio'] for r in rows if r['sector']==s),'max':max(r['ratio'] for r in rows if r['sector']==s)} for s in ('outer','inner','superior','inferior')}}
    evaluated.to_mesh_clear();return regions

def render(stage,cases,poses,views):
    folder=ROOT/'test-results/authored-human-v4/joint-centred-v1' if stage=='v4' else OUT/stage
    for case in cases:
        for name in poses:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            model=folder/(case+'.glb');bpy.ops.import_scene.gltf(filepath=str(model))
            body=next(o for o in bpy.context.scene.objects if o.name.startswith('SuperHero_Male'))
            rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
            for o in bpy.context.scene.objects:
                if o.name.startswith('V2_Tank'):o.hide_render=True
            pose(rig,name);target=OUT/stage/'renders'/case/name;target.mkdir(parents=True,exist_ok=True)
            camera=lighting();cameras={}
            previous=target/'measurements.json'
            if previous.exists():
                saved=json.loads(previous.read_text())
                assert saved['modelSha256']==digest(model), 'Refusing to mix render revisions'
                cameras.update(saved['cameras'])
            for view in views:
                if view in CLOSE:
                    aim=rig.matrix_world @ rig.pose.bones['lowerarm_l'].head
                    position=aim+Vector(CLOSE[view]);scale=.42
                else:position,aim,scale=VIEWS[view]
                cameras[view]={'position':list(position),'aim':list(aim),'scale':scale}
                camera.location=position;camera.rotation_euler=(Vector(aim)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
                bpy.context.scene.render.filepath=str(target/(view+'.png'));bpy.ops.render.render(write_still=True)
                print('V5_RENDER',stage,case,name,view,flush=True)
            (target/'measurements.json').write_text(json.dumps({'modelSha256':digest(model),'pose':name,'cameras':cameras,'regions':measure(body)},indent=2))

def main():
    p=argparse.ArgumentParser();p.add_argument('--stage',choices=('baseline','v4',*STAGES),default='final');p.add_argument('--build',action='store_true')
    p.add_argument('--cases',default=','.join(CASES));p.add_argument('--poses',default='elbow');p.add_argument('--views',default='elbow-side,elbow-front,elbow-rear,elbow-quarter');p.add_argument('--list',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);cases=a.cases.split(',');poses=a.poses.split(',');views=a.views.split(',')
    assert all(c in CASES for c in cases) and all(p in POSES for p in poses) and all(v in {*VIEWS,*CLOSE} for v in views)
    if a.list:print(json.dumps({'stage':a.stage,'build':a.build,'cases':cases,'poses':poses,'views':views,'renders':0 if a.build else len(cases)*len(poses)*len(views)}));return
    if a.build:
        assert a.stage!='v4';build(a.stage)
    else:render(a.stage,cases,poses,views)
if __name__=='__main__':main()
