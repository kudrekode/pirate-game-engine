"""Matched catalogue photographs from the two game exports, lit for curved metal."""
from math import radians
from pathlib import Path
import bpy
from mathutils import Euler, Vector as V

ROOT=Path(__file__).resolve().parents[4]
PUBLIC=ROOT/"public/assets/hollow-kingdom"
DOC=ROOT/"docs/assets/art-library/armoury"


def point(obj,target):
    obj.rotation_euler=(V(target)-obj.location).to_track_quat("-Z","Y").to_euler()


def strip(name,loc,energy,size,length,color):
    data=bpy.data.lights.new(name,"AREA")
    data.shape="RECTANGLE"
    data.energy,data.size,data.size_y,data.color=energy,size,length,color
    light=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(light)
    light.location=loc
    point(light,(.30,0,0))


def shoot(path,suffix):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    pivot=bpy.data.objects.new("Catalogue mount",None)
    bpy.context.collection.objects.link(pivot)
    for obj in list(bpy.context.scene.objects):
        if obj!=pivot and obj.parent is None: obj.parent=pivot
    pivot.rotation_euler=Euler((radians(-84),radians(-5),radians(-63)))
    pivot.location.z=.072
    bpy.ops.mesh.primitive_plane_add(size=100)
    ground=bpy.data.materials.new("Blue-black baize")
    ground.use_nodes=True
    cloth=ground.node_tree.nodes["Principled BSDF"]
    cloth.inputs["Base Color"].default_value=(.019,.032,.041,1)
    cloth.inputs["Roughness"].default_value=.92
    fibre=ground.node_tree.nodes.new("ShaderNodeTexNoise")
    fibre.inputs["Scale"].default_value=38000
    fibre.inputs["Detail"].default_value=1
    bump=ground.node_tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value=.14
    bump.inputs["Distance"].default_value=.00024
    ground.node_tree.links.new(fibre.outputs["Fac"],bump.inputs["Height"])
    ground.node_tree.links.new(bump.outputs["Normal"],cloth.inputs["Normal"])
    bpy.context.object.data.materials.append(ground)
    scene=bpy.context.scene
    scene.world=bpy.data.worlds.new("Atelier")
    scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.52,.61,.69,1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value=.32
    strip("Long cool reflection",(.5,.9,1.45),47,1.7,.19,(.75,.87,1))
    strip("Guard reflection",(-.31,-.65,.87),36,.56,.74,(1,.83,.68))
    strip("Cutting edge",(.92,-.42,.82),24,.78,.13,(.95,.92,.86))
    scene.render.engine="CYCLES"
    scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.cycles.seed=11
    bpy.ops.object.camera_add()
    camera=bpy.context.object
    scene.camera=camera
    camera.data.type="ORTHO"
    scene.render.image_settings.file_format="JPEG"
    scene.render.image_settings.quality=94
    for label,scale,target,dims in [
        ("whole",1.205,(.323,.164,.10),(1050,655)),
        ("hilt",.405,(.016,.020,.083),(840,760))]:
        camera.location=V(target)+V((-.12,-.65,1.95))
        point(camera,target)
        camera.data.ortho_scale=scale
        scene.render.resolution_x,scene.render.resolution_y=dims
        scene.render.resolution_percentage=100
        scene.render.filepath=str(DOC/(label+"-"+suffix+".jpg"))
        bpy.ops.render.render(write_still=True)


for edition,file in [("before","bell-court/hanger.glb"),("after","art-library/armoury/heron-hanger.glb")]:
    shoot(PUBLIC/file,edition)
