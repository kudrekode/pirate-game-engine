"""Author and round-trip Bracken's road harness, bay coat and winter groom."""
import hashlib
import json
import math
import random
import struct
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector, kdtree, noise
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path[:0] = [str(HERE), str(HERE.parent.parent)]
import horse
from surfaces import linear, mix

SOURCE = HERE / "bracken-road-mare.blend"
FINAL = ROOT / "public/assets/hollow-kingdom/art-library/creatures/bracken-road-mare.glb"
EVIDENCE = ROOT / "docs/assets/art-library/creatures/bracken-roundtrip.json"
TAU = math.tau


def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def image(name, rgb, alpha=None):
    h, w = rgb.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    if alpha is not None:
        rgba[:, :, 3] = alpha
        im.alpha_mode = "STRAIGHT"
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    return im


def material(name, rgb, rough, metal=0, texture=None, mask=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = (*linear(rgb), 1)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if texture:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = texture
        nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
        if mask:
            cut = nt.nodes.new("ShaderNodeMath")
            cut.operation = "GREATER_THAN"
            cut.inputs[1].default_value = .42
            nt.links.new(tex.outputs["Alpha"], cut.inputs[0])
            nt.links.new(cut.outputs[0], bs.inputs["Alpha"])
    return m


def textiles():
    y, x = np.mgrid[0:512, 0:768]
    u, v = x / 768, y / 512
    rng = np.random.default_rng(411)
    edge = np.minimum(v, 1 - v)
    edge = np.minimum(edge, np.minimum(u, 1 - u) * 1.55)
    dye = np.zeros((*u.shape, 3))
    dye[:] = (.405, .153, .111)
    stripe = ((edge < .13) & (edge > .035))
    dye[stripe] = (.17, .204, .188)
    for at, width, tone in [(.014, .009, (.65, .48, .29)), (.034, .004, (.78, .65, .41)),
                          (.122, .004, (.71, .53, .34)), (.139, .003, (.65, .46, .29))]:
        dye[np.abs(edge - at) < width] = tone
    # Mirrored tablet-woven lozenges and crosses across the outside hem.
    seg = (u * 17) % 1 - .5
    diamond = np.abs(seg) * 2 + np.abs(edge - .079) / .030
    dye[(diamond < 1) & (diamond > .65)] = (.73, .60, .39)
    dye[diamond < .22] = (.63, .34, .20)
    # Paired white herons are woven into the two free rear corners.
    def polygon(xx, yy, verts):
        mask = np.zeros(xx.shape, dtype=bool)
        for (x1, y1), (x2, y2) in zip(verts, verts[1:] + verts[:1]):
            mask ^= ((y1 > yy) != (y2 > yy)) & (xx < (x2 - x1) * (yy - y1) / (y2 - y1 + 1e-15) + x1)
        return mask
    xx = (u - .72) / .19
    yy = (np.minimum(v, 1 - v) - .155) / .19
    heron = [(.02, .50), (.19, .49), (.42, .42), (.11, .85), (.42, .68), (.34, .89), (.57, .67),
           (.59, .81), (.73, .59), (.81, .61), (.78, .77), (.85, .89), (.96, .89), (1.13, .82),
           (.94, .84), (.89, .79), (.91, .64), (.87, .50), (.66, .38), (.46, .33), (.32, .27),
           (.21, .20), (.25, .31), (.17, .25), (.23, .38), (.07, .39)]
    dye[polygon(xx, yy, heron)] = (.72, .64, .44)
    twill = .92 + .085 * np.sin(x * 2.1 + y * .41) * np.cos(y * 1.85) + rng.normal(0, .024, v.shape)
    weather = .05 * np.cos(9 * u + 18 * v) * np.cos(13 * u - 9 * v)
    cloth = image("Bracken · rust and sage heron twill", dye * (twill + weather)[:, :, None])
    yy, xx = np.mgrid[:512, :256]
    uu, vv = xx / 255, yy / 511
    # Opaque root, varied individual fibres and tapering windswept tips. UV v=0
    # is the root at each lock's crest. Premultiplication would darken its edges.
    strand = uu + .025 * np.sin(vv * 5.1 + uu * 7) * vv + .009 * np.sin(vv * 14 + uu * 13)
    hairs = (.5 + .5 * np.cos(TAU * (strand * 51 + .17 * np.sin(vv * 5 + uu * 2))))**4
    clumps = (.5 + .5 * np.cos(TAU * (strand * 7 + .13 * np.cos(vv * 2))))**3
    extent = .78 + .10 * np.cos(uu * 34) + .08 * np.sin(uu * 73) + .04 * np.cos(uu * 187)
    width = (.51 - .25 * vv**1.9)
    alpha = (np.abs(uu - .5) < width) & (vv < extent + .08 * hairs)
    fiberlevel = .70 + .32 * clumps + .44 * hairs + .08 * np.cos(vv * 14 + uu * 9)
    rgb = np.stack((.190 + .082 * vv, .136 + .057 * vv, .100 + .041 * vv), axis=-1)
    hair = image("Bracken · winter guard hairs", rgb * fiberlevel[:, :, None], alpha.astype(float))
    return cloth, hair


class Piece:
    def __init__(self):
        self.p, self.w, self.faces, self.uv = [], [], [], []

    def point(self, co, weight="Body"):
        self.p.append(Vector(co))
        self.w.append({weight: 1} if isinstance(weight, str) else weight)
        return len(self.p) - 1

    def face(self, ids, uv=None):
        self.faces.append(list(ids))
        self.uv.extend(uv or [(0, 0)] * len(ids))

    def tube(self, points, radii, bone, axis=(0, 0, 1), sides=10):
        pts = list(map(Vector, points))
        rows = []
        for i, (pt, rd) in enumerate(zip(pts, radii)):
            tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
            a = Vector(axis)
            a = (a - tan * a.dot(tan)).normalized()
            b = tan.cross(a)
            if isinstance(rd, (int, float)):
                rd = (rd, rd)
            row = [self.point(pt + a * (rd[0] * math.cos(j * TAU / sides)) + b * (rd[1] * math.sin(j * TAU / sides)), bone)
                 for j in range(sides)]
            if rows:
                for k in range(sides):
                    n = (k + 1) % sides
                    self.face([rows[-1][k], rows[-1][n], row[n], row[k]])
            rows.append(row)
        self.face(rows[0][::-1])
        self.face(rows[-1])

    def finish(self, name, rig, mat):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.p, [], self.faces)
        mesh.materials.append(mat)
        mesh.update()
        for face in mesh.polygons:
            face.use_smooth = True
        layer = mesh.uv_layers.new(name="Road harness")
        layer.data.foreach_set("uv", [n for uv in self.uv for n in uv])
        assert not mesh.validate(), name
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(ob)
        ob.parent = rig
        groups = {}
        for i, weight in enumerate(self.w):
            for joint, value in weight.items():
                if joint not in groups:
                    groups[joint] = ob.vertex_groups.new(name=joint)
                if value:
                    groups[joint].add([i], value, "REPLACE")
        mod = ob.modifiers.new("Bracken rig", "ARMATURE")
        mod.object = rig
        return ob


def retain(obj, select):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    gone = [f for f in bm.faces if not select(obj.data.materials[f.material_index].name,
                                            f.calc_center_median())]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def remove_rein_loops(stock):
    bm = bmesh.new()
    bm.from_mesh(stock.data)
    unseen = set(bm.verts)
    omit = []
    while unseen:
        todo = [unseen.pop()]
        group = []
        while todo:
            v = todo.pop()
            group.append(v)
            for e in v.link_edges:
                next_v = e.other_vert(v)
                if next_v in unseen:
                    unseen.remove(next_v)
                    todo.append(next_v)
        ys = [v.co.y for v in group]
        if min(ys) < -1.21 and max(ys) > -.30 and min(v.co.z for v in group) > 1.45:
            omit.extend(group)
    bmesh.ops.delete(bm, geom=omit, context="VERTS")
    bm.to_mesh(stock.data)
    bm.free()
    stock.data.update()


def pigment(p):
    x, y, z = p
    def clamp(v): return min(1, max(0, v))
    mottle = noise.noise(Vector((x * 6.3, y * 7.2, z * 6.3)))
    # A seal-bay dorsal line, pale belly, natural points, a narrow irregular
    # blaze over the nasal bridge, and one small hind coronet.
    flank = clamp(1 - abs(z - 1.14) * 3.5)
    sun = .17 + .47 * flank + .18 * mottle + .09 * math.cos(y * 4 + x * 8)
    base = mix((72, 45, 34), (177, 107, 67), sun)
    dapple = clamp((noise.noise(Vector((x * 12, y * 13, z * 14))) + .12) * 1.07) * flank
    base = mix(base, (182, 135, 99), dapple * .39)
    base = mix(base, (48, 39, 34), clamp((.79 - z) * 2) * .95)
    base = mix(base, (171, 129, 93), clamp((1.14 - z) * 5) * clamp(1 - abs(x) * 3.1) * flank * .85)
    muzzle = clamp((-y - 1.25) * 9.2)
    base = mix(base, (99, 93, 88), muzzle * .84)
    if y < -.98:
        base = mix(base, (50, 44, 39), clamp((.078 - abs(y + 1.066)) * 11) * clamp((.061 - abs(z - 1.785)) * 16))
        front_height = 1.91 + (y + 1.0) * .94
        ridge = clamp((z - front_height + .025) * 59)
        width = .004 + .033 * math.exp(-((y + 1.106) / .069)**2) + .010 * math.exp(-((y + 1.264) / .051)**2)
        star = clamp((width - abs(x - .008 * math.sin(23 * y))) * 95)
        base = mix(base, (214, 201, 174), star * ridge)
    if x < 0 and y > .25:
        base = mix(base, (172, 157, 137), clamp((.23 + .022 * math.sin(x * 47 + y * 12) - z) * 35))
    return linear(base)


def unify_body(model, rig, mat):
    body = model.copy()
    body.data = model.data.copy()
    bpy.context.collection.objects.link(body)
    body.name = "01 · seal-bay anatomy"
    retain(body, lambda key, p: key in ("Bay coat", "nose") or
           (key == "points" and (p.z < .70 or p.z > 1.90)))
    body.modifiers.clear()
    coords = [v.co.copy() for v in body.data.vertices]
    weights = [{body.vertex_groups[g.group].name: g.weight for g in v.groups} for v in body.data.vertices]
    tree = kdtree.KDTree(len(coords))
    for idx, co in enumerate(coords):
        tree.insert(co, idx)
    tree.balance()
    active(body)
    body.data.remesh_voxel_size = .0105
    bpy.ops.object.voxel_remesh()
    for kind, settings in (("SMOOTH", {"factor": .95, "iterations": 8}), ("DECIMATE", {"ratio": .165})):
        mod = body.modifiers.new(kind.title(), kind)
        for k, val in settings.items():
            setattr(mod, k, val)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    data = body.data
    data.materials.clear()
    data.materials.append(mat)
    body.vertex_groups.clear()
    groups = {b.name: body.vertex_groups.new(name=b.name) for b in rig.data.bones}
    for vert in data.vertices:
        influences = {}
        for _, i, dist in tree.find_n(vert.co, 4):
            for key, w in weights[i].items():
                influences[key] = influences.get(key, 0) + w / (.001 + dist)**2
        top = sorted(influences.items(), key=lambda arg: -arg[1])[:4]
        s = sum(value for _, value in top)
        for key, value in top:
            if value > 0:
                groups[key].add([vert.index], value / s, "REPLACE")
    for f in data.polygons:
        f.use_smooth = True
        f.material_index = 0
    for vert in data.vertices:
        x, y, z = vert.co
        side = 1 if x >= 0 else -1
        def bulge(cy, cz, dy, dz):
            return math.exp(-((y - cy) / dy)**2 - ((z - cz) / dz)**2)
        sideward = min(1, abs(x) * 5)
        # Shape the plane of the shoulder blade, forearm extensor and
        # cheek muscle. These broad changes survive the game camera.
        relief = .028 * bulge(-.43 + .30 * (1.28 - z), 1.23, .085, .21)
        relief -= .019 * bulge(-.34 + .25 * (1.24 - z), 1.23, .075, .22)
        relief += .018 * bulge(.45 + .34 * (1.03 - z), 1.04, .115, .21)
        relief += .012 * bulge(-1.028, 1.711, .055, .09)
        vert.co.x += side * relief * sideward
    data.update()
    for attr in list(data.color_attributes):
        data.color_attributes.remove(attr)
    color = data.color_attributes.new("Pigment", "FLOAT_COLOR", "POINT")
    color.data.foreach_set("color", [v for vert in data.vertices for v in (*pigment(vert.co), 1)])
    bs = mat.node_tree.nodes["Principled BSDF"]
    vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Pigment"
    # Directional short hair follows the body in physical space. Draped hide
    # uses a low-amplitude normal and a subtle mottled undercoat.
    for layer in list(data.uv_layers):
        data.uv_layers.remove(layer)
    uv = data.uv_layers.new(name="Coat nap")
    for f in data.polygons:
        axis = max(range(3), key=lambda i: abs(f.normal[i]))
        a, b = ((1, 2), (0, 2), (1, 0))[axis]
        for idx in f.loop_indices:
            p = data.vertices[data.loops[idx].vertex_index].co
            uv.data[idx].uv = (p[a] * 1.75 + .21 * math.sin(3.2 * p[b]), p[b] * 1.75 + .13 * math.sin(2.7 * p[a]))
    yy, xx = np.mgrid[:512, :512]
    random_field = np.random.default_rng(215).normal(0, 1, xx.shape)
    drift = np.rint(2 * np.sin(TAU * xx / 512) + 2 * np.sin(TAU * (xx - yy) / 256)).astype(int)
    flowing = random_field[(yy + drift) % 512, xx]
    # A short, staggered fibre has a finite length. Correlating scattered
    # seeds along that length keeps a smooth coat from becoming striped.
    fibers = sum(np.roll(flowing, k, axis=1) for k in range(7)) / math.sqrt(7)
    tone = np.clip(.91 + .021 * fibers + .009 * random_field, 0, 1)
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image("Bracken · short coat fibres", tone[:, :, None])
    mult = mat.node_tree.nodes.new("ShaderNodeMixRGB")
    mult.blend_type = "MULTIPLY"
    mult.inputs[0].default_value = 1
    mat.node_tree.links.new(tex.outputs[0], mult.inputs[1])
    mat.node_tree.links.new(vc.outputs[0], mult.inputs[2])
    mat.node_tree.links.new(mult.outputs[0], bs.inputs["Base Color"])
    bs.inputs["Sheen Weight"].default_value = .065
    mod = body.modifiers.new("Bracken rig", "ARMATURE")
    mod.object = rig
    return body


def groom(rig, mat, body):
    strands = Piece()
    rng = random.Random(829)
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    def ribbon(path, widths, direction, weights):
        rows = []
        for j, (p, w, bone) in enumerate(zip(path, widths, weights)):
            d = Vector(direction[j] if isinstance(direction, list) else direction).normalized()
            c = Vector(p)
            row = []
            for i in range(5):
                u = i / 4
                # A curved cross-section shades a tuft as a small volume.
                bow = .13 * w * math.sin(u * math.pi)
                pt = c + d * ((u - .5) * 2 * w) + Vector((bow, 0, bow))
                row.append(strands.point(pt, bone))
            if rows:
                for i in range(4):
                    ids = [rows[-1][i], rows[-1][i + 1], row[i + 1], row[i]]
                    strands.face(ids, [(i / 4, (j - 1) / (len(path) - 1)), ((i + 1) / 4, (j - 1) / (len(path) - 1)),
                                      ((i + 1) / 4, j / (len(path) - 1)), (i / 4, j / (len(path) - 1))])
            rows.append(row)
    # A thick, slightly wind-parted winter mane lies along the actual crest;
    # a short far-side layer closes the silhouette from the back of the rider.
    for sign, count in ((1, 30), (-1, 21)):
        for i in range(count):
            t = i / (count - 1)
            y = -.476 - .490 * t
            top = tree.ray_cast(Vector((0, y, 2.2)), Vector((0, 0, -1)))[0]
            z = top.z + .012 if top else 1.54 + .357 * t
            span = (.156 + .073 * math.sin(t * math.pi) + rng.uniform(-.039, .064)) * (1 if sign == 1 else .74)
            drift = .035 + rng.uniform(-.008, .065)
            w = rng.uniform(.023, .040)
            # Hairs sweep across the crest before lying down the broad neck.
            pts = [(0, y, z - .003), (sign * .045, y + .012, z + .010),
                 (sign * (.072 + .057 * (1 - t)), y + drift * .39, z - .040),
                 (sign * (.09 + .092 * (1 - t)), y + drift * .64, z - span * .55),
                 (sign * (.122 + .087 * (1 - t)), y + drift, z - span)]
            for k in range(2, 5):
                x0, y0, z0 = pts[k]
                contact = tree.ray_cast(Vector((sign * .6, y0, z0)), Vector((-sign, 0, 0)))[0]
                if contact:
                    pts[k] = (contact.x + sign * (.009 + .004 * math.sin(t * 29) + .002 * k), y0, z0)
            bone = horse.skin("Neck", "Head", max(0, min(.9, (t - .75) * 3.6)))
            ribbon(pts, [w * .58, w, w * 1.13, w * .88, w * .45], (0, 1, -.23), [bone] * 5)
    for i in range(15):
        t = i / 14
        x = (t - .5) * .104
        pts = [(x, -.955, 1.898), (x + rng.uniform(-.01, .01), -1.009, 1.915),
             (x * .94 + .012, -1.061, 1.898), (x * .74 + .020, -1.108, 1.861),
             (x * .52 + .021, -1.135 - rng.random() * .035, 1.795 + rng.uniform(-.019, .022))]
        ribbon(pts, [.014, .022, .021, .018, .009], (1, 0, .12), ["Head"] * 5)
    # The dock and tip follow the two original tail joints. Overlapping tapered
    # ribbons stay opaque in the middle and expose individual hairs at the edge.
    for i in range(34):
        a = TAU * i / 34
        sx, sy = math.cos(a), math.sin(a)
        drift = rng.uniform(-.028, .028)
        pts = [(.046 * sx, .758 + .024 * sy, 1.395), (.071 * sx, .843 + .049 * sy, 1.337),
             (.080 * sx, .947 + .075 * sy, 1.140), (.105 * sx, 1.010 + .078 * sy, .92),
             (.107 * sx + .013, 1.071 + .080 * sy, .66), (.080 * sx + .036, 1.113 + .052 * sy, .44),
             (.034 * sx + .032 + drift, 1.123 + .047 * sy, .29 + rng.uniform(-.052, .079))]
        ribbon(pts, [.025, .038, .045, .054, .053, .047, .029],
               (-sy, sx, .04), [horse.skin("Body", "Tail", .47), "Tail", "Tail",
                                horse.skin("Tail", "TailTip", .39), horse.skin("Tail", "TailTip", .76),
                                "TailTip", "TailTip"])
    return strands.finish("03 · winter mane, forelock and tail", rig, mat)


def saddlecloth(rig, mat):
    cloth = Piece()
    rows = []
    for i in range(23):
        t = i / 22
        row = []
        for j in range(37):
            v = j / 36
            a = (2 * v - 1) * 1.95
            top = 1.507 + .047 * (abs(t - .5) * 2)**1.65 + .030 * math.exp(-((t - .04) / .18)**2)
            h = .414 - .048 * t
            w = .343 + .010 * math.sin(math.pi * t)
            y = -.34 + t * .84 + .054 * abs(math.sin(a))**2 * (1 - t)
            # A broad rounded rear corner and slightly wavy cloth hem.
            corner = max(0, (abs(2 * v - 1) - .76) / .24)**2
            y -= .070 * corner * t**5
            ripple = .0045 * math.sin(t * 24 + .7 * math.cos(a)) * math.sin(a)**4
            row.append(cloth.point(((w + ripple) * math.sin(a), y, top - h * (1 - math.cos(a)) + ripple)))
        if rows:
            for j in range(36):
                cloth.face([rows[-1][j], rows[-1][j + 1], row[j + 1], row[j]],
                           [((i - 1) / 22, j / 36), ((i - 1) / 22, (j + 1) / 36), (t, (j + 1) / 36), (t, j / 36)])
        rows.append(row)
    return cloth.finish("04 · heron-weave saddlecloth", rig, mat)


def face_detail(rig, mat, body):
    dark, amber, lip, metal, ear = (Piece() for _ in range(5))
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for sign in (-1, 1):
        def v(x, y, z): return Vector((sign * x, y, z))
        n = v(.9, -.32, .24).normalized()
        horiz = v(.30, .95, .1).normalized()
        up = n.cross(horiz).normalized()
        if up.z < 0:
            up.negate()
        center = tree.ray_cast(v(.39, -1.067, 1.785), v(-1, 0, 0))[0] - n * .007
        def lens(target, p, dx, dz, depth):
            rows = []
            for scale in (1, .82, .48, .03):
                row = []
                for i in range(20):
                    a = TAU * i / 20
                    pt = p + horiz * (math.cos(a) * dx * scale) + up * (math.sin(a) * dz * scale) + n * depth * (1 - scale * scale)
                    row.append(target.point(pt, "Head"))
                if rows:
                    for i in range(20):
                        j = (i + 1) % 20
                        ids = [rows[-1][i], rows[-1][j], row[j], row[i]]
                        if sign < 0:
                            ids.reverse()
                        target.face(ids)
                rows.append(row)
            target.face(rows[-1] if sign > 0 else rows[-1][::-1])
        lens(dark, center, .031, .015, .012)
        lens(amber, center + n * .007, .019, .0105, .006)
        lens(dark, center + n * .013, .011, .004, .002)
        for sgn in (-1, 1):
            pts = []
            for i in range(9):
                t = i / 8
                pts.append(center + horiz * ((t - .5) * .071) + up * sgn * .015 * math.sin(math.pi * t) + n * .004)
            lip.tube(pts, [.0013 + (.0041 if sgn > 0 else .0027) * math.sin(math.pi * j / 8)
                          for j in range(9)], "Head", axis=(0, 0, 1))
        # Rimmed nostril narrows the near edge of the soft muzzle.
        n = v(.75, -.56, .27).normalized()
        center = tree.ray_cast(v(.40, -1.354, 1.511), v(-1, 0, 0))[0] + n * .001
        horiz = v(.46, .73, .50).normalized()
        up = n.cross(horiz).normalized()
        if up.z < 0:
            up.negate()
        lens(dark, center, .023, .011, .002)
        rim = [center + horiz * (.024 * math.cos(k * TAU / 18)) + up * (.012 * math.sin(k * TAU / 18)) + n * .0015 for k in range(19)]
        lip.tube(rim, [.0017 + .0013 * max(0, math.sin(k * TAU / 18)) for k in range(19)],
                 "Head", axis=(0, 0, 1), sides=7)
        mouth = []
        for y, z in [(-1.383, 1.465), (-1.361, 1.460), (-1.326, 1.460), (-1.297, 1.468)]:
            hit = tree.ray_cast(v(.4, y, z), v(-1, 0, 0))[0]
            if hit:
                mouth.append(hit + v(.001, 0, 0))
        if len(mouth) > 1:
            lip.tube(mouth, [.0018] * len(mouth), "Head", axis=(0, 0, 1))
        # Velvety concha sits directly on each ear, with a narrow dark interior
        # and lighter last row. Mapping the outline to the skin avoids a seam.
        rows = []
        for i in range(12):
            t = i / 11
            x = .070 + .042 * t
            z = 1.897 + .114 * t
            w = .004 + .023 * math.sin(math.pi * t)**.78
            row = []
            for j in range(9):
                h = (j - 4) / 4
                hit = tree.ray_cast(v(x + h * w, -1.16, z), v(0, 1, 0))[0]
                if hit is None:
                    hit = v(x + h * w, -.94 + .02 * t, z)
                hit.y -= .0013
                row.append(ear.point(hit, "Head"))
            if rows:
                for j in range(8):
                    ids = [rows[-1][j], rows[-1][j + 1], row[j + 1], row[j]]
                    ear.face(ids if sign > 0 else ids[::-1])
            rows.append(row)
        # Cast snaffle rings, with the narrow cheek piece passing through the ring.
        for x, y, z, rad in ((.109, -1.274, 1.514, .024), (.153, -1.034, 1.750, .015)):
            pts = [v(x, y + rad * math.cos(TAU * k / 24), z + rad * math.sin(TAU * k / 24)) for k in range(25)]
            metal.tube(pts, [.0039] * 25, "Head", axis=(1, 0, 0), sides=7)
    for p, key, name in ((dark, "eye", "Eye and nostril"), (amber, "iris", "Hazel iris"),
                       (lip, "lip", "Eyelids and soft muzzle"), (metal, "brass", "Snaffle rings"),
                       (ear, "ear", "Dark ear interiors")):
        p.finish(name, rig, mat[key])


def saddler(rig, mat):
    pouch, trim, brass = Piece(), Piece(), Piece()
    for sign in (-1, 1):
        def v(x, y, z): return Vector((x * sign, y, z))
        # Soft rear wallets rest behind the mounted rider's thigh. Raised
        # corner seams and short fasteners give their flaps a readable edge.
        outline = [(-.13, .052), (-.111, .102), (-.061, .119), (.081, .108), (.136, .062),
                 (.117, -.082), (.068, -.120), (-.064, -.125), (-.117, -.085)]
        rows = []
        for x, s in ((.276, .88), (.336, .99), (.360, 1), (.375, .92), (.383, .72)):
            row = [pouch.point(v(x, .409 + y * s, 1.248 + z * s)) for y, z in outline]
            if rows:
                for k in range(len(row)):
                    j = (k + 1) % len(row)
                    pouch.face([rows[-1][k], rows[-1][j], row[j], row[k]])
            rows.append(row)
        center = pouch.point(v(.388, .412, 1.24))
        for k in range(len(rows[-1])):
            pouch.face([rows[-1][k], rows[-1][(k + 1) % len(rows[-1])], center])
        outline = [(.305, 1.313), (.314, 1.265), (.339, 1.232), (.404, 1.208), (.479, 1.228), (.522, 1.274), (.523, 1.316)]
        seam = [v(.382, y, z) for y, z in outline]
        trim.tube(seam, [.006] * len(seam), "Body", axis=(1, 0, 0), sides=8)
        for y0 in (.347, .466):
            trim.tube([v(.343, y0, 1.355), v(.375, y0, 1.307), v(.385, y0, 1.26),
                       v(.389, y0, 1.201)], [(.013, .004), (.012, .005), (.012, .005), (.008, .004)],
                       "Body", axis=(0, 1, 0), sides=8)
            pts = [v(.391, y0 + dy, 1.247 + dz) for dy, dz in
                 [(-.016, .010), (.016, .010), (.016, -.010), (-.016, -.010), (-.016, .010)]]
            brass.tube(pts, [.0026] * 5, "Body", axis=(1, 0, 0), sides=7)
        # A rolled knee block curves from the pommel down the front saddle flap.
        pouch.tube([v(.17, -.147, 1.539), v(.266, -.177, 1.467), v(.324, -.176, 1.366),
                    v(.347, -.145, 1.271), v(.355, -.112, 1.202)],
                   [(.014, .013), (.029, .030), (.038, .030), (.029, .024), (.008, .008)],
                   "Body", axis=(0, 1, 0), sides=12)
        trim.tube([v(.323, -.181, 1.362), v(.348, -.164, 1.298), v(.359, -.127, 1.222),
                   v(.363, -.073, 1.163), v(.359, .030, 1.155), v(.347, .158, 1.188)],
                  [.002, .0034, .0037, .0037, .0035, .001], "Body", axis=(1, 0, 0), sides=8)
        # A sagging leather span climbs to the existing hand contact. The loose
        # end returns to the pommel along a smooth, flattening loop.
        controls = [(.108, -1.272, 1.507), (.165, -1.061, 1.468), (.195, -.801, 1.509),
                  (.181, -.582, 1.594), (.154, -.421, 1.722), (.131, -.351, 1.785),
                  (.118, -.302, 1.776), (.113, -.247, 1.681), (.106, -.205, 1.560)]
        pts = list(map(lambda p: v(*p), controls))
        line = []
        for i in range(len(pts) - 1):
            p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
            for k in range(5):
                t = k / 5
                line.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                                (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
        line.append(pts[-1])
        last = len(trim.p)
        trim.tube(line, [(.0065, .0038)] * len(line), "Body", axis=(1, 0, 0), sides=8)
        for i, p in enumerate(line):
            y = p.y
            bone = horse.skin("Head", "Neck", min(1, max(0, (y + 1.19) * 2.6))) if y < -.9 else (
                  horse.skin("Neck", "Body", min(1, max(0, (y + .9) * 2.6))))
            for k in range(8):
                trim.w[last + i * 8 + k] = bone
    for piece, key, name in ((pouch, "bag", "Rear saddle wallets"), (trim, "edge", "Raised flap edges"),
                           (brass, "brass", "Wallet buckles")):
        obj = piece.finish(name, rig, mat[key])
        # Two-sided leather gussets have a closed rear face against the body.
        for face in obj.data.polygons:
            face.use_smooth = key != "bag"


def author():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    horse.palette()
    rig = horse.rig()
    stock = horse.build_mesh(rig)
    cloth, guardhair = textiles()
    mats = {
        "coat": material("Bracken · bay roan", (100, 69, 47), .74),
        "cloth": material("Bracken · woven rust", (117, 59, 40), .91, texture=cloth),
        "hair": material("Bracken · dark mane", (44, 34, 25), .62, texture=guardhair, mask=True),
        "bag": material("Bracken · waxed saddlebag", (77, 52, 38), .68),
        "edge": material("Bracken · burnished leather welt", (110, 76, 49), .58),
        "brass": material("Bracken · rubbed brass", (152, 121, 77), .39, .65),
        "eye": material("Bracken · vitreous black", (24, 22, 19), .17),
        "iris": material("Bracken · dark hazel", (66, 46, 31), .32),
        "lip": material("Bracken · dark muzzle", (69, 54, 47), .84),
        "ear": material("Bracken · ear velvet", (72, 48, 42), .93),
    }
    body = unify_body(stock, rig, mats["coat"])
    remove_rein_loops(stock)
    retain(stock, lambda name, _: name in ("leather", "rein", "brass", "hoof"))
    stock.name = "02 · travelling saddle and original rein contact"
    for slot in stock.material_slots:
        if slot.material.name == "brass":
            slot.material = mats["brass"]
        elif slot.material.name in ("leather", "rein", "hoof"):
            shader = slot.material.node_tree.nodes["Principled BSDF"]
            name = slot.material.name
            rgb = {"leather": (87, 53, 36), "rein": (61, 44, 34), "hoof": (76, 71, 62)}[name]
            shader.inputs["Base Color"].default_value = (*linear(rgb), 1)
            shader.inputs["Roughness"].default_value = .58 if name == "leather" else .67
    active(stock)
    bpy.ops.object.material_slot_remove_unused()
    groom(rig, mats["hair"], body)
    saddlecloth(rig, mats["cloth"])
    face_detail(rig, mats, body)
    saddler(rig, mats)
    horse.horse_actions(rig)
    rig.animation_data.action = bpy.data.actions["HorseIdle"]
    bpy.context.scene.frame_set(0)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 72
    active(rig)
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            sp = area.spaces.active
            sp.overlay.show_overlays = False
            sp.region_3d.view_rotation = Vector((-3.7, 2.15, -.8)).to_track_quat("-Z", "Y")
            sp.region_3d.view_location = (0, -.03, 1.05)
            sp.region_3d.view_distance = 3.9
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)


def check(path):
    header = horse.header(path)
    assert set(horse.GAITS) == {a["name"] for a in header["animations"]}
    assert len(header["skins"]) == 1 and all("bufferView" in im for im in header["images"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(path))
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.find_armature()]
    assert all(all(abs(sum(g.weight for g in v.groups) - 1) < .002 for v in o.data.vertices) for o in parts)
    rest = {b.name: [round(x, 6) for row in b.matrix_local for x in row] for b in rig.data.bones}
    for t in rig.animation_data.nla_tracks:
        t.mute = True
    motions = {}
    for name in horse.GAITS:
        action = bpy.data.actions[name]
        rig.animation_data.action = action
        first, last = action.frame_range
        seats, hooves = [], []
        for j in range(21):
            t = first + (last - first) * j / 20
            bpy.context.scene.frame_set(int(t), subframe=t % 1)
            seats.append((rig.matrix_world @ rig.pose.bones["Saddle"].head).z)
            hooves.append((rig.matrix_world @ rig.pose.bones["forePastern.L"].head).z)
        motions[name] = {"seconds": round((last - first) / 30, 3), "hoofTravelMetres": round(max(hooves) - min(hooves), 4),
                       "saddleTravelMetres": round(max(seats) - min(seats), 4)}
    dimensions = [(o.matrix_world @ Vector(pt)) for o in parts for pt in o.bound_box]
    size = {label: round(max(v[i] for v in dimensions) - min(v[i] for v in dimensions), 3)
          for label, i in (("width", 0), ("length", 1), ("height", 2))}
    return motions, rest, size


def export_saved_source():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    rig.animation_data.action = None
    used_images = [im for im in bpy.data.images if im.users]
    assert len(used_images) >= 2 and all(im.packed_file for im in used_images)
    model = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    # Group by material where pieces share hardware. Pigmented coat and
    # alpha-tested hair retain their own mesh and their own exported channels.
    details = [o for o in model if o.name not in ("01 · seal-bay anatomy", "03 · winter mane, forelock and tail")]
    for part in details:
        if part.data.uv_layers.active:
            part.data.uv_layers.active.name = "Road harness"
    active(details[0])
    for obj in details:
        obj.select_set(True)
    bpy.ops.object.join()
    model = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for obj in model:
        obj.data.validate()
    active(rig)
    for obj in model:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(FINAL), export_format="GLB", use_selection=True,
                              export_animations=True, export_animation_mode="ACTIONS",
                              export_frame_range=False, export_force_sampling=False,
                              export_optimize_animation_size=False, export_anim_slide_to_zero=True,
                              export_vertex_color="NAME", export_vertex_color_name="Pigment",
                              export_yup=True, export_cameras=False, export_lights=False)


def check_published_file():
    header = horse.header(FINAL)
    mane = next(m for m in header["materials"] if m["name"] == "Bracken · dark mane")
    assert mane.get("alphaMode") == "MASK" and mane.get("doubleSided"), mane
    raw = FINAL.read_bytes()
    start = 28 + struct.unpack_from("<I", raw, 12)[0]
    primitives = {header["materials"][p["material"]]["name"]: p for m in header["meshes"] for p in m["primitives"]}
    coat = primitives["Bracken · bay roan"]
    assert "COLOR_0" in coat["attributes"] and "TEXCOORD_0" in coat["attributes"]
    attr = header["accessors"][coat["attributes"]["COLOR_0"]]
    color_view = header["bufferViews"][attr["bufferView"]]
    fmt, maximum = {5121: ("B", 255), 5123: ("H", 65535), 5126: ("f", 1)}[attr["componentType"]]
    width = 4 if attr["type"] == "VEC4" else 3
    offset = start + color_view.get("byteOffset", 0) + attr.get("byteOffset", 0)
    stride = color_view.get("byteStride", width * struct.calcsize(fmt))
    red = [struct.unpack_from("<" + fmt, raw, offset + i * stride)[0] / maximum for i in range(attr["count"])]
    assert min(red) < .06 and max(red) - min(red) > .24, "Missing bay pigment on exported coat"
    # A joined export can silently use a blank UV layer for the saddlecloth.
    # Check the material's actual exported UV range on both sides of its hem.
    uv_index = primitives["Bracken · woven rust"]["attributes"]["TEXCOORD_0"]
    uv = header["accessors"][uv_index]
    view = header["bufferViews"][uv["bufferView"]]
    assert uv["componentType"] == 5126 and uv["type"] == "VEC2"
    offset = start + uv.get("byteOffset", 0) + view.get("byteOffset", 0)
    coords = [struct.unpack_from("<2f", raw, offset + i * view.get("byteStride", 8)) for i in range(uv["count"])]
    assert all(max(axis) - min(axis) > .98 for axis in zip(*coords))
    motions, rest, size = check(FINAL)
    prior, baseline, stock_size = check(horse.OUT / "horse.glb")
    assert motions == prior and rest == baseline
    assert len(rest) == 20 and "Saddle" in rest
    assert abs(size["height"] - stock_size["height"]) < .05
    rider = horse.check_rider_fit(horse.OUT / "rider.glb")
    assert rider == 1.619
    record = {"asset": "Bracken road mare", "blender": bpy.app.version_string, "rigBones": len(rest),
            "packedTextures": len(header["images"]), "materials": len(header["materials"]),
            "triangles": sum(header["accessors"][p["indices"]]["count"] // 3 for m in header["meshes"] for p in m["primitives"]),
            "sizeMetres": size, "baselineSizeMetres": stock_size, "gaits": motions,
            "saddleBone": "Saddle", "saddleRestHeightMetres": horse.SADDLE_Y, "allRestJointMatricesMatch": True,
            "externalRider": "rider.glb#Ride", "boundSkin": "wayfarer.glb", "authoredRiderPelvisMetres": rider}
    record["glbSha256"] = hashlib.sha256(raw).hexdigest()
    EVIDENCE.write_text(json.dumps(record, indent="\t") + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(record))


if __name__ == "__main__":
    if "--check-only" not in sys.argv:
        if "--export-only" not in sys.argv:
            author()
        export_saved_source()
    check_published_file()
