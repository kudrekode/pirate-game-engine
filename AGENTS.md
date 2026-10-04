# Adventure Game Builder: Agent Routing

Read this first, identify the affected files, then read only the relevant guide.
Keep diffs focused; architecture redesign and unrelated cleanup require an explicit request.

## Boundaries to preserve

- One authored schema: `src/types/game.ts`. `GameProject` stores defaults;
  `RuntimeSession` owns isolated play state. Never mutate editor defaults during Play.
- Shared helpers own movement, collision, interactions, rules, progression, inventory,
  shops, quests, objects, NPC ticks, vehicles and combat. Phaser/Three are presentation
  adapters, not separate gameplay engines. Shared gameplay must not import React,
  Phaser, Three.js or editor store state.
- One Map Workspace: 2D/3D views use the same project, selection and store mutations.
  UI-only selection/pan/zoom stays outside project data. Terrain height/water remain
  presentation-only until shared movement semantics deliberately support them.
- Preserve saved/imported project compatibility, legacy direct interactions and
  definition/instance overrides. Schema changes need safe migration defaults and
  focused migration tests; do not silently restore deleted user state.
- Use the existing visual resolver, built-in registry, GLTF cache/clone path and
  `createThreeVisualMarkerGroup`. Persist asset ids/transforms, never live renderer objects.
- Asset Studio recipes are source data, separate from compiled GLBs. No Blender or
  Three objects in recipe contracts. Do not claim an export is valid without a round trip.
  Preserve game-engine compatibility when changing workspace/package boundaries.
- Check `ROADMAP.md` before future-facing TODOs or new systems. Add/update focused
  tests for logic changes. Do not introduce broad snapshots, coverage thresholds,
  new browser suites or heavy matrices without a changed acceptance criterion.

## Find the relevant code

| Task | Start here |
| --- | --- |
| Product/build overview, planned scope | `README.md`, `ROADMAP.md` |
| Gameplay/session or adapter work | `docs/RUNTIME_ARCHITECTURE.md`; `src/runtime/runtimeSession.ts`, `AdventureScene.ts` (Phaser), `RuntimePanel.tsx` (mode/HUD), `three/ThreeRuntimePanel.tsx` |
| Movement, rules, inventory, quests, shops, combat, vehicles | Matching helper and test in `src/runtime/`: `movement`, `ruleEngine`, `inventory`, `questEngine`, `shopRuntime`, `combat`, `vehicleRuntime`; transaction/orchestration helpers alongside them |
| NPC/object resolution and behaviour | `src/runtime/npcResolver.ts`, `npcMovement.ts`, `objectBehaviour.ts`; matching `NpcsEditor`/`ObjectsEditor` sections and tests |
| Schema, defaults, migration | `src/types/game.ts`, `src/data/migrateProject.ts`, `projectDefaults.ts`, `defaultProject.ts`, `projectPresets.ts` and their tests |
| Editor/map UI and state | `src/editor/sections/*Editor.tsx`, `src/App.tsx`, `src/store/useProjectStore.ts`; `src/test/editorSmoke.test.tsx` |
| Three presentation | `docs/THREE_RUNTIME_STATUS.md`, `docs/THREE_RUNTIME_PARITY_FINDINGS.md`; `src/runtime/three/threeVisuals.ts`, `threeVisualAssetRegistry.ts`, `threeVisualAssetLoader.ts`, `threeVisualRenderer.ts`, `cameraControls.ts`, `visualSmoothing.ts`, `waterPresentation.ts` |
| 3D editing/terrain | `src/editor/sections/ThreeDPreview.tsx`, `ThreeVisualControls.tsx`, `terrainBrush.ts`, `terrainBlocks.ts`; `src/runtime/three/terrainMeshGeometry.ts` |
| Asset Studio/creator/compiler | Start with [Quick Resume](docs/ASSET_STUDIO_ARCHITECTURE.md#quick-resume), then only the linked milestone relevant to the change; it maps exact implementation files/versions |
| Browser/performance | [Validation and Playwright guide](docs/PLAYWRIGHT_SMOKE.md), `e2e/`, `apps/asset-studio/e2e/` |

Use targeted searches and bounded reads for large components. Do not open full
generated diagnostics, manifests, GLBs or historical milestone documents by default.
Inspect selected summary fields first. Existing milestone evidence is not a fresh pass.

## Validation: cheapest sufficient check first

1. Review the affected contract, code and diff; use `npm run typecheck` for root
   TypeScript feedback when needed.
2. Run a focused deterministic test (table below).
3. Use an existing state/component/boundary test when the change crosses those boundaries.
4. Before the final response, run **`npm run ci` once** and **`git diff --check`**.
   CI owns all Vitest suites, type-safe root/Studio builds, all three package
   typechecks, and cheap Node compiler/asset tests. Do not additionally rerun
   `check:asset-studio`, `test:contracts` or `test:blender-bake` after that gate.
5. Run a targeted browser check only for actual browser/WebGL/input/HTTP acceptance.
6. Run visual/performance or real Blender matrices only when appearance, timing,
   geometry, fitting or compiler determinism is the changed criterion.

Do not rerun unchanged expensive suites for reassurance. If a test fails, inspect
its first error/artifact, make a relevant correction, and rerun only the affected check.
Browser and Blender checks are opt-in; ordinary labels/helper edits do not need them.
Browser defaults select integration only. Compile, visual, performance and historical
cases require explicit selectors. Inspect matrix `--list` before a build; use exact
`--case` / hairstyle `--style` selections. Installed-artifact validation is not a
current-source cache check. See the validation guide for costs and concrete commands.

| Change | Focused command (from repository root) |
| --- | --- |
| Movement helper | `npm run test:run -- src/runtime/movement.test.ts` |
| Rules/quests/etc. | `npm run test:run -- src/runtime/ruleEngine.test.ts` (substitute affected helper) |
| Project migration | `npm run test:run -- src/data/migrateProject.test.ts` |
| Editor label/component/store workflow | `npm run test:run -- src/test/editorSmoke.test.tsx` or the affected component test |
| Three renderer/loader/animation math | `npm run test:run -- src/runtime/three/threeVisualRenderer.test.ts` (substitute affected helper); then targeted browser only if needed |
| Creator request logic | `npm run test:run -- apps/asset-studio/src/proceduralMannequinCreator.test.ts` |
| Creator UI | `npm run test:run -- apps/asset-studio/src/App.test.tsx` |
| Recipe contract | `npm run test:run -- --project character-contract` |
| Shared GLTF preview package | `npm run test:run -- --project three-asset-preview` |
| Compiler/API/hair contract | `node --test tools/blender-character/procedural-mannequin-creator-api.test.mjs` or matching `*.test.mjs`; `npm run test:compiler` for all cheap Node checks |
| Geometry/hair fitting | Focused contract/Node checks first, then the affected matrix and targeted visual selection in the [guide](docs/PLAYWRIGHT_SMOKE.md) |

In Windows PowerShell use `npm.cmd`/`npx.cmd` for commands with forwarded flags:
the PowerShell shim can drop flags such as `--list` and accidentally launch a suite.
Check the echoed command before letting a heavy browser/compiler selection run.

## Test ownership

- Root `vitest.config.ts` assigns `src/**/*.test.{ts,tsx}` to disjoint `root-node`
  and `root-dom` projects. Its explicit `domTests` list owns mounted React and
  browser-global tests. Pure helpers default to Node, including helper-only TSX tests.
- Each workspace's `vitest.config.ts` owns only its `src/` tests. Root Vitest
  loads those configs; it never rediscovers workspace tests under root DOM settings.
- Studio defaults to Node. Its mounted `App.test.tsx` uses
  `@vitest-environment jsdom` and imports `testSetup`; do the same for new Studio
  DOM tests. Root DOM setup retains React cleanup and localStorage clearing.
- Keep file isolation and single-worker execution. Tests must restore registry/cache,
  mocks/timers and store mutations; do not trade cleanup for benchmark numbers.
- `npm run test` watches all owners; `npm run test:run` runs them once.
  `npm run test:root` selects only the root app. Workspace scripts remain usable
  for focused work; they overlap the final gate and are not extra CI steps.
