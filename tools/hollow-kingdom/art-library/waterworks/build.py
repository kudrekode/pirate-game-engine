"""Build one Merewatch waterworks prop. Input and output lengths are metres, Z up."""
import argparse
import hashlib
import json
from math import atan2, cos, pi, sin, tau
from pathlib import Path
import random
import struct
import sys

import bpy
from mathutils import Vector as V

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parents[1]))
import author as kit

PUBLIC = ROOT / "public/assets/hollow-kingdom"
OUT = PUBLIC / "art-library/waterworks"
DOCS = ROOT / "docs/assets/art-library/waterworks"
CELLS = ("stone", "oak", "slate", "copper", "iron", "rope", "moss", "brass")
SURFACE = "Merewatch | hewn surfaces"
GLASS = "Oiled horn | flame"
rng = random.Random()


def materials():
    kit.MATERIALS.clear()
    kit.material(SURFACE, rgb=(1, 1, 1))
    mat = kit.MATERIALS[SURFACE]
    tree = mat.node_tree
    shader = tree.nodes.get("Principled BSDF")
    def image(name, x, y):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(HERE / "maps" / (name + ".jpg")))
        node.location = (x, y)
        if name != "colour":
            node.image.colorspace_settings.name = "Non-Color"
        return node.outputs["Color"]
    tree.links.new(image("colour", -650, 380), shader.inputs["Base Color"])
    normal = tree.nodes.new("ShaderNodeNormalMap")
    normal.location = (-230, -360)
    normal.inputs["Strength"].default_value = .7
    tree.links.new(image("normal", -650, -360), normal.inputs["Color"])
    tree.links.new(normal.outputs[0], shader.inputs["Normal"])
    channels = tree.nodes.new("ShaderNodeSeparateColor")
    channels.location = (-230, 20)
    tree.links.new(image("surface", -650, 20), channels.inputs[0])
    tree.links.new(channels.outputs[1], shader.inputs["Roughness"])
    tree.links.new(channels.outputs[2], shader.inputs["Metallic"])
    kit.material(GLASS, rgb=(.82, .40, .095), glow=(1.0, .31, .046))


class Part(kit.Mesh):
    def __init__(self):
        super().__init__()
        self.loop_normals = []

    def finish(self, name):
        obj = super().finish(name)
        if any(self.loop_normals):
            obj.data.normals_split_custom_set([n or (0,0,0) for n in self.loop_normals])
        return obj

    def face(self, pts, style, uv=None, tint=1):
        pts = [V(p) for p in pts]
        self.loop_normals.extend([None]*len(pts))
        if style == GLASS:
            super().face(pts, GLASS, uv, tint)
            return
        if uv is None:
            # Local planar grain; callers keep U along timber lengths and stone beds.
            u = (pts[1] - pts[0]).normalized()
            n = (pts[1] - pts[0]).cross(pts[-1] - pts[0]).normalized()
            v = n.cross(u)
            uv = [(p.dot(u), p.dot(v)) for p in pts]
        cell = CELLS.index(style)
        if style in ("copper","iron","brass"):
            # A patina streak must continue across neighbouring facets. All metal in this
            # metre-scale kit lies inside one slide of the shared sheet.
            uv = [((cell%4 + .47 + .22*p.x+.113*p.y-.023*p.z)/4,
                   (1-cell//4 + .055+.258*p.z+.037*p.y)/2) for p in pts]
            super().face(pts,SURFACE,uv,tint)
            return
        # Use a continuous island within a single atlas cell, with a 3px inset.
        us, vs = zip(*uv)
        w, h = max(us)-min(us), max(vs)-min(vs)
        scale = min(.985/max(w, h, .0001), .95 if style == "oak" else 1.52)
        ox = rng.uniform(.006, max(.006, .994-w*scale))
        oy = rng.uniform(.006, max(.006, .994-h*scale))
        uv = [((cell % 4 + ox + (u-min(us))*scale)/4,
               (1-cell//4 + oy + (v-min(vs))*scale)/2) for u, v in uv]
        super().face(pts, SURFACE, uv, tint)


part = Part()


def finish(label):
    global part
    part.finish(label)
    part = Part()


def shell(rings, style, tint=1, caps=True):
    if caps:
        part.face(rings[0][::-1], style, tint=tint)
        part.face(rings[-1], style, tint=tint)
    for lo, hi in zip(rings, rings[1:]):
        for i, a in enumerate(lo):
            j = (i+1) % len(lo)
            part.face([a, lo[j], hi[j], hi[i]], style, tint=tint)


def timber(a, b, widths, style="oak", tint=1):
    a, b = V(a), V(b)
    axis = (b-a).normalized()
    ref = V((0, 1, 0)) if abs(axis.y) < .92 else V((0, 0, 1))
    u = ref.cross(axis).normalized()
    v = axis.cross(u)
    w, d = widths
    # Adzed arrises stop short of the full corner. End grain has its own island.
    profile = [(-.42,-.5),(.42,-.5),(.5,-.37),(.5,.37),(.42,.5),(-.42,.5),(-.5,.37),(-.5,-.37)]
    ends = [[p + u*x*w + v*y*d for x,y in profile] for p in (a,b)]
    part.face(ends[0][::-1], style, tint=tint)
    part.face(ends[1], style, tint=tint)
    for i in range(8):
        j = (i+1) % 8
        length = (a-b).length
        edge = (ends[0][i]-ends[0][j]).length
        part.face([ends[0][i], ends[0][j], ends[1][j], ends[1][i]],
                  style, [(0,0),(0,edge),(length,edge),(length,0)], tint)


def tube(path, radius, style, sides=8, tint=1):
    pts = list(map(V, path))
    radii = [radius]*len(pts) if isinstance(radius, (float, int)) else radius
    rings = []
    previous = None
    for i, (center, r) in enumerate(zip(pts, radii)):
        axis = (pts[min(len(pts)-1, i+1)] - pts[max(0, i-1)]).normalized()
        u = previous if previous is not None else min((V((1,0,0)), V((0,1,0)), V((0,0,1))), key=lambda a: abs(a.dot(axis)))
        u = (u - axis*u.dot(axis)).normalized()
        previous = u
        v = axis.cross(u)
        rings.append([center + r*(u*cos(tau*k/sides)+v*sin(tau*k/sides)) for k in range(sides)])
    part.face(rings[0][::-1], style, tint=tint)
    part.face(rings[-1], style, tint=tint)
    for i,(lo,hi) in enumerate(zip(rings,rings[1:])):
        length = (pts[i+1]-pts[i]).length
        edge = radii[i]*tau/sides
        for j,a in enumerate(lo):
            k = (j+1)%sides
            part.face([a,lo[k],hi[k],hi[j]], style, [(0,0),(0,edge),(length,edge),(length,0)], tint)
            if sides >= 7:
                part.loop_normals[-4:] = [tuple((p-c).normalized()) for p,c in
                                           [(a,pts[i]),(lo[k],pts[i]),(hi[k],pts[i+1]),(hi[j],pts[i+1])]]


def lathe(x, y, levels, style, count=12, tint=1, offset=0, caps=True):
    shell([[(x + r*cos(i*tau/count+offset), y+r*sin(i*tau/count+offset), z) for i in range(count)]
           for z,r in levels], style, tint, caps)


def panel(outline, thickness, style, tint=1):
    normal = (V(outline[1])-V(outline[0])).cross(V(outline[2])-V(outline[0])).normalized()
    if normal.dot(V(thickness)) < 0:
        outline = outline[::-1]
    shell([outline, [V(p)+V(thickness) for p in outline]], style, tint)


def cubic(a,b,c,d,n=12):
    a,b,c,d = map(V, (a,b,c,d))
    return [(1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d for t in (i/n for i in range(n+1))]


def stonework():
    # Recessed mortar is also the shaft lining. Its top remains open.
    lathe(0,0,[(.01,.766),(.82,.766),(.82,.520),(.01,.520)],"stone",32,.31,caps=False)
    lathe(0,0,[(.022,.519),(.025,.519)],"slate",32,.20)
    heights = [(0,.108,.846,13),(.111,.310,.802,11),(.313,.514,.793,13),
               (.517,.714,.805,12),(.718,.762,.831,12),(.765,.877,.873,11)]
    for row,(bottom,top,r,count) in enumerate(heights):
        offset = (.21 + row*.43) * tau/count
        bounds = [offset + i*tau/count + rng.uniform(-.022,.022) for i in range(count)]
        for i,a in enumerate(bounds):
            b = bounds[(i+1)%count] + (tau if i==count-1 else 0)
            a += .006
            b -= .006
            mid = (a+b)/2
            radius = r + rng.uniform(-.009,.010)
            polygon = [(radius-.02,a),(radius, a+.022),(radius+.003,mid),
                       (radius,b-.026),(radius-.025,b),(.551,b),(.533,b-.025),
                       (.536,mid),(.533,a+.022),(.551,a)]
            footprint = [V((rad*cos(angle),rad*sin(angle),0)) for rad,angle in polygon]
            center = sum(footprint,V())/len(footprint)
            zhi = top+rng.uniform(-.005,.004)
            rings = [[center+(p-center)*f+V((0,0,z)) for p in footprint]
                     for f,z in [(.94,bottom),(1,bottom+.014),(1,zhi-.020),(.932,zhi)]]
            shell(rings,"stone",rng.uniform(.72,1.0))
    finish("01 • lime-bedded drum and worn coping")


def frame():
    for sign in (-1,1):
        x = .675*sign
        timber((x,0,.85),(x+.014*sign,0,2.29),(.17,.209))
        for z in (.985,1.64):
            timber((x,0,z),(x+.002*sign,0,z+.045),(.183,.218),"iron")
        for y in (-.49,.49):
            timber((x,0,1.78),(x,y,2.21),(.101,.115))
        timber((x,-.70,2.20),(x,.70,2.20),(.15,.148))
        for y in (-.55,.55):
            timber((x,y,2.12),(sign*.42,y,2.39),(.081,.095))
    def gable(y):
        timber((-.97,y,2.126),(.97,y,2.126),(.126,.132))
        timber((0,y,2.93),(0,y,2.09),(.095,.111))
        for s in (-1,1):
            timber((s*1.027,y,1.982),(s*.524,y,2.322),(.093,.123))
            timber((s*.524,y,2.322),(.018,y,2.885),(.093,.123))
            # Curved knees give the gable two open lancets.
            curve = cubic((s*.79,y,2.16),(s*.40,y,2.19),(s*.19,y,2.43),(0,y,2.78))
            tube(curve,[.062-.022*sin(pi*i/(len(curve)-1)) for i in range(len(curve))],"oak",8)
            for x,z in [(s*.69,2.157),(s*.42,2.48)]:
                tube([(x,y-.081,z),(x,y+.081,z)],.022,"oak",9,.59)
        lathe(0,y,[(1.914,.007),(1.99,.052),(2.038,.069),(2.067,.042),(2.11,.047)],"oak",8)
    for y in (-.648,.648):
        gable(y)
    timber((.014,-.83,2.965),(.014,.83,2.965),(.105,.111))
    finish("02 • mortised uprights and open cusped trusses")


def roof():
    for s in (-1,1):
        def point(t, y, lift=0):
            x = s*1.123*(1-t)+.012*t
            z = 2.043 + .925*t - .092*sin(t*pi) - .023*cos(y/.83*pi/2)*sin(t*pi) + lift
            return V((x,y,z))
        for j in range(7):
            lo, hi = j/7,(j+1)/7
            face = [point(lo,-.82),point(lo,.82),point(hi,.82),point(hi,-.82)]
            panel(face,(0,0,-.037),"oak",.64)
        # Each shingle has thickness, clipped shoulders, a split tail and a splayed drip edge.
        for row in range(8):
            start = -.86
            widths = [(.098 if row%2 else .18)] + [rng.uniform(.152,.21) for _ in range(13)]
            for width in widths:
                if start >= .859:
                    break
                end = min(.86,start+width)
                if end-start < .023:
                    break
                w = end-start
                lo = row/8 + rng.uniform(-.012,.008)
                lift = .041 + row*.002
                t = min(1,(row+1.43)/8)
                profile = [(lo+.018,start+.003),(lo+.002,start+w*.16),
                           (lo-rng.uniform(.002,.017),start+w*.53),(lo+.002,end-w*.16),
                           (lo+.021,end-.003),(t,end-.003),(t,start+.003)]
                points = [point(k,y,lift if k<t else .006+row*.002) for k,y in profile]
                panel(points,(0,0,-.016),"slate",rng.uniform(.53,.92))
                start = end
    for y in (-.878,.878):
        # Folded verge flashing wraps the roof edge. Each length meets at the apex.
        for s in (-1,1):
            path = [(s*1.13*(1-t)+.012*t,y,2.074+.935*t-.088*sin(pi*t)) for t in [0,.22,.48,.72,1]]
            tube(path,.023,"copper",8)
    for i in range(7):
        y = -.91 + i*.261
        tube([(.012,y,2.988),(.012,y+.019,2.988),(.012,y+.255,2.988)],
             [.074,.076,.066],"copper",12)
    # A hammered heron vane, small enough for its shape to read as a crest.
    y = -.62
    lathe(.012,y,[(2.99,.038),(3.035,.048),(3.055,.023),(3.202,.014)],"brass",10)
    outline = [(-.18,3.23),(-.082,3.206),(-.14,3.286),(-.03,3.242),
               (.043,3.243),(.098,3.28),(.08,3.331),(.085,3.37),(.126,3.399),
               (.163,3.390),(.242,3.368),(.151,3.368),(.123,3.352),(.13,3.32),
               (.155,3.274),(.144,3.229),(.099,3.199),(.024,3.177),(-.044,3.189)]
    panel([(x,y,z) for x,z in outline],(0,.016,0),"copper")
    for side in (-.004,.020):
        panel([(x,y+side,z) for x,z in [(-.109,3.245),(.073,3.234),(.025,3.204),(-.025,3.201)]],
              (0,.003,0),"brass",.78)
    finish("03 • fish-scale slates, copper ridge and heron vane")


def mechanism():
    center_z = 1.65
    def axle(x): return (x,0,center_z)
    tube([axle(x) for x in (-.838,-.804,-.58,-.53,.53,.58,.82)],
         [.046,.068,.069,.112,.112,.068,.06],"oak",14)
    for x in (-.58,-.525,.503,.552):
        tube([axle(x),axle(x+.022)],.117,"iron",14)
    # One continuous laid rope winds onto the drum and leaves tangentially.
    points = []
    for i in range(181):
        a = i*tau/18
        points.append((-.16 + i*.00145,.121*cos(a),center_z+.121*sin(a)))
    tube(points,.0148,"rope",5)
    tube([points[-1],(.103,.12,1.18),(.107,.119,.98)],.0145,"rope",6)
    # A small, wet bucket can be seen against the dark well shaft.
    bx,by = .107,.119
    for i in range(12):
        a,b = (i+.034)*tau/12,(i+.966)*tau/12
        rings = [[(bx+r*cos(t),by+r*sin(t),z) for r,t in
                  [(radius,a),(radius,b),(radius-.02,b),(radius-.02,a)]]
                 for z,radius in [(.535,.12),(.56,.129),(.822,.173)]]
        shell(rings,"oak",rng.uniform(.67,.96))
    for z,r in [(.567,.131),(.764,.166),(.815,.174)]:
        lathe(bx,by,[(z,r),(z+.015,r+.003)],"iron",12,caps=False)
    bow = [(bx+.17*cos(i*pi/16),by,.805+.178*sin(i*pi/16)) for i in range(17)]
    tube(bow,.01,"iron",7)
    tube([axle(.8),axle(.89),(.91,-.032,1.602),(.926,-.154,1.427),(.928,-.181,1.415)],
         [.043,.04,.032,.025,.034],"iron",8)
    tube([(.924,-.181,1.415),(.96,-.181,1.415),(1.047,-.181,1.415),(1.075,-.181,1.415)],
         [.025,.039,.037,.022],"oak",12)
    finish("04 • windlass, coiled line, iron crank and coopered pail")


def ivy():
    # Only the sheltered north-east joint carries a vine. Folded leaves catch sidelight.
    for cluster in range(11):
        theta = -.91 + .135*cluster
        h = rng.uniform(.28,.76)
        path = []
        for i in range(8):
            t = i/7
            a = theta + .10*sin(t*5 + cluster)
            r = .811+.035*(1-t)**3
            path.append(V((r*cos(a),r*sin(a),.04+t*h)))
        tube(path,.007,"moss",5,.65)
        for i,root in enumerate(path[1:]):
            a = atan2(root.y,root.x)
            radial = V((cos(a),sin(a),0))
            along = V((-sin(a),cos(a),0)) * (-1 if i%2 else 1)
            size = rng.uniform(.043,.079)
            stem = root + radial*.022+along*size*.32
            forward = (along*rng.uniform(.18,.9) + V((0,0,-1))).normalized()*size
            side = radial.cross(forward).normalized()*size
            center = stem+forward*.4+radial*.015
            rim = [stem+forward*f+side*s+radial*.004 for f,s in
                   [(0,0),(-.14,-.43),(.19,-.35),(.31,-.69),(.5,-.29),(1,0),
                    (.53,.24),(.29,.60),(.16,.32),(-.16,.39)]]
            for j,p in enumerate(rim):
                part.face([p,center,rim[(j+1)%len(rim)]],"moss",tint=.7 if j<5 else .92)
    finish("05 • sheltered ivy shoots")


def shell_badge():
    # Ferry guild's freshwater mussel. Small pieces of worn latten sit on a shaped stone tablet.
    x,y = -.14,-.796
    shape = [(-.163,.651),(-.12,.679),(-.105,.71),(.101,.71),(.12,.679),(.163,.651),
             (.15,.508),(.119,.456),(.046,.433),(0,.401),(-.045,.433),(-.119,.456),(-.15,.508)]
    panel([(x+u,y,z) for u,z in shape],(0,-.035,0),"stone",.88)
    contour = [(x+u*.90,y-.037,.559+(z-.559)*.88) for u,z in shape]
    tube(contour+[contour[0]],.006,"iron",5,.66)
    root = V((x,y-.060,.481))
    ribs = []
    for i in range(11):
        angle = -.99 + i*.198
        end = V((x+.125*sin(angle),y-.053,.492+.145*cos(angle)))
        ribs.append(end)
        curve = cubic(root, root+V((.029*sin(angle),-.029,.048)), end+V((0,-.008,-.03)), end, 6)
        tube(curve,[.005,.006,.006,.006,.005,.004,.002],"brass",6,.79)
    part.face([root]+ribs,"copper",tint=.74)
    finish("06 • ferry guild mussel tablet")


def well():
    stonework()
    frame()
    roof()
    mechanism()
    ivy()
    shell_badge()


def bounds(objects):
    points = [o.matrix_world @ V(corner) for o in objects if o.type=="MESH" for corner in o.bound_box]
    return [[round(fn(p[i] for p in points),5) for i in range(3)] for fn in (min,max)]


def build(name, builder, export_only):
    OUT.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    source = HERE / (name + ".blend")
    if not export_only:
        rng.seed(1290)
        materials()
        builder()
        bpy.context.scene.name = name
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    assert all(im.packed_file for im in bpy.data.images if im.source == "FILE" and im.users)
    bpy.context.view_layer.update()
    original = bounds(scene.objects)
    # Preserve construction groups for editing. Join only the transient export copy.
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [obj for obj in scene.objects if obj.type=="MESH"]
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    bpy.context.object.name = name
    path = OUT / (name+".glb")
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_lights=True,
                              export_animations=False, export_vertex_color="ACTIVE", export_yup=True)
    raw = path.read_bytes()
    gltf = json.loads(raw[20:20+struct.unpack_from("<I",raw,12)[0]])
    prims = gltf["meshes"][0]["primitives"]
    assert len(gltf["meshes"]) == 1 and not gltf.get("skins") and not gltf.get("animations")
    assert all("bufferView" in image for image in gltf["images"])
    assert {"TEXCOORD_0","COLOR_0","NORMAL","POSITION"} <= set(prims[0]["attributes"])
    assert "normalTexture" in gltf["materials"][0] and "metallicRoughnessTexture" in gltf["materials"][0]["pbrMetallicRoughness"]
    assert len(prims) == (2 if name == "tide-lantern" else 1)
    triangles = sum(gltf["accessors"][p["indices"]]["count"]//3 for p in prims)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    assert bpy.ops.import_scene.gltf(filepath=str(path)) == {"FINISHED"}
    objects = list(bpy.context.scene.objects)
    mesh = next(o for o in objects if o.type=="MESH")
    mesh.data.calc_loop_triangles()
    assert len(mesh.data.loop_triangles) == triangles
    assert len([o for o in objects if o.type=="LIGHT"]) == int(name == "tide-lantern")
    assert max(abs(a-b) for first,second in zip(original,bounds(objects)) for a,b in zip(first,second)) < .001
    receipt = {"asset": name,"blender": bpy.app.version_string,
               "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
               "glbSha256": hashlib.sha256(raw).hexdigest(), "glbBytes":len(raw),
               "triangles":triangles,"primitives":len(prims),"embeddedMaps":len(gltf["images"]),
               "sourceAndImportedBoundsBlenderXYZ":original,"skins":0,"animations":0,
               "lights":gltf.get("extensions",{}).get("KHR_lights_punctual",{}).get("lights",[])}
    (DOCS / (name+".json")).write_text(json.dumps(receipt,indent="\t")+"\n",encoding="utf-8")
    print(f"VERIFIED {name}: {triangles} triangles; {len(prims)} draws; {len(gltf['images'])} packed maps; bounds {original}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("asset", choices=("heron-well","tide-lantern"))
    parser.add_argument("--export-only", action="store_true")
    options = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    if options.asset == "heron-well":
        build(options.asset, well, options.export_only)
    else:
        sys.path.insert(0, str(HERE))
        from lamp import lantern
        build(options.asset, lambda: lantern(sys.modules[__name__]), options.export_only)
