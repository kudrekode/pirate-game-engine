# Blender Character Compiler Boundary

This folder contains the first genuine, narrow Blender compiler experiment and
the boundary for a future procedural humanoid compiler. Blender remains a
tooling dependency; browser, shared contracts, and game runtime packages do not
import Blender code or objects.

## Golden Reference Offline Bake

`retarget_golden_reference.py` imports a canonical Mixamo FBX and the immutable
Quaternius target glTF, validates the versioned
`profiles/mixamo-to-quaternius-v2.json` signatures, applies the accepted
world-space rest-frame delta to 22 bones, bakes at 30 fps, freezes horizontal
pelvis motion, preserves vertical motion, and exports a complete target GLB.

The Node entry point adds source-provenance validation, Blender discovery,
two-pass isolated determinism checks, source immutability checks, canonical
metadata, and staging cleanup:

```powershell
npm run bake:golden-animation -- idle "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
npm run bake:golden-animation -- walk "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
npm run validate:golden-animation-bakes
npm run test:blender-bake
```

The low-level execution contract is:

```text
blender --background --factory-startup --python-exit-code 1
  --python tools/blender-character/retarget_golden_reference.py --
  --source <source.fbx> --target <target.gltf> --clip <idle|walk>
  --output <output.glb> --profile <profile.json>
  --profile-version mixamo-to-quaternius-v2 --frame-rate 30
  --root-motion-policy <policy> --metadata <metadata.json>
  --diagnostics <diagnostics.json>
```

See `docs/assets/golden-reference-animation-retargeting-spike.md` for hashes,
format choice, determinism, Three.js round trip, browser evidence, and limits.

## Procedural Mannequin Body Proportions V1

The first narrow recipe compiler is implemented separately from the animation
bake:

```powershell
npm run compile:procedural-mannequin -- --recipe tools/blender-character/recipes/procedural-mannequin-v0.recipe.json --blender "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --output-dir public/assets/derived/procedural-humanoids/mannequin-v0 --clean
npm run validate:procedural-mannequin
npm run test:procedural-mannequin
```

`generate_procedural_mannequin.py` imports only the immutable Golden skeleton
template, removes all vendor presentation data, generates one deterministic
engineering mannequin from six validated body parameters, unions the anatomical
volumes into one closed genus-zero surface, applies deterministic max-four
analytic weights, and exports a grounded GLB.
The Node entry point validates the recipe, runs two isolated Blender passes,
checks source immutability, performs the production Three.js round trip, and
writes manifest/diagnostic artifacts. See
`docs/assets/procedural-mannequin-v0.md` for the decision, hashes, metrics,
visual evidence, and limitations.

The complete default/extrema/seed/challenge topology matrix is available as:

```powershell
npm run validate:procedural-topology-matrix
```

See `docs/assets/generated-body-topology-v1.md` for the method decision,
version/migration policy, topology and skeleton gates, matrix results, and
fixed-camera evidence.

## Asset Studio Body Authoring

Asset Studio submits the six `CharacterRecipeV1.body.parameters` values in a
versioned request to a development-only Vite middleware.
The server writes an isolated procedural recipe snapshot and calls the same
`compileProceduralMannequin` function above. Blender and Node compiler code are
never imported into the browser bundle.

Successful jobs are served through immutable local URLs below ignored
`test-results/asset-studio-creator/`. Failed jobs are deleted and never replace
the active preview. The response includes the generated timestamp and manifest;
the manifest includes authored proportions, derived anatomy, recipe/asset
hashes, generation duration, compiler version, and validation version. See
`docs/assets/asset-studio-body-proportions-v1.md` for the complete boundary and
measured validation evidence.
