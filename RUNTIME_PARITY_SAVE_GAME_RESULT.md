# 3D Runtime Gameplay Parity + Save Game Persistence

## 1. Executive Result

**PASS.** Existing NPC movement, interaction and Space combat work in Three with small presentation/timing fixes; no gameplay redesign was needed. Save Game / reload / Continue preserves meaningful Tidewatch adventure progress in an isolated runtime session. Both requested browser workflows and all CI stages passed.

## 2. Existing Gameplay Audit

The audit read the four prerequisite result reports, the runtime guides, both adapters, shared session/input/NPC/combat/progression/quest/object helpers, project storage and the existing Tidewatch browser route.

- Stationary, bounded random wander and authored patrol already exist. Patrol can loop or stop at its final point. Wander selects a random zone cell, steps X before Y, and drops a blocked destination to retry later. It is not pathfinding.
- NPC definition defaults and placed-instance overrides resolve through `npcResolver`. Runtime attributes can override health, alignment, interaction permission and movement speed. Each instance owns its movement timing/target state.
- Movement starts after a 450 ms initial delay. A move interpolates for `max(80, 360 / speed)` ms; the next decision waits another 320 ms after a move or 560 ms after an unchanged decision. Speed is clamped to 0.1–10 in the tick.
- Grid collision rejects bounds, missing terrain, non-walkable terrain/overlays, blocking structures/objects/NPCs and the player's cell. NPC collision remains the existing grid policy.
- Hostile NPCs with enabled enemy behaviour already detect and chase by Manhattan distance, stop adjacent, lose detection outside their chase radius and optionally take a return-toward-origin step. The current helper does not plan a complete return route.
- Contact already damages the player on a per-enemy 1,200 ms cooldown. Zero health ends the session. There is no separate global invulnerability state.
- Space already attacks the first hostile NPC on the player's cardinal facing line within authored range. Defaults: 25 damage, one tile range, 500 ms cooldown, 100 player health. This is grid targeting, with no mouse aiming or lock-on.
- Defeat records the NPC ID, sets `npc_defeated_<id>`, removes the NPC/collision, clears movement/contact timers and synchronizes quests. There is no built-in loot, XP or weapon system.
- The `triggerRequested/on_npc_defeated` union member is unused; the shared combat test explicitly expects no such event. The separate `applyEnemyContactDamage` helper is test-only; the active tick uses `damagePlayer`. Neither unused path was promoted into a new feature.

## 3. 2D / 3D Architecture

| Functionality | Classification and result |
| --- | --- |
| Stationary/wander/patrol, chase and contact damage | Already shared and consumed by both adapters through `tickRuntimeNpcs` |
| Player target selection, damage, cooldown, defeat flag/removal | Already shared through `attemptRuntimeCombatAttack`; no combat rewrite |
| Dialogue/shop/inventory/startup/end gating | Shared eligibility plus adapter modal state; both pause NPC decisions |
| NPC movement cadence | Shared deadlines; Three's old 500 ms polling added unnecessary delay, reduced to 50 ms |
| NPC interpolation/facing/idle/walk | Already wired in Three; Phaser uses its own marker/tween presentation |
| Recent enemy health | Shared session data already existed; Three now displays it as Phaser already did |
| Golden humanoid attack fallback | Three presentation defect: unavailable attack could latch forever; now keeps existing locomotion |
| Portraits, Phaser marker rendering and camera/tweens | Renderer-specific presentation, not missing gameplay |
| Defeat-trigger union and old contact-damage helper | Unused paths, not an existing reward/event feature |

No shared gameplay imports React, Phaser, Three or editor store state. Save helpers also keep that boundary.

## 4. NPC Behaviour

The demo includes a stationary Guide, independent West/East Gardeners with wander zones, a looping Patrol Lookout and an enabled hostile Sparring Guard. All are ordinary authored NPC instances using the existing definition and override contract. Dialogue and inventory pause decisions; closing them resumes the shared cadence. An already accepted visual step may finish while a conversation opens.

## 5. NPC Animation / Grounding

All demo characters use the existing finalised authored humanoid and Golden idle/walk mappings, through the registry, cached GLTF loader and independent skeleton clones. No clips or character assets were created.

Three already interpolated X/Z and facing. The small grounding fix samples the actual smooth terrain triangle at the interpolated position instead of rounding back to a tile centre, avoiding height snaps on the raised eastern lawn. Grid NPCs retain their old collision semantics; this does not add walking across world-kit docks, stair navigation or full transformed-object traversal to NPCs. Author their zones on supported terrain and retain cell blockers for major obstacles.

## 6. Combat

Space and its shared rules are unchanged. Continuous Three player coordinates still feed the existing rounded gameplay cell and cardinal facing. The HUD now shows the recent target's name and current/max health alongside existing hit/miss/defeat text. Assets with loaded attack clips use them; Golden authored humans keep idle/walk when no attack clip is available. Contact damage and game-over remain shared.

Defeated IDs and their flags are meaningful session progress, so Continue preserves them. New Game resets them. Non-defeated NPC health/alignment changes persist; random wander positions, targets and cooldowns reset. No rewards, attacks, weapons or AI were added.

## 7. Code Changes Required for Parity

Only small presentation/timing corrections were needed: Three NPC polling, continuous terrain grounding, recent-enemy health display and the missing-attack fallback. Existing movement, targeting, damage and defeat algorithms remain intact. Read-only development diagnostics expose per-NPC logical/rendered positions and animation state for browser observation; there are no test mutation hooks.

The substantial new implementation is `src/runtime/gameSave.ts` plus Play entry/save controls and restore wiring in both adapters. Shared transitions now invalidate stale continuous coordinates at the same point as their grid position update.

## 8. Gameplay Parity Demo Project

Import [runtime-parity-demo.project.json](docs/assets/runtime-parity/runtime-parity-demo.project.json), select **3D View**, then **Play**. Face up at the nearby Guide and press E. Two gardeners wander on separate lawns; a rock wall separates them, water bounds the courtyard, and the lookout patrols the southeast.

After closing dialogue, move right once to (3, 7). Face right and let the Sparring Guard approach (4, 7); press Space twice, allowing the existing cooldown between hits. Observe 50 → 25 → 0 health, contact damage and disappearance. Save Game, return to Edit and Play → Continue to retain the defeat.

The fixture reuses the already finalised character embedded by asset ID; it needs no compiler or Blender invocation.

## 9. Save Game Model

The versioned plain-JSON payload stores:

- Player area, integer cell, cardinal facing, health, movement mode and vehicle state; optional shared continuous X/Z/foot-height and terrain mode for Three traversal.
- Inventory quantities, runtime flags/variables and NPC attributes.
- Quest statuses, completed objective keys, bounded progression facts, entered areas, rewarded quest IDs and completion-action guards.
- Collected pickup/prop IDs, opened object IDs, defeated NPC IDs, fired once-only interaction IDs and moved object coordinates (including parked vehicles).
- Shop stock, completed once-only rule IDs, progression index and any waiting trigger.

Quest definitions, interactions and visuals come from the current authored project. The authored tracked-quest choice remains authoritative; Play has no separate tracking mutation to save. No project clone, renderer object, camera, held keys, animation, dialogue cursor, open modal, notification queue or movement/contact deadline is serialized.

## 10. Save Storage / Versioning

`version: 1`, project identity, authored version and ISO timestamp accompany the snapshot. The repository already uses localStorage for authored projects; the measured Tidewatch payloads are 1,466 bytes before completion and 1,651 bytes afterward, and use a separate `adventure-builder-game-save-v1:<identity>` key. There is one slot per exact authored revision and no slot UI/backend/cloud/autosave.

There was no project ID. A canonical FNV-1a 128-bit content fingerprint gives unchanged imported projects a stable identity without changing the authored schema. Property ordering and the active editor-area selection do not affect it; authored content changes do. It is an identity checksum, not authentication. Changed revisions start fresh and leave old revision saves untouched. There is no speculative migration across changed games.

Loading validates format/version, value types, finite numbers, bounds/facing, stable references and project identity. Invalid/unsupported saves show an error and offer New Game. Storage and quota failures report failure without claiming a successful save or deleting the previous slot. Serialization has a 1,000,000-character size limit. Project JSON and its storage key are never overwritten by game progress.

## 11. New Game / Continue / Save UX

With no saved progress, Play starts a fresh game as before. With a valid save, Play offers **Continue** and **New Game** before creating a renderer. New Game leaves the old slot intact; its first **Save Game** asks **Replace save / Cancel**. Restart also protects the previous slot.

Save Game snapshots synchronously after current gameplay transactions. Dialogue, inventory, shop, cutscene/startup, quest synchronization and ended/dead sessions refuse saving with a readable message. Interpolation and attack cooldowns need not be serialized because their semantic effects are already committed.

Continue creates an isolated session from authored defaults, restores semantic records/Sets, removes collected/defeated entities, rebuilds traversal and then constructs fresh visuals. It bypasses game-start/provisional-area-entry actions and initializes inventory/quest presentation without acquisition/completion notification replay.

## 12. Tidewatch Save Route

The browser flow imports the unchanged quest showcase, starts fresh, talks to the Keeper to activate Harbour Trouble, visits/closes the existing Quayside one-time message, opens the chest and obtains the Harbour Key. At **Enter the shack**, it walks to the distinctive fractional position (4.8, 8.1), saves and returns to Edit. The recorded shared cell is (5, 8), foot height is 1 and facing is down in `area_main`.

After application reload, Continue restored the exact saved area/continuous position, key, opened/empty chest and current objective. The route revisited the Quayside trigger without replay, entered the keyed shack using E, completed the quest, saved again, reloaded and continued at (5, 4). The final snapshot retained completion, all three completed objectives, facts/reward guards and one Harbour Key. No acquisition/completion notifications replayed. No inventory, flags, quests or positions were injected by the browser harness. Facing persistence is covered by the shared restore regression.

## 13. Runtime / Project Isolation

Unit tests detach snapshots from live sessions and from subsequent restores. They compare authored JSON before/after quest, pickup and combat transactions, verify a fresh session has original defaults and ensure collected/defeated removal affects only the cloned project. Both browser flows compare the complete editor-saved project before Play, after returning to Edit and after reload.

## 14. 2D Compatibility

Both adapters read the same save format. Phaser restores the saved area, grid cell, facing and all semantic progress, without running startup again; its boundary test also checks modal save refusal. It intentionally uses the rounded grid position when continuing a Three traversal save. Three preserves fractional coordinates/foot height when available.

The existing renderer-selection buttons still remount gameplay from the selected entry state rather than transferring an unsaved live session. Save and reopen Play → Continue when carrying progress between renderers. No renderer camera state is needed.

## 15. Browser Acceptance

**PASS: both explicit `@runtime-parity-save` cases** in [e2e/runtime-parity-save.spec.ts](e2e/runtime-parity-save.spec.ts), completed 17 October 2026. They use imported normal projects, actual key/button input and read-only diagnostics/storage inspection.

- Parity: stationary Guide; two independent wanderers and existing patrol; idle/walk/interpolation and raised-ground observations; dialogue blocks movement/attack and unsafe save; resumption; enemy contact damage; Space reduces health from 50 to 25 to defeated; freed collision cell; idle recovery without an attack clip; defeat retained after reload/Continue. No page errors; full authored JSON unchanged. **2.8 minutes**.
- Tidewatch: the complete route in section 12, including both reloads, empty-chest reinteraction and once-only trigger revisit. No page errors; full authored JSON unchanged. **12.2 minutes**.

Total: **2 passed in 15.1 minutes**. These are acceptance durations on this machine, not performance benchmark claims. The first attempt exposed two harness timing limits: a five-second guard-position poll expired during slow browser calls, and the original fifteen-minute Tidewatch deadline expired near shack entry after its first Continue checks had passed. Traces were inspected before rerunning. The final run used suitable assertion/route deadlines, fewer redundant readbacks and action/DOM traces without continuous WebGL screencasts. Gameplay controls and assertions were retained.

Evidence: [parity observations](docs/assets/runtime-parity/parity-observations.json), [save observations](docs/assets/runtime-parity/save-observations.json), [combat result](docs/assets/runtime-parity/combat-complete.png), [continued open chest/current objective](docs/assets/runtime-parity/tidewatch-continued.png), and [completed quest after Continue](docs/assets/runtime-parity/tidewatch-completed-continued.png).

Screenshot review also caught toolbar spacing and text contrast. The final contrast correction was checked through normal Phaser controls: Save Game, return to entry, New Game and replacement confirmation/cancel. See [readable save feedback](docs/assets/runtime-parity/save-controls-2d.png) and [Continue/New Game entry](docs/assets/runtime-parity/continue-entry.png). The earlier Three screenshots predate the final text-color correction.

Run only these cases:

```powershell
node node_modules/@playwright/test/cli.js test e2e/runtime-parity-save.spec.ts --grep '@runtime-parity-save' --list
node node_modules/@playwright/test/cli.js test e2e/runtime-parity-save.spec.ts --grep '@runtime-parity-save' --output=test-results/runtime-parity-save
```

## 16. Validation

- Shared runtime/NPC/combat and both adapter regression run: **7 files / 91 tests passed**.
- Save/restore plus Phaser/Three/progression checks: **4 files / 85 tests passed**.
- Final focused save/Phaser/Three regression run: **3 files / 76 tests passed**, including the vehicle/progression save boundary and exact fractional-position restore.
- Golden idle/walk missing-attack regression passed with existing clip/controller tests.
- TypeScript passed after the focused type corrections.
- Browser: **2/2 passed**; targeted save-control contrast check passed.
- Changed TypeScript/TSX/CSS and browser spec: Biome check passed without errors.
- `git diff --check`: passed.
- Required `npm.cmd run ci`: **passed, invoked once**. All **95 Vitest files / 748 tests**, type-safe root and Studio production builds, all three package typechecks/builds, and **63 cheap Node compiler/asset tests** passed.

CI evidence is in `test-results/runtime-parity-ci.log`. Vite emitted its large-chunk advisory. PowerShell redirection surfaced that stderr warning as a `NativeCommandError`/wrapper exit 1, but npm's own CI completion log recorded `verbose exit 0` and `info ok`; a tiny stderr-only exit-0 probe reproduced the wrapper behavior. CI was not rerun.

No Blender character matrices or environment visual/performance benchmarks were run.

## 17. Remaining Limitations

Saves require unchanged authored content and this browser/origin's local storage. Clearing browser storage removes them. There are no autosaves or slots. NPCs remain grid-semantic, with no new navigation for profiled docks/stairs/walls. Golden humanoids still have no authored attack clip. Continue resets NPC wander positions and transient cooldowns. Phaser rounds a continued Three subcell position to its shared grid cell. Saving during blocked/ended gameplay is unsupported.

## 18. Recommended Next Feature

**Quest journal / waypoints**, specifically optional world waypoints for the existing current objective. The engine already has directed quests, a current-objective tracker and a 2D quest list; build on those instead of rebuilding quest progression. Not implemented here.
