"""Cheap Blender source contracts; no art regeneration and no renders."""
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
PACKAGE=ROOT/'tools/blender-character/clothing/everyday-v1'
bpy.ops.wm.open_mainfile(filepath=str(PACKAGE/'outfit.blend'))
summary={}
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
    count=obj['canonical_surface_pairs'];assert len(obj.data.vertices)==2*count
    def weights(v):return {obj.vertex_groups[g.group].name:round(g.weight,7) for g in v.groups if g.weight>1e-7}
    largest_error=0
    for i in range(count):
        a,b=obj.data.vertices[i],obj.data.vertices[i+count]
        assert weights(a)==weights(b),('shell weights',obj.name,i)
        assert len(weights(a))<=4 and abs(sum(weights(a).values())-1)<1e-6
        for key in obj.data.shape_keys.key_blocks:
            gap=(key.data[i].co-key.data[i+count].co).length
            assert .0001<gap<.012,(obj.name,i,gap)
            largest_error=max(largest_error,abs(gap-(a.co-b.co).length))
    assert largest_error<1e-6
    assert set(obj.data.shape_keys.key_blocks.keys())=={'Basis','mass','athletic','broadFrame'}
    assert obj.data.uv_layers.active
    assert len(set(tuple(round(c,4) for c in uv.uv) for uv in obj.data.uv_layers.active.data))>100
    displacements={key.name:max((v.co-obj.data.shape_keys.key_blocks['Basis'].data[i].co).length for i,v in enumerate(key.data)) for key in obj.data.shape_keys.key_blocks if key.name!='Basis'}
    if obj['component_slot']!='footwear':
        assert all(1e-7<displacements[k]<limit for k,limit in [('mass',.03),('athletic',.008),('broadFrame',.01)]),displacements
    else:assert all(v==0 for v in displacements.values())
    summary[obj.name]={'pairs':count,'maximumShellDrift':largest_error,'morphMaximumMetres':displacements}
coverage=json.loads((PACKAGE/'coverage.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'))
body=bpy.data.objects['SuperHero_Male']
for slot,faces in coverage['masks'].items():
    assert len(faces)==len(set(faces)) and len(faces)>100
    for face in faces:
        for i in body.data.polygons[face].vertices:
            v=body.data.vertices[i].co
            if slot=='top':assert v.z<1.55 and abs(v.x)<.345
            if slot=='bottoms':assert .188<v.z<1.016
            if slot=='footwear':assert v.z<.176
out=ROOT/'test-results/first-outfit/source-validation.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(summary,indent=2));print('CLOTHING_SOURCE_PASS',json.dumps(summary))
