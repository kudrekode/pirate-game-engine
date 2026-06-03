# Adventure Game Builder Guide

## Fast Start For Agents

Read this file first, then identify the likely files before opening broader repo context. Prefer minimal diffs and avoid scanning unrelated files.

- Run `npm run ci` before the final response.
- Preserve migration compatibility for old saved/imported projects.
- Keep runtime state separate from editor defaults in `GameProject`.
- Add or update tests for engine logic changes.
- Prefer focused helper tests over browser-heavy tests.
- Do not redesign architecture unless the prompt explicitly asks for it.
- Check `ROADMAP.md` before adding future-facing TODOs or major systems.

## Common Files By Task

- Rules and logic engine: `src/runtime/ruleEngine.ts`, `src/editor/sections/ProgressionEditor.tsx`, `src/types/game.ts`, `src/runtime/ruleEngine.test.ts`.
- Inventory and items: `src/runtime/inventory.ts`, `src/editor/sections/ItemsEditor.tsx`, `src/types/game.ts`, `src/runtime/inventory.test.ts`.
- Shops and economy: `src/runtime/shopRuntime.ts`, `src/editor/sections/ShopsEditor.tsx`, `src/runtime/RuntimePanel.tsx`, `src/runtime/AdventureScene.ts`, `src/types/game.ts`, `src/runtime/shopRuntime.test.ts`.
- Quests and objectives: `src/runtime/questEngine.ts`, `src/editor/sections/QuestsEditor.tsx`, `src/types/game.ts`, `src/runtime/questEngine.test.ts`.
- NPCs: `src/editor/sections/NpcsEditor.tsx`, `src/runtime/npcMovement.ts`, `src/types/game.ts`, `src/runtime/npcMovement.test.ts`, `src/editor/sections/NpcsEditor.test.ts`.
- Objects and object behaviours: `src/editor/sections/ObjectsEditor.tsx`, `src/editor/ObjectBehaviourEditor.tsx`, `src/runtime/objectBehaviour.ts`, `src/runtime/vehicleRuntime.ts`, `src/types/game.ts`, `src/runtime/objectBehaviour.test.ts`, `src/runtime/vehicleRuntime.test.ts`.
- Runtime and Phaser: `src/runtime/AdventureScene.ts`, `src/runtime/PhaserGame.tsx`, `src/runtime/movement.ts`, `src/runtime/movement.test.ts`.
- Migration and default demo: `src/data/migrateProject.ts`, `src/data/defaultProject.ts`, `src/data/projectDefaults.ts`, `src/data/migrateProject.test.ts`.
- Editor tabs: `src/editor/sections/*Editor.tsx`, `src/App.tsx`, `src/store/useProjectStore.ts`.
- Smoke tests and helpers: `src/test/editorSmoke.test.tsx`, `src/test/testUtils.tsx` if present.

## Current Systems Map

- Areas: Multiple `GameArea` records in `GameProject.areas`; each owns terrain, overlays, structures, objects, pickups, NPCs, and event blocks.
- Objects: Reusable `ObjectDefinition` records plus placed `ObjectInstance` records; behaviours support containers, doors, signs, and simple boats.
- NPCs: Reusable definitions plus placed instances with attributes, interactions, stationary/patrol/wander movement, and rule targets.
- Inventory: Item definitions in `GameProject.items`; runtime quantities are copied into play-session state.
- Shops: Buy-only `ShopDefinition` records use an inventory item as currency; runtime stock is copied per play session.
- Quests: Quest definitions guide players through objectives that read flags, variables, inventory, and entered areas.
- Rules: Friendly WHEN/IF/THEN logic with folders, recursive AND/OR conditions, and runtime actions.
- Game State: Flags, variables, and optional default inventory are editor defaults copied into runtime memory.
- Movement: Grid movement resolves terrain, overlays, structures, objects, NPCs, and vehicle context through `src/runtime/movement.ts`.
- Vehicles placeholder: Boats have V1 runtime boarding, sailing, and dismounting. Horses/carts and advanced steering remain future work.
- Runtime UI: React overlays and Phaser UI layers stay camera-independent for inventory, quests, debug text, prompts, and cutscenes.

## Prompting Guidance

Future implementation prompts should specify:

- The exact subsystem to change.
- Systems that must not be touched.
- Expected files when known.
- Required tests or acceptance checks.
- Whether migration/default demo updates are expected.
- That architecture redesign is out of scope unless explicitly requested.

## Architecture

The editor and runtime share one schema-driven `GameProject` object from `src/types/game.ts`.

- React editor sections read and update the project through `src/store/useProjectStore.ts`.
- Default demo content lives in `src/data/defaultProject.ts`.
- Imported and saved projects pass through `src/data/migrateProject.ts`.
- Phaser runtime code reads a cloned project snapshot when the user presses Play.
- Keep editor-only state, such as map zoom, pan, palette width, and selection, out of `GameProject`.
- Keep future work scoped against `ROADMAP.md`; avoid adding major gameplay systems during maintenance passes.

## Areas And Maps

`GameProject.areas` contains multiple `GameArea` records. `activeAreaId` controls which area is open in the editor.

Each area owns:

- Terrain tiles
- Overlay tiles
- Structures
- Pickup objects
- Generic object instances
- NPC instances
- Event blocks
- Optional theme metadata

Terrain remains grid-based. Runtime camera settings live at the project level in `camera`; editor zoom and pan are separate UI concerns.

## Game State

`GameProject.gameState` contains runtime defaults:

- `flags`: boolean values such as `intro_seen`
- `variables`: number or string values such as `gold` or `reputation`
- `inventory`: optional initial item quantities

Each Play session copies these defaults into separate runtime memory. Variables remain general number or text state. Inventory item definitions live in `GameProject.items`; runtime quantities are separate from those definitions.

## Editor Defaults Versus Runtime State

`GameProject` stores authoring defaults. A Play session must not mutate those editor defaults.

Runtime-owned copies currently include:

- Flags and variables in `RuntimeGameState`
- Inventory quantities in `RuntimeGameState.inventory`
- NPC attributes in `RuntimeGameState.npcs`
- Quest status, objective progress, entered areas, and granted rewards in `RuntimeQuestState`

Map entity positions used by Phaser are read from the cloned play snapshot, not the live editor project.

## Items And Pickups

`GameProject.items` contains item definitions. V1 supports keys, currency, consumables, quest items, and miscellaneous items without equipment, crafting, or shop behavior.

Each area owns grid-based pickup objects. Pickups can collect on touch or on interact. Runtime inventory helpers live in `src/runtime/inventory.ts`; the React runtime overlay shows collected quantities without being affected by the Phaser world camera.

## Objects

`GameProject.objects` contains reusable generic object definitions. Each area owns placed `ObjectInstance` records.

Objects sit between static structures and NPCs. They are intended for signs, chests, doors, switches, decorative props, and future vehicle markers. They can block movement, expose direct interactions, and target friendly rules by placed instance ID.

Object behaviours are authored as reusable defaults on `ObjectDefinition.defaultBehaviour` and can be overridden per placed `ObjectInstance.behaviourOverride`. Runtime behaviour helpers live in `src/runtime/objectBehaviour.ts`.

Supported behaviour types:

- `none`
- `container`, which gives configured item contents and can be once-only
- `door`, which can require an item and teleport to an area spawn
- `sign`, which displays cutscene-style text
- `vehicle`, which currently supports simple boat boarding, grid sailing, and dismounting

Direct interactions and rule triggers still run alongside behaviours for compatibility. Horse/cart runtime, advanced vehicle steering, shops, equipment, combat, and enemy behavior remain future work.

## Quests And Objectives

`GameProject.quests` contains player-facing quest definitions. `trackedQuestId` optionally selects the compact play-mode tracker.

Quests organise guidance and progress; they do not replace flags, variables, inventory, areas, or friendly rules. Objectives read those existing systems:

- Flag value
- Item quantity
- Variable comparison
- Entered area

Runtime quest state is copied per Play session. Completed objectives stay complete once achieved, and quest rewards are granted once. Pure quest evaluation and reward helpers live in `src/runtime/questEngine.ts`. The React runtime overlay owns the `J` quest panel and tracked quest display, so neither is affected by the Phaser camera.

Friendly rules can activate, complete, or fail quests explicitly. Active quests also complete automatically when all objectives have been achieved.

## NPCs

`GameProject.npcs` contains reusable friendly NPC definitions. Each area owns placed `NPCInstance` records.

NPC instances are grid-based world entities. They can block movement, render in the Phaser world layer, and participate in the existing interaction and friendly-rule trigger systems. `on_interact` rules target the placed instance ID, not the shared definition ID.

NPC definitions use the existing placeholder avatar and portrait presets. V1 intentionally excludes schedules, pathfinding, shops, enemies, combat, and branching dialogue.

### NPC Attributes

Every placed NPC instance has shared attributes for health, faction, alignment, interaction availability, and movement speed. These fields are data foundations for friendly and future hostile NPCs; there is no separate enemy architecture.

Each Play session copies NPC attributes into `RuntimeGameState.npcs`. Rule conditions can read NPC alignment and health, and rule actions can change those runtime values without mutating editor defaults. Factions remain descriptive data only.

### NPC Movement

Placed NPC instances declare a data-driven movement mode:

- `stationary`
- `patrol` with an optional looping list of grid points
- `wander` inside a rectangular grid zone

Pure grid-step decisions live in `src/runtime/npcMovement.ts`. Phaser applies the resulting steps with small tweens and waits. Movement checks bounds, terrain, structures, the player tile, and other blocking NPCs. There is deliberately no pathfinding; blocked destinations wait or recalculate.

The Map editor has a lightweight overlay-filter foundation. `npc_paths` renders only the selected NPC's patrol path or wander zone. Event-block, collision, quest-marker, and enemy-territory filters remain TODOs.

## Rule Engine

Friendly logic rules live in `GameProject.rules`. Organisational folders live in `GameProject.ruleGroups`.

Folders affect the editor only. They do not change runtime behavior.

Each rule has:

- A trigger such as game start, interact, touch, area enter, or cutscene end
- An optional recursive `conditionTree`
- THEN actions
- Optional ELSE actions

Condition groups support `AND` and `OR`, including nested groups. Missing or empty conditions mean the rule always passes.

Rules can check item quantities and give or remove items. Removing items never drops below zero; stack limits are enforced by the inventory helper.

Rules can also open shops, activate, complete, or fail quests, and read or change runtime NPC health and alignment.

Pure evaluation and action sequencing live in `src/runtime/ruleEngine.ts`. Phaser trigger wiring lives in `src/runtime/AdventureScene.ts`.

Direct interactions on structures and event blocks still work alongside rules for backward compatibility.

## Movement

Movement resolution lives in `src/runtime/movement.ts`.

Resolution order:

1. Out-of-bounds positions block movement.
2. Blocking structures block movement.
3. Overlay movement rules can allow or block movement explicitly.
4. Terrain movement rules and `player.canWalkOn` decide movement.
5. Missing terrain blocks movement.

This allows overlays such as wooden planks to make water traversable.

Vehicle movement also resolves through `src/runtime/movement.ts`. A boarded boat uses the object behaviour's allowed terrain and dismount terrain lists, skips collision against the currently boarded boat object, and still respects map bounds, structures, blocking objects, and NPCs.

## Migration

All imported, loaded, and store-updated projects pass through `migrateProject`.

When changing schema:

- Add safe defaults.
- Preserve older field shapes where practical.
- Add migration tests.
- Avoid silently restoring deleted user state.

## Testing

Use:

```bash
npm run test
npm run test:run
npm run typecheck
npm run build
npm run ci
```

- `npm run test` starts Vitest in watch mode.
- `npm run test:run` runs tests once.
- `npm run ci` runs typecheck, tests, and build.

Current focused tests cover:

- Rule evaluation and actions
- Inventory stacking and pickup collection
- Shop purchases and runtime stock
- Quest objective evaluation and once-only rewards
- NPC migration, collision, rule targeting, and deletion guards
- Object migration, behaviours, collision, rule targeting, and deletion guards
- NPC stationary, patrol, wander, bounds, and terrain movement helpers
- Movement resolution
- Project migration
- Basic React editor smoke rendering

Do not add Playwright, browser end-to-end tests, snapshot-heavy suites, or coverage thresholds unless project requirements change.
