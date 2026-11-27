"""Edric's matched Cycles plates. Ward overlays the baked Golden idle stance."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE.parent))
from studio import ASSETS, CLIPS, EVIDENCE as HUMAN_PLATES, load_actor, play, studio

BELL=ASSETS/"hollow-kingdom/bell-court"
BEFORE=BELL/"keeper.glb"
AFTER=ASSETS/"hollow-kingdom/art-library/humans/keeper/keeper.glb"
OUTPUT=HUMAN_PLATES/"keeper"
ATTACK=ASSETS/"derived/humanoid-animations/golden-sword-v1/actions.glb"
WARD=BELL/"ward.glb"


def get_pose(path, frame):
    old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    donor=next(o for o in set(bpy.data.objects)-old if o.type=="ARMATURE")
    sk=donor.animation_data
    clip=sk.action if sk.action else sk.nla_tracks[0].strips[0].action
    bpy.context.scene.frame_set(frame)
    rotations={b.name:b.matrix_basis.copy() for b in donor.pose.bones}
    for o in set(bpy.data.objects)-old:
        bpy.data.objects.remove(o,do_unlink=True)
    return rotations


def pose(arm, kind, frame):
    idle=get_pose(CLIPS/"idle.glb",12)
    slash=get_pose(ATTACK,0 if kind=="ward" else frame)
    if kind=="ward":
        ward=get_pose(WARD,frame)
        # The runtime blends the ward over idle and applies finger grip after the mixer.
        for n in ["spine_02","spine_03","neck_01","upperarm_r","lowerarm_r","hand_r",
                  "upperarm_l","lowerarm_l","hand_l"]:
            idle[n]=ward[n]
        for n in idle:
            if n.endswith("_r") and n.split("_")[0] in ["index","middle","ring","pinky","thumb"]:
                idle[n]=slash[n]
        result=idle
    else:
        result=slash
    arm.animation_data_clear()
    for n,m in result.items():
        arm.pose.bones[n].matrix_basis=m
    bpy.context.view_layer.update()


def socket(arm):
    # GLTF joint-local grip -> Blender world. The imported bone's local axes
    # can differ from the glTF joint. Recover that fixed basis at bind time.
    import json
    data=BEFORE.read_bytes()
    gltf=json.loads(data[20:20+int.from_bytes(data[12:16],"little")])
    nodes=gltf["nodes"]
    parents={i:p for p,n in enumerate(nodes) for i in n.get("children",[])}
    ix=next(i for i,n in enumerate(nodes) if n.get("name")=="hand_r")
    chain=[ix]
    while chain[-1] in parents:
        chain.append(parents[chain[-1]])
    hand=Matrix.Identity(4)
    for i in reversed(chain):
        n=nodes[i];q=n.get("rotation",[0,0,0,1])
        hand=hand@Matrix.LocRotScale(Vector(n.get("translation",[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(n.get("scale",[1,1,1])))
    yup=Matrix.Rotation(math.pi/2,4,"X")
    # Three Euler XYZ composes Rx Ry Rz. The GLB mesh is imported in Blender Z-up.
    grip=Matrix.Translation(Vector((-.035,.095,.008)))@Matrix.Rotation(math.pi/2,4,"X")@Matrix.Rotation(-math.pi/8,4,"Z")
    world_hand=arm.matrix_world@arm.pose.bones["hand_r"].matrix
    rest_hand=arm.matrix_world@arm.data.bones["hand_r"].matrix_local
    return world_hand @ rest_hand.inverted() @ yup @ hand @ grip @ yup.inverted()


def blade(arm):
    old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(BELL/"hanger.glb"))
    transform=socket(arm)
    for obj in set(bpy.data.objects)-old:
        if obj.parent is None:
            obj.matrix_world=transform@obj.matrix_world


def render(take,kind):
    arm=load_actor(BEFORE if take=="before" else AFTER)
    pose(arm,kind,3 if kind=="ward" else 7)
    blade(arm)
    scene=studio()
    scene.render.resolution_x,scene.render.resolution_y=650,740
    camera=scene.camera
    detail=kind=="portrait"
    for close in ([False,True] if kind=="ward" else [False]):
        target=Vector((-.04,0,1.49 if close else 1.18))
        camera.location=target+Vector((-.98,-3.65,.28 if close else .56))
        camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
        camera.data.ortho_scale=1.03 if close else 2.61
        scene.render.filepath=str(OUTPUT/(take+"-"+("portrait" if close else kind)+".png"))
        bpy.ops.render.render(write_still=True)


if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:]
    for take in args:
        assert take in ("before","after")
        for kind in ["ward","strike"]:
            render(take,kind)
