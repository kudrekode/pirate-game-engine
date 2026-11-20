"""Golden-native physical interaction poses. Reuses the offline ankle solver only.
No runtime IK, character regeneration, constraints or horizontal root motion.
"""
import importlib.util, sys, math
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
    def p(values, curl=.16): return m.pose(base, values, curl)
    neutral = p({})
    lead = p({'pelvis':(1,0,2),'spine_01':(2,0,2),'spine_02':(3,0,4),'clavicle_r':(0,0,5),'upperarm_r':(-24,-73,0),'lowerarm_r':(0,0,38),'neck_01':(-3,0,-3)})
    reach = p({'pelvis':(3,0,3),'spine_01':(3,0,2),'spine_02':(5,0,5),'spine_03':(1,0,2),'clavicle_r':(0,0,8),'upperarm_r':(-76,-84,0),'lowerarm_r':(0,0,18),'hand_r':(0,0,-6),'upperarm_l':(-3,76,0),'lowerarm_l':(0,0,-24),'neck_01':(-7,0,-5)})
    recover = p({'spine_02':(2,0,2),'upperarm_r':(-30,-73,0),'lowerarm_r':(0,0,42)})
    hinge = p({'pelvis':(15,0,1),'spine_01':(8,0,0),'spine_02':(8,0,3),'neck_01':(-6,0,-2),'upperarm_r':(-10,-76,0),'lowerarm_r':(0,0,24),'upperarm_l':(8,68,0),'lowerarm_l':(0,0,-30)})
    down = p({'pelvis':(30,0,2),'spine_01':(11,0,0),'spine_02':(12,0,4),'spine_03':(4,0,0),'neck_01':(-8,0,-3),'clavicle_r':(0,0,5),'upperarm_r':(-75,-84,0),'lowerarm_r':(0,0,12),'hand_r':(0,0,-3),'upperarm_l':(-32,72,0),'lowerarm_l':(0,0,-42)})
    rising = p({'pelvis':(12,0,1),'spine_01':(6,0,0),'spine_02':(6,0,2),'neck_01':(-8,0,0),'upperarm_r':(-18,-78,0),'lowerarm_r':(0,0,42),'upperarm_l':(3,73,0),'lowerarm_l':(0,0,-24)}, .28)
    motions = {
        'Interact': (.6, [(0,neutral,'smooth'),(.10,lead,'smooth'),(.25,reach,'accelerate'),(.31,reach,'smooth'),(.45,recover,'smooth'),(.6,neutral,'smooth')]),
        'Pickup': (.8, [(0,neutral,'smooth'),(.16,hinge,'smooth'),(.34,down,'accelerate'),(.40,down,'smooth'),(.59,rising,'smooth'),(.8,neutral,'smooth')]),
    }
    scene = bpy.context.scene; scene.render.fps = 60
    for name,(duration,keys) in motions.items():
        frames = []
        for frame in range(round(duration*60)+1):
            t = frame/60
            rotations = m.sample(keys,t)
            # Lower the pelvis first; planted-ankle authoring creates the knee bend.
            depth = .23 if name == 'Pickup' else .018
            envelope = math.sin(math.pi*min(t/(.40 if name=='Pickup' else .31),1)/2)**2 if t <= (.40 if name=='Pickup' else .31) else m.ease((duration-t)/(duration-(.40 if name=='Pickup' else .31)),'smooth')
            z = -depth*envelope
            for n,q in rotations.items(): arm.pose.bones[n].rotation_quaternion = q
            pelvis = arm.pose.bones['pelvis']
            pelvis.location = pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
            bpy.context.view_layer.update()
            rotations.update(m.plant_legs(arm,anchors))
            frames.append((rotations,z))
        action = bpy.data.actions.new('GoldenInteraction_'+name+'_V1'); action.use_fake_user=True
        arm.animation_data_create(); arm.animation_data.action = action
        for frame,(rotations,z) in enumerate(frames):
            for n in m.MAIN+m.FINGERS:
                b=arm.pose.bones[n]; b.rotation_quaternion=rotations[n]
                b.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=n)
            pelvis.location = pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
            pelvis.keyframe_insert(data_path='location',frame=frame,group='pelvis')
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points: key.interpolation='LINEAR'
        arm.animation_data.action=None
        for b in arm.pose.bones: b.matrix_basis.identity()
    for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.shape_keys]:
        for data in list(collection): collection.remove(data)
    scene.frame_start=0; scene.frame_end=48; scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active=arm
    bpy.data.orphans_purge(do_recursive=True); bpy.context.preferences.filepaths.save_version=0
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)
if __name__ == '__main__': build(Path(sys.argv[sys.argv.index('--')+1]).resolve())
