# Asset Studio Architecture

## Product Boundary

Asset Studio is a separate browser application for authoring constrained, game-ready source data for assets. V0 focuses on humanoid character recipes only. It does not replace the Adventure Game Builder editor, runtime, map schema, or built-in Three.js asset registry.

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
- five body parameters: height, build, shoulder width, waist, and head scale
- optional component ids for hair, headwear, torso, legs, feet, and main hand
- a constrained palette for skin, hair, primary, secondary, and metal
- an `animationSetId`

Validation rejects unsupported versions, invalid skeleton ids, invalid colors, empty ids, and body parameters outside their declared ranges. V0 rejects bad bounds instead of silently normalizing imported data.

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

## Animation Sets

Animation sets map semantic states to stable clip references:

- idle
- walk
- run
- attack
- defeated

The shape is compatible in spirit with the existing Three character registry, where semantic states map to asset ids and clip names. The shared contract does not import Three.js, GLTF loader code, or game runtime presentation modules.

Retargeting is not implemented in V0.

## Browser Preview

The Asset Studio app owns browser preview presentation. Its default read-only
development fixture is `golden-reference-humanoid-v0`, which displays the
externally authored Quaternius Golden Reference Humanoid through the shared
`@adventure-game-builder/three-asset-preview` package. That package owns the
fixture definition, loader cache, resource aliases, material preparation,
analysis, and skeleton-safe clone path; it has no React, Phaser, gameplay, or
recipe-state dependency. Asset Studio does not import root editor/runtime
modules directly.

The fixture is distinct from compiled recipe output. It is not generated from
`CharacterRecipeV1`, has no embedded animation clips, and does not make recipe
controls functional. A future preview-source contract can add compiled
artifacts without weakening this provenance boundary.

Future previews may load compiled or golden-kit assets, but live Three.js objects must stay in app presentation code, not shared recipe contracts.

## Compiler Boundary

The planned compiler boundary is transport-neutral. The shared compiler contract defines request and result JSON for a future compiler that may run locally, inside a desktop wrapper, in a container, or remotely.

Conceptual command boundary:

```bash
blender --background \
  --python compile_character.py \
  -- \
  --request request.json \
  --output-dir output/
```

V0 does not execute Blender and does not include a fake compiler that claims success.

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

## Game-Engine Import Boundary

The game editor should import compiled package metadata later through an adapter-facing seam. It should not import the Asset Studio app, compiler implementation details, Blender scripts, or live Three.js compiler objects.

The current V0 demonstration is intentionally narrow: `src/runtime/assetStudioContractIntegration.ts` imports only compiled metadata types and the stable skeleton id helper.

## V0 Includes

- npm workspace boundaries
- standalone Asset Studio Vite app shell
- real `CharacterRecipeV1` state editing and validation
- recipe JSON view, load, and save
- disabled compile state that reports no compiler is implemented
- renderer-independent character, component, palette, animation, and compiler contracts
- Blender compiler boundary documentation

## V0 Does Not Include

- humanoid mesh generation
- procedural geometry
- skinning
- rig creation
- body morph targets
- clothing fitting
- Blender execution
- GLB export
- real character animation preview
- AI generation
- backend service
- asset upload into the game editor
- moving the root game app into `apps/game-engine`

## Golden-Kit Dependency

The next milestone must validate the humanoid contract against a real golden kit before production assumptions are frozen. The kit should test scale, origin, forward axis, pose, bone names, skinning quality, animation compatibility, metadata output, and round-trip import into the game editor.

## Future Deployment Models

The compiler contract supports several later deployment models:

- local command execution from a desktop wrapper
- containerized job runner
- remote worker service
- manual compile/import loop for early golden-kit validation

No deployment model is assumed in V0.
