"""Build and round-trip the Mere Wyrm's mesh, skeleton and in-place actions.

Blender -b --python-exit-code 1 -P tools/hollow-kingdom/chapter-one/drake.py
"""

import json
import math
import random
import struct
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion, Vector


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "public/assets/hollow-kingdom/chapter-one"
FPS = 30
TAU = math.tau
CLIPS = {
    "Idle": 72, "Walk": 33, "BiteWindup": 24, "Bite": 17,
    "SweepWindup": 33, "Sweep": 22, "Hit": 14, "Death": 43,
}


def skin(bone, blend=None, weight=0):
    return {bone: 1.0} if blend is None else {bone: 1 - weight, blend: weight}


def make_materials():
    palette = {
        "Hide": ((.18, .225, .184, 1), .77),
        "Belly": ((.156, .13, .09, 1), .84),
        "Scute": ((.067, .087, .059, 1), .71),
        "Horn": ((.148, .10, .059, 1), .66),
        "Ivory": ((.50, .394, .25, 1), .6),
        "Mouth": ((.111, .035, .029, 1), .57),
        "Socket": ((.023, .016, .010, 1), .82),
        "Claw": ((.097, .082, .052, 1), .57),
        "Fin": ((.143, .040, .035, 1), .78),
        "Eye": ((.47, .17, .022, 1), .28),
    }
    materials = {}
    for name, (color, roughness) in palette.items():
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.use_backface_culling = name != "Fin"
        material.diffuse_color = color
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = roughness
        if name == "Eye":
            shader.inputs["Emission Color"].default_value = color
            shader.inputs["Emission Strength"].default_value = .45
        materials[name] = material

    def texture_for(name, image_name, size, color_at):
        image = bpy.data.images.new(image_name, size, size, alpha=False)
        pixels = []
        noise = random.Random(6734)
        for y in range(size):
            for x in range(size):
                pixels.extend((*color_at(x / size, y / size, noise.uniform(-.045, .045)), 1))
        image.pixels.foreach_set(pixels)
        image.pack()
        surface = materials[name].node_tree
        texture = surface.nodes.new("ShaderNodeTexImage")
        texture.image = image
        surface.links.new(texture.outputs["Color"], surface.nodes.get("Principled BSDF").inputs["Base Color"])

    def hide(u, v, grain):
        row = v * 24
        col = u * 24 + int(row) % 2 * .5
        cell_x, cell_y = col % 1 - .5, row % 1 - .5
        ridge = min(1, math.hypot(cell_x * 1.4, cell_y * 1.65))
        relief = .61 + .34 * (1 - ridge ** 3) + .18 * (.5 - cell_y)
        mottling = .83 + .14 * math.sin(u * 20.7 + v * 8.4) * math.cos(v * 18.15 - u * 15.3)
        light = relief * mottling + grain
        return .168 * light, .211 * light, .168 * light

    def belly(u, v, grain):
        fold = (1 - (.5 + .5 * math.cos(TAU * (v * 16 + .08 * math.cos(TAU * u)))) ** 6) * .32
        light = .51 + fold + .13 * math.sin(TAU * (u * 3 + v)) + grain
        return .17 * light, .137 * light, .084 * light

    def horn(u, v, grain):
        ridge = (.5 + .5 * math.cos(TAU * (u * 19 + .16 * math.sin(TAU * v)))) ** 3
        variation = .12 * math.sin(TAU * (v * 5.2 + u * 2))
        light = .31 + v * .44 + .14 * ridge + variation + grain
        return .29 * light, .219 * light, .14 * light

    texture_for("Hide", "Speckled overlapping scales", 256, hide)
    texture_for("Belly", "Layered gular plates", 128, belly)
    texture_for("Horn", "Fluted worn horn", 128, horn)
    return materials


def skeleton():
    data = bpy.data.armatures.new("Wyrm quadruped skeleton")
    rig = bpy.data.objects.new("Mere Wyrm armature", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        item = data.edit_bones.new(name)
        item.head, item.tail = head, tail
        if parent:
            item.parent = data.edit_bones[parent]

    bone("Root", (0, 0, .84), (0, 0, 1.15))
    bone("Chest", (0, .01, .99), (0, -.56, 1.045), "Root")
    bone("Neck", (0, -.56, 1.045), (0, -.98, 1.37), "Chest")
    bone("Head", (0, -.98, 1.37), (0, -1.5, 1.35), "Neck")
    bone("Jaw", (0, -1.05, 1.315), (0, -1.55, 1.24), "Head")
    tail = [(0, .43, .93), (0, .92, .72), (.035, 1.44, .46), (.105, 2.02, .31), (.24, 2.61, .42)]
    for index in range(4):
        bone(f"Tail{index + 1}", tail[index], tail[index + 1], "Root" if index == 0 else f"Tail{index}")
    for sign, side in [(-1, "L"), (1, "R")]:
        fore = [(sign * .29, -.46, .98), (sign * .51, -.23, .50), (sign * .59, -.54, .16), (sign * .61, -.81, .076)]
        hind = [(sign * .31, .37, .89), (sign * .57, .13, .53), (sign * .63, .62, .17), (sign * .66, .32, .078)]
        for label, chain, parent in [("Fore", fore, "Chest"), ("Hind", hind, "Root")]:
            for idx, part in enumerate(("Upper", "Lower", "Foot")):
                name = f"{label}{part}.{side}"
                bone(name, chain[idx], chain[idx + 1], parent)
                parent = name
        bone(f"Gill.{side}", (sign * .14, -.89, 1.26), (sign * .43, -.66, 1.54), "Neck")
    bpy.ops.object.mode_set(mode="OBJECT")
    for item in rig.pose.bones:
        item.rotation_mode = "QUATERNION"
    return rig


class Surface:
    def __init__(self):
        self.vertices, self.weights, self.faces, self.materials, self.uvs = [], [], [], [], []

    def vertex(self, point, weights):
        self.vertices.append(tuple(point))
        self.weights.append(weights)
        return len(self.vertices) - 1

    def face(self, indices, material, uv):
        self.faces.append(indices)
        self.materials.append(material)
        self.uvs.extend(uv)

    def tube(self, rows, material, ring_size=14, axis=(1, 0, 0), belly=False):
        """Loft ellipse sections along a 3D path with its own orientation and skin."""
        points = [Vector(row[0]) for row in rows]
        start = len(self.vertices)
        for j, ((_, radius_a, radius_b, weights), center) in enumerate(zip(rows, points)):
            tangent = (points[min(j + 1, len(points) - 1)] - points[max(0, j - 1)]).normalized()
            axis_a = Vector(axis)
            axis_a = (axis_a - tangent * axis_a.dot(tangent)).normalized()
            axis_b = tangent.cross(axis_a)
            for i in range(ring_size):
                angle = TAU * i / ring_size
                point = center + axis_a * (radius_a * math.cos(angle)) + axis_b * (radius_b * math.sin(angle))
                self.vertex(point, weights)
            if j == 0:
                continue
            for i in range(ring_size):
                next_i = (i + 1) % ring_size
                lower = start + (j - 1) * ring_size
                upper = lower + ring_size
                name = material
                if belly:
                    vertical = axis_b.z * math.sin(TAU * (i + .5) / ring_size)
                    name = "Belly" if vertical < -.57 else material
                uv = [(i / ring_size, (j - 1) / (len(rows) - 1)),
                      ((i + 1) / ring_size, (j - 1) / (len(rows) - 1)),
                      ((i + 1) / ring_size, j / (len(rows) - 1)),
                      (i / ring_size, j / (len(rows) - 1))]
                self.face([lower + i, lower + next_i, upper + next_i, upper + i], name, uv)
        for j, reverse in [(0, True), (len(rows) - 1, False)]:
            order = list(range(ring_size))
            if reverse:
                order.reverse()
            self.face([start + j * ring_size + i for i in order], material,
                      [(.5 + math.cos(TAU * i / ring_size) * .5, .5 + math.sin(TAU * i / ring_size) * .5) for i in order])

    def ellipsoid(self, center, dimensions, material, bone, ring_size=12):
        x, y, z = center
        rx, ry, rz = dimensions
        rows = [((x, y, z + rz * math.sin(angle)), rx * math.cos(angle), ry * math.cos(angle), skin(bone))
                for angle in (-1.565, -1.05, -.52, 0, .52, 1.05, 1.565)]
        self.tube(rows, material, ring_size)

    def spike(self, base, bend, tip, widths, material, weights, axis=(1, 0, 0)):
        r, d = widths
        self.tube([(base, r, d, weights), (bend, r * .63, d * .66, weights),
                   (tip, .001, .001, weights)], material, 9, axis)

    def membrane(self, vertices, material, weight):
        """A scalloped ribbed fin with a double-sided glTF material."""
        indices = [self.vertex(point, weight) for point in vertices]
        for i in range(1, len(indices) - 1):
            triangle = [indices[0], indices[i], indices[i + 1]]
            uv = [(0, .5), (i / len(indices), 0), ((i + 1) / len(indices), 1)]
            self.face(triangle, material, uv)

    def finish(self, rig, materials):
        mesh = bpy.data.meshes.new("Wyrm hide, plated bones and gill fins")
        mesh.from_pydata(self.vertices, [], self.faces)
        names = list(dict.fromkeys(self.materials))
        for name in names:
            mesh.materials.append(materials[name])
        for polygon, name in zip(mesh.polygons, self.materials):
            polygon.material_index = names.index(name)
            polygon.use_smooth = True
        layer = mesh.uv_layers.new(name="Scale grain")
        layer.data.foreach_set("uv", [value for pair in self.uvs for value in pair])
        assert not mesh.validate()
        model = bpy.data.objects.new("Mere Wyrm", mesh)
        bpy.context.collection.objects.link(model)
        model.parent = rig
        groups = {bone.name: model.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
        for index, weights in enumerate(self.weights):
            for name, weight in weights.items():
                if weight:
                    groups[name].add([index], weight, "REPLACE")
        deform = model.modifiers.new("Wyrm skin", "ARMATURE")
        deform.object = rig
        return model


def anatomy(rig, materials):
    mesh = Surface()

    def section(y, z, a, b, name, blend=None, ratio=0):
        return ((0, y, z), a, b, skin(name, blend, ratio))

    mesh.tube([
        section(.74, .85, .15, .16, "Root", "Tail1", .45),
        section(.57, .89, .32, .29, "Root", "Tail1", .16),
        section(.38, .91, .43, .35, "Root"),
        section(.1, .89, .39, .37, "Root", "Chest", .18),
        section(-.18, .93, .43, .43, "Chest", "Root", .28),
        section(-.42, .97, .45, .415, "Chest"),
        section(-.63, 1.07, .31, .34, "Chest", "Neck", .48),
        section(-.79, 1.23, .225, .265, "Neck"),
        section(-1.015, 1.34, .22, .21, "Head", "Neck", .27),
    ], "Hide", 26, belly=True)
    mesh.tube([
        ((0, .48, .92), .245, .235, skin("Tail1", "Root", .35)),
        ((0, .72, .81), .208, .186, skin("Tail1")),
        ((0, .93, .72), .163, .15, skin("Tail1", "Tail2", .50)),
        ((.013, 1.17, .58), .129, .118, skin("Tail2")),
        ((.035, 1.44, .46), .098, .085, skin("Tail2", "Tail3", .5)),
        ((.062, 1.77, .35), .082, .068, skin("Tail3")),
        ((.105, 2.02, .31), .066, .053, skin("Tail3", "Tail4", .5)),
        ((.167, 2.31, .33), .047, .037, skin("Tail4")),
        ((.24, 2.61, .42), .013, .014, skin("Tail4")),
        ((.26, 2.67, .45), .001, .002, skin("Tail4")),
    ], "Hide", 16, belly=True)

    # Flattened axe-shaped skull and separate weighted lower jaw.
    mesh.tube([
        section(-.91, 1.39, .14, .155, "Head", "Neck", .25),
        section(-1.04, 1.39, .247, .218, "Head"),
        section(-1.22, 1.391, .26, .201, "Head"),
        section(-1.39, 1.393, .201, .141, "Head"),
        section(-1.56, 1.388, .155, .111, "Head"),
        section(-1.665, 1.382, .101, .081, "Head"),
    ], "Hide", 22)
    mesh.tube([
        section(-1.016, 1.265, .14, .092, "Jaw"),
        section(-1.186, 1.238, .223, .083, "Jaw"),
        section(-1.39, 1.241, .174, .065, "Jaw"),
        section(-1.57, 1.262, .125, .054, "Jaw"),
        section(-1.653, 1.272, .078, .038, "Jaw"),
    ], "Belly", 20)
    mesh.ellipsoid((0, -1.349, 1.298), (.15, .27, .032), "Mouth", "Jaw")
    mesh.ellipsoid((0, -1.339, 1.31), (.085, .195, .035), "Fin", "Jaw")

    for sign, side in [(-1, "L"), (1, "R")]:
        for label in ("Fore", "Hind"):
            upper, lower, foot = [f"{label}{name}.{side}" for name in ("Upper", "Lower", "Foot")]
            start = rig.data.bones[upper].head_local
            knee = rig.data.bones[lower].head_local
            ankle = rig.data.bones[foot].head_local
            toe = rig.data.bones[foot].tail_local
            parent = "Chest" if label == "Fore" else "Root"
            mesh.tube([
                (start + Vector((-sign * .13, .02, .085)), .188, .196, skin(upper, parent, .6)),
                (start.lerp(knee, .24), .24, .237, skin(upper, parent, .12)),
                (start.lerp(knee, .59), .193, .183, skin(upper)),
                (knee, .132, .134, skin(upper, lower, .5)),
                (knee.lerp(ankle, .41), .109, .111, skin(lower)),
                (knee.lerp(ankle, .74), .077, .084, skin(lower)),
                (ankle, .068, .087, skin(lower, foot, .65)),
                (ankle.lerp(toe, .62), .12, .075, skin(foot)),
                (toe, .121, .051, skin(foot)),
            ], "Hide", 17)
            for digit, spread in enumerate((-.105, -.035, .043, .11)):
                base = (toe.x + spread * .58, toe.y + .081, toe.z)
                knuckle = (toe.x + spread, toe.y - .055 + .019 * abs(digit - 1), .055)
                tip = (toe.x + spread * 1.18, toe.y - .145 + .025 * abs(digit - 1), .042)
                mesh.tube([(base, .051, .048, skin(foot)), (knuckle, .041, .034, skin(foot)),
                           (tip, .022, .021, skin(foot))], "Hide", 9)
                mesh.spike(tip, (tip[0], tip[1] - .04, .045), (tip[0], tip[1] - .097, .021),
                           (.026, .022), "Claw", skin(foot))
            for n in range(4):
                plate = knee.lerp(ankle, .16 + n * .18)
                plate.x += sign * (.111 - n * .012)
                mesh.ellipsoid(plate, (.034, .067 - n * .008, .041), "Scute", lower, 8)

        # Heavy horns, asymmetrical spurs, brow shield, visible amber eyes and fangs.
        mesh.spike((sign * .17, -1.026, 1.518), (sign * .329, -.857, 1.679),
                   (sign * (.437 if sign > 0 else .395), -.635, 1.855), (.112, .104), "Horn", skin("Head"))
        mesh.spike((sign * .264, -1.108, 1.399), (sign * .343, -.966, 1.438),
                   (sign * .389, -.868, 1.499), (.045, .055), "Scute", skin("Head"))
        mesh.ellipsoid((sign * .237, -1.213, 1.485), (.043, .097, .051), "Socket", "Head")
        mesh.ellipsoid((sign * .268, -1.234, 1.477), (.020, .044, .020), "Eye", "Head", 10)
        mesh.ellipsoid((sign * .283, -1.245, 1.478), (.008, .008, .016), "Socket", "Head", 8)
        mesh.ellipsoid((sign * .218, -1.231, 1.526), (.070, .126, .036), "Scute", "Head")
        mesh.ellipsoid((sign * .121, -1.602, 1.44), (.036, .031, .015), "Socket", "Head", 8)
        for n in range(7):
            y = -1.62 + n * .061
            x = sign * (.087 + n * .022)
            length = .082 if n in (1, 5) else .04
            mesh.spike((x, y, 1.323), (x * .969, y + .014, 1.31 - length * .35),
                       (x * .94, y + .024, 1.319 - length), (.021, .023), "Ivory", skin("Head"))
            if n % 2:
                mesh.spike((x * 1.01, y + .023, 1.286), (x, y + .027, 1.312),
                           (x * .92, y + .040, 1.352), (.017, .02), "Ivory", skin("Jaw"))

        gill = skin(f"Gill.{side}")
        base = (sign * .157, -.93, 1.30)
        points = [(sign * .426, -.73, 1.622), (sign * .466, -.654, 1.49),
                  (sign * .47, -.597, 1.369), (sign * .408, -.647, 1.22),
                  (sign * .329, -.678, 1.165), (sign * .198, -.79, 1.166)]
        rim = []
        for index, tip in enumerate(points):
            rim.append(tip)
            if index == len(points) - 1:
                continue
            middle = Vector(tip).lerp(Vector(points[index + 1]), .50).lerp(Vector(base), .22)
            rim.append(tuple(middle))
            elbow = Vector(base).lerp(Vector(tip), .54)
            elbow.y -= .041
            mesh.spike(base, elbow, tip, (.016, .024), "Scute", gill)
        mesh.membrane([base, *rim], "Fin", gill)

    # Broad staggered saddle scutes and hooked spines down the spine and tail.
    ridge = [(-1.14, 1.583, .10, .12, "Head"), (-.91, 1.519, .14, .16, "Neck"),
             (-.67, 1.438, .19, .23, "Neck"), (-.42, 1.364, .22, .27, "Chest"),
             (-.14, 1.353, .22, .24, "Chest"), (.13, 1.278, .20, .21, "Root"),
             (.40, 1.235, .19, .18, "Root"), (.66, 1.061, .145, .15, "Tail1"),
             (.9, .888, .12, .12, "Tail1"), (1.16, .706, .098, .12, "Tail2"),
             (1.44, .55, .074, .11, "Tail3"), (1.73, .427, .056, .09, "Tail3"),
             (2.01, .373, .042, .09, "Tail4"), (2.29, .385, .032, .11, "Tail4"),
             (2.5, .423, .024, .10, "Tail4")]
    for idx, (y, z, width, height, bone) in enumerate(ridge):
        x = max(0, (y - 1) * .112)
        mesh.ellipsoid((x, y, z - .018), (width, .128 if idx < 8 else .092, width * .41), "Scute", bone)
        mesh.spike((x, y - .075, z - .004), (x, y + .015, z + height * .57),
                   (x, y + .103, z + height), (width * .36, width * .32), "Horn", skin(bone))
        if idx not in range(1, 9):
            continue
        for sign in (-1, 1):
            mesh.ellipsoid((sign * width * 1.16, y + .034, z - .086),
                           (width * .64, .098, width * .32), "Scute", bone, 8)
    return mesh.finish(rig, materials)


def anatomical_rotation(bone, rotation):
    rest = bone.bone.matrix_local.to_quaternion()
    return rest.inverted() @ Euler(rotation).to_quaternion() @ rest


def aim_bone(bone, direction):
    space = bone.matrix.to_quaternion()
    current = space @ Vector((0, 1, 0))
    bone.rotation_quaternion = space.inverted() @ current.rotation_difference(direction) @ space
    bpy.context.view_layer.update()


def place_leg(bones, label, side, offset):
    upper, lower, foot = [bones[f"{label}{part}.{side}"] for part in ("Upper", "Lower", "Foot")]
    start = upper.head.copy()
    goal = foot.bone.head_local + Vector(offset)
    axis = (goal - start).normalized()
    distance = min((goal - start).length, upper.length + lower.length - 1e-4)
    distance = max(distance, abs(upper.length - lower.length) + 1e-4)
    along = (upper.length ** 2 - lower.length ** 2 + distance ** 2) / (2 * distance)
    sideward = lower.bone.head_local - upper.bone.head_local
    sideward = (sideward - axis * sideward.dot(axis)).normalized()
    hinge = start + axis * along + sideward * math.sqrt(max(0, upper.length ** 2 - along ** 2))
    aim_bone(upper, hinge - start)
    aim_bone(lower, start + axis * distance - hinge)
    aim_bone(foot, foot.bone.tail_local - foot.bone.head_local)


def stride(phase):
    stance = .63
    if phase < stance:
        return .40 * (phase / stance - .5), 0
    swing = (phase - stance) / (1 - stance)
    return .20 * math.cos(math.pi * swing), .12 * math.sin(math.pi * swing) ** 1.3


def profile(samples, t):
    for (start, value), (end, next_value) in zip(samples, samples[1:]):
        if t <= end:
            progress = (t - start) / (end - start)
            ease = progress * progress * (3 - 2 * progress)
            return value + (next_value - value) * ease
    return samples[-1][1]


def pose(name, t):
    """An in-place pose map and optional planted-foot offsets for each authored clip."""
    rot = {}
    offsets = {}
    body = (0, 0, 0)
    if name in ("Idle", "Walk"):
        walking = name == "Walk"
        breath = math.sin(TAU * t)
        body = (.018 * breath if walking else 0, 0, (.031 if walking else .013) * math.sin(TAU * t * (2 if walking else 1)))
        rot.update({"Chest": (.012 * breath, .028 * breath, .03 * breath),
                    "Neck": (.034 * breath, 0, -.052 * breath),
                    "Head": (-.023 * breath, .013 * breath, .03 * breath),
                    "Jaw": (.021 + .016 * breath, 0, 0)})
        for i in range(1, 5):
            rot[f"Tail{i}"] = (.014 * breath, 0, (.125 if walking else .063) * math.sin(TAU * t - i * .5))
        for label, side, phase in (("Fore", "L", .00), ("Hind", "R", .26), ("Fore", "R", .50), ("Hind", "L", .76)):
            dy, dz = stride((t + phase) % 1) if walking else (0, 0)
            offsets[(label, side)] = (0, dy, dz)
        for sign, side in ((-1, "L"), (1, "R")):
            rot[f"Gill.{side}"] = (.025 * breath, 0, sign * .035 * breath)
    elif name.startswith("Bite"):
        if name == "BiteWindup":
            charge = profile([(0, 0), (.65, 1), (1, 1)], t)
            strike = 0
        else:
            charge = profile([(0, 1), (.24, 0), (1, 0)], t)
            strike = profile([(0, 0), (.24, 1), (.43, .90), (1, 0)], t)
        body = (0, .10 * charge - .27 * strike, .027 * charge - .061 * strike)
        rot.update({"Chest": (-.12 * charge + .11 * strike, 0, 0),
                    "Neck": (-.31 * charge + .15 * strike, 0, 0),
                    "Head": (.075 * charge - .11 * strike, 0, 0),
                    "Jaw": (.70 * charge + .08 * strike, 0, 0),
                    "Tail1": (.12 * charge, .04 * strike, 0),
                    "Tail2": (.14 * charge, 0, .15 * strike)})
        for sign, side in ((-1, "L"), (1, "R")):
            rot[f"Gill.{side}"] = (-.19 * charge, 0, sign * .25 * charge)
            offsets[("Fore", side)] = (sign * .047 * strike, -.19 * strike, 0)
    elif name.startswith("Sweep"):
        if name == "SweepWindup":
            curl = profile([(0, 0), (.82, 1), (1, 1)], t)
            lash = 0
        else:
            curl = profile([(0, 1), (.25, 0), (1, 0)], t)
            lash = profile([(0, 0), (.31, 1), (.59, .73), (1, 0)], t)
        body = (.056 * curl - .11 * lash, .033 * curl, -.074 * (curl + lash))
        rot.update({"Root": (0, -.08 * curl + .06 * lash, -.20 * curl + .24 * lash),
                    "Chest": (.085 * curl, .03 * lash, -.12 * curl + .22 * lash),
                    "Neck": (.07 * curl, -.09 * lash, .28 * curl - .19 * lash),
                    "Head": (0, 0, .11 * curl - .16 * lash), "Jaw": (.14 * curl + .10 * lash, 0, 0)})
        for i in range(1, 5):
            rot[f"Tail{i}"] = ((.14 - .032 * i) * curl - .025 * lash, 0,
                               (.63 - .08 * i) * curl - (.73 - .09 * i) * lash)
        for sign, side in ((-1, "L"), (1, "R")):
            rot[f"Gill.{side}"] = (-.12 * curl, 0, sign * .27 * curl)
    elif name == "Hit":
        flinch = profile([(0, 0), (.22, 1), (.48, .62), (1, 0)], t)
        body = (-.055 * flinch, .10 * flinch, -.044 * flinch)
        rot.update({"Chest": (-.085 * flinch, .08 * flinch, .11 * flinch),
                    "Neck": (-.25 * flinch, -.14 * flinch, .28 * flinch),
                    "Head": (.13 * flinch, .04 * flinch, -.23 * flinch),
                    "Jaw": (.32 * flinch, 0, 0), "Tail2": (0, 0, .23 * flinch)})
    if name == "Death":
        stumble = profile([(0, 0), (.19, 1), (.46, 0), (1, 0)], t)
        fall = profile([(0, 0), (.24, 0), (.78, 1), (1, 1)], t)
        body = (.16 * fall, .09 * stumble, .022 * stumble - .476 * fall)
        rot.update({"Root": (.11 * fall, .49 * fall, -.155 * fall),
                    "Chest": (.18 * fall - .09 * stumble, -.09 * fall, .056 * fall),
                    "Neck": (.34 * fall - .24 * stumble, -.35 * fall, .25 * fall),
                    "Head": (.03 * fall, -.28 * fall, .08 * fall),
                    "Jaw": (.16 * fall + .48 * stumble, 0, 0),
                    "Tail1": (-.1 * fall, -.26 * fall, .32 * fall),
                    "Tail2": (-.1 * fall, 0, .20 * fall),
                    "Tail3": (.25 * fall, 0, .19 * fall),
                    "Tail4": (.15 * fall, 0, -.30 * fall)})
        for label in ("Fore", "Hind"):
            for sign, side in ((-1, "L"), (1, "R")):
                offsets[(label, side)] = (sign * .17 * fall, (.29 if label == "Fore" else -.16) * fall, .02 * fall)
    return rot, body, offsets


def animate(rig):
    scene = bpy.context.scene
    scene.render.fps = FPS
    bones = rig.pose.bones
    rig.animation_data_create()
    for name, frames in CLIPS.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        step = 4 if name == "Idle" else 2
        for frame in [*range(0, frames, step), frames]:
            rotations, position, planted = pose(name, frame / frames)
            for bone in bones:
                angles = rotations.get(bone.name, (0, 0, 0))
                bone.rotation_quaternion = anatomical_rotation(bone, angles)
            root = bones["Root"]
            root.location = root.bone.matrix_local.to_quaternion().inverted() @ Vector(position)
            bpy.context.view_layer.update()
            for label in ("Fore", "Hind"):
                for side in ("L", "R"):
                    place_leg(bones, label, side, planted.get((label, side), (0, 0, 0)))
            root.keyframe_insert(data_path="location", frame=frame)
            for bone in bones:
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for fcurve in channelbag.fcurves:
                        for keyframe in fcurve.keyframe_points:
                            keyframe.interpolation = "LINEAR"
        rig.animation_data.action = None
    scene.frame_set(0)
    for bone in bones:
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()


def export(path, rig, model):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (rig, model):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_animations=True, export_animation_mode="ACTIONS",
                              export_frame_range=False, export_force_sampling=False,
                              export_anim_slide_to_zero=True, export_yup=True)


def round_trip(path):
    """Check the actual skinned GLB and replay each imported clip to validate motion."""
    raw = path.read_bytes()
    document = json.loads(raw[20:20 + struct.unpack_from("<I", raw, 12)[0]])
    assert {animation["name"] for animation in document["animations"]} == set(CLIPS)
    assert len(document["skins"]) == 1
    assert all("bufferView" in image for image in document["images"])
    assert all("WEIGHTS_0" in primitive["attributes"] for mesh in document["meshes"] for primitive in mesh["primitives"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=str(path))
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    model = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    assert len(rig.data.bones) == 23
    assert set(model.vertex_groups.keys()).issubset(rig.data.bones.keys())
    assert all(abs(sum(member.weight for member in vertex.groups) - 1) < .002
               for vertex in model.data.vertices)
    animation = rig.animation_data
    for track in animation.nla_tracks:
        track.mute = True
    bounds = [tuple(round(float(value), 3) for value in point) for point in model.bound_box]
    measurements = {}
    endpoints = {}
    for name, frames in CLIPS.items():
        action = bpy.data.actions.get(name)
        assert action is not None, name
        animation.action = action
        first, last = action.frame_range
        assert abs(last - first - frames) < .01, (name, first, last, frames)
        samples = []
        poses = []
        for index in range(21):
            frame = first + (last - first) * index / 20
            bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
            samples.append({bone: (rig.matrix_world @ rig.pose.bones[bone].head).xyz.copy()
                            for bone in ("Root", "Head", "Jaw", "ForeFoot.L", "Tail4")})
            if index in (0, 20):
                poses.append({bone.name: bone.matrix.copy() for bone in rig.pose.bones})
        endpoints[name] = poses
        reach = {bone: round(max((sample[bone] - samples[0][bone]).length for sample in samples), 3)
                 for bone in samples[0]}
        measurements[name] = {"seconds": round(frames / FPS, 3), "maxJointTravelMetres": reach}
    assert measurements["Idle"]["maxJointTravelMetres"]["Head"] > .02
    assert measurements["Walk"]["maxJointTravelMetres"]["ForeFoot.L"] > .37
    assert measurements["BiteWindup"]["maxJointTravelMetres"]["Head"] > .15
    assert measurements["Bite"]["maxJointTravelMetres"]["Head"] > .35
    assert measurements["SweepWindup"]["maxJointTravelMetres"]["Tail4"] > .9
    assert measurements["Sweep"]["maxJointTravelMetres"]["Tail4"] > 1.7
    assert measurements["Hit"]["maxJointTravelMetres"]["Head"] > .15
    assert measurements["Death"]["maxJointTravelMetres"]["Root"] > .45
    for windup, attack in (("BiteWindup", "Bite"), ("SweepWindup", "Sweep")):
        previous, next_pose = endpoints[windup][1], endpoints[attack][0]
        mismatch = max(abs(before[row][col] - next_pose[bone][row][col])
                       for bone, before in previous.items() for row in range(4) for col in range(4))
        assert mismatch < .002, (windup, attack, mismatch)
    return {
        "asset": "Mere Wyrm", "source": "tools/hollow-kingdom/chapter-one/drake.py",
        "metresPerUnit": 1, "forward": "+Z", "skinBones": len(rig.data.bones),
        "materials": len(document["materials"]), "embeddedImages": len(document["images"]),
        "triangles": sum(document["accessors"][primitive["indices"]]["count"] // 3
                         for mesh in document["meshes"] for primitive in mesh["primitives"]),
        "blenderRoundTrip": bpy.app.version_string,
        "restSizeMetres": {name: round(max(point[axis] for point in bounds) - min(point[axis] for point in bounds), 3)
                           for name, axis in (("width", 0), ("height", 2), ("length", 1))},
        "clips": measurements,
    }


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rig = skeleton()
    model = anatomy(rig, make_materials())
    animate(rig)
    glb = OUTPUT / "drake.glb"
    export(glb, rig, model)
    measurements = round_trip(glb)
    (OUTPUT / "drake.metadata.json").write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(measurements))
