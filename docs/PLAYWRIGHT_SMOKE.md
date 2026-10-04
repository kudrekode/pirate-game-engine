# Validation and Playwright Routing

Start with deterministic evidence. Browser and Blender validation are opt-in and
are not included in `npm run ci`. Do not run all browser scenarios for an ordinary
helper, label or layout edit.

## Deterministic ownership and final gate

`npm run test:run -- <test-file>` is the normal iteration command.
Root Vitest uses disjoint `root-node`/`root-dom` projects plus each workspace's
own config. Pure helpers/contracts/creator requests run in Node; mounted React
and browser-global diagnostics run in jsdom with cleanup. Files remain isolated,
with one worker and no file parallelism.

| Scope | Command |
| --- | --- |
| Root pure helpers | `npm run test:run -- --project root-node`, or a single helper file |
| Root DOM/component boundaries | `npm run test:run -- --project root-dom`, or a single component file |
| Studio request/UI boundary | `npm run test:asset-studio -- src/proceduralMannequinCreator.test.ts` or `src/App.test.tsx` |
| Contracts | `npm run test:run -- --project character-contract --project asset-compiler-contract` |
| Shared preview | `npm run test:run -- --project three-asset-preview` |
| Cheap compiler/API, provenance, installed GLB round trips | `npm run test:compiler` (Node tests; no Blender invocation) |
| Final integration | `npm run ci`, then `git diff --check` |

CI runs all 71 Vitest files once, safe root/Asset Studio builds, all three shared
package typechecks, and the Node tests in `tools/blender-character` and
`tools/animation-retargeting`. `npm run build` remains a safe standalone
typecheck + Vite build; CI no longer runs a redundant root typecheck before it.
`check:asset-studio` remains a focused convenience command, not an extra CI step.
Node 22 is used in CI (local benchmark: 22.12.0, npm 10.9.0).

## Select browser work by acceptance criterion

Install Chromium once if missing: `npx playwright install chromium`.
**Windows PowerShell:** use `npm.cmd` / `npx.cmd` when forwarding arguments;
the `npm.ps1` shim can swallow `--list` or `--grep` and execute the broader suite.
For example: `npm.cmd run test:e2e:asset-studio:compile -- --list`.
Confirm the echoed command includes the requested flags before continuing.

Use `-- --list` on an npm browser script to inspect its selection without running it.
Use `-- --grep "specific test title"` to narrow a category further.

| Category | Command | Cost / when to use |
| --- | --- | --- |
| Root asset integration smoke | `npm run test:e2e:assets` | Two real WebGL/GLTF editor-to-runtime cases (Golden and haired mannequin), four screenshots, no compiler. Use for loader/registry/browser integration. |
| Studio fixture preview smoke | `npm run test:e2e:asset-studio:preview` | One checked-in mannequin preview/animation/source-switch case, nine screenshots, no compiler. Cheaper than compile workflows; not a unit test. |
| Runtime input/animation boundary | `npm run test:e2e:three-animation` | One real runtime, actual movement plus walk/idle/attack transitions. No timing benchmark or Blender. |
| Performance smoke | `npm run test:e2e:three-perf` | Editor and runtime, smooth terrain, collapsed/expanded overlays, settled timing windows and a verified move. Diagnostic measurements, no universal FPS threshold. |
| Real compiler integration | `npm run test:e2e:asset-studio:compile` | Existing randomise/compile/preview/restore case; **three compiles, six Blender passes**. Retains the real boundary. Not a cheap preview command. |
| Animation visual acceptance | `npm run test:e2e:asset-studio:visual` | Golden current/historical comparison gallery; about 30 images. Use only for changed deformation/animation acceptance. |
| Hair visual/compiler acceptance | `npm run test:e2e:asset-studio:hair` | Library V2 and Long/Buns cases; two compiles/four Blender passes and 24 captures each. Narrow with `--grep` to the affected case. |
| Appearance/bald-hair workflows | `npm run test:e2e:asset-studio -- --grep "isolated skin"` or `--grep "bald and Quaternius"` | Respectively three/two compiles; visual acceptance only for changed materials/fitting. |
| Broad browser sweeps | `npm run test:e2e`, `npm run test:e2e:asset-studio` | Explicit all-root/all-Studio selections. Studio includes expensive real compiles and galleries; never the default validation step. |

Screenshots are evidence for review, not automatic visual approval. Complete cheap
checks before compiling, then inspect the relevant views in one batch. Keep the
real compile boundary and legitimate visual coverage; do not mock them away.
Converting repetitive compile/UI cases and reusing matrix artifacts is deferred.

### Expensive compiler matrices

The existing `validate:procedural-topology-matrix`,
`validate:procedural-appearance-matrix` and
`validate:procedural-hairstyle-matrix` scripts can run real two-pass Blender
builds. Use them only for affected geometry/material/fitting/compiler invariants.
Topology covers 21 bodies; hairstyle `-- --library` covers 24 body/style artifacts
(48 Blender passes). Check the [compiler guide](../tools/blender-character/README.md)
and [Asset Studio Quick Resume](ASSET_STUDIO_ARCHITECTURE.md#quick-resume) for current
options and versions. `test:blender-bake` is the legacy cheap Node test name,
not a matrix rebuild; `test:compiler` also includes retarget/provenance tests.

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
- `three-editor.png`, `three-runtime.png`

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
