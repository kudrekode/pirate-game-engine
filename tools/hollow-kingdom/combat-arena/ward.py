"""A held outside ward and short blade recoil on the original Golden armature."""
import importlib.util
from pathlib import Path
import sys
import bpy

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("pose", ROOT / "tools/blender-character/animations/golden-movement-v1/author.py")
pose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pose)
path = ROOT / "public/assets/hollow-kingdom/bell-court/ward.glb"
bpy.ops.wm.open_mainfile(filepath=str(pose.CANONICAL))
arm = pose.ARM = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
for bone in arm.pose.bones:
    bone.matrix_basis.identity()
    bone.rotation_mode = "QUATERNION"
action = bpy.data.actions.new("OutsideWard")
arm.animation_data_create()
arm.animation_data.action = action
# Upper-body tracks leave the lower body's stance to the locomotion mixer.
for frame, recoil in [(0,0),(4,1),(12,.16),(19,0)]:
    rotations = pose.pose({}, {
        "spine_02": (-3-recoil*3,0,-6+recoil*4), "neck_01": (2,0,5),
        "upperarm_r": (-63-recoil*10,-61,-19), "lowerarm_r": (0,0,95-recoil*8),
        "hand_r": (-4+recoil*9,0,-24), "upperarm_l": (-22,57,8),
        "lowerarm_l": (0,0,-85), "hand_l": (8,0,4),
    },.56)
    for name,rotation in rotations.items():
        bone = arm.pose.bones[name]
        bone.rotation_quaternion = rotation
        bone.keyframe_insert(data_path="rotation_quaternion",frame=frame,group=name)
bpy.context.scene.render.fps = 60
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format="GLB",
                         export_animation_mode="ACTIONS",export_force_sampling=False,
                         export_anim_slide_to_zero=True,export_optimize_animation_size=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))
assert any(a.name.startswith("OutsideWard") and a.frame_range.length > 0 for a in bpy.data.actions)
