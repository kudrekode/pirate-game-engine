# Golden Reference Animation Retargeting Spike

## Status

Implementation is blocked at the source-asset gate. On 2026-07-15 the
repository contained the Quaternius Golden Reference Humanoid and the existing
Patchbeard demo animation files, but it did not contain the required genuine
idle and walk sources under the immutable vendor/source asset tree. The task
attachment contained only the implementation brief. Blender was not available
on `PATH`.

No direct-playback, runtime-retargeting, offline-retargeting, registry, preview,
editor, or runtime claim is made by this document. In particular, the existing
Patchbeard walk is not substituted for the missing supplied pair and no fake
idle data is generated.

## Required Source Layout

Keep each supplied clip and its provenance separate so the two clips may come
from different sources or licences:

```text
public/assets/source/humanoid-animations/retarget-spike/
  idle/
    source.glb
    LICENSE.txt
    SOURCE.md
  walk/
    source.glb
    LICENSE.txt
    SOURCE.md
```

`source.glb` is preferred because it is self-contained and can be inspected by
the same glTF tooling used by the engine. A glTF source is also accepted by
renaming the entry file to `source.gltf` and placing every referenced `.bin`
and texture beside it without changing the vendor files. FBX or BVH may be
retained as additional original source files, but a glTF/GLB export from the
same unmodified source must accompany them for the browser/runtime feasibility
experiments and the repository inspection command. Do not overwrite or
normalize anything in this directory.

Each `SOURCE.md` must record the original download page or supplier, original
file name, author/provider, acquisition date, clip identity, and any conversion
already performed before the file entered this repository. Each `LICENSE.txt`
must contain the applicable licence text or an exact durable licence reference.

## Clip Requirements

- One genuine stationary idle and one genuine locomotion walk clip.
- A skinned humanoid source skeleton with named bones and a complete hierarchy.
- Non-zero clip duration and actual transform keyframes; a bind-pose frame is
  not an idle animation.
- Consistent units, up/forward axes, frame rate, and source rest/neutral pose
  must be documented or discoverable.
- Walk root translation is allowed because the spike must measure it, but it
  must not be silently removed in the vendor copy.
- The clips must permit modification/retargeting and distribution of the
  derived test artifacts under their licences.
- Password-protected, Draco-compressed, or otherwise externally dependent
  sources are not suitable unless the repository already contains the required
  decoder and all dependencies.

## Inspection Command

The read-only inspector accepts glTF 2.0 `.glb` and `.gltf` files and reports
the skeleton hierarchy, complete joint names, local rest transforms, clip names
and durations, track/keyframe counts, and root/pelvis translation candidates:

```powershell
node tools/animation-retargeting/inspect-animation-source.mjs `
  "public/assets/source/humanoid-animations/retarget-spike/idle/source.glb" `
  "public/assets/source/humanoid-animations/retarget-spike/walk/source.glb"
```

Run the target through the same inspector for comparison:

```powershell
node tools/animation-retargeting/inspect-animation-source.mjs `
  "public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf"
```

The command deliberately reports raw evidence. A named root translation track
is only a root-motion candidate; the report does not judge deformation quality
or claim compatibility. Sparse animation accessors are rejected explicitly
rather than being misreported.

## Current Target Findings

The target is glTF 2.0 with 69 nodes, one 65-joint skin, three skinned meshes,
and no animation clips or morph targets. Its visual bind/rest pose is a T-pose.
The hierarchy begins `root -> pelvis -> spine_01 -> spine_02 -> spine_03`, then
branches to `neck_01 -> Head`, the left/right clavicle-arm-hand-finger chains,
and the left/right thigh-calf-foot-ball chains. The complete names and local
rest transforms are emitted by the inspection command and are also guarded by
`src/runtime/three/goldenReferenceHumanoid.test.ts`.

The names do not match the provisional `humanoid-v1` contract (`Root`, `Hips`,
`Spine`, and so on) or Patchbeard's `Hips`-targeted clips directly. Aliases may
solve track lookup, but cannot by themselves prove compatibility across a
different hierarchy, T-pose versus another neutral pose, bone-local axes,
orientation, or proportions.

The installed Three.js version includes `SkeletonUtils.retargetClip`, but the
repository currently uses `SkeletonUtils` only for skeleton-safe cloning. The
existing character animation controller validates direct track targets, clones
clips before neutralizing horizontal `Hips` motion, creates one mixer per
rendered clone, and maps Patchbeard walk/attack/defeated clips. It intentionally
uses rest pose for Patchbeard idle. No runtime retargeting utility is currently
integrated.

## Remaining Implementation Plan

1. Inspect both supplied sources and commit their raw JSON reports, including
   hierarchy, bones, rest transforms, clips, durations, track counts, and root
   translation evidence.
2. Build a renderer-independent diagnostic mapping module (data plus pure
   diagnostics, not UI constants). Measure exact-name and alias matches,
   unmatched bones, parent/hierarchy differences, and rest-pose/orientation
   deltas. Evaluate direct playback without keeping it if bindings or visible
   deformation fail.
3. Isolate an experimental Three.js `SkeletonUtils.retargetClip` path. Clone
   source and target skeletons, use an explicit deterministic mapping, avoid
   cached-source mutation, create per-instance mixers through the existing
   animation controller architecture, and validate at least two independent
   clones visually and programmatically.
4. Add a scriptable Blender Python bake when Blender is available: import
   source and immutable target, align rest poses, apply the same mapping, bake
   target-local actions, strip horizontal locomotion from the derived walk,
   and export only under
   `public/assets/derived/humanoid-animations/golden-reference/`. Record source
   hashes, Blender version, mapping version, frame rate, duration, and root
   policy in adjacent metadata and logs.
5. Round-trip the derived artifact through the shared loader and
   `SkeletonUtils` clone path. Prefer an animation-only GLB library if track
   binding remains reliable; otherwise use one canonical Golden Reference GLB
   containing the mesh plus the two baked clips and document the duplication
   cost.
6. Only after visible and programmatic deformation validation, register the
   Golden Reference as an explicit animated fixture. Reuse the existing mixer
   semantic states in Asset Studio, the Three runtime, and supported editor
   previews; do not change Patchbeard defaults or gameplay state.
7. Add focused mapping, immutability, clone independence, state transition,
   cleanup, shared preview, Asset Studio, runtime/editor, and browser tests. The
   browser proof must capture advancing animation time and non-pixel-perfect
   frame change while preserving orbit/reset controls and reporting real clip
   diagnostics.

The architectural recommendation remains provisional until the genuine clips
are tested. The expected production direction is deterministic offline baking
at the Asset Studio compiler/import boundary, with canonical target-skeleton
clips reused by all Three.js surfaces; runtime retargeting should remain an
isolated feasibility experiment unless evidence shows offline baking cannot
provide the required reusable artifact.
