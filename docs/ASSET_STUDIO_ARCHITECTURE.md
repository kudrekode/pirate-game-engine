# Asset Studio Architecture

## Product Boundary

Asset Studio is a separate browser application for authoring constrained, game-ready source data for assets. V0 focuses on humanoid character recipes and read-only validated character artifacts. It does not replace the Adventure Game Builder editor, runtime, or map schema. Validated compiled fixtures may be promoted through the shared built-in Three.js registry without importing Asset Studio into the game app.

The root game editor remains the existing application. Asset Studio lives under `apps/asset-studio`, and shared contracts live under `packages/`.

## Why A Separate App

Character creation has different workflow pressure than map editing and runtime testing. Keeping Asset Studio separate allows focused recipe editing, validation, preview, and future compilation workflows without pushing Blender-like concepts or compiler state into `GameProject`.

The root app is not moved in V0. The repository uses npm workspaces only so packages can be shared without a Turborepo, Nx, or full monorepo migration.

## Recipe As Source

`CharacterRecipeV1` is editable source data. It is JSON serializable, versioned, renderer-independent, and contains no Three.js objects, Blender objects, meshes, skeleton instances, materials, or runtime state.

Compiled GLB files are artifacts. They are not the source of truth for editing a character.

## CharacterRecipeV1

The V0 recipe contains:

- `version: 1`
- stable `id` and `name`
- `skeletonId: "humanoid-v1"`
- one body base id
- six compiled body parameters: height, shoulder width, torso length, arm
  length, leg length, and hip width
- optional component ids for hair, headwear, torso, legs, feet, and main hand
- a constrained palette for skin, hair, primary, secondary, and metal
- compiled skin appearance roughness; `palette.skin` is its single authored
  sRGB color source
- an `animationSetId`

Validation rejects unsupported versions, invalid skeleton ids, invalid colors, empty ids, and body parameters outside their declared ranges. V0 rejects bad bounds instead of silently normalizing imported data.

The creator loop reuses the six values under `body.parameters` rather than
introducing a second UI recipe. Height is measured in metres; the remaining
five values are normalized offsets. The compiler derives bounded anatomical
multipliers and rejects incompatible limb reach, torso/leg intersection,
shoulder/hip centring, and bone-relative anchor placement before compilation.
Legacy saved recipes receive safe defaults for the four newly introduced
fields and retain their existing height and shoulder width values.

## Humanoid V1 Contract

The provisional identifier is `humanoid-v1`.

- Units: metres
- World up: `+Y`
- Engine forward: `-Z`
- Origin: ground centre beneath the character
- Neutral pose: provisional A-pose
- Root bone: `Root`
- Hips bone: `Hips`
- Hips parent: `Root`
- Fingers: deferred in V0

A-pose is provisional because modular clothing generally deforms better from a relaxed shoulder angle. The current game runtime animation proof already uses clips that target a `Hips` bone, so the V0 contract keeps `Hips` as a stable named joint. This must still be validated by a golden humanoid kit before the contract is frozen as production V1.

Minimal bone hierarchy:

```text
Root
Hips
Spine
Chest
Neck
Head
LeftShoulder -> LeftUpperArm -> LeftLowerArm -> LeftHand
RightShoulder -> RightUpperArm -> RightLowerArm -> RightHand
LeftUpperLeg -> LeftLowerLeg -> LeftFoot
RightUpperLeg -> RightLowerLeg -> RightFoot
```

Code alone does not prove anatomy, skinning quality, deformation quality, or retargeting quality.

## Component Slots

Reusable components use `CharacterComponentDefinition` metadata:

- stable id and name
- slot: hair, headwear, torso, legs, feet, or main hand
- `skeletonId: "humanoid-v1"`
- explicit compatible body base ids
- optional material regions
- optional body mask region metadata
- optional source asset reference

V0 only defines metadata. It does not implement clothing fitting, deformation, body masking, mesh merging, or skinning.

## Palette And Materials

The V0 palette is intentionally constrained:

- skin
- hair
- primary
- secondary
- metal

Values are `#RRGGBB` colors. V0 does not expose material node graphs, shader graphs, texture generation, or arbitrary material authoring.

## Current Animation Pipeline

The proven Golden Reference pipeline is:

```text
vendor Mixamo FBX
  -> immutable source/provenance records
  -> versioned retarget profile
  -> headless Blender bake
  -> deterministic Golden-target GLB
  -> Three.js round-trip validation
  -> shared animation registry
  -> Asset Studio / editor / runtime
```

Blender is an offline compiler implementation detail. Production/default
playback uses offline-baked artifacts; runtime retargeting V2 is retained only
as an experimental comparison path. `mixamo-to-quaternius-v2` is specific to
the verified Mixamo/Quaternius source/target skeleton pair. Walk artifacts are
in-place, with horizontal root motion neutralized and vertical hip movement
retained, while gameplay movement remains authoritative. Vendor assets are
immutable and derived assets are reproducible compiled artifacts. Full
per-clip GLBs currently duplicate mesh/material/texture data as a proven but
temporary format choice. See the [retargeting spike](assets/golden-reference-animation-retargeting-spike.md)
for detailed measurements and evidence.

## Animation Sets

Animation sets map semantic states to stable clip references:

- idle
- walk
- run
- attack
- defeated

The shape is compatible in spirit with the existing Three character registry, where semantic states map to asset ids and clip names. The shared contract does not import Three.js, GLTF loader code, or game runtime presentation modules.

General production retargeting is not implemented in V0. The exact pair has a
proven deterministic offline Blender profile; its idle and walk artifacts enter
the shared presentation animation contract only after deterministic generation,
Three.js round-trip, clone, and browser visual gates. Runtime retarget JSON
remains an explicit diagnostic.

## Browser Preview

The Asset Studio app owns browser preview presentation. Its explicit read-only
sources are `golden-reference-humanoid-v0`, the externally authored Quaternius
fixture, and `procedural-mannequin-v0`, the first compiler-generated
engineering body. Both flow through the shared
`@adventure-game-builder/three-asset-preview` package. That package owns asset
definitions, loader cache, resource aliases, material preparation, analysis,
and skeleton-safe cloning; it has no React, Phaser, gameplay, or recipe-state
dependency. Asset Studio does not import root editor/runtime modules directly.

The fixture is distinct from compiled recipe output. It is not generated from
`CharacterRecipeV1`, and it does not make recipe controls functional. Its
Rest/Idle/Walk controls load explicitly labelled offline-baked Golden target
GLBs through the shared production loader. `?retarget=runtime-v2` exposes the
pair-specific JSON diagnostic for development comparison; a baked load failure
is reported and never silently falls back.

The mannequin preview can read either the checked-in manifest or a successful
local creator job. Body proportions and skin appearance are adapted from `CharacterRecipeV1` into
the narrow procedural recipe; the browser submits the request but never
executes Blender, scales body parts, or deforms the mesh.
Live Three.js objects stay in app presentation code, not recipe contracts.

## Current Asset Studio Capabilities

The current reference preview provides:

- A real Three.js skinned preview with orbit and zoom controls.
- Rest, Idle, Walk, and Play/Pause controls.
- Offline-baked animation playback.
- Compiler/artifact metadata and diagnostics.
- Explicit reference-fixture status.
- An explicit Golden Reference / Procedural Mannequin V0 source selector.
- Six genuine creator parameters in one Body panel, each with slider, numeric
  value, and reset, plus deterministic seeded Randomise.
- Local Blender compilation, validation, successful preview replacement, and
  previous-preview preservation on failure during development.
- An in-session Recent Compilations panel for switching among the last ten
  validated generated bodies without recompiling.
- Generated Body Topology V1: one closed, manifold, genus-zero body surface,
  deterministic blended weights, topology version/stats diagnostics, and the
  unchanged Golden animation contract.
- Material and Skin Appearance V1: compiled sRGB skin color and roughness, one
  validated non-metallic material, draft/compiled UI state, neutral presets,
  and separate geometry/skinning and material semantic hashes.
- Hairstyle Slot V1: exactly `none` plus one provenance-backed Quaternius
  Buzzed component, draft/compiled state, geometry-aware generated-scalp fitting,
  one-skin GLB compilation, and Recent Compilation restoration.
- Procedural Head and Hair Fit V1: a symmetric stylised head, measured
  head/scalp coordinate contract, V2 component fitting profile, geometry-aware
  fit rejection, and deterministic seven-view Rest/Idle/Walk evidence.

The repository now has one narrow procedural recipe compiler, one validated
connected-topology mannequin, and a complete body/material/hairstyle authoring
loop. Still missing are higher-detail/deformation-oriented topology, a deployed
compiler service, a broader hairstyle library, clothing/headwear, and export
of user-authored characters.

## Compiler Boundary

The compiler boundary is transport-neutral. The shared compiler contract
defines general request/result JSON, while the implemented mannequin command is
a deliberately narrower development boundary that may later be adapted to it.

Conceptual command boundary:

```bash
blender --background \
  --python compile_character.py \
  -- \
  --request request.json \
  --output-dir output/
```

The intended long-term flow is:

```text
CharacterRecipe
  -> Blender compiler
  -> GLB + metadata + diagnostics
  -> Asset Studio preview
  -> game-engine registry/runtime
```

The Asset Studio browser still does not execute Blender. During development, a
Vite server plugin accepts one narrow V4 request containing six body parameters,
skin appearance, and the registered hair id, adapts it to the procedural
mannequin recipe, and invokes the repository compiler in an
isolated job directory. Successful artifacts pass two-build determinism,
geometry/skinning, animation binding, and Three.js round-trip validation before
the app consumes them. The request waits for completion; there is no polling.
This is a local development boundary, not a deployed backend. See
[`asset-studio-body-proportions-v1.md`](assets/asset-studio-body-proportions-v1.md).

## Asset Package Format

Compiled character packages are versioned and should follow this shape:

```text
character-name/
  character-name.glb
  character-name.asset.json
  character-name.recipe.json
  character-name.png
```

Responsibilities:

- `recipe.json`: editable source recipe
- `glb`: compiled runtime asset
- `asset.json`: engine-facing metadata with category, skeleton id, transforms, animation mappings, budgets, and analysis
- `png`: preview thumbnail

The development mannequin uses the equivalent diagnostic-oriented layout
`mannequin.glb`, `manifest.json`, `diagnostics.json`,
`recipe.snapshot.json`, and `build.log`. A thumbnail is deferred because the
fixed Playwright captures are currently validation evidence, not a library
card asset.

## Game-Engine Import Boundary

The game editor should import compiled package metadata later through an adapter-facing seam. It should not import the Asset Studio app, compiler implementation details, Blender scripts, or live Three.js compiler objects.

The current V0 demonstration is intentionally narrow: `src/runtime/assetStudioContractIntegration.ts` imports only compiled metadata types and the stable skeleton id helper.

## V0 Includes

- npm workspace boundaries
- standalone Asset Studio Vite app shell
- real `CharacterRecipeV1` state editing and validation
- recipe JSON view, load, and save
- one body-proportion authoring adapter and development-only local compile endpoint
- renderer-independent character, component, palette, animation, and compiler contracts
- Blender compiler boundary documentation
- deterministic Golden Reference offline-bake tooling and validated artifacts
- deterministic Procedural Mannequin V0 recipe/compiler, validated artifact,
  Asset Studio preview, and root registry round trip
- Hairstyle Slot V1 component registry, source/provenance validation, adaptive
  Blender fit, compiled bald/haired artifacts, and shared player/NPC loader path

The current Golden Reference is a loader fixture, skeleton fixture,
animation-retarget target, offline compiler target, and runtime/editor/Asset
Studio validation asset. It is not the final production humanoid, a
recipe-generated character, a completed Sims-like character, or the long-term
crowd-budget default.

## V0 Does Not Include

- general humanoid mesh generation beyond one engineering mannequin
- general rig creation beyond the Golden compatibility skeleton template
- body morph targets
- clothing fitting
- Blender execution inside browser code
- GLB export
- production character animation preview sourced from compiled package output
- AI generation
- backend service
- asset upload into the game editor
- moving the root game app into `apps/game-engine`

## Next Milestone

Procedural Head and Hair Fit V1 corrects the failed visual fit without changing
the proven recipe/compile/Blender/validation/preview boundary. Evidence is
documented in
[`procedural-head-hair-fit-v1.md`](assets/procedural-head-hair-fit-v1.md). The
recommended next creator milestone is a small face-feature pass so the corrected
engineering head reads more clearly before Hairstyle Library V2 expands the
same component registry and fit-profile contract.

## Future Deployment Models

The compiler contract supports several later deployment models:

- local command execution from a desktop wrapper
- containerized job runner
- remote worker service
- manual compile/import loop for early golden-kit validation

No deployment model is assumed in V0.
