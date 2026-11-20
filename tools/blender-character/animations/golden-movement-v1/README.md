# Golden Movement V1

Four project-authored, in-place motions for the unchanged `golden-humanoid-v0` rig.
Character GLBs, the canonical source, accepted Idle/Walk and combat libraries remain
unchanged. This is a separate source package and a mesh-free animation library.

| Motion | Exact clip | Duration | Presentation |
| --- | --- | ---: | --- |
| Run | `GoldenMovement_Run_V1` | 40/60 s | Forward lean, opposing arm swing, stance/swing feet, lifted recovery knee |
| Jump | `GoldenMovement_Jump_V1` | 18/60 s | Short compression, extension and early airborne pose |
| Fall | `GoldenMovement_Fall_V1` | 36/60 s | Relaxed bent limbs and restrained torso motion; looping |
| Land | `GoldenMovement_Land_V1` | 13/60 s | Compression and recovery; gameplay keeps moving |

`author.py` contains the poses and timing, sampled at 60 Hz into ordinary LINEAR
keys. Its offline ankle solver follows the established combat-authoring method.
Run has a full stance/swing cycle and is not accelerated Walk. A measured floor
envelope uses the existing dressed canonical output; it does not regenerate it.
`actions.blend` contains only the original 65-bone armature and four editable Actions.
There are no constraints, extra bones, meshes, materials or runtime solvers.

Gameplay owns the jump trajectory and horizontal travel. Skeletal pelvis motion
is vertical only. Golden's exported armature rotates local pelvis Z into world Y;
the validator checks both the channel frame and sampled world-space pelvis travel.
Run/Fall loop seams, exact channel names/durations, finite deformation, identical
rest/hierarchy, independent clones and restoration are checked after GLTFLoader import.

## Provenance

The rig is read from `experimental/authored-human-canonical-v1/candidate.blend`,
SHA-256 `7773ca3ee38eeb5ff168783d8753b7adb49c79499f273b050cd105f75763a63d`,
derived from the existing Quaternius CC0 source. The neutral pose samples the
accepted Golden Idle, whose original Mixamo provenance remains with
`public/assets/source/humanoid-animations/retarget-spike/idle/`.
No new external animation was downloaded. Existing body/outfit licences remain
with their original source packages. Published metadata records read-only hashes.

## Reproduce and review

From the repository root, using Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python tools/blender-character/animations/golden-movement-v1/author.py -- tools/blender-character/animations/golden-movement-v1/actions.blend
node tools/blender-character/golden-movement-bake.mjs --list
node tools/blender-character/golden-movement-bake.mjs
node --test tools/blender-character/golden-movement-roundtrip.test.mjs
node tools/blender-character/review-golden-movement.mjs --list
node tools/blender-character/review-golden-movement.mjs --body athletic
```

The bake performs two isolated exports, requires byte identity, validates the
production GLTFLoader round trip and refuses to replace published differing bytes.
Use a new revision for future changes. No character compile is part of this command.

The opt-in art review requires root Vite on 5173 and existing dressed artifacts.
Select `athletic`, `broad`, `fuller` or `canonical` explicitly. It plays real-time
motion and captures dense samples and six phases from gameplay scale, side,
front-quarter and rear-quarter views. It updates skinned skeletons for every sample.
No mutation hooks are added to the game. Review evidence and limitations are in
[`MOVEMENT_V2_RESULT.md`](../../../../MOVEMENT_V2_RESULT.md).
