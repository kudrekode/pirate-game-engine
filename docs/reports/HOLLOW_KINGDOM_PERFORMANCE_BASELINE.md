# The Hollow Kingdom performance baseline

24 November 2026. The reference build is `799b817`. Both builds used the original `hollow-kingdom.project.json`, Chapter One's `hollow-kingdom-chapter-one.project.json`, and their installed public assets.

Chapter One’s first Cinematics scene went from 11.37 to 3.95 seconds, its first 3D Map from 15.39 to 5.10 seconds and opening Three Play in Merewatch from 4.64 to 2.28 seconds. A repeat animated Asset Creator preview fell from 951 to 169 ms. The largest remaining editor pause was 3.05 seconds when switching to the cavern sequence. Gameplay improved on some walking routes, while the first seconds after entering Hollowwood still showed hitches.

The [machine-readable measurements](hollow-kingdom-performance-data.json) include individual transitions, frame distributions, resource counts, request sizes and per-cycle memory values.

## What was measured

The original fixture contains 281,601 bytes and one 44 × 60 area. Chapter One contains 732,135 bytes and four areas. Its largest area, Hollowwood, contains 3,780 terrain cells, 142 object placements and five NPC placements.

The editor benchmark records cold startup to the project list, reload with an existing catalog, import to the project home, and reopening the saved record. It measures the first usable animated preview separately from completion of visible thumbnails. Cinematics is measured until the actual stage reports ready. The route opens and closes the workspace three times. Chapter One also switches the sequence to a different area. A fresh browser context starts each project. Warm visits retain the document and its caches.

The Map and Play benchmark uses an optimized test-mode build for read-only Three diagnostics. It opens the 3D maps, moves the camera, walks authored routes through Merewatch and Hollowwood, interacts with characters, and repeats Save, Exit and Continue three times. It checks restored position and compares stored authoring data before and after Play. Frame intervals come from consecutive animation frames during the sampled action. Draws and triangles are a renderer snapshot of the current view. Geometry and texture counts are Three resource counts. V8 heap measurements use forced GC at the same points in each transition. They exclude native driver allocations and do not measure total GPU memory.

The paired browser runs used Chrome 158.0.8127.37, ANGLE Direct3D 11 on Intel Iris Xe, 960 × 600. The editor used a production build. Playwright fulfilled requests with real build and public-file bytes because the browser could not access localhost in this environment. Resource Timing measures local fetch completion. Workspace readiness also includes parsing, cloning, scene construction and the first rendered output. Production HTTP caching, remote server latency, mobile thermals and WAN throughput need their own runs. One route per fixture and build establishes a reference, with repeated actions and many individual frame samples inside each route. Small differences in click timings are sensitive to scheduling.

## Editor measurements

Times are milliseconds, reference → candidate. The shell is the first observed workspace DOM. Stage-ready includes the scene. An advancing animation is the Asset Creator readiness boundary.

| Action | Original Merewatch | Chapter One |
| --- | ---: | ---: |
| Cold launch to project list | 730 → 346 | 423 → 213 |
| Launch with stored catalog | 358 → 247 | 293 → 155 |
| Import JSON to project home | 236 → 73 | 417 → 85 |
| Open saved project from list | 37 → 35 | 55 → 54 |
| Cold Cinematics shell / stage ready | 2,645 / 11,859 → 139 / 4,617 | 1,890 / 11,372 → 105 / 3,949 |
| Reopen Cinematics, stage ready, visits 2 / 3 | 2,691 / 2,216 → 814 / 817 | 1,951 / 1,605 → 741 / 782 |
| Switch to cavern sequence, shell / stage | — | 4,613 / 7,140 → 123 / 4,742 |
| First Asset Creator shell / advancing animation | 1,908 / 3,107 → 25 / 1,300 | 760 / 1,101 → 43 / 486 |
| All first-open thumbnails complete | 3,760 → 3,715 | 1,233 → 1,429 |
| Reopen Asset Creator, shell / advancing animation | 1,053 / 1,184 → 24 / 203 | 819 / 951 → 23 / 169 |
| Alternate two warm animated models four times | 143 / 385 / 412 / 393 → 159 / 409 / 441 / 427 | 239 / 200 / 378 / 369 → 161 / 135 / 342 / 472 |
| Home JS heap after GC, decimal MB | 20.58 → 16.67 | 25.70 → 20.63 |

Both projects encoded 16 thumbnails again on reopening the reference library and zero on the candidate. Each reopen created two WebGL contexts before and one after. Initial thumbnail completion and warm model-switch times varied by fixture. Each first animated preview became available sooner. Across the full Cinematics-to-Assets visit, locally delivered GLB bodies stayed near 47.6 MB for both projects. Each URL was requested once. No transfer saving is attributed to repeated Cinematics visits. Pine Lookout / Warrant Runner reported 16 geometries and 35 textures in the preview and the two drake selections reported 14 and 24 on both builds.

Failure tests interrupted the Drake GLB in each fixture. Asset Creator showed a model failure. Retry issued one new request in each case, cleared the failure and advanced the animation. Aborting the startup entry showed a reload instruction and reloading recovered. Aborting the deferred Phaser chunk showed a retry control that fetched it again, mounted a real 2D canvas and allowed Save Game. All four normal editor runs also loaded the external `GoldenSword_Attack_V1` from its own GLB and advanced the selected clip.

On a cold production Cinematics visit the longest main-thread task fell from 5,276 to 783 ms in Merewatch and from 4,662 to 586 ms in Chapter One. Switching to the cavern fell from 4,619 to 3,054 ms for that individual task. The status appears sooner, but input can still stall during that switch. Asset Creator’s longest first-open task fell from 1,909 to 1,243 ms in Merewatch and 761 to 395 ms in Chapter One.

## Confirmed causes and changes

| Evidence | Implemented change |
| --- | --- |
| The editor entry bundled Phaser even when opening the project list or a Three workspace. | Load Phaser and AdventureScene together on entry to 2D Play. A status and retry action cover a failed dynamic import. The production entry fell from 3,325.69 to 1,810.14 kB, or 858.29 to 510.10 kB gzip. The deferred Phaser chunk is 1,482.15 kB uncompressed. |
| Import migrated an already validated project again and parsed its saved serialization to activate it. Legacy-save discovery could fingerprint a whole project even in an empty save catalog. | Reuse the validated project when writing and activating it. Inspect storage keys before legacy-save lookup. Use four 32-bit words for the same 128-bit FNV checksum. Canonical input and the old save IDs are preserved. Import shows reading/checking status and reports validation or storage errors. |
| Warm Cinematics visits fetched no new model bytes yet still paused. Each new scene synchronously regenerated the same ground colour data, including a central raster of up to 1024 × 1024 pixels. Model completions could independently schedule scene builds. | Precompute tile colours and render cold pixels in a worker. If the worker is unavailable, the same kernel runs in approximately five-millisecond slices. Keep the terrain base colour available during preparation. Reuse up to four raster entries keyed by terrain input, dimensions, atmosphere and padding. This retains at most 16 MiB of cached pixel arrays. The scene still owns its GPU texture. Batch distinct model completions and show progress by settled source count. Cinematics waits for the initial model batch and painted ground. |
| A first-open Chapter One CPU trace attributed roughly 7.1 seconds to synchronous shader log queries in Three’s first draw. GPU texture uploads accounted for about 87 ms. | On browsers with parallel shader compilation, submit and poll scene programs before drawing, check their link status and prepare reflection data in short slices. A temporary white map preserves the authored ground colour and compiles the same mapped shader used by the completed terrain. Shader preparation displays progress, cancels on navigation and reports a timed-out or failed link. Other browsers use the standard Three draw path. |
| Three presentation rebuilt renderers across runtime scene changes, built hidden collision geometry and created two shoreline meshes per edge. Smooth terrain repeatedly scanned sparse cell data. | Reuse the mounted runtime renderer, release its context on unmount, release clone-owned skeleton textures on teardown, and defer collision-debug geometry until enabled. Index terrain cell lookups and build only the selected Map terrain representation. Combine opaque shore strips into one indexed mesh with vertex colours. Transparent strips keep their original independent depth sorting. |
| Asset Creator inspected skeleton clones to discover clips and re-encoded thumbnails when reopening the library. Full animation compatibility discovery competed with the first animated preview. | Read metadata from the shared GLTF entry. Request the chosen compatible source for preview and defer the complete list to the Animations tab. Keep up to 64 project thumbnails, produce one new thumbnail per animation frame and keep draft identity stable during playback. Give failed model, attachment and renderer loads an explicit recovery action. A 60-second model deadline settles stalled loads and stale completions cannot replace a successful retry. |

## Map, Three Play and save cycles

Times are milliseconds. Ready includes the viewport’s assets and terrain. Scene build is the CPU construction interval recorded by the scene. Draws, triangles and resource counts are snapshots after settling and can depend on camera and animation. A renderer can keep resident resources across area changes.

| Fixture and area | View | Ready | CPU build | Draws | Triangles | Geometries | Textures | Idle p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original · Merewatch | Map | 15,995 → 4,989 | 1,763 → 43 | 618 → 501 | 499,888 → 499,898 | 329 → 212 | 161 → 116 | 20.7 → 20.8 |
| Original · Merewatch | Play | 4,568 → 3,342 | 1,439 → 49 | 561 → 453 | 450,530 → 450,558 | 300 → 192 | 83 → 83 | 25.0 → 25.1 |
| Chapter · Merewatch | Map | 15,386 → 5,104 | 1,868 → 39 | 589 → 476 | 490,816 → 490,834 | 314 → 201 | 97 → 86 | 16.7 → 54.2 |
| Chapter · Hollowwood | Map | 3,693 → 2,237 | 1,121 → 94 | 288 → 288 | 482,622 → 482,622 | 113 → 113 | 181 → 137 | 29.1 → 21.0 |
| Chapter · Ashen Chapel | Map | 1,499 → 782 | 1,272 → 41 | 129 → 129 | 199,900 → 199,900 | 120 → 120 | 207 → 95 | 16.6 → 12.4 |
| Chapter · Wyrm’s Hollow | Map | 2,043 → 1,273 | 1,182 → 52 | 188 → 173 | 70,856 → 70,856 | 159 → 144 | 246 → 112 | 12.5 → 8.5 |
| Chapter · Merewatch | Play | 4,639 → 2,277 | 1,525 → 38 | 481 → 386 | 377,750 → 377,804 | 276 → 181 | 85 → 85 | 20.8 → 21.0 |
| Chapter · Hollowwood | Play | 2,274 → 1,031 | 1,305 → 78 | 98 → 98 | 192,244 → 192,244 | 73 → 113 | 88 → 120 | 20.8 → 53.9 |

Frame intervals along the authored routes, in milliseconds. Values are reference → candidate. The sample count varies with frame rate and walking duration.

| Fixture and area | Action | p50 | p95 | p99 | Intervals | Over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original · Merewatch | Standing | 20.8 → 16.7 | 25.0 → 25.1 | 29.2 → 29.3 | 152 → 164 | 0 → 0 |
| Original · Merewatch | To Oswin | 16.7 → 16.6 | 24.9 → 21.1 | 29.1 → 29.2 | 612 → 672 | 0 → 0 |
| Original · Merewatch | To camp | 16.5 → 16.8 | 20.9 → 25.0 | 25.2 → 29.1 | 896 → 742 | 0 → 0 |
| Chapter · Merewatch | Standing | 12.7 → 16.6 | 20.8 → 21.0 | 20.9 → 25.1 | 203 → 189 | 0 → 0 |
| Chapter · Merewatch | To Oswin | 16.6 → 16.5 | 20.9 → 20.9 | 24.5 → 25.0 | 162 → 158 | 0 → 0 |
| Chapter · Merewatch | To ridge | 12.7 → 12.5 | 20.8 → 16.8 | 21.0 → 24.9 | 1131 → 1296 | 0 → 0 |
| Chapter · Hollowwood | Standing | 8.4 → 16.4 | 20.8 → 53.9 | 21.0 → 58.5 | 259 → 148 | 0 → 10 |
| Chapter · Hollowwood | To milestone | 8.4 → 8.4 | 20.7 → 21.0 | 21.0 → 29.2 | 544 → 505 | 0 → 0 |
| Chapter · Hollowwood | To Iven | 8.4 → 8.3 | 20.8 → 16.7 | 21.0 → 20.8 | 1394 → 1664 | 0 → 0 |

Each cell below shows cycles 1 / 2 / 3. The chooser wall clock includes Playwright waiting to deliver a trusted pointer event.

| Fixture | Boundary | Reference | Candidate |
| --- | ---: | ---: | ---: |
| Original | Save | 233 / 141 / 85 | 145 / 147 / 197 |
| Original | Exit to editor | 135 / 60 / 58 | 134 / 281 / 309 |
| Original | Request Play to chooser, wall clock | 114 / 82 / 74 | 85 / 2,936 / 2,794 |
| Original | Continue to settled Play | 2,196 / 1,541 / 1,360 | 813 / 886 / 772 |
| Original | V8 heap after Continue, MiB | 25.56 / 25.62 / 26.59 | 22.18 / 22.74 / 23.53 |
| Original | backing stores after Continue, MiB | 20.13 / 20.17 / 20.17 | 18.60 / 18.66 / 18.66 |
| Original | V8 heap after Exit, MiB | 19.65 / 20.86 / 21.44 | 17.17 / 18.37 / 19.04 |
| Original | backing stores after Exit, MiB | 14.41 / 14.41 / 14.41 | 17.96 / 17.96 / 17.96 |
| Chapter | Save | 295 / 291 / 277 | 178 / 223 / 194 |
| Chapter | Exit to editor | 70 / 79 / 86 | 81 / 469 / 470 |
| Chapter | Request Play to chooser, wall clock | 185 / 196 / 203 | 106 / 1,421 / 2,002 |
| Chapter | Continue to settled Play | 1,772 / 1,752 / 1,716 | 716 / 729 / 678 |
| Chapter | V8 heap after Continue, MiB | 30.83 / 30.98 / 31.74 | 32.17 / 32.25 / 32.91 |
| Chapter | backing stores after Continue, MiB | 20.52 / 20.52 / 20.52 | 24.48 / 24.48 / 24.48 |
| Chapter | V8 heap after Exit, MiB | 25.46 / 26.12 / 26.65 | 27.00 / 27.71 / 28.33 |
| Chapter | backing stores after Exit, MiB | 14.56 / 14.56 / 14.56 | 23.63 / 23.63 / 23.63 |

**Play and memory interpretation.** Median Continue fell from 1,541 to 813 ms in Merewatch and 1,752 to 716 ms in Chapter One. Median Exit increased from 60 to 281 ms and 79 to 469 ms respectively. Several chooser attempts also took seconds before the browser delivered the pointer event. The time from trusted click to chooser DOM on the delivered build was 29–40 ms in Merewatch and 46–81 ms in Chapter One. The longer wall time still affects the transition experienced by the benchmark.

Chapter One’s ridge and Iven walks improved to 16.8 and 16.7 ms p95, while Hollowwood’s immediate idle sample worsened from 20.8 to 53.9 ms. On the original cold Map the early idle window included one 1.98 s frame interval. In a separate camera run that same candidate took 9.42 s to open, compared with 4.99 s on the main route. Readiness and steady frame pacing are different measurements. The spread warrants repeated cold runs on target hardware before setting thresholds.

Median Play V8 heap went from 25.6 to 22.7 MiB in the original and 31.0 to 32.2 MiB in Chapter One. On Chapter One the final renderer retained 113 geometries and 120 textures after moving into Hollowwood, compared with 73 and 88 in the reference. Post-Exit backing stores were higher, but remained flat across the three samples. V8 heap rose modestly over those cycles on both builds. These measurements establish a short-run memory baseline. A longer soak with driver-level memory measurements is needed to determine whether growth plateaus.

**Asset delivery.** Across Map and Play, both versions requested 33 GLBs (47,599,084 bytes) for the original and 35 (47,686,180 bytes) for Chapter One. Original per-file local fetch median / p95 was 152 / 731 → 249 / 609 ms. Chapter One was 498 / 759 → 193 / 575 ms. The two largest external clip sources are `idle.glb` (15,828,832 bytes) and `walk-in-place.glb` (15,588,768 bytes). The waits also include browser scheduling on this local transport.

## Isolated CPU and geometry measurements

The Node benchmark uses the same source helpers and fixture bytes for both revisions. Times are milliseconds. Geometry-build medians cover the smooth terrain plus coastline. A ground sample covers the centre colour raster. In Node the candidate uses the cooperative fallback. Browser measurements exercise the deployed path separately. Both Merewatch inputs have identical terrain, so the second project's first candidate raster lookup is already warm.

| Map | Terrain build, before → after | Shore meshes, before → after | Terrain + shore triangles, both | Second ground build, before → after | Pixel SHA-256 prefix, both |
| --- | ---: | ---: | ---: | ---: | --- |
| Original Merewatch | 63.91 → 27.19 | 246 → 124 | 5,772 | 1,590.66 → 0.58 | `9247ecc8fff73fba` |
| Chapter Merewatch | 89.98 → 18.56 | 246 → 124 | 5,772 | 1,706.70 → 0.75 | `9247ecc8fff73fba` |
| Hollowwood | 93.19 → 19.17 | 0 → 0 | 7,560 | 1,691.53 → 0.92 | `2d09a9443340eed1` |
| Ashen Chapel | 20.92 → 6.28 | 0 → 0 | 2,574 | 2,709.54 → 0.40 | `8c0ce1c6bbb63eda` |
| Wyrm's Hollow | 24.02 → 10.79 | 32 → 17 | 3,496 | 2,435.04 → 0.45 | `d2d2c7277d003b04` |

Fingerprinting a migrated project fell from 56.79 to 27.37 ms for Merewatch and 173.39 to 35.37 ms for Chapter One. The resulting save IDs matched byte for byte (`66e4b756e72938db833b640eacc1aa73` and `dc94c5cd67485163236e10c4a8edc868` respectively). Tests also compare the arithmetic against the old BigInt implementation on empty, Unicode and carry-heavy inputs.

## Camera input and first-draw diagnosis

A separate Merewatch Map run sent 25 native wheel inputs. The initial wheel changed the camera preset in 12.1 → 10.7 ms. The scene build count stayed fixed during navigation. Reference and candidate p50 / p95 / p99 frame intervals were 16.6 / 21.0 / 29.2 and 16.6 / 24.9 / 29.2 ms. The final camera view used 535 → 436 draws and 329 → 212 geometries. Camera movement remained responsive in this sample. Its p95 interval increased.

To isolate the cold stall, a Chapter One Cinematics run recorded CPU stacks and individual WebGL calls under instrumentation. After model batching and cooperative terrain generation, the largest main-thread task still lasted 7,435 ms. About 6,934 ms of sampled time was in first-use shader log retrieval for ordinary draws, with another roughly 190 ms in shadow draws. After adding shader completion polling and ground workers, the longest task fell to 1,934 ms. Preparing reflection data alone gave 2,016 ms. Preserving the terrain's mapped shader variant during that preparation brought it to 871 ms. Four shadow-depth variants still waited for first use. The isolated final stage reached readiness in 6.19 s, versus 5.69 s in the shader-polling experiment. The implemented choice reduced the longest freeze. The uninstrumented production figures above are the end-to-end comparison.

## Larger maps

Start with the remaining first-draw and transition hitches. Capture the cavern switch, the first seconds of Map idle and the return from Play on target hardware. Separate shadow-depth program creation, texture upload and WebGL context teardown before changing shadow quality or keeping whole scenes mounted.

1. Record view-dependent draw calls, triangle counts and shadow passes while increasing *visible* actors and props in a copy of the route. If offscreen or distant content dominates, test spatial chunks and distance-based activation against that route. Keep collision, quests and NPC state in the shared runtime.
2. Measure animation payloads separately. The two external baked animation GLBs together account for about 31.4 MB of local asset files in the editor trace. Benchmark a compatible animation-only export and verify clip identity, skeleton compatibility and retargeting before changing the asset pipeline.
3. Track peak live GLTFs, GPU allocations and context counts over a longer alternating-area soak. The shared decoded asset cache can grow with unique assets. Use reference counts and a measured residency budget before introducing eviction. The new terrain and thumbnail caches bound their own entries only.
4. Measure JSON validation, canonicalization and browser storage writes with larger saved projects. These still run on the main thread. If they exceed the interaction budget, move pure validation to a worker and evaluate asynchronous persistence while testing existing save IDs and drafts.

## Validation

The repository CI gate passed 1,075 Vitest tests in 136 files, the root and Studio builds, package typechecks and all 77 Node compiler tests. Subsequent shader and worker changes passed the final root production build, typecheck and 123 focused tests covering Map, Play, terrain and shader preparation. The browser benchmarks ran on the delivered builds. Both fixtures completed their authored routes and three save/exit/continue cycles, with restored positions and byte-identical stored authoring JSON across Play. The project JSON files, public assets and authored schema match the reference tree. Biome and the Git whitespace check passed.

## Reproducing the measurements

From the repository root with dependencies installed, build each revision into a separate directory. Use the same benchmark scripts, browser executable, viewport, GPU backend and fixture bytes for both revisions. Run one browser benchmark at a time. Retain the emitted JSON for individual transitions, resources, frame samples and diagnostics.

```powershell
node tools/performance/terrain-baseline.mjs
node --input-type=module -e "import {build} from 'vite'; await build({build:{outDir:'test-results/hollow-editor-dist',copyPublicDir:false}})"
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{outDir:'test-results/hollow-play-dist',copyPublicDir:false}})"
$env:PROFILE_DIST = 'test-results/hollow-editor-dist'
$env:PROFILE_ANGLE = 'd3d11'
$env:PROFILE_RETRY = '1'
node tools/profile-hollow-editor.mjs http://127.0.0.1:4182/ test-results/hollow-editor.json
$env:HOLLOW_ANGLE = 'd3d11'
$env:HOLLOW_OFFLINE_ROUTE = '1'
node e2e/hollow-runtime-baseline.mjs test-results/hollow-play-dist test-results/hollow-play
```

The editor defaults to the Chrome channel. The runtime defaults to installed Playwright Chromium. Set `PROFILE_CHROME` and `HOLLOW_CHROME_PATH` to the same executable for matching versions. For HTTP measurements, serve the build and public assets normally and unset the local-fulfillment variables. Set `PROFILE_RETRY` only on the candidate when comparing against the reference build, which lacks that control. Add `--camera merewatch` to exercise the Map's native wheel input, or `--lifecycle merewatch chapter-one` for trusted pointer-event timing around Save, Exit and Continue. Give each run a separate output folder. The runtime accepts optional fixture selectors `merewatch` and `chapter-one`. The CPU benchmark accepts `HOLLOW_SOURCE_ROOT` to compare helper code from another checkout with the same inputs and dependencies. Its terrain and fingerprint medians discard two warmups and retain seven samples. Centre-ground times include all work through the ready promise. Warm centre times include a content-key lookup.
