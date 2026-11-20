# Golden Combat V2: preserved review candidate

Project-authored revision of the three Golden-native combat actions. The rig,
Idle/Walk, character GLBs, gameplay and controller are unchanged. V1 source and
published bytes remain preserved. This package uses a new cache/asset ID and URL;
`GoldenCombat_Attack_V1`, `GoldenCombat_Hit_V1`, `GoldenCombat_Death_V1` remain the
stable semantic clip names, independent of the bundle revision.

| Motion | Duration | Authored phases |
| --- | ---: | --- |
| Attack | 0.60 s | ready 0.08, load 0.15, hip lead 0.183, extension 0.233–0.267, retract 0.383, lowered guard 0.467, neutral 0.60 |
| Hit | 0.45 s | fast impact 0.05, lower-body catch 0.117, recovery overshoot 0.25, neutral 0.45 |
| Death | 1.65 s | recoil 0.067, buckle 0.25, tipping 0.433, accelerating fall 0.60, contact 0.767, settle 1.05, held through 1.65 |

`author.py` is the reproducible pose/timing source; `actions.blend` contains only
the unchanged 65-joint armature and three editable Actions. Curves are sampled at
60 Hz after deliberate acceleration, fast response and smooth recovery segments.
Attack retains 30 finger channels with a stronger proximal curl and opposing thumb.
Hit/Death retain the established 22 main-joint channel contract; unchanged channels
stay at their boundary pose rather than receiving decorative motion.

The authoring script measures the existing dressed canonical output to bake a
vertical pelvis floor envelope for Death. It excludes Blender importer helper
meshes. Attack/Hit ankle positions and foot orientations are solved geometrically
**during authoring**, then saved as ordinary joint rotations. No constraints,
solver, extra bones, meshes, materials or renderer objects ship. There is no
runtime IK, grounding or contact system. The final fall is authored for flat ground.

## Provenance and immutable references

The canonical rig is read from `experimental/authored-human-canonical-v1/candidate.blend`
(SHA-256 `7773ca3ee38eeb5ff168783d8753b7adb49c79499f273b050cd105f75763a63d`),
derived from the repository's Quaternius CC0 source. The neutral boundary samples
the existing accepted Golden Idle, whose Adobe Mixamo provenance is preserved at
`public/assets/source/humanoid-animations/retarget-spike/idle/`. No new external
motion was downloaded or retargeted. Existing body/outfit art and licences remain
with their original packages. The dressed GLB is read for authoring measurements
and is never saved or regenerated.

## Rebuild and inspect

From the repository root, with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python tools/blender-character/animations/golden-combat-v2/author.py -- tools/blender-character/animations/golden-combat-v2/actions.blend
node tools/blender-character/golden-combat-bake.mjs --revision v2 --list
node tools/blender-character/golden-combat-bake.mjs --revision v2
node --test tools/blender-character/golden-combat-roundtrip.test.mjs
node tools/blender-character/review-golden-combat.mjs --list
```

The bake runs two isolated exports, requires identical bytes, checks read-only
input hashes, and validates the production GLTFLoader round trip. Different bytes
cannot replace this published revision. Use a new source/output/cache revision
for subsequent motion edits. The CLI's explicit `--revision v1` retains V1's
original source, durations and export contract.

Start the ordinary root Vite server before the opt-in motion review. The viewer
plays all actions at real time, then records 30 Hz samples and phase screenshots
from gameplay scale, side, front-quarter and rear-quarter cameras. It explicitly
updates the skinned skeleton before each sampled render. It loads the actual GLB;
no rig or playback implementation is substituted in the game. Body selectors
reuse existing dressed artifacts and fail if those artifacts are missing.

See `GOLDEN_COMBAT_ANIMATION_POLISH_RESULT.md` for the visual review, comparisons,
actual gameplay evidence and limitations. Numerical validation is not visual approval.
