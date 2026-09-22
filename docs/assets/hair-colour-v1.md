# Hair Colour V1 and Face Orientation Correction

## Result

The procedural face, head volumes, chest marker, and hair fit now use the
Golden skeleton's -Y forward direction (+Z after GLB export). The shared
180-degree presentation offset and 65-joint skeleton are unchanged. Front/Back
camera presets again agree with both Golden and procedural bodies.

Eyes, nose, and mouth fit to ray intersections with the generated head surface;
eye placement remains symmetric. An independent GLB gate compares all four
facial meshes with the exported foot-to-toe direction and rejects reversed
features even after a global rotation. This fixes checkpoint `977ef10`.

Hair controls now provide a colour picker, five presets, reset, stale-preview
status, and Recent Compilations restoration. `CharacterRecipeV1.palette.hair`
flows through request V6 into procedural recipe V6 `appearance.hair.color`.
The compiler converts sRGB to linear base colour, fixes roughness at 0.72 and
metallic at 0, and retains the vendor normal map. Source assets are untouched.
Bald recipes retain the authored colour but export no hair material.

## Contracts and Artifacts

- Compiler V7, validator V8, topology V3, head contract V3, Buzzed fit V3.
- Procedural V0?V5 recipes migrate to brown `#3b2a1f`; V5 eye colour survives.
  CharacterRecipe remains V1 and already preserves authored hair palette data.
- Default bald GLB: 2,876 vertices, 5,676 triangles, five meshes, three materials,
  zero textures. Buzzed: 3,342 vertices, 6,506 triangles, six meshes, four
  materials, one normal texture. Both use the unchanged 65-joint skin.
- Both installed artifact sets include regenerated GLBs, manifests, diagnostics,
  build logs, and recipe snapshots. Orientation and hair material results are
  exposed in their manifests. No game schema or gameplay semantics changed.

## Validation

Current evidence is recorded under `test-results/hair-colour-v1/`.
These generated artifacts are local and ignored by Git.

- `npm run test:blender-bake`: compiler, migration, orientation regressions,
  immutable hair provenance, and installed GLB round trips.
- `npm run check:asset-studio`: workspace contracts, app tests, types, and build.
- `npm run validate:procedural-appearance-matrix -- --hair-colors`: four colours;
  all mesh geometry, skinning, and skeleton hashes must stay identical while
  recipe, material, and output hashes change.
- `npm run validate:procedural-appearance-matrix`: eight skin/eye combinations.
- `npm run validate:procedural-hairstyle-matrix`: six bodies, each bald/haired.
- Browser captures check Front/Side/Three-quarter in Rest/Idle/Walk and close
  head views, compiled blond hair, and recent recipe restoration.

Observed results: both fixtures build deterministically; the four-colour and
eight-appearance matrices pass; six bodies produce twelve passing bald/haired
artifacts. All five Asset Studio browser scenarios passed across the main run
and the body-authoring retry (the initial run was interrupted by a dev-server
reload during formatting). Player/NPC integration passed. Visually inspected
bald/blond close-up, side, and walking captures confirm aligned anatomy and
surface-seated facial features.

Final checks: `npm run ci` passed (71 files / 570 tests plus typecheck and
production build); Asset Studio checks and 31 compiler tests passed. The first
CI attempt ran alongside Blender and hit editor timeouts; the isolated rerun
passed. `git diff --check` is clean.

Remaining validation limitation: the existing Three performance smoke failed
twice (including an isolated retry) waiting for the pirate character to enter
`walk` after ArrowUp; its last snapshot remained `idle`, with all imported
assets loaded and no missing/incompatible clips. Evidence is in
`test-results/hair-colour-v1/perf-retry/`; no runtime or performance-harness
code was changed. The focused mannequin player/NPC browser check passed.

## Limits and Next Step

This remains a low-detail engineering mannequin with fixed facial features,
no facial animation, and one coarse Buzzed hairstyle. Hair colour replaces the
vendor base-colour texture rather than recolouring its baked highlights.
The local compiler requires Blender; there is no deployed compilation backend.

Next is Hairstyle Library V2 using existing registry, provenance, and fit
profiles. Shirt Slot V1 remains deferred. Start with the
[quick resume](../ASSET_STUDIO_ARCHITECTURE.md#quick-resume) for exact files.
