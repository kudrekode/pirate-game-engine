# The Hollow Kingdom — transitions, animation and world scale

24 November 2026. The reference is `72c6256`. The [previous report](HOLLOW_CHAPTER_ONE_FRAME_PACING.md) compares that revision to an earlier build. Its 954 ms ridge frame, 20.8 ms mounted p95, 4.24 s cold Play and 2.85–2.99 s cold Cinematics figures describe that earlier experiment.

The previous report's 3.71–3.88 tiles/s describes rendered held-key travel; it does not measure animation loop velocity. The original two locomotion GLBs on disk total 31,417,600 bytes, and their registered clip-only copies total 352,828 bytes. The current native/cached trial reproduced the earlier 310/122 shadow draws per update. This work changes playback preparation and scene scheduling without replacing those assets.

## Where the ridge crossing stalled

The route continues a Merewatch save beside the gate, opens the authored dialogue, selects the ridge road and ends the conversation. The readiness clock includes both clicks, polling and time waiting for the destination models, terrain and active render loop. A separate animation-frame callback measures gaps in browser presentation opportunities throughout the crossing. Three's own time between the last village submission and the first forest submission also includes the scene-loading period.

* **Two builds for one destination.** On the fresh full-route reference, entering Hollowwood built a scene with temporary markers in 68.5 ms, then built it again in 176.7 ms when its last model settled. That second build included 58 ms of terrain work. The initial full-route browser gap reached 879 ms and the action took 3.44 s. No new WebGL context was needed at the gate.
* **Synchronous driver calls.** Removing the provisional scene exposed a 966.6 ms frame. A single `getProgramInfoLog` on a successfully linked program took 872.6 ms inside a 951 ms renderer-main task. Skipping successful logs alone moved the stall to uniform reflection. Chromium spent 1.78 s waiting for the queued GPU commands while Three queried `ACTIVE_UNIFORMS`. The delivered code polls a WebGL2 fence with zero timeout, waits for all new program links, then checks link status and reflects uniforms in short slices. Failed links still produce the driver's error log. Already-reflected programs are weakly held and skipped.
* **Terrain and first draw.** A separate reference trace measured 317.6 ms building the final scene, including 152.5 ms of terrain. The CPU stacks showed corner-height lookups and smooth-mesh construction. Model decoding, cloning, first texture uploads and the initial shadow pass also contribute. In one trace the first final draw took 272 ms, including 137 ms in shadows. These nested times cannot be added. The trace did not implicate a repeated WebGL context setup or per-frame NPC tick as the cause of the longest frame.
* **Browser presentation can still stall.** Another reference run recorded a 1.93 s RAF gap with only 314 ms covered by the two long renderer-main tasks in that interval. In the fenced trial, 84 nonblocking polls took 1.4 ms combined and the longest main-thread task was 146 ms. One 1.40 s RAF gap overlapped 1.39 s of elapsed time in Chromium's GPU-process compositor, with only 2.4 ms of thread CPU there. The main thread dispatched the real dialogue click during this interval. This is a visible interruption with responsive input. The trace does not establish physical GPU time for that gap. A separate trial tried submitting individual subtrees. The imported lantern and altar contain lights, which required its full-scene fallback to preserve lighting. That trial is omitted from production. See the [trace evidence](hollow-ridge-trace-evidence.json).

## Changes

| Code | Behaviour |
| --- | --- |
| `src/runtime/three/ThreeRuntimePanel.tsx`, `src/styles.css` | On area change, installs destination traversal immediately and gives model requests one second to settle before building a provisional scene. A slow request gets playable placeholders. A failed request exposes Retry models above the runtime HUD. The previous scene's loop and handlers are disposed at the ordinary scene boundary. |
| `src/runtime/three/prepareSceneShaders.ts` | Avoids the redundant driver-log reads described above. Native completion polling, errors, cancellation and retry still use the existing controls. |
| `src/data/terrainSurface.ts`, `src/editor/sections/terrainBlocks.ts` | Indexes sparse cells by row and column, averages adjacent heights without creating per-corner arrays, and omits unused work when constructing smooth terrain. Appends material-group indices without spreading them into function arguments. This also fixes a reproducible stack overflow on a flat 192 × 192 area. |
| `src/runtime/three/threeCharacterAnimation.ts` | Repairs the boundary tangents of the prepared Golden walk and Bracken walk, preserving authored keys and source files. The [animation study](HOLLOW_KINGDOM_GAIT_CONTINUITY.md) covers stationary, mounted and in-game evidence. |

## Matched ridge results

Fresh headless Chrome 158.0.8127.37 processes, Intel Iris Xe/ANGLE D3D11 driver 32.0.101.5768, 960 × 600 CSS pixels, DPR 1. All tests import the same Chapter One JSON, SHA-256 `beb71d245fc73d09da1d8d69863f8a9b6335bbf415b10872d6456eb930a4ab7c`. Requests are fulfilled from actual test-mode build files and the existing public assets with HTTP caching bypassed. Cold means the first forest entry in that document. OS and driver caches were not reset. The shortened gate route and full playthrough have separate results. Timing probes sample the browser and are subject to machine load.

| Fresh first crossing, in run order | Reference, 4 runs | Delivered, 3 runs |
| --- | --- | --- |
| Worst browser frame, ms | 1,067 / 592 / 933 / 696 | 133 / 471 / 187 |
| Ready, seconds | 3.62 / 3.57 / 3.31 / 3.45 | 0.85 / 2.43 / 2.49 |
| Frames over 50 ms | 7 / 9 / 8 / 6 | 4 / 5 / 7 |
| p95 browser interval, ms | 12.4 / 16.5 / 12.5 / 12.5 | 66.6 / 4.4 / 20.8 |
| p99 browser interval, ms | 191.7 / 99.9 / 120.8 / 112.6 | 133.3 / 104.1 / 95.8 |
| Cold Play to ready village, seconds | 5.15 / 5.06 / 5.17 / 4.36 | 4.47 / 4.84 / 4.41 |

The median longest frame fell from **815 to 187 ms** (77%), and median readiness from **3.51 to 2.43 s** (31%). The best readiness run also had the highest delivered p95 because the short wait contained far fewer idle browser frames. On the second crossing with decoded assets retained, readiness changed from 1.05 to 0.95 s and the worst frame from 538 to 438 ms, with four frames over 50 ms on both builds. A warm cache therefore did not eliminate the visible transition. The [measurement data](hollow-transition-measurements.json) also include the full-route frame distributions, render/GPU measurements, resource counts and Save/Continue cycles.

## Chapter One in play

One longer route per revision exercised riding, the Oswin cinematic, combat, the Wyrm and saving. The ridge worst frame changed from **879 to 283 ms** and readiness from **3.44 to 2.45 s**. Frame p99 during the same crossing worsened from 121 to 196 ms. Fewer very long freezes can coexist with several shorter interruptions. The reference full-route startup overlapped a Vite source-map build, so the isolated cold Play samples above are the startup comparison.

| Full route action | p95, reference → delivered (ms) | Worst, reference → delivered (ms) |
| --- | --- | --- |
| Held follow-camera walk | 25.1 → 29.2 | 29.3 → 33.3 |
| Orbit camera | 16.8 → 12.6 | 29.2 → 16.8 |
| Resume after cinematic | 16.7 → 12.5 | 20.8 → 12.8 |
| Ride Bracken | 20.8 → 12.7 | 41.9 → 16.8 |
| First three seconds in Hollowwood | 29.2 → 29.1 | 33.4 → 91.6 |
| Settled Hollowwood | 16.9 → 12.6 | 25.1 → 16.8 |
| Warrant Reader and Ashling fight | 16.7 → 12.8 | 33.4 → 20.8 |
| Wyrm fight | 12.5 → 8.5 | 41.7 → 16.8 |

The isolated mounted reference and candidate had similar p95 (16.7 and 16.8 ms). An independent four-run native/cached shadow control favoured the existing cache at 12.6–12.7 ms versus 20.9–21.0 ms. Measured rendering costs dominated the mixer and saddle updates. The historical mounted regression cannot be assigned to a single cause. The stationary walk improvement is repeatable independently of frame rate: peak joint acceleration near the seam fell 265.5 → 75.9 units/s² on the Wayfarer and 147.8 → 113.9 on Bracken. The measured walk retains some foot sliding.

Three Save → Edit → Continue cycles per build restored the exact saved traversal state and stored authored project. Each visit had one active loop, 74 geometries, 90 textures and 22 programs. Delivered Continue took 585–646 ms, and post-GC Play heap was 27.3–27.8 MB. This bounded check cannot establish long-term driver memory behaviour. The failed-model route held a destination GLB until Hollowwood drew with placeholders, then aborted it. One normal click on **Retry models** loaded it, cleared the alert and restored the scene with one loop.

The existing Cinematics harness measured a 117 ms cold shell on both builds and **2.951 → 2.939 s** for the first preview. Switching to the cavern took **1.531 → 1.172 s**. Switching back took **0.272 → 0.741 s**, a regression in this pair. Both switches reused the workspace context. Warm workspace reopens measured 681/603 ms on the reference and 601/629 ms on delivery. These single-launch sequences support no general warm-reopen speed claim.

## What the larger world justifies

The [continuous-world survey](HOLLOW_KINGDOM_WORLD_SCALE.md) records dimensions, visible and authored counts, terrain, loading, memory and the complete on-foot and mounted routes. **88 × 120 tiles, 489 objects and 12 NPCs** was the largest configuration to meet the survey's settled 30 Hz criterion throughout the route. On its independent repeat, the long ride reached 21.1 ms p95 and 29.3 ms p99. The next size, 110 × 150, reached 45.8/62.6 ms at the same percentiles on its repeat. The larger 154 × 204 fixture completed its 192-tile trip, but the far view submitted 3,532 draws and 4.51 million triangles, with up to 1,363 visible markers out of 1,619 entities. These figures describe this planting density, camera, route and hardware. The NPCs animate but stay in place.

The survey ranks instancing and distance-based detail first. Two spruce submeshes alone accounted for 1,297 submissions in the frontier view. A bounded trial of those meshes can distinguish draw-submission cost from triangle cost before changing the entire renderer. Spatial rejection is a better fit for the sections of road with fewer visible entities. The survey ranks all seven options by evidence and implementation cost. For Chapter One's existing gates, testing earlier preparation of a known destination is a separate opportunity to reduce the remaining wait.

## Reproducing the Chapter One comparisons

Build the old and new application in separate checkouts with the installed dependencies. Use the new harness for **both** build directories. Run GPU jobs sequentially. Hidden source maps enable attribution to original TS and Three source in the optional diagnostic. An ordinary measurement leaves the CPU profiler, timeline and extra pose observers off.

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{sourcemap:'hidden',outDir:'test-results/seam-dist',copyPublicDir:false}})"
$env:HOLLOW_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:HOLLOW_ANGLE = 'd3d11'
$env:HOLLOW_OFFLINE_ROUTE = '1'
$dist = 'test-results/seam-dist'
node e2e/hollow-runtime-baseline.mjs $dist test-results/route --play-session chapter-one
node e2e/hollow-runtime-baseline.mjs $dist test-results/ridge-a --play-session --transition-only --repeat-ridge chapter-one
node e2e/hollow-runtime-baseline.mjs $dist test-results/ridge-b --play-session --transition-only chapter-one
node e2e/hollow-runtime-baseline.mjs $dist test-results/ridge-trace --play-session --transition-only --trace-transition --trace-scheduler chapter-one
node e2e/hollow-runtime-baseline.mjs $dist test-results/ridge-retry --play-session --transition-only --ridge-recovery chapter-one
node e2e/hollow-runtime-baseline.mjs $dist test-results/mount --play-session --mounted-only chapter-one
node e2e/hollow-runtime-baseline.mjs $dist test-results/mount-native --play-session --mounted-only --native-mounted-shadows chapter-one
$env:PROFILE_CHROME = $env:HOLLOW_CHROME_PATH
$env:PROFILE_ANGLE = 'd3d11'
$env:PROFILE_DIST = $dist
node tools/profile-hollow-editor.mjs http://127.0.0.1:4182/ test-results/seam-editor.json --chapter-cinematics
```

The full route exercises travel, camera rotation, mounting, cinematics, combat and three Save → Edit → Continue cycles. The optional second ridge crossing reuses decoded assets in the same document, but Continue creates a new Play renderer. The recovery run deliberately fails one destination GLB and then retries it through the viewport. The native-shadow control draws the original scenery casters during the mounted sample. It is a benchmark switch only.

For the CPU-only terrain comparison, run the first command in each checkout, using distinct absolute output paths. Run the second from the new checkout with those two paths. The script alternates seven trials per implementation, checks deep equality of vertices, normals, indices and material groups, and emits a SHA-256 of each generated mesh. Warm median construction measured **16.73 → 10.85 ms** for the 3,780-cell Hollowwood area and **68.89 → 35.25 ms** for the 16,500-cell stress area.

```powershell
npx.cmd esbuild src/editor/sections/terrainBlocks.ts --bundle --platform=node --format=esm --outfile=test-results/terrain.mjs
node tools/profile-hollow-terrain.mjs C:/path/to/reference/test-results/terrain.mjs C:/path/to/candidate/test-results/terrain.mjs
```

For the full authored chapter including both endings, run the existing browser test against the normal development server:

```powershell
npm.cmd run test:e2e -- e2e/hollow-kingdom-chapter-one.spec.ts --grep '@chapter-one'
```

For offline delivery, use the spec's `CHAPTER_OFFLINE_WEB_ROOT` route fulfillment and a Chromium configuration without a dev server. Its combat driver reads the development-only NPC/clip observations. Build that check with `define:{'import.meta.env.DEV':'true'}` in the Vite options. Keep that build separate from the optimized measurement builds above.

## Correctness checks

The complete Chromium chapter test passed in 3.9 minutes. It played the opening cinematic, crossed Hollowwood, defeated the Ashling, solved the chapel puzzle and restored the cave checkpoint. Both the release and slay endings returned to Merewatch. The test asserted the quest completion, flags, witness, inventory and verdict, and reported zero browser errors. An initial run used the timing build and timed out waiting for its missing development-only NPC observations. The separate optimized benchmark also defeated the Warrant Reader, Ashling and Wyrm through runtime controls.

The full Vitest run passed 1,087 of 1,088 tests. One dialogue-editor undo test exceeded its existing five-second timeout while the browser check was running. All seven tests in that file passed on an isolated rerun with the standard timeout. No dialogue code, assertions or test budgets were changed.

All subsequent CI stages passed when run in order: the root and Asset Studio TypeScript/production builds, the three workspace package builds and all 78 Node compiler/asset tests. Biome finished with zero errors and two existing CSS warnings for unrelated `!important` declarations. The Git whitespace check passed. The playable project JSON, public GLBs and save schema have no changes.
