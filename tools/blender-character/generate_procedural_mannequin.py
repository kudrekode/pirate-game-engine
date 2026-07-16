"""Deterministic Procedural Mannequin Body Proportions V1 generator.

The immutable Quaternius source supplies only the validated 65-joint Golden
rest skeleton. Every source mesh, material, texture, and image is removed
before the engineering mannequin geometry and explicit weights are created.
"""

import argparse
import hashlib
import json
import math
import shutil
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


EXPECTED_JOINT_COUNT = 65
PRINCIPAL_BONES = (
    "root",
    "pelvis",
    "spine_01",
    "spine_02",
    "spine_03",
    "neck_01",
    "Head",
    "clavicle_l",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "clavicle_r",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
    "thigh_l",
    "calf_l",
    "foot_l",
    "ball_l",
    "thigh_r",
    "calf_r",
    "foot_r",
    "ball_r",
)


def parse_arguments():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--template", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--compiler-version", required=True)
    return parser.parse_args(sys.argv[separator + 1 :])


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rounded(values, digits=9):
    return [round(float(value), digits) for value in values]


def srgb_channel_to_linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def canonical_srgb_hex_to_linear(color):
    channels = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    return tuple(srgb_channel_to_linear(channel) for channel in channels)


def create_template_import_mirror(path):
    temporary = tempfile.TemporaryDirectory(prefix="mannequin-template-import-")
    mirror_root = Path(temporary.name)
    for source in path.parent.iterdir():
        if source.is_file():
            shutil.copy2(source, mirror_root / source.name)
    mirror_path = mirror_root / path.name
    document = json.loads(mirror_path.read_text(encoding="utf8"))
    aliases = {
        "T_Eye_Normal_png.png": "T_Eye_Normal.png",
        "T_Hair_1_Normal_png.png": "T_Hair_1_Normal.png",
    }
    for image in document.get("images", []):
        uri = image.get("uri")
        if uri in aliases:
            image["uri"] = aliases[uri]
    mirror_path.write_text(json.dumps(document), encoding="utf8")
    return temporary, mirror_path


def import_template(path):
    before = set(bpy.data.objects)
    result = bpy.ops.import_scene.gltf(filepath=str(path), import_shading="NORMALS")
    if "FINISHED" not in result:
        raise RuntimeError(f"Golden skeleton template import failed: {result}")
    imported = set(bpy.data.objects) - before
    armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    exact = [obj for obj in armatures if len(obj.data.bones) == EXPECTED_JOINT_COUNT]
    if len(exact) != 1:
        raise RuntimeError(
            f"Expected one {EXPECTED_JOINT_COUNT}-joint template armature; "
            f"found {[(obj.name, len(obj.data.bones)) for obj in armatures]}"
        )
    armature = exact[0]
    missing = [name for name in PRINCIPAL_BONES if name not in armature.data.bones]
    if missing:
        raise RuntimeError(f"Golden skeleton template is missing {missing}")
    return imported, armature


def remove_vendor_presentation(imported, armature):
    removed_mesh_names = sorted(
        obj.name for obj in imported if obj.type == "MESH" and obj != armature
    )
    for obj in imported:
        if obj != armature and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (
        bpy.data.materials,
        bpy.data.images,
        bpy.data.textures,
        bpy.data.actions,
    ):
        for block in list(collection):
            collection.remove(block)
    return removed_mesh_names


def bone_head(armature, name):
    return armature.data.bones[name].head_local.copy()


def bone_tail(armature, name):
    return armature.data.bones[name].tail_local.copy()


class MeshBuilder:
    def __init__(self, radial_segments):
        self.radial_segments = radial_segments
        self.vertices = []
        self.faces = []
        self.weights = []
        self.parts = []

    @staticmethod
    def _basis(axis):
        reference = Vector((1.0, 0.0, 0.0))
        if abs(axis.dot(reference)) > 0.9:
            reference = Vector((0.0, 1.0, 0.0))
        width = (reference - axis * axis.dot(reference)).normalized()
        depth = axis.cross(width).normalized()
        return width, depth

    def add_ellipsoid(self, name, bone, start, end, width_radius, depth_radius):
        axis_vector = end - start
        length = axis_vector.length
        if length <= 0.00001:
            raise RuntimeError(f"Part {name} has zero length.")
        axis = axis_vector.normalized()
        width, depth = self._basis(axis)
        center = (start + end) * 0.5
        half_length = length * 0.58
        rings = max(4, self.radial_segments // 2 + 1)
        vertex_start = len(self.vertices)
        top = center + axis * half_length
        self.vertices.append(tuple(top))
        self.weights.append(bone)
        ring_indices = []
        for ring in range(1, rings):
            theta = math.pi * ring / rings
            ring_vertices = []
            for segment in range(self.radial_segments):
                phi = math.tau * segment / self.radial_segments
                point = (
                    center
                    + axis * (math.cos(theta) * half_length)
                    + width * (math.sin(theta) * math.cos(phi) * width_radius)
                    + depth * (math.sin(theta) * math.sin(phi) * depth_radius)
                )
                ring_vertices.append(len(self.vertices))
                self.vertices.append(tuple(point))
                self.weights.append(bone)
            ring_indices.append(ring_vertices)
        bottom_index = len(self.vertices)
        self.vertices.append(tuple(center - axis * half_length))
        self.weights.append(bone)
        first_ring = ring_indices[0]
        for segment in range(self.radial_segments):
            next_segment = (segment + 1) % self.radial_segments
            self.faces.append((vertex_start, first_ring[next_segment], first_ring[segment]))
        for upper, lower in zip(ring_indices, ring_indices[1:]):
            for segment in range(self.radial_segments):
                next_segment = (segment + 1) % self.radial_segments
                self.faces.append(
                    (upper[segment], upper[next_segment], lower[next_segment], lower[segment])
                )
        last_ring = ring_indices[-1]
        for segment in range(self.radial_segments):
            next_segment = (segment + 1) % self.radial_segments
            self.faces.append((last_ring[segment], last_ring[next_segment], bottom_index))
        self.parts.append(
            {
                "bone": bone,
                "name": name,
                "profile": "ellipsoid",
                "vertexCount": len(self.vertices) - vertex_start,
            }
        )

    def add_box(self, name, bone, start, end, half_width, half_depth):
        axis_vector = end - start
        length = axis_vector.length
        if length <= 0.00001:
            raise RuntimeError(f"Part {name} has zero length.")
        axis = axis_vector.normalized()
        width, depth = self._basis(axis)
        extension = axis * (length * 0.08)
        start = start - extension
        end = end + extension
        vertex_start = len(self.vertices)
        for point in (start, end):
            for width_sign, depth_sign in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                vertex = point + width * (half_width * width_sign) + depth * (half_depth * depth_sign)
                self.vertices.append(tuple(vertex))
                self.weights.append(bone)
        self.faces.extend(
            (
                (vertex_start + 0, vertex_start + 3, vertex_start + 2, vertex_start + 1),
                (vertex_start + 4, vertex_start + 5, vertex_start + 6, vertex_start + 7),
                (vertex_start + 0, vertex_start + 1, vertex_start + 5, vertex_start + 4),
                (vertex_start + 1, vertex_start + 2, vertex_start + 6, vertex_start + 5),
                (vertex_start + 2, vertex_start + 3, vertex_start + 7, vertex_start + 6),
                (vertex_start + 3, vertex_start + 0, vertex_start + 4, vertex_start + 7),
            )
        )
        self.parts.append(
            {
                "bone": bone,
                "name": name,
                "profile": "box",
                "vertexCount": 8,
            }
        )

    def add_sphere(self, name, center, radius_x, radius_y, radius_z):
        rings = max(6, self.radial_segments)
        segments = max(8, self.radial_segments * 2)
        vertex_start = len(self.vertices)
        top = len(self.vertices)
        self.vertices.append((center.x, center.y, center.z + radius_z))
        self.weights.append(None)
        ring_indices = []
        for ring in range(1, rings):
            theta = math.pi * ring / rings
            indices = []
            for segment in range(segments):
                phi = math.tau * segment / segments
                indices.append(len(self.vertices))
                self.vertices.append(
                    (
                        center.x + math.sin(theta) * math.cos(phi) * radius_x,
                        center.y + math.sin(theta) * math.sin(phi) * radius_y,
                        center.z + math.cos(theta) * radius_z,
                    )
                )
                self.weights.append(None)
            ring_indices.append(indices)
        bottom = len(self.vertices)
        self.vertices.append((center.x, center.y, center.z - radius_z))
        self.weights.append(None)
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            self.faces.append((top, ring_indices[0][next_segment], ring_indices[0][segment]))
        for upper, lower in zip(ring_indices, ring_indices[1:]):
            for segment in range(segments):
                next_segment = (segment + 1) % segments
                self.faces.append(
                    (upper[segment], upper[next_segment], lower[next_segment], lower[segment])
                )
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            self.faces.append((ring_indices[-1][segment], ring_indices[-1][next_segment], bottom))
        self.parts.append(
            {
                "name": name,
                "profile": "transition-ellipsoid",
                "vertexCount": len(self.vertices) - vertex_start,
            }
        )


def point_segment_distance(point, start, end):
    axis = end - start
    length_squared = axis.length_squared
    if length_squared <= 0.00000001:
        return (point - start).length
    fraction = max(0.0, min(1.0, (point - start).dot(axis) / length_squared))
    return (point - (start + axis * fraction)).length


def mesh_topology_statistics(mesh):
    adjacency = [set() for _ in mesh.vertices]
    edge_use = {}
    degenerate_faces = 0
    for polygon in mesh.polygons:
        if polygon.area <= 0.0000000001:
            degenerate_faces += 1
        indices = list(polygon.vertices)
        for first, second in zip(indices, indices[1:] + indices[:1]):
            adjacency[first].add(second)
            adjacency[second].add(first)
            edge = tuple(sorted((first, second)))
            edge_use[edge] = edge_use.get(edge, 0) + 1
    remaining = set(range(len(mesh.vertices)))
    component_count = 0
    while remaining:
        component_count += 1
        pending = [remaining.pop()]
        while pending:
            current = pending.pop()
            for neighbor in adjacency[current]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    pending.append(neighbor)
    boundary_edges = sum(count == 1 for count in edge_use.values())
    non_manifold_edges = sum(count != 2 for count in edge_use.values())
    euler_characteristic = len(mesh.vertices) - len(edge_use) + len(mesh.polygons)
    genus = (2 * component_count - euler_characteristic) / 2
    return {
        "boundaryEdgeCount": boundary_edges,
        "connectedComponentCount": component_count,
        "degenerateFaceCount": degenerate_faces,
        "edgeCount": len(edge_use),
        "eulerCharacteristic": euler_characteristic,
        "faceCount": len(mesh.polygons),
        "genus": genus,
        "manifold": non_manifold_edges == 0,
        "nonManifoldEdgeCount": non_manifold_edges,
    }


def assign_analytic_weights(mesh_object, weight_segments):
    groups = {
        name: mesh_object.vertex_groups.new(name=name)
        for name in sorted({segment[0] for segment in weight_segments})
    }
    influence_counts = []
    weight_minimum = 1.0
    weight_maximum = 0.0
    weighted_bones = set()
    for vertex in mesh_object.data.vertices:
        point = vertex.co
        candidates = []
        for bone_name, start, end, radius in weight_segments:
            # A connected surface does not imply that mirrored limbs should ever
            # share weights. Keep the torso available as a transition zone, but
            # restrict limb candidates to the anatomical side of the vertex.
            if point.x > 0.01 and bone_name.endswith("_r"):
                continue
            if point.x < -0.01 and bone_name.endswith("_l"):
                continue
            if abs(point.x) <= 0.01 and (
                bone_name.endswith("_l") or bone_name.endswith("_r")
            ):
                continue
            normalized_distance = point_segment_distance(point, start, end) / radius
            score = 1.0 / (0.04 + normalized_distance ** 4)
            candidates.append((score, bone_name))
        candidates.sort(key=lambda entry: (-entry[0], entry[1]))
        selected = candidates[:4]
        total = sum(score for score, _ in selected)
        normalized = [(score / total, bone_name) for score, bone_name in selected]
        normalized = [entry for entry in normalized if entry[0] >= 0.015]
        total = sum(weight for weight, _ in normalized)
        normalized = [(weight / total, bone_name) for weight, bone_name in normalized]
        influence_counts.append(len(normalized))
        for weight, bone_name in normalized:
            groups[bone_name].add([vertex.index], weight, "REPLACE")
            weighted_bones.add(bone_name)
            weight_minimum = min(weight_minimum, weight)
            weight_maximum = max(weight_maximum, weight)
    return {
        "maximumInfluences": max(influence_counts),
        "normalizedWeightCount": len(mesh_object.data.vertices),
        "strategy": "analytic-sided-segments-v2",
        "unweightedVertexCount": sum(count == 0 for count in influence_counts),
        "weightMaximum": weight_maximum,
        "weightMinimum": weight_minimum,
        "weightedBones": sorted(weighted_bones),
    }


def create_geometry(armature, recipe):
    builder = MeshBuilder(recipe["geometry"]["radialSegments"])
    head = lambda name: bone_head(armature, name)
    tail = lambda name: bone_tail(armature, name)

    proportions = recipe["proportions"]
    anatomy = {
        "heightScale": proportions["height"] / 1.82,
        "shoulderWidthMultiplier": 0.82 + proportions["shoulderWidth"] * 0.36,
        "torsoLengthMultiplier": 0.88 + proportions["torsoLength"] * 0.24,
        "armLengthMultiplier": 0.86 + proportions["armLength"] * 0.28,
        "legLengthMultiplier": 0.88 + proportions["legLength"] * 0.24,
        "hipWidthMultiplier": 0.84 + proportions["hipWidth"] * 0.32,
    }
    anatomy["armToTorsoRatio"] = anatomy["armLengthMultiplier"] / anatomy["torsoLengthMultiplier"]
    anatomy["armToLegRatio"] = anatomy["armLengthMultiplier"] / anatomy["legLengthMultiplier"]
    anatomy["legToTorsoRatio"] = anatomy["legLengthMultiplier"] / anatomy["torsoLengthMultiplier"]
    anatomy["shoulderToHipRatio"] = anatomy["shoulderWidthMultiplier"] / anatomy["hipWidthMultiplier"]
    measurements = {
        "calfRadius": 0.068 * anatomy["hipWidthMultiplier"] * (0.94 + anatomy["legLengthMultiplier"] * 0.06),
        "chestDepth": 0.13,
        "chestHalfWidth": 0.245 * anatomy["shoulderWidthMultiplier"],
        "elbowRadius": 0.07,
        "footDepth": 0.06,
        "footHalfWidth": 0.062 * anatomy["hipWidthMultiplier"],
        "forearmRadius": 0.064,
        "handDepth": 0.035,
        "handHalfWidth": 0.064,
        "headDepth": 0.108,
        "headHalfWidth": 0.118,
        "hipJointRadius": 0.105 * anatomy["hipWidthMultiplier"],
        "kneeRadius": 0.068 * anatomy["hipWidthMultiplier"],
        "neckRadius": 0.064,
        "pelvisDepth": 0.13,
        "pelvisHalfWidth": 0.195 * anatomy["hipWidthMultiplier"],
        "shoulderJointRadius": 0.08,
        "thighRadius": 0.082 * anatomy["hipWidthMultiplier"],
        "topologyVersion": "procedural-humanoid-v1",
        "upperArmRadius": 0.076 * (0.96 + anatomy["shoulderWidthMultiplier"] * 0.04),
        "voxelSizeMetres": 0.035,
        "waistDepth": 0.112,
        "waistHalfWidth": 0.17 * ((anatomy["hipWidthMultiplier"] + anatomy["shoulderWidthMultiplier"]) * 0.5),
        "wristRadius": 0.052,
    }

    pelvis_origin = head("pelvis")

    def torso_point(point):
        result = point.copy()
        result.z = pelvis_origin.z + (point.z - pelvis_origin.z) * anatomy["torsoLengthMultiplier"]
        return result

    def width_point(point, width_multiplier):
        result = torso_point(point)
        result.x *= width_multiplier
        return result

    transformed_anchors = []

    def record(original, transformed):
        transformed_anchors.append((original.copy(), transformed.copy()))
        return transformed

    torso_heads = {
        name: record(head(name), torso_point(head(name)))
        for name in ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head")
    }
    transformed_head_tail = record(tail("Head"), torso_point(tail("Head")))

    builder.add_ellipsoid(
        "Pelvis", "pelvis", torso_heads["pelvis"], torso_heads["spine_01"],
        measurements["pelvisHalfWidth"], measurements["pelvisDepth"],
    )
    builder.add_ellipsoid("TorsoLower", "spine_01", torso_heads["spine_01"], torso_heads["spine_02"], measurements["waistHalfWidth"], measurements["waistDepth"])
    builder.add_ellipsoid("TorsoMiddle", "spine_02", torso_heads["spine_02"], torso_heads["spine_03"], measurements["waistHalfWidth"] * 1.12, 0.122)
    builder.add_ellipsoid("TorsoUpper", "spine_03", torso_heads["spine_03"], torso_heads["neck_01"], measurements["chestHalfWidth"], measurements["chestDepth"])
    builder.add_ellipsoid("Neck", "neck_01", torso_heads["neck_01"], torso_heads["Head"], measurements["neckRadius"], measurements["neckRadius"] * 0.9)
    builder.add_ellipsoid("Head", "Head", torso_heads["Head"], transformed_head_tail, measurements["headHalfWidth"], measurements["headDepth"])
    builder.add_sphere("TorsoPelvisTransition", torso_heads["spine_01"], measurements["waistHalfWidth"], measurements["waistDepth"], 0.11)
    builder.add_sphere("WaistTransition", torso_heads["spine_02"], measurements["waistHalfWidth"] * 1.06, measurements["waistDepth"], 0.11)
    builder.add_sphere("ChestTransition", torso_heads["spine_03"], measurements["waistHalfWidth"] * 1.16, 0.122, 0.12)
    builder.add_sphere("NeckBaseTransition", torso_heads["neck_01"], measurements["neckRadius"] * 1.2, measurements["neckRadius"], 0.075)
    builder.add_sphere("HeadNeckTransition", torso_heads["Head"], measurements["neckRadius"] * 1.1, measurements["neckRadius"], 0.075)

    weight_segments = [
        ("pelvis", torso_heads["pelvis"], torso_heads["spine_01"], measurements["pelvisHalfWidth"]),
        ("spine_01", torso_heads["spine_01"], torso_heads["spine_02"], measurements["waistHalfWidth"]),
        ("spine_02", torso_heads["spine_02"], torso_heads["spine_03"], measurements["waistHalfWidth"] * 1.12),
        ("spine_03", torso_heads["spine_03"], torso_heads["neck_01"], measurements["chestHalfWidth"]),
        ("neck_01", torso_heads["neck_01"], torso_heads["Head"], measurements["neckRadius"]),
        ("Head", torso_heads["Head"], transformed_head_tail, measurements["headHalfWidth"]),
    ]

    for suffix, label in (("l", "L"), ("r", "R")):
        clavicle_start = record(head(f"clavicle_{suffix}"), width_point(head(f"clavicle_{suffix}"), anatomy["shoulderWidthMultiplier"]))
        upper_arm = record(head(f"upperarm_{suffix}"), width_point(head(f"upperarm_{suffix}"), anatomy["shoulderWidthMultiplier"]))
        lower_arm = record(
            head(f"lowerarm_{suffix}"),
            upper_arm + (head(f"lowerarm_{suffix}") - head(f"upperarm_{suffix}")) * anatomy["armLengthMultiplier"],
        )
        hand = record(
            head(f"hand_{suffix}"),
            lower_arm + (head(f"hand_{suffix}") - head(f"lowerarm_{suffix}")) * anatomy["armLengthMultiplier"],
        )
        hand_tail = record(
            tail(f"hand_{suffix}"),
            hand + (tail(f"hand_{suffix}") - head(f"hand_{suffix}")) * anatomy["armLengthMultiplier"],
        )
        thigh = head(f"thigh_{suffix}").copy()
        thigh.x *= anatomy["hipWidthMultiplier"]
        thigh = record(head(f"thigh_{suffix}"), thigh)
        calf = record(
            head(f"calf_{suffix}"),
            thigh + (head(f"calf_{suffix}") - head(f"thigh_{suffix}")) * anatomy["legLengthMultiplier"],
        )
        foot = record(
            head(f"foot_{suffix}"),
            calf + (head(f"foot_{suffix}") - head(f"calf_{suffix}")) * anatomy["legLengthMultiplier"],
        )
        ball = record(
            head(f"ball_{suffix}"),
            foot + (head(f"ball_{suffix}") - head(f"foot_{suffix}")) * anatomy["legLengthMultiplier"],
        )
        ball_tail = record(
            tail(f"ball_{suffix}"),
            ball + (tail(f"ball_{suffix}") - head(f"ball_{suffix}")) * anatomy["legLengthMultiplier"],
        )
        builder.add_ellipsoid(
            f"Shoulder.{label}",
            f"clavicle_{suffix}",
            clavicle_start,
            upper_arm,
            measurements["shoulderJointRadius"],
            measurements["shoulderJointRadius"],
        )
        builder.add_ellipsoid(
            f"UpperArm.{label}",
            f"upperarm_{suffix}",
            upper_arm,
            lower_arm,
            measurements["upperArmRadius"],
            measurements["upperArmRadius"],
        )
        builder.add_ellipsoid(
            f"LowerArm.{label}",
            f"lowerarm_{suffix}",
            lower_arm,
            hand,
            measurements["forearmRadius"],
            measurements["forearmRadius"] * 0.94,
        )
        builder.add_box(
            f"Hand.{label}",
            f"hand_{suffix}",
            hand,
            hand_tail,
            measurements["handHalfWidth"],
            measurements["handDepth"],
        )
        builder.add_ellipsoid(
            f"UpperLeg.{label}",
            f"thigh_{suffix}",
            thigh,
            calf,
            measurements["thighRadius"],
            measurements["thighRadius"] * 0.9,
        )
        builder.add_ellipsoid(
            f"LowerLeg.{label}",
            f"calf_{suffix}",
            calf,
            foot,
            measurements["calfRadius"],
            measurements["calfRadius"] * 0.92,
        )
        builder.add_box(
            f"Foot.{label}",
            f"foot_{suffix}",
            foot,
            ball,
            measurements["footHalfWidth"],
            measurements["footDepth"],
        )
        builder.add_box(
            f"Toe.{label}",
            f"ball_{suffix}",
            ball,
            ball_tail,
            measurements["footHalfWidth"],
            0.045,
        )
        builder.add_sphere(f"ShoulderTransition.{label}", upper_arm, measurements["shoulderJointRadius"] * 1.12, measurements["shoulderJointRadius"], measurements["shoulderJointRadius"])
        builder.add_sphere(f"ElbowTransition.{label}", lower_arm, measurements["elbowRadius"], measurements["elbowRadius"], measurements["elbowRadius"])
        builder.add_sphere(f"WristTransition.{label}", hand, measurements["wristRadius"], measurements["wristRadius"], measurements["wristRadius"])
        builder.add_sphere(f"HipTransition.{label}", thigh, measurements["hipJointRadius"], measurements["hipJointRadius"] * 0.9, measurements["hipJointRadius"])
        builder.add_sphere(f"KneeTransition.{label}", calf, measurements["kneeRadius"], measurements["kneeRadius"] * 0.92, measurements["kneeRadius"])
        builder.add_sphere(f"AnkleTransition.{label}", foot, measurements["wristRadius"] * 1.15, measurements["wristRadius"], measurements["wristRadius"] * 1.15)
        weight_segments.extend(
            [
                (f"clavicle_{suffix}", clavicle_start, upper_arm, measurements["shoulderJointRadius"]),
                (f"upperarm_{suffix}", upper_arm, lower_arm, measurements["upperArmRadius"]),
                (f"lowerarm_{suffix}", lower_arm, hand, measurements["forearmRadius"]),
                (f"hand_{suffix}", hand, hand_tail, measurements["handHalfWidth"]),
                (f"thigh_{suffix}", thigh, calf, measurements["thighRadius"]),
                (f"calf_{suffix}", calf, foot, measurements["calfRadius"]),
                (f"foot_{suffix}", foot, ball, measurements["footHalfWidth"]),
                (f"ball_{suffix}", ball, ball_tail, measurements["footHalfWidth"]),
            ]
        )

    chest_center = (torso_heads["spine_03"] + torso_heads["neck_01"]) * 0.5
    chest_start = chest_center + Vector((0.0, 0.122, -0.035))
    chest_end = chest_center + Vector((0.0, 0.135, 0.055))
    builder.add_box("FacingMarker", "spine_03", chest_start, chest_end, 0.055, 0.018)

    mesh = bpy.data.meshes.new("ProceduralMannequinMesh")
    mesh.from_pydata(builder.vertices, [], builder.faces)
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    mesh_object = bpy.data.objects.new("ProceduralMannequinMesh", mesh)
    bpy.context.collection.objects.link(mesh_object)
    bpy.context.view_layer.objects.active = mesh_object
    mesh_object.select_set(True)
    mesh.remesh_voxel_size = measurements["voxelSizeMetres"]
    mesh.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    mesh = mesh_object.data
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    skin = recipe["appearance"]["skin"]
    linear_color = canonical_srgb_hex_to_linear(skin["color"])
    material = bpy.data.materials.new("ProceduralSkinMaterial")
    material.diffuse_color = linear_color + (1.0,)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = material.diffuse_color
    principled.inputs["Roughness"].default_value = skin["roughness"]
    principled.inputs["Metallic"].default_value = 0.0
    mesh.materials.append(material)

    skinning = assign_analytic_weights(mesh_object, weight_segments)
    modifier = mesh_object.modifiers.new("ProceduralMannequinArmature", "ARMATURE")
    modifier.object = armature
    mesh_object.parent = armature
    mesh_object.matrix_parent_inverse = armature.matrix_world.inverted()

    maximum_anchor_offset = max(
        (transformed - original).length for original, transformed in transformed_anchors
    )
    if maximum_anchor_offset > 0.45:
        raise RuntimeError(
            f"Derived bone-relative anchor offset {maximum_anchor_offset:.4f} exceeds the 0.45 metre tolerance."
        )
    anatomy["maximumBoneRelativeAnchorOffset"] = maximum_anchor_offset
    local_minimum_x = min(vertex.co.x for vertex in mesh.vertices)
    local_maximum_x = max(vertex.co.x for vertex in mesh.vertices)
    anatomy["lateralCentreError"] = abs(
        (local_minimum_x + local_maximum_x) * 0.5
    )

    topology = mesh_topology_statistics(mesh)
    return mesh_object, builder, anatomy, measurements, skinning, topology


def skeleton_rest_signature(armature):
    payload = []
    for bone in sorted(armature.data.bones, key=lambda candidate: candidate.name):
        payload.append(
            {
                "matrixLocal": [rounded(row) for row in bone.matrix_local],
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
            }
        )
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest(), payload


def compile_mannequin(args, recipe):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    template_mirror, template_path = create_template_import_mirror(Path(args.template))
    imported, armature = import_template(template_path)
    removed_vendor_mesh_names = remove_vendor_presentation(imported, armature)
    armature.name = "ProceduralMannequinArmature"
    armature.data.name = "ProceduralMannequinArmature"
    armature.animation_data_clear()

    mesh_object, builder, anatomy, measurements, skinning, topology = create_geometry(armature, recipe)
    root = bpy.data.objects.new("ProceduralMannequinRoot", None)
    bpy.context.collection.objects.link(root)
    armature.parent = root

    local_min_z = min(vertex.co.z for vertex in mesh_object.data.vertices)
    local_max_z = max(vertex.co.z for vertex in mesh_object.data.vertices)
    unscaled_height = local_max_z - local_min_z
    target_height = recipe["proportions"]["height"]
    scale = target_height / unscaled_height
    root.scale = (scale, scale, scale)
    root.location.z = -local_min_z * scale

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in (root, armature, mesh_object):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_object

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_all_influences=False,
        export_morph=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Procedural mannequin GLB export failed: {result}")

    rest_signature, rest_snapshot = skeleton_rest_signature(armature)
    triangle_count = sum(len(polygon.vertices) - 2 for polygon in mesh_object.data.polygons)
    report = {
        "animationSet": recipe["animations"]["set"],
        "blender": {
            "buildHash": bpy.app.build_hash.decode(),
            "version": bpy.app.version_string,
        },
        "compilerVersion": args.compiler_version,
        "anatomy": anatomy,
        "measurements": measurements,
        "geometry": {
            "materialCount": len(bpy.data.materials),
            "meshCount": len([obj for obj in bpy.data.objects if obj.type == "MESH"]),
            "parts": builder.parts,
            "profile": recipe["geometry"]["profile"],
            "radialSegments": recipe["geometry"]["radialSegments"],
            "topology": topology,
            "topologyVersion": recipe["geometry"]["topologyVersion"],
            "triangleCount": triangle_count,
            "vertexCount": len(mesh_object.data.vertices),
        },
        "material": {
            "authoredColor": recipe["appearance"]["skin"]["color"],
            "canonicalLinearColor": rounded(
                canonical_srgb_hex_to_linear(recipe["appearance"]["skin"]["color"])
            ),
            "metallic": 0.0,
            "name": "ProceduralSkinMaterial",
            "roughness": recipe["appearance"]["skin"]["roughness"],
            "schemaVersion": "procedural-skin-material-v1",
        },
        "grounding": {
            "localMaximumZ": local_max_z,
            "localMinimumZ": local_min_z,
            "outputHeightMetres": target_height,
            "rootScale": scale,
        },
        "outputHash": sha256(output),
        "recipeId": recipe["id"],
        "removedVendorMeshNames": removed_vendor_mesh_names,
        "skeleton": {
            "contract": recipe["skeleton"]["contract"],
            "jointCount": len(armature.data.bones),
            "restSignature": rest_signature,
            "restSnapshot": rest_snapshot,
        },
        "skinning": skinning,
        "templateHash": sha256(args.template),
        "warnings": [
            "Topology V1 uses a controlled voxel union and analytic segment weights.",
            "Finger bones remain present for animation compatibility but the generated hands have no fingers.",
            "The Golden skeleton is a compatibility template, not the future canonical generated rig.",
        ],
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf8"
    )
    template_mirror.cleanup()
    print("PROCEDURAL_MANNEQUIN_RESULT " + json.dumps(report, sort_keys=True))


def main():
    args = parse_arguments()
    recipe = json.loads(Path(args.recipe).read_text(encoding="utf8"))
    compile_mannequin(args, recipe)


if __name__ == "__main__":
    main()
