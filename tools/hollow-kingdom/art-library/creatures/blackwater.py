"""Build the Blackwater Wyrm and verify every exported action in Blender."""
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PUBLIC = ROOT / "public/assets/hollow-kingdom"
FINAL = PUBLIC / "art-library/creatures/blackwater-wyrm.glb"
EVIDENCE = ROOT / "docs/assets/art-library/creatures"
sys.path[:0] = [str(HERE), str(HERE.parent.parent / "chapter-one")]
import drake
from surfaces import linear, materials, mix, skin_color

TAU = math.tau


class Sculpt:
    def __init__(self):
        self.points, self.faces, self.weights, self.colors, self.materials = [], [], [], [], []

    def vertex(self, p, weight, color):
        self.points.append(Vector(p))
        self.weights.append({weight: 1} if isinstance(weight, str) else weight)
        self.colors.append(color)
        return len(self.points) - 1

    def face(self, ids, material, outward=None):
        ids = list(ids)
        if outward is not None:
            a, b, c = (self.points[i] for i in ids[:3])
            if (b - a).cross(c - a).dot(Vector(outward)) < 0:
                ids.reverse()
        self.faces.append(ids)
        self.materials.append(material)

    def finish(self, name, rig, mat):
        data = bpy.data.meshes.new(name)
        data.from_pydata(self.points, [], self.faces)
        data.update()
        assert not data.validate(), name
        names = list(dict.fromkeys(self.materials))
        for key in names:
            data.materials.append(mat[key])
        for face, key in zip(data.polygons, self.materials):
            face.material_index = names.index(key)
            face.use_smooth = True
        layer = data.uv_layers.new(name="Metre-scale relief")
        for face in data.polygons:
            axis = max(range(3), key=lambda i: abs(face.normal[i]))
            a, b = ((1, 2), (0, 2), (0, 1))[axis]
            for idx in face.loop_indices:
                p = data.vertices[data.loops[idx].vertex_index].co
                layer.data[idx].uv = p[a] * 3.3, p[b] * 3.3
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = rig
        assign_weights(obj, self.weights)
        paint = data.color_attributes.new(name="Pigment", type="FLOAT_COLOR", domain="POINT")
        paint.data.foreach_set("color", [c for rgb in self.colors for c in (*rgb, 1)])
        modifier = obj.modifiers.new("Mere Wyrm armature", "ARMATURE")
        modifier.object = rig
        return obj

    def branch(self, points, radii, width_axis, weight, material, colors, rings=12, flute=.03):
        # Each ring may drift, flatten or twist along its curved growth path.
        centers = list(map(Vector, points))
        loops = []
        for i, (p, size) in enumerate(zip(centers, radii)):
            tangent = (centers[min(i + 1, len(centers) - 1)] - centers[max(i - 1, 0)]).normalized()
            right = Vector(width_axis)
            right = (right - right.dot(tangent) * tangent).normalized()
            lateral = tangent.cross(right)
            row = []
            for k in range(rings):
                a = k * TAU / rings
                grit = 1 + flute * math.cos(5 * a + .22 * i)
                pos = p + grit * (right * (size[0] * math.cos(a)) + lateral * (size[1] * math.sin(a)))
                color = colors[i] if isinstance(colors, list) else colors
                row.append(self.vertex(pos, weight, linear(color)))
            if loops:
                for k in range(rings):
                    n = (k + 1) % rings
                    self.face((loops[-1][k], loops[-1][n], row[n], row[k]), material)
            loops.append(row)
        self.face(reversed(loops[0]), material)
        self.face(loops[-1], material)

    def plate(self, center, normal, direction, width, length, lift, weight, seed, tone=None):
        # Individual low-domed, interlocking osteoderms with a thick bevel and
        # an asymmetric posterior point. Their facets catch light as the rig moves.
        center, n, along = Vector(center), Vector(normal).normalized(), Vector(direction)
        along = (along - n * along.dot(n)).normalized()
        across = along.cross(n).normalized()
        rng = random.Random(seed)
        tint = tone or (100 + rng.randrange(-10, 10), 111 + rng.randrange(-8, 8), 93 + rng.randrange(-7, 7))
        perimeter = [(-.62, -.87), (.14, -.99), (.75, -.76), (1, -.22),
                     (.80, .41), (.23, 1.08), (-.18, .91), (-.83, .47), (-1, -.18)]
        loops = []
        for size, relief, color in [(1, -.13, mix(tint, (31, 38, 33), .70)), (.91, .18, tint),
                                     (.60, .60, mix(tint, (185, 171, 133), .29))]:
            row = []
            for u, v in perimeter:
                offset = across * (u * width * size) + along * (v * length * size)
                height = (relief + .10 * (1 - abs(u)) - .23 * v) * lift
                row.append(self.vertex(center + offset + n * height, weight, linear(color)))
            if loops:
                for k in range(len(row)):
                    j = (k + 1) % len(row)
                    self.face((loops[-1][k], loops[-1][j], row[j], row[k]), "Shield", n)
            loops.append(row)
        peak = self.vertex(center + n * lift + along * (.20 * length), weight,
                           linear(mix(tint, (200, 181, 138), .34)))
        for k in range(len(loops[-1])):
            self.face((loops[-1][k], loops[-1][(k + 1) % len(loops[-1])], peak), "Shield", n)


def assign_weights(obj, weights):
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    groups = {}
    for index, member in enumerate(weights):
        for name, value in member.items():
            if name not in groups:
                groups[name] = obj.vertex_groups.new(name=name)
            groups[name].add([index], value, "REPLACE")


def use(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def original_limbs(src, base, details):
    # Copy the source's anatomical islands, excluding its separate head/jaw,
    # armour and frills. The body and its four limbs become one sculpted skin.
    vertices = src.data.vertices
    islands = list(range(len(vertices)))

    def root(i):
        while i != islands[i]:
            islands[i] = islands[islands[i]]
            i = islands[i]
        return i
    for edge in src.data.edges:
        a, b = edge.vertices
        islands[root(a)] = root(b)
    forward = {}
    for v in vertices:
        key = root(v.index)
        forward[key] = min(v.co.y, forward.get(key, 100))
    remap = {}
    for face in src.data.polygons:
        ids = face.vertices
        name = src.data.materials[face.material_index].name
        if name == "Claw":
            target, surface = details, "Horn"
        elif name in ("Hide", "Belly") and forward[root(ids[0])] > -1.20:
            target, surface = base, "Hide"
        else:
            continue
        loop = []
        for i in ids:
            if i not in remap:
                v = vertices[i]
                weights = {src.vertex_groups[g.group].name: g.weight for g in v.groups if g.weight > 0}
                color = (85, 77, 61) if name == "Claw" else (120, 127, 106)
                remap[i] = target.vertex(v.co, weights, linear(color))
            loop.append(remap[i])
        target.face(loop, surface)


def skull(base):
    # Non-circular skull sections form a heavy lateral orbit, flattened nose,
    # raised nasal bridge and a broad, nearly horizontal roof of the mouth.
    rows = [(-.87, 1.35, .114, .17, .14), (-.98, 1.38, .228, .215, .125),
            (-1.09, 1.38, .242, .194, .113), (-1.20, 1.385, .246, .173, .102),
            (-1.27, 1.38, .204, .147, .079), (-1.38, 1.38, .162, .102, .064),
            (-1.49, 1.373, .142, .083, .046), (-1.59, 1.37, .144, .094, .041),
            (-1.658, 1.375, .116, .079, .038), (-1.682, 1.372, .072, .055, .031)]
    profile = [(0, 1), (.48, .96), (.75, .72), (.91, .40), (1, .13), (.97, -.53),
               (.77, -.93), (.37, -.99), (0, -1)]
    profile += [(-u, v) for u, v in reversed(profile[1:-1])]
    loops = []
    for y, z, width, upper, lower in rows:
        row = [base.vertex((x * width, y, z + h * (upper if h > 0 else lower)), "Head", (1, 1, 1))
               for x, h in profile]
        if loops:
            for i in range(len(row)):
                j = (i + 1) % len(row)
                base.face((loops[-1][i], loops[-1][j], row[j], row[i]), "Hide",
                          (profile[i][0], 0, profile[i][1]))
        loops.append(row)
    base.face(loops[0], "Hide", (0, 1, 0))
    base.face(loops[-1], "Hide", (0, -1, 0))


def smooth_anatomy(base, rig, materials):
    body = base.finish("01 · continuous skin", rig, materials)
    body.modifiers.clear()
    use(body)
    # Transfer weights from the original anatomical cross sections. Each sampled
    # triangle contributes barycentric joint influences to the finished skin.
    body.data.calc_loop_triangles()
    triangles = [tuple(t.vertices) for t in body.data.loop_triangles]
    bvh = BVHTree.FromPolygons(base.points, triangles, all_triangles=True)
    body.data.remesh_voxel_size = .0145
    bpy.ops.object.voxel_remesh()
    for kind, settings in [("SMOOTH", {"factor": .96, "iterations": 5}),
                           ("DECIMATE", {"ratio": .135})]:
        mod = body.modifiers.new(kind.title(), kind)
        for key, val in settings.items():
            setattr(mod, key, val)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    data = body.data
    data.materials.clear()
    data.materials.append(materials["Hide"])
    for poly in data.polygons:
        poly.use_smooth = True
        poly.material_index = 0
    weights = []
    for v in data.vertices:
        hit, _, face, _ = bvh.find_nearest(v.co)
        ids = triangles[face]
        a, b, c = [base.points[i] for i in ids]
        norm = (b - a).cross(c - a)
        denom = norm.length_squared
        t = max(0, (b - hit).cross(c - hit).dot(norm) / denom) if denom else 1
        u = max(0, (c - hit).cross(a - hit).dot(norm) / denom) if denom else 0
        contributions = {}
        for i, factor in zip(ids, (t, u, max(0, 1 - t - u))):
            for key, value in base.weights[i].items():
                contributions[key] = contributions.get(key, 0) + value * factor
        ordered = sorted(contributions.items(), key=lambda e: -e[1])[:4]
        total = sum(value for _, value in ordered)
        weights.append({key: value / total for key, value in ordered if value > 1.e-8})
    assign_weights(body, weights)
    for attr in list(data.color_attributes):
        data.color_attributes.remove(attr)
    paint = data.color_attributes.new(name="Pigment", type="FLOAT_COLOR", domain="POINT")
    paint.data.foreach_set("color", [c for v in data.vertices for c in (*skin_color(v.co), 1)])
    for uv in list(data.uv_layers):
        data.uv_layers.remove(uv)
    layer = data.uv_layers.new(name="Metre-scale relief")
    for p in data.polygons:
        axis = max(range(3), key=lambda i: abs(p.normal[i]))
        a, b = ((1, 2), (0, 2), (0, 1))[axis]
        handedness = -1 if p.normal[axis] < 0 else 1
        for idx in p.loop_indices:
            co = data.vertices[data.loops[idx].vertex_index].co
            layer.data[idx].uv = co[a] * 2.0 * handedness, co[b] * 2.0
    arm = body.modifiers.new("Mere Wyrm armature", "ARMATURE")
    arm.object = rig
    data.calc_loop_triangles()
    shell = BVHTree.FromPolygons([v.co for v in data.vertices],
                                 [tuple(t.vertices) for t in data.loop_triangles], all_triangles=True)
    return body, shell


def ridge(g, pts, radii, bone, tone, surface="Shield", rings=9):
    axis = (0, 0, 1) if abs((Vector(pts[-1]) - Vector(pts[0])).normalized().z) < .85 else (1, 0, 0)
    g.branch(pts, [(r, r * .82) for r in radii], axis, bone, surface, tone, rings)


def armor(g, shell):
    # Attach the roots to the finished continuous skin and angle the plates
    # along its local tangent plane. This keeps them seated on the curved ribs.
    def attach(start, ray, size, direction, bone, seed, tone=None):
        loc, n, _, _ = shell.ray_cast(Vector(start), Vector(ray), 4)
        if loc is not None:
            g.plate(loc + n * .003, n, direction, *size, bone, seed, tone)
        return loc

    bands = [(-.87, .124, .105, "Neck"), (-.67, .149, .115, "Neck"),
             (-.46, .177, .137, "Chest"), (-.23, .170, .14, "Chest"),
             (.014, .18, .137, "Chest"), (.25, .177, .14, "Root"), (.46, .154, .12, "Root"),
             (.68, .124, .115, "Tail1"), (.88, .103, .107, "Tail1"), (1.07, .091, .099, "Tail2"),
             (1.25, .080, .098, "Tail2"), (1.44, .070, .096, "Tail3"),
             (1.62, .064, .08, "Tail3"), (1.79, .054, .08, "Tail3"),
             (1.95, .043, .074, "Tail4"), (2.09, .036, .07, "Tail4"),
             (2.23, .032, .065, "Tail4"), (2.36, .026, .062, "Tail4"), (2.48, .02, .059, "Tail4")]
    for i, (y, w, l, bone) in enumerate(bands):
        cx = max(0, .114 * (y - 1))
        hit = attach((cx, y, 2.1), (0, 0, -1), (w, l, .039 + .19 * w), (0, 1, .1), bone, i)
        if hit is None:
            continue
        # Paired, backswept scutes. The dorsal row narrows into a toothed keel.
        for sign in (-1, 1):
            sway = math.sin(i * 2.1 + sign) * .014
            s = .84 if i % 3 else .95
            pos = hit + Vector((sign * w * .42, -.056, .012))
            crest = (.055 + .72 * w) * s
            g.branch([pos, pos + Vector((sign * w * .14, .034, crest * .48)),
                      pos + Vector((sign * w * .36, .098, crest * .92)),
                      pos + Vector((sign * w * .40 + sway, .15 * s, crest))],
                     [(.47 * w, .084 * s), (.39 * w, .061 * s), (.13 * w, .026 * s), (.002, .003)],
                     (1, 0, 0), bone, "Shield",
                     [(59, 69, 60), (89, 98, 79), (135, 139, 107), (170, 161, 122)], 9)
            if i < 10:
                for row in (0, 1):
                    offset = w * (1.11 + row * .49) * sign
                    ray = Vector((-sign * (.50 + .48 * row), 0, -.84)).normalized()
                    start = Vector((cx + offset, y + l * (.28 + .46 * row), hit.z - .095 - row * .09)) - ray
                    attach(start, ray, (w * (.74 - .10 * row), l * .91, .036),
                           (sign * .19, 1, -.28), bone, 40 + i * 7 + row,
                           (101, 112, 93) if row == 0 else (114, 119, 94))
    # Low cranial shields form a connected surface running outward from the
    # nasal bridge, with asymmetry in the outer cheek corners.
    for i, (y, w, l) in enumerate([(-1.61, .055, .049), (-1.534, .070, .058),
                                    (-1.445, .081, .060), (-1.352, .095, .063),
                                    (-1.252, .104, .070), (-1.14, .118, .073), (-1.015, .115, .076)]):
        attach((0, y, 2.12), (0, 0, -1), (w, l, .019 + .0015 * i), (0, 1, .16), "Head", i,
               (121, 126, 102))
        for sign in (-1, 1):
            attach((sign * (w + .028), y + .018, 2.12), (0, 0, -1),
                   (w * .62, l * .82, .018), (sign * .31, 1, -.15), "Head", i + 17,
                   (103, 113, 93))
    for sign in (-1, 1):
        for i, (y, z, size) in enumerate([(-1.49, 1.37, .036), (-1.424, 1.374, .04),
                                          (-1.35, 1.38, .044), (-1.28, 1.378, .048),
                                          (-1.209, 1.355, .059), (-1.112, 1.365, .068),
                                          (-1.03, 1.40, .057)]):
            attach((sign * .7, y, z), (-sign, 0, 0), (size * .71, size, .01 + size * .12),
                   (0, 1, .17), "Head", i, (122, 124, 96))


def head(g):
    for sign in (-1, 1):
        def v(x, y, z):
            return Vector((x * sign, y, z))

        # Swept growth rings alternate between weathered edges and dark recesses.
        # The left horn ends in a smaller, bluntly chipped tip.
        def curve(t):
            return v(.164 + .265 * math.sin(math.pi * t * .76), -1.044 + .49 * t,
                     1.493 + .36 * t + .087 * math.sin(math.pi * t))
        end = .96 if sign < 0 else 1
        stations = [0.]
        for j in range(1, 11):
            stations.extend([j * .076 - .016, j * .076, j * .076 + .017])
        stations += [.84, .90, end]
        p, sizes, colors = [], [], []
        for i, t in enumerate(stations):
            ring = .009 * (1 - t) if i != 0 and i % 3 == 2 else 0
            radius = .118 * (1 - t) ** .83 + (.004 if sign < 0 else .0015) + ring
            p.append(curve(t))
            sizes.append((radius, radius * (.82 + .08 * math.cos(t * math.pi))))
            color = mix((68, 63, 51), (205, 190, 146), t ** .7)
            colors.append(mix(color, (192, 183, 144), .22 * (1 - t)) if ring else color)
        g.branch(p, sizes, (1, 0, 0), "Head", "Horn", colors, 17, .048)
        for i, (y, z, length) in enumerate([(-1.08, 1.455, .19), (-1.045, 1.39, .175),
                                             (-.994, 1.34, .124)]):
            start = v(.203, y, z)
            g.branch([start, start + v(.062, .034, .014), start + v(length * .78, .118, .048),
                      start + v(length, .177, .061)],
                     [(.060, .064), (.049, .054), (.018, .021), (.002, .003)],
                     (0, 0, 1), "Head", "Horn",
                     [(74, 75, 60), (100, 103, 81), (143, 140, 109), (174, 159, 123)], 11)

        # A recessed almond-shaped eye. The lid sits forward of the glossy
        # cornea. A narrow slit and shadowed outer limbus stay legible at distance.
        center = v(.223, -1.207, 1.448)
        eye_n = v(.94, -.22, .24).normalized()
        horizontal = v(.23, 1, .13).normalized()
        vertical = eye_n.cross(horizontal).normalized()
        if vertical.z < 0:
            vertical.negate()
        def lens(origin, a, b, depth, colors):
            loops = []
            for k, factor in enumerate((1, .80, .46, .15, .02)):
                row = []
                for j in range(24):
                    angle = TAU * j / 24
                    p = origin + horizontal * (a * factor * math.cos(angle))
                    p += vertical * (b * factor * math.sin(angle)) + eye_n * (depth * (1 - factor**2))
                    rgb = colors[k]
                    row.append(g.vertex(p, "Head", linear(rgb)))
                if loops:
                    for j in range(24):
                        n = (j + 1) % 24
                        g.face((loops[-1][j], loops[-1][n], row[n], row[j]), "Eye", eye_n)
                loops.append(row)
            g.face(loops[-1], "Eye", eye_n)
        lens(center + eye_n * .009, .064, .029, .022,
             [(23, 27, 19), (61, 57, 34), (208, 148, 58), (235, 178, 73), (225, 161, 55)])
        lens(center + eye_n * .029, .0067, .018, .003,
             [(76, 60, 28), (29, 27, 18), (18, 22, 16), (16, 23, 18), (16, 23, 18)])
        for up, depth in ((1, .03), (-1, .023)):
            pts, rad = [], []
            for j in range(11):
                t = j / 10
                pts.append(center + horizontal * ((t - .5) * .155)
                           + vertical * (up * depth * math.sin(t * math.pi)) + eye_n * .013)
                rad.append(.004 + (.011 if up > 0 else .007) * math.sin(t * math.pi))
            ridge(g, pts, rad, "Head", (79, 87, 68))
        ridge(g, [v(.141, -1.375, 1.453), v(.196, -1.281, 1.487),
                  v(.229, -1.206, 1.505), v(.219, -1.132, 1.522), v(.179, -1.047, 1.526)],
              [.005, .021, .032, .037, .013], "Head", (119, 126, 100))
        # Elliptical, inward-dished nostril with a ridged upper lip.
        nostril = v(.112, -1.609, 1.417)
        n = v(.68, -.30, .68).normalized()
        align = v(.24, .95, .09).normalized()
        up = n.cross(align).normalized()
        loops = []
        for sz, dep, tone in [(1.1, .004, (92, 98, 79)), (.94, .013, (126, 128, 99)),
                              (.70, .012, (68, 74, 59)), (.49, .006, (35, 40, 35)),
                              (.02, .004, (23, 29, 26))]:
            row = []
            for k in range(18):
                a = TAU * k / 18
                row.append(g.vertex(nostril + align * (.043 * sz * math.cos(a))
                                    + up * (.020 * sz * math.sin(a)) + n * dep, "Head", linear(tone)))
            if loops:
                for k in range(18):
                    j = (k + 1) % 18
                    g.face((loops[-1][k], loops[-1][j], row[j], row[k]), "Hide", n)
            loops.append(row)
        g.face(loops[-1], "Hide", n)

        # Short recurved teeth in individual gum sockets. The lower row seats on
        # the mandible, and the roof, periodontal rims and tongue have distinct color.
        gum = []
        for i in range(12):
            t = i / 11
            y = -1.651 + .466 * t
            width = .075 + .12 * math.sin(t * math.pi * .42) + .014 * math.sin(2 * math.pi * t)
            z = 1.339 - .044 * t + .004 * math.sin(8 * t)
            gum.append(v(width, y, z))
            length = .029 + .035 * math.sin(i * 1.17)**2
            length += .038 if i in (2, 7) else 0
            r = .009 + length * .10
            for lower in (False, True) if i % 3 != 1 else (False,):
                h = length * (.65 if lower else -1)
                base = v(width * (.85 if lower else 1), y + (.014 if lower else 0),
                         (1.279 - .029 * t) if lower else z)
                ridge(g, [base, base + v(0, .002, h * .33), base + v(-.005, .009, h * .72),
                          base + v(-.011, .016, h)], [r * 1.08, r * .89, r * .49, .0012],
                      "Jaw" if lower else "Head",
                      [(117, 96, 71), (183, 165, 125), (210, 196, 158), (221, 208, 170)], "Teeth", 10)
        ridge(g, gum, [.006 + .006 * math.sin(math.pi * (j + .2) / 12) for j in range(12)],
              "Head", (120, 78, 68), "Mouth")
    rows = [(-1.015, 1.276, .14, .071), (-1.12, 1.251, .204, .081), (-1.23, 1.237, .204, .068),
            (-1.37, 1.245, .153, .054), (-1.50, 1.253, .119, .044), (-1.603, 1.264, .113, .039),
            (-1.654, 1.267, .077, .027), (-1.674, 1.267, .038, .021)]
    loops = []
    for y, z, w, h in rows:
        row = []
        for j in range(24):
            a = TAU * j / 24
            u, ht = math.cos(a), math.sin(a)
            # Interior floor of the jaw is concave inside the gumline.
            if ht > 0:
                zz = z + h * (.58 + .26 * abs(u) - .51 * ht)
                tone = mix((103, 61, 58), (147, 95, 77), abs(u))
            else:
                zz = z + h * ht
                tone = mix((143, 135, 104), (86, 93, 73), abs(u)**2)
            row.append(g.vertex((w * u, y, zz), "Jaw", linear(tone)))
        if loops:
            for j in range(24):
                n = (j + 1) % 24
                g.face((loops[-1][j], loops[-1][n], row[n], row[j]),
                       "Mouth" if j < 12 else "Shield", (math.cos(TAU * (j + .5) / 24), 0, math.sin(TAU * (j + .5) / 24)))
        loops.append(row)
    g.face(loops[0], "Mouth", (0, 1, 0))
    g.face(loops[-1], "Shield", (0, -1, 0))
    for sign in (-1, 1):
        pts = [(sign * w * .91, y, z + h * .50) for y, z, w, h in rows[1:]]
        ridge(g, pts, [.010, .009, .008, .007, .006, .004, .001], "Jaw", (133, 94, 80), "Mouth")
    g.branch([(0, -1.052, 1.282), (0, -1.15, 1.277), (0, -1.26, 1.259),
              (0, -1.39, 1.259), (0, -1.48, 1.266), (.004, -1.565, 1.273)],
             [(.087, .036), (.115, .035), (.109, .026), (.080, .019), (.051, .017), (.012, .005)],
             (1, 0, 0), "Jaw", "Mouth",
             [(100, 62, 65), (124, 75, 76), (151, 91, 89), (154, 90, 84), (140, 87, 83), (134, 84, 79)], 16)
    for sign in (-1, 1):
        # Rear elastic cheek lining spans the moving mandible and upper palate.
        loops = []
        for k in range(9):
            t = k / 8
            row = []
            for j in range(10):
                u = j / 9
                y = -1.018 - u * .213 + .049 * math.sin(math.pi * t) * u
                x = sign * (.122 + .076 * u - .025 * math.sin(math.pi * t))
                z = 1.263 + .041 * t + .012 * math.sin(u * math.pi)
                color = mix((83, 50, 53), (146, 86, 81), .52 * math.sin(math.pi * u) + .1 * math.cos(t * math.pi * 7))
                row.append(g.vertex((x, y, z), drake.skin("Jaw", "Head", t), linear(color)))
            if loops:
                for j in range(9):
                    g.face((loops[-1][j], loops[-1][j + 1], row[j + 1], row[j]), "Gill", (sign, 0, 0))
            loops.append(row)


def gills(g):
    for sign, side in ((-1, "L"), (1, "R")):
        joint = f"Gill.{side}"
        base = Vector((sign * .145, -.977, 1.324))
        tips = [(.301, -.653, 1.62), (.395, -.589, 1.53), (.446, -.543, 1.404),
              (.452, -.534, 1.279), (.394, -.584, 1.179), (.296, -.661, 1.112), (.204, -.768, 1.126)]
        ribs = [Vector((sign * x, y, z)) for x, y, z in tips]
        n = Vector((sign * .7, -.65, -.13))
        for k, (a, b) in enumerate(zip(ribs, ribs[1:])):
            rows = []
            for it in range(8):
                r = .008 + .992 * it / 7
                row = []
                for j in range(9):
                    t = j / 8
                    scallop = math.sin(math.pi * t)
                    reach = r * (1 - .20 * scallop * r**2)
                    p = base.lerp(a.lerp(b, t), reach)
                    p.y -= .051 * math.sin(math.pi * r)
                    p.x += sign * .031 * scallop * math.sin(math.pi * r)
                    rays = abs(math.sin(t * math.pi * 5 + .45 * math.sin(math.pi * r)))**5
                    tone = mix((74, 51, 46), (158, 85, 58), math.sin(math.pi * r)**.7 * .9)
                    tone = mix(tone, (193, 125, 76), .30 * rays * (.4 + .6 * r))
                    tone = mix(tone, (68, 57, 44), max(0, (r - .77) / .23) * .71)
                    row.append(g.vertex(p, joint, linear(tone)))
                if rows:
                    for j in range(8):
                        g.face((rows[-1][j], rows[-1][j + 1], row[j + 1], row[j]), "Gill", n)
                rows.append(row)
        for i, tip in enumerate(ribs):
            mid = base.lerp(tip, .48)
            mid.y -= .053
            end = base.lerp(tip, .86)
            end.y -= .020
            ridge(g, [base, mid, end, tip], [.015, .010, .005, .0018], joint,
                  [(58, 67, 55), (85, 88, 63), (128, 114, 79), (172, 136, 88)], rings=8)


def produce():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    palette = drake.make_materials()
    rig = drake.skeleton()
    old = drake.anatomy(rig, palette)
    base, trim = Sculpt(), Sculpt()
    original_limbs(old, base, trim)
    bpy.data.objects.remove(old, do_unlink=True)
    skull(base)
    mat = materials()
    _, shell = smooth_anatomy(base, rig, mat)
    armor(trim, shell)
    trim.finish("02 · osteoderms and dorsal keel", rig, mat)
    face = Sculpt()
    head(face)
    face.finish("03 · horns, face and mandible", rig, mat)
    fan = Sculpt()
    gills(fan)
    fan.finish("04 · ribbed gill fans", rig, mat)
    drake.animate(rig)
    rig.animation_data.action = bpy.data.actions["Idle"]
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, 72
    scene.frame_set(0)
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.overlay.show_overlays = False
            space.shading.color_type = "VERTEX"
            space.region_3d.view_rotation = Vector((-4.35, 2.9, -1.2)).to_track_quat("-Z", "Y")
            space.region_3d.view_distance = 5.25
            space.region_3d.view_location = (0, .23, .85)
    use(rig)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "blackwater-wyrm.blend"), compress=True)


def export_and_check():
    # Always reopen the saved packed source. --export-only also publishes
    # artist edits made directly in the .blend without rebuilding its meshes.
    bpy.ops.wm.open_mainfile(filepath=str(HERE / "blackwater-wyrm.blend"))
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    assert all(im.packed_file for im in bpy.data.images if im.users)
    models = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    rig.animation_data.action = None
    body = next(o for o in models if o.name.startswith("01"))
    use(body)
    for model in models:
        model.select_set(True)
    bpy.ops.object.join()
    # Blender 5.2 can fill COLOR_0 white on later primitives of a shared
    # vertex-painted mesh. Export one skinned mesh per material, with the same
    # skeleton. Draw count is determined by materials in either layout.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for part in parts:
        part.data.validate()
        part.name = "Blackwater Wyrm · " + part.data.materials[part.data.polygons[0].material_index].name.split(".")[0]
        part.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(FINAL), export_format="GLB", use_selection=True,
                              export_animations=True, export_animation_mode="ACTIONS",
                              export_frame_range=False, export_force_sampling=False,
                              export_anim_slide_to_zero=True, export_yup=True,
                              export_vertex_color="NAME", export_vertex_color_name="Pigment")
    record = drake.round_trip(FINAL)
    # drake.round_trip predates the split material layout. Reopen at the same
    # initial frame and measure the full visible model across all seven meshes.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = drake.FPS
    bpy.ops.import_scene.gltf(filepath=str(FINAL))
    imported = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.find_armature()]
    assert len(imported) == len(mat_names := {o.data.materials[0].name for o in imported}) == 7, mat_names
    bounds = [o.matrix_world @ Vector(pt) for o in imported for pt in o.bound_box]
    record["restSizeMetres"] = {
        key: round(max(v[a] for v in bounds) - min(v[a] for v in bounds), 3)
        for key, a in (("width", 0), ("length", 1), ("height", 2))}
    for obj in imported:
        assert all(abs(sum(g.weight for g in v.groups) - 1) < .002 for v in obj.data.vertices)
        pigment = obj.data.color_attributes.active_color
        assert pigment is not None, obj.name
        channel = [d.color[0] for d in pigment.data]
        assert max(channel) - min(channel) > .04 and min(channel) < .30, obj.name
        assert any(mod.type == "ARMATURE" for mod in obj.modifiers), obj.name
    record["skinnedMeshes"] = len(imported)
    record["packedSourceImages"] = record["embeddedImages"]
    old_record = drake.round_trip(PUBLIC / "chapter-one/drake.glb")
    # The existing joint-level acceptance checks replay every clip and verify
    # the two windup-to-strike handoffs. Also compare scale and kinematics.
    for k, value in record["restSizeMetres"].items():
        assert abs(value - old_record["restSizeMetres"][k]) < .075, (k, value, old_record["restSizeMetres"][k])
    assert record["clips"] == old_record["clips"]
    record.update(asset="Blackwater Wyrm", source="tools/hollow-kingdom/art-library/creatures/blackwater.py")
    record["baselineSizeMetres"] = old_record["restSizeMetres"]
    record["baselineGlb"] = "public/assets/hollow-kingdom/chapter-one/drake.glb"
    record["matchedBaselineClipTravel"] = True
    record["glbSha256"] = hashlib.sha256(FINAL.read_bytes()).hexdigest()
    (EVIDENCE / "roundtrip.json").write_text(json.dumps(record, indent="\t") + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(record))


if __name__ == "__main__":
    if "--export-only" not in sys.argv:
        produce()
    export_and_check()
