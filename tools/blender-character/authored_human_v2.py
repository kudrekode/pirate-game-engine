"""Bounded second-pass art experiment. Never imported by the product compiler.

Run with Blender in background mode; source assets are always read-only inputs.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v2_shapes import SculptField, TARGETS

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf"
HAIR = ROOT / "public/assets/source/quaternius/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Buzzed.gltf"
OUT = ROOT / "test-results/authored-human-v2"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def import_base():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    # The runtime has the same two aliases; resolve them without touching vendor bytes.
    for image in bpy.data.images:
        if "_png.png" in image.filepath:
            image.filepath = image.filepath.replace("_png.png", ".png")
            image.reload()
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name not in ("SuperHero_Male", "Eyes", "Eyebrows"):
            bpy.data.objects.remove(obj, do_unlink=True)
    return bpy.data.objects["SuperHero_Male"], bpy.data.objects["Armature"]


class SurfaceBinding:
    """One canonical triangle correspondence; no per-identity shrinkwrapping."""
    def __init__(self, body):
        self.vertices = [v.co.copy() for v in body.data.vertices]
        self.faces = [tuple(p.vertices) for p in body.data.polygons]
        assert all(len(p) == 3 for p in self.faces)
        self.bvh = BVHTree.FromPolygons(self.vertices, self.faces, all_triangles=True)

    def bind(self, points):
        bindings = []
        for point in points:
            location, normal, face, distance = self.bvh.find_nearest(Vector(point))
            ids = self.faces[face]
            a, b, c = (self.vertices[i] for i in ids)
            bary = barycentric_transform(location, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
            bindings.append((ids, tuple(bary)))
        return bindings

    @staticmethod
    def transfer(bindings, delta):
        return np.array([sum((delta[i] * w for i, w in zip(ids, bary)), np.zeros(3)) for ids, bary in bindings])


def set_hair_material(obj):
    for index, original in enumerate(obj.data.materials):
        mat = original.copy()
        obj.data.materials[index] = mat
        bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        base = bsdf.inputs["Base Color"]
        for link in list(base.links):
            mat.node_tree.links.remove(link)
        base.default_value = (.047, .021, .009, 1)
        bsdf.inputs["Roughness"].default_value = .72


def import_hair(rig):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(HAIR))
    imported = set(bpy.data.objects) - before
    hair = next(o for o in imported if o.type == "MESH" and len(o.data.vertices) > 100)
    world = hair.matrix_world.copy()
    for modifier in list(hair.modifiers):
        hair.modifiers.remove(modifier)
    hair.parent = rig
    hair.matrix_world = world
    for group in list(hair.vertex_groups):
        hair.vertex_groups.remove(group)
    hair.vertex_groups.new(name="Head").add(list(range(len(hair.data.vertices))), 1, "REPLACE")
    hair.modifiers.new("GoldenRig", "ARMATURE").object = rig
    hair.name = "V2_Buzzed"
    for obj in imported:
        if obj != hair:
            bpy.data.objects.remove(obj, do_unlink=True)
    set_hair_material(hair)
    return hair


def build_tank(body, rig, surface):
    """Connected sewn pattern: shaped top edge, two shoulder panels, eased hem.

    Pattern points are authored here, projected once against the canonical body,
    then smoothed as cloth. Morph fitting uses stored triangle correspondence.
    """
    around, rows, shoulder_steps = 72, 14, 8
    keys = [
        (0, (0, -.100, 1.355)),
        (20, (.047, -.088, 1.389)),
        (35, (.084, -.040, 1.490)),
        (55, (.204, -.022, 1.490)),
        (70, (.209, .005, 1.372)),
        (90, (.214, .065, 1.282)),
        (110, (.208, .121, 1.37)),
        (125, (.204, .132, 1.49)),
        (145, (.084, .098, 1.505)),
        (160, (.044, .095, 1.466)),
        (180, (0, .104, 1.458)),
    ]

    def top_point(degrees):
        sign = 1 if degrees <= 180 else -1
        angle = degrees if degrees <= 180 else 360 - degrees
        for (a, pa), (b, pb) in zip(keys, keys[1:]):
            if a <= angle <= b:
                p = Vector(pa).lerp(Vector(pb), (angle - a) / (b - a))
                p.x *= sign
                return p
        raise ValueError(degrees)

    points, faces, uv = [], [], []
    for row in range(rows + 1):
        t = row / rows
        for column in range(around):
            theta = column * 2 * math.pi / around
            direction = Vector((math.sin(theta), -math.cos(theta), 0))
            z = .972 + min(t / .5, 1) * .24
            loc, normal, _, _ = surface.bvh.ray_cast(Vector((0, .035, z)), direction, .5)
            assert loc is not None, (row, column)
            if t > .5:
                loc = loc.lerp(top_point(column * 360 / around), (t - .5) * 2)
                loc, normal, _, _ = surface.bvh.find_nearest(loc)
            # More ease below the ribs stops the garment tracing each abdominal ridge.
            ease = .010 + .007 * (1 - t)
            points.append(loc + normal * ease)
            uv.append((column / around, t * .75))
    for row in range(rows):
        for column in range(around):
            a = row * around + column
            b = row * around + (column + 1) % around
            faces.append((a, b, b + around, a + around))

    # Front and back shoulder edges are the SAME vertices as the torso pattern.
    # This produces one sewn surface with neck, two arms and hem boundaries.
    for side in (1, -1):
        front = [int(angle / 5) % around for angle in range(35, 56, 5)]
        back = [int(angle / 5) % around for angle in range(145, 124, -5)]
        if side < 0:
            front = [(-i) % around for i in front]
            back = [(-i) % around for i in back]
        strips = [[rows * around + i for i in front]]
        for station in range(1, shoulder_steps):
            t = station / shoulder_steps
            strip = []
            for col, (a, b) in enumerate(zip(front, back)):
                p = points[rows * around + a].lerp(points[rows * around + b], t)
                p.z += .022 * math.sin(math.pi * t)
                loc, normal, _, _ = surface.bvh.find_nearest(p)
                strip.append(len(points))
                points.append(loc + normal * .013)
                uv.append((col / 20 + (0 if side > 0 else .5), .8 + t * .18))
            strips.append(strip)
        strips.append([rows * around + i for i in back])
        for a, b in zip(strips, strips[1:]):
            for i in range(len(a) - 1):
                face = (a[i], b[i], b[i + 1], a[i + 1])
                faces.append(face if side > 0 else tuple(reversed(face)))

    mesh = bpy.data.meshes.new("V2_Tank_Pattern")
    mesh.from_pydata(points, [], faces)
    mesh.update()
    tank = bpy.data.objects.new("V2_Tank", mesh)
    bpy.context.collection.objects.link(tank)
    bpy.ops.object.select_all(action="DESELECT")
    tank.select_set(True)
    bpy.context.view_layer.objects.active = tank
    # Smooth the cloth away from small skin contours, then subdivide the sewn pattern.
    smooth = tank.modifiers.new("ClothEase", "SMOOTH")
    smooth.factor = .35
    smooth.iterations = 3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    layer = mesh.uv_layers.new(name="TankPatternUV")
    for poly in mesh.polygons:
        for loop in poly.loop_indices:
            layer.data[loop].uv = uv[mesh.loops[loop].vertex_index]
    subdiv = tank.modifiers.new("PatternSurface", "SUBSURF")
    subdiv.levels = 1
    bpy.ops.object.modifier_apply(modifier=subdiv.name)
    # The first render exposed pectoral poke-through after cloth smoothing.
    # Correct only insufficient canonical ease, including face centres; retain
    # the designed neckline/armholes and all points already outside the margin.
    for _ in range(4):
        corrections = [Vector((0, 0, 0)) for _ in tank.data.vertices]
        samples = [(v.co, [v.index]) for v in tank.data.vertices]
        samples += [(sum((tank.data.vertices[i].co for i in p.vertices), Vector()) / len(p.vertices), list(p.vertices)) for p in tank.data.polygons]
        for point, ids in samples:
            location, normal, _, _ = surface.bvh.find_nearest(point)
            gap = (point - location).dot(normal)
            if gap < .008:
                correction = normal * (.008 - gap)
                for i in ids:
                    if correction.length > corrections[i].length:
                        corrections[i] = correction
        for vertex, correction in zip(tank.data.vertices, corrections):
            vertex.co += correction
        tank.data.update()
    # Normals are recalculated on the connected surface before adding real thickness.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    solid = tank.modifiers.new("ClothThickness", "SOLIDIFY")
    solid.thickness = .0025
    solid.offset = 0
    bpy.ops.object.modifier_apply(modifier=solid.name)
    for p in tank.data.polygons:
        p.use_smooth = True
    triangulate = tank.modifiers.new("CanonicalTriangles", "TRIANGULATE")
    triangulate.quad_method = "FIXED"
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bindings = surface.bind([v.co for v in tank.data.vertices])
    for group in body.vertex_groups:
        tank.vertex_groups.new(name=group.name)
    for index, (ids, bary) in enumerate(bindings):
        weights = {}
        for vertex, influence in zip(ids, bary):
            for membership in body.data.vertices[vertex].groups:
                weights[membership.group] = weights.get(membership.group, 0) + membership.weight * influence
        best = sorted(weights.items(), key=lambda item: -item[1])[:4]
        total = sum(max(0, w) for _, w in best)
        assert total > 0
        for group, weight in best:
            if weight > 0:
                tank.vertex_groups[group].add([index], weight / total, "REPLACE")
    tank.parent = rig
    tank.modifiers.new("GoldenRig", "ARMATURE").object = rig
    mat = bpy.data.materials.new("V2_Tank_Cotton")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (.022, .071, .10, 1)
    bsdf.inputs["Roughness"].default_value = .86
    tank.data.materials.append(mat)
    return tank, bindings


def add_targets(obj, deltas):
    obj.shape_key_add(name="Basis").value = 0
    base = np.array([v.co[:] for v in obj.data.vertices])
    for name, delta in deltas.items():
        key = obj.shape_key_add(name=name)
        key.value = 0
        key.slider_min = -1 if name == "headWidth" else 0
        key.data.foreach_set("co", (base + delta).ravel())


CASES = {
    "dressed-neutral": {},
    "head-wide": {"headWidth": 1},
    "head-narrow": {"headWidth": -1},
    "jaw": {"jaw": 1}, "nose": {"nose": 1},
    "fuller": {"mass": 1}, "athletic": {"athletic": 1},
    "broad": {"broadFrame": 1},
    "combined": {name: 1 for name in TARGETS},
}


def build_experiment(body, rig):
    surface = SurfaceBinding(body)
    # Joint centres are fixed sculpt constraints, not repositioned bones.
    pins = [list(b.head_local) for b in rig.data.bones if b.name in (
        "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r",
        "thigh_l", "thigh_r", "calf_l", "calf_r", "neck_01", "Head")]
    fields = {name: SculptField(name, pins) for name in TARGETS}
    coords = np.array([v.co[:] for v in body.data.vertices])
    deltas = {name: field.evaluate(coords) for name, field in fields.items()}
    hair = import_hair(rig)
    brow, eyes = bpy.data.objects["Eyebrows"], bpy.data.objects["Eyes"]
    set_hair_material(brow)
    tank, tank_bindings = build_tank(body, rig, surface)
    add_targets(body, deltas)
    for obj in (brow, hair):
        bindings = surface.bind([v.co for v in obj.data.vertices])
        add_targets(obj, {name: surface.transfer(bindings, delta) for name, delta in deltas.items()})
    eye_coords = np.array([v.co[:] for v in eyes.data.vertices])
    eye_deltas = {}
    for name, field in fields.items():
        delta = np.zeros_like(eye_coords)
        for side in (-1, 1):
            mask = eye_coords[:, 0] * side > 0
            centre = eye_coords[mask].mean(axis=0)
            delta[mask] = field.evaluate([centre])[0]
        eye_deltas[name] = delta
    add_targets(eyes, eye_deltas)
    add_targets(tank, {name: surface.transfer(tank_bindings, delta) for name, delta in deltas.items()})
    objects = (body, brow, eyes, hair, tank)
    stats = {name: {"maxDisplacementMm": float(np.max(np.linalg.norm(delta, axis=1)) * 1000),
                    "movedVertices": int(np.count_nonzero(np.linalg.norm(delta, axis=1) > .00001))}
             for name, delta in deltas.items()}
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "authored-human-v2.blend"))
    for case, values in CASES.items():
        for obj in objects:
            for key in obj.data.shape_keys.key_blocks:
                key.value = values.get(key.name, 0)
        export(OUT / (case + ".glb"))
    (OUT / "targets.json").write_text(json.dumps({"cases": CASES, "targets": stats}, indent=2))


def provenance():
    paths = set()
    for source in (SOURCE, HAIR):
        paths.add(source)
        gltf = json.loads(source.read_text())
        for resource in gltf.get("buffers", []) + gltf.get("images", []):
            uri = resource["uri"].replace("_png.png", ".png")
            paths.add(source.parent / uri)
    paths.add(ROOT / "public/assets/source/quaternius/License_Standard.txt")
    return {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(paths)}


def export(path):
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for obj in list(bpy.context.scene.objects):
        if obj.type in ("MESH", "ARMATURE"):
            if obj.type == "MESH" and not obj.data.attributes.get("_SOURCE_VERTEX"):
                attribute = obj.data.attributes.new("_SOURCE_VERTEX", "FLOAT", "POINT")
                attribute.data.foreach_set("value", list(range(len(obj.data.vertices))))
            if obj.type == "MESH" and obj.data.shape_keys:
                baked = obj.copy()
                baked.data = obj.data.copy()
                bpy.context.collection.objects.link(baked)
                bpy.context.view_layer.objects.active = baked
                baked.select_set(True)
                bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
                copies.append(baked)
            else:
                obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                              use_selection=True, export_animations=False,
                              export_attributes=True,
                              export_morph=False, export_cameras=False, export_lights=False)
    for obj in copies:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--build", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    OUT.mkdir(parents=True, exist_ok=True)
    before = provenance()
    body, rig = import_base()
    info = {}
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            coords = [list(v.co) for v in obj.data.vertices]
            info[obj.name] = {"vertices": len(coords), "polygons": len(obj.data.polygons),
                              "bounds": [[min(v[i] for v in coords), max(v[i] for v in coords)] for i in range(3)],
                              "matrix": [list(row) for row in obj.matrix_world],
                              "materials": [m.name for m in obj.data.materials]}
    info["bones"] = {b.name: {"head": list(b.head_local), "tail": list(b.tail_local)} for b in rig.data.bones}
    (OUT / "source-inspection.json").write_text(json.dumps(info, indent=2))
    export(OUT / "neutral.glb")
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "canonical-neutral.blend"))
    if args.build:
        build_experiment(body, rig)
    assert provenance() == before, "Vendor input changed"
    (OUT / "provenance.json").write_text(json.dumps(before, indent=2))
    print("V2_NEUTRAL", json.dumps({k: v for k, v in info.items() if k != "bones"}))


if __name__ == "__main__":
    main()
