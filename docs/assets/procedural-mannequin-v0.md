# Procedural Mannequin V0

## Result

Procedural Mannequin V0 is the first repository humanoid whose body is generated
entirely by project-owned Blender Python. It proves the narrow path:

```text
ProceduralMannequinRecipeV0
  -> headless Blender 5.2
  -> generated geometry and explicit weights
  -> Golden compatibility skeleton
  -> deterministic GLB
  -> Three.js round-trip validation
  -> shared preview/loader/clone/animation path
  -> Asset Studio and game engine
```

The mannequin is engineering geometry, not a production human or a generated
version of the Quaternius body.

## Recipe

The authored source is
`tools/blender-character/recipes/procedural-mannequin-v0.recipe.json`. The
versioned `ProceduralMannequinRecipeV0` validator and canonical hash live in
`tools/blender-character/procedural-mannequin-contract.mjs`.

V0 intentionally has only fields that affect compilation:

- `proportions.heightMetres`, range 1.5 to 2.1 metres, uniformly scales the
  generated body and compatibility rig about the grounded origin;
- `geometry.profile: "ellipsoid"` and `radialSegments`, range 6 to 16, control
  generated topology;
- `material.baseColor` and `roughness` control the one generated material;
- `skeleton.contract: "golden-humanoid-v0"` declares the exact compatibility
  target;
- `animations.set: "golden-reference-v0"` declares the reused canonical set.

The checked-in recipe hash is
`48d66f2ceba6baa946dbaaceb91045b694647734e50c57c49837eb670e7769ed`.
The recipe is source; the GLB and JSON reports are derived artifacts.

`CharacterRecipeV1` remains the long-term authoring contract, but it currently
declares the provisional 20-bone `humanoid-v1` hierarchy. This milestone does
not pretend that hierarchy is the 65-joint Golden rig and does not wire the
existing CharacterRecipe controls to Blender. A later contract migration can
join these inputs after the generated canonical rig is decided.

## Skeleton Decision

V0 uses the immutable Quaternius Golden Reference glTF only as a skeleton
template. The compiler imports its 65-joint rest armature, verifies the
principal bones, deletes every imported mesh, material, image, texture, and
action, then creates the mannequin. The output contains no Quaternius body mesh
or Mixamo armature.

This creates two explicit concepts:

1. `golden-humanoid-v0`: the current 65-joint compatibility target used by the
   proven offline animations and this mannequin;
2. a future canonical generated skeleton, which remains undecided.

The richer vendor-derived rest rig is retained because it lets the mannequin
bind directly to the already validated Golden Idle and Walk clips. Inventing a
second skeleton or retarget profile would add no evidence to this milestone.
The generated GLB skeleton signature is
`93809fef8050dc5f1610f34b6c8e43b72867499b2deb51ebf05c207f9a648c85`.

## Geometry And Skinning

`generate_procedural_mannequin.py` builds one mesh in stable part order from
closed low-resolution ellipsoid sections and box sections:

- pelvis and four torso volumes;
- neck and head;
- clavicle/shoulder, upper-arm, lower-arm, and hand sections;
- thigh, calf, foot, and toe sections;
- a small chest marker that makes native facing observable.

The generated topology is symmetric and contains no random step. Joint volumes
overlap deliberately so the rigid sections stay visually connected. Blender's
exporter splits 600 authored vertices to 648 runtime vertices where normals
require it. The final artifact has 1,108 triangles, one skinned mesh, one
material, no textures, and no morph targets.

Skinning is explicit rather than automatic. Every authored vertex is assigned
weight 1 to exactly one named principal bone before export. Validation reports:

- maximum influences: 1;
- unweighted vertices: 0;
- out-of-range joint references: 0;
- maximum normalized-weight error: 0;
- expected weighted-bone coverage: all 22 generated-body groups;
- full skin joint count: 65.

Rigid hands and feet and segmented torso volumes are deliberate V0 limitations.

## Compiler And Artifacts

Run the deterministic compiler with:

```powershell
npm run compile:procedural-mannequin -- --recipe tools/blender-character/recipes/procedural-mannequin-v0.recipe.json --blender "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --output-dir public/assets/derived/procedural-humanoids/mannequin-v0 --clean
```

Use `--staging` to label a non-promoted build and `--validate-only` through
`npm run validate:procedural-mannequin` to revalidate the installed package
without invoking Blender. `--template` and `--output-dir` are narrow overrides.

The compiler used Blender `5.2.0 LTS`, build `fbe6228777e7`, and compiler version
`procedural-mannequin-blender-v0`. It writes:

```text
public/assets/derived/procedural-humanoids/mannequin-v0/
  mannequin.glb
  manifest.json
  diagnostics.json
  recipe.snapshot.json
  build.log
```

The manifest is portable and omits generated timestamps and machine-specific
absolute paths. Diagnostics contain the Blender report, semantic structure,
source hashes, animation checks, and clone/rest checks.

## Determinism And Validation

The compiler performs two isolated Blender builds before promotion. The current
evidence is:

- GLB SHA-256 for both passes:
  `20e73b2dff59ed146a5172837239d167781c1041258901f85beae48e4d69a4b6`;
- normalized semantic SHA-256 for both passes:
  `29d9c5ad9e148250b154123cb40e3d406b60ea3a707883bd67438b3edd410d8a`;
- byte-identical GLB: pass;
- hierarchy, topology, positions, normals, indices, joints, weights, rest
  transforms, bounds, and material comparison: pass;
- template glTF/buffer and recipe hashes before/after: unchanged;
- finite positions/normals and valid indices: pass;
- grounded minimum Y `0` and height `1.8200001` metres: pass;
- left/right chain symmetry: pass;
- no Quaternius presentation names or Mixamo names: pass.

The GLB contains no embedded animation. Its registry definition maps semantic
Idle and Walk to the existing deterministic Golden-target GLBs. This is the same
production/default animation architecture used by the Golden Reference; there
is no default runtime retargeting and no parallel state machine.

Round-trip results include:

- Idle pose advancement: `0.01308474`;
- Walk pose advancement: `0.90685153`;
- Idle horizontal pelvis residual: `0 / 0`;
- Walk horizontal pelvis residual: `0 / -4.12816096e-9` metres;
- maximum bone-length relative error: below `0.00001`;
- independent bones, skeletons, and mixers for two clones: pass;
- animating clone one leaves clone two unchanged: pass;
- Rest restoration maximum matrix difference: `0`.

Gameplay continues to own grid position. Vertical hip motion remains in the
clips.

## Asset Studio And Engine Evidence

Asset Studio exposes an explicit preview source selector with both:

- Golden Reference Humanoid;
- Procedural Mannequin V0.

The mannequin view uses the shared `@adventure-game-builder/three-asset-preview`
loader, material preparation, `SkeletonUtils` clone path, and canonical clip
sources. It displays real artifact metadata, Rest/Idle/Walk, pause/play, seek,
fixed cameras, orbit, zoom, and reset. It clearly states that browser controls
do not execute Blender.

The Asset Studio Playwright gate verifies metadata agreement, genuine pose
advancement, in-place gait, Rest restoration, finite bounds, camera controls,
source switching, one live canvas, and no asset-load, track-binding, skeleton,
WebGL, or uncaught errors. Fixed front, side, three-quarter, Idle, and Walk
captures are written beneath `apps/asset-studio/test-results/`.

Manual capture inspection found:

- a coherent symmetric articulated-dummy silhouette;
- connected shoulder/elbow and hip/knee chains without weight explosions;
- stable planted feet and no visible horizontal root drift;
- no severe shoulder, hip, or torso collapse during sampled gait phases;
- intentionally segmented torso volumes, block hands/feet, rigid fingers, and
  simplified joint intersections.

The root registry makes the same asset selectable for players and NPCs while
Patchbeard remains the default. Root Playwright evidence shows independent
skeleton-safe player/NPC clones in both the Three editor and experimental Three
runtime, with canonical Idle/Walk sources and zero load or binding issues.

## Next Milestone

The first genuine creator control should be **height**. It is already the one
V0 parameter that travels honestly through recipe validation, canonical recipe
hashing, Blender root scaling, grounded GLB bounds, round-trip validation,
Asset Studio metadata, and the root registry. Exposing it should require a real
compile/import action or job boundary; changing the existing CharacterRecipe
height input must not pretend to rebuild the checked-in artifact.

