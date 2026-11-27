"""Round-trip the packed keeper and both shipped combat clips, including the real blade socket."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

HERE=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path[:0]=[str(HERE),str(HERE.parent)]
from plates import AFTER, BEFORE, OUTPUT, blade, load_actor, pose, socket
from verify import bones, metadata


def model_bounds(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return np.array([tuple(evaluated.matrix_world@v.co) for v in evaluated.data.vertices])


def record(path):
    arm=load_actor(path)
    meshes=[o for o in arm.children_recursive if o.type=="MESH"]
    for obj in meshes:
        assert obj.find_armature()==arm
        for v in obj.data.vertices:
            weights=[g.weight for g in v.groups if g.weight>0]
            assert 1<=len(weights)<=4 and abs(sum(weights)-1)<1e-4
    outfit=next(o for o in meshes if "field harness" in o.name or o.name.startswith("Riveted harness"))
    samples={}
    for kind,frames in [("ward",[0,2,5]),("strike",[0,4,7,12])]:
        sockets=[]
        positions=[]
        hand=[]
        for f in frames:
            pose(arm,kind,f)
            sockets.append(np.array(socket(arm)))
            vertices=model_bounds(outfit)
            assert np.isfinite(vertices).all() and vertices[:,2].min()>-.16 and vertices[:,2].max()<2.3
            positions.append(vertices)
            tips=[]
            for n in ["thumb_03_r","index_03_r","middle_03_r","ring_03_r","pinky_03_r"]:
                tips.append(tuple(arm.matrix_world@arm.pose.bones[n].tail))
            hand.append(tips)
        samples[kind]=(np.array(sockets),np.array(hand),frames,max(
            float(np.linalg.norm(vertices-positions[0],axis=1).max()) for vertices in positions[1:]))
    # Load the actual equipped asset and place it with the game socket transform.
    old=set(bpy.data.objects)
    blade(arm)
    weapon=next(o for o in set(bpy.data.objects)-old if o.type=="MESH")
    assert max(weapon.dimensions)>.5
    return samples


def verify():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/"keeper.blend"))
    assert len([o for o in bpy.data.objects if o.get("keeper_pattern")])==5
    assert all(img.packed_file for img in bpy.data.images if img.source=="FILE" and img.users)
    old,parents=bones(BEFORE)
    new,newparents=bones(AFTER)
    assert set(old)==set(new) and parents==newparents and "hand_r" in new
    deviation=max(float(np.abs(new[n]-old[n]).max()) for n in new)
    assert deviation<.0001
    baseline=record(BEFORE)
    final=record(AFTER)
    gltf,_=metadata(AFTER)
    assert all("bufferView" in img for img in gltf.get("images",[]))
    armour=next(m for m in gltf["materials"] if m["name"].startswith("Edric | oiled"))
    surface=armour["pbrMetallicRoughness"]
    assert "baseColorTexture" in surface and "metallicRoughnessTexture" in surface
    info={"glbSha256":hashlib.sha256(AFTER.read_bytes()).hexdigest(),"glbBytes":AFTER.stat().st_size,
          "joints":len(new),"maximumInverseBindMatrixDifference":deviation,
          "triangles":sum(gltf["accessors"][p["indices"]]["count"]//3 for m in gltf["meshes"] for p in m["primitives"]),
          "primitives":sum(len(m["primitives"]) for m in gltf["meshes"]),"embeddedImages":len(gltf["images"]),
          "weapon":"bell-hanger","socket":"hand_r","clips":{}}
    for kind, label in [("ward","OutsideWard"),("strike","GoldenSword_Attack_V1")]:
        mats,hands,frames,delta=final[kind]
        old_mats,old_hands,_,_=baseline[kind]
        grip_error=float(np.max(np.abs(mats-old_mats)))
        finger_error=float(np.max(np.linalg.norm(hands-old_hands,axis=2)))
        assert grip_error<.0001 and finger_error<.0001 and delta>.001
        info["clips"][label]={"frames":frames,"maximumSocketMatrixDifference":grip_error,
                              "maximumDistalFingerErrorMetres":finger_error,
                              "maximumArmourDisplacementMetres":round(delta,5)}
    (OUTPUT/"validation.json").write_text(json.dumps(info,indent="\t")+"\n",encoding="utf-8")
    print(json.dumps(info))


if __name__=="__main__":
    verify()