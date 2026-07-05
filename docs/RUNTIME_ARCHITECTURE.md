# Runtime Architecture

## Overview

Adventure Game Builder uses one authored project schema and multiple runtime adapters. `GameProject` describes editor-authored game data. `RuntimeSession` owns play-session state. Phaser remains the default/reference 2D runtime, and the Three.js runtime is an experimental adapter that proves the same shared runtime helpers can drive a 3D presentation.

Runtime adapters should not become separate engines. They should call shared helpers for gameplay decisions and translate the resulting state/events into rendering, camera, input, animation, and UI.

## Editor Data vs Runtime State

`GameProject` is editor data. It contains areas, terrain, overlays, structures, objects, pickups, NPCs, rules, quests, shops, items, cutscenes, dialogues, player defaults, and game-state defaults.

Runtime state is copied from `GameProject` when Play starts. A play session must not mutate editor defaults. Runtime-owned state includes inventory quantities, flags, variables, NPC health/alignment, quest progress, shop stock, player health, progression index, area entry state, collected pickups, opened objects, defeated NPCs, vehicle state, NPC movement timing, and combat cooldowns.

## RuntimeSession

`src/runtime/runtimeSession.ts` creates the renderer-independent session used by runtime adapters.

`RuntimeSession` owns:

- Cloned `GameProject` snapshot.
- Current area id.
- Player grid position and facing.
- Runtime game state.
- Runtime quest state.
- Runtime shop stock.
- Runtime player health and combat state.
- Vehicle state and movement mode.
- Progression and waiting-trigger state.
- Collected/opened/defeated ids.
- NPC movement/enemy contact timing.

Adapters read and mutate this state through shared runtime helpers.

## Shared Helpers

Shared helpers are the source of gameplay semantics:

- `runtimeSession`: create and hold play-session state.
- `interactionDiscovery`: discover nearest/touch interactables with shared priority and eligibility.
- `playerMovementTransaction`: resolve player movement, facing, movement duration, touch targets, and trigger targets.
- `runtimeRuleActionDispatcher`: apply renderer-independent rule action effects and emit presentation requests.
- `runtimeProgression`: process start progression, cutscene progression, trigger waits, area entry, and area transitions.
- `runtimeObjectInteractions`: run object behaviours, pickups, shops, and vehicle transactions.
- `runtimeNpcTick`: update NPC movement, enemy chase, and enemy contact damage.
- `runtimeCombat`: resolve player attacks, NPC damage, defeat state, combat flags, and defeat trigger requests.

When adding gameplay, prefer adding or extending a shared helper before touching adapters.

## Phaser Adapter Responsibilities

`src/runtime/AdventureScene.ts` is the Phaser adapter. It owns Phaser-specific concerns:

- Phaser scene lifecycle.
- Keyboard input translation.
- Tile/world rendering.
- Player, NPC, object, pickup, and vehicle sprites/markers.
- Camera bounds/follow.
- Tweens and animation timing.
- Phaser status/debug text.
- Cutscene/dialogue presentation that currently lives in Phaser.
- Translating shared runtime events into existing React/Phaser overlay callbacks.

It should not own new gameplay state when that state belongs in `RuntimeSession`.

## Three.js Adapter Responsibilities

`src/runtime/three/ThreeRuntimePanel.tsx` is the experimental Three.js adapter. It owns Three-specific concerns:

- Creating and disposing the Three scene, camera, renderer, geometries, materials, and RAF loop.
- Rendering terrain/elevation and runtime-visible entities.
- Translating keyboard input into shared movement/combat/interaction helper calls.
- Rebuilding the scene after runtime state changes.
- Showing simple React overlays for status, flow log, cutscene requests, shops, quests, health, and inventory summaries.

The Three runtime must not import editor store/live editor state for gameplay. It can reuse rendering helpers where practical, but gameplay decisions must come from `RuntimeSession` and shared helpers.

## Event Flow

Typical runtime flow:

1. Play mode receives a cloned `GameProject`.
2. Adapter creates `RuntimeSession`.
3. Adapter marks the initial area entered.
4. Adapter fires `on_game_start` rules.
5. Adapter processes runtime progression.
6. Shared helpers mutate session state and emit renderer-neutral events.
7. Adapter translates events into UI, camera, rendering, or presentation requests.
8. Player input calls shared movement, interaction, combat, and shop/object helpers.
9. Runtime state changes trigger adapter re-rendering.

Presentation requests such as cutscenes, dialogue, shops, teleport requests, game over, and end game should stay renderer-neutral until the adapter displays them.

## Known Limitations

- Phaser remains the reference runtime until parity is tested.
- Three.js runtime visuals are blocky placeholders.
- Three.js runtime movement and NPC motion are not yet polished or fully animated.
- Three.js camera follow and framing need more work.
- Dialogue/cutscene/shop overlays are intentionally simple in the Three adapter.
- Contract tests do not yet compare Phaser and Three runtime behavior end to end.
- Terrain height is visual/editor data; movement currently remains grid/terrain-rule based.

## How to Add a New Gameplay Action Safely

1. Define the authored data in `GameProject` only if schema changes are required.
2. Add migration defaults for old projects if schema changes are required.
3. Put runtime state in `RuntimeSessionState` or existing runtime state containers.
4. Implement gameplay semantics in a shared runtime helper.
5. Emit renderer-neutral events for presentation.
6. Update Phaser adapter to translate events without duplicating logic.
7. Update Three adapter only when the helper can support the same semantics.
8. Add focused helper tests first.
9. Add adapter tests only for input/event/render translation.

## How to Test Runtime Behaviour

Prefer headless runtime tests for shared helpers. They should create a small `GameProject`, create a `RuntimeSession`, call the helper, and assert session state plus emitted events.

Useful test categories:

- Runtime session cloning does not mutate editor defaults.
- Movement/collision decisions are deterministic.
- Interaction priority and eligibility match existing Phaser behavior.
- Rule actions mutate state and emit expected events.
- Quest sync and reward-once behavior hold.
- Object, pickup, shop, and vehicle transactions update runtime state only.
- NPC movement/contact timing respects cooldowns.
- Combat attack/defeat flags and trigger requests match expectations.

Adapter tests should mock Phaser or Three.js where possible and verify that UI/input paths call shared helper paths without relying on real WebGL or browser-heavy behavior.
