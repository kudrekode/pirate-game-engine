"""Mesh-free one-action Golden library, using the established export settings."""
import bpy, sys
from pathlib import Path
source,output=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=str(Path(source).resolve()))
a=next(o for o in bpy.data.objects if o.type=='ARMATURE')
assert {x.name for x in bpy.data.actions} == {'GoldenBow_Fire_V1'}
assert len(a.data.bones)==65
for b in a.pose.bones:b.matrix_basis.identity()
a.animation_data.action=None
bpy.ops.object.select_all(action='DESELECT'); a.select_set(True); bpy.context.view_layer.objects.active=a
bpy.ops.export_scene.gltf(filepath=str(Path(output).resolve()),check_existing=False,
 export_format='GLB',use_selection=True,export_animations=True,
 export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=False,
 export_optimize_animation_size=False,export_anim_slide_to_zero=True,
 export_skins=True,export_morph=False,export_materials='NONE',export_yup=True,
 export_cameras=False,export_lights=False,export_def_bones=False)
