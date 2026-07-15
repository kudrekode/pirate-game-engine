# Golden Reference Animation Retargeting Spike

## Decision

Animation retargeting from the supplied Mixamo FBX clips to the Quaternius
Golden Reference Humanoid is technically feasible, but the result is an
experimental preview, not a production asset pipeline.

- Direct playback is not viable: none of the 52 animated source targets bind
  to the Golden skeleton by exact name.
- Three.js `SkeletonUtils.retargetClip` with a deterministic 64-bone semantic
  map produces finite, target-bound idle and walk clips. Two clones keep
  independent skeleton and mixer state, and returning to rest restores the
  bind pose.
- Browser playback on the real Golden mesh is coherent and does not explode.
  Idle reads naturally and walk reads as a plausible stride, although shoulder
  and hand/finger posture still needs offline authoring polish.
- Runtime retargeting is suitable for this feasibility fixture. The recommended
  production direction remains deterministic offline baking at the Asset
  Studio compiler/import boundary, followed by a canonical GLB round trip.

The experimental clips are intentionally not registered in the game editor or
Three runtime. Their JSON representation is large, browser-specific diagnostic
data and is not accepted by the existing registry's GLTF/GLB animation loader.
Promoting them would imply a production artifact that has not been baked or
round-trip validated.

## Source And Provenance

The continuation brief named nested `idle/source.fbx` and `walk/source.fbx`
paths with licence sidecars. The workspace actually contains these immutable,
tracked files:

```text
public/assets/source/humanoid-animations/retarget-spike/Idle.fbx
public/assets/source/humanoid-animations/retarget-spike/Walking.fbx
```

No `SOURCE.md` or `LICENSE.txt` sidecars are present in that source directory.
The brief identifies Adobe Mixamo as the provider, but this cannot be
independently verified from repository provenance. The source files were not
renamed, normalized, or rewritten.

SHA-256 evidence:

| Asset | SHA-256 |
| --- | --- |
| `Idle.fbx` | `42f1b0d7b82337ded5d93412afdd2fff8a04727393a086afc4432a2c8ed102a0` |
| `Walking.fbx` | `17c86280998e4a948b37485d08a156b36798a82d22a3f3a34fa0de774926d56e` |
| Golden target glTF | `e7fcea214ecf8855afbf910b50de6f9c7d1decfb71ca28bad8a4481452dafeb4` |

Before distribution outside this repository, add the missing source and
licence records and verify that derived redistribution is permitted.

## Read-Only Inspection

The inspector supports FBX, GLB, and glTF without adding a second FBX parser:
it uses the installed Three.js `FBXLoader` in a tooling-only Node environment.

```powershell
node tools/animation-retargeting/inspect-animation-source.mjs `
  public/assets/source/humanoid-animations/retarget-spike/Idle.fbx `
  public/assets/source/humanoid-animations/retarget-spike/Walking.fbx
```

Pass `--output-dir <directory>` to emit machine-readable reports. The committed
reports are:

```text
public/assets/derived/humanoid-animations/golden-reference-v0/diagnostics/idle-source.json
public/assets/derived/humanoid-animations/golden-reference-v0/diagnostics/walking-source.json
```

Both files contain 122 traversed scene nodes and the same primary `Body`
skeleton: 67 bones rooted at `mixamorigHips`. Three.js normalizes the loaded
scene to +Y up; the FBX loader does not expose the raw source-axis metadata.
The reported unit scale is 1, while the approximately 209-unit hip height
compared with the target's 0.949-unit pelvis height confirms that explicit
scale handling is required.

| Finding | Idle | Walk |
| --- | ---: | ---: |
| Non-empty clip duration | 8.333333 s | 1.033333 s |
| Frame rate / frames | 30 / 251 | 30 / 32 |
| Transform tracks | 53 | 53 |
| Position / rotation / scale tracks | 1 / 52 / 0 | 1 / 52 / 0 |
| Source horizontal net displacement | 0 | about 363.791 source units |
| Source vertical excursion | about 0.324 | about 15.395 source units |

Each FBX also contains an empty `Take 001`; it is ignored. The idle pelvis has
small natural horizontal excursion but returns to its start. Despite its
“In Place” source label, the walk contains significant forward locomotion and
must be neutralized only in a derived artifact.

`FBXLoader` reports an unsupported shininess texture map and vertices with more
than four skin weights. These warnings describe the imported source; the spike
uses only its skeleton and animation data.

## Compatibility Experiments

### A. Direct binding

Direct compatibility fails deterministically. Of 52 animated source target
names, zero exist on the Golden skeleton. There are zero exact skeleton-name
matches and only one case-insensitive/punctuation-normalized match (`Head`).
Aliases cannot resolve the different rest orientations, scale, and local bone
axes: measured paired rest-quaternion differences include approximately 106.4°
at hips/pelvis, 160–161° at shoulders/clavicles, 94–95° at upper arms, and
roughly 180° at thighs and toe bases.

### B. Three.js runtime retargeting

`tools/animation-retargeting/humanoid-retargeting-experiment.mjs` defines
mapping version `mixamo-quaternius-v1`. It maps 64 source bones to the Golden
pelvis, spine, head, limbs, feet/toes, hands, and complete finger chains. The
unmapped source bones are `mixamorigHeadTop_End`, `mixamorigLeftEye`, and
`mixamorigRightEye`; the intentionally unmapped target bone is `root`. All
mapped source and target bones exist.

The experiment creates isolated source and target rigs, computes the
source-to-target hip scale ratio (`0.004537874318057981`), calls the installed
`SkeletonUtils.retargetClip`, and validates the result without mutating either
FBX. Derived results are:

| Result | Idle | Walk |
| --- | ---: | ---: |
| Target-bound tracks | 65 | 65 |
| Duration | 8.333333 s | 1.033333 s |
| Maximum loop endpoint difference | 0.000671 | 0.000649 |
| Pre-policy horizontal locomotion | negligible | about 1.650838 target metres |
| Post-policy horizontal locomotion | zero | effectively zero |

The root policy is `freeze target-world pelvis X/Z; preserve target-world
pelvis Y`. Neutralizing pelvis-local X/Z was tested and rejected because the
target's rotated pelvis basis moved source-forward motion into local Y. Applying
the policy in target world space removes locomotion while retaining vertical
body motion. This is a presentation policy only; it does not change grid
movement or `RuntimeSession` state.

Run and regenerate the deterministic experiment with:

```powershell
node tools/animation-retargeting/run-runtime-retarget-experiment.mjs
npm run test:retarget-spike
```

Artifacts:

```text
public/assets/derived/humanoid-animations/golden-reference-v0/idle.runtime-retarget.json
public/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.runtime-retarget.json
public/assets/derived/humanoid-animations/golden-reference-v0/runtime-retarget-report.json
```

They are explicitly marked `experimental-runtime-retarget-diagnostic`. The
uncompressed AnimationClip JSON sizes are about 2.32 MB for idle and 0.29 MB
for walk, which is another reason not to treat this representation as the
canonical shipping format.

### C. Blender offline bake

Experiment C was not executed. `BLENDER_PATH` is unset and `blender` is not on
`PATH`; the repository intentionally has no compiler or retarget exporter that
could truthfully claim a verified GLB.

Once a deterministic retarget script exists and Blender is available, the
remaining command boundary is:

```powershell
& $env:BLENDER_PATH --background `
  --python tools/blender-character/retarget_golden_reference.py `
  -- `
  --idle public/assets/source/humanoid-animations/retarget-spike/Idle.fbx `
  --walk public/assets/source/humanoid-animations/retarget-spike/Walking.fbx `
  --target "public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf" `
  --output-dir public/assets/derived/humanoid-animations/golden-reference-v0/blender
```

`retarget_golden_reference.py` is a specified next implementation, not a file
present in this spike. It must reproduce mapping version
`mixamo-quaternius-v1`, align rest poses, bake target-local actions at the
source frame rate, apply the same world-space in-place policy, export a GLB,
record Blender/version/hash metadata, and fail unless the exported artifact
round trips through the shared GLTF loader.

## Asset Studio And Browser Evidence

The read-only Golden Reference fixture now loads the two experimental
AnimationClip JSON files after cloning the real target through the shared
loader/cache/`SkeletonUtils` path. Presentation owns one mixer per clone and
offers Rest, Idle, Walk, and Play/Pause controls. Switching to Rest calls
`Skeleton.pose()`, and state changes do not enter recipe, `GameProject`, or
`RuntimeSession` data.

The focused Playwright test verifies real WebGL playback, advancing mixer time,
changing pose values, pause/resume, stable pelvis X/Z during walk, rest-pose
restoration, orbit and reset controls, and absence of page, track-binding,
skeleton, or WebGL errors. It captures idle and walk from two rear/three-quarter
views under the test result directory. Visual inspection found a coherent,
recognizable character with a plausible idle and stride and no exploding mesh
or obvious foot translation through the scene. The evidence is not a
production quality bar: shoulder/hand/finger posture is somewhat awkward, and
front/side deformation plus foot-contact/sliding still need a deliberate
offline review.

Run the browser proof with:

```powershell
npm run test:e2e:asset-studio
```

## Production Recommendation

Keep runtime retargeting isolated as a diagnostic and implement offline baking
at the Asset Studio compiler/import boundary. A baked animation-only GLB is
preferred if its target-bone tracks bind reliably through the shared loader;
otherwise use one canonical Golden Reference GLB containing mesh and clips and
document the duplication cost. In either case, validate source hashes,
metadata, clip durations, in-place policy, loop continuity, clone independence,
rest restoration, and visual deformation after export and re-import.

Only after that round trip should the same canonical clips be registered for
the Asset Studio fixture, Three editor preview, player, and NPC runtime paths.
Patchbeard defaults and gameplay semantics must remain unchanged.
