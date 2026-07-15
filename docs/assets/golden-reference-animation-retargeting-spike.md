# Golden Reference Animation Retargeting Spike

## Decision

The deterministic offline-baking milestone passes for the exact Adobe Mixamo
to Quaternius Golden Reference skeleton pair. Blender 5.2 genuinely imports the
immutable FBXs and target glTF, applies the accepted V2 world-space rest-frame
delta to 22 principal bones, bakes target-local actions, and exports two
canonical target GLBs. Both files are byte-for-byte deterministic across two
isolated passes, reload through the production Three.js loader, contain only
the 65-joint Golden skeleton, and animate independent skeleton-safe clones.

Asset Studio now uses these offline-baked GLBs by default. Runtime V2 JSON is
retained only behind `?retarget=runtime-v2`; the rejected V1 comparison remains
behind `?retarget=failed-v1`. A baked load failure is surfaced and never
silently falls back to runtime retargeting.

The baked idle and walk sources are registered for the Golden Reference in the
shared Three animation contract. Patchbeard remains the default character and
gameplay movement remains authoritative. This is a proven pair-specific
compiler profile, not a general humanoid retargeter.

## Immutable Sources And Provenance

The genuine vendor downloads were moved without changing their bytes:

| Clip | Canonical source | SHA-256 before and after |
| --- | --- | --- |
| Idle | `public/assets/source/humanoid-animations/retarget-spike/idle/source.fbx` | `42f1b0d7b82337ded5d93412afdd2fff8a04727393a086afc4432a2c8ed102a0` |
| Walk | `public/assets/source/humanoid-animations/retarget-spike/walk/source.fbx` | `17c86280998e4a948b37485d08a156b36798a82d22a3f3a34fa0de774926d56e` |

The old top-level `Idle.fbx` and `Walking.fbx` paths no longer exist. Each
canonical directory contains project-maintained `SOURCE.md` and `LICENSE.txt`
records. They identify Adobe Mixamo, the original filename, download date and
settings, intended use, and current-licence pointer; they explicitly do not
claim to be Adobe-supplied text.

`source-provenance.mjs` validates known provider, required fields, FBX Binary
signature, exact immutable hash, and both sidecars. It rejects missing or
changed binaries, unknown providers, incomplete records, and non-FBX content.
Run it with:

```powershell
npm run validate:golden-animation-sources
```

Read-only inspection reports 67 source joints rooted at `mixamorigHips`, an
8.333333-second/251-frame Idle, and a 1.033333-second/32-frame Walk at 30 fps.
The target hashes are:

- glTF: `e7fcea214ecf8855afbf910b50de6f9c7d1decfb71ca28bad8a4481452dafeb4`
- buffer: `459003f9745853ae562a85506a2b94dd56515c1f37728f9fa3d2ce1a3e4cd92f`

## Why V1 Was Rejected

Direct playback is impossible because 0 of the 52 animated Mixamo track names
bind to Golden bones. A semantic name map alone was also insufficient: the
rigs have different rest frames and local axes. The initial
`SkeletonUtils.retargetClip` experiment omitted the rest-frame conjugation and
reached `168.2357` degrees of clavicle deviation. Seven supported option
variants produced the same anatomical shoulder and torso failure.

The accepted runtime V2 diagnostic instead computes:

```text
targetAnimatedWorld =
  sourceAnimatedWorld * inverse(sourceRestWorld) * targetRestWorld
```

It then converts through the animated target parent. V2 passed finite-value,
bounds, symmetry, chain-length, root-policy, clone-independence, and rest-
restoration checks, with maximum clavicle deviations of `22.1740` degrees for
Idle and `23.7857` degrees for Walk. That result is the reference for the
offline bake.

## Versioned Blender Profile

`tools/blender-character/profiles/mixamo-to-quaternius-v2.json` formalises the
pair as profile `mixamo-to-quaternius-v2`. It records:

- source and target ids, joint counts, roots, hashes, and required bones;
- the exact 22-bone pelvis/spine/head/arm/hand/leg/foot/ball mapping;
- ignored source eyes, fingers, and end helpers;
- ignored target fingers, twists/helpers, leaf bones, and root;
- V2 world-space rest-delta strategy;
- target-rest translation and scale policy;
- orientation and 30 fps sampling policy;
- in-place pelvis policy and known limitations.

Finger and helper bones intentionally remain in target rest pose. The visible
limitation is rigid, open hands.

## Headless Compiler

The discovered executable is
`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, version
`5.2.0 LTS`, build `fbe6228777e7`.

`golden-animation-bake.mjs` discovers Blender from an explicit argument,
`BLENDER_PATH`, `PATH`, or conventional Windows locations. It invokes:

```text
blender --background --factory-startup --python-exit-code 1
  --python tools/blender-character/retarget_golden_reference.py --
  --source <canonical source.fbx>
  --target <Superhero_Male_FullBody.gltf>
  --clip <idle|walk>
  --output <derived .glb>
  --profile tools/blender-character/profiles/mixamo-to-quaternius-v2.json
  --profile-version mixamo-to-quaternius-v2
  --frame-rate 30
  --root-motion-policy <profile policy>
  --metadata <metadata.json>
  --diagnostics <diagnostics.json>
```

Convenience commands are:

```powershell
npm run bake:golden-animation -- idle "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
npm run bake:golden-animation -- walk "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
```

Each command starts clean, validates the 67- and 65-joint armatures and profile,
imports the real sources, bakes only the target action from frame zero, freezes
target-world pelvis X/Z while preserving Y, removes all source objects/actions,
exports the complete target, and proves the source hash is unchanged. Two
passes run in separate temporary directories and staging is always removed.

## Artifacts And Determinism

Actual loading favoured a full target GLB per clip. This duplicates the 3
meshes, 3 materials, and 7 embedded textures, but it is proven through the
normal `GLTFLoader` and clone path. Animation-only reuse was not selected
because reliable binding through the current loader contract has not been
demonstrated. A combined two-clip library is a future size optimisation, not a
condition of this feasibility milestone.

| Artifact | Frames / duration | SHA-256 | Normalized animation SHA-256 |
| --- | --- | --- | --- |
| `public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb` | 251 / 8.333333 s | `6379780d1d03f21c686a9c3416f461fbf075be67dfed2f59702b3a694b83c3af` | `5b9ee52ba5c6760d2a9a180b8ff5864623c0e6bc2e5e8d94ac23417b9187358f` |
| `public/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.glb` | 32 / 1.033333 s | `00daa1044400d4f38a5d80ccb804bad3fe498d8cf5dd3ef73360bd5985ca6d7c` | `5b1c6ca23c7a4ffe72ebb01b1c38f2c328dbec8bcb01a666219818ca1b1e8d57` |

Both repeated passes produced identical binary hashes, normalized actions,
track names, times, key counts, values, and semantic metadata. Per-clip
`.bake-metadata.json` and `.bake-diagnostics.json` files record compiler,
Blender, hashes, profile, command, structure, samples, root policy, warnings,
and determinism results.

## Root Motion

The policy freezes target-world pelvis X/Z to its first sample and preserves
target-world Y. Idle residual X/Z is exactly `0 / 0`. Walk contained
approximately `1.65083754` Blender-world units of forward source travel; the
baked GLB residual measured by Three.js is `0` on X and
`-3.725294253631439e-9` on Z. Vertical gait motion remains present. The runtime
still controls entity position.

## Three.js Round Trip And V2 Comparison

`offline-bake-roundtrip.mjs` uses the production `GLTFLoader`, real clip
parsing, and skeleton-safe cloning. Each GLB reports 69 nodes, one 65-joint
Golden skeleton, 3 skinned meshes, 3 materials, 7 textures, one 23-track
target-only clip, no Mixamo names, finite keys and sampled transforms, stable
bounds/facing/scale, and no inspector warnings. Two clones have distinct bone
and skeleton objects and distinct `AnimationMixer`s; animating one does not
mutate the other, and Rest restores the bind pose.

Samples at 0/25/50/75% compare the required pelvis, torso, head, arm, hand, and
leg chains against runtime V2. The justified importer/exporter representation
tolerances are 10 degrees and 0.02 metres:

| Clip | Max angular difference | Max positional difference | Result |
| --- | ---: | ---: | --- |
| Idle | `9.548430` deg at `neck_01` | `0.013719` m at `Head` | Pass |
| Walk | `9.693279` deg at `neck_01` | `0.014511` m at `Head` | Pass |

The report is
`public/assets/derived/humanoid-animations/golden-reference-v0/offline-bake-roundtrip-report.json`.
Node validation uses one-pixel bitmap stand-ins only for embedded texture
decode; real texture decode is covered by browser Playwright.

## Browser And Asset Studio Validation

Asset Studio defaults to Offline baked playback and shows artifact paths,
duration, profile/compiler versions, Adobe Mixamo provider, root policy, 22
mapped bones, and the finger/helper limitation. Rest, Idle, Walk, Play/Pause,
seek, orbit, zoom, fixed cameras, and reset remain available.

Playwright captures the rejected V1 baseline plus Rest and baked Idle/Walk at
0/25/50/75% from Front, Side, and Three-quarter cameras. All baked captures
were manually inspected. Shoulders and torso are coherent; elbows, hips,
knees, and feet keep credible chains; gait phases progress correctly; hands
track their arms without separation. Fingers remain rigid and open as
documented. There is no visible root drift or mesh explosion. The harness also
passes finite joints, segment lengths, bounds, pose progression, Rest restore,
camera control, and zero binding/skeleton/WebGL/load/uncaught errors.

## Game Registry Promotion

The shared preview contract exports explicit idle and walk baked-source
definitions. The Golden Reference maps semantic `idle` and `walk` to those
assets, and the root registry includes them as animation-only presentation
sources. The shared Three controller now honours optional idle mappings as well
as walk/attack/defeated while assets without idle mappings retain their bind
pose. Player and NPC clones continue to use per-clone mixers and independent
skeletons. No authored schema or gameplay semantics changed.

## Limitations And Next Milestone

- The profile is valid only for these exact verified skeleton signatures.
- Fingers/helpers remain at rest, producing rigid open hands.
- Full per-clip GLBs duplicate approximately 3 meshes, 3 materials, and 7
  embedded textures; a combined or animation-only library needs separate proof.
- The Blender/Three boundary differs from runtime V2 by up to 9.69 degrees and
  1.46 cm, within the documented feasibility tolerance.
- FBX inspection still reports an unsupported shininess map and trimming of
  skin influences beyond four; retargeting consumes the skeleton/action only.

The smallest sensible next milestone is the deterministic procedural
mannequin: Blender Python geometry, canonical skeleton, deterministic skinning,
these canonical baked animations, GLB export, Asset Studio preview, and game-
engine round trip.
