"""Bounded optional tank repair; never modifies the accepted body source."""
import json
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from authored_human_canonical import PACKAGE, OUT, subject, set_identity, CASES
from authored_human_v2 import SurfaceBinding, export

bpy.ops.wm.open_mainfile(filepath=str(PACKAGE/'candidate.blend'))
body,rig=subject()
tank=next(o for o in bpy.data.objects if o.name.startswith('V2_Tank'))
count=len(tank.data.vertices)//2
assert len(tank.data.vertices)==count*2
points=np.array([v.co[:] for v in tank.data.vertices])
gaps=np.linalg.norm(points[:count]-points[count:],axis=1)
assert np.max(gaps)<.003, 'Unexpected shell vertex correspondence'
surface=SurfaceBinding(body)
midpoints=(points[:count]+points[count:])/2
bindings=surface.bind(midpoints)
body_weights=[{body.vertex_groups[g.group].name:g.weight for g in v.groups} for v in body.data.vertices]
for i,(ids,bary) in enumerate(bindings):
    values={}
    for source,amount in zip(ids,bary):
        for name,value in body_weights[source].items():values[name]=values.get(name,0)+max(0,amount)*value
    values=dict(sorted(values.items(),key=lambda pair:pair[1],reverse=True)[:4])
    total=sum(values.values())
    for group in tank.vertex_groups:group.remove([i,i+count])
    for name,value in values.items():tank.vertex_groups[name].add([i,i+count],value/total,'REPLACE')
# Correct local clearance without changing neckline design. The same rest-space
# displacement is added to both shells and all identity targets.
corrections=np.zeros_like(midpoints)
for i,point in enumerate(midpoints):
    location,normal,_,_=surface.bvh.find_nearest(Vector(point))
    gap=(Vector(point)-location).dot(normal)
    if gap<.014:corrections[i]=np.array(normal)*(.014-gap)
for key in tank.data.shape_keys.key_blocks:
    for i,delta in enumerate(corrections):
        key.data[i].co+=Vector(delta);key.data[i+count].co+=Vector(delta)
destination=OUT/'tank'
destination.mkdir(parents=True,exist_ok=True)
set_identity({})
bpy.ops.wm.save_as_mainfile(filepath=str(destination/'tank-study.blend'))
for case in ('dressed-neutral','combined'):
    set_identity(CASES[case]);export(destination/(case+'.glb'))
(PACKAGE/'tank-study.json').write_text(json.dumps({'shellPairs':count,'maximumShellSeparationMm':float(max(gaps)*1000),'correctedPairs':int(np.count_nonzero(np.linalg.norm(corrections,axis=1))), 'sameWeightsOnBothShells':True,'status':'requires visual acceptance; excluded from creator'},indent=2))
