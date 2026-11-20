"""Build the Merewatch packhorse, its embedded gaits and the Golden seated rider clip.
Run from the repository root with Blender -b -P tools/hollow-kingdom/horse.py.
"""
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from author import MATERIALS, OUT, ROOT, material

TAU = math.tau
SADDLE_Y = 1.52
RIDER_OFFSET = .66
GAITS = {"HorseIdle": 72, "HorseWalk": 30, "HorseCanter": 18}
FPS = 30


def skin(a, b=None, ratio=0):
    return {a: 1.0} if b is None else {a: 1-ratio, b: ratio}


class Surface:
    """Loft elliptical anatomical sections into a skinned UV mesh."""
    def __init__(self):
        self.points, self.weights, self.faces, self.materials, self.uvs = [], [], [], [], []

    def face(self, indices, mat, uv):
        self.faces.append(indices)
        self.materials.append(mat)
        self.uvs.extend(uv)

    def tube(self, sections, mat, count=16, cross="horizontal"):
        # Sections carry center, lateral radius, depth radius and weights.
        start = len(self.points)
        for j, (center, rx, rd, weights) in enumerate(sections):
            cx, cy, cz = center
            for i in range(count):
                a = i*TAU/count
                x, d = rx*math.cos(a), rd*math.sin(a)
                self.points.append((cx+x, cy+d, cz) if cross == "horizontal" else (cx+x, cy, cz+d))
                self.weights.append(weights)
            if j:
                for i in range(count):
                    n = (i+1)%count
                    lo = start+(j-1)*count
                    hi = lo+count
                    self.face([lo+i, lo+n, hi+n, hi+i], mat[j-1] if isinstance(mat, list) else mat,
                              [(i/count,(j-1)/(len(sections)-1)),((i+1)/count,(j-1)/(len(sections)-1)),
                               ((i+1)/count,j/(len(sections)-1)),(i/count,j/(len(sections)-1))])
        for j, rev in [(0, True), (len(sections)-1, False)]:
            ring = list(range(count))[::-1] if rev else list(range(count))
            cap_mat = mat[0 if rev else -1] if isinstance(mat, list) else mat
            self.face([start+j*count+i for i in ring], cap_mat,
                      [(.5+.5*math.cos(i*TAU/count),.5+.5*math.sin(i*TAU/count)) for i in ring])

    def ellipsoid(self, center, radii, mat, bone):
        x,y,z = center
        rx,ry,rz = radii
        self.tube([((x,y,z+rz*math.sin(a)),max(.0001,rx*math.cos(a)),
                    max(.0001,ry*math.cos(a)),skin(bone)) for a in
                   [-1.55,-1.1,-.72,-.35,0,.35,.72,1.1,1.55]],mat,12)

    def finish(self, arm):
        mesh = bpy.data.meshes.new("Horse, bridle and travelling saddle")
        mesh.from_pydata(self.points, [], self.faces)
        materials = list(dict.fromkeys(self.materials))
        for name in materials:
            mesh.materials.append(MATERIALS[name])
        for p, name in zip(mesh.polygons,self.materials):
            p.material_index = materials.index(name)
            p.use_smooth = True
        layer = mesh.uv_layers.new(name="Coat and cloth")
        layer.data.foreach_set("uv",[v for pair in self.uvs for v in pair])
        obj = bpy.data.objects.new("Merewatch packhorse",mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = arm
        groups = {b.name:obj.vertex_groups.new(name=b.name) for b in arm.data.bones}
        for i,weights in enumerate(self.weights):
            for name,weight in weights.items():
                if weight:
                    groups[name].add([i],weight,"REPLACE")
        # Apply before skin so new vertices interpolate the painted weights.
        bpy.context.view_layer.objects.active = obj
        sub=obj.modifiers.new("Rounded breed silhouette","SUBSURF")
        sub.levels=1
        bpy.ops.object.modifier_apply(modifier=sub.name)
        # Subdivision can overshoot a unit weight by one float ULP.
        for vertex in obj.data.vertices:
            for member in vertex.groups:
                if member.weight > 1.0:
                    member.weight = 1.0
        assert not obj.data.validate()
        deform=obj.modifiers.new("Horse skeleton","ARMATURE")
        deform.object=arm
        return obj


def palette():
    # Repeatable dark bay hairs, baked into an embedded sRGB image.
    m = bpy.data.materials.new("Bay coat")
    m.use_nodes = True
    size = 192
    img = bpy.data.images.new("Winter bay hair",width=size,height=size,alpha=False)
    values=[]
    for y in range(size):
        for x in range(size):
            fibre=.5+.5*math.sin(TAU*(x*37/size+ .24*math.sin(TAU*y/size)+.13*math.sin(TAU*(3*y+x)/size)))
            dapple=.5+.5*math.sin(TAU*(3*x+2*y)/size)*math.cos(TAU*(5*y-x)/size)
            v=.93+.07*dapple+.032*fibre
            values.extend((.375*v,.202*v,.122*v,1))
    img.pixels.foreach_set(values)
    img.pack()
    tex=m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=img
    m.node_tree.links.new(tex.outputs["Color"],m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value=.91
    MATERIALS["bay"]=m
    for name,color in {"points":(.048,.025,.019),"mane":(.032,.019,.015),"hoof":(.10,.074,.053),
                       "leather":(.123,.055,.024),"rein":(.060,.028,.014),"brass":(.42,.23,.065),
                       "ivory":(.50,.43,.32),"eye":(.019,.012,.009),"nose":(.105,.069,.052)}.items():
        material(name,rgb=color)
    MATERIALS["eye"].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value=.17
    material("blanket","loden.jpg")


def rig():
    arm_data=bpy.data.armatures.new("Merewatch equine")
    arm=bpy.data.objects.new("PackhorseRig",arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    def bone(name,start,end,parent=None):
        b=arm_data.edit_bones.new(name)
        b.head,b.tail=start,end
        if parent:
            b.parent=arm_data.edit_bones[parent]
    bone("Body",(0,.25,1.18),(0,-.45,1.31))
    bone("Saddle",(0,0,SADDLE_Y),(0,-.08,SADDLE_Y),"Body")
    bone("Neck",(0,-.47,1.29),(0,-.92,1.76),"Body")
    bone("Head",(0,-.92,1.76),(0,-1.34,1.44),"Neck")
    bone("Tail",(0,.77,1.35),(0,1.02,.89),"Body")
    bone("TailTip",(0,1.02,.89),(0,1.12,.35),"Tail")
    for sign,side in [(1,"L"),(-1,"R")]:
        for limb,stations,names in [
            ("fore", [(-.47,1.22),(-.54,.64),(-.48,.18),(-.53,.065)], ["Upper","Cannon","Pastern"]),
            ("hind", [(.52,1.24),(.30,.91),(.68,.58),(.60,.17),(.56,.065)], ["Thigh","Gaskin","Cannon","Pastern"]),
        ]:
            parent="Body"
            for (y,z),(yy,zz),part in zip(stations,stations[1:],names):
                name=f"{limb}{part}.{side}"
                bone(name,(sign*.204,y,z),(sign*.204,yy,zz),parent)
                parent=name
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def ring_rows(rows, bone):
    return [(row[:3],row[3],row[4],skin(bone)) for row in rows]


def build_mesh(arm):
    s=Surface()
    s.tube(ring_rows([
        (0,.83,1.29,.045,.075),(0,.79,1.24,.20,.20),(0,.63,1.22,.315,.30),
        (0,.43,1.21,.335,.335),(0,.12,1.16,.335,.31),(0,-.13,1.14,.33,.35),
        (0,-.39,1.18,.315,.37),(0,-.56,1.25,.268,.325),(0,-.66,1.29,.14,.23),
        (0,-.68,1.3,.08,.12)],"Body"),"bay",24,"vertical")
    neck=[((0,-.46,1.19),.22,.30,skin("Body")),((0,-.52,1.35),.257,.275,skin("Body","Neck",.45)),
          ((0,-.61,1.47),.205,.255,skin("Neck")),((0,-.74,1.64),.156,.205,skin("Neck")),
          ((0,-.85,1.76),.126,.16,skin("Neck","Head",.19)),((0,-.95,1.80),.101,.093,skin("Neck","Head",.55))]
    s.tube(neck,"bay",20)
    # Jaw rounds at the poll, then narrows below the eyes and widens at the nostrils.
    s.tube(ring_rows([(0,-.87,1.785,.073,.088),(0,-.935,1.77,.133,.156),
                      (0,-1.018,1.752,.151,.172),(0,-1.10,1.713,.124,.145),
                      (0,-1.18,1.638,.094,.114),(0,-1.27,1.548,.088,.096),
                      (0,-1.335,1.496,.099,.080)],"Head"),"bay",20,"vertical")
    s.tube(ring_rows([(0,-1.28,1.535,.083,.083),(0,-1.336,1.501,.106,.086),
                      (0,-1.38,1.483,.091,.068),(0,-1.396,1.477,.046,.045)],"Head"),"nose",16,"vertical")
    for sign in [-1,1]:
        s.tube(ring_rows([(sign*.066,-.924,1.845,.046,.055),(sign*.081,-.908,1.91,.051,.061),
                          (sign*.10,-.90,1.988,.038,.04),(sign*.122,-.902,2.045,.006,.006)],"Head"),"bay",12)
        s.tube(ring_rows([(sign*.084,-.946,1.902,.028,.019),(sign*.095,-.946,1.951,.028,.012),
                          (sign*.119,-.915,2.018,.003,.003)],"Head"),"points",10)
        s.ellipsoid((sign*.131,-1.066,1.787),(.026,.036,.028),"points","Head")
        s.ellipsoid((sign*.147,-1.072,1.789),(.015,.024,.018),"eye","Head")
        s.ellipsoid((sign*.158,-1.079,1.795),(.004,.005,.004),"ivory","Head")
        s.ellipsoid((sign*.085,-1.354,1.514),(.018,.023,.013),"points","Head")
    s.tube([((0,-.50,1.48),.05,.10,skin("Body","Neck",.3)),((0,-.52,1.58),.08,.14,skin("Neck")),
            ((0,-.63,1.70),.071,.13,skin("Neck")),((0,-.75,1.81),.065,.116,skin("Neck")),
            ((0,-.88,1.88),.054,.082,skin("Neck","Head",.7)),((0,-.976,1.915),.051,.047,skin("Head"))],
           "mane",14)
    s.tube(ring_rows([(.018,-1.094,1.78,.005,.008),(.025,-1.058,1.842,.045,.033),
                      (.013,-1.006,1.895,.077,.062),(0,-.94,1.903,.048,.047)],"Head"),"mane",12)
    # Locks fall unevenly across the crest and soften the edge of the clipped mane.
    for i in range(12):
        t=i/11
        y=-.49-.40*t
        z=1.54+.32*t
        s.tube(ring_rows([(.098+.013*math.sin(i*2),y+.036,z-.078,.003,.005),
                          (.084,y+.017,z-.039,.012,.019),(.053,y,z+.011,.031,.032),
                          (.025,y-.014,z+.024,.014,.022)],"Neck"),"mane",8)
    s.tube(ring_rows([(0,-1.187,1.737,.005,.004),(.003,-1.152,1.791,.012,.010),
                      (.008,-1.121,1.836,.021,.012),(0,-1.087,1.866,.011,.006)],"Head"),"ivory",8)
    s.tube([((.015,1.115,.33),.022,.027,skin("TailTip")),((.006,1.105,.42),.10,.07,skin("TailTip")),
            ((0,1.059,.68),.117,.085,skin("Tail","TailTip",.8)),((0,1.010,.90),.097,.087,skin("Tail","TailTip",.24)),
            ((0,.929,1.18),.075,.084,skin("Tail")),((0,.82,1.35),.096,.078,skin("Body","Tail",.60)),
            ((0,.74,1.38),.063,.065,skin("Body"))],"mane")
    for sign,side in [(1,"L"),(-1,"R")]:
        for limb,rows in [
            ("fore",[(.065,-.53,.050,.071,"Pastern"),(.145,-.49,.052,.069,"Pastern"),
                     (.20,-.48,.065,.076,"Cannon"),(.34,-.49,.043,.052,"Cannon"),
                     (.54,-.525,.043,.058,"Cannon"),(.63,-.54,.064,.072,"Cannon"),
                     (.71,-.530,.062,.080,"Upper"),(.88,-.51,.080,.10,"Upper"),
                     (1.04,-.48,.110,.145,"Upper"),(1.21,-.46,.147,.175,"Upper"),(1.37,-.42,.088,.10,"Body")]),
            ("hind",[(.065,.56,.05,.073,"Pastern"),(.145,.595,.049,.064,"Pastern"),
                     (.20,.60,.064,.073,"Cannon"),(.30,.62,.047,.056,"Cannon"),(.44,.646,.05,.063,"Cannon"),
                     (.575,.683,.069,.088,"Cannon"),(.64,.657,.073,.105,"Gaskin"),(.75,.52,.092,.136,"Gaskin"),
                     (.90,.39,.13,.183,"Thigh"),(1.05,.453,.155,.218,"Thigh"),
                     (1.21,.51,.155,.22,"Thigh"),(1.37,.535,.108,.14,"Body")])
        ]:
            rings=[]
            for i,(z,y,rx,rd,part) in enumerate(rows):
                name="Body" if part=="Body" else f"{limb}{part}.{side}"
                prev=rows[max(0,i-1)][4]
                w=skin(name) if i==0 or prev==part else skin(f"{limb}{prev}.{side}",name,.65)
                rings.append(((sign*.206,y,z),rx,rd,w))
            s.tube(rings,["points" if i < 5 else "bay" for i in range(len(rings)-1)],14)
            y=rows[0][1]; x=sign*.206; b=f"{limb}Pastern.{side}"
            s.tube(ring_rows([(x,y-.035,.018,.070,.100),(x,y-.035,.029,.073,.102),
                              (x,y-.025,.068,.066,.088),(x,y-.008,.100,.05,.071)],b),"hoof",14)
    # Saddle blanket conforms to the barrel; its open bottom leaves the belly visible.
    def drape(stations,mat,angle):
        previous=None
        for y,top,w,h in stations:
            row=[]
            for j in range(21):
                a=angle*(2*j/20-1)
                row.append(len(s.points))
                s.points.append((w*math.sin(a),y,top-h*(1-math.cos(a))))
                s.weights.append(skin("Body"))
            if previous:
                for j in range(20):
                    s.face([previous[j],previous[j+1],row[j+1],row[j]],mat,
                           [(j/20,0),((j+1)/20,0),((j+1)/20,1),(j/20,1)])
            previous=row
    drape([(-.31,1.54,.33,.395),(-.30,1.548,.337,.40),(-.10,1.495,.349,.395),
           (.16,1.50,.35,.395),(.38,1.55,.344,.365),(.394,1.542,.34,.36)],"blanket",1.73)
    drape([(-.22,1.576,.28,.29),(-.18,1.57,.31,.34),(-.04,1.523,.35,.394),(.16,1.53,.35,.35),
           (.25,1.59,.313,.32),(.28,1.57,.298,.32)],"leather",1.46)
    drape([(-.145,1.529,.343,.366),(-.13,1.528,.345,.368),(-.07,1.52,.348,.37)],"rein",3.05)
    # Bridle bands taper with the head and the reins hang from the bit to the pommel.
    for y,z,r,d in [(-1.285,1.537,.096,.09),(-1.007,1.77,.154,.173)]:
        s.tube(ring_rows([(0,y+.012,z+.009,r,d),(0,y,z,r+.006,d+.006),
                          (0,y-.013,z-.012,r,d)],"Head"),"rein",20,"vertical")
    for sign in [-1,1]:
        s.ellipsoid((sign*.106,-1.273,1.508),(.017,.025,.024),"brass","Head")
        s.tube([((sign*x,y,z),r,r,w) for x,y,z,r,w in
                [(.105,-1.27,1.51,.009,skin("Head")),(.163,-1.05,1.51,.009,skin("Head","Neck",.30)),
                 (.184,-.75,1.56,.009,skin("Neck","Body",.50)),(.158,-.46,1.75,.010,skin("Body")),
                 (.130,-.35,1.795,.010,skin("Body")),(.111,-.20,1.565,.010,skin("Body"))]],"rein",8,"vertical")
        s.tube(ring_rows([(sign*.107,-1.274,1.51,.010,.014),(sign*.127,-1.185,1.61,.009,.015),
                          (sign*.155,-1.019,1.76,.009,.016)],"Head"),"rein",8,"vertical")
        # Short iron stirrups below the saddle flap.
        s.ellipsoid((sign*.35,-.023,1.12),(.013,.024,.195),"rein","Body")
        for y in [-.041,.041]:
            s.ellipsoid((sign*.374,y-.08,.921),(.012,.009,.049),"brass","Body")
        s.ellipsoid((sign*.375,-.08,.877),(.040,.058,.014),"brass","Body")
    return s.finish(arm)


def anatomical_rotation(bone, world_rotation):
    rest = bone.bone.matrix_local.to_quaternion()
    return rest.inverted() @ world_rotation @ rest


def stride(u, span, lift, stance):
    if u < stance:
        return span*(u/stance-.5), 0
    t = (u-stance)/(1-stance)
    return span*.5*math.cos(math.pi*t), lift*math.sin(math.pi*t)**1.35


def knee_angle(a,b):
    return math.atan2(b.z-a.z,b.y-a.y)


def solve_leg(a, end, l1, l2, bend):
    dy,dz=end.y-a.y,end.z-a.z
    distance=min(math.hypot(dy,dz),l1+l2-1e-5)
    dy,dz=dy/math.hypot(dy,dz),dz/math.hypot(dy,dz)
    along=(l1*l1-l2*l2+distance*distance)/(2*distance)
    off=math.sqrt(max(0,l1*l1-along*along))*bend
    return Vector((a.x,a.y+dy*along-dz*off,a.z+dz*along+dy*off))


def horse_actions(arm):
    bones=arm.pose.bones
    scene=bpy.context.scene
    scene.render.fps=FPS
    arm.animation_data_create()
    for name,frames in GAITS.items():
        action=bpy.data.actions.new(name)
        arm.animation_data.action=action
        action.use_fake_user=True
        for frame in range(frames+1):
            t=frame/frames
            fast=name=="HorseCanter"
            idle=name=="HorseIdle"
            bob=(.002 if idle else .039 if fast else .014)*math.sin(TAU*t*(1 if fast or idle else 2))
            pitch=(.014 if idle else .048 if fast else .030)*math.sin(TAU*t)
            def key(name,q):
                b=bones[name]
                b.rotation_quaternion=q
                b.keyframe_insert(data_path="rotation_quaternion",frame=frame)
            b=bones["Body"]
            b.location=b.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,bob))
            b.keyframe_insert(data_path="location",frame=frame)
            for bone,rot in [("Neck",(pitch,0,0)),("Head",(-.45*pitch,0,.023*math.sin(TAU*t) if idle else 0)),
                             ("Tail",(.04*math.cos(TAU*t),0,.085*math.sin(TAU*t))),
                             ("TailTip",(0,.035*math.sin(TAU*t),.095*math.sin(TAU*t-.65)))]:
                key(bone,anatomical_rotation(bones[bone],Euler(rot).to_quaternion()))
            for sign,side in [(1,"L"),(-1,"R")]:
                for limb in ("fore","hind"):
                    phases = (.0,.5,.75,.25) if not fast else (.27,.43,.00,.09)
                    ix=(0 if limb=="fore" else 2)+(side=="R")
                    u=(t+phases[ix])%1
                    dy,dz=(0,0) if idle else stride(u,.59 if fast else .39,.19 if fast else .107,.54 if fast else .64)
                    parts=(["Upper","Cannon","Pastern"] if limb=="fore" else ["Thigh","Gaskin","Cannon","Pastern"])
                    chain=[bones[f"{limb}{part}.{side}"] for part in parts]
                    joints=[b.bone.head_local.copy() for b in chain]+[chain[-1].bone.tail_local.copy()]
                    fetlock=joints[-2]+Vector((0,dy,dz))
                    root=joints[0]+Vector((0,0,bob))
                    wanted=[root]
                    if limb=="hind":
                        rest=joints[1]-joints[0]
                        hip_angle=(-dy*.43+dz*.16) if not idle else 0
                        wanted.append(root+Quaternion((1,0,0),hip_angle) @ rest)
                    pivot=solve_leg(wanted[-1],fetlock,chain[-3].length,chain[-2].length,1 if limb=="hind" else -1)
                    wanted.extend([pivot,fetlock,fetlock+joints[-1]-joints[-2]])
                    inherited=0
                    for i,bone in enumerate(chain):
                        angle=knee_angle(wanted[i],wanted[i+1])-knee_angle(joints[i],joints[i+1])
                        key(bone.name,anatomical_rotation(bone,Quaternion((1,0,0),angle-inherited)))
                        inherited=angle
        arm.animation_data.action=None
    scene.frame_set(0)


def export_glb(path,objects,with_mesh):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
                              export_animations=True,export_animation_mode="ACTIONS",
                              export_frame_range=False,export_force_sampling=False,
                              export_optimize_animation_size=False,export_anim_slide_to_zero=True,
                              export_materials="EXPORT" if with_mesh else "NONE",
                              export_yup=True,export_cameras=False,export_lights=False)


def rider():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/"tools/blender-character/experimental/authored-human-canonical-v1/candidate.blend"))
    arm=next(o for o in bpy.data.objects if o.type=="ARMATURE")
    arm.animation_data_clear()
    for old in list(bpy.data.actions):
        bpy.data.actions.remove(old)
    arm.animation_data_create()
    arm.animation_data.action=bpy.data.actions.new("Ride")
    bpy.context.scene.render.fps=FPS
    for frame,lean in [(0,0),(12,.014),(24,0)]:
        for b in arm.pose.bones:
            b.matrix_basis.identity()
            b.rotation_mode="QUATERNION"
            b.rotation_quaternion=Quaternion()
        bpy.context.view_layer.update()
        def aim(name,direction):
            b=arm.pose.bones[name]
            rest=b.bone.tail_local-b.bone.head_local
            delta=rest.rotation_difference(Vector(direction).normalized())
            parent_delta=(b.parent.matrix.to_quaternion() @ b.parent.bone.matrix_local.to_quaternion().inverted()
                          if b.parent else Quaternion())
            b.rotation_quaternion=anatomical_rotation(b,parent_delta.inverted() @ delta)
            bpy.context.view_layer.update()
        aim("spine_02",(0,-.064-lean,1))
        for sign,side in [(1,"l"),(-1,"r")]:
            aim("thigh_"+side,(sign*.236,-.245,-.25))
            aim("calf_"+side,(sign*.045,.135,-.405))
            aim("foot_"+side,(sign*.006,-.13,-.036))
            aim("upperarm_"+side,(sign*.028,-.092,-.233))
            aim("lowerarm_"+side,(-sign*.072,-.227,-.072+lean))
            aim("hand_"+side,(-sign*.035,-.08,-.024))
            for finger in ["index","middle","ring","pinky"]:
                for joint in [1,2,3]:
                    b=arm.pose.bones[f"{finger}_{joint:02d}_{side}"]
                    b.rotation_quaternion=anatomical_rotation(b,Quaternion((0,1,0),sign*.60))
        for b in arm.pose.bones:
            b.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        bpy.context.scene.frame_set(frame)
    export_glb(OUT/"rider.glb",[arm],False)


def header(path):
    b=path.read_bytes()
    return json.loads(b[20:20+struct.unpack_from("<I",b,12)[0]])


def check_rider_fit(path):
    """Bind the exported first pose by joint name to the wayfarer's actual GLB."""
    human=header(OUT/"wayfarer.glb")
    clip=header(path)
    raw=path.read_bytes()
    binary=28+struct.unpack_from("<I",raw,12)[0]
    nodes={n["name"]:n for n in human["nodes"]}
    ride=clip["animations"][0]
    for ch in ride["channels"]:
        target=ch["target"]
        name=clip["nodes"][target["node"]]["name"]
        sampler=ride["samplers"][ch["sampler"]]
        accessor=clip["accessors"][sampler["output"]]
        view=clip["bufferViews"][accessor["bufferView"]]
        assert accessor["componentType"]==5126
        components=4 if target["path"]=="rotation" else 3
        offset=binary+view.get("byteOffset",0)+accessor.get("byteOffset",0)
        if sampler.get("interpolation")=="CUBICSPLINE":
            offset+=components*4  # Incoming tangent, value, outgoing tangent.
        nodes[name][target["path"]]=struct.unpack_from("<"+"f"*components,raw,offset)
    positions={}
    def visit(index,parent):
        n=human["nodes"][index]
        x,y,z,w=n.get("rotation",[0,0,0,1])
        local=Matrix.LocRotScale(Vector(n.get("translation",[0,0,0])),Quaternion((w,x,y,z)),Vector(n.get("scale",[1,1,1])))
        world=parent @ local
        positions[n["name"]]=world.translation
        for child in n.get("children",[]):
            visit(child,world)
    for root in human["scenes"][human.get("scene",0)]["nodes"]:
        visit(root,Matrix.Identity(4))
    # glTF is Y-up and the horse faces +Z. Knees bend forward, feet straddle
    # the barrel and both hands meet the reins in front of the rider.
    hip=positions["pelvis"]
    for side in ["l","r"]:
        knee,foot,hand=[positions[name+"_"+side] for name in ["calf","foot","hand"]]
        assert abs(foot.x)>.34 and knee.z>hip.z+.16 and foot.y<hip.y-.48
        assert hand.z>hip.z+.19 and abs(hand.x)<.23
    return round(hip.y+RIDER_OFFSET,3)


def roundtrip():
    horse_path=OUT/"horse.glb"
    h=header(horse_path)
    assert {a["name"] for a in h["animations"]}==set(GAITS)
    assert all("bufferView" in i for i in h["images"])
    assert len(h["skins"])==1
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(horse_path))
    arm=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
    body=next(o for o in bpy.context.scene.objects if o.type=="MESH")
    assert len(arm.data.bones)==20 and "Saddle" in arm.data.bones
    assert set(body.vertex_groups.keys()).issubset(arm.data.bones.keys())
    assert all(len(v.groups)>0 for v in body.data.vertices)
    # Evaluate real imported tracks. The walk and canter must lift the hooves
    # and the rider attachment must track the oscillating body.
    bpy.context.scene.render.fps=FPS
    anim=arm.animation_data
    for track in anim.nla_tracks:
        track.mute=True
    measurements={}
    for name,frames in GAITS.items():
        action=bpy.data.actions.get(name)
        assert action is not None, name
        anim.action=action
        start,end=action.frame_range
        assert end>start
        hooves,seats=[],[]
        for sample in range(21):
            t=start+(end-start)*sample/20
            bpy.context.scene.frame_set(int(t),subframe=t-int(t))
            hooves.append((arm.matrix_world @ arm.pose.bones["forePastern.L"].head).z)
            seats.append((arm.matrix_world @ arm.pose.bones["Saddle"].head).z)
        assert max(seats)-min(seats)>.002
        assert name=="HorseIdle" or max(hooves)-min(hooves)>.055
        assert min(hooves)>.018, (name,min(hooves))
        measurements[name]={"seconds":round(frames/FPS,3),"fetlockTravelMetres":round(max(hooves)-min(hooves),3),
                            "saddleTravelMetres":round(max(seats)-min(seats),3)}
    bone_count=len(arm.data.bones)
    rider_path=OUT/"rider.glb"
    r=header(rider_path)
    assert [a["name"] for a in r["animations"]]==["Ride"]
    assert all(n in {node["name"] for node in r["nodes"]} for n in ["pelvis","thigh_l","calf_r","upperarm_l"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(rider_path))
    assert any("Ride" in a.name for a in bpy.data.actions)
    result={"asset":"mere-horse","source":"tools/hollow-kingdom/horse.py","forward":"+Z","metresPerUnit":1,
            "saddleBone":"Saddle","saddleHeightMetres":SADDLE_Y,"riderOriginOffsetMetres":RIDER_OFFSET,
            "riderClip":"Ride","mountedPelvisHeightMetres":check_rider_fit(rider_path),
            "rigBones":bone_count,"materials":len(h["materials"]),
            "embeddedTextures":len(h["images"]),"roundTrip":"Blender "+bpy.app.version_string,"clips":measurements}
    (OUT/"horse.metadata.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result))


if __name__=="__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    palette()
    arm=rig()
    model=build_mesh(arm)
    horse_actions(arm)
    export_glb(OUT/"horse.glb",[arm,model],True)
    rider()
    roundtrip()
