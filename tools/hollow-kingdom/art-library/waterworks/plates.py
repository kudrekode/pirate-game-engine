"""Matched photographic plates from the shipped and freshly exported game GLBs."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector as V

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PUBLIC = ROOT / "public/assets/hollow-kingdom"
OUT = ROOT / "docs/assets/art-library/waterworks"


def aim(obj, point):
    obj.rotation_euler = (V(point)-obj.location).to_track_quat("-Z","Y").to_euler()


def area(name, position, watts, size, color, point):
    light = bpy.data.lights.new(name, type="AREA")
    light.energy, light.shape, light.size, light.color = watts, "DISK", size, color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, point)


def plate(source, filename, name, close=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 18
    scene.cycles.use_denoising = True
    scene.cycles.seed = 52
    scene.world = bpy.data.worlds.new("Blue-grey studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs[0].default_value = (.32,.405,.50,1)
    scene.world.node_tree.nodes.get("Background").inputs[1].default_value = .34
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.012))
    mat = bpy.data.materials.new("Matte charcoal sweep")
    mat.diffuse_color = (.079,.094,.105,1)
    bpy.context.object.data.materials.append(mat)
    is_well = name=="heron-well"
    center = ((.10,-.03,1.56) if is_well else (.43,0,1.52))
    camera = bpy.data.cameras.new("Catalogue lens")
    obj = bpy.data.objects.new(camera.name, camera)
    scene.collection.objects.link(obj)
    scene.camera = obj
    camera.type = "ORTHO"
    camera.ortho_scale = 3.96 if is_well else 3.61
    obj.location = (3.65,-6.35,3.18) if is_well else (3.2,-7.2,2.89)
    if close:
        center = (.0,.02,1.29) if is_well else (.79,0,2.33)
        camera.ortho_scale = 2.13 if is_well else 1.29
        obj.location = (2.26,-5.12,2.69) if is_well else (3.12,-6.32,2.72)
    aim(obj, center)
    area("Daylight through workshop door",(-3.5,-4.5,6.2),570,4.0,(1,.86,.70),(0,0,1))
    area("Cool sky",(3.6,-1.3,4.1),340,3.2,(.68,.82,1),(0,0,1.5))
    area("Edge light",(1.2,3.5,5.1),730,2.7,(1,.86,.66),(0,0,1.5))
    scene.render.resolution_x,scene.render.resolution_y = ((820,820) if not close else (900,690))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 93
    scene.render.filepath = str(OUT / filename)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    name = sys.argv[sys.argv.index("--")+1]
    base = {"heron-well":"well","tide-lantern":"lantern"}[name]
    OUT.mkdir(parents=True,exist_ok=True)
    for suffix,path in (("before",PUBLIC/(base+".glb")),("after",PUBLIC/"art-library/waterworks"/(name+".glb"))):
        if "after-only" in sys.argv and suffix == "before":
            continue
        for close in (False,True):
            plate(path, f"{name}-{'detail-' if close else ''}{suffix}.jpg", name, close)
