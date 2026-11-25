# Continuous-world scale survey

**The largest tested configuration that met the full-road frame budget was 88 × 120 tiles, with 489 placed objects and 12 NPCs.** A second run with supplemental GPU, shadow and draw-list probes disabled measured 21.1 ms p95 and 29.3 ms p99 over its longest mounted leg. The 110 × 150 world passed on its short ride, then exceeded the budget over the full road. The 154 × 204 world became playable end to end after the terrain fix, with substantial slowdown when most of the world entered the camera view. This is a result for this planting density, camera, route and GPU.

The machine-readable measurements include fixture hashes, action sample counts, GPU samples, resources, timing distributions, loading, the reference failure and the diagnostic trial. [Survey data](hollow-world-scale-data.json)

## Fixture and route

The survey is a generated, importable GameProject. Its north–south road runs between cottages and watchtowers. Raised ground, a winding creek, cross-roads and regularly planted spruce, heath and crags extend to the map boundary. Each world uses the Chapter One player and Bracken, alongside increasing numbers of stationary, animated ferrymen. Standard runtime controls handle the entire trip. The generator reads the chapter and constructs a new area in memory.

| Fixture | Dimensions (tiles) | Painted cells | Raised cells | Placed objects including Bracken | NPCs | Animated actors including player and mare |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 44 × 60 | 2,640 | 727 | 116 | 1 | 3 |
| Medium | 66 × 90 | 5,940 | 1,510 | 263 | 5 | 7 |
| Large | 88 × 120 | 10,560 | 3,096 | 489 | 12 | 14 |
| Stress | 110 × 150 | 16,500 | 4,773 | 792 | 24 | 26 |
| Frontier | 154 × 204 | 31,416 | 9,187 | 1,570 | 48 | 50 |

The common route starts at road coordinate 4. The player walks to 12, mounts at 13, rides to 37 and orbits the camera at that landmark. All five routes continue in Follow Player mode to eight tiles from the far boundary. The runner checks displacement and lateral drift, mounting, one active render loop, asset readiness and uncaught browser errors. A warm replay returns to the editor and opens the same world in the same document. Cold replay uses a fresh browser context. Each context imports a fresh copy of the generated project. The JS loader module is imported before the Play timer to observe its real asynchronous parses.

The playability criterion for this desktop survey is p95 at or below one 30 Hz frame (33.4 ms) and p99 at or below 50 ms on travel and camera rotation. It describes settled input and excludes starting Play. A 60 Hz target has a tighter 16.7 ms budget. Active combat and AI navigation have separate costs. These fixtures exercise idle NPC animation, movement, the renderer and real mount handling.

## Reference observations

On revision `72c6256`, all four scenarios through Stress loaded in the normal Chromium application. Frontier failed before readiness with `Maximum call stack size exceeded`. Its 26,280 grass tiles contributed 157,680 triangle indices to one material group. The smooth-terrain builder expanded that entire group as arguments to a single array operation.

The short Stress ride submitted up to 114 of 817 entity markers. A second run continued 105 tiles to the far end, where up to 712 markers entered the camera render list. Its last sampled view submitted 1,925 main draws and 2.37 million triangles. Frame p95/p99 rose from 25.1/33.5 ms on the short reference ride to 33.4/62.4 ms on the extended repeat. The sun's shadow work, camera angle and rendered distance all vary along the route. A small near-spawn camera view materially overstates sustained long-road performance.

On the repeated Stress run, preparing world matrices and the camera submission list averaged 2.23 and 2.33 ms/frame on the short ride. The extended ride averaged 1.67 and 2.37 ms respectively. The extended view's total GPU p50/p95 reached 18.69/33.51 ms, and 26 animated actors were eventually camera-visible. In comparison, mixer updates averaged 0.5 ms and shared NPC/runtime ticks averaged below the 0.1 ms reporting resolution. These are separate CPU and elapsed GPU timings. Adding them would double-count overlapping work.

## Before and after

Chrome 158.0.8127.37 ran on Intel Iris Xe, ANGLE D3D11, driver 32.0.101.5768, headless at 960 × 600 and DPR 1. Playwright served actual build and public asset bytes. Each entry below is the p95 frame interval in ms from a single route per revision. The reference used the ordinary render probe. The delivered matrix also timed whole-scene matrix updates and camera-list construction. Relative timings include run variance. The paired data show mixed steady-state results.

| Fixture | Walk, reference → delivered | Short ride, reference → delivered | Orbit, reference → delivered | Full-route final leg, reference → delivered |
| --- | ---: | ---: | ---: | ---: |
| Small | 12.4 → 12.5 | 16.8 → 12.7 | 16.8 → 12.6 | Unmeasured → 12.6 |
| Medium | 16.5 → 16.7 | 20.8 → 12.7 | 24.9 → 16.5 | Unmeasured → 20.9 |
| Large | 20.8 → 8.5 | 25.1 → 20.8 | 25.2 → 16.7 | Unmeasured → 29.2 |
| Stress | 16.8 → 20.8 | 25.1 → 21.0 | 29.3 → 33.4 | 33.4 → 49.9 |
| Frontier | Startup failure → 20.8 | Startup failure → 54.2 | Startup failure → 33.2 | Startup failure → 41.6 |

The Stress final leg regressed across the reported pair despite a faster scene build. Its two runs had nearly identical peak visibility (712 and 711 submitted entities), but GPU p50 rose from 18.7 to 30.4 ms. Neither terrain generation nor model decoding ran during that leg. The data do not isolate a single cause of the variance.

### Delivered far-road measurements

Each row starts at coordinate 37 and ends eight tiles from that world's boundary. Durations differ, so the two long-frame columns give counts with frame sample sizes available in the accompanying data.

| Fixture | p50 / p95 / p99 (ms) | Worst (ms) | >33 / >50 ms | Visible markers / total scene entities | Final main draws / triangles | Mean callback / median GPU (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 8.4 / 12.6 / 12.7 | 16.8 | 0 / 0 | 74–107 / 118 | 354 / 374,492 | 4.3 / 9.2 |
| Medium | 12.5 / 20.9 / 25.0 | 70.9 | 2 / 2 | 104–241 / 269 | 714 / 791,984 | 7.6 / 13.1 |
| Large | 12.6 / 29.2 / 37.7 | 58.3 | 33 / 2 | 108–425 / 502 | 1,200 / 1,413,108 | 9.9 / 12.7 |
| Stress | 29.1 / 49.9 / 58.3 | 58.5 | 254 / 24 | 117–711 / 817 | 1,924 / 2,367,598 | 22.2 / 30.4 |
| Frontier | 25.2 / 41.6 / 58.4 | 100.1 | 312 / 15 | 130–1,363 / 1,619 | 3,532 / 4,506,844 | 22.0 / 24.9 |

The camera submitted all 50 skinned actors at the end of Frontier. There were 84 valid GPU queries during that leg, with GPU p95 of 38.5 ms. Each shadow-map refresh that submitted draws averaged 238 calls and 4.8 ms of CPU time. Rendering occupied 18.6 ms of the 22.0 ms average callback, including 2.9 ms on world matrices and 4.0 ms on camera-list construction. Mixers used 0.9 ms per frame. Runtime tick durations rounded to 0.0 ms. During the final view, the two spruce submeshes alone accounted for 1,297 submissions. These counts support work on distant, visible geometry and draw submission ahead of distance-based gameplay simulation.

### Frame pacing near the practical limit

The independent pacing repeat kept the ordinary test-mode runtime and consecutive browser frame timestamps. It omitted custom GPU timers, shadow instrumentation, render-list sampling and matrix timings. Each trip used the same generated project, real inputs and route.

| Fixture | Walk p95 / p99 | Short ride p95 / p99 | Orbit p95 / p99 | Far ride p95 / p99 | Far frames >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Large | 8.5 / 16.7 | 12.6 / 16.6 | 12.7 / 16.7 | 21.1 / 29.3 | 0 / 831 |
| Stress | 12.5 / 12.7 | 20.9 / 29.2 | 20.9 / 25.0 | 45.8 / 62.6 | 42 / 927 |

An independent Stress experiment held local matrices fixed for 3,709 nodes in 781 existing, fixed scenery groups. World transforms and dynamic actor matrices remained available to Three. Mean matrix work fell from 2.11 to 1.10 ms on the short ride and from 2.31 to 0.95 ms on the far ride. Far-road p95 fell from 49.9 to 25.2 ms, but median GPU time also varied from 30.4 to 20.1 ms despite matching camera submissions. This supports a modest CPU saving. It cannot attribute the much larger end-to-end difference to the transform change. The trial remains an opt-in benchmark.

### Loading and resources

Seconds are elapsed click-to-ready. Build/terrain columns are main-thread milliseconds from the latest reported scene build before cold readiness. Counts in the last two columns come from delivered runs.

| Fixture | Cold reference → delivered (s) | Warm reference → delivered (s) | Build / terrain reference → delivered (ms) | Post-GC Play / Edit / warm Play (MB) | Far-road geometries / textures / programs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small | 3.00 → 4.16 | 1.57 → 0.67 | 69 / 37 → 78 / 36 | 17.4 / 13.5 / 17.3 | 145 / 74 / 21 |
| Medium | 5.16 → 3.77 | 2.59 → 0.81 | 253 / 134 → 148 / 79 | 21.5 / 14.8 / 21.2 | 194 / 118 / 22 |
| Large | 4.07 → 3.18 | 5.12 → 1.39 | 308 / 156 → 145 / 74 | 27.1 / 16.4 / 26.4 | 236 / 195 / 22 |
| Stress | 6.07 → 4.39 | 1.91 → 1.19 | 618 / 234 → 237 / 98 | 34.4 / 18.1 / 34.1 | 273 / 327 / 22 |
| Frontier | Failed → 6.22 | Unavailable → 1.74 | Failed → 563 / 183 | 52.3 / 22.9 / 50.7 | 348 / 591 / 22 |

All five delivered scales requested the same 17 GLBs (8,946,376 encoded bytes) and performed 17 parses. The slowest individual asynchronous parses across the five cases took 175–469 ms. Warm reopens performed zero additional GLB parses. Visible draw counts, per-actor texture residency and live heap grew even with constant source bytes. The one warm cycle per scale checks replay cost and counts. It cannot demonstrate a long-term memory plateau. Driver VRAM bytes were unavailable.

## Priorities for a larger world

| Rank | Capability | Measured opportunity | Implementation cost and next experiment |
| ---: | --- | --- | --- |
| 1 | Instancing repeated opaque or alpha-tested scenery | Two spruce submeshes alone submitted 1,297 draws in the far Frontier view. | Moderate. Trial bounded batches on that precise sightline and verify shadow, alpha, per-instance transforms and entity removal. Earlier Merewatch trials found little gameplay benefit on a shorter sightline. |
| 2 | Distance- or screen-size-based LOD | The far Frontier sample submitted 4.51 million triangles, including all 50 skinned actors. GPU p95 exceeded the 30 Hz budget. | Moderate to high. Compare representative far meshes and silhouettes in motion. Instancing alone preserves triangle workload. |
| 3 | Spatial partitioning for rendering | Frontier averaged 4.0 ms building the camera list. The camera saw 130–1,363 of 1,619 entities on one road. | Moderate. Compare frustum rejection of static groups on near and far views. Little can be rejected when almost everything is camera-visible. |
| 4 | Worker-based terrain preparation | Frontier's latest cold build spent 183 of 563 ms generating terrain after the geometry fix. | Moderate. Time off-thread vertex/index production plus buffer transfer and main-thread upload before broadening worker ownership. The active terrain-raster worker already covers a different cost. |
| 5 | Resource preloading | Frontier spent 6.22 s reaching cold readiness but 1.74 s reopening with zero additional parses. Each scenario used 8.95 MB of model sources. | Low to moderate for known forthcoming assets. Evaluate the first-entry delay independently from repeated road travel. |
| 6 | Distance-based NPC activation | Mixer updates averaged 0.9 ms/frame on the largest long ride. Shared runtime ticks averaged below 0.1 ms with these stationary NPCs. | Moderate to high correctness cost for patrol, combat, quests and saves. Measure a moving, hostile population before changing activation. |
| 7 | General scene streaming | The entire 31,416-tile world loaded and remained navigable with a 52.3 MB post-GC JS heap. Most entities were visible at the far end. | High. First test visibility, asset diversity and resident resources on a representative authored layout. Streaming alone would still face the cost of that long view. |

## Reproduction

Use Node 22 or newer and the existing dependency installation. Build each revision into a separate directory. Run one browser at a time. The test-mode bundles expose the existing runtime measurements.

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{outDir:'test-results/world-build',copyPublicDir:false}})"
$env:HOLLOW_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:HOLLOW_ANGLE = 'd3d11'
$env:HOLLOW_OFFLINE_ROUTE = '1'
node e2e/hollow-runtime-baseline.mjs test-results/world-build test-results/world-run --world-scale small medium large stress frontier
node e2e/hollow-runtime-baseline.mjs test-results/world-build test-results/world-stress-phases --world-scale --world-phases stress
node e2e/hollow-runtime-baseline.mjs test-results/world-build test-results/world-trial --world-scale --world-phases --world-fixed-matrices stress
node e2e/hollow-runtime-baseline.mjs test-results/world-build test-results/world-pacing --world-scale --world-pacing-only large stress
node e2e/hollow-world-fixture.mjs frontier test-results/survey-frontier.project.json
```

The last command writes a new file for manual project import. Each browser result includes the generated project hash, timings by action, real GLB request timings and byte counts, elapsed loader parses, runtime diagnostics, post-GC heap sizes and a separate stage/failure record. Load and parse spans can overlap. Scene build and terrain timings refer to the latest build reported before readiness. Visible entity counts count distinct runtime marker groups with at least one submitted main-camera mesh sampled every twelfth render. Occluded meshes can still be submitted. Shadow cost measures elapsed CPU time in the shadow pass per update with draws, and GPU queries enclose the full render. Application heap figures exclude GPU driver allocations.
