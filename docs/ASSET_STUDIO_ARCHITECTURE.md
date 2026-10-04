# Asset Studio Architecture

## Quick Resume

Read this section and the [Hairstyle Library V2 milestone](assets/hairstyle-library-v2.md)
for current creator work; older milestone documents are historical evidence.

- Current creator: six body proportions, skin colour/roughness, eye and hair colour,
  No Hair/Buzzed/Short Crop/Simple Parted/Long/Buns, seeded body randomisation, Generate Preview / Finalise Character, and
  ten in-session Recent Compilations. Preview supports Rest/Idle/Walk and
  whole-body/close-head cameras.
- Data flow: CharacterRecipeV1 -> creator request -> Vite development middleware
  -> procedural recipe -> one Blender build for preview, two for finalisation -> Three.js validation
  -> shared preview/registry. Preserve this boundary and the unchanged
  65-joint Golden skeleton; game-session semantics are outside this work.
- Orientation is corrected: compiler forward is -Y, exported anatomical forward
  is +Z, and the shared 180-degree presentation rotation is unchanged. An
  exported face-versus-foot/toe gate rejects backwards features independently
  of declared axes. Face depth is fitted to the actual head surface.
- Hair Colour V1 compiles `palette.hair` into a solid hair base colour while
  preserving the source normal map. Vendor files remain immutable.
- Version map: CharacterRecipe remains V1; compile request and procedural
  recipe are V6; compiler is `procedural-mannequin-blender-v8`; validator is
  `procedural-mannequin-roundtrip-v9`; topology is `procedural-humanoid-v4`;
  head contract is V3 and hair fit is `quaternius-buzzed-fit-v3`.
  Legacy procedural recipes receive hair colour `#3b2a1f`; V5 eye colour survives.
- Hairstyle Library V2 adds two registry-backed short styles without a schema
  change. The current registry has six choices including Long/Buns; `--library` covers 36 body/style artifacts (72 Blender passes). Use `--style` and `--case` for relevant subsets and `--list` before building.
- Human Foundation replaces the coarse body volumes with anatomical lofts;
  see [body generation](#human-foundation-body-generation) and the
  [acceptance report](../ASSET_CREATOR_HUMAN_FOUNDATION_RESULT.md).
  Shirt Slot V1 remains deferred.
- Generated fixtures live in
  `public/assets/derived/procedural-humanoids/{mannequin-v0,mannequin-hair-v0}/`.
  GLBs, manifests, diagnostics, recipe snapshots, and build logs form one
  artifact set. Inspect selected manifest fields first; full diagnostics are large.

| Task | Start here |
| --- | --- |
| Recipe types, defaults, migration | `packages/character-contract/src/index.ts` |
| Hair source/provenance/fit metadata | `packages/character-contract/src/character-component-registry.json` |
| Creator UI/state, compile lifecycle and recent-job restoration | `apps/asset-studio/src/App.tsx`; request/response boundary in `proceduralMannequinCreator.ts` |
| Preview scene, cameras, animation, loaded-result diagnostics and cleanup | `apps/asset-studio/src/HumanoidPreview.tsx`; shared loader in `packages/three-asset-preview/src/index.ts` |
| Preview fixture descriptors/source contract | `apps/asset-studio/src/previewSources.ts` |
| Request adapter and response checks | `apps/asset-studio/src/proceduralMannequinCreator.ts` |
| Local compile endpoint | `apps/asset-studio/dev/procedural-mannequin-compile-api.mjs` |
| Procedural schema, versions, hashes | `tools/blender-character/procedural-mannequin-contract.mjs` |
| Geometry, materials, head landmarks, fitting | `tools/blender-character/generate_procedural_mannequin.py` |
| Two-build orchestration and manifests | `tools/blender-character/procedural-mannequin-compiler.mjs` |
| Exported geometry/material/animation gates | `tools/blender-character/procedural-mannequin-roundtrip.mjs` |
| Shared asset definitions and loader | `packages/three-asset-preview/src/index.ts` |
| Focused browser checks | `apps/asset-studio/e2e/procedural-mannequin.spec.ts`, `e2e/procedural-mannequin.spec.ts` |

The preview accepts a source descriptor and a manifest callback. Its complete
renderer/animation/observer cleanup remains in one component; creator draft edits
must not acquire scene resources. App intentionally keeps compile result, captured
recipe, recent history and preview selection together so restoration stays atomic.

### Interactive workflow

`Generate Preview` posts to `/__asset-studio/procedural-mannequin/preview` and
executes one Blender pass plus one exported GLB round trip. `Finalise Character`
uses the existing `/compile` endpoint and default full compiler mode, retaining
both builds, both round trips and determinism comparisons. CI and matrices keep
that full default. Preview manifests have `validationLevel: "preview"`, null
determinism and `deterministicBuild: false` (not tested, not a failed test).
Full results have `validationLevel: "full"`. No compiled-result cache is used.
Finalisation offers GLB/manifest/compiler-recipe downloads from the existing
local output folders; Save Recipe JSON preserves the editable CharacterRecipe.
Recent results remain in-session only. No character library or game assignment
is created. Failures retain the working preview and expose logs plus the captured
recipe in expandable technical details. Timing evidence and current acceptance
are in [the workflow report](../ASSET_CREATOR_WORKFLOW_RESULT.md).

For iteration, run the affected creator/contract Vitest file or Node compiler
test first. `npm run check:asset-studio` is a focused contract/Studio gate;
`npm run test:compiler` checks the compiler API, provenance and installed GLB
round trips without launching Blender. For final validation run `npm run ci`
once and `git diff --check`: CI now includes all workspace tests/typechecks,
the Studio build and cheap Node compiler tests, so separate overlapping gates
are unnecessary afterward.

Browser previews, real compiler integration, visual acceptance and Blender
matrices remain opt-in. Select the smallest category in the
[validation routing guide](PLAYWRIGHT_SMOKE.md), then consult the
[compiler guide](../tools/blender-character/README.md) for regeneration.
Default browser commands now select integration only; real compile, visual and historical galleries have explicit commands in that guide. Recent-history UI uses fake responses in component tests, while one real browser/compiler/preview boundary remains. Current previews do not load runtime-retarget history unless a diagnostic mode is requested.

Historical [milestone validation](assets/hairstyle-library-v2.md#validation)
records prior evidence, not a current pass. Test artifacts under
`test-results/` are ignored/local, not portable checked-in proof.

## Product Boundary

The main editor's **Asset Creator** button opens a connection dialog and checks
the development-only Studio identity endpoint before offering a new-tab link.
Run `npm run dev:asset-studio` (fixed port 5174; an occupied port fails explicitly).
The editor defaults to its current host on that port. Set `VITE_ASSET_STUDIO_URL`
in the root `.env.local` and restart the editor to use another HTTP(S) address.
An unavailable server produces setup guidance; the editor neither starts processes
nor imports Studio or compiler code. Only the public health response allows CORS.

The launcher passes its URL as `returnTo`. Studio's persistent **Back to Game
Engine** link uses `VITE_GAME_ENGINE_URL` if configured in Studio's `.env.local`,
otherwise that launching URL, otherwise the same host on port 5173. Only HTTP(S)
targets without credentials are accepted. Connection help remains available if
the engine is stopped; navigating to an offline target uses normal browser error
handling. The return link does not require a CORS probe or start a server.

Asset Studio is a separate browser application for authoring constrained, game-ready source data for assets. The current workflow authors humanoid recipes, compiles them locally during development, and previews validated artifacts. It does not replace the Adventure Game Builder editor, runtime, or map schema. Validated compiled fixtures may be promoted through the shared built-in Three.js registry without importing Asset Studio into the game app.

The root game editor remains the existing application. Asset Studio lives under `apps/asset-studio`, and shared contracts live under `packages/`.

## Why A Separate App

Character creation has different workflow pressure than map editing and runtime testing. Keeping Asset Studio separate allows focused recipe editing, validation, preview, and future compilation workflows without pushing Blender-like concepts or compiler state into `GameProject`.

The root app is not moved in V0. The repository uses npm workspaces only so packages can be shared without a Turborepo, Nx, or full monorepo migration.

## Recipe As Source

`CharacterRecipeV1` is editable source data. It is JSON serializable, versioned, renderer-independent, and contains no Three.js objects, Blender objects, meshes, skeleton instances, materials, or runtime state.

Compiled GLB files are artifacts. They are not the source of truth for editing a character.

## Human Foundation body generation

`generate_procedural_mannequin.py` owns `MeshBuilder.add_profile`, the anatomical
stations in `create_geometry`, fused-surface measurements, head/face generation,
`assign_analytic_weights`, and the skeleton import/export. Torso sections describe
pelvis, waist, ribcage and a narrowing trapezius/neck connection. Bone-relative limb
sections preserve deltoid/thigh volume, elbow/knee narrowing, forearm/calf bulges,
wrist/ankle taper and simple palms/thumbs/feet. An 18 mm voxel union welds those
volumes; five smoothing iterations and symmetric 70% decimation precede weighting.
This remains a deterministic triangle base, not a clothing-ready quad cage.

The intended default is roughly 7–7.5 heads tall, with a compact stylised reach:
the pelvis is about halfway up, knees about 29% up, shoulder joints about 80% up,
and elbows/wrists follow the Golden rig. Head volume sits above the Head pivot,
leaving a visible neck instead of burying it inside the jaw. The actual surface
must retain a narrower neck than head and a waist narrower than the ribcage.
Anatomy slices now intersect edges and select the unique contour spanning the
body centre. Separate raised-arm contours at neck height are excluded. The
neck station is proportional to the neck-to-head interval. Scale-independent
ratios require neck/head between 0.30 and 0.85, neck/shoulder below 0.65, and
waist/ribcage below 0.95. Generation geometry and slider ranges are unchanged.
Default output is approximately 14,700 triangles, depending on the profile.

The existing 65-joint hierarchy, rest signature, exported +Z anatomical forward,
and shared presentation rotation remain unchanged. Height scales the whole result;
the other five controls move mesh anchors around the unchanged rest skeleton within
the existing bounded range. This preserves baked clips but limits extreme body edits.
Weights are normalized to at most four influences, reject opposite limbs, and fade
limb influence continuously near the midline. The skull and facial features are
Head-bound. The validator checks actual skinned surface edge stretch in idle/walk
in addition to bone lengths, grounding, topology and independent clones.

Parameter ownership stays in `packages/character-contract/src/index.ts`; compiler
ranges/derived dimensions are mirrored and cross-checked in
`procedural-mannequin-contract.mjs`. Future waist, chest depth, limb thickness,
head size and neck controls should drive the existing measurement/profile stations.
Add recipe defaults/migration, mirror the derivation, and test round trips before
exposing a UI control. Do not independently resize meshes in the preview. Longer
necks or larger range changes eventually require a deliberately proportioned rig.

Existing hair uses the same registry and source assets. Short caps now fit the
narrower head; Long/Buns use updated width limits and head-relative profiles.
Every style seats outside the actual scalp surface; Long also clears the neck.
Signed vertex and face-centre samples reject scalp penetration. An updo may
end above the neck. Clearance gates remain in force; no new hairstyle is introduced.
Long's generated front collar is opened below the chin so seating cannot create a
hair band around the neck; its immutable vendor source remains unchanged.

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
- compiled eye colour at `appearance.face.eyeColor`, separate from the palette
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

Only the hair slot currently has a compiled component implementation: `none`
or `quaternius-hair-v0`, fitted in Blender and skinned to the main skeleton.
Other slots remain metadata; clothing fitting and body masking are not implemented.

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
local creator job. Body proportions, skin/eye appearance, and hair selection
are adapted from `CharacterRecipeV1` into
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
- Face Readability V0: compiler-generated Head-skinned eyes, nose, and mouth,
  authored eye colour, a V2 head/face landmark contract, close head cameras,
  paired bald/haired body validation, and deterministic Rest/Idle/Walk evidence.

The repository now has one narrow procedural recipe compiler, one validated
connected-topology mannequin, and a complete body/material/face/hairstyle authoring
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
Vite server plugin accepts one narrow V6 request containing six body parameters,
skin, eye, and hair appearance, and the registered hair id, adapts it to the procedural
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
- user-facing GLB download/export and general compiled-package import
- general animation-set authoring beyond the proven Golden Idle/Walk clips
- AI generation
- deployed compiler/backend service
- asset upload into the game editor
- moving the root game app into `apps/game-engine`

## Next Milestone

Hairstyle Library V2 supports Buzzed, Short Crop, and Simple Parted plus No Hair.
Next is length-aware fitting for Long/Buns through existing registry/fit profiles;
see the [current milestone](assets/hairstyle-library-v2.md). Preserve source
provenance, skeleton compatibility, and visual/round-trip gates.

## Future Deployment Models

The compiler contract supports several later deployment models:

- local command execution from a desktop wrapper
- containerized job runner
- remote worker service
- manual compile/import loop for early golden-kit validation

No deployment model is assumed in V0.
