"""Matched Cycles photographs made from re-imported game GLBs."""
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ASSETS = ROOT / "public/assets/hollow-kingdom"
PROOFS = ROOT / "docs/assets/art-library/creatures"


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def softbox(name, location, color, energy, size):
    lamp = bpy.data.lights.new(name, "AREA")
    lamp.energy, lamp.color, lamp.shape, lamp.size = energy, color, "DISK", size
    obj = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, -.3, .7))


def add_rider(arm):
    """Apply the shipped external action to the game's actual Wayfarer skin."""
    bpy.ops.import_scene.gltf(filepath=str(ASSETS / "wayfarer.glb"))
    rider = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE" and o != arm)
    def chunks(name):
        raw = (ASSETS / name).read_bytes()
        end = 20 + struct.unpack_from("<I", raw, 12)[0]
        return json.loads(raw[20:end]), raw[end + 8:]
    human, _ = chunks("wayfarer.glb")
    action, buffer = chunks("rider.glb")
    clip = next(a for a in action["animations"] if a["name"] == "Ride")
    overrides = {}
    for ch in clip["channels"]:
        key = ch["target"]["path"]
        name = action["nodes"][ch["target"]["node"]]["name"]
        sampler = clip["samplers"][ch["sampler"]]
        acc = action["accessors"][sampler["output"]]
        view = action["bufferViews"][acc["bufferView"]]
        width = 4 if key == "rotation" else 3
        offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        if sampler.get("interpolation") == "CUBICSPLINE":
            offset += width * 4
        overrides.setdefault(name, {})[key] = struct.unpack_from("<" + "f" * width, buffer, offset)
    # As in the game, apply the clip's local TRS by joint name to the real
    # Wayfarer. Blender's imported bone axes differ between the two GLBs, so
    # copying F-curves directly would put the mounted pose into the wrong basis.
    def joint_world(animated):
        out = {}
        def visit(i, parent):
            n = human["nodes"][i]
            n = n | overrides.get(n["name"], {}) if animated else n
            x, y, z, w = n.get("rotation", [0, 0, 0, 1])
            transform = Matrix.LocRotScale(Vector(n.get("translation", [0, 0, 0])), Quaternion((w, x, y, z)),
                                         Vector(n.get("scale", [1, 1, 1])))
            if "matrix" in n:
                transform = Matrix([n["matrix"][k:k + 4] for k in range(0, 16, 4)]).transposed()
            out[n["name"]] = parent @ transform
            for child in n.get("children", []):
                visit(child, out[n["name"]])
        for root in human["scenes"][human.get("scene", 0)]["nodes"]:
            visit(root, Matrix.Identity(4))
        return out
    rest, posed = joint_world(False), joint_world(True)
    conversion = Matrix.Rotation(math.pi / 2, 4, "X")
    for bone in sorted(rider.pose.bones, key=lambda b: len(b.parent_recursive)):
        if bone.name in posed:
            delta = conversion @ posed[bone.name] @ rest[bone.name].inverted() @ conversion.inverted()
            bone.matrix = rider.matrix_world.inverted() @ delta @ rider.matrix_world @ bone.bone.matrix_local
            bpy.context.view_layer.update()
    bpy.context.scene.frame_set(9)
    saddle = arm.matrix_world @ arm.pose.bones["Saddle"].head
    hip = rider.matrix_world @ rider.pose.bones["pelvis"].head
    rider.location += saddle + Vector((0, 0, .09)) - hip
    bpy.context.view_layer.update()
    for side in ("l", "r"):
        foot = rider.matrix_world @ rider.pose.bones["foot_" + side].head
        hand = rider.matrix_world @ rider.pose.bones["hand_" + side].head
        assert abs(foot.x) > .32 and foot.z < saddle.z - .35, (side, foot, saddle)
        assert hand.y < saddle.y - .16 and abs(hand.x) < .25, (side, hand, saddle)


def photograph(kind, path, horse=False, views=()):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(path))
    arm = next(o for o in s.objects if o.type == "ARMATURE")
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.003))
    floor = bpy.context.object
    mat = bpy.data.materials.new("Graphite studio floor")
    mat.use_nodes = True
    shader = mat.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (.045, .052, .054, 1)
    shader.inputs["Roughness"].default_value = .88
    floor.data.materials.append(mat)
    s.world = bpy.data.worlds.new("Neutral sky")
    s.world.use_nodes = True
    s.world.node_tree.nodes["Background"].inputs[0].default_value = (.27, .29, .32, 1)
    s.world.node_tree.nodes["Background"].inputs[1].default_value = .48
    softbox("Warm skylight", (2, -3, 4.8), (1, .89, .76), 500, 3.2)
    softbox("Cold sky edge", (-2.2, 2.5, 3.5), (.66, .81, 1), 710, 2.4)
    softbox("Head fill", (-2.6, -2.8, 2.4), (.84, .90, 1), 95, 2.0)
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    s.camera = camera
    s.render.engine = "CYCLES"
    s.cycles.samples = 12
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 4
    s.render.threads_mode = "FIXED"
    s.render.threads = 3
    s.render.resolution_x, s.render.resolution_y = 960, 680
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = "JPEG"
    s.render.image_settings.quality = 93
    s.view_settings.view_transform = "AgX"
    cameras = (
        ("whole", "Walk", 9, (4.35, -2.65, 2.16), (0, .25, .88), 4.65),
        ("head", "BiteWindup", 22, (2.65, -3.2, 2.30), (0, -.89, 1.53), 1.93),
    ) if not horse else (
        ("whole", "HorseWalk", 9, (3.75, -2.15, 1.79), (0, -.04, 1.05), 3.55),
        ("head", "HorseIdle", 17, (2.4, -2.5, 1.96), (0, -.83, 1.65), 1.34),
        ("mounted", "HorseWalk", 9, (3.70, -1.85, 2.08), (0, -.07, 1.38), 4.30),
    )
    for view, clip, frame, location, target, scale in cameras:
        if views and view not in views:
            continue
        arm.animation_data.action = bpy.data.actions[clip]
        s.frame_set(frame)
        if view == "mounted":
            add_rider(arm)
        camera.location = location
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = scale
        aim(camera, target)
        s.render.filepath = str(PROOFS / f"{kind}-{view}.jpg")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["before", "after"]
    kinds = [arg for arg in requested if arg not in ("whole", "head", "mounted")]
    views = [arg for arg in requested if arg not in kinds]
    for kind in kinds:
        path = {"before": ASSETS / "chapter-one/drake.glb",
                "after": ASSETS / "art-library/creatures/blackwater-wyrm.glb",
                "bracken-before": ASSETS / "horse.glb",
                "bracken-after": ASSETS / "art-library/creatures/bracken-road-mare.glb"}[kind]
        photograph(kind, path, horse=kind.startswith("bracken-"), views=views)
