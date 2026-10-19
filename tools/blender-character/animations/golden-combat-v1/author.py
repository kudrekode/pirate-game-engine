"""Golden-native V1 pose/timing source. No retargeting or character export.
Rebuild only this separate animation package; canonical references are read-only.
Blender coordinates: +X left, -Y forward, +Z up; deltas are anatomical rest axes.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from mathutils import Euler, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[4]
CANONICAL = ROOT / 'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'
IDLE = ROOT / 'public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb'
MAIN = ['pelvis','spine_01','spine_02','spine_03','neck_01','Head'] + [n+'_'+s for s in ['l','r'] for n in ['clavicle','upperarm','lowerarm','hand','thigh','calf','foot','ball']]
FINGERS = [f+'_%02d_'%j+s for s in ['l','r'] for f in ['index','middle','ring','pinky','thumb'] for j in [1,2,3]]

def rotation(bone, xyz):
    rest = bone.bone.matrix_local.to_quaternion()
    delta = Quaternion((1,0,0),math.radians(xyz[0])) @ Quaternion((0,1,0),math.radians(xyz[1])) @ Quaternion((0,0,1),math.radians(xyz[2]))
    return rest.inverted() @ delta @ rest

def pose(base, overrides, fist=0):
    result = {n:q.copy() for n,q in base.items()}
    for n,v in overrides.items(): result[n] = rotation(ARM.pose.bones[n],v)
    # Fingers curl toward the palm in the unchanged T-pose frame, then inherit
    # wrist/forearm motion. Thumb has a smaller opposing closure.
    for side,sign in [('l',1),('r',-1)]:
        for finger in ['index','middle','ring','pinky']:
            for j,angle in [(1,65),(2,80),(3,45)]:
                n=f'{finger}_{j:02d}_{side}'
                result[n]=rotation(ARM.pose.bones[n],(0,sign*angle*fist,0))
        for j,angle in [(1,25),(2,35),(3,25)]:
            n=f'thumb_{j:02d}_{side}'
            result[n]=rotation(ARM.pose.bones[n],(angle*fist,sign*20*fist,sign*15*fist))
    return result

def build(output):
    global ARM
    bpy.ops.wm.open_mainfile(filepath=str(CANONICAL))
    ARM=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    original=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(IDLE))
    idle_arm=next(o for o in bpy.data.objects if o not in original and o.type=='ARMATURE')
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    # Reuse the accepted neutral locomotion pose at boundaries, not its curves.
    base={n:idle_arm.pose.bones[n].matrix_basis.to_quaternion().copy() for n in MAIN}
    for n in FINGERS: base[n]=Quaternion()
    for o in list(bpy.data.objects):
        if o != ARM: bpy.data.objects.remove(o,do_unlink=True)
    ARM.animation_data_clear()
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    for p in ARM.pose.bones: p.matrix_basis.identity(); p.rotation_mode='QUATERNION'
    neutral=pose(base,{})
    prep=pose(base,{'spine_02':(0,0,-10),'spine_03':(0,0,-6),'upperarm_r':(-22,-66,-12),'lowerarm_r':(0,0,90),'upperarm_l':(-12,70,0),'lowerarm_l':(0,0,-65)},1)
    strike=pose(base,{'spine_02':(3,0,12),'spine_03':(2,0,8),'clavicle_r':(0,0,8),'upperarm_r':(-83,-88,0),'lowerarm_r':(0,0,8),'hand_r':(0,0,0),'upperarm_l':(-15,72,0),'lowerarm_l':(0,0,-55)},1)
    recoil=pose(base,{'spine_01':(-5,0,0),'spine_02':(-9,0,0),'spine_03':(-7,0,0),'neck_01':(6,0,0),'Head':(-5,0,0),'upperarm_l':(0,61,-6),'upperarm_r':(0,-61,6),'lowerarm_l':(0,0,-28),'lowerarm_r':(0,0,28)},0)
    buckle=pose(base,{'pelvis':(-10,0,0),'spine_01':(12,0,0),'spine_02':(8,0,0),'thigh_l':(-22,0,0),'thigh_r':(-18,0,0),'calf_l':(57,0,0),'calf_r':(51,0,0),'foot_l':(-25,0,0),'foot_r':(-23,0,0),'upperarm_l':(-15,65,0),'upperarm_r':(-18,-65,0)},0)
    falling=pose(base,{'pelvis':(-52,0,0),'spine_01':(5,0,0),'spine_02':(5,0,0),'Head':(12,0,0),'thigh_l':(30,0,0),'thigh_r':(24,0,0),'calf_l':(50,0,0),'calf_r':(43,0,0),'foot_l':(-28,0,0),'foot_r':(-18,0,0),'upperarm_l':(0,52,0),'upperarm_r':(0,-62,0),'lowerarm_l':(0,0,-30),'lowerarm_r':(0,0,22)},0)
    dead=pose(base,{'pelvis':(-88,0,0),'spine_01':(0,0,0),'spine_02':(0,0,0),'spine_03':(0,0,0),'neck_01':(4,0,0),'Head':(0,0,12),'thigh_l':(3,0,-5),'thigh_r':(0,0,5),'calf_l':(-5,0,0),'calf_r':(0,0,0),'foot_l':(0,0,0),'foot_r':(0,0,0),'ball_l':(0,0,0),'ball_r':(0,0,0),'upperarm_l':(0,60,0),'upperarm_r':(0,-65,0),'lowerarm_l':(0,0,-10),'lowerarm_r':(0,0,16),'hand_l':(0,0,0),'hand_r':(0,0,0)},0)
    # Seconds, pose, vertical pelvis displacement in metres. Hit has no
    # translation track. Death holds the final pose for 0.25 seconds.
    clips={'Attack':[(0,neutral,0),(.10,prep,0),(.20,strike,0),(.27,strike,0),(.50,neutral,0)],
           'Hit':[(0,neutral,0),(.10,recoil,0),(.18,recoil,0),(.33,neutral,0)],
           'Death':[(0,neutral,0),(.27,buckle,-.12),(.63,falling,-.42),(1.10,dead,-.81),(1.35,dead,-.81)]}
    # Reviewed vertical keys from the dressed body's floor-clearance measurements.
    # This is a fixed authored curve, not a runtime floor/foot solver.
    floor_keys=[(0,0),(.05,0),(.10,-.012),(.15,-.036),(.20,-.067),(.25,-.090),(.30,-.092),(.35,-.089),(.40,-.085),(.45,-.078),(.50,-.072),(.55,-.066),(.60,-.062),(.65,-.060),(.70,-.055),(.75,-.052),(.80,-.066),(.85,-.141),(.90,-.276),(.95,-.449),(1,-.619),(1.05,-.742),(1.10,-.779),(1.35,-.779)]
    scene=bpy.context.scene;scene.render.fps=60
    for name,keys in clips.items():
        action=bpy.data.actions.new('GoldenCombat_'+name+'_V1');action.use_fake_user=True
        ARM.animation_data_create();ARM.animation_data.action=action
        channels=MAIN+FINGERS if name=='Attack' else MAIN
        for frame in range(round(keys[-1][0]*60)+1):
            t=frame/60
            k=next((i for i in range(len(keys)-1) if keys[i][0]<=t<=keys[i+1][0]),len(keys)-2)
            t0,p0,z0=keys[k];t1,p1,z1=keys[k+1]
            u=max(0,min(1,(t-t0)/(t1-t0)));u=u*u*(3-2*u)
            for n in channels:
                bone=ARM.pose.bones[n];bone.rotation_quaternion=p0[n].slerp(p1[n],u)
                bone.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=n)
            if name=='Death':
                pelvis=ARM.pose.bones['pelvis']
                j=next((i for i in range(len(floor_keys)-1) if floor_keys[i][0]<=t<=floor_keys[i+1][0]),len(floor_keys)-2)
                ta,za=floor_keys[j];tb,zb=floor_keys[j+1]
                z=za+(zb-za)*max(0,min(1,(t-ta)/(tb-ta)))
                pelvis.location=pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,z))
                pelvis.keyframe_insert(data_path='location',frame=frame,group='pelvis')
        # Linear sampled quaternion curves avoid Bezier overshoot at impact/floor.
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
        ARM.animation_data.action=None
        for bone in ARM.pose.bones:bone.matrix_basis.identity()
    scene.frame_start=0;scene.frame_end=81;scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT');ARM.select_set(True);bpy.context.view_layer.objects.active=ARM
    output.parent.mkdir(parents=True,exist_ok=True)
    # Save only the armature and three Actions, never copied character payloads.
    for collection in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.shape_keys]:
        for data in list(collection):collection.remove(data)
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    build(Path(args[0]).resolve())
