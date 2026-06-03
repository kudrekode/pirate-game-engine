# Adventure Game Builder Guide

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

Objects sit between static structures and NPCs. They are intended for signs, chests, doors, switches, decorative props, and future vehicle markers. They can block movement, expose direct interactions, and target friendly rules by placed instance ID. V1 does not implement vehicles, shops, loot containers, equipment, combat, or enemy behavior.

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

Rules can also activate, complete, or fail quests and read or change runtime NPC health and alignment.

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
- Quest objective evaluation and once-only rewards
- NPC migration, collision, rule targeting, and deletion guards
- Object migration, collision, rule targeting, and deletion guards
- NPC stationary, patrol, wander, bounds, and terrain movement helpers
- Movement resolution
- Project migration
- Basic React editor smoke rendering

Do not add Playwright, browser end-to-end tests, snapshot-heavy suites, or coverage thresholds unless project requirements change.
