"""Single authored outfit adapter; no geometry generation in product compiles."""
import hashlib
import json
from pathlib import Path
import bpy
import bmesh

SLOTS={'top':'Everyday_Top','bottoms':'Everyday_Trousers','footwear':'Everyday_Boots'}

def load_outfit(root,body,rig,selections,values):
    package=Path(root)/'tools/blender-character/clothing/everyday-v1'
    source=package/'outfit.blend'
    coverage=json.loads((package/'coverage.json').read_text())
    canonical=Path(root)/'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'
    assert coverage['bodySourceSha256']==hashlib.sha256(canonical.read_bytes()).hexdigest()
    assert coverage['bodyPolygonCount']==len(body.data.polygons)
    active=[slot for slot in SLOTS if selections.get(slot,'none')!='none']
    if not active:return {'components':{},'removedBodyFaces':0}
    with bpy.data.libraries.load(str(source),link=False) as (available,loaded):
        loaded.objects=[SLOTS[slot] for slot in active]
    components={}
    for slot,obj in zip(active,loaded.objects):
        bpy.context.collection.objects.link(obj)
        world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world
        for mod in obj.modifiers:
            if mod.type=='ARMATURE':mod.object=rig
        for key in obj.data.shape_keys.key_blocks:key.value=values.get(key.name,0)
        components[slot]={'componentId':selections[slot]['componentId'],'revision':selections[slot]['revision'],'color':selections[slot]['color'],'sourceHash':hashlib.sha256(source.read_bytes()).hexdigest(),'mesh':obj.name,'materialNames':[m.name for m in obj.data.materials]}
    # Preserve stable body vertex IDs and UVs: remove faces only on a temporary
    # compile mesh. Orphaned vertices retain the canonical height/reference extent.
    hidden=set(i for slot in active for i in coverage['masks'][slot])
    bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in sorted(hidden)],context='FACES_ONLY')
    bm.to_mesh(body.data);bm.free();body.data.update()
    return {'components':components,'removedBodyFaces':len(hidden),'coverageHash':hashlib.sha256((package/'coverage.json').read_bytes()).hexdigest()}
