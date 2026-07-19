"""Headless Golden Reference animation bake for Blender 5.2+.

This compiler is deliberately pair-specific. It applies the validated V2
source-world rest delta to the target rest frame; it is not a name-only
retargeter and never modifies the vendor inputs.
"""

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


DIAGNOSTIC_JOINTS = (
    "pelvis",
    "spine_03",
    "neck_01",
    "Head",
    "clavicle_l",
    "clavicle_r",
    "upperarm_l",
    "upperarm_r",
    "lowerarm_l",
    "lowerarm_r",
    "hand_l",
    "hand_r",
    "thigh_l",
    "thigh_r",
    "calf_l",
    "calf_r",
    "foot_l",
    "foot_r",
)


def parse_arguments():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--clip", choices=("idle", "walk"), required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--profile-version", required=True)
    parser.add_argument("--frame-rate", type=int, default=30)
    parser.add_argument("--root-motion-policy", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--diagnostics", required=True)
    return parser.parse_args(sys.argv[separator + 1 :])


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_name(value):
    return re.sub(r"[^a-z0-9]", "", value.lower()).removeprefix("mixamorig")


def resolve_bone(armature, expected):
    direct = armature.pose.bones.get(expected)
    if direct:
        return direct
    normalized = normalized_name(expected)
    matches = [
        bone for bone in armature.pose.bones if normalized_name(bone.name) == normalized
    ]
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly one bone matching {expected!r}; found {[bone.name for bone in matches]}"
        )
    return matches[0]


def find_armature(objects, required_bone, expected_count, label):
    candidates = []
    for obj in objects:
        if obj.type != "ARMATURE":
            continue
        try:
            resolve_bone(obj, required_bone)
            candidates.append(obj)
        except RuntimeError:
            continue
    exact = [obj for obj in candidates if len(obj.data.bones) == expected_count]
    if len(exact) != 1:
        details = [(obj.name, len(obj.data.bones)) for obj in candidates]
        raise RuntimeError(
            f"Could not identify one {label} armature with {expected_count} bones: {details}"
        )
    return exact[0]


def import_source(path):
    before = set(bpy.data.objects)
    result = bpy.ops.import_scene.fbx(
        filepath=str(path),
        automatic_bone_orientation=False,
        ignore_leaf_bones=False,
        use_anim=True,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"FBX import failed: {result}")
    return set(bpy.data.objects) - before


def import_target(path):
    before = set(bpy.data.objects)
    result = bpy.ops.import_scene.gltf(filepath=str(path), import_shading="NORMALS")
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF import failed: {result}")
    return set(bpy.data.objects) - before


def create_target_import_mirror(path):
    temporary = tempfile.TemporaryDirectory(prefix="golden-target-import-")
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


def select_source_action(armature):
    action = armature.animation_data.action if armature.animation_data else None
    if action:
        return action
    actions = [candidate for candidate in bpy.data.actions if candidate.frame_range.length > 0]
    if len(actions) != 1:
        raise RuntimeError(
            f"Expected one imported source action; found {[candidate.name for candidate in actions]}"
        )
    armature.animation_data_create()
    armature.animation_data.action = actions[0]
    return actions[0]


def world_rest_matrix(armature, pose_bone):
    return armature.matrix_world @ pose_bone.bone.matrix_local


def world_pose_matrix(armature, pose_bone):
    return armature.matrix_world @ pose_bone.matrix


def matrix_from_location_rotation(location, rotation):
    return Matrix.LocRotScale(location, rotation, Vector((1.0, 1.0, 1.0)))


def bone_depth(bone):
    depth = 0
    parent = bone.parent
    while parent:
        depth += 1
        parent = parent.parent
    return depth


def rounded(values, digits=10):
    return [round(float(value), digits) for value in values]


def capture_pose(armature, frame, joints):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    result = {}
    for name in joints:
        bone = resolve_bone(armature, name)
        matrix = world_pose_matrix(armature, bone)
        result[name] = {
            "positionBlenderWorld": rounded(matrix.to_translation()),
            "rotationBlenderWorld": rounded(matrix.to_quaternion()),
        }
    return result


def action_normalized_data(action, armature, frames, mapped_bones):
    samples = []
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        frame_data = {"frame": frame, "bones": {}}
        for name in mapped_bones:
            bone = resolve_bone(armature, name)
            frame_data["bones"][name] = {
                "location": rounded(bone.location),
                "rotationQuaternion": rounded(bone.rotation_quaternion),
            }
        samples.append(frame_data)
    encoded = json.dumps(samples, sort_keys=True, separators=(",", ":")).encode()
    return samples, hashlib.sha256(encoded).hexdigest()


def bake(args, profile):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = args.frame_rate
    scene.render.fps_base = 1.0
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"

    source_objects = import_source(Path(args.source))
    source_armature = find_armature(
        source_objects,
        profile["sourceSkeleton"]["rootBone"],
        profile["sourceSkeleton"]["jointCount"],
        "source",
    )
    source_action = select_source_action(source_armature)

    target_import_mirror, target_import_path = create_target_import_mirror(
        Path(args.target)
    )
    target_objects = import_target(target_import_path)
    target_armature = find_armature(
        target_objects,
        profile["targetSkeleton"]["pelvisBone"],
        profile["targetSkeleton"]["jointCount"],
        "target",
    )

    mapped = {
        target_name: resolve_bone(source_armature, source_name)
        for target_name, source_name in profile["boneMap"].items()
    }
    target_mapped = {
        target_name: resolve_bone(target_armature, target_name)
        for target_name in profile["boneMap"]
    }
    if len(mapped) != 22 or len(target_mapped) != 22:
        raise RuntimeError("The V2 profile must map exactly 22 principal bones.")

    source_frame_start = int(round(source_action.frame_range[0]))
    source_frame_end = int(round(source_action.frame_range[1]))
    if source_frame_end <= source_frame_start:
        raise RuntimeError(f"Source action has invalid range {source_action.frame_range[:]}.")
    source_frames = list(range(source_frame_start, source_frame_end + 1))
    frames = list(range(len(source_frames)))
    scene.frame_start = frames[0]
    scene.frame_end = frames[-1]

    source_rest = {
        target_name: world_rest_matrix(source_armature, source_bone).copy()
        for target_name, source_bone in mapped.items()
    }
    target_rest = {
        target_name: world_rest_matrix(target_armature, target_bone).copy()
        for target_name, target_bone in target_mapped.items()
    }
    source_hips = mapped["pelvis"]
    target_pelvis = target_mapped["pelvis"]
    source_height = source_rest["pelvis"].to_translation().z
    target_height = target_rest["pelvis"].to_translation().z
    if abs(source_height) < 1e-8:
        raise RuntimeError("Cannot derive source-to-target pelvis scale.")
    scale = target_height / source_height

    action_name = (
        "GoldenReference_Idle"
        if args.clip == "idle"
        else "GoldenReference_Walk_InPlace"
    )
    target_action = bpy.data.actions.new(action_name)
    target_armature.animation_data_create()
    target_armature.animation_data.action = target_action
    for bone in target_armature.pose.bones:
        bone.rotation_mode = "QUATERNION"

    ordered_targets = sorted(target_mapped.values(), key=bone_depth)
    first_raw_pelvis = None
    raw_first = None
    raw_last = None
    baked_samples = []
    for source_frame, frame in zip(source_frames, frames):
        scene.frame_set(source_frame)
        bpy.context.view_layer.update()
        for pose_bone in target_armature.pose.bones:
            pose_bone.matrix_basis.identity()
        bpy.context.view_layer.update()

        source_animated_pelvis = world_pose_matrix(source_armature, source_hips)
        source_pelvis_delta = (
            source_animated_pelvis.to_translation()
            - source_rest["pelvis"].to_translation()
        ) * scale
        raw_pelvis = target_rest["pelvis"].to_translation() + source_pelvis_delta
        if first_raw_pelvis is None:
            first_raw_pelvis = raw_pelvis.copy()
            raw_first = raw_pelvis.copy()
        raw_last = raw_pelvis.copy()

        for target_bone in ordered_targets:
            target_name = target_bone.name
            source_bone = mapped[target_name]
            source_animated_world = world_pose_matrix(source_armature, source_bone)
            source_rest_rotation = source_rest[target_name].to_quaternion()
            desired_rotation = (
                source_animated_world.to_quaternion()
                @ source_rest_rotation.inverted()
                @ target_rest[target_name].to_quaternion()
            ).normalized()
            if target_name == "pelvis":
                desired_location = Vector(
                    (first_raw_pelvis.x, first_raw_pelvis.y, raw_pelvis.z)
                )
            elif target_bone.parent:
                parent_world = world_pose_matrix(target_armature, target_bone.parent)
                rest_relative = (
                    target_bone.parent.bone.matrix_local.inverted()
                    @ target_bone.bone.matrix_local
                )
                desired_location = parent_world @ rest_relative.to_translation()
            else:
                desired_location = target_rest[target_name].to_translation()
            desired_world = matrix_from_location_rotation(
                desired_location, desired_rotation
            )
            target_bone.matrix = target_armature.matrix_world.inverted() @ desired_world
            target_bone.rotation_mode = "QUATERNION"
            target_bone.keyframe_insert(
                data_path="rotation_quaternion",
                frame=frame,
                group=target_name,
            )
            if target_name == "pelvis":
                target_bone.keyframe_insert(
                    data_path="location", frame=frame, group=target_name
                )
            target_bone.matrix_basis = target_bone.matrix_basis
            bpy.context.view_layer.update()
        baked_samples.append(frame)

    source_armature.animation_data_clear()
    for obj in source_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        if action != target_action:
            bpy.data.actions.remove(action)

    target_armature.animation_data.action = target_action
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in target_objects:
        if obj.name in bpy.data.objects:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = target_armature

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    export_result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_frame_range=True,
        export_frame_step=1,
        export_force_sampling=False,
        export_optimize_animation_size=False,
        export_anim_slide_to_zero=True,
        export_skins=True,
        export_all_influences=True,
        export_morph=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    if "FINISHED" not in export_result:
        raise RuntimeError(f"GLB export failed: {export_result}")
    target_import_mirror.cleanup()

    sample_frames = sorted(
        {
            frames[0],
            frames[0] + round((frames[-1] - frames[0]) * 0.25),
            frames[0] + round((frames[-1] - frames[0]) * 0.5),
            frames[0] + round((frames[-1] - frames[0]) * 0.75),
        }
    )
    normalized_samples, normalized_hash = action_normalized_data(
        target_action, target_armature, frames, profile["boneMap"].keys()
    )
    diagnostics = {
        "clipId": args.clip,
        "profileVersion": profile["version"],
        "sampledPoses": [
            {
                "frame": frame,
                "normalizedTime": (frame - frames[0]) / (frames[-1] - frames[0]),
                "joints": capture_pose(target_armature, frame, DIAGNOSTIC_JOINTS),
            }
            for frame in sample_frames
        ],
        "normalizedActionHash": normalized_hash,
        "normalizedActionSamples": normalized_samples,
    }
    diagnostics_path = Path(args.diagnostics)
    diagnostics_path.parent.mkdir(parents=True, exist_ok=True)
    diagnostics_path.write_text(
        json.dumps(diagnostics, indent=2, sort_keys=True) + "\n", encoding="utf8"
    )

    raw_displacement = raw_last - raw_first
    metadata = {
        "artifactFormat": "full-target-glb-per-clip",
        "artifactStatus": "offline-baked-candidate",
        "blender": {
            "buildHash": bpy.app.build_hash.decode(),
            "version": bpy.app.version_string,
        },
        "clipId": args.clip,
        "clipName": action_name,
        "compilerVersion": profile["compilerVersion"],
        "durationSeconds": (frames[-1] - frames[0]) / args.frame_rate,
        "frameCount": len(frames),
        "frameRate": args.frame_rate,
        "mappedBoneCount": len(profile["boneMap"]),
        "normalizedAnimationHash": normalized_hash,
        "outputHash": sha256(output),
        "outputPath": output.as_posix(),
        "profileVersion": profile["version"],
        "rootMotion": {
            "policy": args.root_motion_policy,
            "prePolicyDisplacementBlenderWorld": {
                "x": raw_displacement.x,
                "y": raw_displacement.y,
                "z": raw_displacement.z,
            },
            "residualHorizontalBlenderWorld": {"x": 0.0, "y": 0.0},
            "preservedVerticalBlenderWorld": raw_displacement.z,
        },
        "source": {
            "hash": sha256(args.source),
            "path": Path(args.source).as_posix(),
            "skeleton": profile["sourceSkeleton"],
        },
        "target": {
            "bufferHash": profile["targetSkeleton"]["bufferHash"],
            "hash": sha256(args.target),
            "path": Path(args.target).as_posix(),
            "skeleton": profile["targetSkeleton"],
        },
        "warnings": [
            "Finger/helper bones remain in the target rest pose.",
            "Full target GLB duplicates mesh and embedded textures per clip.",
        ],
    }
    metadata_path = Path(args.metadata)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf8"
    )
    print("GOLDEN_BAKE_RESULT " + json.dumps(metadata, sort_keys=True))


def main():
    args = parse_arguments()
    profile = json.loads(Path(args.profile).read_text(encoding="utf8"))
    if profile["version"] != args.profile_version:
        raise RuntimeError(
            f"Profile version mismatch: {profile['version']} != {args.profile_version}"
        )
    if profile["rootMotionPolicy"] != args.root_motion_policy:
        raise RuntimeError("Root-motion policy does not match the selected profile.")
    expected_source_hash = profile["sourceSkeleton"]["clipHashes"][args.clip]
    if sha256(args.source) != expected_source_hash:
        raise RuntimeError("Source FBX hash does not match the selected profile.")
    if sha256(args.target) != profile["targetSkeleton"]["gltfHash"]:
        raise RuntimeError("Target glTF hash does not match the selected profile.")
    bake(args, profile)


if __name__ == "__main__":
    main()
