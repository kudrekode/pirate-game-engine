# Canonical authored human v1

**Accepted experimental creator foundation, with minor remaining art work.**
The optional tank is unfinished and excluded from all product compiles.
See [the integration result](../../../../CANONICAL_AUTHORED_HUMAN_INTEGRATION_RESULT.md).

`candidate.blend` is the editable source: Basis plus six identity keys, all at
zero; original UVs/triangles; Golden's unchanged 65-joint rig. The body receives
one coherent local contour/weight revision. Face, hands, feet, eyes, brows and
short hair retain their original geometry. The old tank remains in the source
for provenance, but the product adapter always removes it.

Provenance: immutable Quaternius Superhero_Male_FullBody and Hair_Buzzed → packed
V2 candidate (also the unchanged V3 source) → canonical-v1. `revision.json` records
the two Blender hashes and local change counts. The bundled CC0 licence and
vendor file hash snapshot are copied unchanged from the V2 package. V4/V5 are
diagnostic references, not the accepted input. No historical package is replaced.

The installed default is
`public/assets/derived/authored-humans/canonical-v1/`, including GLB, manifest,
compiler recipe, diagnostics and build log. It loads through the existing shared
Three loader and clone path. Identities are baked; no runtime morph system is added.

## Reproduction

Run from repository root, with the existing Blender 5.2 installation. Building
the art source intentionally rewrites **this** revision; preserve any later manual
edits as a new revision before running the bootstrap again.

```powershell
$canonicalBlender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $canonicalBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_canonical.py -- --build
& $canonicalBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_canonical_test.py
node tools/blender-character/procedural-mannequin-compiler.mjs --recipe tools/blender-character/recipes/authored-human-canonical-v1.recipe.json --output-dir public/assets/derived/authored-humans/canonical-v1
node --experimental-strip-types tools/blender-character/verify-authored-human-canonical.mjs --list
# Eight endpoint preview builds; deliberately explicit, outside CI.
node --experimental-strip-types tools/blender-character/verify-authored-human-canonical.mjs --build
```

Endpoint validation uses the actual shared `cloneThreeVisualAssetRoot` and checks
stable source-ID triangle/UV correspondence. `source-validation.json` records
source preservation; `endpoint-validation.json` records the eight compiled cases.
Node texture decoding is stubbed for structural checks. Actual textures are
reviewed in Blender and the browser.

The compact renderer requires explicit selection review with `--list` first:

```powershell
& $canonicalBlender --background --factory-startup --python-exit-code 1 --python tools/blender-character/authored_human_canonical.py -- --stage candidate --list
# Remove --list for the 18 primary neutral/combined views.
```

Additional recorded selections: both identities with
`--selection idle:torso-back,elbow:three-quarter,hip:back,crouch:joints-front` (8);
head-wide/head-narrow/jaw/nose with `rest:face-three-quarter` (4);
fuller/athletic/broad with `rest:front` (3); neutral with `hand:hand-close` (1).
Baseline uses `--stage baseline --build`, then the primary selection for neutral
only (9). Total body review: 43 actual renders, not a historical matrix.

`authored_human_canonical_tank.py` makes the optional repair study in ignored
`test-results/authored-human-canonical-v1/tank/`; render with `--stage tank
--selection rest:torso,raised-arm:torso-back` (4 views). It does not edit the
accepted candidate. The tank remains excluded; no body mask was introduced.

Browser checks: the root `@canonical-human` case needs Studio running on 5174
and tests engine → controls/cameras → preview → full compile → engine. Studio's
`@canonical-preview` case checks final presentation without Blender. Existing
procedural/reference browser cases explicitly request `?family=legacy`.
