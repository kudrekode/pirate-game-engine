"""Explicit source review; --list before rendering. Product GLBs use --glb."""
import argparse
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from authored_human_clothing import load_outfit
from authored_human_canonical import pose, set_identity
from render_authored_human_v2 import lighting,VIEWS
ROOT=Path(__file__).resolve().parents[2]
CASES={'athletic':{},'fuller':{'mass':1,'broadFrame':.15},'broad':{'athletic':.25,'broadFrame':1},'custom':{'mass':.5,'athletic':.4,'broadFrame':.4}}
p=argparse.ArgumentParser();p.add_argument('--case',default='athletic');p.add_argument('--selection',default='rest:front,rest:back,idle:three-quarter');p.add_argument('--list',action='store_true');p.add_argument('--glb');p.add_argument('--output',default='test-results/first-outfit');args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
selection=[s.split(':') for s in args.selection.split(',')];assert args.case in CASES
if args.list:print(json.dumps({'case':args.case,'selection':selection,'renders':len(selection)}));raise SystemExit(0)
for motion,view in selection:
    if args.glb:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/args.glb))
    else:
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'))
        for o in list(bpy.data.objects):
            if o.name.startswith('V2_Tank'):bpy.data.objects.remove(o,do_unlink=True)
        body=bpy.data.objects['SuperHero_Male'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
        load_outfit(ROOT,body,rig,{s:{'componentId':'everyday-'+s,'revision':'1','color':'#56616b'} for s in ('top','bottoms','footwear')},CASES[args.case]);set_identity(CASES[args.case])
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');pose(rig,motion)
    camera=lighting();loc,target,size=VIEWS[view];camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=size
    scene=bpy.context.scene;scene.render.resolution_x=560;scene.render.resolution_y=680;scene.cycles.samples=16
    dest=ROOT/args.output/args.case;dest.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(dest/(motion+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
