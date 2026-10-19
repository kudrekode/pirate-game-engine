"""Project-authored in-place locomotion on the unchanged Golden rig, 60 Hz.
No character export. Reuses the established offline pose and ankle solver.
Anatomical Blender frame: +X left, -Y forward, +Z up.
"""
import math, sys
from pathlib import Path
import bpy
from mathutils import Quaternion, Vector
ROOT = Path(__file__).resolve().parents[4]
CANONICAL = ROOT / 'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'
IDLE = ROOT / 'public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb'
MAIN = ['pelvis','spine_01','spine_02','spine_03','neck_01','Head'] + [n+'_'+s for s in ['l','r'] for n in ['clavicle','upperarm','lowerarm','hand','thigh','calf','foot','ball']]
FINGERS = [f+'_%02d_'%j+s for s in ['l','r'] for f in ['index','middle','ring','pinky','thumb'] for j in [1,2,3]]
FPS=60

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
    ARM=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(IDLE))
    idle=next(o for o in bpy.data.objects if o not in old and o.type=='ARMATURE')
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    base={n:idle.pose.bones[n].matrix_basis.to_quaternion().copy() for n in MAIN}
    base.update({n:Quaternion() for n in FINGERS})
    for o in list(bpy.data.objects):
        if o!=ARM: bpy.data.objects.remove(o,do_unlink=True)
    ARM.animation_data_clear()
    for action in list(bpy.data.actions): bpy.data.actions.remove(action)
    for b in ARM.pose.bones:
        b.matrix_basis.identity(); b.rotation_mode='QUATERNION'
    for n,q in base.items(): ARM.pose.bones[n].rotation_quaternion=q
    bpy.context.view_layer.update()
    anchors={s:(ARM.pose.bones['foot_'+s].head.copy(),ARM.pose.bones['foot_'+s].matrix.to_quaternion().copy()) for s in ['l','r']}
    # Read the existing dressed output only for the offline floor envelope.
    old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets/derived/authored-humans/everyday-v1/mannequin.glb'))
    review=[o for o in bpy.data.objects if o not in old and o.type=='MESH' and o.find_armature()]
    review_arm=review[0].find_armature(); review_arm.animation_data_clear()
    deps=bpy.context.evaluated_depsgraph_get()
    neutral=pose(base,{})
    prep=pose(base,{'pelvis':(5,0,0),'spine_02':(8,0,0),'neck_01':(-6,0,0),'upperarm_l':(18,70,0),'upperarm_r':(14,-70,0),'lowerarm_l':(0,0,-42),'lowerarm_r':(0,0,48)})
    extend=pose(base,{'pelvis':(3,0,0),'spine_02':(-2,0,0),'upperarm_l':(-40,65,0),'upperarm_r':(-36,-67,0),'lowerarm_l':(0,0,-65),'lowerarm_r':(0,0,70),'thigh_l':(-8,0,0),'thigh_r':(-3,0,0),'calf_l':(12,0,0),'calf_r':(8,0,0)})
    air=pose(base,{'pelvis':(3,0,-2),'spine_02':(2,0,2),'neck_01':(-4,0,0),'upperarm_l':(-20,58,0),'upperarm_r':(-14,-61,0),'lowerarm_l':(0,0,-48),'lowerarm_r':(0,0,56),'thigh_l':(-24,0,-3),'thigh_r':(-14,0,3),'calf_l':(42,0,0),'calf_r':(30,0,0),'foot_l':(-12,0,0),'foot_r':(-8,0,0)})
    fall=pose(base,{'pelvis':(2,0,0),'spine_02':(3,0,0),'neck_01':(-4,0,0),'upperarm_l':(-6,57,-3),'upperarm_r':(-10,-60,3),'lowerarm_l':(0,0,-34),'lowerarm_r':(0,0,42),'thigh_l':(-9,0,-2),'thigh_r':(-5,0,2),'calf_l':(19,0,0),'calf_r':(14,0,0),'foot_l':(-8,0,0),'foot_r':(-5,0,0)})
    scene=bpy.context.scene; scene.render.fps=FPS
    durations={'Run':40/60,'Jump':18/60,'Fall':36/60,'Land':13/60}
    for name,duration in durations.items():
        frames=[]
        for frame in range(round(duration*FPS)+1):
            t=frame/FPS; u=t/duration; z=0
            targets={s:(v[0].copy(),v[1].copy()) for s,v in anchors.items()}
            if name=='Run':
                phase=2*math.pi*u
                sway=math.sin(phase)
                rotations=pose(base,{'pelvis':(7,1.5*math.cos(phase),4*sway),'spine_01':(3,0,-2*sway),'spine_02':(5,0,-6*sway),'neck_01':(-9,0,2*sway),'Head':(-3,0,0),
                    'upperarm_l':(30*sway,69,-3),'upperarm_r':(-33*sway,-69,3),'lowerarm_l':(0,0,-78-12*sway),'lowerarm_r':(0,0,80-10*sway)})
                z=-.045+.035*(1-math.cos(2*phase))/2
                for side,offset in [('l',0),('r',.5)]:
                    cycle=(u+offset)%1
                    # Half-cycle stance travels backwards, half-cycle swing lifts forward.
                    foot_y=-.43+1.72*cycle if cycle<.5 else .43-.86*ease((cycle-.5)*2,'smooth')
                    lift=0 if cycle<.5 else .27*math.sin(math.pi*(cycle-.5)*2)
                    targets[side][0].y+=foot_y
                    targets[side][0].z+=lift
            elif name=='Jump':
                keys=[(0,neutral,'smooth'),(.05,prep,'impact'),(.15,extend,'accelerate'),(.3,air,'smooth')]
                rotations=sample(keys,t)
                z=-.10*math.sin(math.pi*min(t/.15,1)) if t<.15 else 0
            elif name=='Fall':
                rotations={n:q.copy() for n,q in fall.items()}
                rotations['spine_02']=rotation(ARM.pose.bones['spine_02'],(3+math.sin(2*math.pi*u),0,0))
            else:
                keys=[(0,fall,'smooth'),(.0666667,prep,'impact'),(13/60,neutral,'smooth')]
                rotations=sample(keys,t)
                z=-.13*math.sin(math.pi*u)**.7
            for n,q in rotations.items(): ARM.pose.bones[n].rotation_quaternion=q
            pelvis=ARM.pose.bones['pelvis']
            pelvis.location=pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
            bpy.context.view_layer.update()
            if name in ['Run','Land'] or (name=='Jump' and t<=.1): rotations.update(plant_legs(ARM,targets))
            if name != 'Fall':
                for n,q in rotations.items():
                    b=review_arm.pose.bones[n];b.rotation_mode='QUATERNION';b.rotation_quaternion=q
                rb=review_arm.pose.bones['pelvis']
                rb.location=rb.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
                bpy.context.view_layer.update()
                minimum=min((mesh.matrix_world @ v.co).z for mesh in review for v in mesh.evaluated_get(deps).data.vertices)
                z+=max(0,.008-minimum)
            frames.append((rotations,z))
        action=bpy.data.actions.new('GoldenMovement_'+name+'_V1'); action.use_fake_user=True
        ARM.animation_data_create(); ARM.animation_data.action=action
        for frame,(rotations,z) in enumerate(frames):
            for n in MAIN:
                b=ARM.pose.bones[n]; b.rotation_quaternion=rotations[n]
                b.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=n)
            if name in ['Run','Jump','Land']:
                pelvis.location=pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
                pelvis.keyframe_insert(data_path='location',frame=frame,group='pelvis')
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points: key.interpolation='LINEAR'
        ARM.animation_data.action=None
        for b in ARM.pose.bones: b.matrix_basis.identity()
    for o in list(bpy.data.objects):
        if o != ARM: bpy.data.objects.remove(o,do_unlink=True)
    for action in list(bpy.data.actions):
        if not action.name.startswith('GoldenMovement_'): bpy.data.actions.remove(action)
    for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.shape_keys]:
        for data in list(collection): collection.remove(data)
    scene.frame_start=0; scene.frame_end=40; scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT');ARM.select_set(True);bpy.context.view_layer.objects.active=ARM
    bpy.data.orphans_purge(do_recursive=True);bpy.context.preferences.filepaths.save_version=0
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)
if __name__=='__main__': build(Path(sys.argv[sys.argv.index('--')+1]).resolve())
