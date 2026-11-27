"""Oswin's working clothes, cut and fitted to the shipped Merewatch Golden body."""
import math
import sys
from pathlib import Path

import numpy as np
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from complexion import weather_face
from studio import AFTER, BEFORE, load_actor
from textiles import atlas_png, uv

TAU = 2 * math.pi
sin, cos = math.sin, math.cos


def mix(a, b, t):
    return a + (b - a) * t


def make_materials():
    textile = bpy.data.materials.new("Oswin | woven, tanned and braided")
    textile.use_nodes = True
    tree = textile.node_tree
    surf = tree.nodes.get("Principled BSDF")
    surf.inputs["Roughness"].default_value = .81
    image_path = HERE / "oswin-dyers-swatchbook.png"
    atlas_png(image_path)
    image = bpy.data.images.load(str(image_path))
    image.pack()
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tree.links.new(tex.outputs["Color"], surf.inputs["Base Color"])
    bronze = bpy.data.materials.new("Oswin | dull cast latten")
    bronze.use_nodes = True
    bs = bronze.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (.29, .18, .066, 1)
    bs.inputs["Metallic"].default_value = .77
    bs.inputs["Roughness"].default_value = .4
    return textile, bronze


class Garment:
    """Continuous row topology with seam UVs and per-vertex blended weights."""
    def __init__(self, arm, materials):
        self.arm, self.materials = arm, materials
        self.points, self.weights, self.faces, self.uvs, self.mats = [], [], [], [], []

    def panel(self, rows, dye, closed=True, reverse=False):
        # Each entry carries a point and a bone or weight map.
        height, width, base = len(rows), len(rows[0]), len(self.points)
        for row in rows:
            assert len(row) == width
            for co, weights in row:
                self.points.append(self.arm.matrix_world.inverted() @ Vector(co))
                self.weights.append(weights if isinstance(weights, dict) else {weights: 1})
        segments = width if closed else width - 1
        for j in range(height - 1):
            for i in range(segments):
                k = (i + 1) % width
                ids = (j * width + i, j * width + k, (j + 1) * width + k, (j + 1) * width + i)
                u, v = i / segments, j / (height - 1)
                u1, v1 = (i + 1) / segments, (j + 1) / (height - 1)
                tile = "welt" if dye == "metal" else dye
                coords = [uv(tile, s, t) for s, t in ((u,v), (u1,v), (u1,v1), (u,v1))]
                self.faces.append(tuple(base + n for n in (ids[::-1] if reverse else ids)))
                self.uvs.append(coords[::-1] if reverse else coords)
                self.mats.append(int(dye == "metal"))

    def tube(self, points, radius, weights, dye, sides=7):
        rows = []
        old = None
        for i, point in enumerate(points):
            p = Vector(point)
            direction = (Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
            v = old if old is not None else (Vector((0, 1, 0)) if abs(direction.y) < .9 else Vector((1, 0, 0)))
            u = direction.cross(v).normalized()
            v = u.cross(direction).normalized()
            old = v
            r = radius[i] if isinstance(radius, list) else radius
            bone = weights[i] if isinstance(weights, list) else weights
            rows.append([(p + r * (cos(TAU*k/sides)*u + sin(TAU*k/sides)*v), bone) for k in range(sides)])
        self.panel(rows, dye, reverse=True)

    def finish(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        mesh.materials.clear()
        for material in self.materials:
            mesh.materials.append(material)
        layer = mesh.uv_layers.new(name="Tailor's islands")
        for poly, coords, material in zip(mesh.polygons, self.uvs, self.mats):
            poly.use_smooth = True
            poly.material_index = material
            for index, pair in zip(poly.loop_indices, coords):
                layer.data[index].uv = pair
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj["oswin_pattern_piece"] = True
        obj.parent = self.arm
        groups = {}
        for i, weights in enumerate(self.weights):
            for bone, value in weights.items():
                if value > .0001:
                    if bone not in groups:
                        assert self.arm.data.bones.get(bone), bone
                        groups[bone] = obj.vertex_groups.new(name=bone)
                    groups[bone].add([i], value, "REPLACE")
        obj.modifiers.new("Golden deformation", "ARMATURE").object = self.arm
        return obj


def torso(z):
    # Overlapping profile rings share a continuous deformation field.
    stops = [(1.00,"pelvis"), (1.105,"spine_01"), (1.245,"spine_02"), (1.40,"spine_03")]
    if z <= stops[0][0]:
        return stops[0][1]
    for (lo, a), (hi, b) in zip(stops, stops[1:]):
        if z <= hi:
            return {a:(hi-z)/(hi-lo), b:(z-lo)/(hi-lo)}
    return stops[-1][1]


def hoop(z, rx, ry, cy=.024, cx=0, warp=0, bone=None, count=64):
    row = []
    for i in range(count):
        a = TAU*i/count
        r = 1 + warp*(sin(9*a+.6) + .45*cos(14*a-5*z))
        row.append(((cx+rx*r*sin(a),cy-ry*r*cos(a),z), bone or torso(z)))
    return row


def coat(g):
    # Separate skirts below the waist follow each thigh. Their diagonal edges overlap.
    def hem_point(a, z, rx, ry, fold):
        ripple = 1 + fold*(sin(9*a + 2*z) + .4*sin(14*a-3*z))
        h = z + max(0,1-z)*.07*cos(3*a+.4) + max(0, .88-z)*.33*cos(a)
        return (rx*ripple*sin(a),.030-ry*ripple*cos(a),h)
    profile = [(.67,.273,.196,.044),(.715,.267,.191,.045),(.83,.241,.182,.032),
               (.94,.206,.152,.022),(1.035,.18,.143,.009),(1.082,.181,.14,.015),
               (1.14,.194,.15,.022),(1.245,.219,.161,.014),(1.355,.236,.167,.013),
               (1.43,.242,.151,.009),(1.48,.228,.116,.004),(1.542,.102,.093,0)]
    for side, suffix in ((1,"l"),(-1,"r")):
        rows=[]
        for z,rx,ry,fold in profile:
            row=[]
            for i in range(49):
                t=i/48
                overlap = .20 if side == 1 else .06
                a=side*mix(-overlap, math.pi+.02, t)
                p=hem_point(a,z,rx,ry,fold)
                pull=min(.78, max(0,(1-z)/.36))
                skin=torso(z) if not pull else {"pelvis":1-pull,"thigh_"+suffix:pull}
                if side == 1 and t < .18:
                    p=(p[0],p[1]-.005*(1-t/.18),p[2])
                row.append((p,skin))
            rows.append(row)
        g.panel(rows,"coat",False,side<0)
        for i, dye, n in [(0,"lapel",2), (0,"binding",1)]:
            if dye == "binding" and side < 0:
                continue
            trim=[ [((x,y-.002,z),w) for (x,y,z),w in row[i:i+n+1]] for row in rows]
            g.panel(trim,dye,False,side<0)
    # Worked hem stays visible in the dark under the belt and mantle.
    for z,rx,ry,warp in [(1.022,.191,.153,0)]:
        g.panel([hoop(z,rx,ry),hoop(z+.042,rx,ry)],"leather")
    # Brass double-prong buckle, strap keeper and button closures down the breast.
    def buckle(x,y,z,w,h,thick):
        points=[(x+a*w,y,z+b*h) for a,b in [(-1,-.55),(-.8,-1),(.8,-1),(1,-.55),
                                               (1,.55),(.8,1),(-.8,1),(-1,.55),(-1,-.55)]]
        g.tube(points,thick,torso(z),"metal")
    buckle(.036,-.134,1.045,.033,.022,.005)
    for dz in (-.009,.009):
        g.tube([(.018,-.14,1.045+dz),(.069,-.14,1.047+dz)],.0028,torso(1.045),"metal")
    for z,front in [(1.105,-.12),(1.18,-.13),(1.255,-.14),(1.327,-.148)]:
        for side in (-1,1):
            x=side*.069
            rows = [hoop(z+h,.009*r,.005*r,front-.003,x,0,torso(z),12)
                    for h,r in [(-.008,.2),(-.005,.9),(0,1),(.006,.75),(.008,.15)]]
            g.panel(rows,"metal")


def limbs(g):
    for side,suffix in [(1,"l"),(-1,"r")]:
        upper,lower,hand = ["%s_%s" % (part,suffix) for part in ("upperarm","lowerarm","hand")]
        # A gathered shoulder and a bent-elbow allowance give the sleeve real volume.
        sleeve = []
        for x,r,rz,z in [(.176,.085,.072,1.467),(.214,.094,.087,1.466),(.255,.082,.078,1.467),
                          (.325,.07,.069,1.465),(.405,.064,.057,1.463),(.454,.065,.061,1.46),
                          (.482,.062,.054,1.46),(.547,.059,.054,1.462),(.61,.049,.047,1.463),
                          (.642,.052,.048,1.465),(.668,.039,.04,1.465),(.708,.041,.041,1.465),
                          (.719,.037,.038,1.465)]:
            if x < .214: bone={upper:.6,"spine_03":.4}
            elif x < .405: bone=upper
            elif x < .49: bone={upper:1-(x-.405)/.085,lower:(x-.405)/.085}
            else: bone=lower
            row=[]
            for i in range(36):
                a=TAU*i/36
                wave=1+.035*(sin(7*a+13*x)+.5*sin(3*a-9*x))
                row.append(((side*x,.064+r*wave*cos(a),z+rz*wave*sin(a)),bone))
            sleeve.append(row)
        g.panel(sleeve[:11],"coat",reverse=side<0)
        g.panel(sleeve[10:],"welt",reverse=side<0)
        for j in (10,11):
            g.tube([p for p,_ in sleeve[j]]+[sleeve[j][0][0]],.0026,lower,"binding")
        thigh,calf,foot,ball = ["%s_%s" % (part,suffix) for part in ("thigh","calf","foot","ball")]
        def leg(z):
            return thigh if z>.61 else calf if z<.48 else {thigh:(z-.48)/.13,calf:(.61-z)/.13}
        leg_rows=[hoop(z,x,y,cy,side*cx,warp,leg(z),42) for z,x,y,cy,cx,warp in
                  [(.408,.061,.069,.063,.115,.015),(.447,.076,.079,.057,.112,.025),
                   (.49,.084,.084,.045,.111,.052),(.515,.076,.078,.042,.112,.06),
                   (.55,.073,.074,.043,.113,.024),(.60,.08,.091,.052,.113,.035),
                   (.68,.093,.10,.05,.104,.022),(.754,.085,.094,.045,.092,.016),
                   (.799,.065,.079,.034,.082,.012),(.824,.051,.059,.036,.064,.01)]]
        g.panel(leg_rows,"trouser")
        # Shaped boot last with continuous heel, instep, welt and a visible sole.
        rows=[]
        for z,w,front,back in [(.009,.072,.173,.160),(.025,.074,.174,.161),(.033,.073,.172,.16),
                               (.045,.071,.171,.156),(.070,.071,.155,.151),(.092,.059,.10,.148),
                               (.117,.053,.025,.143),(.16,.051,-.012,.142),(.185,.055,-.008,.146),
                               (.23,.058,-.006,.147),(.32,.067,.013,.15),(.402,.076,.033,.149),
                               (.423,.081,.039,.155),(.448,.082,.04,.155),(.453,.077,.036,.152)]:
            row=[]
            for i in range(40):
                a=TAU*i/40
                c=cos(a)
                cy=(back-front)/2
                y=cy-(back+front)/2*c
                x=side*.114 + w*sin(a)*(1+.13*c)
                h=z+.019*max(0,c)**3*max(0,1-z/.12)
                if z<.118 and y<-.008:
                    t=min(.85,(-.008-y)/.15)
                    weights={foot:1-t,ball:t}
                elif z<=.117: weights=foot
                elif z<.185:
                    t=(z-.117)/.068
                    weights={foot:1-t,calf:t}
                else: weights=calf
                row.append(((x,y,h),weights))
            rows.append(row)
        g.panel(rows[:2],"leather")
        g.panel(rows[1:3],"welt")
        g.panel(rows[2:13],"leather")
        g.panel(rows[12:],"welt")
        lining=hoop(.442,.061,.069,.056,side*.114,0,calf,40)
        g.panel([rows[-1],lining],"leather")
        bottom=[((side*.114 + .001*sin(TAU*i/40),.01-.002*cos(TAU*i/40),.010),foot) for i in range(40)]
        g.panel([bottom,rows[0]],"leather")
        for z in [.205,.238]:
            g.panel([hoop(z,.058,.079,.070,side*.114,0,calf,40),
                     hoop(z+.010,.059,.079,.070,side*.114,0,calf,40)],"welt")


def mantle(g, fitted):
    # Cut and drape this garment on the actual posed actor. Inverse skinning
    # returns the cloth to the rig's rest space before exporting. A sleeve in a
    # T-pose is a poor guide to the silhouette of a weighted shoulder cape.
    from studio import play
    arm=g.arm
    play(arm, "idle.glb")
    bpy.context.scene.frame_set(12)
    graph=bpy.context.evaluated_depsgraph_get()
    posed=[o.evaluated_get(graph) for o in fitted]
    verts, faces=[],[]
    for obj in posed:
        base=len(verts)
        verts.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
        faces.extend([base+i for i in p.vertices] for p in obj.data.polygons)
    bvh=BVHTree.FromPolygons(verts,faces)
    world=arm.matrix_world
    transforms={b.name:world@arm.pose.bones[b.name].matrix@b.matrix_local.inverted()@world.inverted()
                for b in arm.data.bones}
    centre=world@arm.pose.bones["spine_03"].head
    # Head, shoulders and collar are gently offset in the external idle clip.
    neck=world@arm.pose.bones["neck_01"].head
    phase=centre.z-1.32
    def rest(p,w):
        mat=sum((np.asarray(transforms[name])*amount for name,amount in w.items()))
        return (Vector(np.linalg.solve(mat,np.array([*p,1.]))[:3]),w)
    def positions(a,t):
        s,c=sin(a),cos(a)
        # A long diagonal fold is drawn from the left clavicle down to the
        # opposite breast. The back skirt hangs between the shoulder blades.
        tail=.115*max(0,cos(a+.79))**6
        hem=1.315+.062*s-.058*max(0,-c)-tail
        z=mix(hem,1.566,t)+.061*abs(s)**3*sin(math.pi*t)
        off=Vector((mix(centre.x,neck.x,t),mix(centre.y,neck.y,t),z+phase))
        direction=Vector((s,-c,0))
        # Sample the silhouette of the garment the cape actually covers.
        p,_,_,_=bvh.ray_cast(off+direction*.53,-direction,.52)
        minrad=1/math.sqrt((s/mix(.29,.104,t**1.8))**2+(c/mix(.167,.092,t**1.8))**2)
        clearance=.014+.014*(1-t)
        front_fold=.022*(1-t)**.55*(sin(6*a+2.7*t+.34*sin(3*a))+.40*sin(11*a-1.6*t))
        surface_radius=(p-off).dot(direction) if p is not None else 0
        rad=max(surface_radius+.012, max(minrad,surface_radius)+clearance+front_fold)
        point=off+direction*rad
        # Arm coverage occurs around the sides; taper this influence at the collar.
        pull=.79*abs(s)**3*(1-t**1.3)
        w={"spine_03":1-pull, "upperarm_"+("l" if s>=0 else "r"):pull}
        return point,w
    levels=[0,.010,.032,.049,.16,.24,.35,.47,.59,.7,.8,.89,.96,1]
    rings=[]
    for t in levels:
        row=[]
        for i in range(97):
            u=i/96
            a=mix(-.80,TAU-.58,u)
            p,w=positions(a,t)
            # Crossed ends, the outer leaf sits over the inner leaf at the shoulder.
            rise=max(0,1-u/.12)*.012
            p+=Vector((sin(a)*rise,-cos(a)*rise,0))
            row.append(rest(p,w))
        rings.append(row)
    g.panel(rings,"mantle",False)
    # A narrow dark piping below an understated woven selvedge, following the
    # long corner rather than cutting horizontally across the breast.
    for j,dye in [(0,"welt"),(2,"binding")]:
        rows=[]
        for row in rings[j:j+2]:
            rows.append([((p.x*1.003,p.y*1.006,p.z),w) for p,w in row])
        g.panel(rows,dye,False)
    for index in [0,-1]:
        g.tube([row[index][0] for row in rings],.0025,[row[index][1] for row in rings],"welt")
    # Needleworked chevrons overlap only a hand's breadth near the long corner.
    for i in range(10):
        a=-.52+i*.097
        pts=[]; ws=[]
        for da,t in [(-.043,.079),(0,.104),(.042,.078)]:
            p,w=positions(a+da,t+.035)
            p+=Vector((sin(a)*.004,-cos(a)*.004,0))
            pt,weight=rest(p,w)
            pts.append(pt);ws.append(weight)
        g.tube(pts,.0014,ws,"binding",5)
    # Turn the neckline back on itself in the same posed space as the cape.
    # The outer roll shares its first ring with the cape; both shoulders keep
    # their clearance without a second collar cutting across the chest.
    lining=[]
    for j in range(6):
        row=[]
        for i in range(96):
            a=mix(-.80,TAU-.80,i/96)
            base,w=positions(a,1)
            ray=Vector((sin(a),-cos(a),0))
            if j==0:
                p=base
            else:
                cx,cy=neck.x,neck.y
                inset=[0,.002,.006,.012,.019,.043][j]
                dz=[0,.006,.015,.023,.025,.015][j]
                p=base-ray*inset
                p.z+=dz+.004*sin(a)*j/5
            row.append(rest(p,w))
        lining.append(row)
    g.panel(lining[:5],"mantle")
    g.panel(lining[4:],"linen")
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.scene.frame_set(0)
    # Cast toggle and loop at the crossed ends.
    for z,y in [(1.452,-.126),(1.395,-.150)]:
        x=-.090
        g.tube([(x-.03,y+.002,z+.009),(x-.013,y-.004,z+.005),(x+.023,y-.006,z-.008)],
               [.004,.007,.004],"spine_03","welt",10)


def bonnet(g):
    # Flatcrown wool cap: pitched to one temple, compressed in front over a stitched bill.
    profiles=[(1.741,.084,.094,.005),(1.746,.091,.101,.005),(1.769,.092,.105,.004),
              (1.777,.103,.117,.005),(1.791,.109,.128,.004),(1.817,.103,.119,.007),
              (1.835,.081,.104,.014),(1.846,.056,.077,.024),(1.853,.017,.023,.028),
              (1.853,.001,.001,.028)]
    rows=[]
    for j,(z,rx,ry,cy) in enumerate(profiles):
        row=[]
        for i in range(56):
            a=TAU*i/56
            f=.013*sin(8*a+z*5)*sin(math.pi*j/(len(profiles)-1))
            x=rx*sin(a)*(1+f)+.013*j/(len(profiles)-1)
            y=cy-ry*cos(a)*(1+f)
            h=z-(.009*sin(a)+.010*max(0,-cos(a)))*min(1,rx/.071)+.006*cos(a)*sin(math.pi*j/(len(profiles)-1))
            row.append(((x,y,h),"Head"))
        rows.append(row)
    g.panel(rows[:3],"leather")
    g.panel(rows[2:],"cap")
    g.tube([p for p,_ in rows[3]]+[rows[3][0][0]],.0028,"Head","welt")
    for idx in [6,20,32,47]:
        g.tube([r[idx][0] for r in rows[3:-1]],.0016,"Head","cap",5)
    brim=[]
    for reach in [0,.38,.88,1]:
        row=[]
        for j in range(33):
            a=mix(-1.3,1.3,j/32)
            shape=max(0,cos(a/1.3*math.pi/2))**.63
            x=(.091+.012*reach)*sin(a)
            y=.005-.099*cos(a)-reach*.036*shape
            z=1.753-.008*sin(a)+.004*(1-shape)-.013*reach**1.45*shape
            row.append(((x,y,z),"Head"))
        brim.append(row)
    g.panel(brim,"welt",False,True)
    g.tube([p for p,_ in brim[-1]],.0028,"Head","leather",6)


def whiskers(g, body):
    # Use the actual jaw and cheek topology as a mould; stylised clumps taper
    # along the jaw, then meet beneath the chin. Keep lips and nose unobstructed.
    points=[body.matrix_world@v.co for v in body.data.vertices]
    bvh=BVHTree.FromPolygons(points,[list(p.vertices) for p in body.data.polygons])
    def skin(a,z):
        dx,dy=sin(a),-cos(a)
        anchor=Vector((0,.012,z))
        point,_,_,_=bvh.ray_cast(anchor+Vector((dx*.22,dy*.22,0)),Vector((-dx,-dy,0)),.32)
        return point or Vector((dx*.060,.012+dy*.074,z))
    def shape(a,t):
        side=abs(a)/1.8
        hi=1.626+.077*side**1.7+.008*sin(side*3)
        lo=1.567+.063*side**1.4
        h=mix(lo,hi,t)
        root=skin(a,max(h,1.596))
        # Below the chin the tips converge instead of following the narrower neck.
        curl=(1-max(0,1.60-h)*6.5)
        bulk=(.005+.004*cos(2*a))*(.6+.4*sin(t*math.pi))
        return Vector((root.x*curl+sin(a)*bulk, .012+(root.y-.012)*curl-cos(a)*bulk,h))
    rows=[]
    for j in range(15):
        t=j/14
        row=[]
        for i in range(57):
            a=mix(-1.82,1.82,i/56)
            p=shape(a,t)
            p.z+=.0016*sin(19*a+.3)*(1-t)
            row.append((p,"Head"))
        rows.append(row)
    g.panel(rows,"beard",False)
    # Overlapping tapered beard and moustache locks break the perimeter and add greying at the temples.
    for i in range(75):
        a=mix(-1.81,1.81,i/74)
        clump=[]
        for t in [.02,.27,.59,.89]:
            p=shape(a+.12*(1-t)*sin(1.2*a)+.018*sin(15*a+t*3),t)
            p+=Vector((sin(a)*.0015,-cos(a)*.002,0))
            clump.append(p)
        g.tube(clump,[.00035,.0015,.0017,.00045],"Head","silver" if (i*13)%11<2 else "beard",5)
    for side in [-1,1]:
        for strand in range(5):
            section=[]
            for x,z in [(0.004,1.653),(.015,1.652),(.027,1.646),(.039,1.638),(.046,1.632)]:
                x*=side
                z+=.00095*strand
                hit,_,_,_=bvh.ray_cast(Vector((x,-.22,z)),Vector((0,1,0)),.33)
                y=hit.y if hit is not None else -.089
                section.append((x,y-.003,z))
            g.tube(section,[.002,.0032,.003,.0022,.0005],"Head","silver" if strand==3 else "beard",6)


def riggers_kit(g):
    # Five turns form a tied coil. The paired turns settle at the side,
    # with a short free end and a contrasting seizing across the neck.
    for loop in range(5):
        strand=[]
        for i in range(65):
            a=TAU*i/64
            x=-.224-.019*sin(a)+.0018*loop
            y=-.011-(.052+loop*.0022)*sin(a)-.018*cos(a)
            z=.894+(.128+.0017*loop)*cos(a)+.004*sin(2*a+loop*.4)
            strand.append((x,y,z))
        g.tube(strand,.0048,"pelvis","cord",8)
    for j in range(3):
        z=.976+.007*j
        g.tube([(-.220+.015*cos(TAU*i/22),-.02+.048*sin(TAU*i/22),z) for i in range(23)],
               .0035,"pelvis","leather")
    g.tube([(-.21,-.037,1.044),(-.219,-.049,1.003),(-.224,-.030,.965),
            (-.234,-.058,.920),(-.236,-.069,.868)], [.008,.008,.007,.007,.006],
           "pelvis","cord",9)
    # Soft crescent coin purse on the opposite hip, pinched by its hanger.
    purse=[]
    for z,w,d,cy in [(.836,.012,.01,-.031),(.852,.038,.032,-.031),(.883,.057,.045,-.029),
                     (.931,.061,.05,-.025),(.956,.048,.036,-.022),(.970,.023,.022,-.021),
                     (.987,.032,.024,-.021)]:
        purse.append(hoop(z,d,w,cy,.202,.06,"pelvis",36))
    g.panel(purse,"welt")
    for y in [-.046,.007]:
        g.tube([(.186,y,1.06),(.198,y,1.029),(.214,y,.983),(.211,y,.965)],.0065,"pelvis","leather")
    g.tube([(.202+.024*cos(TAU*i/24),-.021+.023*sin(TAU*i/24),.971) for i in range(25)],
           .0035,"pelvis","cord")


def trim_source(body):
    # Retain the shipped face, neck, hands and skin weights. Remove covered
    # anatomy so the cloth never exposes the enormous old bare toes or muscle seams.
    mesh=bmesh.new()
    mesh.from_mesh(body.data)
    discard=[]
    for face in mesh.faces:
        p=body.matrix_world@face.calc_center_median()
        hand=abs(p.x)>.701 and p.z>1.30
        head=p.z>=1.596 and abs(p.x)<.105
        neck=1.509<p.z<1.596 and abs(p.x)<.074 and -.078<p.y<.099
        if not (hand or head or neck):
            discard.append(face)
    bmesh.ops.delete(mesh,geom=discard,context="FACES")
    mesh.to_mesh(body.data)
    mesh.free()


def build():
    arm=load_actor(BEFORE)
    # Blender's imported custom bone display is outside the exported actor hierarchy.
    old=next(o for o in arm.children_recursive if o.name.startswith("Tailored outerwear"))
    bpy.data.objects.remove(old,do_unlink=True)
    body=next(o for o in arm.children_recursive if o.name.startswith("SuperHero"))
    materials=make_materials()
    pieces=[]
    for label,fn in [("Reefer coat and latten hardware",coat),("Sleeves, breeches and working boots",limbs),
                     ("Split wool cape and linen neckcloth",lambda g:mantle(g,pieces)),("Wool deck cap",bonnet),
                     ("Salt beard",lambda g:whiskers(g,body)),("Coil and drawstring purse",riggers_kit)]:
        garment=Garment(arm,materials)
        fn(garment)
        pieces.append(garment.finish(label))
    # Remove the excess seam allowance below the finished cape. The cape was
    # fitted at the full sleeve radius; reducing the hidden cap now preserves
    # a positive gap when the arm counter-swings through the walking clip.
    sleeve_object=pieces[1]
    for v in sleeve_object.data.vertices:
        p=arm.matrix_world@v.co
        if p.z>1.34 and .168<abs(p.x)<.36:
            amount=.36*min(1,(.36-abs(p.x))/.072)
            p.y=mix(p.y,.064,amount)
            p.z=mix(p.z,1.46,amount)
            v.co=arm.matrix_world.inverted()@p
    weather_face(body)
    trim_source(body)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active=arm
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space=area.spaces.active
                space.region_3d.view_distance=2.8
                space.region_3d.view_location=(0,0,1.06)
                space.region_3d.view_rotation=Vector((.3,-1,.12)).to_track_quat("Z","Y")
                space.shading.color_type="TEXTURE"
                space.overlay.show_overlays=False
    bpy.context.preferences.filepaths.save_version=0
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"oswin.blend"),compress=True)
    export_source()


def export_source():
    # Always reopen the packed source. Artists may edit the pattern meshes,
    # then invoke --export-only to reproduce a game-ready build from that file.
    bpy.ops.wm.open_mainfile(filepath=str(HERE/"oswin.blend"))
    arm=next(obj for obj in bpy.context.scene.objects if obj.type=="ARMATURE")
    pieces=[obj for obj in arm.children_recursive if obj.get("oswin_pattern_piece")]
    assert pieces, "The source contains no Oswin pattern pieces."
    # Preserve the editable pattern pieces in the .blend. Batch their primitives
    # by shared cloth atlas and metal material only in the game export.
    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0]
    bpy.ops.object.join()
    bpy.context.object.name="Oswin's deck clothes"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [arm.parent,arm,*arm.children_recursive]:
        if obj is not None:
            obj.select_set(True)
    AFTER.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(AFTER),use_selection=True,export_format="GLB",export_animations=False,
                              export_yup=True,export_all_vertex_colors=False,export_extras=False)


if __name__=="__main__":
    if "--export-only" in sys.argv:
        export_source()
    else:
        build()
