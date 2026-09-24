# Hairstyle Library V2

## Current Result

Asset Studio offers No Hair, Quaternius Buzzed, Short Crop, and Simple Parted.
The two new styles use existing CC0 Quaternius source meshes (BuzzedFemale and
SimpleParted). Source files are immutable and each registry entry records its
mesh, buffer, textures, licence hashes, and named V3 fitting profile.

The creator resolves draft/compiled names and provenance from the registry.
Fit diagnostics are shown only for a compiled artifact matching the selected
style, avoiding stale Buzzed measurements after switching styles. Hair colour,
compile validation, failure preservation, and Recent Compilations work through
the existing pipeline. The game runtime and shared 65-joint skeleton are unchanged.

## Files and Compatibility

Start with `docs/ASSET_STUDIO_ARCHITECTURE.md#quick-resume` for the file map.
Registry entries live in `packages/character-contract/src/character-component-registry.json`.
New ids are `quaternius-hair-short-crop-v1` and
`quaternius-hair-simple-parted-v1`; `none` and `quaternius-hair-v0` stay valid.
Example source recipes are under `tools/blender-character/recipes/`, named
`procedural-mannequin-{short-crop,simple-parted}-v1.recipe.json`.

This is an additive registry/UI change: CharacterRecipe and registry schema
remain V1, procedural recipe/request V6, compiler V7, validator V8, head and
topology V3. No saved-project migration is required. New styles compile locally;
they are not additional built-in game asset registrations or checked-in GLBs.

Short Crop uses the established short-cap fitting ratios. Simple Parted uses
width 1.02, depth 1.10, and rear offset 0.008 m. Initial rear screenshots exposed
scalp through the source mesh; these adjustments closed that gap. Do not replace
visual inspection with the bounding/clearance gates alone.

## Validation

Run sequentially to avoid competing Blender/browser/CI workloads:

```bash
npm run check:asset-studio
npm run test:blender-bake
npm run validate:procedural-hairstyle-matrix -- --library
npm run test:e2e:asset-studio -- --grep "Hairstyle Library V2"
npm run ci
git diff --check
```

The library matrix covers six body shapes and all four choices (24 artifacts),
with two builds per artifact, GLB round trips, fit/animation/orientation gates,
and identical body, face, and skeleton hashes across styles for each body.
The browser test compiles blond Short Crop and auburn Simple Parted, checks
Idle/Walk deformation, captures Rest/Idle/Walk from side, close front, close
three-quarter, and back views, then restores both recent recipes and colours.

Local ignored evidence: `test-results/hairstyle-library-v2/body-matrix/` and
`test-results/hairstyle-library-v2/fit-review/`. The corrected close-up and rear
screenshots were inspected directly. The full matrix passed: six bodies, 24 artifacts, four choices. The focused
browser test passed both styles and captured 24 images. Compiler/provenance
tests passed (32 tests).

Final verification (2026-09-24): `check:asset-studio` passed (19 contract and
20 app tests, types, build); `npm run ci` passed (71 files / 571 tests, types,
production build); `git diff --check` passed. The required Three performance
smoke still fails the pre-existing pirate walk-state assertion: all character
assets load, but the sampled state remains idle after ArrowUp. Evidence is in
`test-results/hairstyle-library-v2/perf/`. This is the same failure recorded by
Hair Colour V1; no game runtime or performance-harness code was changed.

## Remaining Scope

Three short styles are supported. Long and Buns remain unregistered: their
length/volume need separate fit profiles and shoulder/neck clearance review;
do not simply reuse the short-cap ratios. No secondary hair motion, facial
animation, general uploads, or clothing is added. Next is length-aware fitting
for Long/Buns; Shirt Slot V1 remains deferred.
