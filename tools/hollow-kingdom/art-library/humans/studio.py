"""Matched plates of the shipped GLBs, using the actual Golden in-place idle action."""
import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[4]
ASSETS = ROOT / "public/assets"
BEFORE = ASSETS / "hollow-kingdom/ferryman.glb"
AFTER = ASSETS / "hollow-kingdom/art-library/humans/oswin.glb"
EVIDENCE = ROOT / "docs/assets/art-library/humans"
CLIPS = ASSETS / "derived/humanoid-animations/golden-reference-v0"


def load_actor(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")


def play(armature, filename):
    """Import the full reference GLB so Blender resolves quaternion tracks to actual bones."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(CLIPS / filename))
    donor = next(obj for obj in set(bpy.data.objects) - before if obj.type == "ARMATURE")
    source = donor.animation_data
    action = source.action if source.action else source.nla_tracks[0].strips[0].action
    target = armature.animation_data_create()
    target.action = action
    target.action_slot = action.slots[0]
    for obj in set(bpy.data.objects) - before:
        bpy.data.objects.remove(obj, do_unlink=True)
    return action


def add_area(name, position, color, power, size, target=(0, 0, 1.1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.shape, data.size = power, color, "DISK", size
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = position
    lamp.rotation_euler = (Vector(target) - lamp.location).to_track_quat("-Z", "Y").to_euler()


def studio():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = 100
    scene.render.resolution_x, scene.render.resolution_y = 560, 720
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("Grey daylight")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.32, .38, .45, 1)
    background.inputs["Strength"].default_value = .35
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.012))
    ground = bpy.data.materials.new("Slate backdrop")
    ground.diffuse_color = (.055, .075, .083, 1)
    bpy.context.object.data.materials.append(ground)
    add_area("Sailcloth softbox", (-2.4, -3.4, 3.8), (1, .84, .69), 400, 3)
    add_area("Harbour sky", (2.3, -1.9, 2.6), (.72, .84, 1), 240, 2.4)
    add_area("Edge", (.8, 2.0, 3.2), (1, .82, .60), 420, 1.4)
    bpy.ops.object.camera_add()
    scene.camera = bpy.context.object
    scene.camera.data.type = "ORTHO"
    return scene


def photograph(scene, role, detail=False):
    camera = scene.camera
    # Identical lens, camera, action, time, lighting and exposure on both sides.
    target = Vector((0, .04, 1.49 if detail else .94))
    camera.location = target + Vector((1.06, -3.68, .38 if detail else .66))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = .92 if detail else 2.12
    scene.render.filepath = str(EVIDENCE / (role + ("-portrait" if detail else "") + ".png"))
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("takes", nargs="+", choices=["before", "after"])
    parser.add_argument("--walk", action="store_true", help="Capture the side profile of the opposite walking step")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    for take in args.takes:
        actor = load_actor(BEFORE if take == "before" else AFTER)
        if args.walk:
            play(actor, "walk-in-place.glb")
            bpy.context.scene.frame_set(7)
            scene=studio()
            camera=scene.camera
            target=Vector((0,0,.94))
            camera.location=target+Vector((-3.4,-1.68,.56))
            camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
            camera.data.ortho_scale=2.12
            scene.render.filepath=str(EVIDENCE/(take+"-walk.png"))
            bpy.ops.render.render(write_still=True)
            continue
        play(actor, "idle.glb")
        bpy.context.scene.frame_set(12)
        scene = studio()
        photograph(scene, take)
        photograph(scene, take, detail=True)
