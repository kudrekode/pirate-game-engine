"""Author the single Everyday outfit source. Not run during character compilation.

Designed sewn panels, not a body duplicate. Stable triangle correspondences only
transport bounded identity deltas; the saved garment cage and weights are source.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v2 import SurfaceBinding

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'tools/blender-character/clothing/everyday-v1'
CANONICAL = ROOT / 'tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend'
SLOTS = {'top': 'Everyday_Top', 'bottoms': 'Everyday_Trousers', 'footwear': 'Everyday_Boots'}
COLORS = {'top': '#56616b', 'bottoms': '#303948', 'footwear': '#322b27'}

def linear(color):
    return [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in [int(color[i:i+2],16)/255 for i in (1,3,5)]]

def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear(color),1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

class Pattern:
    def __init__(self): self.points=[]; self.faces=[]; self.trim=[]
    def add(self,p):
        self.points.append(Vector(p)); return len(self.points)-1
    def ring(self,points): return [self.add(p) for p in points]
    def sew(self,a,b):
        assert len(a)==len(b)
        for i in range(len(a)):
            j=(i+1)%len(a); self.faces.append((a[i],a[j],b[j],b[i]))
    def strip(self,a,b):
        for i in range(len(a)-1): self.faces.append((a[i],a[i+1],b[i+1],b[i]))
    def ellipse(self,z,rx,front,back,n=72,cx=0):
        return self.ring([(cx+rx*math.sin(2*math.pi*i/n), (front+back)/2-(back-front)/2*math.cos(2*math.pi*i/n), z) for i in range(n)])

def shirt():
    p=Pattern(); n=72
    # The eased lower torso hangs across the abdomen instead of tracing muscles.
    stations=[(.962,.221,-.149,.203),(.973,.221,-.149,.203),(1.005,.213,-.145,.194),(1.075,.197,-.134,.166),(1.16,.199,-.137,.159),(1.245,.218,-.146,.178),(1.315,.235,-.146,.187)]
    rings=[p.ellipse(*s) for s in stations]
    for a,b in zip(rings,rings[1:]):p.sew(a,b)
    keys=[(0,(0,-.078,1.49)),(20,(.049,-.073,1.504)),(30,(.083,-.047,1.526)),(60,(.272,.005,1.533)),(75,(.246,-.008,1.42)),(90,(.230,.06,1.338)),(105,(.246,.148,1.42)),(120,(.272,.127,1.533)),(150,(.083,.108,1.539)),(160,(.049,.121,1.52)),(180,(0,.127,1.516))]
    def contour(deg):
        sign=1 if deg<=180 else -1; angle=deg if deg<=180 else 360-deg
        for (a,pa),(b,pb) in zip(keys,keys[1:]):
            if a<=angle<=b:
                q=Vector(pa).lerp(Vector(pb),(angle-a)/(b-a));q.x*=sign;return q
    start=rings[-1]
    for t in (.22,.45,.66,.83,1):
        ring=p.ring([p.points[start[i]].lerp(contour(i*5),t) for i in range(n)])
        p.sew(rings[-1],ring);rings.append(ring)
    top=rings[-1]
    shoulders={}
    for side in (1,-1):
        front=[(i*side)%n for i in range(6,13)];back=[(i*side)%n for i in range(30,23,-1)]
        strips=[[top[i] for i in front]]
        for step in range(1,9):
            t=step/9
            strips.append(p.ring([p.points[top[a]].lerp(p.points[top[b]],t)+Vector((0,0,.028*math.sin(math.pi*t))) for a,b in zip(front,back)]))
        strips.append([top[i] for i in back])
        for a,b in zip(strips,strips[1:]):p.strip(a,b)
        # Sew the sleeve into the complete armhole; no open shoulder bridge.
        hole=[top[(i*side)%n] for i in range(12,25)]+[row[-1] for row in reversed(strips[1:-1])]
        base=[p.points[i].copy() for i in hole];prev=hole
        for t in (.22,.45,.70,.93,1):
            sleeve=[]
            for q in base:
                theta=math.atan2(q.z-1.455,-(q.y-.065))
                end=Vector((side*.384,.065-.086*math.cos(theta),1.455+.091*math.sin(theta)))
                sleeve.append(q.lerp(end,t))
            ring=p.ring(sleeve);p.sew(prev,ring);prev=ring
    return p

def trousers():
    p=Pattern();rings=[]
    for s in [(1.06,.181,-.124,.167),(1.052,.182,-.124,.168),(1.026,.185,-.125,.171),(1.019,.187,-.126,.174),(.974,.204,-.126,.178),(.919,.217,-.118,.174),(.857,.219,-.109,.164)]:
        rings.append(p.ellipse(*s,n=48))
    for a,b in zip(rings,rings[1:]):p.sew(a,b)
    # Shared saddle seam connects the two trouser legs, preserving a real crotch.
    top=rings[-1];bridge=[top[24]]
    for i in range(1,8):
        t=i/8;bridge.append(p.add((0,.164+(-.109-.164)*t,.857-.045*math.sin(math.pi*t))))
    bridge.append(top[0])
    for side in (1,-1):
        half=[top[(i*side)%48] for i in range(25)]
        opening=half+bridge[1:-1];base=[p.points[i].copy() for i in opening]
        # Map around the branch with the same angular ordering as the saddle.
        angles=[]
        for q in base:angles.append(math.atan2(side*q.x-.115,-(q.y-.036)))
        prev=opening
        stations=[(.775,.118,.095,-.096,.152),(.69,.12,.091,-.070,.143),(.60,.119,.081,-.054,.140),(.548,.117,.079,-.048,.139),(.50,.116,.078,-.037,.153),(.41,.116,.080,-.019,.173),(.32,.115,.074,.009,.173),(.23,.115,.064,.018,.157),(.159,.115,.067,.001,.170),(.151,.115,.067,.001,.170)]
        for z,cx,rx,front,back in stations:
            ring=p.ring([(side*(cx+rx*math.sin(a)),(front+back)/2-(back-front)/2*math.cos(a),z) for a in angles])
            p.sew(prev,ring);prev=ring
    return p

def boots():
    p=Pattern()
    # Rounded toe box, separate welt/sole, instep and close ankle shaft.
    for side in (1,-1):
        rings=[]
        for z,rx,front,back in [(.004,.064,-.165,.155),(.011,.069,-.169,.159),(.026,.069,-.169,.159),(.031,.066,-.163,.153),(.055,.065,-.154,.146),(.079,.061,-.136,.14),(.104,.055,-.072,.139),(.137,.051,.005,.141),(.19,.052,.014,.145),(.20,.052,.014,.145)]:
            # Superellipse gives a sole and rounded rectangular toe, not a sock.
            points=[]
            for i in range(32):
                t=2*math.pi*i/32;sn=math.sin(t);cs=math.cos(t)
                points.append((side*.1143+rx*math.copysign(abs(sn)**.80,sn),(front+back)/2-(back-front)/2*math.copysign(abs(cs)**.80,cs),z))
            rings.append(p.ring(points))
        for a,b in zip(rings,rings[1:]):p.sew(a,b)
        p.faces.append(tuple(reversed(rings[0])))
    return p

def make_garment(slot,pattern,body,rig,surface):
    mesh=bpy.data.meshes.new(SLOTS[slot]+'_sewn_cage');mesh.from_pydata(pattern.points,[],pattern.faces);mesh.update()
    obj=bpy.data.objects.new(SLOTS[slot],mesh);bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    sub=obj.modifiers.new('Authored panel smoothing','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
    # Controlled local canonical clearance only, preserving the designed silhouette.
    # The full garment is never shrinkwrapped and never copies body indices.
    if slot!='footwear':
        for v in obj.data.vertices:
            loc,normal,_,_=surface.bvh.find_nearest(v.co)
            gap=(v.co-loc).dot(normal)
            if gap<.013:v.co+=normal*(.013-gap)
    mesh=obj.data
    if slot=='footwear':
        low=min(v.co.z for v in mesh.vertices);floor=min(v.co.z for v in body.data.vertices)
        for v in mesh.vertices:
            v.co.z+=(floor-low)*max(0,min(1,(.04-v.co.z)/(.04-low)))
    outer_count=len(mesh.vertices)
    bindings=surface.bind([v.co for v in mesh.vertices])
    source_weights=[{body.vertex_groups[g.group].name:g.weight for g in v.groups} for v in body.data.vertices]
    weights=[]
    for v,(ids,bary) in zip(mesh.vertices,bindings):
        values={}
        for i,a in zip(ids,bary):
            for name,w in source_weights[i].items():values[name]=values.get(name,0)+max(a,0)*w
        x,y,z=v.co;side='l' if x>=0 else 'r'
        if slot=='top':
            # Keep cuff rings rigid to upper arm and remove remote/neck influences.
            values={n:w for n,w in values.items() if n.startswith(('spine','clavicle','upperarm'))}
            t=max(0,min(1,(abs(x)-.255)/.07))
            values={n:w*(1-t) for n,w in values.items()};values['upperarm_'+side]=values.get('upperarm_'+side,0)+t
        elif slot=='bottoms':
            values={n:w for n,w in values.items() if n.startswith(('pelvis','spine_01','thigh','calf'))}
            if abs(x)>.03:values={n:w for n,w in values.items() if not n.endswith('_'+('r' if side=='l' else 'l'))}
            # Broader two-bone knee blend supports cloth over the kneecap.
            if z<.68:
                thigh=max(0,min(1,(z-.45)/.18));values={'thigh_'+side:thigh,'calf_'+side:1-thigh}
        else:
            ankle=max(0,min(1,(z-.105)/.065));toe=max(0,min(.45,(-y-.015)/.24))*(1-ankle)
            values={'calf_'+side:ankle,'foot_'+side:1-ankle-toe,'ball_'+side:toe}
        values=dict(sorted(values.items(),key=lambda pair:pair[1],reverse=True)[:4]);total=sum(values.values());assert total>0
        values={n:w/total for n,w in values.items() if w>1e-8};weights.append(values)
    if slot=='top':
        neighbors=[set() for _ in mesh.vertices]
        for edge in mesh.edges:
            a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
        # Cloth must distribute the shoulder bend over its own sewn rings.
        # Body weights alone produce alternating armpit folds on the eased cage.
        for _ in range(14):
            revised=[]
            for i,v in enumerate(mesh.vertices):
                strength=.6 if .12<abs(v.co.x)<.355 and v.co.z>1.30 else 0
                values=dict(weights[i])
                if strength and neighbors[i]:
                    values={n:w*(1-strength) for n,w in values.items()}
                    for j in neighbors[i]:
                        for n,w in weights[j].items():values[n]=values.get(n,0)+w*strength/len(neighbors[i])
                values=dict(sorted(values.items(),key=lambda pair:pair[1],reverse=True)[:4]);total=sum(values.values())
                revised.append({n:w/total for n,w in values.items()})
            weights=revised
    for name in rig.data.bones.keys():obj.vertex_groups.new(name=name)
    for i,values in enumerate(weights):
        for name,w in values.items():obj.vertex_groups[name].add([i],w,'REPLACE')
    # Real UV islands, packed once into the saved source. No compiler-time unwrap.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    mesh.materials.append(material('Everyday_'+slot,COLORS[slot],.86 if slot!='footwear' else .70))
    edge=material('Everyday_'+slot+'_edge',COLORS[slot],.90 if slot!='footwear' else .78)
    edge.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*[v*.70 for v in linear(COLORS[slot])],1)
    mesh.materials.append(edge)
    # Boundary-adjacent bands describe collar, sleeve hems, trouser cuffs and welt.
    boundary=set();counts={}
    for poly in mesh.polygons:
        for a,b in poly.edge_keys:counts[tuple(sorted((a,b)))]=counts.get(tuple(sorted((a,b))),0)+1
    for (a,b),count in counts.items():
        if count==1:boundary.update((a,b))
    for poly in mesh.polygons:
        center=sum((mesh.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
        poly.material_index=int(any(i in boundary for i in poly.vertices) or (slot=='bottoms' and center.z>1.024) or (slot=='footwear' and center.z<.032))
        poly.use_smooth=True
    # Solidify copies corresponding weights exactly to both surfaces.
    solid=obj.modifiers.new('Sewn fabric thickness','SOLIDIFY');solid.thickness=.0028 if slot!='footwear' else .0035;solid.offset=-1
    bpy.ops.object.modifier_apply(modifier=solid.name)
    # Capture correspondence after thickness so inner/outer targets remain paired.
    obj.shape_key_add(name='Basis')
    base=np.array([v.co[:] for v in body.data.shape_keys.key_blocks['Basis'].data])
    for name in ('mass','athletic','broadFrame'):
        delta=np.array([v.co[:] for v in body.data.shape_keys.key_blocks[name].data])-base
        moved=surface.transfer(bindings,delta)
        key=obj.shape_key_add(name=name,from_mix=False)
        for i,point in enumerate(key.data):
            # Solidify's duplicates preserve ordering. Paired surfaces have one fit.
            point.co=obj.data.shape_keys.key_blocks['Basis'].data[i].co + (Vector(moved[i%outer_count]) if slot!='footwear' else Vector((0,0,0)))
    obj.parent=rig;obj.modifiers.new('Golden rig','ARMATURE').object=rig
    obj['component_slot']=slot;obj['revision']='1';obj['canonical_surface_pairs']=outer_count
    return obj

def build():
    PACKAGE.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(CANONICAL))
    body=bpy.data.objects['SuperHero_Male'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    for o in list(bpy.data.objects):
        if o.name.startswith('V2_Tank'):bpy.data.objects.remove(o,do_unlink=True)
    surface=SurfaceBinding(body)
    garments=[make_garment(slot,fn(),body,rig,surface) for slot,fn in [('top',shirt),('bottoms',trousers),('footwear',boots)]]
    # Store face identities, not a positional compiler heuristic. Conservative
    # margins retain visible skin around collar/cuffs and overlapping waist/ankles.
    masks={slot:[] for slot in SLOTS}
    for poly in body.data.polygons:
        coords=[body.data.vertices[i].co for i in poly.vertices]
        if all(.998<v.z<1.43 and abs(v.x)<.29 for v in coords) or all(.20<abs(v.x)<.345 and 1.365<v.z<1.55 for v in coords):masks['top'].append(poly.index)
        if all(.188<v.z<1.016 for v in coords):masks['bottoms'].append(poly.index)
        if all(v.z<.176 for v in coords):masks['footwear'].append(poly.index)
    (PACKAGE/'coverage.json').write_text(json.dumps({'bodySourceSha256':hashlib.sha256(CANONICAL.read_bytes()).hexdigest(),'bodyPolygonCount':len(body.data.polygons),'masks':masks},separators=(',',':')))
    # Garments-only library: append meshes and rebind to the compiler's Golden rig.
    for o in list(bpy.data.objects):
        if o not in garments and o!=rig:bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(PACKAGE/'outfit.blend'))
    print('EVERYDAY_SOURCE',json.dumps({o.name:len(o.data.vertices) for o in garments}))

if __name__=='__main__':build()
