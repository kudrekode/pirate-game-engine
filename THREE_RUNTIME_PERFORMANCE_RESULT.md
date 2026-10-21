# Three Runtime Performance Investigation

## 1. Executive Result

**PARTIAL.** A reproducible source of severe stutter was identified and fixed: enemy contact damage and nonlethal attacks rebuilt the complete Three scene just to refresh health. In comparable hardware-browser contact windows, five rebuilds and five frame gaps above 50 ms became zero; the worst uninterrupted frame gap fell from **497.2 ms to 11.8 ms**.

A second measured CPU cost, rebuilding terrain lookup maps for every actor/camera frame, was removed by reusing the existing scene-owned sampler. Five moving harbour patrols now use 0.4 ms rather than 1.2 ms of visual-update CPU time per frame.

The user's broader report of ordinary multi-NPC movement becoming almost unplayable was **not reproduced** in this headed, hardware-accelerated browser. That scene already ran around 104 FPS before the changes and remained around 104 FPS afterward. This is a measured contact-stutter fix and CPU saving, not proof that every reported browser configuration is fixed or a claim of user-confirmed perceived smoothness.

## 2. Baseline

Measured on 17 October 2026 in headed installed Chrome, using ANGLE/D3D11 on **Intel Iris Xe**, driver 32.0.101.5768. The machine also reports an RTX 4070 Laptop GPU, but the sampled WebGL contexts used Intel. No software rendering flags or forced discrete-GPU selection were used. Viewport: 1440 x 1000 CSS pixels; Play canvas: 1440 x 830 physical pixels at native DPR approximately 1. All current atmosphere, water, antialiasing, clothing and shadows were enabled.

The ordinary Runtime Parity Demo and quest-authoring Tidewatch Harbour were imported through the app. Parity scaling variants retain the courtyard and vary only character count/movement. The final harbour variant keeps the player, Keeper, environment and quest systems, adding five ordinary patrol instances on existing ground: **seven authored humans total**. All five patrols were observed moving and switching idle/walk.

Discovery windows used a DevTools CPU profile to locate work. These contain a profiler-start stall, so their frame-interval maxima are not gameplay evidence. Their useful synchronous CPU measurements were:

| Courtyard variant | RAF callback mean | Render submission mean | Mixer/animation mean | NPC tick mean |
| --- | ---: | ---: | ---: | ---: |
| Placeholder player, no NPCs | 1.1 ms | 0.8 ms | 0.0 ms | 0.0 ms |
| Authored player only | 1.9 ms | 1.5 ms | 0.1 ms | 0.0 ms |
| Player + 1 moving NPC | 2.5 ms | 1.9 ms | 0.1 ms | 0.0 ms |
| Player + 3 moving NPCs | 3.4 ms | 2.7 ms | 0.2 ms | 0.0 ms |
| Player + 5 moving NPCs | 4.3 ms | 3.4 ms | 0.2 ms | 0.0 ms |
| Same six characters, idle | 4.0 ms | 3.2 ms | 0.2 ms | 0.0 ms |

Values are rounded to 0.1 ms by existing diagnostics; 0.0 means below the rounding threshold, not literally free. Render submission includes Three CPU work and driver calls; it is **not GPU execution time**. Camera and visual phases overlap the encompassing RAF callback, so columns must not be added together.

The clean before/after windows in section 12 do not run the CPU profiler. They use an independent RAF sampler that survives scene rebuilds. Asynchronous, non-disjoint GPU timer queries were available for stable scenes. [Compact measurements](docs/assets/runtime-performance/measurements.json) retain timing, renderer identity, dimensions, lifecycle counts and errors; full CPU profiles/raw windows remain in `test-results/runtime-performance/`.

## 3. Bottleneck Diagnosis

1. **Large intermittent application/render-lifecycle cost:** health-only NPC/combat events called `forceRender`, destroying the renderer, terrain, materials/presentation instances and every character controller. Recreating the WebGL scene caused 272-336 ms synchronous render stalls and up to 497 ms between displayed-frame callbacks. This is the largest measured unnecessary cost.
2. **Steady rendering cost grows with characters and resolution:** the fixed seven-human harbour uses about 7.7-7.9 ms of GPU rendering per sampled frame at DPR 1. Its frame cadence is render-limited on this adapter; it is not an NPC simulation bottleneck.
3. **Avoidable presentation CPU allocation:** `getTerrainPresentationSurfaceY` constructed a tile Map and corner cache repeatedly for actors and camera. The six-character CPU profile attributed approximately 421 ms of self time over ten seconds to sampler construction, plus related allocation/sampling work. The existing traversal world already owns the required sampler.

No measurement supported a gameplay rewrite, renderer replacement, art reduction, animation throttling or shadow-distance system.

## 4. NPC Gameplay Cost

The complete `tickRuntimeNpcs` path, including wander/patrol decisions, chase, grid collision, contact checks and synchronous event emission, averaged below 0.05 ms at approximately 20 ticks/second. Worst observed ticks in the main comparisons were 0.2-0.5 ms. Individual subhelpers were not instrumented further because the whole transaction was negligible. NPC logic, cadence, collision and combat semantics are unchanged.

## 5. React / Application Cost

Ordinary NPC movement updates session/visual refs, not the editor store or React state. Ten-second settled wandering/patrol windows recorded **zero React root commits**. Contact windows recorded ten commits before and after; the fix removes scene reconstruction from those commits, rather than suppressing necessary health feedback.

The editor's authored project remains isolated from Play. RuntimeSession has no hot editor-store subscription. HUD/prompt updates were not a rerender storm in these samples. Save Game was left unchanged.

## 6. Render Loop / Scene Lifecycle

The runtime has one active rendering RAF, with cancellation/disposal on scene teardown and unmount. Movement does not rebuild scenes, GLTF hierarchies or materials. Damage now preserves those identities too. Actual NPC defeat still uses the existing structural rebuild and disposes removed controllers; the browser confirmed mixer count dropping from six to five.

The hidden editor retains a scheduling-only RAF callback that returns before camera/water/render work. It is **not a second rendering loop** during Play. Its frame count remained unchanged throughout every timed Play window. CPU profiles contained a small hidden-check callback cost, not hidden scene rendering. No editor lifecycle redesign was necessary.

## 7. Character Rendering / Animation Cost

The dressed authored asset contains **53,796 triangles, 32,463 vertices, 65 bones, ten skinned meshes, ten materials and six source textures**. It uses the existing Golden idle/walk clips and independent controller per actor. Six/seven controllers cost approximately 0.2 ms per frame in the sampled animation phase. Actions and prepared clips are already cached, and unchanged semantic states already avoid restarting actions.

The seven-human scene has 70 skinned meshes and 70 Skeleton wrappers referring to 455 distinct live bones. Geometry and material identities remain shared: ten geometries and ten materials across those humans. Renderer texture counts also include per-skeleton bone textures; they are not repeated image downloads. No clone/skeleton ownership changes were made.

A diagnostic-only substitution of the existing simpler mannequin reduced scene triangles from 415,540 to 142,148 and main-pass draw calls from 156 to 121. GPU mean moved from 7.64 to 6.38 ms; frame mean from 9.4 to 8.7 ms. That supports a content/rendering cost, but not sacrificing the authored clothing to address the measured stutter. The simpler asset was never saved over the user's projects.

## 8. Shadows / Renderer Cost

The fixed-route character-shadow-off comparison reduced GPU mean from 7.64 to 7.29 ms and frame mean from 9.4 to 9.0 ms. CPU render submission decreased from 4.4 to 3.2 ms. All 70 skinned meshes cast shadows in the normal scene. This modest frame gain did not justify removing player/NPC shadows or adding distance management.

Exploratory seven-human harbour resolution comparisons measured approximately 7.85 ms GPU at DPR 1, 10.41 ms at 1.5 and 14.32 ms at 2. The DPR-2 target was 2880 x 1660, with a 17.5 ms mean frame interval. These exploratory cases used wanderers, whose positions varied; they are resolution diagnostics, not the final fixed-route before/after pair. Native DPR was 1, and the code already caps DPR at 2. No new cap or quality downgrade was justified for this machine.

Retained antialiasing, 1024-square PCF directional shadows, ACES/sRGB/exposure, transparent shoreline and animated water. Water-update CPU time rounded to 0.0 ms. No evidence justified disabling those features. GPU time excludes browser compositing/presentation and should not be added to overlapping CPU phase measurements.

## 9. Asset Loading / Clone Reuse

Each requested GLB URL was requested **once per fresh browser context**, including repeated NPC instances and animation sources. There were no movement-time reloads or parse loops. Scene construction uses the existing registry, cached analysis, `SkeletonUtils.clone`, shared geometry/material/texture resources and reusable animation clips. Focused loader/clone tests verify separate skeletons/bones and shared immutable resources.

The contact defect nevertheless created **30 extra character clones in ten seconds** from the cache. That churn is now zero. Cache correctness alone did not protect against repeated renderer destruction.

## 10. Changes Implemented

- `ThreeRuntimePanel`: NPC/contact and nonlethal combat notifications request a HUD render without incrementing the scene version. Evidence: five damage-triggered scene rebuilds became zero, with unchanged health/combat behavior and no extra clones.
- `ThreeRuntimePanel`: actor/camera presentation reuses `traversalWorld.sampler`. Existing rounding, smooth/blocky sampling and NPC terrain-triangle grounding are preserved. Evidence: harbour visual CPU mean decreased 1.2 to 0.4 ms; a focused test forbids the one-shot terrain helper on subsequent RAFs and checks both terrain modes.
- Existing diagnostics: added runtime commit count, physical target dimensions, DPR and WebGL backend; the overlay now mounts only in development. A production-mode test verifies that it neither mounts nor polls.
- Focused adapter/browser regressions and an opt-in headed profiling script. No schema, save format, shared gameplay, asset/compiler or package-boundary changes.

## 11. Development vs Play Overhead

Measurements were taken in normal Play inside the editor. The editor stayed mounted, preserved its settled canvas and resumed rendering on return to Edit. Zero hidden-editor rendered frames and the CPU trace rule out a second expensive viewport in these samples. No runtime-only product surface was introduced. Open Perf polling remains confined to its child component at four updates/second; the closed panel does not poll.

## 12. Before / After

Same browser/GPU, viewport, current visual settings, fixtures, ten-second sampling method and settling period; CPU profiler disabled. Contact uses one actual ArrowRight input in the parity demo to let the guard approach. Harbour uses the same five fixed patrol routes.

| Measurement | Before | After |
| --- | ---: | ---: |
| Parity contact: scene rebuilds in sample | 5 | 0 |
| Parity contact: new character clones | 30 | 0 |
| Parity contact: uninterrupted RAF mean | 8.48 ms | 6.73 ms |
| Parity contact: p95 / p99 | 8.4 / 13.1 ms | 8.3 / 9.8 ms |
| Parity contact: worst frame gap | **497.2 ms** | **11.8 ms** |
| Parity contact: frame gaps above 50 ms | **5** | **0** |
| Harbour patrol: visual-update CPU mean | **1.2 ms** | **0.4 ms** |
| Harbour patrol: whole RAF callback CPU mean | 5.3 ms | 4.6 ms |
| Harbour patrol: uninterrupted RAF mean | 9.654 ms | 9.649 ms |
| Harbour patrol: p95 / p99 | 11.2 / 12.5 ms | 11.3 / 12.7 ms |
| Harbour patrol: GPU timer mean | 7.88 ms | 7.74 ms |
| Harbour patrol: main-pass calls / triangles | 156 / 415,540 | 156 / 415,540 |

The contact improvement is large and repeatable in lifecycle counts. The harbour CPU saving is real, but its total frame rate is effectively unchanged; the small GPU difference is not claimed as an optimization. Three resets its standard renderer counters after the shadow pass, so listed draw calls/triangles are **main-pass counts**, not total shadow-plus-main submissions.

## 13. Visual Tradeoffs

**None intentionally introduced.** Authored body/clothing, idle/walk, lights, atmosphere, water, materials and expected shadows remain. [Fresh seven-character harbour screenshot](docs/assets/runtime-performance/five-patrols.png) was visually inspected. No Blender matrices, mesh simplification or broad screenshot suite ran.

## 14. Gameplay Regression

Fresh headed-browser acceptance passed:

- Parity: stationary/wander/patrol behavior, interpolation/grounding, dialogue pause/resume, contact health, Space damage/defeat, freed collision, idle recovery, save/reload/Continue and unchanged authored project. Added assertions prove no scene rebuild/clone on damage and disposal of the defeated actor's mixer. 19.7 seconds.
- Tidewatch: Keeper quest activation, one-time message, chest/key, current objective, fractional-position save/restore, inventory, retained-key shack entry, completion and second Continue. 1.2 minutes.
- Five harbour patrols: all five move and show idle/walk; stable scene/clone/load counts; one runtime RAF; hidden editor frame count stationary; original editor canvas resumes; project data unchanged. 18.4 seconds.

The new patrol check initially captured the editor canvas before asynchronous asset replacement completed. Its setup now waits for loaded editor characters; only that affected case was rerun. [Compact acceptance evidence](docs/assets/runtime-performance/acceptance.json).

## 15. Diagnostics

In development Play, open **Perf** for FPS, frame/CPU phases, main-pass rendering counts, actors/mixers, lifecycle/load counters, runtime commits, render resolution and WebGL backend. Backend text distinguishes actual hardware from a software renderer when the browser exposes it. No mutable scene/controller handle ships in the app.

For repeatable investigation, start `npm.cmd run dev -- --host 127.0.0.1`, then:

```powershell
node tools/profile-three-runtime.mjs --list
node tools/profile-three-runtime.mjs local-check parity-contact,harbour-patrol
```

The script imports ordinary projects, creates only selected variants in memory, uses an isolated headed Chrome context, and saves evidence under `test-results/runtime-performance/`. It does not assert FPS. `PROFILE_BROWSER` can select another installed Playwright browser channel. `CPU_PROFILE=1` requests a separate DevTools CPU profile; do not use profiler-start/stop stalls as frame-pacing evidence. Browser-only interception enables diagnostic shadow/mixer/DPR controls; none persist in project files or production code.

## 16. Validation

- Focused adapter/NPC/combat/animation/visual/clone run: **8 files, 105 tests passed**.
- Loader cache and developer/production overlay run: **2 files, 13 tests passed**. Diagnostic counters also passed their focused suite.
- Root TypeScript check passed.
- Three targeted browser cases passed as detailed above; browser exceptions: zero.
- Biome on changed implementation/test/profiling files: no errors (style warnings remain).
- Required `npm.cmd run ci`: **passed, invoked once**, exit code 0. All **95 Vitest files / 752 tests**, type-safe root and Studio production builds, all three package typechecks/builds, and **63 cheap Node compiler/asset tests** passed. Full log: `test-results/runtime-performance/ci.log`. Vite emitted its existing large-chunk advisories.
- `git diff --check`: **passed**.

No Blender or compiler geometry matrices were run. Cheap compiler checks belong to the single CI gate.

## 17. Remaining Bottlenecks

The exact browser/window and circumstances behind the user's severe ordinary-movement report remain unconfirmed. This machine's hardware-accelerated Chrome did not reproduce that symptom. If it persists, compare the retained Perf backend, physical resolution, scene-rebuild counters and actor counts in that window before changing content. The new report does not substitute software/headless FPS for that evidence.

Steady GPU rendering, draw submissions, bone updates/uploads and high render resolution remain the main scaling costs. All current characters stay animated; no offscreen gameplay or animation throttling was introduced. Structural changes such as actual defeat/area changes still rebuild the scene; optimizing those would require separate measured acceptance. Initial loading/compilation is outside settled-window claims.

## 18. Recommended Next Feature

**Deeper character/render optimisation**, beginning with a trace from the specific window that still feels slow, if the symptom persists. Hardware GPU samples and the simpler-character comparison identify rendering as the remaining scaling area; they do not yet justify an LOD, atlas, skeleton-sharing or compiler overhaul. No follow-on feature was implemented.
