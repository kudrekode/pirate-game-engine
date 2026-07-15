# Golden Reference Animation Retargeting Spike

## Decision

Runtime retargeting is **conditionally viable for this exact Mixamo-to-
Quaternius pair as an isolated diagnostic/preview**, after applying an explicit
rest-frame transform profile. It is not a general retargeter and the generated
AnimationClip JSON is not a production asset.

The original `SkeletonUtils.retargetClip` result is rejected. Its raised and
displaced shoulders, arms, hands, and torso were a real deformation failure,
not harmless source style. The corrected V2 result passes the numeric gates and
manual inspection of Rest, Idle, and Walk at 0%, 25%, 50%, and 75% from front,
side, and three-quarter cameras. Shoulders remain below the neck, the torso and
limb chains remain coherent, and no mesh explosion is visible.

The corrected profile intentionally leaves finger and end/helper bones in the
target rest pose. Consequently, hands remain open and rigid through the clips.
That limitation is acceptable for feasibility but requires an offline authoring
pass before production use.

No clips were registered for the game editor, player, NPCs, or Three runtime.
The next production step remains a deterministic offline bake and GLB round
trip through the shared loader.

## Root Cause Of The Rejected V1 Result

Direct binding cannot work: none of the 52 animated FBX track targets exactly
match a Golden skeleton bone. A semantic name map is necessary, but a name map
alone is insufficient because the rigs use different rest frames and local
bone axes.

The rejected V1 experiment passed source global rotations directly through
`SkeletonUtils.retargetClip`, then derived target locals. It did not conjugate
the animation by the source and target rest transforms. At Idle 0%, the
resulting local rotations were already approximately 166-168 degrees from the
Golden clavicle rest rotations, 79-89 degrees at the upper arms, 166-169
degrees at the thighs, and 121-126 degrees at the feet. Those values explain
the visible shoulder and torso displacement.

This was not caused by corrupt bind data or scene scale:

- The FBX scene root, mesh, and armature transforms load as identity.
- The source loaded rest matrices agree with the inverse bind matrices to
  about `1.7e-6`; the target inverse binds agree with reconstructed rest
  matrices to about `4.5e-7`.
- Bone positions and segment lengths remained stable in V1. This proves why a
  bone-length-only test was a false quality signal: a skeleton can retain every
  joint length while rotating whole branches into anatomically invalid frames.

Seven supported `SkeletonUtils` option variants were tested: current defaults,
`preserveBoneMatrix: false`, `preserveBonePositions: false`,
`useTargetMatrix: true`, the matrix options combined,
`useFirstFramePosition: true`, and Y-only hip influence. Every variant produced
the same failed Idle clavicle deviation of `168.2357` degrees. The previously
mentioned `preserveHipPosition` setting is not a supported `SkeletonUtils`
option and has no effect.

Rejected comparison clips are retained only as diagnostic evidence:

```text
public/assets/derived/humanoid-animations/golden-reference-v0/diagnostics/failed-v1-idle.json
public/assets/derived/humanoid-animations/golden-reference-v0/diagnostics/failed-v1-walk.json
```

## Corrected Retarget Profile

Profile `mixamo-quaternius-rest-delta-v2` records the exact source and target
skeleton ids, a 22-bone map, ignored target bones, scale policy, root-motion
policy, and transform policy. It maps the principal deforming chains only:
pelvis, three spine bones, neck, head, and bilateral clavicle/arm/hand and
thigh/calf/foot/ball chains. Fingers, leaf bones, eyes, and source end helpers
remain unmapped.

For each source sample and mapped target bone, V2 computes the world-space
rest delta and converts it back through the animated target parent:

```text
targetAnimatedWorld =
  sourceAnimatedWorld * inverse(sourceRestWorld) * targetRestWorld
```

The opposite multiplication order was also inspected and rejected: it placed
the idle hands near shoulder height. The selected order places them beside the
hips while preserving the Golden skeleton's own rest frame. Target bone
translations stay at rest except for the pelvis. Pelvis X/Z is frozen in target
world space while Y is preserved, so the walk becomes in-place without hiding
vertical body motion.

| Gate | Rejected V1 Idle | Corrected V2 Idle | Corrected V2 Walk | Limit |
| --- | ---: | ---: | ---: | ---: |
| Max clavicle rotation from rest | 168.2357 deg | 22.1740 deg | 23.7857 deg | 45 deg |
| Max relative bone-length error | 1.11e-7 | 1.88e-7 | 1.71e-6 | 1e-5 |
| Max span / rest height | 0.9946 | 0.9892 | 0.9784 | 1.5 |
| Idle bilateral symmetry error | 0.1035 | 0.1107 | n/a | 0.15 |
| Post-policy horizontal root travel | 2.80e-11 | 2.81e-11 | 1.80e-9 | 1e-5 |
| Result | Fail | Pass | Pass | |

The walk contained about `1.650838` target metres of horizontal travel before
the in-place policy. Corrected output has 23 tracks per clip rather than V1's
65: 22 quaternion tracks plus pelvis position. Loop endpoint differences remain
below `0.001`.

Run the deterministic experiment and focused tests with:

```powershell
node tools/animation-retargeting/run-runtime-retarget-experiment.mjs
npm run test:retarget-spike
```

The complete machine-readable evidence is in:

```text
public/assets/derived/humanoid-animations/golden-reference-v0/runtime-retarget-report.json
public/assets/derived/humanoid-animations/golden-reference-v0/idle.runtime-retarget.json
public/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.runtime-retarget.json
```

All remain marked `experimental-runtime-retarget-diagnostic`.

## Browser Quality Evidence

The Asset Studio fixture exposes fixed Front, Side, and Three-quarter cameras,
Rest/Idle/Walk controls, and deterministic 0/25/50/75% seeking. It publishes
18-joint world transforms and precise skinned-mesh bounds for the Playwright
harness. The bounds gate uses overall extent and character height; raw axis
ratios are retained as diagnostics because comparing walk depth against a
nearly planar T-pose produces a misleading large ratio.

`npm run test:e2e:asset-studio` captures 30 images:

- three rejected V1 Idle 0% views;
- three corrected Rest views;
- corrected Idle and Walk at four sample times from all three views.

Manual inspection of all captures confirmed the V1 shoulder/torso failure and
the corrected V2 anatomy. The focused browser test additionally verifies
finite joint transforms, arm and leg segment lengths against Rest, shoulder
placement, hand reach, root stability, rest restoration, camera presets,
skinned bounds, and absence of binding, skeleton, WebGL, page, or console
errors. The run also writes `retarget-pose-diagnostics.json` beside the PNGs in
the Playwright result directory.

This evidence is deliberately stricter than a track-binding success message.
The browser summary still says "visual inspection required" because numeric
gates cannot certify deformation quality on their own.

## Source And Provenance

The workspace contains these immutable tracked inputs:

```text
public/assets/source/humanoid-animations/retarget-spike/Idle.fbx
public/assets/source/humanoid-animations/retarget-spike/Walking.fbx
public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf
```

| Asset | SHA-256 |
| --- | --- |
| `Idle.fbx` | `42f1b0d7b82337ded5d93412afdd2fff8a04727393a086afc4432a2c8ed102a0` |
| `Walking.fbx` | `17c86280998e4a948b37485d08a156b36798a82d22a3f3a34fa0de774926d56e` |
| Golden target glTF | `e7fcea214ecf8855afbf910b50de6f9c7d1decfb71ca28bad8a4481452dafeb4` |

The FBX directory has no `SOURCE.md` or `LICENSE.txt` sidecars. The request
identifies Adobe Mixamo as provider, but repository provenance does not
independently establish that. Add and verify source/licence records before any
derived redistribution.

Read-only inspection found 67 source bones rooted at `mixamorigHips`, 53
transform tracks per usable clip, an 8.333333-second/251-frame Idle, and a
1.033333-second/32-frame Walk at 30 fps. The FBX loader reports one empty take,
an unsupported shininess map, and vertices with more than four skin weights;
the experiment consumes only skeleton and animation data.

## Offline Bake Requirements

Blender was not executed: `BLENDER_PATH` is unset, `blender` is not on `PATH`,
and `retarget_golden_reference.py` does not exist. No baked or exported asset is
claimed.

An offline implementation must reproduce the V2 rest-frame profile, validate
source/target bind poses, align clavicle, arm, hand, thigh, and foot frames,
decide and document finger handling, bake target-local curves at source sample
times, apply the target-world pelvis policy, and validate both foot contact and
loop continuity. It must then export a GLB, re-import it through the shared GLTF
loader, verify hashes/metadata/clip bindings/clone independence/rest restore,
and repeat the same deterministic visual matrix.

Only a successful round trip can justify a canonical animation asset and game
registry mappings. Until then, runtime V2 remains a pair-specific feasibility
diagnostic rather than a production pipeline.
