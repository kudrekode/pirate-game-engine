# Adventure Game Builder

Adventure Game Builder is a browser-based adventure game editor and runtime built with Vite, React, TypeScript, Phaser 3, Three.js, and Zustand. It is designed as a small game-building tool rather than a full engine: authors edit one schema-driven `GameProject`, then press Play to test that project in the default Phaser 2D runtime or the experimental Three.js 3D runtime.

Current status: active prototype / V1-style editor-runtime loop with several playable systems implemented. The project is intentionally pragmatic and keeps features simple, data-driven, and testable.

Long-term goal: become a lightweight builder for classic 2D adventure/RPG-style games with multiple areas, map editing, NPCs, objects, quests, rules, inventory, shops, vehicles, and exportable playable games.

## Current Features

- Areas: projects can contain multiple linked maps/areas such as outdoor, indoor, cave, ship, dungeon, or custom areas.
- Map Workspace: shared 2D/3D map editing workspace with grid terrain editing, overlays, structures, event blocks, pickups, objects, NPC placement, pan/zoom, brush tools, palette resizing, area selection, and shared inspector state.
- 3D Preview / Editor View: Three.js view of the active area's terrain and entity markers, with orbit/pan/zoom controls, camera presets, event-block debug markers, accurate click-to-select sync, 3D entity movement/placement, terrain paint/brush/sculpt tools, blocky/smooth terrain, registry-backed GLB visuals, and water/coastline presentation.
- Three.js Experimental Play: an early 3D play mode that renders from the shared play session and shared gameplay helpers, with visual movement interpolation, follow/inspect/third-person cameras, camera-relative WASD, mouse look, imported asset presentation, water/coastline presentation, and performance diagnostics.
- Terrain Height: optional per-tile height/elevation data for Minecraft-like 3D block presentation and simple editor sculpting tools. The 2D Phaser runtime currently treats terrain height as editor/visual data.
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

The central schema is `GameProject` in `src/types/game.ts`. Editor sections modify this object. Play mode creates a cloned runtime snapshot and then a shared `RuntimeSession` for play-session state.

Editor state is kept separate from project data where possible. UI-only concerns such as selection, map pan/zoom, and palette sizing should not become gameplay schema unless they affect the authored game.

The Map Workspace has shared 2D and 3D view modes. Both views edit the same `GameProject` map data and share palette, tool, selection, and inspector state.

The Three.js 3D view in the Map Workspace is an editor view. It renders the active area's terrain tiles, per-tile height/elevation, and simple placeholders for objects, structures, NPCs, pickups, vehicles, and optionally event blocks. It can select, move, and place existing editor entities and sculpt terrain height.

The Phaser runtime remains the default and reference 2D playable runtime. Pressing Play defaults to Phaser, with a `Play 3D Experimental` option available for the Three.js runtime adapter.

Both runtime adapters use shared runtime helpers and `RuntimeSession` state for gameplay semantics. Movement, interaction discovery, rules, quests, inventory, shops, object behaviours, NPC ticks, combat, and progression should stay in shared runtime code rather than being reimplemented inside Phaser or Three.js render adapters.

The Three.js runtime is experimental. It now supports placeholder and registry-backed GLB presentation, offline-baked Golden Reference animation playback, visual movement smoothing, multiple camera modes, water/coastline visuals, and diagnostics. It still needs model normalisation, UI polish, camera collision/framing polish, and broader parity/contract testing before it can be considered production-quality.

Character animation currently follows the documented offline pipeline: immutable
Mixamo source/provenance records are retargeted by a versioned headless Blender
profile into deterministic Golden-target GLBs, validated through Three.js, and
registered for Asset Studio, the editor, and runtime presentation. See
[`docs/ASSET_STUDIO_ARCHITECTURE.md`](docs/ASSET_STUDIO_ARCHITECTURE.md) and the
[Golden Reference retargeting spike](docs/assets/golden-reference-animation-retargeting-spike.md).

The first procedural compiler milestone is also complete: project-owned Blender
Python generates Procedural Mannequin V0 geometry, binds explicit deterministic
weights to the Golden compatibility skeleton, validates two isolated GLB builds,
and promotes the artifact through Asset Studio and the same root registry,
clone, and animation path. See
[`docs/assets/procedural-mannequin-v0.md`](docs/assets/procedural-mannequin-v0.md).

The checked-in mannequin now uses Generated Body Topology V1: a deterministic
voxel-unioned, closed genus-zero body with blended max-four skin weights, strict
exported topology checks, the unchanged Golden rest signature, and a 21-body
extrema/seed/challenge matrix. See
[`docs/assets/generated-body-topology-v1.md`](docs/assets/generated-body-topology-v1.md).

Procedural Head and Hair Fit V1 advances new builds to
`procedural-humanoid-v2`, replaces the crude head pill with a symmetric
stylised cranium/jaw/chin/face-plane volume, and fits Quaternius Buzzed from
measured scalp/source geometry through `quaternius-buzzed-fit-v2`. Compiler
diagnostics now record the head/scalp contract, derived transform, fit metrics,
and warnings. See
[`docs/assets/procedural-head-hair-fit-v1.md`](docs/assets/procedural-head-hair-fit-v1.md).

Face Readability V0 now generates two Head-skinned eyes, a low-poly nose, and a
fixed mouth line from the measured head contract. Eye colour is authored recipe
data and compiled into a shared eye material; bald and haired artifacts retain
one skin and the unchanged 65-joint skeleton. Asset Studio includes focused
Face controls and close head cameras. The backwards face is now corrected,
with an independent exported face-versus-feet gate and surface-fitted features.
Hair Colour V1 adds compiled hair colour, presets, reset, and recent-job restore;
Hairstyle Library V2 adds Short Crop and Simple Parted alongside Buzzed and
No Hair; see the [current milestone](docs/assets/hairstyle-library-v2.md).

Asset Studio compiles six body proportions, skin colour/roughness, eye and hair colour,
and the selected hairstyle through a local development endpoint and the real
two-pass Blender compiler. Successful validated GLBs replace the preview;
failed jobs preserve it, and Recent Compilations restores prior recipes and
artifacts. Start with the [Asset Studio quick resume](docs/ASSET_STUDIO_ARCHITECTURE.md#quick-resume)
for current versions, exact files, checks, and remaining work.

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

Start the separate Asset Studio app:

```bash
npm run dev:asset-studio
```

Previewing checked-in assets does not require Blender; compiling recipes needs
local Blender. See the [compiler guide](tools/blender-character/README.md).

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

`npm run ci` uses root Vitest discovery, which also finds workspace tests, but
its typecheck/build target the root app. For Asset Studio changes also run
`npm run check:asset-studio` (contract and app checks) and
`npm run test:blender-bake` (Node compiler/API tests and installed GLB round trips).

GitHub Actions is configured for pull requests to `release/staging` and `main`. The workflow installs dependencies with `npm ci`, then runs typecheck, tests, and build. Playwright browser smoke coverage is opt-in through `npm run test:e2e:three-perf`; it is not part of `npm run ci`.

## Project Structure

- `src/types/`: shared `GameProject` schema and related types.
- `src/data/`: default demo project, migrations, presets, and map visuals.
- `src/store/`: Zustand project store and editor-facing project mutations.
- `src/editor/`: React editor sections, inspectors, and editor helpers.
- `src/editor/sections/MapEditor.tsx`: Map Workspace with shared 2D/3D map tools, palette, selection, and inspector.
- `src/editor/sections/ThreeDPreview.tsx`: Three.js editor view for active-area terrain, height sculpting, placeholder entities, selection, movement, and placement.
- `src/runtime/`: shared runtime helpers, Phaser runtime adapter, experimental Three.js runtime adapter, Three visual/asset/camera/diagnostics helpers, rule engine, movement, inventory, quests, shops, objects, vehicles, NPC movement, combat, and focused runtime tests.
- `docs/RUNTIME_ARCHITECTURE.md`: shared runtime/session architecture and adapter responsibilities.
- `docs/THREE_RUNTIME_STATUS.md`: current experimental Three.js runtime status, limitations, and manual parity checklist.
- `src/test/`: shared test utilities and editor smoke tests.
- `.github/workflows/`: GitHub Actions CI workflow.
- `AGENTS.md`: source of truth for AI coding agents.
- `ROADMAP.md`: future roadmap and known ideas.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for near-term work, gameplay systems, editor improvements, visual/asset pipeline ideas, and later advanced features.

## AI Development

See [AGENTS.md](AGENTS.md) before making changes with an AI coding agent.

`AGENTS.md` is the source of truth for agent workflow, common files by task, current systems, architecture notes, migration expectations, and testing commands. Future AI agents should read it first, keep diffs minimal, preserve migration compatibility, keep runtime state separate from editor defaults, and add focused tests for engine logic changes.
