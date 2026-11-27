"""Validate the editable source, shipped skin, joint transforms and real animation deformation."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from studio import AFTER, BEFORE, EVIDENCE, load_actor, play


def metadata(path):
    data=path.read_bytes()
    length=int.from_bytes(data[12:16],"little")
    return json.loads(data[20:20+length]), data[28+length:]


def bones(asset):
    gltf, binary=metadata(asset)
    assert len(gltf["skins"])==1
    skin=gltf["skins"][0]
    accessor=gltf["accessors"][skin["inverseBindMatrices"]]
    view=gltf["bufferViews"][accessor["bufferView"]]
    offset=view.get("byteOffset",0)+accessor.get("byteOffset",0)
    matrices=np.frombuffer(binary,dtype="<f4",offset=offset,count=16*accessor["count"]).reshape(-1,16)
    joints={index:gltf["nodes"][index]["name"] for index in skin["joints"]}
    parents={joints[i]:joints[p] for p in joints for i in gltf["nodes"][p].get("children",[]) if i in joints}
    return {name:m for name,m in zip(joints.values(),matrices)}, parents


def sample(obj, frame):
    bpy.context.scene.frame_set(frame)
    posed=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return np.array([tuple(posed.matrix_world@v.co) for v in posed.data.vertices])


def verify():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/"oswin.blend"))
    pieces=[obj for obj in bpy.data.objects if obj.find_armature() and obj.type=="MESH"]
    assert any(obj.name.startswith("Coil and") for obj in pieces)
    assert all(img.packed_file for img in bpy.data.images if img.source=="FILE" and img.users)
    old,old_parents=bones(BEFORE)
    new,new_parents=bones(AFTER)
    assert set(old)==set(new) and old_parents==new_parents
    deviation=max(float(np.abs(new[name]-old[name]).max()) for name in new)
    assert deviation < .0001, deviation
    gltf,_=metadata(AFTER)
    assert all("bufferView" in image for image in gltf.get("images",[]))
    metrics={
        "glbSha256":hashlib.sha256(AFTER.read_bytes()).hexdigest(),
        "glbBytes":AFTER.stat().st_size,
        "joints":len(new),
        "maximumInverseBindMatrixDifference":deviation,
        "triangles":sum(gltf["accessors"][p["indices"]]["count"]//3 for mesh in gltf["meshes"] for p in mesh["primitives"]),
        "primitives":sum(len(mesh["primitives"]) for mesh in gltf["meshes"]),
        "embeddedImages":len(gltf.get("images",[])),
        "sampledClips":{},
    }
    for file in ("idle.glb","walk-in-place.glb"):
        arm=load_actor(AFTER)
        coat=next(obj for obj in arm.children_recursive if "deck clothes" in obj.name)
        meshes=[o for o in arm.children_recursive if o.type=="MESH"]
        for obj in meshes:
            assert obj.find_armature()==arm
            for vertex in obj.data.vertices:
                weights=[g.weight for g in vertex.groups if g.weight>0]
                assert 1<=len(weights)<=4 and abs(sum(weights)-1)<1e-4, (obj.name,vertex.index,weights)
        clip=play(arm,file)
        start, end=[int(f) for f in clip.frame_range]
        frames=[start,round(start+(end-start)*.27),round(start+(end-start)*.54)]
        samples=[sample(coat,f) for f in frames]
        for vertices in samples:
            assert np.isfinite(vertices).all()
            assert vertices[:,2].min()>-.17 and vertices[:,2].max()<2.1
        delta=max(float(np.linalg.norm(p-samples[0],axis=1).max()) for p in samples[1:])
        assert .002<delta<1.9, (clip.name,delta)
        metrics["sampledClips"][clip.name]={"frames":frames,"maximumSampledOutfitDisplacementMetres":round(delta,5)}
    report=EVIDENCE/"validation.json"
    report.write_text(json.dumps(metrics,indent="\t")+"\n",encoding="utf-8")
    print(json.dumps(metrics))


if __name__=="__main__":
    verify()
