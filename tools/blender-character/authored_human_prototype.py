"""Isolated authored-human geometry experiment; the procedural creator is untouched."""

import argparse
import json
import math
import os
import time

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


def smoothstep(a, b, value):
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def bell(a, b, c, d, value):
    return smoothstep(a, b, value) * (1.0 - smoothstep(c, d, value))


def morph_delta(name, co, normal):
    x, y, z = co
    ax = abs(x)
    outward = Vector((x, y - 0.015, 0.0))
    if outward.length > 0.0001:
        outward.normalize()
    else:
        outward = Vector((0.0, -1.0, 0.0))
    if name == "mass":
        torso = bell(0.77, 0.93, 1.35, 1.48, z) * (1.0 - smoothstep(0.23, 0.38, ax))
        abdomen = bell(0.92, 1.06, 1.24, 1.38, z)
        thigh = bell(0.26, 0.4, 0.86, 1.0, z) * bell(0.07, 0.12, 0.3, 0.43, ax)
        upper_arm = bell(1.03, 1.12, 1.40, 1.49, z) * bell(0.27, 0.32, 0.71, 0.81, ax)
        return outward * (0.025 * torso + 0.016 * abdomen * torso + 0.014 * thigh + 0.008 * upper_arm)
    if name == "muscle":
        chest = bell(1.18, 1.25, 1.39, 1.47, z) * (1.0 - smoothstep(0.22, 0.33, ax))
        deltoid = bell(1.32, 1.38, 1.49, 1.53, z) * bell(0.20, 0.25, 0.43, 0.53, ax)
        biceps = bell(1.12, 1.19, 1.36, 1.42, z) * bell(0.31, 0.37, 0.65, 0.75, ax)
        quads = bell(0.46, 0.55, 0.79, 0.88, z) * bell(0.09, 0.14, 0.29, 0.4, ax)
        return normal * (0.018 * chest + 0.019 * deltoid + 0.012 * biceps + 0.014 * quads)
    if name == "shoulders":
        upper = bell(1.22, 1.36, 1.52, 1.58, z)
        outer = smoothstep(0.11, 0.34, ax)
        return Vector((math.copysign(0.035 * upper * outer, x), 0.0, 0.0))
    head = smoothstep(1.51, 1.61, z)
    if name == "headWidth":
        return Vector((x * 0.085 * head, 0.0, 0.0))
    if name == "jaw":
        jaw = bell(1.54, 1.59, 1.70, 1.75, z) * head
        return Vector((math.copysign(0.010 * jaw * smoothstep(0.025, 0.08, ax), x), -0.006 * jaw, -0.008 * jaw))
    if name == "nose":
        nose = bell(1.66, 1.69, 1.74, 1.77, z) * (1.0 - smoothstep(0.02, 0.065, ax))
        return Vector((0.0, -0.014 * nose, 0.003 * nose))
    raise ValueError(name)


MORPH_NAMES = ("mass", "muscle", "shoulders", "headWidth", "jaw", "nose")


def build_body_morphs(body, values):
    coordinates = [vertex.co.copy() for vertex in body.data.vertices]
    normals = [vertex.normal.copy() for vertex in body.data.vertices]
    body.shape_key_add(name="Basis")
    for name in MORPH_NAMES:
        key = body.shape_key_add(name=name)
        for index, coordinate in enumerate(coordinates):
            key.data[index].co = coordinate + morph_delta(name, coordinate, normals[index])
        key.value = values[name]
    return coordinates, normals


def build_vest(body, coordinates, normals, values, armature, color):
    # A fixed fitted cage samples the canonical body once. Body morph deltas and
    # weights transfer from that surface; no per-identity shrinkwrap is involved.
    bvh = BVHTree.FromPolygons(coordinates, [tuple(poly.vertices) for poly in body.data.polygons])
    nearest_vertices = KDTree(len(coordinates))
    for index, coordinate in enumerate(coordinates):
        nearest_vertices.insert(coordinate, index)
    nearest_vertices.balance()
    surface = []
    surface_normals = []
    surface_faces = []
    ring_count, around = 11, 32
    for ring in range(ring_count):
        z = 0.925 + (1.37 - 0.925) * ring / (ring_count - 1)
        for column in range(around):
            angle = 2.0 * math.pi * column / around
            direction = Vector((math.cos(angle), math.sin(angle), 0.0))
            location, _, _, _ = bvh.ray_cast(Vector((0.0, 0.0, z)), direction, 1.0)
            if location is None:
                raise ValueError(f"Canonical torso ray missed at ring {ring}, column {column}")
            surface.append(location)
            surface_normals.append(direction)
    for ring in range(ring_count - 1):
        for column in range(around):
            next_column = (column + 1) % around
            surface_faces.append((ring * around + column, ring * around + next_column, (ring + 1) * around + next_column, (ring + 1) * around + column))
    # Narrow shoulder bridges make this a vest rather than a strapless tube.
    for side in (-1.0, 1.0):
        start = len(surface)
        for station in range(9):
            t = station / 8.0
            y = -0.18 + 0.36 * t
            z = 1.37 + 0.10 * math.sin(math.pi * t)
            for edge in (-1.0, 1.0):
                target = Vector((side * (0.17 + edge * 0.026), y, z))
                location, normal, _, _ = bvh.find_nearest(target)
                if location is None:
                    raise ValueError("Shoulder bridge missed the canonical body")
                surface.append(location)
                surface_normals.append(normal.normalized())
        for station in range(8):
            index = start + station * 2
            surface_faces.append((index, index + 1, index + 3, index + 2))
    count = len(surface)
    vertices = []
    for offset in (0.018, 0.012):
        vertices.extend(point + normal * offset for point, normal in zip(surface, surface_normals))
    faces = []
    edge_counts = {}
    for face in surface_faces:
        faces.append(face)
        faces.append(tuple(count + index for index in reversed(face)))
        for first, second in zip(face, face[1:] + face[:1]):
            edge = tuple(sorted((first, second)))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1
    for (first, second), uses in edge_counts.items():
        if uses == 1:
            faces.append((first, second, count + second, count + first))
    mesh = bpy.data.meshes.new("AuthoredVestMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    vest = bpy.data.objects.new("AuthoredVest", mesh)
    bpy.context.collection.objects.link(vest)
    vest.parent = armature
    for source_group in body.vertex_groups:
        vest.vertex_groups.new(name=source_group.name)
    for local, coordinate in enumerate(surface):
        source_index = nearest_vertices.find(coordinate)[1]
        for membership in body.data.vertices[source_index].groups:
            group_name = body.vertex_groups[membership.group].name
            vest.vertex_groups[group_name].add((local, local + count), membership.weight, "REPLACE")
    modifier = vest.modifiers.new("GoldenRig", "ARMATURE")
    modifier.object = armature
    material = bpy.data.materials.new("Prototype_Vest_Cloth")
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.82
    mesh.materials.append(material)
    vest.shape_key_add(name="Basis")
    for name in MORPH_NAMES[:3]:
        key = vest.shape_key_add(name=name)
        for local, coordinate in enumerate(surface):
            delta = morph_delta(name, coordinate, surface_normals[local])
            key.data[local].co = vertices[local] + delta
            key.data[local + count].co = vertices[local + count] + delta
        key.value = values[name]
    return vest, len(surface_faces), count


def tint_source_material(obj):
    for index, source in enumerate(obj.data.materials):
        material = source.copy()
        obj.data.materials[index] = material
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        base = principled.inputs["Base Color"]
        existing = next(iter(base.links), None)
        if existing:
            links.remove(existing)
        base.default_value = (0.18, 0.075, 0.035, 1.0)


def import_hair(path, armature, head_width_value):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = set(bpy.data.objects) - before
    hair = next(obj for obj in imported if obj.type == "MESH")
    source_armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    for modifier in list(hair.modifiers):
        hair.modifiers.remove(modifier)
    hair.parent = armature
    hair.matrix_parent_inverse.identity()
    for group in list(hair.vertex_groups):
        hair.vertex_groups.remove(group)
    hair.vertex_groups.new(name="Head").add(tuple(range(len(hair.data.vertices))), 1.0, "REPLACE")
    modifier = hair.modifiers.new("GoldenRig", "ARMATURE")
    modifier.object = armature
    hair.name = "AuthoredBuzzedHair"
    hair.shape_key_add(name="Basis")
    key = hair.shape_key_add(name="headWidth")
    for vertex in hair.data.vertices:
        key.data[vertex.index].co = vertex.co + Vector((vertex.co.x * 0.085, 0.0, 0.0))
    key.value = head_width_value
    for source_armature in source_armatures:
        bpy.data.objects.remove(source_armature, do_unlink=True)
    return hair


def bake_keys(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--hair", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:])
    started = time.perf_counter()
    with open(args.recipe, encoding="utf8") as stream:
        recipe = json.load(stream)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.source)
    # The checked-in vendor glTF has two normal-map URI aliases used by the
    # runtime loader. Resolve them locally without editing vendor files.
    source_directory = os.path.dirname(args.source)
    for image in bpy.data.images:
        corrected = {
            "T_Hair_1_Normal_png": "T_Hair_1_Normal.png",
            "T_Eye_Normal_png": "T_Eye_Normal.png",
        }.get(image.name)
        if corrected:
            image.filepath = os.path.join(source_directory, corrected)
            image.reload()
    armature = bpy.data.objects["Armature"]
    body = bpy.data.objects["SuperHero_Male"]
    body.name = "AuthoredHumanBody"
    values = {**recipe["bodyMorphs"], **recipe["faceMorphs"]}
    coordinates, normals = build_body_morphs(body, values)
    color = tuple(int(recipe["appearance"]["vestColor"][i:i+2], 16) / 255 for i in (1, 3, 5))
    vest, vest_faces, vest_vertices = build_vest(body, coordinates, normals, values, armature, color)
    hair = import_hair(args.hair, armature, values["headWidth"])
    tint_source_material(hair)
    tint_source_material(bpy.data.objects["Eyebrows"])
    for obj in (body, vest, hair):
        bake_keys(obj)
    height_scale = recipe["height"] / 1.82
    armature.scale = (height_scale,) * 3
    for obj in list(bpy.data.objects):
        if obj.type not in ("ARMATURE", "MESH") or obj.name not in ("Armature", "AuthoredHumanBody", "AuthoredVest", "AuthoredBuzzedHair", "Eyebrows", "Eyes"):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (armature, body, vest, hair, bpy.data.objects["Eyebrows"], bpy.data.objects["Eyes"]):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=args.output, export_format="GLB", use_selection=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
    report = {
        "durationMs": round((time.perf_counter() - started) * 1000),
        "sourceBodyVertices": len(coordinates),
        "sourceBodyPolygons": len(body.data.polygons),
        "vestSourceFaces": vest_faces,
        "vestSourceVertices": vest_vertices,
        "exportObjects": [obj.name for obj in bpy.context.selected_objects],
        "jointCount": len(armature.data.bones),
        "bodyVertexGroups": len(body.vertex_groups),
        "morphsBaked": list(MORPH_NAMES),
    }
    with open(args.report, "w", encoding="utf8") as stream:
        json.dump(report, stream, indent=2)
    print("AUTHORED_HUMAN_REPORT", json.dumps(report))


if __name__ == "__main__":
    main()
