# Combat Hitch Investigation â€” Every Hit Must Be Smooth

## Executive Result

**PARTIAL.** Fixed a repeatable **lethal-hit whole-scene stall**. Across five fresh Runtime Parity Demo runs, lethal input-to-next-RAF fell from **430.7â€“1414.5 ms** to **5.3â€“7.8 ms**. Each defeat previously rebuilt the renderer/world and cloned five surviving characters. Afterward there are **zero rebuilds, zero new clones, zero controller recreations**, and only the defeated controller is disposed.

The reported hitch on **every nonlethal player hit and incoming hit was not reproduced in the current checkout**, which already contains the previous health-only rebuild fix. Those paths have small measured transaction/React costs and retain scene identity before and after this change. This report does not claim to have resolved an unobserved nonlethal-hit problem or to establish user-confirmed perceived smoothness.

## Reproduction

Measured on **18 October 2026**, headed installed Chrome, hardware ANGLE/D3D11 on **Intel Iris Xe**, 1440 Ã— 1000 CSS viewport, 1440 Ã— 830 runtime canvas, DPR approximately 1. The existing Runtime Parity Demo was imported unchanged, with its authored player, five NPCs, clothing, animations, environment, shadows and water. No assets or rendering quality settings were changed.

Each of five independent browser contexts per revision followed these real controls:

1. Import `docs/assets/runtime-parity/runtime-parity-demo.project.json`, Save, select 3D View, Play; wait for loaded assets/clips and settled frames.
2. Press Space at the starting position: **miss**.
3. Press Right to (3,7), wait for the guard at (4,7), then observe three separate **incoming contact hits** (100 â†’ 99 â†’ 98 â†’ 97).
4. Press Space: **nonlethal player hit**, guard 50 â†’ 25. Immediately press again to verify cooldown; the blocked attempt is recorded separately.
5. After the normal cooldown, press Space: **lethal hit**, guard 25 â†’ 0.
6. Return to Edit/Save and compare the complete authored project to its pre-Play serialization.

| Event | Before symptom | After observation |
| --- | --- | --- |
| Miss | No combat stall; no scene invalidation | Same |
| Nonlethal player hit | No repeatable hit stall; health changed correctly | Same; no scene/controller churn |
| Incoming hit | No repeated per-hit stall; one event had a 42.6 ms containing frame gap | Maximum containing event frame gap 16.4 ms in the five-run comparison |
| Lethal hit | Every defeat reconstructed the world; 434.8â€“1425.3 ms containing frame gaps | Actor disappears locally; 12.7â€“17.6 ms containing frame gaps |

Timing uses a continuous independent RAF observer that survives scene rebuilds. The event origin is entry to the runtime Space handler or the NPC tick containing contact damage. Both **origin-to-next-RAF** and the **whole frame interval containing that event** are retained. The first runtime render callback completion is also recorded; this avoids treating an early observer callback as proof that the game has rendered. These are CPU/browser frame observations, not display scan-out or GPU execution measurements.

[Per-event evidence](docs/assets/combat-hitch/measurements.json) includes every main-run event, stage timings, controller identities, lifecycle counts, commits, backend and input/source hashes. [Additional stage capture](docs/assets/combat-hitch/stages.json) separates notification construction/enqueue, health assignment, game-over checks and first-commit latency. Raw windows remain in `test-results/combat-hitch/{before,before-stages,after,after-stages}.json`. Initial probe-calibration captures are excluded from the comparisons. No CPU profiler ran in these measurement windows.

## Timing Breakdown

All values below are **milliseconds**. Small functions are near the browser's 0.1 ms timer granularity; 0.0 does not mean literally free. Nested spans overlap and must not be added together. Main table values are the median / maximum per event, except the explicitly identified individual render and detailed capture rows.

| Player-attack stage | Before | After |
| --- | ---: | ---: |
| Space handler, miss | 0.9 / 1.3 | 1.4 / 2.3 |
| Space handler, nonlethal | 1.2 / 1.3 | 1.3 / 1.8 |
| Target resolution, nonlethal | 0.1 / 0.2 | 0.1 / 0.2 |
| `attemptRuntimeCombatAttack`, nonlethal | 1.1 / 1.3 | 1.1 / 1.7 |
| NPC health calculation + mutation, nonlethal | 0.0 / 0.1 | 0.0 / 0.1 |
| Recent-enemy HUD state mutation | 0.1 / 0.2 | 0.1 / 0.2 |
| NPC-damage HUD enqueue callback | 0.3 / 0.3 | 0.4 / 0.4 |
| Subsequent state/combat HUD enqueue callbacks | each â‰¤0.1 | each â‰¤0.1 |
| Quest/flag synchronization on nonlethal hit | Not called | Not called |
| Attack animation request | â‰¤0.1 | â‰¤0.1 |
| Individual runtime-panel React render, nonlethal | â‰¤0.5 | â‰¤0.6 |
| `attemptRuntimeCombatAttack`, lethal | 1.3 / 1.9 | 3.8 / 4.7 |
| Defeat flag assignment | 0.0 / 0.1 | 0.0 / 0.0 |
| Defeat quest synchronization | 0.1 / 0.1 | 0.1 / 0.2 |
| `forceRender` / version invalidation on defeat | One call; â‰¤0.1 | Not called |
| Deferred scene-effect teardown | 5.8 / 6.9 | Not called |
| Deferred scene-effect construction, including first render | **1013.0 / 1400.5** | Not called |
| Local defeated-actor removal | Not present | **2.0 / 3.1** |
| Defeated-controller disposal within local removal | Not isolated in main baseline | 1.1 / 2.0 |

The extra detailed baseline resolves the expensive effect into: **4.7 ms cleanup**, **12.2 ms WebGLRenderer construction**, **334.3 ms first `renderer.render` submission**, **582.4 ms total scene effect**. It also directly records traversal reconstruction (0.3 ms), marker-list creation (0.6 ms), nine marker constructions (3.3 ms total), and five controller constructions (1.6 ms total). These are overlapping measurements of that one event, separate from the five-run table. The fix removes the entire unnecessary reconstruction transaction, including its first render, rather than tuning general rendering.

| Incoming-contact stage | Before median / maximum | After median / maximum |
| --- | ---: | ---: |
| NPC tick containing the damage | 0.5 / 2.7 | 0.4 / 1.4 |
| Individual contact detection call | â‰¤0.1 | <0.1 |
| Contact transaction, including synchronous events | 0.3 / 2.6 | 0.3 / 0.8 |
| `damagePlayer` | 0.0 / 0.1 | 0.0 / 0.1 |
| Player-health assignment | 0.0 / 0.1 | 0.0 / 0.1 |
| Game-over check | 0.0 / 0.1 | 0.0 / 0.1 |
| Status HUD enqueue callback | 0.1 / 2.4 | 0.1 / 0.2 |
| State/combat HUD enqueue callbacks | each â‰¤0.1 | each â‰¤0.1 |
| Individual runtime-panel React render | â‰¤0.5 | â‰¤0.5 |
| Scene/version invalidation | None | None |

The supplemental after capture times the complete `emit(status)` expression, including message creation and its presentation callback: **0.0 ms nonlethal, 0.1 ms miss/lethal, 0.1â€“0.2 ms incoming**. Transaction-entry-to-first-React-commit latency is **2.1 ms nonlethal, 2.0 ms miss, 1.6â€“2.3 ms incoming, 3.9 ms lethal** in that capture. These latencies include scheduling and are not React commit CPU durations. Normal damage produces status/HUD feedback; it does not enqueue inventory reward notifications. The demo has no active defeat quest, so meaningful defeat-objective/reward semantics additionally have deterministic regression coverage below.

## Root Cause and Invalidation Audit

The remaining **measured** cause is:

`attemptRuntimeCombatAttack` â†’ `defeatRuntimeNpc` â†’ `npcRemoved` â†’ `forceRender("npc removed")` â†’ `setRenderVersion` â†’ renderer effect cleanup/reconstruction â†’ synchronous first render.

The attack helper itself returned quickly; expensive work ran later during React's scene effect before the next frame. Measuring only the shared helper would have missed the stall.

| Combat-reachable work | Nonlethal NPC/player damage | Lethal damage before | Lethal damage after |
| --- | --- | --- | --- |
| `forceRender`, scene-version increment | 0 | 1 | 0 |
| Scene cleanup/build | 0 / 0 | 1 / 1 | 0 / 0 |
| Renderer replacement | No | Yes | No |
| Marker/actor list construction | 0 | 1 | 0 |
| Traversal/collider-world reconstruction | 0 | 1 | 0 |
| New character GLTF clones | 0 | 5 | 0 |
| New character controllers | 0 | 5 | 0 |
| Controller disposal | 0 | 6, detailed baseline | 1, defeated actor only |
| Animation clip requests | 0, detailed capture | 10, detailed baseline | 0 |
| Runtime adapter remount / new session | None | None; scene effect rebuilt within panel | None |

The renderer effect depends on `renderVersion` and terrain mode. The other version source is the existing asset-load callback, which did not fire during settled combat. Progression/rule/spawn/area/vehicle/object invalidations remain for their existing operations; ordinary combat does not dispatch those callbacks. `flagChanged` from defeat does not invoke the rule bridge. Quest-generated `stateChanged` returns through the combat handler's HUD update. There is no session subscription that serializes or replaces the editor project on health changes: the session is an isolated mutable snapshot held in a ref. The parent runtime key changes for restart/mode selection, not damage.

React commit probes show `ThreeRuntimePanel`, `InventoryNotifications`, the developer performance overlay, and `QuestObjectiveTracker` rendering. `App`, parent `RuntimePanel`, `MapEditor` and `ThreeDPreview` do not render in response to these hits. Development StrictMode invokes component bodies more than once. Miss/contact normally produce two root commits; the deliberate nonlethal/cooldown pair produces three, with one before the second input. Defeat produces two before and two or three after, without world reconstruction. The prompt-refresh effect also runs after panel renders; its measured work is small. No measured expensive derived HUD state justified splitting the panel or deferring health feedback.

The authored humanoid has no attack action. `triggerAttack` does one map membership check and returns before requesting a semantic transition when that action is absent. Detailed traces show no attack-time clip requests, preparations, controller creation/disposal or action transition inside that request. The existing idle/walk fallback remains intact; no attack asset was created.

Quest synchronization already runs only on defeat, not each hit. Contact damage does not synchronize quests. The existing defeat flag, shared objective evaluation, reward guard and notification behavior are unchanged.

## Fix

`ThreeRuntimePanel.tsx` now holds a scene-owned removal callback in a ref, cleared with that scene's cleanup. `npcRemoved` invokes it directly. It detaches the defeated group, disposes its controller and owned presentation/bone-texture resources, removes its entries from animation/render/cleanup collections, and refreshes diagnostic counts. Placeholder geometry is disposed locally; imported GLTF geometry/materials remain shared. Surviving groups/controllers, renderer, lights, terrain, traversal sampler and RAF keep their identities.

Shared combat already removes the NPC from the session area's live `npcs` collection. Both grid collision and traversal's legacy collision check read that live collection, so defeat frees its cell without rebuilding collider descriptors. No gameplay helper, combat rule, quest behavior, authored data, schema or asset changed.

## Before / After

Each event category is separate. Values are **median / maximum** origin-to-next-RAF, in ms:

| Event | Count per revision | Before | After | Maximum first runtime-render completion, before â†’ after |
| --- | ---: | ---: | ---: | ---: |
| Miss | 5 | 3.9 / 7.6 | 5.4 / 9.0 | 14.5 â†’ 17.4 |
| Nonlethal player hit | 5 | 4.5 / 6.3 | 5.6 / 8.0 | 14.2 â†’ 18.4 |
| Incoming contact hit | 15 | 3.8 / 27.0 | 4.1 / 10.2 | 33.0 â†’ 13.7 |
| Lethal hit | 5 | **1024.4 / 1414.5** | **6.6 / 7.8** | **1411.4 â†’ 16.9** |

No improvement is claimed for unchanged control paths. Lethal per-run origin-to-next-RAF pairs (before to after): **655.2 to 6.4**, **1277.1 to 5.3**, **1414.5 to 7.7**, **1024.4 to 6.6**, **430.7 to 7.8**.

| Separate sampling window | All-frame p95 / p99 before | All-frame p95 / p99 after | Event-containing-frame p95 / p99 before â†’ after |
| --- | ---: | ---: | ---: |
| Miss | 19.5 / 26.8 | 18.2 / 30.0 | 18.4 / 18.4 â†’ 20.5 / 20.5 |
| Nonlethal plus separately recorded cooldown attempt | 16.0 / 24.1 | 17.3 / 28.9 | 16.0 / 16.0 â†’ 16.5 / 16.5 |
| Incoming contact | 16.6 / 26.4 | 16.6 / 22.0 | 42.6 / 42.6 â†’ 16.4 / 16.4 |
| Lethal | **25.6 / 661.9** | **14.4 / 16.8** | **1425.3 / 1425.3 â†’ 17.6 / 17.6** |

Event-tail percentiles have only 5/15 samples; nearest-rank p95/p99 therefore equal the maximum and do not establish population tails. Full-window counts are 294/356/2063/350 frames before and 297/295/1960/329 after, in table order. Ordinary scheduling variability remains in the longer windows: worst after windows are 36.9/32.9/41.3/19.4 ms. No above-50 ms gap occurred in the five-run after comparison. Average FPS is not an acceptance metric here.

## Regression

- Focused adapter: **47 tests passed**, including placeholder/imported ownership, exactly-once removal disposal, preserved renderer/RAF and movement into the freed cell. The imported ownership fixture also proves cache-owned geometry survives removal and later cleanup.
- Shared combat/contact: **17 tests passed** initially; the added defeat-objective/reward/Continue regression then passed with all **8 combat tests**. It proves no quest sync on nonlethal damage, cooldown, defeat flag, quest completion, exactly one reward, save/restore and unchanged authored JSON.
- Root typecheck passed.
- Existing real-input `@runtime-parity-save` browser cases: **2 passed (2.4m)** in headed Chrome. Courtyard checks movement/dialogue pause, health, contact, defeat, no rebuild/clone/cleanup on defeat, active mixers 6 â†’ 5, freed collision, Save/reload/Continue and project equality. Tidewatch checks objective progression, key/chest state, one-time trigger suppression, completion and a second Continue. Both report zero page exceptions. [Fresh acceptance summary](docs/assets/combat-hitch/acceptance.json).
- Required `npm.cmd run ci`: **passed, invoked once**, exit 0. All **95 Vitest files / 754 tests**, type-safe root and Studio builds, all three package builds/typechecks, and **63 cheap Node compiler/asset tests** passed. The default CI worker configuration succeeded. Full log: `test-results/combat-hitch/ci.log`. Vite emitted its existing large-chunk advisories.
- Final `git diff --check`: **passed**.

The first focused default-fork run failed to start its DOM worker; this was an infrastructure timeout before adapter tests executed, not a test assertion failure. Retrying that affected file with one isolated thread passed all 47 tests. No concurrency/isolation setting was changed in the repository.

## Reproduce the Diagnostic Capture

Start the root Vite server, then:

```powershell
node tools/profile-combat-hitch.mjs --list
node tools/profile-combat-hitch.mjs after-local-check 5
```

This is an opt-in, combat-only tool with no production hooks. Browser response instrumentation times transaction stages, render/cleanup work and animation requests; it exposes scene references only in that isolated instrumented page for identity comparisons. Labels beginning with `after` also assert zero scene/clone/controller recreation and disposal of exactly the defeated controller. Full raw evidence goes to `test-results/combat-hitch/`. `CPU_PROFILE=1` is available for a separate discovery run, but profiler-start/stop windows must not be used as frame-pacing evidence. The checked-in compact report uses profiler-free runs.

## Remaining Limitation

The user's recurring nonlethal-hit symptom remains unconfirmed in this browser/current source. A baseline contact event did coincide with a 42.6 ms frame interval, but its synchronous contact transaction was small; it was not the repeated large hit stall described. The measured defeat rebuild is fixed. These results do not prove that every hit is smooth in the user's original browser/window, and no speculative HUD, quest, animation or general-rendering optimization was applied to conceal that gap.
