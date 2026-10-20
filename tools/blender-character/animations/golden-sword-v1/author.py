"""One Golden-native diagonal slash. Only action data; no character exports.
Blender anatomical coordinates: +X left, -Y forward, +Z up.
"""
import importlib.util, sys
from pathlib import Path
import bpy
from mathutils import Quaternion, Vector
ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('golden_pose', ROOT/'tools/blender-character/animations/golden-movement-v1/author.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def build(output):
    bpy.ops.wm.open_mainfile(filepath=str(m.CANONICAL))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); m.ARM = arm
    old = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(m.IDLE))
    idle = next(o for o in bpy.data.objects if o not in old and o.type == 'ARMATURE')
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    base = {n: idle.pose.bones[n].matrix_basis.to_quaternion().copy() for n in m.MAIN}
    base.update({n: Quaternion() for n in m.FINGERS})
    for o in list(bpy.data.objects):
        if o != arm: bpy.data.objects.remove(o, do_unlink=True)
    arm.animation_data_clear()
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    for b in arm.pose.bones: b.matrix_basis.identity(); b.rotation_mode = 'QUATERNION'
    for n,q in base.items(): arm.pose.bones[n].rotation_quaternion = q
    bpy.context.view_layer.update()
    anchors = {s: (arm.pose.bones['foot_'+s].head.copy(), arm.pose.bones['foot_'+s].matrix.to_quaternion().copy()) for s in ['l','r']}
    def p(values): return m.pose(base, values, .52)
    ready = p({})
    load = p({'pelvis':(0,0,-10),'spine_01':(1,0,-6),'spine_02':(2,0,-12),'spine_03':(0,0,-5),'neck_01':(0,0,12),'upperarm_r':(-125,-43,-18),'lowerarm_r':(0,0,72),'hand_r':(0,0,-8),'upperarm_l':(-15,65,0),'lowerarm_l':(0,0,-70)})
    lead = p({'pelvis':(2,0,5),'spine_01':(3,0,1),'spine_02':(3,0,-6),'spine_03':(0,0,-3),'neck_01':(-2,0,3),'upperarm_r':(-105,-66,-5),'lowerarm_r':(0,0,45),'hand_r':(0,0,-4),'upperarm_l':(-10,68,0),'lowerarm_l':(0,0,-78)})
    strike = p({'pelvis':(2,0,12),'spine_01':(3,0,7),'spine_02':(4,0,16),'spine_03':(1,0,6),'neck_01':(-3,0,-18),'upperarm_r':(-68,-86,20),'lowerarm_r':(0,0,18),'hand_r':(25,0,4),'upperarm_l':(-4,60,-8),'lowerarm_l':(0,0,-85)})
    follow = p({'pelvis':(2,0,10),'spine_01':(3,0,6),'spine_02':(3,0,12),'spine_03':(0,0,3),'neck_01':(-2,0,-12),'upperarm_r':(-28,-70,28),'lowerarm_r':(0,0,32),'hand_r':(45,0,4),'upperarm_l':(-5,68,-5),'lowerarm_l':(0,0,-65)})
    recover = p({'pelvis':(0,0,4),'spine_02':(1,0,5),'upperarm_r':(-17,-76,6),'lowerarm_r':(0,0,32)})
    keys = [(0,ready,'smooth'),(.15,load,'smooth'),(.2166666667,lead,'accelerate'),(.30,strike,'accelerate'),(.40,follow,'impact'),(.5666666667,recover,'smooth'),(.70,ready,'smooth'),(.75,ready,'smooth')]
    scene = bpy.context.scene; scene.render.fps = 60
    frames = []
    for frame in range(46):
        rotations = m.sample(keys,frame/60)
        for n,q in rotations.items(): arm.pose.bones[n].rotation_quaternion=q
        bpy.context.view_layer.update()
        rotations.update(m.plant_legs(arm,anchors))
        frames.append(rotations)
    action=bpy.data.actions.new('GoldenSword_Attack_V1'); action.use_fake_user=True
    arm.animation_data_create(); arm.animation_data.action=action
    for frame,rotations in enumerate(frames):
        for n in m.MAIN+m.FINGERS:
            b=arm.pose.bones[n]; b.rotation_quaternion=rotations[n]
            b.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=n)
        arm.pose.bones['pelvis'].location=(0,0,0)
        arm.pose.bones['pelvis'].keyframe_insert(data_path='location',frame=frame,group='pelvis')
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points: key.interpolation='LINEAR'
    arm.animation_data.action=None
    for b in arm.pose.bones:b.matrix_basis.identity()
    for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.shape_keys]:
        for data in list(collection):collection.remove(data)
    scene.frame_start=0;scene.frame_end=45;scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.data.orphans_purge(do_recursive=True);bpy.context.preferences.filepaths.save_version=0
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)
if __name__=='__main__':build(Path(sys.argv[sys.argv.index('--')+1]).resolve())
