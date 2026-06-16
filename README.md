# Adventure Game Builder

Adventure Game Builder is a browser-based 2D adventure game editor and runtime built with Vite, React, TypeScript, Phaser 3, Three.js, and Zustand. It is designed as a small game-building tool rather than a full engine: authors edit one schema-driven `GameProject`, then press Play to test that project in a Phaser runtime.

Current status: active prototype / V1-style editor-runtime loop with several playable systems implemented. The project is intentionally pragmatic and keeps features simple, data-driven, and testable.

Long-term goal: become a lightweight builder for classic 2D adventure/RPG-style games with multiple areas, map editing, NPCs, objects, quests, rules, inventory, shops, vehicles, and exportable playable games.

## Current Features

- Areas: projects can contain multiple linked maps/areas such as outdoor, indoor, cave, ship, dungeon, or custom areas.
- Map Editor: grid terrain editing, overlays, structures, event blocks, pickups, objects, NPC placement, pan/zoom, brush tools, palette resizing, and area selection.
- 3D Preview: read-only Three.js preview of the active area's terrain and placeholder entity markers, with orbit/pan/zoom controls, camera presets, event-block debug markers, and click-to-select sync with the existing editor selection.
- Objects: reusable object definitions and placed instances with behaviours for containers, doors, signs, and vehicles.
- NPCs: reusable NPC definitions with defaults plus placed instances with overrides.
- NPC Movement: stationary, patrol, and wander movement modes; hostile NPCs can chase the player with simple grid movement.
- NPC Attributes: health, faction, alignment, interaction availability, movement speed, and enemy behaviour settings.
- Items: item definitions for keys, currency, consumables, quest items, and misc items.
- Inventory: runtime inventory state, pickup objects, inventory rule conditions/actions, and a basic play-mode inventory panel.
- Quests: quest definitions, objectives, rewards, automatic progress tracking, and a play-mode quest panel.
- Rules / Logic Builder: friendly WHEN / IF / THEN / ELSE rules with folders, recursive AND/OR conditions, game-state checks, inventory checks, quest actions, shop actions, and NPC state actions.
- Cutscenes: simple image/text cutscene definitions used by progression, rules, interactions, and object behaviours.
- Vehicles: boat runtime supports boarding, grid sailing over allowed terrain, and dismounting.
- Game State: flags, variables, and optional default inventory copied into runtime state on Play.
- Shops / Economy: buy-only shops using an inventory item as currency, with runtime stock separate from editor defaults.
- Combat: simple melee combat against hostile NPCs, enemy contact damage, NPC defeat, and player Game Over state.

## Architecture Overview

The central schema is `GameProject` in `src/types/game.ts`. Editor sections modify this object. The Phaser runtime reads a cloned snapshot of the object when Play starts.

Editor state is kept separate from project data where possible. UI-only concerns such as selection, map pan/zoom, and palette sizing should not become gameplay schema unless they affect the authored game.

The 3D Preview tab is an editor-only visualization layer. It renders the active area's terrain tiles and simple placeholders for objects, structures, NPCs, pickups, vehicles, and optionally event blocks. It can select existing editor entities, but it does not edit map data, replace Phaser, or affect runtime gameplay.

Runtime state is copied from editor defaults at play start. Flags, variables, inventory, NPC attributes, quest state, shop stock, player health, and combat state are runtime-owned and should not mutate the editor defaults.

Areas own map contents: terrain, overlays, structures, objects, pickups, NPC instances, and event blocks. `activeAreaId` controls which area is edited.

Rules are evaluated by `src/runtime/ruleEngine.ts`. They listen for triggers, evaluate condition trees, and run actions against runtime state.

NPCs use reusable definitions plus placed instances. `src/runtime/npcResolver.ts` resolves definition defaults and instance overrides into the effective NPC config used by editor views and runtime systems.

Objects use reusable definitions plus placed instances. Object behaviours are resolved in runtime helpers and support containers, doors, signs, and vehicles.

Inventory, quests, and shops each have editor definitions and separate runtime state. This keeps authored defaults stable while allowing play sessions to change item counts, quest status, and shop stock.

## Development

Install dependencies:

```bash
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

Run Vitest in watch mode:

```bash
npm run test
```

Run the full local CI check:

```bash
npm run ci
```

Build for production:

```bash
npm run build
```

## Testing

The project uses Vitest with React Testing Library for focused engine, migration, editor smoke, and UI tests.

`npm run ci` runs:

```bash
npm run typecheck
npm run test:run
npm run build
```

GitHub Actions is configured for pull requests to `release/staging` and `main`. The workflow installs dependencies with `npm ci`, then runs typecheck, tests, and build. There are no Playwright tests, browser end-to-end tests, snapshot-heavy suites, or coverage thresholds.

## Project Structure

- `src/types/`: shared `GameProject` schema and related types.
- `src/data/`: default demo project, migrations, presets, and map visuals.
- `src/store/`: Zustand project store and editor-facing project mutations.
- `src/editor/`: React editor sections, inspectors, and editor helpers.
- `src/editor/sections/ThreeDPreview.tsx`: read-only Three.js preview for inspecting active-area terrain and entity placement.
- `src/runtime/`: Phaser runtime, rule engine, movement, inventory, quests, shops, objects, vehicles, NPC movement, combat, and focused runtime tests.
- `src/test/`: shared test utilities and editor smoke tests.
- `.github/workflows/`: GitHub Actions CI workflow.
- `AGENTS.md`: source of truth for AI coding agents.
- `ROADMAP.md`: future roadmap and known ideas.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for near-term work, gameplay systems, editor improvements, visual/asset pipeline ideas, and later advanced features.

## AI Development

See [AGENTS.md](AGENTS.md) before making changes with an AI coding agent.

`AGENTS.md` is the source of truth for agent workflow, common files by task, current systems, architecture notes, migration expectations, and testing commands. Future AI agents should read it first, keep diffs minimal, preserve migration compatibility, keep runtime state separate from editor defaults, and add focused tests for engine logic changes.
