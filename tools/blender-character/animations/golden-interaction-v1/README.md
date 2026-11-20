# Golden Interaction V1

Two project-authored full-body actions on the unchanged 65-bone Golden rig:

| Semantic action | Clip | Duration |
| --- | --- | ---: |
| Interact | `GoldenInteraction_Interact_V1` | 0.60 s |
| Pickup | `GoldenInteraction_Pickup_V1` | 0.80 s |

`author.py` reads the canonical source and accepted Idle pose. It reuses the
existing movement author's offline rotation, sampling and planted-ankle helpers.
The reach leads through the shoulder and torso, extends a relaxed right hand,
briefly settles and recovers. Pickup lowers the pelvis with planted ankles, bends
the knees and spine, reaches down in front, then recovers. Finger curl is restrained.
The editable `actions.blend` contains only the armature and two Actions. Ordinary
60 Hz linear joint keys and vertical pelvis travel ship; no runtime solver,
constraints, meshes, character regeneration or horizontal root motion is added.

The rig derives from the existing Quaternius CC0 canonical source, SHA-256
`7773ca3ee38eeb5ff168783d8753b7adb49c79499f273b050cd105f75763a63d`.
The neutral reference is the accepted Golden Idle; its existing Mixamo provenance
remains under `public/assets/source/humanoid-animations/retarget-spike/idle/`.
No external motion was downloaded. Character, clothing and accepted animation
inputs remain unchanged. Published metadata records source and reference hashes.

From the repository root, with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python tools/blender-character/animations/golden-interaction-v1/author.py -- tools/blender-character/animations/golden-interaction-v1/actions.blend
node tools/blender-character/golden-interaction-bake.mjs --list
node tools/blender-character/golden-interaction-bake.mjs
node --test tools/blender-character/golden-interaction-roundtrip.test.mjs
node tools/blender-character/review-golden-interaction.mjs --list
node tools/blender-character/review-golden-interaction.mjs --body athletic
```

Bake requires two identical isolated exports and a production GLTFLoader round
trip: exact clips/channels, Golden hierarchy/rest, neutral recovery, finite
deformation, horizontal root stability, held pose and independent clones. Differing
published bytes require a new revision. Use `--output-dir test-results/...` for
future unpublished review candidates. The art reviewer needs root Vite on 5173;
select `athletic`, `broad`, `fuller`, `canonical`, or `chest` explicitly. It reuses
existing dressed artifacts and captures six phases plus timed 30 Hz samples from
four cameras. `chest` reviews the real Kenney `open` clip, not a fabricated lid.

The final assessment and limits are in
[`INTERACTION_ANIMATION_PROPS_V1_RESULT.md`](../../../../INTERACTION_ANIMATION_PROPS_V1_RESULT.md).
