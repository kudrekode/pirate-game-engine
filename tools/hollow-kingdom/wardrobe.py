"""Dress the checked-in canonical Golden humanoid, retaining its deform skeleton."""
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import author as kit

OUT=ROOT/"public/assets/hollow-kingdom"
SOURCE=ROOT/"public/assets/derived/authored-humans/canonical-v1/mannequin.glb"


def cloth(name,tex):
    kit.material(name,tex)
    mat=kit.MATERIALS[name]
    return mat


def dress(name,hood):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    arm=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
    body=next(o for o in arm.children_recursive if o.name.startswith("SuperHero"))
    for image in bpy.data.images:
        if image.size[0]>512:
            image.scale(512,512)
            image.pack()
    coat=cloth("wool coat","indigo.jpg" if hood else "russet.jpg")
    mantle=cloth("mantle","charcoal.jpg" if hood else "loden.jpg")
    leather=cloth("oiled leather","oak.jpg")
    trousers=cloth("woven breeches","charcoal.jpg")
    kit.material("buckle",rgb=(.40,.23,.064))
    for m in (coat,leather,trousers): body.data.materials.append(m)
    def index(m): return body.data.materials.find(m.name)
    for p in body.data.polygons:
        x,y,z=body.matrix_world@p.center
        if z<.43: p.material_index=index(leather)
        elif z<.96: p.material_index=index(trousers)
        elif z<1.53 and abs(x)<.73: p.material_index=index(coat)
    # Create fitted clothing shells in metre space. The weight rings refer directly
    # to the same Golden bones as the body and the shared idle/walk clips.
    kit.mesh=kit.Mesh()
    m=kit.mesh
    assignments=[]
    def garment(rings,material,span=2*math.pi,count=24,start=0):
        coords=[]
        indices=[]
        for h,rx,ry,cy,bone,fold in rings:
            ring=[]
            for i in range(count+1):
                a=start+span*i/count
                r=1+fold*(math.sin(7*a+.6)+.34*math.cos(11*a))
                ring.append((rx*r*math.cos(a),cy+ry*r*math.sin(a),h+fold*.18*math.sin(5*a)))
            coords.append(ring)
            indices.append(bone)
        for j in range(len(coords)-1):
            for i in range(count):
                m.face([coords[j][i],coords[j][i+1],coords[j+1][i+1],coords[j+1][i]],material,
                       [(i/count,0),((i+1)/count,0),((i+1)/count,1),(i/count,1)])
                assignments.extend([indices[j]]*2+[indices[j+1]]*2)
    garment([(.73,.266,.213,.025,"pelvis",.072),(.96,.208,.154,.027,"pelvis",.035),
             (1.065,.168,.148,.026,"spine_01",.015),(1.27,.222,.164,.016,"spine_02",.018),
             (1.45,.248,.15,.023,"spine_03",.015),(1.525,.11,.102,.023,"neck_01",.01)],coat.name)
    garment([(1.017,.183,.162,.022,"spine_01",0),(1.086,.178,.155,.022,"spine_01",0)],leather.name)
    garment([(.63 if hood else .91,.307,.248,.035,"pelvis",.10),
             (1.16,.264,.205,.04,"spine_02",.055),(1.41,.283,.181,.031,"spine_03",.042),
             (1.53,.155,.141,.027,"spine_03",.025)],mantle.name,span=math.pi*1.18,start=-.09*math.pi)
    garment([(1.36,.235,.178,.028,"spine_03",.035),(1.48,.256,.155,.028,"spine_03",.023),
             (1.555,.13,.118,.03,"neck_01",.018)],mantle.name)
    if hood:
        garment([(1.49,.143,.138,.038,"neck_01",.024),(1.68,.143,.148,.025,"Head",.025),
                 (1.813,.126,.137,.031,"Head",.018),(1.874,.052,.075,.073,"Head",.018),
                 (1.853,.006,.015,.103,"Head",0)],mantle.name,span=math.pi*1.56,start=-.28*math.pi)
    else:
        garment([(1.739,.111,.124,.022,"Head",.012),(1.78,.124,.14,.022,"Head",.023),
                 (1.845,.105,.116,.043,"Head",.02),(1.863,.012,.02,.088,"Head",0)],coat.name)
    kit.block(0,-.147,1.035,.068,.021,.043,"buckle")
    assignments.extend(["spine_01"]*(len(m.points)-len(assignments)))
    outfit=m.finish("Tailored outerwear")
    outfit.parent=arm
    outfit.matrix_parent_inverse=arm.matrix_world.inverted()
    groups={b:outfit.vertex_groups.new(name=b) for b in sorted(set(assignments))}
    for i,b in enumerate(assignments): groups[b].add([i],1,"REPLACE")
    deform=outfit.modifiers.new("Golden skin","ARMATURE")
    deform.object=arm
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [arm.parent,arm,*arm.children_recursive]:
        if obj is not None: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+".glb")),use_selection=True,export_animations=False,
                             export_format="GLB",export_yup=True,export_all_vertex_colors=False)


if __name__=="__main__":
    dress("wayfarer",True)
    dress("ferryman",False)
