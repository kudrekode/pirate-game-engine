# Adventure Game Builder Guide

## Architecture

The editor and runtime share one schema-driven `GameProject` object from `src/types/game.ts`.

- React editor sections read and update the project through `src/store/useProjectStore.ts`.
- Default demo content lives in `src/data/defaultProject.ts`.
- Imported and saved projects pass through `src/data/migrateProject.ts`.
- Phaser runtime code reads a cloned project snapshot when the user presses Play.
- Keep editor-only state, such as map zoom, pan, palette width, and selection, out of `GameProject`.

## Areas And Maps

`GameProject.areas` contains multiple `GameArea` records. `activeAreaId` controls which area is open in the editor.

Each area owns:

- Terrain tiles
- Overlay tiles
- Structures
- Pickup objects
- Event blocks
- Optional theme metadata

Terrain remains grid-based. Runtime camera settings live at the project level in `camera`; editor zoom and pan are separate UI concerns.

## Game State

`GameProject.gameState` contains runtime defaults:

- `flags`: boolean values such as `intro_seen`
- `variables`: number or string values such as `gold` or `reputation`
- `inventory`: optional initial item quantities

Each Play session copies these defaults into separate runtime memory. Variables remain general number or text state. Inventory item definitions live in `GameProject.items`; runtime quantities are separate from those definitions.

## Items And Pickups

`GameProject.items` contains item definitions. V1 supports keys, currency, consumables, quest items, and miscellaneous items without equipment, crafting, or shop behavior.

Each area owns grid-based pickup objects. Pickups can collect on touch or on interact. Runtime inventory helpers live in `src/runtime/inventory.ts`; the React runtime overlay shows collected quantities without being affected by the Phaser world camera.

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
- Movement resolution
- Project migration
- Basic React editor smoke rendering

Do not add Playwright, browser end-to-end tests, snapshot-heavy suites, or coverage thresholds unless project requirements change.
