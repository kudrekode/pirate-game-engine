"""Small fixed-light comparison renderer for authored-human prototype review."""

import argparse
import math
import os

import bpy
from mathutils import Vector


VIEWS = {
    "front": ((0, -4.2, 1.2), (0, 0, 0.96), 2.2),
    "side": ((4.2, 0, 1.2), (0, 0, 0.96), 2.2),
    "three-quarter": ((3.1, -3.1, 1.32), (0, 0, 0.96), 2.2),
    "back": ((0, 4.2, 1.2), (0, 0, 0.96), 2.2),
    "face-front": ((0, -1.45, 1.7), (0, 0, 1.68), 0.56),
    "face-side": ((1.45, 0, 1.7), (0, 0, 1.68), 0.56),
    "face-three-quarter": ((1.1, -1.1, 1.72), (0, 0, 1.68), 0.56),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--views", default="front,side,three-quarter,back,face-front")
    args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.model)
    world = bpy.data.worlds.new("NeutralStudio")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.78, 0.82, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    for name, location, energy, size in (
        ("Key", (2, -3, 4), 550, 3.0),
        ("Fill", (-3, -1, 2.8), 330, 3.0),
        ("Rim", (0, 3, 3.5), 450, 2.5),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0, 0, 1.1)) - light.location).to_track_quat("-Z", "Y").to_euler()
    camera_data = bpy.data.cameras.new("ReviewCamera")
    camera = bpy.data.objects.new("ReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.type = "ORTHO"
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.render.resolution_x = 640
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    output_dir = os.path.abspath(args.output_dir)
    os.makedirs(output_dir, exist_ok=True)
    for name in args.views.split(","):
        location, target, scale = VIEWS[name]
        camera.location = location
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.ortho_scale = scale
        scene.render.filepath = os.path.join(output_dir, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", name, scene.render.filepath)


if __name__ == "__main__":
    main()
