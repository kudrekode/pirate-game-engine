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
        0.19 * anatomy["hipWidthMultiplier"], 0.125,
    )
    builder.add_ellipsoid("TorsoLower", "spine_01", torso_heads["spine_01"], torso_heads["spine_02"], 0.175 * anatomy["hipWidthMultiplier"], 0.11)
    builder.add_ellipsoid("TorsoMiddle", "spine_02", torso_heads["spine_02"], torso_heads["spine_03"], 0.205 * ((anatomy["hipWidthMultiplier"] + anatomy["shoulderWidthMultiplier"]) * 0.5), 0.12)
    builder.add_ellipsoid("TorsoUpper", "spine_03", torso_heads["spine_03"], torso_heads["neck_01"], 0.245 * anatomy["shoulderWidthMultiplier"], 0.125)
    builder.add_ellipsoid("Neck", "neck_01", torso_heads["neck_01"], torso_heads["Head"], 0.06, 0.055)
    builder.add_ellipsoid("Head", "Head", torso_heads["Head"], transformed_head_tail, 0.115, 0.105)

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
            0.075,
            0.075,
        )
        builder.add_ellipsoid(
            f"UpperArm.{label}",
            f"upperarm_{suffix}",
            upper_arm,
            lower_arm,
            0.075,
            0.075,
        )
        builder.add_ellipsoid(
            f"LowerArm.{label}",
            f"lowerarm_{suffix}",
            lower_arm,
            hand,
            0.065,
            0.06,
        )
        builder.add_box(
            f"Hand.{label}",
            f"hand_{suffix}",
            hand,
            hand_tail,
            0.062,
            0.032,
        )
        builder.add_ellipsoid(
            f"UpperLeg.{label}",
            f"thigh_{suffix}",
            thigh,
            calf,
            0.105,
            0.095,
        )
        builder.add_ellipsoid(
            f"LowerLeg.{label}",
            f"calf_{suffix}",
            calf,
            foot,
            0.087,
            0.08,
        )
        builder.add_box(
            f"Foot.{label}",
            f"foot_{suffix}",
            foot,
            ball,
            0.09,
            0.055,
        )
        builder.add_box(
            f"Toe.{label}",
            f"ball_{suffix}",
            ball,
            ball_tail,
            0.09,
            0.045,
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
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) != 4 or polygon.index < len(mesh.polygons) - 18

    color = recipe["material"]["baseColor"].lstrip("#")
    material = bpy.data.materials.new("ProceduralMannequinMaterial")
    material.diffuse_color = tuple(int(color[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (1.0,)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = material.diffuse_color
    principled.inputs["Roughness"].default_value = recipe["material"]["roughness"]
    mesh.materials.append(material)

    groups = {}
    for index, bone_name in enumerate(builder.weights):
        group = groups.get(bone_name)
        if group is None:
            group = mesh_object.vertex_groups.new(name=bone_name)
            groups[bone_name] = group
        group.add([index], 1.0, "REPLACE")
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
    local_minimum_x = min(vertex[0] for vertex in builder.vertices)
    local_maximum_x = max(vertex[0] for vertex in builder.vertices)
    anatomy["lateralCentreError"] = abs(
        (local_minimum_x + local_maximum_x) * 0.5
    )

    return mesh_object, builder, anatomy


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

    mesh_object, builder, anatomy = create_geometry(armature, recipe)
    root = bpy.data.objects.new("ProceduralMannequinRoot", None)
    bpy.context.collection.objects.link(root)
    armature.parent = root

    local_min_z = min(vertex[2] for vertex in builder.vertices)
    local_max_z = max(vertex[2] for vertex in builder.vertices)
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
    triangle_count = sum(len(face) - 2 for face in builder.faces)
    report = {
        "animationSet": recipe["animations"]["set"],
        "blender": {
            "buildHash": bpy.app.build_hash.decode(),
            "version": bpy.app.version_string,
        },
        "compilerVersion": args.compiler_version,
        "anatomy": anatomy,
        "geometry": {
            "materialCount": len(bpy.data.materials),
            "meshCount": len([obj for obj in bpy.data.objects if obj.type == "MESH"]),
            "parts": builder.parts,
            "profile": recipe["geometry"]["profile"],
            "radialSegments": recipe["geometry"]["radialSegments"],
            "triangleCount": triangle_count,
            "vertexCount": len(builder.vertices),
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
        "skinning": {
            "maximumInfluences": 1,
            "normalizedWeightCount": len(builder.vertices),
            "strategy": "explicit-rigid-body-part-groups",
            "unweightedVertexCount": 0,
            "weightMaximum": 1.0,
            "weightMinimum": 1.0,
        },
        "templateHash": sha256(args.template),
        "warnings": [
            "V1 uses deliberately rigid body-part weighting with overlapping joint volumes.",
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
