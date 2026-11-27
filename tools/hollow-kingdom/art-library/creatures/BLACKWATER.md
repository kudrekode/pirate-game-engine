# Blackwater Wyrm

The Blackwater Wyrm uses the Chapter One drake's joints and authored movement. Its continuous body joins the shoulders and hips to the trunk. Its rebuilt head has independently moving jaw and cheek lining, a tongue, orbital rims, individual teeth, layered cranial shields and curved, growth-ringed horns. The gill fans fold along weighted ribs. The hide has a packed pigment tile, scale normal map and anatomical vertex colours. The keratin surfaces share a third packed image.

Open `blackwater-wyrm.blend` in Blender 5.2 to work on the four named skinned meshes. The eight actions are in the Action Editor. The independent game asset is `public/assets/hollow-kingdom/art-library/creatures/blackwater-wyrm.glb`.

From the repository root, run the applicable command in PowerShell.

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
# Regenerate the source, reopen it, export and round-trip both game models.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/blackwater.py
# Publish edits from the existing .blend and repeat the checks.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/blackwater.py -- --export-only
# Photograph the original and upgraded GLBs with identical lights, camera and poses.
& $blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/creatures/render.py -- before after
```

| Final GLB | Measurement |
| --- | --- |
| Skeleton and scale | 23 joints, +Z forward, 1 metre per unit |
| Imported bounds | 1.631 m wide, 1.903 m high, 4.273 m long |
| Geometry | 37,834 triangles across seven skinned material groups |
| Gameplay motion | All eight source clip durations and sampled joint excursions agree to the recorded millimetre. Both windup/strike transitions pass the original matrix continuity check. |

The validator checks normalised weights, armature binding and exported pigment variation on each material group. The two render pairs use the re-imported meshes at walk frame 9 and bite-windup frame 22.

| View | Original | Blackwater |
| --- | --- | --- |
| Walking | [Whole body](../../../../docs/assets/art-library/creatures/before-whole.jpg) | [Whole body](../../../../docs/assets/art-library/creatures/after-whole.jpg) |
| Bite windup | [Head](../../../../docs/assets/art-library/creatures/before-head.jpg) | [Head](../../../../docs/assets/art-library/creatures/after-head.jpg) |

The broad gill fields, tongue and rows of dorsal shields still look regular in close-up. The original limb joint placement gives the hind ankle a sharp bend at this point in the walk. At arena distance the horn and gill silhouettes carry more information than the scale relief. The asset is intended for a single prominent enemy. [Round-trip measurements](../../../../docs/assets/art-library/creatures/roundtrip.json)
