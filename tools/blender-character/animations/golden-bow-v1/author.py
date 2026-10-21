"""One Golden-native bow fire. Only action data; no character exports.
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
    # Explicit world-space arm directions author the key poses, without IK.
    def archery(left_upper, left_lower, right_upper, right_lower, torso=0):
        pose = p({'pelvis':(0,0,torso*.25),'spine_02':(0,0,torso*.75),'neck_01':(0,0,-torso*.5)})
        for n,q in pose.items(): arm.pose.bones[n].rotation_quaternion=q
        bpy.context.view_layer.update()
        for side,upper,lower in [('l',left_upper,left_lower),('r',right_upper,right_lower)]:
            for stem,direction in [('upperarm',upper),('lowerarm',lower),('hand',lower)]:
                bone=arm.pose.bones[stem+'_'+side]
                rest=bone.bone.tail_local-bone.bone.head_local
                world=rest.rotation_difference(Vector(direction)) @ bone.bone.matrix_local.to_quaternion()
                m.set_world_rotation(bone,world)
                pose[bone.name]=bone.rotation_quaternion.copy()
        return pose
    raise_pose=archery((-.04,-1,-.3),(-.04,-1,.25),(-.5,-.8,-.2),(.55,-.8,.35),12)
    draw=archery((-.12,-1,-.02),(-.08,-1,.04),(-.9,.35,.15),(.78,-.63,.08),20)
    release=archery((-.12,-1,-.02),(-.08,-1,.04),(-.95,.4,.12),(.83,-.55,.15),20)
    recover=archery((.1,-.7,-.65),(-.1,-.8,-.3),(-.9,.2,-.3),(.7,-.5,.3),8)
    keys=[(0,ready,'smooth'),(.15,raise_pose,'smooth'),(.2666666667,draw,'smooth'),(.30,draw,'linear'),(.3333333333,release,'impact'),(.45,release,'smooth'),(.65,recover,'smooth'),(.85,ready,'smooth'),(.90,ready,'smooth')]
    scene = bpy.context.scene; scene.render.fps = 60
    frames = []
    for frame in range(55):
        rotations = m.sample(keys,frame/60)
        for n,q in rotations.items(): arm.pose.bones[n].rotation_quaternion=q
        bpy.context.view_layer.update()
        rotations.update(m.plant_legs(arm,anchors))
        frames.append(rotations)
    action=bpy.data.actions.new('GoldenBow_Fire_V1'); action.use_fake_user=True
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
    scene.frame_start=0;scene.frame_end=54;scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.data.orphans_purge(do_recursive=True);bpy.context.preferences.filepaths.save_version=0
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)
if __name__=='__main__':build(Path(sys.argv[sys.argv.index('--')+1]).resolve())
