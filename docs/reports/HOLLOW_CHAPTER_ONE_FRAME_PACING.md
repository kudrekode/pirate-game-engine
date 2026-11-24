# The Hollow Kingdom — Chapter One frame pacing and cold loading

24 November 2026. Reference revision `c59d857`. Held walking rendered more uniformly in the sampled camera view, and the long tail during the Hollowwood fight shortened. The mounted route regressed. The largest remaining interruption was a 954 ms frame during the ridge transition. These are automated measurements on the Intel GPU. Human playtest confirmation remains open.

## Chapter One in motion

Times are milliseconds. Each triplet gives p50 / p95 / p99 of consecutive browser animation-frame timestamps during the action. “Visible” counts distinct skinned scene roots in the camera render list. The mixer column gives active mixers at the start and end of the action. These counts matched in both runs.

| Scene and action | Visible | Mixers | Before | After | Worst before → after | Frames >50 ms before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Merewatch, settled spawn | 3 | 3 | 16.7 / 24.7 / 25.1 | 12.7 / 20.9 / 29.4 | 33.3 → 33.4 | 0 → 0 |
| Walk with follow camera | 2–3 | 3 | 16.6 / 20.8 / 20.9 | 12.7 / 16.8 / 20.8 | 25.0 → 29.3 | 0 → 0 |
| Walk toward Oswin, inspect camera | 1–2 | 3 | 12.4 / 16.7 / 16.9 | 12.3 / 12.7 / 16.7 | 25.2 → 16.8 | 0 → 0 |
| Rotate the village camera | 1 | 3 | 12.4 / 16.7 / 20.9 | 12.5 / 16.7 / 16.8 | 25.0 → 20.9 | 0 → 0 |
| Resume walking after cinematic and dialogue | 1–2 | 3 | 8.5 / 12.6 / 16.7 | 12.3 / 12.7 / 16.6 | 16.7 → 16.8 | 0 → 0 |
| Ride the mare | 2 | 3 | 8.5 / 16.6 / 20.9 | 12.5 / 20.8 / 29.1 | 25.0 → 54.1 | 0 → 1 |
| Follow the ridge into Hollowwood | 3 sampled | 3 → 6 | 4.2 / 25.0 / 212.5 | 4.2 / 8.4 / 149.9 | 512.5 → 954.2 | 8 → 6 |
| First three seconds after arrival | 1 | 6 | 12.5 / 20.8 / 21.0 | 12.7 / 33.0 / 37.4 | 54.3 → 41.5 | 1 → 0 |
| Next three seconds, same forest view | 1 | 6 | 12.3 / 21.0 / 25.0 | 8.7 / 12.6 / 16.6 | 25.2 → 16.6 | 0 → 0 |
| Fight the Warrant Reader and Ashling | 1–3 | 6 → 4 | 8.4 / 20.9 / 25.1 | 8.4 / 12.7 / 16.7 | 37.6 → 17.3 | 0 → 0 |
| Fight the Mere Wyrm after its reveal | 2–3 | 3 → 2 | 4.2 / 8.4 / 12.4 | 4.2 / 8.4 / 8.5 | 29.2 → 24.9 | 0 → 0 |

The follow-camera walk exposes a problem that frame intervals alone miss. With W held on clear ground, rendered movement speed spanned **2.38–5.51 → 3.71–3.88 tiles/s** at p5–p95. The median stayed at 3.79. Advancing a due movement segment immediately before sampling the pose removed the short pause and catch-up between the 16 ms input timer and a render. The existing movement transaction still owns speed, collision and input. A fresh-browser repeat gave 2.33–5.16 → 3.70–3.88 tiles/s and frame p95 of 29.2 → 16.8 ms.

Cold Play to a ready Merewatch scene took **5.14 → 4.24 s**. The ridge action took **3.65 → 3.12 s**. During that transition only six and seven Three frames respectively were submitted, with a single GPU query per build. The independent browser clock also measured time spent waiting for the new scene. The lower transition p95 coexisted with a longer worst freeze.

## Where render time went

CPU is mean main-thread time in the runtime frame callback. GPU is median elapsed time from non-disjoint WebGL timer queries. Draws and triangles come from the camera view. Shadow draws are averaged over updates that actually submitted shadow draws. The raw counts, CPU phase breakdowns, GPU sample counts and scene sizes are in the [measurement data](hollow-chapter-one-frame-data.json).

| View | CPU ms before → after | GPU ms before → after | Main draws before → after | Shadow draws/update before → after |
| --- | ---: | ---: | ---: | ---: |
| Village spawn | 6.4 → 5.1 | 16.4 → 14.0 | 395 → 396 | 310 → 122 |
| Follow walk | 5.3 → 5.9 | 15.2 → 13.1 | 330 → 332 | 310 → 122 |
| Camera rotation | 3.4 → 3.8 | 9.3 → 10.4 | 83 → 84 | 311 → 123 |
| Mounted | 2.8 → 4.0 | 8.6 → 12.9 | 91 → 92 | 310 → 122 |
| Settled forest | 3.8 → 3.1 | 8.7 → 9.7 | 98 → 99 | 345 → 122 |
| Forest fight | 3.2 → 3.2 | 7.4 → 8.4 | 95 → 100 | 335 → 111 |
| Wyrm | 2.7 → 2.6 | 4.5 → 4.6 | 99 → 99 | 148 → 148 |

The spawn camera drew 379,628 triangles in both builds, with the player, Oswin and the mare visible among 143 scene entities. The native directional shadow pass repeatedly drew fixed trees, verge and rocks. In dense scenes the runtime now retains those casters' native PCF depth and restores it before drawing moving shadows. Resolution, cutout materials, light, animation and update cadence are preserved. The extra empty marker accounts for one main draw. The cache requires an additional render target. At a fixed camera and identical animation pose, the cached and native draws matched on all 1,559,040 RGBA channels with 236 eligible caster meshes and no WebGL errors. The wyrm scene uses the ordinary pass.

Two earlier scenery-submission experiments reduced village camera draws from 395 to 217 and 222. Their follow-walk p95 was 20.8 and 29.2 ms respectively. Neither is in the delivered build. Riding also varied between the shadow trial and final pair. The final data support steadier held movement and a shorter combat tail. They do not establish a general GPU or mounted-travel speedup.

## Cinematics

Each column shows the two measurements from independent Chrome launches. On the previous historical run, 11.86 s was the original Merewatch project's first open and 11.37 s was Chapter One's. The current comparison starts from the optimized project revision.

| Click to milestone, ms | Before, runs A / B | After, runs A / B |
| --- | ---: | ---: |
| Cold editor shell in DOM | 104 / 105 | 108 / 105 |
| Cold library button accepted focus after a paint opportunity | 123 / 123 | 125 / 125 |
| Cold preview ready | 3,927 / 4,052 | 2,848 / 2,986 |
| Select cavern sequence | 2,543 / 2,583 | 1,425 / 1,365 |
| Switch back to first sequence | 1,341 / 1,743 | 217 / 228 |
| Reopen workspace, second visit | 564 / 739 | 710 / 691 |
| Reopen workspace, third visit | 576 / 610 | 617 / 549 |

Cold native WebGL context creation took about 9 ms in all four runs. Cold program submission took 71–94 → 69–72 ms. The first draw took 712–732 → 488–583 ms, including 418–421 → 286–292 ms in shadows. Main-thread task time through ready fell from 2.71–2.99 to 1.83–2.03 s. The longest remaining cold task was 500–591 ms. The library could accept focus well before the preview was ready, but main-thread stalls still interrupted the loading period. The stage retains its loading status, model retry and renderer-error controls.

Switching to the cavern previously created another context, spending 982–1,033 ms inside `getContext`. The keyed sequence now reuses the workspace canvas and renderer. Both in-workspace switches created **zero** new contexts. The cavern first draw fell from 171–178 to 74–88 ms. Closing the workspace releases the renderer. Reopening it created one context and issued zero new GLB requests in both builds. Warm reopen time varied in both directions.

A separate failure test held the Wayfarer GLB request open. The selected library control accepted focus while the stage displayed its model-loading count. Aborting that request showed the model alert. Clicking **Retry models** issued one new request, cleared the alert and reached a ready stage.

## Animation delivery

| Source | Original bytes | Clip-only bytes |
| --- | ---: | ---: |
| GoldenReference_Idle | 15,828,832 | 296,456 |
| GoldenReference_Walk_InPlace | 15,588,768 | 56,372 |
| Combined | 31,417,600 | 352,828 |

Each original has 69 nodes, three meshes, a skin, and seven embedded images totaling 14,736,925 bytes. The delivery copies preserve the node hierarchy, local transforms and all 23 CUBICSPLINE channels per clip. The extractor copies the original keyframe buffers. The loader comparison checks every track name, time, value and interpolation, binds each track to the Chapter One player, and compares bone world matrices at five poses. Both original rigged files remain at their existing paths for authoring tools. The two animation-only registry IDs now resolve to the smaller files.

Before changing the registry, a delivery-only trial served the compact bytes under the old URLs. Cold stage time was 2.524 → 2.808 s in that trial. The repeatable gain was **42,239,384 → 11,174,612 GLB bytes**, across the same 25 unique cold requests. The cavern then requested six additional GLBs once each. The paired stage timings above include the full change set.

With the browser's actual GLTFLoader, three alternating decodes gave median parse times of **139.1 → 1.6 ms** for idle and **142.3 → 1.2 ms** for walk. Fetch and array-buffer completion were timed separately. The first original pair took 361 / 290 ms to fetch locally, versus 13 / 7 ms for the compact pair. These isolated timings identify work removed from loading. Concurrent stage loads prevent adding them directly to the cold-preview improvement.

## Repeated transitions and memory

Three Save → Edit → Continue cycles restored the exact saved traversal position, preserved stored project data, and resumed one render loop each time. In Hollowwood, geometry/texture/program counts stayed constant at 73/88/21 before and 74/90/22 after. Warm Continue took 572–586 → 610–643 ms. Post-GC Play heaps ranged from 27.3–28.0 MB on both builds. Post-GC Edit heap rose by about 1.1 MB from the first to third cycle on **both** builds. The three-cycle check cannot establish a long-term heap plateau.

Three additional cavern → first-sequence round trips measured resources with the same Cinematics workspace open. The old cavern renderer reported 77 geometries, 54 textures and 19 programs each visit. The reused renderer reported 141/84/22. Returning to the first sequence gave 150/72/22 → 191/85/24. The higher resident counts were identical on all three visits to each scene. Reuse trades some residency for eliminating context recreation and repeated preparation. These are Three resource counts. Driver memory in bytes was unavailable.

## Method and reproduction

Chrome 158.0.8127.37, ANGLE Direct3D 11 on Intel Iris Xe, driver 32.0.101.5768, 960 × 600, DPR 1. The browser ran headless. Both builds used the same optimized Vite test mode, the same probes and the original Chapter One JSON. Each full play route used a fresh browser; warm visits kept the same document and decoded asset cache. Playwright fulfilled actual local build and asset bytes with HTTP caching disabled. These figures exclude WAN transfer and human perception. Per-action percentiles describe one route per build, plus a separate walking repeat. The forest fights both ended with the Warrant Reader and Ashling defeated. Both wyrm runs defeated the dragon.

The runner imports the fixture, uses isolated save checkpoints to reach authored encounters, and drives travel, camera, mount, dialogue, cinematic skip and attacks through runtime controls. It checks restored save state and stored authoring JSON. Read-only Three observations record camera-visible skinned roots and sampled GPU elapsed time. For walking, rendered travel is measured between consecutive poses during the middle of the held-key interval. Actor counts and CPU phases during rebuilds are sampled at the available rendered frames.

Build each revision in its own checkout and point the same benchmark scripts at each output. Keep the browser and transport the same and run the benchmarks sequentially. The extra flags perform the fixed-pose comparison, workspace resource cycles and isolated clip decode outside the primary samples.

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({mode:'test',build:{outDir:'test-results/chapter-build',copyPublicDir:false}})"
$env:HOLLOW_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:HOLLOW_ANGLE = 'd3d11'
$env:HOLLOW_OFFLINE_ROUTE = '1'
node e2e/hollow-runtime-baseline.mjs test-results/chapter-build test-results/chapter-play --play-session chapter-one
node e2e/hollow-runtime-baseline.mjs test-results/chapter-build test-results/chapter-walk --play-session --walking-only chapter-one
node e2e/hollow-runtime-baseline.mjs test-results/chapter-build test-results/chapter-shadows --play-session --walking-only --verify-shadows chapter-one
$env:PROFILE_CHROME = $env:HOLLOW_CHROME_PATH
$env:PROFILE_ANGLE = 'd3d11'
$env:PROFILE_DIST = 'test-results/chapter-build'
node tools/profile-hollow-editor.mjs http://127.0.0.1:4182/ test-results/chapter-editor.json --chapter-cinematics
node tools/profile-hollow-editor.mjs http://127.0.0.1:4182/ test-results/chapter-resources.json --chapter-cinematics --stage-cycles --clip-decode
```

The shadow comparison requires a build with the cache. The clip decode experiment requires both versions of the locomotion files in the public asset tree. The delivery copies can be regenerated with `node tools/blender-character/golden-locomotion-clips.mjs`.

## Validation

The full CI invocation passed 1,080 of 1,081 Vitest tests and found one package assertion expecting the old clip filenames. After correcting that assertion, all 11 tests in its owning package passed. The remaining CI stages passed individually, including the root and Asset Studio production builds, three package builds/typechecks and all 78 Node tests. The root build contains both delivery GLBs at the registered paths. Biome and the Git whitespace check passed. Both complete browser routes passed their save and combat assertions.
