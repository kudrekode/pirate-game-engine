# Phase 3 — Visual, Browser & Compiler Workflow Optimisation

## 1. Executive Summary

Phase 3 separates browser integration, real compilation, appearance acceptance,
performance and historical diagnostics. Default root Playwright now selects three
integration cases; default Asset Studio selects one fixture integration case with
zero real compiler requests and zero success screenshots. Expensive acceptance is
explicit and retains its appropriate rendered or real-compiler boundary.

The creator integration now makes one real request instead of three. Request
snapshots, three seeded histories, metadata, restoration and failure preservation
are covered in a component test using fake compiler responses. Generated geometry
is still checked using actual compiler/GLB tests and real visual cases.

Current Golden captures are nine complementary views instead of 27, with all
sampled joint assertions retained and the full 27 available explicitly. Three
rejected-v1 images are a separate historical case. Offline previews no longer
request historical runtime quality reports or present those metrics as current
artifact quality. Hair/material galleries remain intact.

No gameplay, asset appearance, saved-project schema, compiler generation algorithm
or large component structure changed. A small shared matrix-selection helper was
added; no artifact cache or component extraction was introduced.

## 2. Before / After Workflow

### Pre-change inventory (4 October 2026)
Captured by static inspection before workflow edits. Counts exclude automatic
failure screenshots/traces, which both configs retain. Timeouts are not runtimes.
No full browser suite or matrix was executed to construct this inventory.

| Case / trigger | Purpose / cadence | Success images | Real compile requests / Blender passes | Existing cheaper ownership / inspection |
| --- | --- | ---: | ---: | --- |
| Root Golden asset | Browser loader/editor/runtime integration; targeted | 2 | 0 / 0 | Loader/registry/GLB tests own joint/geometry counts; visual review only for changed appearance |
| Root haired mannequin | Browser loader/editor/runtime integration; targeted | 2 | 0 / 0 | Procedural round-trip tests own exported rig/fit invariants |
| Three animation | Keyboard/RAF/walk/idle/attack; targeted | 0 | 0 / 0 | Shared timing/controller tests; Phase 2 observed 21.0 s |
| Three performance | Settled editor/runtime timing windows; targeted | 2 | 0 / 0 | Real browser required; Phase 1 observed 44.4 s, not a universal cost |
| Studio checked-in preview | Mounted preview/animation/source replacement; targeted | 9 | 0 / 0 | Exact geometry numbers duplicate Node validation; images belong to appearance acceptance |
| Studio random body workflow | Request, compile, preview, randomization/history; targeted | 1 | 3 / 6 | Creator/component/API tests can cover requests, metadata, failure and history; retain one real integration |
| Studio skin/roughness | Material isolation and appearance; milestone | 3 | 3 / 6 | Appearance matrix owns hashes and material invariants; visual colour/roughness inspection remains |
| Studio bald/Buzzed | Face/hair fit/deformation; milestone | 30 | 2 / 4 | Node fit/weights/hashes; actual rendered fit inspection required |
| Studio Short Crop/Parted | Style fit/deformation; milestone | 24 | 2 / 4 | Registry + hairstyle matrix; actual rendered fit inspection required |
| Studio Long/Buns | Neck/shoulder clearance and silhouette; milestone | 30 | 2 / 4 | Current source has five views, so 30 images, not the older audit's 24; visual inspection required |
| Studio Golden current + rejected-v1 | Animation deformation plus historical diagnostic; milestone | 27 current + 3 historical | 0 / 0 | Node pose/round-trip checks duplicate numeric assertions; historical comparison must be explicit |

Current Studio total: **7 cases, 127 images, 12 compile requests / 24 Blender
passes**. Root: four cases, six images. A real compile writes input/snapshot,
manifest, GLB, diagnostics and build log; browser galleries write PNGs, Golden
pose JSON, while perf writes snapshots, metrics, console/network JSON and PNGs.

Matrices (all opt-in, no screenshots): topology 21 bodies / 42 passes; appearance
8 skin/eye combinations / 16 passes, or `--hair-colors` 4 / 8; hairstyle baseline
6 bodies x bald/Buzzed = 12 / 24; current `--library` includes all six registered
choices = 36 / 72. The old resume's 24 / 48 predates Long/Buns. These scripts
always rebuild; hashes/round trips belong here, not a repeated browser gallery.

Existing source hashes, compiler hash, recipe hash, output hash and diagnostics
are available, but installed-artifact validation is not an exact current-source
cache check. Reuse must not be inferred from a recipe hash or old pass alone.

### Implemented routing and structural cost

Counts are explicit success images; failure screenshots/traces remain enabled.
A compiler request performs two isolated Blender builds. Listing tests or matrices
does not execute those builds.

| Workflow | Before: cases / compile calls / Blender passes / images | After: cases / compile calls / Blender passes / images |
| --- | --- | --- |
| Default root browser command | 4 / 0 / 0 / 6 | 3 / 0 / 0 / 0; performance is explicit |
| Default Studio browser command | 7 / 12 / 24 / 127 | 1 / 0 / 0 / 0 |
| Studio creator real boundary | 1 / 3 / 6 / 1 | 1 / 1 / 2 / 0 |
| Fixture integration | 1 / 0 / 0 / 9 | 1 / 0 / 0 / 0; nine images in separate visual case |
| Golden acceptance plus history | 1 / 0 / 0 / 30 | Current: 1 / 0 / 0 / 9; historical: 1 / 0 / 0 / 3 |
| Explicit all-current Studio sweep | Previously inseparable from history | 8 / 10 / 20 / 105 |
| Explicit all Studio purposes including history | 7 / 12 / 24 / 127 | 9 / 10 / 20 / 108 |

The increase in available cases reflects splitting integration/appearance and
current/history. Coverage was routed rather than simply removed. Broad current
Studio still contains six visual cases: Golden, fixture mannequin, materials,
bald/Buzzed, Short Crop/Parted and Long/Buns. Root asset/performance success images
remain available with `CAPTURE_VISUALS=1`.

The same fixture integration was measured before and after: 24.5 s test / 28.3 s
whole command before, 10.8 s / 14.7 s after. This single local pair is 13.6 s less
whole-command time (about 48%); it is not a universal speedup claim. The before run
included nine captures, which now belong to explicit appearance review. The real
compiler boundary passed in approximately 1.3 minutes after narrowing it; no new
three-compile baseline was run just to obtain a comparison.

## 3. Validation Responsibility Map

| Failure or criterion | Owning layer and retained evidence |
| --- | --- |
| Gameplay and state correctness | Existing pure runtime/helper tests; unaffected in this phase |
| Request shape, seeded parameters, history, failure and metadata | Creator/component tests with fake responses; endpoint Node tests own API normalization and publication |
| Hashes, parameter encoding, topology, materials, skeleton, bounds and provenance | Existing Node compiler/GLB/round-trip tests and relevant fresh matrix artifacts; fake metadata is not geometry evidence |
| Mounted WebGL, loading, resource ownership, source switching | Root asset integration and Studio fixture integration; keyboard/RAF animation remains its own browser case |
| Real browser/API/compiler/served-artifact connection | One explicit creator compiler case, including current recipe/output identity and preview animation |
| Silhouette, anatomy, scalp exposure, fit, clipping, materials and deformation | Explicit rendered galleries plus inspection; numerical gates alone are insufficient |
| Rendering performance and asset/frame observations | Explicit Three performance case, unchanged timing/diagnostic assertions; optional success images |
| Rejected retarget version and old runtime quality metrics | Explicit historical gallery and existing deterministic retarget tests; historical reports fetched only in historical runtime modes |

The former current browser quality assertions read runtime-v2's historical report,
not the offline-baked output. They were removed from current acceptance. Actual
offline round-trip status, sampled joint transforms, bone-length preservation and
pose/camera checks remain. Historical numerical quality tests remain at Node level.

## 4. Real End-to-End Coverage Retained

`npm run test:e2e:asset-studio:compile` still randomizes a real recipe, posts it
through the browser to the Vite compiler endpoint, performs two Blender builds,
validates/publishes the generated GLB, loads its URL into the preview, observes its
animation and restores the recent result without a second request. It records
`compiled-artifact.json` with the request count, hashes, parameters and bounds.

Material and hairstyle appearance cases still invoke the real compiler because
their purpose is generated-output acceptance. Root Golden/mannequin editor/runtime
loading and the keyboard animation integration are retained. No compiler mock was
introduced into a geometry acceptance case.

## 5. Visual Acceptance Retained

Current Golden's nine captures cover three Rest angles (front, side, three-quarter),
frontal Idle at 25%, all four quarter-cycle Walk samples from the side, and frontal
Walk at 25%. These expose silhouette, frontal symmetry, arm placement and alternating
stride readability. All 27 original pose/view observations still execute numerical
assertions and record JSON. `FULL_VISUAL_GALLERY=1` restores all 27 images when
animation/deformation changes require every angle.

The fixture mannequin keeps nine Rest/Idle/Walk views in a new explicit appearance
case. Materials retain three distinct appearances. Bald/Buzzed retains 30 images,
Short Crop/Parted 24, and Long/Buns 30. Front/close views expose face/scalp; side/rear
views expose crown, neck and shoulder clearance; animation distinguishes static
fit from deformation. There was no evidence to remove those criteria.

During this phase five current Golden images were directly reviewed: three-quarter
Rest, frontal Idle 25%, frontal Walk 25%, and side Walk 25%/75%. They show the intended
framing, distinct rest/idle/stride poses and no gross pose collapse. This review
validates the usefulness of the selection, not a new anatomy or hair milestone.
The other captured images remain available for criterion-specific review. Existing
Long/Buns acceptance status is unchanged.

## 6. Artifact Reuse

No cross-run cache was added. Existing manifests carry compiler/recipe/output hashes
and versions, and source provenance exists. However, installed `--validate-only`
checks artifact/recipe/round-trip consistency without comparing every current
compiler/source/Blender input. Treating it as a freshness check would silently allow
stale geometry after a compiler change.

A robust reuse key would need canonical recipe identity, compiler and validator
source identities, relevant source assets/registry/fitting profiles, Blender build
identity and verified output hash. The current implementation does not enforce
that whole identity, so this phase does not claim exact-input cache reuse. A partial
cache would create more risk than the remaining targeted rebuild cost warrants.

Existing safe narrow reuse remains: Recent Compilations restores its exact successful
session result/URL without recompiling; the explicit fixture gallery reviews named
checked-in artifacts without Blender. Neither claims to represent a fresh build
of today's compiler. Keep recipe snapshot, manifest, diagnostics, build log and GLB
together; rebuild after changed compiler, geometry, sources, fitting or validation.
General matrix-to-browser artifact replay is deferred until identity is enforced.

## 7. Matrix Routing

| Change scope | Required selection | Artifacts / Blender passes |
| --- | --- | --- |
| One recipe/local fit | Fresh affected recipe and representative rendered views | 1 / 2 |
| One style on one troublesome body | Hair `--style <id> --case <name>` including bald control | 2 / 4 |
| One style's fit across body extremes | Hair `--style <id>` across six bodies, including bald controls | 12 / 24 |
| Local topology boundary | Topology `--case default,height-max` or relevant exact names | 2 / 4 in this example |
| Shared head/fitting algorithm | Full hairstyle `--library` | 36 / 72 |
| Foundational body/skinning/parameter algorithm | Full topology; hair matrix too if affected | 21 / 42 topology |
| Skin/eye material encoding | Appearance matrix | 8 / 16 |
| Shared hair material encoding | Appearance `--hair-colors` | 4 / 8 |

Topology and hairstyle runners accept exact comma-separated case selections and
`--list`. Hairstyle also accepts exact `--style` ids and always retains bald controls.
Unknown/empty selectors fail before compilation. Listing reports selection and cost
without generating output. Full defaults and existing geometry/face/skeleton gates
remain unchanged; a partial summary cannot stand in for full-matrix evidence.

No fresh full matrix was justified for this routing-only change. Unit tests exercise
selection, invalid inputs and no-build listings. Matrix generation algorithms and
installed assets were not changed.

## 8. Agent Command Guide

Use `npm.cmd` on Windows when forwarding flags. List a browser selection with
`-- --list` before launching expensive work. Detailed routing and capture modes
are maintained in [docs/PLAYWRIGHT_SMOKE.md](docs/PLAYWRIGHT_SMOKE.md).

| Change | Commands / next step |
| --- | --- |
| Gameplay/helper | `npm run test:run -- src/runtime/movement.test.ts` (substitute affected file), then final CI; no browser |
| Editor copy/control | `npm run test:run -- src/test/editorSmoke.test.tsx`; targeted browser image only for layout acceptance; no compiler |
| Studio request/history/failure | `npm run test:run -- apps/asset-studio/src/App.test.tsx apps/asset-studio/src/proceduralMannequinCreator.test.ts`; optional `npm run test:e2e:asset-studio:preview` |
| API/request handling | `node --test tools/blender-character/procedural-mannequin-creator-api.test.mjs`; real `npm run test:e2e:asset-studio:compile` only when that boundary needs proof |
| Matrix routing | `node --test tools/blender-character/matrix-selection.test.mjs`; inspect `--list` |
| One hairstyle fitting change | `npm run test:compiler`, selected fresh compile/matrix below, then affected existing hair gallery with `--grep "length-aware"` or `--grep "Hairstyle Library V2"` |
| Core compiler geometry | `npm run test:compiler`, justified relevant/full matrices, representative visual review, one real compiler integration |
| Golden deformation | `npm run test:e2e:asset-studio:visual`; use full image mode when needed |
| Historical retarget investigation | `npm run test:e2e:asset-studio:historical`; existing `?retarget=failed-v1` and `?retarget=runtime-v2` remain |
| Render performance | `npm run test:e2e:three-perf`; inspect JSON/frame metrics, images only if needed |

Concrete targeted matrix commands:

```powershell
npm.cmd run validate:procedural-topology-matrix -- --list
npm.cmd run validate:procedural-topology-matrix -- --case default,height-max --output-root test-results/topology-targeted
npm.cmd run validate:procedural-hairstyle-matrix -- --style quaternius-hair-long-v1 --case default --list
npm.cmd run validate:procedural-hairstyle-matrix -- --style quaternius-hair-long-v1 --case default --output-root test-results/long-targeted
```

For a single recipe, use the compiler's `--recipe`, `--output-dir` and `--staging`
flags as documented in the routing guide. It does not require a whole matrix.
Full sweeps are deliberately named `test:e2e:all-current` and
`test:e2e:asset-studio:all-current`; the latter remains expensive. Final gate for
code changes is `npm run ci` then `git diff --check`, not all browser galleries.

## 9. Validation Results

The targeted runs below used the existing installed browser and Blender. Counts
exclude preliminary selector listings and commands that exited before executing
any tests. Local logs under `test-results/` are ignored artifacts, not committed
benchmark fixtures.

| Check | Result / evidence |
| --- | --- |
| Focused creator/component tests | 21 passed across two files; 8.05 s; `test-results/phase3-ui.log` |
| Matrix-selection Node tests | 3 passed; approximately 115 ms; `test-results/phase3-matrix-selection.log` |
| Default and explicit selection listings | Root default 3, Studio default 1, compiler 1, all Studio purposes 9; corresponding `phase3-*-selection.log` |
| Fixture integration before | 1 passed, 24.5 s test / 28.3 s total; nine images; `phase3-preview-before.log` |
| Fixture integration after | 1 passed, 10.8 s test / 14.7 s total; zero images/compiles; proves no historical report request; `phase3-preview-after.log` |
| Real compiler browser boundary | 1 passed, approximately 1.3 min; one compile/two Blender passes; `phase3-real-compile.log` |
| Current Golden + explicit historical | 2 passed; current 83.251 s, historical 12.567 s, total 98.243 s; nine + three images; `phase3-galleries.json` |
| Separated fixture appearance gallery | 1 passed, 25.6 s total, nine images and no compile; `phase3-fixture-gallery.log` |
| Full CI | Passed: 614 Vitest tests / 73 files, root and all workspace builds, 43 Node compiler/provenance tests; `phase3-ci-fixed.log` |
| `git diff --check` | Passed; no whitespace errors |

Real build evidence is in
`test-results/asset-studio-creator/procedural-mannequin/064498c9-c4fc-4b12-b174-c79ff1a50f1e/output/manifest.json`.
Compiler is `procedural-mannequin-blender-v7`, validator is
`procedural-mannequin-roundtrip-v8`, and recorded generation duration is 66,949 ms.
Recipe hash is `063a11be9a856a06d44fd21470f11bf62853ba0189e01c2528ea70c978f6c69c`;
output hash is `7c9ec3e46bd514507c6f2f16d6db43b1a257e5f5f527090ddc042ca34fd1aa3a`.

The first CI run passed 614 Vitest tests and root/package builds, then caught an
unsupported `exact` option in the new Testing Library role query during Studio
typechecking. That test-only option was removed; string role names already match
exactly. CI was rerun because of this concrete failure, rather than repeating a
passing gate. Initial Playwright selection also exposed config/CLI grep intersection;
configs now apply the integration default only without an explicit grep. A Windows
regex-pipe forwarding failure was corrected by invoking the Playwright Node CLI.
Neither failed selector attempt ran compiler work.

Unchanged expensive hairstyle/material galleries, broad root/performance execution,
full Golden 27-image mode and fresh full Blender matrices were not run. Their cases,
assertions and selectors were inspected; no new performance or full style acceptance
is claimed. Root changes only tag cases and gate success screenshots, retaining
failure evidence and timing assertions.

## 10. Deferred Findings

- Strong cross-run artifact identity and matrix-to-browser replay require deliberate
  freshness/provenance enforcement; no unsafe reuse shortcut was added.
- Hair/material galleries still perform real builds and can be expensive. Their
  appearance coverage is valuable; run only the affected style/material scope.
- Long/Buns fitting and appearance remain separate milestone work. This phase does
  not change or certify the generated geometry.
- Historical retarget assets/reports remain for diagnosis. Deleting or restructuring
  them was outside scope.
- Existing bundle-size and browser environment warnings are not addressed by this
  workflow change. A single local timing pair is insufficient for a general benchmark.
- Large App/editor/runtime refactors, gameplay changes and asset packaging remain
  out of scope. Previous Phase 1/2 reports remain historical records.

## 11. Recommendation

The workflow is proportionate enough to proceed to separately scoped structural
refactoring or ordinary feature work: cheap correctness checks own routine changes,
one explicit real compiler boundary remains, and expensive visuals/matrices have
clear triggers and costs. Follow the command routing rather than defaulting to a
broad browser sweep. Keep appearance inspection for geometry/fitting/deformation
changes and introduce cross-run caching only with verified identity. Phase 3 ends
with this report; no subsequent refactoring is started.