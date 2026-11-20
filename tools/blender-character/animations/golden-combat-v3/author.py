"""Golden combat polish: anatomical poses, unequal phase timing, sampled at 60 Hz.
Only this separate source is saved. No runtime solver or character export.
Blender anatomical frame is +X left, -Y forward, +Z up.
"""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[4]
CANONICAL = ROOT / 'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'
IDLE = ROOT / 'public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb'
DRESSED = ROOT / 'public/assets/derived/authored-humans/everyday-v1/mannequin.glb'
MAIN = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'] + [n+'_'+s for s in ['l', 'r'] for n in ['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot', 'ball']]
FINGERS = [f+'_%02d_'%j+s for s in ['l', 'r'] for f in ['index', 'middle', 'ring', 'pinky', 'thumb'] for j in [1, 2, 3]]
FPS = 60


def rotation(bone, xyz):
    rest = bone.bone.matrix_local.to_quaternion()
    delta = Quaternion((1, 0, 0), math.radians(xyz[0])) @ Quaternion((0, 1, 0), math.radians(xyz[1])) @ Quaternion((0, 0, 1), math.radians(xyz[2]))
    return rest.inverted() @ delta @ rest


def pose(base, overrides, fist=0):
    result = {n:q.copy() for n,q in base.items()}
    for n,v in overrides.items():
        result[n] = rotation(ARM.pose.bones[n], v)
    for side,sign in [('l', 1), ('r', -1)]:
        for finger in ['index', 'middle', 'ring', 'pinky']:
            for j,angle in [(1, 78), (2, 88), (3, 35)]:
                n = f'{finger}_{j:02d}_{side}'
                result[n] = rotation(ARM.pose.bones[n], (0, sign*angle*fist, 0))
        # The thumb folds across the outside of the fingers, with less distal curl.
        for j,angle in [(1, 25), (2, 40), (3, 20)]:
            n = f'thumb_{j:02d}_{side}'
            result[n] = rotation(ARM.pose.bones[n], (angle*fist, sign*22*fist, sign*15*fist))
    return result


def ease(u, kind):
    u = max(0, min(1, u))
    if kind == 'accelerate':
        return u*u
    if kind == 'impact':
        return 1-(1-u)**3
    if kind == 'linear':
        return u
    return u*u*(3-2*u)


def sample(keys, t):
    for (ta,pa,_), (tb,pb,curve) in zip(keys, keys[1:]):
        if t <= tb+1e-8:
            u = ease((t-ta)/(tb-ta), curve)
            return {n:pa[n].slerp(pb[n],u) for n in pa}
    return keys[-1][1]


def set_world_rotation(bone, world):
    parent = bone.parent
    inherited = parent.matrix.to_quaternion() @ parent.bone.matrix_local.to_quaternion().inverted() @ bone.bone.matrix_local.to_quaternion()
    bone.rotation_quaternion = inherited.inverted() @ world
    bpy.context.view_layer.update()


def plant_legs(arm, anchors):
    for side in ['l', 'r']:
        thigh,calf,foot = [arm.pose.bones[n+'_'+side] for n in ['thigh','calf','foot']]
        target,foot_rotation = anchors[side]
        hip = thigh.head.copy()
        direction = target-hip
        distance = min(direction.length,thigh.length+calf.length-1e-6)
        axis = direction.normalized()
        bend = Vector((0,-1,0))
        bend = (bend-axis*bend.dot(axis)).normalized()
        along = (thigh.length**2-calf.length**2+distance**2)/(2*distance)
        knee = hip+axis*along+bend*math.sqrt(max(0,thigh.length**2-along**2))
        for bone,aim in [(thigh,knee-hip),(calf,target-knee)]:
            rest = bone.bone.tail_local-bone.bone.head_local
            desired = rest.rotation_difference(aim) @ bone.bone.matrix_local.to_quaternion()
            set_world_rotation(bone,desired)
        set_world_rotation(foot,foot_rotation)
    return {n:arm.pose.bones[n].rotation_quaternion.copy() for n in MAIN if n.startswith(('thigh_','calf_','foot_'))}


def build(output):
    global ARM
    bpy.ops.wm.open_mainfile(filepath=str(CANONICAL))
    ARM = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    old = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(IDLE))
    idle_arm = next(o for o in bpy.data.objects if o not in old and o.type == 'ARMATURE')
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    base = {n:idle_arm.pose.bones[n].matrix_basis.to_quaternion().copy() for n in MAIN}
    base.update({n:Quaternion() for n in FINGERS})
    for o in list(bpy.data.objects):
        if o != ARM:
            bpy.data.objects.remove(o,do_unlink=True)
    ARM.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for b in ARM.pose.bones:
        b.matrix_basis.identity()
        b.rotation_mode = 'QUATERNION'
    # Import the existing dressed output only to measure an offline floor envelope.
    # Meshes are discarded before saving. Only pelvis Z is baked, never X/Y.
    old = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(DRESSED))
    review = [o for o in bpy.data.objects if o not in old and o.type == 'MESH' and o.find_armature()]
    review_arm = review[0].find_armature()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    neutral = pose(base, {})
    for n,q in neutral.items():
        ARM.pose.bones[n].rotation_quaternion = q
    bpy.context.view_layer.update()
    anchors = {side:(ARM.pose.bones['foot_'+side].head.copy(),ARM.pose.bones['foot_'+side].matrix.to_quaternion().copy()) for side in ['l','r']}
    def p(overrides, fist=0):
        return pose(base, overrides, fist)
    ready = p({'pelvis':(0,0,-3), 'spine_01':(1,0,-3), 'spine_02':(1,0,-7), 'spine_03':(0,0,-3), 'neck_01':(0,0,5), 'Head':(0,0,5), 'clavicle_r':(0,0,-3), 'upperarm_r':(-25,-64,-7), 'lowerarm_r':(0,0,106), 'upperarm_l':(-18,64,4), 'lowerarm_l':(0,0,-116)}, .65)
    loaded = p({'pelvis':(0,0,-7), 'spine_01':(1,0,-5), 'spine_02':(1,0,-10), 'spine_03':(0,0,-4), 'neck_01':(0,0,8), 'Head':(0,0,9), 'clavicle_r':(0,0,-5), 'upperarm_r':(-24,-62,-10), 'lowerarm_r':(0,0,116), 'hand_r':(0,0,3), 'upperarm_l':(-18,64,4), 'lowerarm_l':(0,0,-116), 'thigh_l':(-2,0,3), 'thigh_r':(-3,0,4), 'calf_l':(3,0,0), 'calf_r':(4,0,0), 'foot_l':(-2,0,0), 'foot_r':(-3,0,0)}, .95)
    drive = p({'pelvis':(0,0,5), 'spine_01':(2,0,4), 'spine_02':(2,0,1), 'spine_03':(0,0,-4), 'neck_01':(0,0,-2), 'Head':(-2,0,-2), 'clavicle_r':(0,0,2), 'upperarm_r':(-63,-80,-3), 'lowerarm_r':(0,0,65), 'upperarm_l':(-18,64,4), 'lowerarm_l':(0,0,-116), 'thigh_l':(-1,0,-3), 'thigh_r':(-2,0,-3), 'calf_l':(2,0,0), 'calf_r':(3,0,0)}, 1)
    strike = p({'pelvis':(0,0,7), 'spine_01':(3,0,5), 'spine_02':(3,0,11), 'spine_03':(1,0,4), 'neck_01':(-3,0,-8), 'Head':(-2,0,-9), 'clavicle_r':(0,0,6), 'upperarm_r':(-99,-88,0), 'lowerarm_r':(0,0,12), 'hand_r':(0,0,-3), 'upperarm_l':(-12,66,2), 'lowerarm_l':(0,0,-120), 'thigh_l':(-2,0,-4), 'thigh_r':(-3,0,-5), 'calf_l':(3,0,0), 'calf_r':(4,0,0), 'foot_l':(-2,0,0), 'foot_r':(-3,0,0)}, 1)
    retract = p({'pelvis':(0,0,3), 'spine_01':(1,0,3), 'spine_02':(1,0,7), 'spine_03':(0,0,1), 'neck_01':(-1,0,-4), 'Head':(-1,0,-6), 'upperarm_r':(-50,-68,-2), 'lowerarm_r':(0,0,95), 'upperarm_l':(-18,66,2), 'lowerarm_l':(0,0,-108)}, .9)
    guard = p({'spine_02':(1,0,-2), 'upperarm_r':(-17,-71,-2), 'lowerarm_r':(0,0,65), 'upperarm_l':(-10,73,0), 'lowerarm_l':(0,0,-62)}, .55)
    shock = p({'pelvis':(-1,0,1), 'spine_01':(-2,0,-2), 'spine_02':(-12,2,-5), 'spine_03':(-7,1,-3), 'neck_01':(4,0,1), 'Head':(-8,-2,4), 'upperarm_l':(2,66,-5), 'upperarm_r':(-8,-62,12), 'lowerarm_l':(0,0,-22), 'lowerarm_r':(0,0,36)}, 0)
    recoil = p({'pelvis':(-4,0,2), 'spine_01':(-5,0,-3), 'spine_02':(-10,3,-4), 'spine_03':(-4,0,-2), 'neck_01':(4,0,0), 'Head':(-5,-2,3), 'upperarm_l':(-12,58,-7), 'upperarm_r':(-10,-68,8), 'lowerarm_l':(0,0,-45), 'lowerarm_r':(0,0,27), 'thigh_l':(4,0,-2), 'thigh_r':(4,0,-2), 'foot_l':(0,0,0), 'foot_r':(0,0,0)}, 0)
    balance = p({'pelvis':(-1,0,-1), 'spine_01':(2,0,1), 'spine_02':(3,-1,2), 'spine_03':(1,0,1), 'neck_01':(-2,0,-1), 'Head':(3,0,-1), 'upperarm_l':(-7,70,-2), 'upperarm_r':(-4,-72,3), 'lowerarm_l':(0,0,-25), 'lowerarm_r':(0,0,18)}, 0)
    buckle = p({'pelvis':(-8,0,3), 'spine_01':(11,0,-2), 'spine_02':(5,0,-4), 'spine_03':(-3,0,-2), 'neck_01':(8,0,0), 'Head':(-5,0,6), 'thigh_l':(-29,0,-3), 'thigh_r':(-23,0,3), 'calf_l':(68,0,0), 'calf_r':(58,0,0), 'foot_l':(-30,0,0), 'foot_r':(-29,0,0), 'upperarm_l':(-10,58,-6), 'upperarm_r':(-14,-62,10), 'lowerarm_l':(0,0,-25), 'lowerarm_r':(0,0,35)}, 0)
    tip = p({'pelvis':(-35,0,4), 'spine_01':(9,0,-2), 'spine_02':(3,0,-3), 'spine_03':(-5,0,0), 'neck_01':(8,0,0), 'Head':(3,0,9), 'thigh_l':(-18,0,-6), 'thigh_r':(-10,0,7), 'calf_l':(103,0,0), 'calf_r':(91,0,0), 'foot_l':(-28,0,0), 'foot_r':(-23,0,0), 'upperarm_l':(5,46,-10), 'upperarm_r':(0,-52,12), 'lowerarm_l':(0,0,-32), 'lowerarm_r':(0,0,42)}, 0)
    fall = p({'pelvis':(-68,0,3), 'spine_01':(6,0,-2), 'spine_02':(3,0,0), 'spine_03':(-2,0,0), 'neck_01':(9,0,0), 'Head':(5,0,12), 'thigh_l':(-25,0,-9), 'thigh_r':(-20,0,7), 'calf_l':(50,0,0), 'calf_r':(40,0,0), 'foot_l':(-17,0,0), 'foot_r':(-15,0,0), 'upperarm_l':(8,35,-12), 'upperarm_r':(9,-43,15), 'lowerarm_l':(0,0,-40), 'lowerarm_r':(0,0,32)}, 0)
    contact = p({'pelvis':(-92,0,2), 'spine_01':(1,0,-1), 'spine_02':(-2,0,0), 'spine_03':(0,0,0), 'neck_01':(8,0,0), 'Head':(8,0,13), 'thigh_l':(-24,0,-8), 'thigh_r':(-8,0,6), 'calf_l':(48,0,0), 'calf_r':(16,0,0), 'foot_l':(-9,0,0), 'foot_r':(-4,0,0), 'ball_l':(0,0,0), 'ball_r':(0,0,0), 'upperarm_l':(0,59,-2), 'upperarm_r':(0,-58,3), 'lowerarm_l':(0,0,-12), 'lowerarm_r':(0,0,19), 'hand_l':(0,0,8), 'hand_r':(0,0,-7)}, 0)
    settle = p({'pelvis':(-88,0,1), 'spine_01':(0,0,0), 'spine_02':(0,0,0), 'spine_03':(0,0,0), 'neck_01':(3,0,0), 'Head':(0,0,16), 'thigh_l':(-18,0,-8), 'thigh_r':(-2,0,6), 'calf_l':(36,0,0), 'calf_r':(4,0,0), 'foot_l':(-11,0,0), 'foot_r':(-5,0,0), 'ball_l':(0,0,0), 'ball_r':(0,0,0), 'upperarm_l':(0,63,0), 'upperarm_r':(0,-62,0), 'lowerarm_l':(0,0,-8), 'lowerarm_r':(0,0,4), 'hand_l':(0,0,0), 'hand_r':(0,0,0)}, 0)
    clips = {
        'Attack':[(0,guard,'smooth'),(.08,ready,'impact'),(.15,loaded,'smooth'),(.1833333333,drive,'accelerate'),(.2333333333,strike,'accelerate'),(.2666666667,strike,'linear'),(.35,retract,'impact'),(.4166666667,guard,'smooth'),(.50,guard,'smooth'),(.60,guard,'smooth')],
        'Hit':[(0,neutral,'smooth'),(.05,shock,'impact'),(.1166666667,recoil,'smooth'),(.25,balance,'smooth'),(.45,neutral,'smooth')],
        'Death':[(0,neutral,'smooth'),(.0666666667,shock,'impact'),(.25,buckle,'accelerate'),(.4333333333,tip,'accelerate'),(.60,fall,'accelerate'),(.7666666667,contact,'accelerate'),(1.05,settle,'impact'),(1.30,settle,'smooth'),(1.65,settle,'smooth')],
    }
    scene = bpy.context.scene
    scene.render.fps = FPS
    deps = bpy.context.evaluated_depsgraph_get()
    floor_rows = []
    for name,keys in clips.items():
        frames = []
        for frame in range(round(keys[-1][0]*FPS)+1):
            rotations = sample(keys, frame/FPS)
            if name != 'Death':
                for n,q in rotations.items():
                    ARM.pose.bones[n].rotation_quaternion = q
                bpy.context.view_layer.update()
                rotations.update(plant_legs(ARM,anchors))
            for n,q in rotations.items():
                ARM.pose.bones[n].rotation_quaternion = q
                review_arm.pose.bones[n].rotation_mode = 'QUATERNION'
                review_arm.pose.bones[n].rotation_quaternion = q
            review_arm.pose.bones['pelvis'].location = (0,0,0)
            pelvis = ARM.pose.bones['pelvis']
            pelvis.location = (0,0,0)
            bpy.context.view_layer.update()
            z = 0
            if name == 'Death':
                minimum = min((mesh.matrix_world @ v.co).z for mesh in review for v in mesh.evaluated_get(deps).data.vertices)
                z = .01-minimum
                floor_rows.append([round(frame/FPS,6),round(z,6)])
            frames.append((rotations,z))
        action = bpy.data.actions.new('GoldenCombat_'+name+'_V1')
        action.use_fake_user = True
        ARM.animation_data_create()
        ARM.animation_data.action = action
        channels = MAIN+FINGERS if name == 'Attack' else MAIN
        for frame,(rotations,z) in enumerate(frames):
            for n in channels:
                bone = ARM.pose.bones[n]
                bone.rotation_quaternion = rotations[n]
                bone.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=n)
            if name == 'Death':
                pelvis = ARM.pose.bones['pelvis']
                pelvis.location = pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
                pelvis.keyframe_insert(data_path='location',frame=frame,group='pelvis')
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
        ARM.animation_data.action = None
        for b in ARM.pose.bones:
            b.matrix_basis.identity()
    print('BAKED_FLOOR', floor_rows[::5])
    for o in list(bpy.data.objects):
        if o != ARM:
            bpy.data.objects.remove(o,do_unlink=True)
    for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.shape_keys]:
        for data in list(collection):
            collection.remove(data)
    scene.frame_start = 0
    scene.frame_end = 99
    scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    ARM.select_set(True)
    bpy.context.view_layer.objects.active = ARM
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)


if __name__ == '__main__':
    build(Path(sys.argv[sys.argv.index('--')+1]).resolve())
