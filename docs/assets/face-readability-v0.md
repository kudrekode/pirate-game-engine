# Face Readability V0

## Known Blocking Defect

Confirmed on 2026-09-22: the generated head/face faces backwards relative to the
feet. This is an incomplete visual milestone despite passing automated checks.

The existing side screenshot was inspected directly:
`test-results/face-readability-v0/visual-matrix-accepted/procedural-mannequin-compi-de38f-aternius-hairstyle-variants/bald-rest-side.png`.
The nose points left while the toes point right. These images are local ignored
evidence. The in-app browser was unavailable during this diagnosis, so no new
browser capture was taken.

Fresh measurements from the installed bald GLB in its unrotated rest pose:

- Left foot Z = -0.09045 m; left ball/toe joint Z = +0.05654 m:
  anatomical forward is +Z.
- Head joint Z = -0.01799 m; nose bounds centre Z = -0.16353 m:
  the face projects toward -Z.
- The shared asset's 180-degree presentation rotation rotates both together
  and cannot repair their opposition.

The compiler assumes local +Y is facial forward, although this maps to the
opposite direction from the Golden feet. The preceding head-volume pass also
uses that assumption. Swapping Front/Back camera labels hid the disagreement;
it did not establish correct anatomy.

Next fix: align generated head volumes, facial landmarks/features, and fitted
hair clearance with the existing skeleton's forward direction; restore camera
presets consistent with both Golden and procedural bodies. Preserve the Golden
rest skeleton and animation contract. Add an independent exported-artifact
check comparing face projection with foot-to-toe direction, regenerate both
artifact sets, and inspect full-body side views in Rest/Idle/Walk.
Start in `generate_procedural_mannequin.py`,
`procedural-mannequin-roundtrip.mjs`, and Asset Studio `App.tsx`.
Existing numerical gates test self-consistency, not this anatomical relation.

## Result

Face Readability V0 adds compiler-generated eyes, a low-poly nose wedge, and an
understated mouth line to the procedural humanoid. These are real skinned GLB
meshes generated in Blender, not browser overlays. They use the existing
65-joint Golden compatibility skeleton and are weighted entirely to `Head`.

The only new authored control is `CharacterRecipeV1.appearance.face.eyeColor`.
Eye colour is compiled into the shared `ProceduralEyeMaterial`; nose geometry
reuses `ProceduralSkinMaterial`, and the mouth uses one fixed dark
`ProceduralMouthMaterial` for reliable contrast. Eye shape, spacing, nose, and
mouth remain fixed compiler presentation in V0.

## Pre-implementation Audit

The default Procedural Head V1 contract measured:

- centre `[0, 0.0264, 1.5881]` m;
- width/depth/height `0.346707 × 0.288124 × 0.276179` m;
- Blender-local right `+X`, forward `+Y`, and up `+Z`;
- forehead reference near local `Z = 1.6323` m;
- chin floor near local `Z = 1.4500` m.

Baseline fixed-camera captures showed a usable cranium and fitted hair but a
blank face plane with no readable gaze, nose silhouette, or mouth. The first
feature draft led to swapping the preview's Front/Back labels and showed that
placing eyes at maximum head depth produced a detached three-quarter silhouette.
The pass derives a slightly inset face plane from measured head depth. The
camera-label swap was incorrectly treated as a correction; see the blocking
orientation diagnosis above.

## Head and Face Contract

`manifest.head.version` is `procedural-head-contract-v2`. The contract extends
the measured V1 head/scalp landmarks with:

- `facePlane`: centre and `+Y` forward direction;
- `eyeLine`: centre and eye separation;
- `noseCentre`;
- `mouthLine`: centre and width;
- `chinReference`.

All landmarks are derived from measured remeshed head bounds. There are no
hard-coded world positions or vertex-index contracts. Missing face appearance
in older CharacterRecipe saves and procedural recipe versions V0–V4 migrates
to the historical default `#4b5d67`.

## Generated Geometry and Materials

The accepted default bald artifact contains:

- body: 2,760 vertices / 5,516 triangles;
- face features: 110 exported vertices / 148 triangles;
- total: 2,870 vertices / 5,664 triangles, five skinned meshes, three
  materials, one skin, and one 65-joint skeleton.

The default haired artifact contains 3,336 vertices / 6,494 triangles, six
skinned meshes, four materials, two hair textures, one skin, and the same
skeleton signature. The fitted buzzed cap keeps its 830 triangles. Its central
front vertices are lifted to a shallow hairline derived from forehead, face
plane, head-width, head-depth, and head-height landmarks so hair does not
occlude the generated eyes.

Version identifiers:

- procedural recipe: V5;
- compiler: `procedural-mannequin-blender-v6`;
- round-trip validator: `procedural-mannequin-roundtrip-v7`;
- face feature: `procedural-face-readability-v0`;
- eye material: `procedural-eye-material-v1`;
- head contract: `procedural-head-contract-v2`.

## Validation

Each GLB must contain exactly two eye meshes, one nose, and one mouth. The
validator checks finite geometry, left/right symmetry, eye separation and
bounds, nose projection, mouth placement, material assignments, full Head-only
weights, animation-relative Head attachment, one shared skin/skeleton, and
deterministic face geometry and placement.

The eight-case appearance matrix is written to
`test-results/face-readability-v0/appearance-matrix/summary.json`. Four skin
cases and four isolated eye-colour cases passed. Recipe, material, and output
hashes changed for every appearance; face geometry, body geometry/skinning, and
skeleton signatures remained invariant.

The paired body/hair matrix is written to
`test-results/face-readability-v0/body-hair-matrix/summary.json`. It compiled 12
artifacts across six representative body shapes. Every bald/haired pair kept
identical body geometry/skinning, face geometry, and skeleton signatures; every
face and hairstyle fit gate passed.

The previously accepted 30-image visual matrix is in
`test-results/face-readability-v0/visual-matrix-accepted/`. It covers Front,
Side, Three-quarter, Close front, and Close three-quarter for bald and haired
Rest, Idle, and Walk. The face reads at normal gameplay distance, both eyes
remain clear with hair, the nose has a restrained side silhouette, and no
feature detaches during animation. That acceptance missed the backwards face;
the side image demonstrates why these captures are not an orientation pass.

### Review Checkpoint (2026-09-22)

The pending Face Readability change was reviewed against source, generated
fixtures, and local evidence. Both installed GLBs passed fresh Three.js
round-trip/hash validation; `npm run test:blender-bake` passed all 29 tests, and
`npm run check:asset-studio` passed contract/app tests, typechecks, and builds.
Root `npm run ci` also passed: 71 test files / 568 tests, typecheck, and build;
`git diff --check` was clean. The matrix summaries and 30 accepted PNG files above
were checked as existing
evidence; this documentation review did not rebuild matrices or rerun browsers.

Browser evidence is scoped: `visual-matrix-accepted/.last-run.json` reports
passed, while `asset-studio-e2e/.last-run.json` records a failed full run.
The serial Golden Reference error context records a 240-second timeout during
a Front-camera click. A fresh full browser pass is still needed before claiming
the entire Asset Studio E2E suite is green. All these paths are beneath
`test-results/face-readability-v0/` and are ignored local artifacts.

Coverage changed in this milestone: the hairstyle matrix replaces ten haired
body shapes with six paired bald/haired shapes; the focused camera matrix uses
five face views instead of seven whole-head views. Body/skinning semantic
comparison now excludes exporter-derived normals as well as UVs; positions,
indices, joints, and weights remain covered. Full semantic/binary determinism
checks still run during compilation.

To rerun the existing browser suites, use
`npm run test:e2e:asset-studio` and
`npm run test:e2e -- e2e/procedural-mannequin.spec.ts`.
See the [quick resume](../ASSET_STUDIO_ARCHITECTURE.md#quick-resume) for exact
source files and the current command map.

## Limits and Next Milestone

This remains an engineering mannequin: no brows, eyelids, ears, expressions,
facial rig, blend shapes, face textures, or authored feature proportions. The
nose and mouth are deliberately fixed and low-detail. The single buzzed style
has a coarse helmet-like low-poly hairline and a fixed vendor-authored colour.

**Correct head/face orientation first**, including an independent regression
gate and fresh visual inspection. Hair Colour V1 follows that correction, then
Hairstyle Library V2 through the existing fit-profile contract. Shirt Slot V1
remains deferred.
