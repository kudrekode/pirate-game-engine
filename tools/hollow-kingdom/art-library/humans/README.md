# Oswin of Merewatch

The ferryman wears a short ochre reefer coat, a crossed blue-green shoulder cape, stitched deck cap and welted boots. His belt carries a coil of line and a drawstring purse. The cap, beard and weathered face remain visible in the well conversation. The source keeps the garment pieces independently named and skinned.

## Use and rebuild

The final model is `public/assets/hollow-kingdom/art-library/humans/oswin.glb`. It uses the same metre scale, origin, joint hierarchy, hand sockets and external Golden animation clips as the original ferryman. The GLB embeds its textures. The self-contained Blender scene is `tools/hollow-kingdom/art-library/humans/oswin.blend`.

Run from the repository root with Blender 5.2. Rebuild one model and its packed source with the first command. After editing the existing Blender file, use the second command to export those changes. The full rebuild regenerates the packed scene from the original ferryman, the original Golden idle action and the authored pattern and paint scripts.

```sh
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/oswin.py
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/oswin.py -- --export-only
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/verify.py
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/studio.py -- before after
blender -b -t 3 --python-exit-code 1 -P tools/hollow-kingdom/art-library/humans/studio.py -- before after --walk
```

The main comparison uses frame 12 of the shared Golden idle clip. The walking side view uses frame 7 of the shared in-place walk. Each plate opens the actual corresponding GLB in a fresh Blender scene and uses the same orthographic camera, Cycles lighting and exposure. The originals and final plates are under `docs/assets/art-library/humans/`. Re-exporting the saved Blender scene reproduced the final GLB byte for byte. The adjacent validation JSON reports measured movement of the exported clothing, render primitive count and the largest bind-matrix difference against the original.

## Construction and remaining limitations

The coat, trousers, boot lasts, braid, cap, beard and cape are original pattern meshes. The cloth atlas bakes herringbone, woven binding, check and hide grain. The cape was fitted to the coat and sleeves during the actual idle pose and transformed back into bind space. The same skeleton drives it in game. The underlying head, eyes, hands and rig come from the shipped Quaternius-derived Golden character. The skin treatment uses the existing head UVs. The licence is in `public/assets/source/quaternius/License_Standard.txt`.

The close portrait retains the angular base face and simplified eyelids. The beard clumps are baked geometry and the ferryman has no facial animation. The rope and short cape follow skeleton weights, with no simulated secondary motion. The sampled idle and walk cover his normal NPC use. Extreme arm lifts and crouches remain outside this visual acceptance pass. A small area of ochre fabric remains visible high on his right shoulder in the side pose.
