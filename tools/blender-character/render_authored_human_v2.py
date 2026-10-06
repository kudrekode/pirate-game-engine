"""Explicit, bounded GLB round-trip render selections for the V2 experiment."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from authored_human_v2 import import_base, SOURCE

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "test-results/authored-human-v2"
VIEWS = {
    "front": ((0, -4.2, 1.2), (0, 0, .95), 2.38),
    "side": ((4.2, 0, 1.2), (0, 0, .95), 2.38),
    "three-quarter": ((3.1, -3.1, 1.32), (0, 0, .95), 2.38),
    "back": ((0, 4.2, 1.2), (0, 0, .95), 2.38),
    "face-front": ((0, -1.45, 1.7), (0, 0, 1.69), .43),
    "face-side": ((1.45, 0, 1.7), (0, 0, 1.69), .43),
    "face-three-quarter": ((1.1, -1.1, 1.72), (0, 0, 1.69), .43),
    "torso": ((1.2, -2.4, 1.5), (0, 0, 1.27), .90),
    "torso-side": ((2.4, 0, 1.5), (0, 0, 1.28), .90),
    "torso-back": ((0, 2.4, 1.5), (0, 0, 1.28), .90),
}
POSES = ("rest", "idle", "walk", "raised-arm", "elbow", "crouch", "head-turn")


def pose(rig, name):
    if name in ("idle", "walk"):
        before = set(bpy.data.objects)
        clip = "idle" if name == "idle" else "walk-in-place"
        path = ROOT / f"public/assets/derived/humanoid-animations/golden-reference-v0/{clip}.glb"
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = set(bpy.data.objects) - before
        source = next(o for o in imported if o.type == "ARMATURE")
        rig.animation_data_create()
        rig.animation_data.action = source.animation_data.action
        rig.animation_data.action_slot = source.animation_data.action_slot
        first, last = rig.animation_data.action.frame_range
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.context.scene.frame_set(int(first + (last - first) * .25))
        return

    def rotate(bone, axis, degrees):
        p = rig.pose.bones[bone]
        rest = p.bone.matrix_local.to_quaternion()
        p.rotation_mode = "QUATERNION"
        p.rotation_quaternion = rest.inverted() @ Quaternion(Vector(axis), math.radians(degrees)) @ rest

    if name == "raised-arm":
        rotate("upperarm_l", (0, 1, 0), -60)
        rotate("upperarm_r", (0, 1, 0), -70)
    elif name == "elbow":
        rotate("upperarm_l", (0, 1, 0), 50)
        rotate("lowerarm_l", (0, 0, 1), -115)
        rotate("upperarm_r", (0, 1, 0), -50)
        rotate("lowerarm_r", (0, 0, 1), 115)
    elif name == "crouch":
        for side in ("l", "r"):
            rotate("thigh_" + side, (1, 0, 0), -85)
            rotate("calf_" + side, (1, 0, 0), 125)
            rotate("foot_" + side, (1, 0, 0), -40)
        pelvis = rig.pose.bones["pelvis"]
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, -.42))
        rotate("upperarm_l", (0, 1, 0), 65)
        rotate("upperarm_r", (0, 1, 0), -65)
    elif name == "head-turn":
        rotate("neck_01", (0, 0, 1), 15)
        rotate("Head", (0, 0, 1), 40)
    bpy.context.view_layer.update()


def lighting():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("V2NeutralStudio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.75, .78, .82, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .8
    for name, position, energy, size in (("Key", (2, -3, 4), 550, 3), ("Fill", (-3, -1, 2.8), 330, 3), ("Rim", (0, 3, 3.5), 450, 2.5)):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1.1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("V2Review")
    camera = bpy.data.objects.new("V2Review", data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    data.type = "ORTHO"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.render.resolution_x = 720
    scene.render.resolution_y = 840
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    return camera


def deformation_evidence():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    body = next((o for o in objects if o.name.startswith("SuperHero_Male")), None)
    tank = next((o for o in objects if o.name.startswith("V2_Tank")), None)
    if body is None:
        return {}
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    world = body.matrix_world
    vertices = [world @ v.co for v in mesh.vertices]
    bvh = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons])
    metrics = {}
    for obj in (body, tank):
        if obj is None:
            continue
        deform = obj.evaluated_get(depsgraph)
        result = deform.to_mesh()
        ratios = []
        for edge in obj.data.edges:
            a, b = edge.vertices
            before = (obj.data.vertices[a].co - obj.data.vertices[b].co).length
            after = (result.vertices[a].co - result.vertices[b].co).length
            if before > .000001:
                ratios.append(after / before)
        metrics[obj.name] = {"maxEdgeStretch": max(ratios), "minEdgeStretch": min(ratios)}
        if obj == tank:
            coords = [obj.matrix_world @ v.co for v in result.vertices]
            samples = coords + [sum((coords[i] for i in p.vertices), Vector()) / len(p.vertices) for p in result.polygons]
            gaps = []
            for point in samples:
                location, normal, _, _ = bvh.find_nearest(point)
                gaps.append((point - location).dot(normal))
            metrics[obj.name].update({"samples": len(gaps), "minimumSignedGapMm": min(gaps) * 1000,
                                      "samplesInsideBeyond1mm": sum(gap < -.001 for gap in gaps)})
        deform.to_mesh_clear()
    evaluated.to_mesh_clear()
    return metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="dressed-neutral,combined")
    parser.add_argument("--views", default="front,face-front,torso")
    parser.add_argument("--poses", default="rest")
    parser.add_argument("--bare", action="store_true")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    selections = [(c, p, v) for c in args.cases.split(",") for p in args.poses.split(",") for v in args.views.split(",")]
    assert all(p in POSES and v in VIEWS for _, p, v in selections)
    if args.list:
        print(json.dumps(selections))
        return
    for case in args.cases.split(","):
        for pose_name in args.poses.split(","):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            path = (ROOT / "public/assets/derived/procedural-humanoids/mannequin-v0/mannequin.glb"
                    if case == "legacy" else SOURCE if case == "source" else OUT / (case + ".glb"))
            if case == "source":
                import_base()
            else:
                bpy.ops.import_scene.gltf(filepath=str(path))
            rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
            if args.bare:
                for obj in bpy.context.scene.objects:
                    if obj.name.startswith("V2_Tank"):
                        obj.hide_render = True
            pose(rig, pose_name)
            camera = lighting()
            output = OUT / "renders" / (case + ("-bare" if args.bare else "")) / pose_name
            output.mkdir(parents=True, exist_ok=True)
            (output / "measurements.json").write_text(json.dumps({"modelSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "pose": pose_name, "measurements": deformation_evidence()}, indent=2))
            for view in args.views.split(","):
                position, target, scale = VIEWS[view]
                camera.location = position
                camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
                camera.data.ortho_scale = scale
                bpy.context.scene.render.filepath = str(output / (view + ".png"))
                bpy.ops.render.render(write_still=True)
                print("REVIEW", case, pose_name, view, flush=True)


if __name__ == "__main__":
    main()
