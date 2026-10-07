# Validation and Playwright Routing

Choose the cheapest layer that can detect the changed failure. Browser and Blender
work is opt-in; neither runs in `npm run ci`. Passing a numerical gate does not
approve silhouette, anatomy, hair fit, materials or deformation.

## Deterministic ownership and final gate

Run `npm run test:run -- <affected-file>` during iteration. Pure helpers/contracts
run in Node; mounted React boundaries use jsdom. Root and workspace owners remain
disjoint, isolated and single-worker. `npm run ci` runs all owned Vitest tests,
type-safe root/Studio builds, three package builds/typechecks and cheap Node
compiler/provenance/installed-GLB tests. Run it once at completion, followed by
`git diff --check`; do not repeat overlapping gates afterward.

| Changed criterion | Cheapest correct command | Escalate only for |
| --- | --- | --- |
| Gameplay/helper | `npm run test:run -- src/runtime/movement.test.ts` (substitute affected file) | Final CI; no browser |
| Editor copy/control | `npm run test:run -- src/test/editorSmoke.test.tsx` | Targeted browser view if layout needs inspection; no compiler |
| Creator request/history/failure/metadata UI | `npm run test:run -- apps/asset-studio/src/App.test.tsx apps/asset-studio/src/proceduralMannequinCreator.test.ts` | Optional preview integration; fake responses cover UI without Blender |
| Compile endpoint/recipe/hash | `node --test tools/blender-character/procedural-mannequin-creator-api.test.mjs` | One real compiler boundary if HTTP, publication or integration changes |
| Geometry/material/rig/provenance | `npm run test:compiler` or affected Node test | Fresh affected compile, relevant matrix, rendered inspection |
| Shared loader/clone | `npm run test:run -- --project three-asset-preview` | Root asset or Studio preview integration |
| Matrix selection | `node --test tools/blender-character/matrix-selection.test.mjs` | `--list` inspection; no Blender required |

## Browser commands and costs

The interaction authoring route is one opt-in case:
`node node_modules/@playwright/test/cli.js test e2e/gameplay-interactions.spec.ts --grep '@gameplay-interactions'`.
Inspect `--list` first. It imports the original Tidewatch project and uses real
Inspector controls to author sign/barrel text, NPC lines, a chest reward, a keyed
door and a cell trigger. It moves only the showcase chest through ordinary
transform fields, saves the new project under `docs/assets/gameplay-interactions/`,
then uses keyboard movement/E and dialogue controls through Play, Edit and reload.
It does not write runtime positions or invoke interaction helpers from the browser.
Keep this software-rendered route separate from CI; no Blender or visual matrix.

The traversal acceptance course is one opt-in case (no compiler or Blender):
`node node_modules/@playwright/test/cli.js test e2e/traversal-collision.spec.ts --grep '@traversal'`.
Use `--list` first. It imports the unchanged Tidewatch Harbour, walks via real
keyboard input, checks steps/dock seams/props/walls/water, observes authored
Walk/Idle, then checks complete saved-project equality and replay after reload.
Two screenshots and a compact checkpoint trace are written to
`docs/assets/traversal/`. The chest physically obstructs the saved scene's doorway;
the test records that limitation instead of moving it. Unobstructed doorway and
interior behavior have deterministic geometry coverage. Run separately from CI.

Install Chromium once if needed: `npx playwright install chromium`.
On Windows use `npm.cmd`/`npx.cmd` when forwarding flags; the PowerShell shim can
swallow them. For regex arguments containing `|`, prefer an existing quoted npm
script or direct `node node_modules/@playwright/test/cli.js ... --grep 'a|b'`;
a `.cmd` forwarding layer may interpret an unpreserved pipe as a shell pipeline.
Append `-- --list` to an npm selection first. Never interpret no tests found as a
pass. Configs default to `@integration` only when no explicit CLI grep is supplied.
An explicit grep selects its purpose independently (Playwright otherwise intersects
config and CLI filters).

| Command | Selected boundary | Cases; real compiles / Blender passes; success images |
| --- | --- | --- |
| `npm run test:e2e` | Root default: Asset Creator launcher, Golden/mannequin editor-runtime integration and keyboard animation | 4; 0 / 0; 0 |
| `npm run test:e2e:assets` | Root GLTF loading/registry/player/NPC integration | 2; 0 / 0; 0 |
| `npm run test:e2e:three-animation` | Actual move and walk/idle/attack RAF observations | 1; 0 / 0; 0 |
| `npm run test:e2e:three-perf` | Settled renderer/RAF timing windows and asset diagnostics | 1; 0 / 0; 0 |
| `npm run test:e2e:asset-studio` or `:asset-studio:preview` | Fixture mount, animation, source-switch/resource ownership; asserts no historical-report fetch | 1; 0 / 0; 0 |
| `npm run test:e2e:asset-studio:compile` | Preview then finalisation through real Vite API, served GLB, failure preservation | 1; 2 / 3; 0; retains JSON identity evidence |
| `npm.cmd run test:e2e -- --grep @first-outfit` | Engine to dressed creator: Athletic/Square/Hair/Clothing, tint, front/back/walk, Fuller, finalise, downloads and recipe reopen, return | 1; 3 / 4; 4; requires Studio on 5174 |
| `npm.cmd run test:e2e -- --grep @canonical-human` | Authored default: engine launcher, preset/custom edits, cameras, body preview, face preview, hair, finalise, return | 1; 3 / 4; 3; requires Studio on 5174 |
| `npm.cmd run test:e2e:asset-studio -- --grep @canonical-preview` | Authored fixture framing and idle/walk observations | 1; 0 / 0; 3 |
| `npm run test:e2e:asset-studio:visual` | Current Golden deformation gallery | 1; 0 / 0; 9 (27 in explicit full mode) |
| `npm run test:e2e:asset-studio -- --grep "captures the checked-in"` | Checked-in mannequin appearance gallery | 1; 0 / 0; 9 |
| `npm run test:e2e:asset-studio -- --grep "isolated skin"` | Three material appearances, numerical isolation and rendered review | 1; 3 / 6; 3 |
| `npm run test:e2e:asset-studio -- --grep "bald and Quaternius"` | Bald/Buzzed face/hair fit and deformation | 1; 2 / 4; 30 |
| `npm run test:e2e:asset-studio:hair` | Short Crop/Parted plus Long/Buns; narrow further by title when possible | 2; 4 / 8; 24 + 30 |
| `npm run test:e2e:asset-studio:historical` | Rejected runtime-v1 diagnostic gallery only | 1; 0 / 0; 3 |
| `npm run test:e2e:all-current` | Explicit root sweep including performance | 4; 0 / 0; 0 |
| `npm run test:e2e:asset-studio:all-current` | Explicit broad current sweep; excludes historical | 8; 10 / 20; 105 |

The expensive material/hair cases remain real compiles because they accept generated
geometry/appearance, not simulated UI responses. Their numbers are structural
counts, not runtime predictions. The six registered hair choices include Long/Buns;
coverage existing in a gallery is not a declaration that the style is visually
accepted. All cases retain failure screenshots and traces. Root perf/asset success
images are optional with `CAPTURE_VISUALS=1`; normal summaries omit uncaptured paths.

## Screenshot selection and inspection

The world-library acceptance is one opt-in editor workflow:
`node node_modules/@playwright/test/cli.js test e2e/world-asset-library.spec.ts --grep '@world-kit' --output=test-results/world-kit/browser`.
Use `--list` first. It drags all 23 curated assets, exercises transforms and
duplication, composes a 30-object harbour, places an already finalised character,
plays, saves and reloads. It records cache requests, diagnostics, three screenshots
and ordinary project JSON. No character compiler or Blender matrix runs. Keep
this software-rendered browser check separate from CI to avoid timing contention.
The content-only GLB/thumbnail round trip is `node tools/world-kit/thumbnails.mjs`
against the running editor; it uses the shared cached loader and thumbnail helper.

The Map Editor product workflow is opt-in and uses one already finalised imported
character, with no Blender work:
`node node_modules/@playwright/test/cli.js test e2e/map-editor-product.spec.ts --grep '@map-product' --output=test-results/map-product-browser`.
It covers native asset drag/drop, transform handles, hierarchy and inspector edits,
history, character placement, Play isolation and full saved-project equality after
reload. It captures editor, Play and reloaded screenshots plus persistence evidence.

Finalised character game integration is opt-in:
`node node_modules/@playwright/test/cli.js test e2e/asset-creator.spec.ts --grep '@game-character'`.
It requires the two local servers and performs two compile requests / three Blender
passes: preview, full finalisation, scoped import, player assignment, NPC placement,
duplication/transforms/deletion, idle/walk, save/reload, five instances and a missing
artifact response. It captures four success screenshots and compact observations.
The runtime-only follow-up uses an already imported character without Blender:
`node node_modules/@playwright/test/cli.js test e2e/asset-creator.spec.ts --grep '@character-runtime-observation' --output=test-results/character-runtime-observation`.
It records two/three/five-instance metrics and checks collision and camera controls.
Keep its output separate from the primary screenshots. These are integration and
runtime observations, not character-art matrices or hardware performance budgets.

The ordinary integration and compiler cases produce no success screenshots.

For the explicit two-app return trip, start Studio, configure
`VITE_ASSET_STUDIO_URL` if needed, and run
`node node_modules/@playwright/test/cli.js test e2e/asset-creator.spec.ts --grep '@workflow-navigation'`.
This case is also tagged `@canonical-human` and now exercises the authored default,
including preview and deterministic finalisation. It requires both real servers;
the default launcher integration retains
deterministic unavailable-target coverage. Standalone return URL and alternate
origins are also covered by `GameEngineNavigation.test.ts`.

Fast compiler CLI: add `--mode preview --staging --output-dir test-results/preview`
to the existing compiler command. Omit `--mode` for full validation. Use
`python tools/blender-character/test_anatomy_invariants.py` for cheap central
surface-contour and proportional-invariant tests. `HUMAN_FOUNDATION_ROOT` can
point the existing visual case at a freshly generated targeted body selection.
The mannequin's previous nine integration images are preserved in its explicit
appearance case. Current Golden review captures three Rest views, frontal Idle
at 25%, all four quarter-cycle Walk samples from the side, and frontal Walk at
25%: nine complementary images. All original joint/sample assertions and JSON
observations still run. Set `FULL_VISUAL_GALLERY=1` for all 27 current pose/views
when deformation changes warrant checking every angle. Historical-v1's three
images are a separate command; no default preview downloads its diagnostic report.
`?retarget=failed-v1` and `?retarget=runtime-v2` remain available for investigation.

Hair views remain deliberately unchanged: front/close views expose face and scalp,
side/rear views expose crown/neck/shoulder clearance, and Rest/Idle/Walk distinguish
static fit from deformation. No evidence justifies deleting those views for a new
style or fitting change. Skin/roughness review retains its three distinct materials.

For Windows PowerShell, scope optional image modes and restore the prior setting:

```powershell
$previousGalleryMode = $env:FULL_VISUAL_GALLERY
try {
  $env:FULL_VISUAL_GALLERY = '1'
  npm.cmd run test:e2e:asset-studio:visual
} finally { $env:FULL_VISUAL_GALLERY = $previousGalleryMode }
```

Apply the same pattern to `CAPTURE_VISUALS` for root asset/performance appearance
review. Inspect the relevant image batch once and record which artifact/views were
reviewed and for which criterion. Screenshots without inspection are evidence,
not visual approval. Numeric hashes/bounds do not replace that review.

## Matrix routing: targeted, relevant, full

Human Foundation acceptance uses three explicit recipes rather than the historical
body matrix: `procedural-mannequin-v0`, `human-foundation-short-wide`, and
`human-foundation-tall-slim` under `tools/blender-character/recipes/`. Compile each
with the existing CLI into `test-results/human-foundation/{default,short-wide,tall-slim}`.
Each is still two Blender passes plus exported GLB/skeleton/idle/walk validation.
Then run:

```powershell
node node_modules/@playwright/test/cli.js test -c apps/asset-studio/playwright.config.ts human-foundation.spec.ts --grep @human-foundation
```

This opt-in spec previews those exact GLBs (hash checked against their manifests),
without compiling again: three Rest silhouettes, frontal Idle, side Walk at 25%,
frontal Walk at 75% per body. It does not establish compiler freshness; freshly
compile after generation changes. `HUMAN_FOUNDATION_CASES` narrows the comma-separated
artifact folder names. For fitting-only inspection use `HUMAN_FOUNDATION_HAIR=1`
with explicitly built hair folders for close front, side and rear views.

A matrix is a deliberate compiler acceptance run, never a generic response to an
asset-related edit. Each artifact still receives two isolated builds and the
existing exported geometry/material/rig gates. Run cheap tests first.

| Change | Selection | Maximum structural compile / pass count |
| --- | --- | --- |
| One recipe or local fit adjustment | One fresh artifact via compiler CLI; selected views | 1 / 2 |
| One hairstyle's fitting profile across body extremes | `--style <id>`; includes a bald control for each body | 12 / 24 across six bodies |
| One style on one problematic body | `--style <id> --case <name>` | 2 / 4, including bald control |
| Body/topology local issue | `--case default,height-max` (choose relevant exact cases) | 2 / 4 |
| Shared head/fit algorithm | Hair `--library` for all six bodies × six choices | 36 / 72 |
| Core body topology/skinning/parameter algorithm | Full topology default/extrema/seed/challenge set, plus relevant hair matrix if head changed | 21 / 42 topology |
| Skin/eye material encoding | Appearance matrix | 8 / 16 |
| Shared hair material encoding | Appearance `--hair-colors` | 4 / 8 |

List case names/cost without creating outputs or invoking Blender:

```powershell
npm.cmd run validate:procedural-topology-matrix -- --list
npm.cmd run validate:procedural-hairstyle-matrix -- --library --list
npm.cmd run validate:procedural-hairstyle-matrix -- --style quaternius-hair-long-v1 --case default --list
```

Run the inspected selection only when required, using a distinct output root:

```powershell
npm.cmd run validate:procedural-topology-matrix -- --case default,height-max --output-root test-results/topology-targeted
npm.cmd run validate:procedural-hairstyle-matrix -- --style quaternius-hair-long-v1 --case default --output-root test-results/long-targeted
npm.cmd run validate:procedural-hairstyle-matrix -- --style quaternius-hair-long-v1 --output-root test-results/long-body-matrix
```

Selectors use exact comma-separated names and reject unknown/empty selections.
A hairstyle selection always includes bald geometry/face/skeleton comparison.
Partial summaries report only selected cases; they are not full-matrix evidence.
Appearance matrices remain their small fixed comparative sets. For one recipe:

```powershell
npm.cmd run compile:procedural-mannequin -- --recipe tools/blender-character/recipes/procedural-mannequin-long-v1.recipe.json --output-dir test-results/long-review --staging
npm.cmd run compile:procedural-mannequin -- --validate-only --recipe tools/blender-character/recipes/procedural-mannequin-long-v1.recipe.json --output-dir test-results/long-review
```

Full matrices are justified by foundational/shared geometry changes, followed by
representative visual inspection and one real compiler/browser integration if its
boundary changed. Do not run every browser gallery after a full matrix merely to
reproduce numerical assertions. See the [compiler guide](../tools/blender-character/README.md).

## Artifact identity and reuse limits

No new cross-run compile cache is introduced. The existing source/compiler,
recipe, semantic/output hashes and version/provenance fields are useful evidence,
but `--validate-only` proves installed artifact/recipe/round-trip consistency; it
does **not** compare every current compiler/source/Blender input against the build.
It must not be used as a current-source cache hit. A cache would also need exact
compiler and validator source hashes, source assets/profile/registry dependencies,
Blender build identity, recipe and output hashes; recipe equality alone is unsafe.

Within a successful creator session, Recent Compilations reuses that exact result
and URL without another compile (now covered below browser level). The explicit
fixture gallery also reuses checked-in output without Blender, labelled as fixture
acceptance, not proof of today's compiler. Retain manifest, recipe snapshot,
diagnostics, GLB and build log together. Rebuild affected artifacts after compiler,
geometry, source, fitting or validator changes. Cross-run matrix-to-browser replay
is deferred rather than introducing an unverified freshness shortcut.

## Performance benchmark and artifacts

The benchmark uses Demo Adventure, `area_main` / Main Area. It clears browser
storage, chooses Demo Project, mounts the editor 3D view and experimental runtime,
and requires loaded pirate assets (including chest, ship and three characters).
It waits for the expected scene identity, loaded clones/clips and smooth terrain
before resetting sample windows. Timing samples are read before screenshots.

`test-results/perf/` contains:
- `summary.json`, `console.json`, `network-failures.json`
- `three-editor-snapshot.json`
- `three-runtime-collapsed-snapshot.json`, `three-runtime-snapshot.json`
- `three-runtime-after-move-snapshot.json`
- Optional `three-editor.png`, `three-runtime.png` when `CAPTURE_VISUALS=1`

The dev/test global `window.__THREE_PERF_DIAGNOSTICS__` exposes snapshots for
`ThreeDPreview` and `ThreeRuntimePanel`. They include scene identity/rebuilds,
asset load/cache/clone/fallback state, RAF intervals, render/animation/camera/
water/runtime phases, draw calls/geometry/triangles, terrain/coast counts and hitches.
Failures include missing scene/assets/frames/render metrics, missing water/coast
data or uncaught page errors. Console/network warnings remain diagnostic evidence;
inspect them rather than inferring success from an existing screenshot.

### Former walk-state failure

The old performance case pressed ArrowUp and only then polled transient walk state
from the driver every 50 ms. It did not assert player position or move acceptance.
A failed walk poll aborted attack/movement sampling and produced secondary missing
snapshot errors. Historical artifacts establish a timeout with ready assets and
idle state; they alone do not establish a gameplay defect.

Walk lasts only the visual move duration (216 ms at demo speed 6). Driver round trips
and render hitches can miss it. The separate animation smoke now installs a per-frame
observer **before** input, retains observed states, and asserts the HUD movement
from (2,2) to traversable grass (2,1). It records `animation-observation.json` as a
Playwright attachment, including observed frames/states, latest snapshot and HUD.
No arbitrary sleep, fake clock, extended movement or production behavior change is used.

On failure, first check the HUD move assertion (input/overlay/collision), then the
observed states and RAF evidence (presentation/sampling). A successful move with
no rendered walk must be investigated in adapter correctness, not repeatedly rerun
or accepted as normal noise. Performance sampling now runs independently and
reports the primary failure without cascading missing-snapshot assertions.
See [Phase 1 results](../VALIDATION_OPTIMISATION_RESULT.md) for this checkout's run.

Current assets can log missing `Textures/colormap.png`; screenshots can produce
WebGL ReadPixels warnings. Record relevant warnings separately from test failures.
Both Playwright configs preserve failure screenshots and traces. Do not rerun a
failed unchanged matrix/smoke without inspecting its first error and artifacts.
