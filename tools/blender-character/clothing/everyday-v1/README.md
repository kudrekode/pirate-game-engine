# Everyday Outfit v1

Editable source for one canonical-human outfit. `outfit.blend` contains three
sewn garment meshes, UVs, fabric thickness, Golden weights and independent mass,
athletic and broad-frame fit targets. It is separate from the canonical body.
The product compiler appends these meshes; it does not regenerate the pattern.

The source was authored for this project with deliberate torso/shoulder/sleeve
panels, a shared trouser saddle seam and a rounded boot toe/sole/ankle profile.
`author_everyday_outfit.py` is the reproducible authoring bootstrap. Rebuilding
intentionally overwrites this revision: preserve future hand edits as a new
revision before running it. Current source hashes live in the shared component
registry. `PROVENANCE.txt` distinguishes original garment art from CC0-derived
fit targets and initial weights. No third-party clothing asset was imported.

## Fit and skinning

Canonical triangle/barycentric correspondence transports bounded body deltas
onto the garment surface; each saved target starts independently at Basis.
Inner and outer surfaces share the same delta and weights. Local shoulder weight
smoothing distributes folds across the sewn cloth rings. The cuffs follow the
upper arms. Trousers have a broader knee blend and exclude opposite-leg weights
away from the saddle. Boot shafts follow the calf under the trouser cuffs,
transitioning to foot/ball weights toward the instep and toe. Foot geometry is
unchanged by the existing three body morphs, so boot fit targets are deliberately
zero. Height uses the existing uniform parent transform.

`coverage.json` stores canonical polygon IDs, bound to the immutable body hash.
Compile-time removal affects only temporary body faces and preserves corner UVs
and source vertex identities. Collar, sleeve, waist and ankle margins overlap
retained skin or the neighboring garment; masks never cut at a visible opening.
Each slot uses its own mask, including when the other slots are explicitly none.

Accepted samples: Athletic (0,0,0), Fuller (1,0,.15), Broad (0,.25,1),
Custom (.5,.4,.4), in mass/athletic/broadFrame order. Clothing rejects the combined
sum above 1.65, even though the unclothed creator retains each 0–1 control.
This is a conservative product boundary, not exhaustive continuous fit proof.

## Reproduction and focused checks

From repository root, using the existing Blender 5.2 executable:

```powershell
$clothingBlender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
# Authoring only; refresh the registry source hashes if intentionally revising art.
& $clothingBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/author_everyday_outfit.py
& $clothingBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/everyday_outfit_test.py
node tools/blender-character/verify-everyday-outfit.mjs --case athletic,fuller,broad,custom --list
# After inspecting that selection, replace --list with --build (four preview passes).
node tools/blender-character/procedural-mannequin-compiler.mjs --recipe tools/blender-character/recipes/authored-human-everyday-v1.recipe.json --output-dir public/assets/derived/authored-humans/everyday-v1
& $clothingBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/render_everyday_outfit.py -- --case fuller --glb test-results/first-outfit/compiled/fuller/mannequin.glb --selection idle:three-quarter,walk:side,raised-arm:torso-back,crouch:side --list
```

Remove `--list` to render only those four views. Full finalisation remains two
builds and two exported round trips. `--mode preview --staging` selects one build
and one round trip. Source checks and renders are opt-in; cheap clothing contract,
API, provenance and installed-fixture round trips are included in existing CI.

The complete product acceptance is recorded in
[the first outfit result](../../../../CHARACTER_CREATOR_FIRST_OUTFIT_RESULT.md).
