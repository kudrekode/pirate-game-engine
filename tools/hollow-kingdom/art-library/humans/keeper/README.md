# Edric, keeper of Bell Court

Edric's field harness has a drawn sallet and ocular slit, a raised bevor, a lapped gorget, a fluted breastplate with a madder-and-latten bell badge, split tassets and articulated arm and leg plates. Soft gloves preserve the individual moving fingers. The sword is still separate equipment.

The final actor is `public/assets/hollow-kingdom/art-library/humans/keeper/keeper.glb`. The editable, packed `keeper.blend` beside this file holds five named pattern groups. Colour and metallic/roughness texture sources are also included. The runtime actor combines the patterned armour into one skinned primitive.

## Rebuild

Run with Blender 5.2 from the repository root. The first command rebuilds the packed source and exports it. The second exports edits from the current Blender scene. This recipe reads the original Bell Court keeper and shares geometry utilities with the ferryman. It can run independently of the ferryman build and uses none of its generated files.

```sh
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/keeper/keeper.py
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/keeper/keeper.py -- --export-only
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/keeper/check.py
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/keeper/plates.py -- before after
```

## Evidence

`docs/assets/art-library/humans/keeper/` contains matched full-height ward and strike views and a close ward portrait, re-imported from the two actual GLBs with identical studio setups. The hanger uses the game's local socket transform. The ward overlays the Golden idle stance and takes its finger grip from the attack clip. The strike uses the external Golden sword action.

Re-exporting the saved Blender scene reproduced the checked-in GLB byte for byte. The adjacent validation JSON records the packed GLB's topology, image count, joint and bind-matrix checks, and movement measured on the exported armour. It compares all five right-hand fingertips and the weapon attachment matrix against the original actor across three ward and four sword-attack samples. The check reimports the actual hanger too.

Edric still uses the original unanimated facial features behind the narrow visor. The eye slit and laminated armour read best from the front and three-quarter angles. The surfaces use a baked colour, metal and roughness atlas, with the roll and flute shapes in geometry. The weapon keeps its inherited grip. In the close ward pose the index and middle fingertips sit slightly open around the handle. The raised-arm strike exposes the dark lining at the shoulder opening. The clothing, straps and plates use skin weights, with no secondary cloth or plate simulation. The inherited human base is derived from the Quaternius Universal Base Characters Kit. Its licence is in `public/assets/source/quaternius/License_Standard.txt`.
