# Game Engine Architecture & Agent-Efficiency Audit

Date: 4 October 2026  
Scope: this checkout of Adventure Game Builder, HEAD cce24c3, including the pre-existing working changes. Investigation and planning only.

## 1. Executive Summary

- **This is a browser-based adventure-game builder, not an iOS engine checkout.** No tracked Swift, Xcode project, Capacitor/Cordova wrapper, simulator harness, or separate shipped-game applications were found. Conclusions about mobile deployment or duplication between four existing games cannot be established here.
- **Preserve the overall design.** One authored GameProject, isolated RuntimeSession state, shared gameplay helpers, two rendering adapters, and a separate offline asset compiler are sensible boundaries.
- **P0: repair draft recovery before relying on autosave.** Startup prefers any manual save over a newer draft; subsequent autosave can overwrite the recovery copy with the older project.
- **P1: close specific Three runtime gaps before treating it as equivalent to Phaser.** Dialogue requests only produce status text; movement timing and attack input gating differ.
- **P1: reduce the context cost of a few large modules.** MapEditor is 5,020 lines; its component occupies 4,755. ThreeDPreview, both runtime adapters, Asset Studio App, and migration are each around 2,000 lines.
- **P1: cover the workspace in CI.** The current workflow typechecks/builds the root application, discovers workspace Vitest tests under root settings, and omits Node compiler tests and Asset Studio's own typecheck/build.
- **P1: optimize deterministic validation before removing useful visual checks.** The root Vitest run took 247.34 seconds: 139.27 seconds in environment setup and 45.65 seconds executing tests. Pure tests currently inherit jsdom and React cleanup.
- **P1 for 3D work: restore a trustworthy performance smoke.** Existing local artifacts and two milestone documents record its walk-state failure. Do not keep accepting repeated failures as ordinary validation noise.
- **Reduce repeated compilation and screenshot collection.** The checked-in Asset Studio browser workflows perform ten real compile requests, each using two Blender passes, plus 97 explicit screenshots. Existing uncommitted Long/Buns work adds two compile requests and 24 screenshots.
- **P2, or P1 before distribution: separate shipped assets from authoring sources.** The root build is 269.22 MiB; 181.05 MiB is assets/source. Asset Studio also copies that source tree. This is output size, not an assertion that all files download on page load.
- **There is real historical scaffolding, but no evidence supporting a mass deletion.** The generic compiler-contract package is not the active creator endpoint contract; historical retarget reports are still dependencies of the live preview.
- **Documentation already helps, but repeats and overstates behavior.** Correct stale parity claims and nonexistent file pointers, then shorten the agent entry point.
- **All executed suites passed:** root CI, 571 tests in 71 files; Asset Studio/contracts, 39 tests plus types/build; Node compiler/asset checks, 32 tests.
- **Only this report was added.** No production code, configuration, dependencies, recipes, or existing changes were edited. Build/test outputs are ignored artifacts.

### Evidence and limitations

**Observed** means directly inspected code/configuration, measured output, or an executed probe. **Strong inference** means a likely consequence of that evidence that was not reproduced end-to-end. **Uncertain** means a candidate requiring more evidence.

The audit examined all tracked file names, package/build/test configuration, module sizes and static relative-import relationships, architecture guides, all five browser spec files, key gameplay/store/migration paths, asset/compiler boundaries, and selected existing artifact summaries. It did not read every asset or generated diagnostic file. No browser or Blender rebuild was launched: no visual code changed, and existing deterministic checks and artifacts were sufficient for this investigation.

The initial checkout had nine modified files and two untracked recipes relating to Long/Buns fitting. Their contents were preserved. Their presence does not prove that the new styles are complete or visually accepted. Findings that use them are identified below.

## 2. Architecture Map

### Actual structure and data flow

    Root React editor
      src/App.tsx -> editor/sections -> store/useProjectStore.ts
        -> authored GameProject (types/game.ts)
        -> localStorage manual save + separate draft / JSON import-export
        -> migrateProject + validateProject

    Play
      App clones project -> RuntimePanel selects adapter
        -> AdventureScene (Phaser reference)
        -> ThreeRuntimePanel (experimental)
             both -> createRuntimeSession (another defensive clone)
                  -> movement, interactions, rules, progression,
                     quests, inventory, shops, NPCs, combat, vehicles
             adapters -> input, rendering, presentation, UI callbacks

    Asset Studio (separate Vite/React application)
      CharacterRecipeV1 -> creator-specific compile request
        -> development-only Node middleware
        -> procedural recipe -> two isolated Blender builds
        -> exported GLB round-trip validation
        -> preview / recent results / optional promotion to built-in registry

    Shared Three presentation
      registry ids -> cached source GLTF -> per-instance clone
        -> renderer / animation controller
        -> root editor, Three runtime, Asset Studio preview

### Responsibilities and boundaries

| Area | Responsibility and current boundary |
| --- | --- |
| src/types/game.ts | 669-line authored schema; entities, rules, camera/presentation defaults. A cohesive schema is useful; file length alone is not a reason to split it. |
| src/data | Starter/demo content, presets, migration, validation, terrain helpers. Demo content is mostly here, but migration still uses it as fallback data. |
| src/store/useProjectStore.ts | Zustand project mutation and editor selection. Generic updateProject clones and migrates; many specific mutators update directly. The documentation's statement that *all* store updates migrate is inaccurate. |
| src/editor/sections | Shared Map Workspace, inspectors and other authoring tabs. 2D and 3D views operate on the same project/store; this is not a second map schema. |
| src/runtime | Renderer-independent gameplay functions plus the Phaser adapter and runtime UI. Small domain helpers already make much gameplay directly testable. |
| src/runtime/three | Three renderer lifecycle, terrain/water, cameras, smoothing, asset/animation presentation, diagnostics, experimental adapter. |
| packages/character-contract | Serializable recipe/component definitions, limits, validation and migration. Used by the creator. |
| packages/three-asset-preview | Shared GLTF loading, analysis, source caching and skeleton cloning. Root loader/analysis wrappers preserve existing import paths and connect diagnostics. |
| packages/asset-compiler-contract | Generic V1 compile request/result/package contract. Present and tested, but not the request contract used by the real creator middleware. |
| apps/asset-studio/dev and tools/blender-character | Local compiler endpoint, Node orchestration/validation, Python geometry/retargeting. Blender stays outside game state and browser bundles. |
| public/assets | Built-in/demo presentation assets, compiler source/provenance files, compiled fixtures and some diagnostic/history artifacts. Currently all copied to both builds. |
| e2e and apps/asset-studio/e2e | Opt-in Chromium mounting/performance, asset integration and visual/compiler workflows. No automated image-baseline comparison was found. |

### How a new game is created today

1. Choose Blank Project or Demo Project in the editor.
2. Author areas, reusable definitions, instances, rules, dialogue, quests and defaults.
3. Press Play to use the common runtime; Phaser is the default.
4. Save one manual project plus one draft in this browser origin, or export/import JSON.

See src/data/projectPresets.ts and src/App.tsx. New content reuses the engine through data; copying a runtime or creating a new application is not the normal workflow. No collection of independent game projects was present to audit for cross-game copies. A new mechanic should first be expressed through existing data/rules; genuinely new semantics belong in shared helpers, with schema/editor/migration changes only where needed.

**Export JSON is not a standalone playable build.** npm run build builds the builder application. Standalone game export remains on ROADMAP.md. Native/mobile delivery is a separate product decision, not a refactor prerequisite.

### Loops, animation, audio and physics

- Phaser uses AdventureScene.update, grid transactions and visual tweens. Three uses keyboard events, a 500 ms NPC interval, RAF rendering and interpolation.
- Three skeletal animation uses shared loaded clips and per-instance controllers; procedural compilation and retargeting are offline.
- Movement/collision are grid rules, not a general physics simulation. Terrain height and water presentation do not supply physical movement rules.
- No dedicated authored audio system or native audio integration was found. Do not infer one from Phaser's dependency.
- Browser persistence stores authoring data. RuntimeSession is transient; a general persistent play-save system was not found.

### Dependency and structural observations

The static relative value-import scan found no cycles among tracked TS/TSX/MJS modules. This is not a proof about dynamic imports, package export graphs or runtime callbacks. Core gameplay files inspected do not import React, Phaser, Three or editor store state.

React, Zustand, Phaser and Three have distinct, active roles. Their coexistence is not redundant dependency use. Small repeated clamp/tile-key functions are not worth a generic utility framework. The more consequential duplication is adapter orchestration and repeated quest-sync notification wrappers in runtimeCombat, runtimeProgression, runtimeObjectInteractions and runtimeRuleActionDispatcher.

## 3. Top 10 Problems

### 1. Draft recovery can select and then overwrite older data — P0

**Severity:** High reliability risk. **Evidence:** src/App.tsx, startup effect around lines 108–133, checks STORAGE_KEY first and only checks AUTOSAVE_DRAFT_STORAGE_KEY in the else branch. The autosave effect around lines 148–166 later writes the current project to the draft key. The stored payloads have no ordering metadata. Existing editor smoke tests separately cover saving and draft-only recovery, not both keys together.

**Observed:** manual save always wins when both keys exist. **Strong inference:** save A, edit/autosave B, restart: A loads and can replace B's draft after the debounce. No claim is made that a user's actual data was lost during this audit.

**Impact:** authors can lose the very recovery copy they expected autosave to preserve. This hurts current work, independent of game count.

**Recommended change:** define draft recovery precedence; preserve the draft until the author chooses or recovery completes. Store enough timestamp/project identity information to distinguish versions, while reading legacy raw-project saves. Handle storage write failures visibly.

**Benefit:** reliable recovery with a small change surface. **Risk:** medium, because startup/save semantics and backward compatibility must be tested. **Acceptance:** tests for save A + newer draft B, corrupt manual save + valid draft, unrelated draft/project, quota failure, and legacy storage.

### 2. Shared helpers do not yet guarantee adapter parity — P1

**Severity:** High for Three-authored games. **Evidence:**

- ThreeRuntimePanel.tsx:804 and :1070 handle rule/direct dialogue requests with setStatus only. AdventureScene.ts:1338 uses dialogueEngine, displays nodes and advances choices/actions.
- ThreeRuntimePanel.handleMove and its keydown effect accept movement without the Phaser isMoving/nextMoveAt checks at AdventureScene.ts:369–381 and :1905–1936.
- An in-memory probe called attemptPlayerMove twice immediately; both moved a tile and each returned a 216 ms duration. The helper provides duration, but does not enforce elapsed time.
- Three's Space branch around :1300 calls attemptRuntimeCombatAttack without the pendingCutscene/gameOver guard used for movement. The combat helper checks attack cooldown, not overlay/end state. Phaser stops these inputs in update.
- Both startup adapters call markRuntimeAreaEntered before on_game_start/progression. That helper immediately syncs quests. This contradicts the documented “actual startup area, then first quest sync” order; test a project whose editor-active area differs from progression spawn.

**Impact:** dialogue-based progression is absent in Three; movement cadence can depend on keyboard repeat; attacks can enter gameplay while a presentation overlay/end state should block them. The startup order is a cross-adapter semantic risk. These are not mere camera/UI polish.

**Recommended change:** first add a few behavior-based adapter tests using controlled clocks and presentation callbacks. Repair dialogue presentation using the existing dialogue engine; establish explicit shared timing/input eligibility and startup ordering where they are gameplay semantics. Keep renderer animation in adapters.

**Benefit:** predictable reuse across games and fewer manual parity runs. **Risk:** medium. Do not replace the runtime with a general event bus or controller framework. Keep Three experimental until the named gaps pass.

### 3. Large components concentrate unrelated editing responsibilities — P1

**Severity:** High productivity cost, not evidence that every large file is defective.

| File | Lines | Concrete concentration |
| --- | ---: | --- |
| src/editor/sections/MapEditor.tsx | 5,020 | Workspace state, full-project undo, painting, pixel editing, several entity inspectors, palette, layout and rendering. MapEditor spans 4,755 lines. |
| src/editor/sections/ThreeDPreview.tsx | 2,412 | Component spans 2,042 lines; one effect spans 1,420 lines covering scene/input/resource lifetime. |
| src/runtime/AdventureScene.ts | 2,215 | Input, map drawing, camera, cutscene/dialogue UI, direct interactions and shared event translation. |
| apps/asset-studio/src/App.tsx | 2,211 | 871-line HumanoidPreview plus 1,049-line App and helper/type declarations. |
| src/runtime/three/ThreeRuntimePanel.tsx | 2,205 | 1,806-line component combining session orchestration, presentation and HUD; 693-line renderer effect. |
| src/data/migrateProject.ts | 2,069 | Many reasonably scoped migrations in one large entry file. Lower urgency than the UI components. |

Line counts include trailing newline; JSX length is not a cyclomatic complexity score.

**Impact:** small changes require agents to discover distant closures and state lifetimes; test fixtures for these surfaces also become large. Full reads of MapEditor, both Three surfaces and Asset Studio App exceed 340 KB before their tests.

**Recommended change:** extract one concrete responsibility at a time: Map inspectors/palette, then map history; separate HumanoidPreview from creator UI; isolate a scene lifecycle from the Three overlay/session wiring. Preserve current props/store operations and tests. Split migration by domain only when touching that domain.

**Benefit:** very high context reduction; smaller review scope. **Risk:** medium/high for effect extraction. Extracting callbacks into many hooks with dozens of dependencies can make this worse. Prefer a few cohesive files over a hooks framework.

### 4. CI gives incomplete assurance about the active workspace — P1

**Severity:** High build reliability. **Evidence:** .github/workflows/ci.yml runs root typecheck/test/build on PRs to release/staging and main. Root tsconfig includes src only. Root Vitest discovers five workspace test files under its jsdom/setup settings; it does not execute those packages' configurations. Node compiler/retarget tests and browser specs are explicitly excluded.

**Impact:** a green PR can omit Asset Studio's own typecheck/build and compiler/API validations. Importing some workspace code from root is not equivalent to checking the complete workspace.

**Recommended change:** run Asset Studio/contracts checks and the cheap Node compiler tests in CI, triggered by the relevant app/package/tool/asset/config paths. Initially running these cheap checks unconditionally is safer than intricate path logic. Give each test file one intended owner/configuration.

**Benefit:** catch boundary failures without browsers or Blender rebuilds. **Risk:** low/medium; avoid duplicate root/workspace discovery when reorganizing. Keep browser and full compiler matrices opt-in. The audit's separate runs passed, so this is a coverage gap rather than an observed failing build.

### 5. Routine deterministic verification spends too much time on setup — P1

**Severity:** Medium/high recurring cost. **Evidence:** root vitest.config.ts applies jsdom, React Testing Library cleanup, fileParallelism:false and maxWorkers:1 to all discovered tests. Measured root run: 247.34 s total, 139.27 s environment, 27.86 s setup, 15.10 s import, 45.65 s tests. npm run ci also typechecks twice because build repeats tsc --noEmit.

**Impact:** agents wait minutes for pure movement/contract changes; aggregate test count disguises environment overhead. These numbers describe one local run, not a stable CI benchmark.

**Recommended change:** use a Node environment for pure helpers/contracts and jsdom only for DOM/component suites, with appropriate setup per group. Maintain isolation for stateful test registries/stores. Benchmark a small worker count only after separation. Keep standalone build type-safe while avoiding the redundant CI typecheck. Run targeted tests during iteration and the required full gate once at completion.

**Benefit:** high, supported by measured setup cost; exact savings need a before/after measurement. **Risk:** low/medium. Do not simply enable maximum parallelism or remove cleanup. Root CI remains required under current AGENTS.md until instructions are explicitly updated.

### 6. Build output includes the whole authoring/source asset tree — P2; P1 before distribution

**Severity:** Medium now, high for packaging. **Evidence:** 222 tracked public files total 266.60 MiB. The audit's root build contains 226 files / 269.22 MiB; Asset Studio build is 267.43 MiB. Each includes 181.05 MiB under assets/source. apps/asset-studio/vite.config.ts points publicDir at ../../public; root uses Vite's default public directory.

**Impact:** builds and distribution copy FBX sources, alternate vendor formats and historical diagnostics irrelevant to playing most games. Root's initial JS chunk is also 2,669.24 kB minified / 654.28 kB gzip, with both runtimes statically reachable.

**Recommended change:** define a runtime asset allowlist/package boundary when adding playable export, and keep compiler provenance/source storage separate from shipped assets. Preserve source files and licensing. Identify browser-loaded Golden sources before moving anything. Consider lazy-loading the inactive runtime/editor sections only if startup measurements justify it.

**Benefit:** large packaging reduction without changing assets or rendering libraries. **Risk:** medium due to URLs, provenance hashes and old saved asset ids. Do not globally delete “unused” source files or move registry URLs without compatibility mapping.

### 7. The performance smoke has a known failure and couples unrelated checks — P1 for 3D work

**Severity:** Medium/high validation reliability. **Evidence:** e2e/three-perf-smoke.spec.ts:577–579 presses ArrowUp once and waits for transient walk state. The current ignored test-results/perf/summary.json records a walk-state timeout with loaded assets and idle state. docs/assets/hair-colour-v1.md and hairstyle-library-v2.md record the same failure. This audit inspected those artifacts; it did not rerun the browser test.

The test combines editor mounting, settled assets, terrain, collapsed/expanded diagnostics, timing samples and animation states. About 24 seconds of explicit sampling/settling waits precede completion, excluding loading and polling. A walk failure prevents later attack/movement evidence.

**Impact:** repeated failing runs consume time and produce many secondary “missing snapshot” messages without resolving the cause.

**Recommended change:** isolate the input/animation regression from the sampling workflow. Verify the actual move result, a traversable benchmark destination and observable animation transition; do not assume whether the current failure is collision, input, rendering or a sampling race. Keep settled rendering/performance observations useful when another assertion fails, and report failure honestly.

**Benefit:** trustworthy, diagnosable browser evidence. **Risk:** low/medium. Do not solve it by deleting the assertion or adding arbitrary sleeps; do not add machine-independent FPS thresholds without a controlled baseline.

### 8. Browser workflows rebuild artifacts and repeat deterministic checks — P1 for Asset Studio workflow

**Severity:** High iteration cost in the current asset work. **Evidence:** apps/asset-studio/e2e/procedural-mannequin.spec.ts performs real compiler requests across random body, material, hair and library cases. compileProceduralMannequin runs two isolated Blender passes and exported validation per request. The generic Asset Studio browser command includes all these workflows; it is not a cheap preview smoke.

**Impact:** validation of JSON/hash/parameter/history behavior incurs Blender and WebGL costs despite existing creator unit tests, Node API tests and direct GLB validators. Repeated scripts revisit the same app and geometry at multiple levels.

**Recommended change:** keep one real browser-to-compiler-to-preview integration case. Cover other UI request/failure/history cases with mocked compiler responses and component tests; perform geometry/hash/topology assertions in Node validators. For visual review, reuse an exact validated artifact with matching recipe, compiler, source and validator identity. Keep full two-pass matrices when compiler/geometry/fitting changes, not for copy/layout-only changes.

**Benefit:** very high for non-geometry changes. **Risk:** medium if the end-to-end boundary is accidentally removed. Visual review remains necessary for anatomy, scalp exposure and appearance; bounds checks cannot replace it.

### 9. Historical/generic compiler paths obscure the actual production path — P2

**Severity:** Medium architectural discovery cost. **Evidence:** packages/asset-compiler-contract/src/index.ts defines a generic V1 request/result protocol and a not_implemented result. The actual creator uses proceduralMannequinCreator.ts and a separate V6 middleware request. Outside tests, the generic package's only located src/apps consumer is a type import in assetStudioContractIntegration.ts; that module itself is only used by its test.

Separately, HumanoidPreview in apps/asset-studio/src/App.tsx:697–705 fetches runtime-retarget-report.json even during default offline-baked/mannequin playback. A rejected failed-v1 comparison and runtime-v2 mode remain in the same component.

**Impact:** “compiler contract” does not tell an agent which boundary to change. Historical diagnostics are not actually independent of the current preview; deleting them can break the live path.

**Recommended change:** document the live request contract precisely, freeze the generic scaffolding until a real consumer needs it, and isolate historical comparison UI/data from default preview loading. Decide whether to retire or reuse the generic package when its consumer exists; do not force today's narrow pipeline through it just to justify it.

**Benefit:** medium/high context reduction and fewer accidental edits. **Risk:** medium; preserve current serialized recipes and diagnostic tooling. A minimal shared JSON constants file may eventually reduce TS/MJS version/limit repetition, but a schema-generation framework is not justified.

### 10. Demo data doubles as migration defaults — P2

**Severity:** Medium engine/game coupling. **Evidence:** migrateProject imports defaultProject for area/player/progression/game-state/cutscene fallbacks. A read-only probe removed gameState, progression and cutscenes from a blank project. Migration restored pirate-demo flags, gold:3, gate progression and eight demo cutscenes. migrateProject.test.ts explicitly expects some historical defaults.

**Impact:** new-game imports with omitted fields can receive unrelated demo semantics. Updating the demo can indirectly change legacy import behavior. Explicit empty collections are often preserved; this is not evidence that every valid blank game is contaminated.

**Recommended change:** freeze legacy defaults as compatibility data, distinguish neutral defaults for newly authored projects, and keep the demo as a preset. Add small fixture-based tests before changing fallback selection. Do not silently reinterpret old saved projects.

**Benefit:** medium safety and simpler new-game reasoning. **Risk:** medium/high compatibility risk; worth addressing incrementally, not as a migration rewrite.

## 4. Playwright & Visual Validation Audit

All current browser suites are opt-in. Root CI runs none. No simulator automation, Puppeteer, Appium, automated pixel-diff assertion, or independent screenshot script was found in the inspected tracked tooling. Screenshots are evidence files, not assertions that a human actually reviewed the image.

Costs below are structural bounds/counts from code, not freshly measured browser runtimes. Timeout is a ceiling, not an estimate. Existing uncommitted Long/Buns work is called out.

| Usage | Purpose / trigger | Necessary? | Cost | Better alternative | Recommendation |
| --- | --- | --- | --- | --- | --- |
| e2e/three-perf-smoke.spec.ts; test:e2e:three-perf | Editor/runtime WebGL, asset loading, diagnostics, animation and timing on 3D changes | NECESSARY for real browser timing; USEFUL for mounting; screenshots not needed for numerical assertions | One scenario; two Three surfaces; default Phaser briefly launches before mode switch; ~24 s explicit waits, 90 s timeout; 2 success screenshots | Helper/controller tests for state; short mount probe for asset integration | Repair known walk failure; keep performance sampling separate from animation correctness. Capture screenshots for appearance work/failure, not every numerical change. |
| e2e/golden-reference-humanoid.spec.ts | Player/NPC registry selection, clone and animation integration | USEFUL; detailed counts do not need a browser | One app navigation; editor then runtime; 2 screenshots; 90 s timeout | Existing loader/registry/GLB tests for 65 joints, geometry counts, skeleton cloning | Retain short integration; avoid duplicating every exact asset metric here. |
| e2e/procedural-mannequin.spec.ts | Haired mannequin through root editor and runtime | USEFUL | One navigation; editor/runtime; 2 screenshots; 120 s timeout | Existing proceduralMannequin and loader/animation tests | Parameterize genuinely shared setup with the Golden case; keep distinct asset coverage. |
| Asset Studio golden-reference-humanoid.spec.ts | Offline animation, sampled poses and rejected failed-v1 comparison | NECESSARY visual review for changed deformation; failed baseline repetition UNNECESSARY | Two navigations; 30 screenshots: 3 rejected + 3 rest + 24 animation samples; 240 s timeout | Node round-trip/pose tests for numeric invariants | Preserve historical comparison as explicit diagnostic mode. Routine run should inspect current output; full pose gallery only after relevant animation changes. |
| Asset Studio procedural test “previews and animates…” | Checked-in fixture, animation and source switching | USEFUL browser integration; repeated exact topology checks UNNECESSARY here | No compile; 9 screenshots; 180 s timeout | Direct GLB validation; one DOM check that metadata is displayed | Small preview smoke; visual gallery when fixture/renderer changes. |
| “…randomises, compiles…several body shapes” | Recipe randomization, compile request, preview replacement and recent restore | USEFUL real integration; 3-body browser rebuild UNNECESSARY for recipe logic | 3 compile requests = 6 Blender passes; 1 screenshot; 360 s timeout | Creator unit tests + API fake compiler tests + matrix validators | Keep one real compile, move seed/hash/history cases below browser level. |
| “…isolated skin color and roughness…” | Appearance-only geometry invariants and visual material review | NECESSARY visual check for appearance changes; numeric repetition UNNECESSARY | 3 compiles = 6 passes; 3 screenshots; 360 s timeout | Appearance matrix semantic hashes / materials in Node | Reuse validated matrix artifacts for material review; no real compile for UI-label edits. |
| “…bald and Quaternius hairstyle variants” | Hair/eye/color compilation, deformation and recent restore | NECESSARY visual fit review for changed geometry; USEFUL endpoint check | 2 compiles = 4 passes; 30 screenshots; 600 s timeout | Node fit/skin invariants; component history tests | Retain targeted views of changed fit and representative poses; batch review of the same artifacts. |
| “…Hairstyle Library V2” | Short Crop/Simple Parted fitting, colors and restore | NECESSARY visual acceptance of new styles | 2 compiles = 4 passes; 24 screenshots; 240 s timeout | Library matrix for body/style invariants | Keep when a style or fitting profile changes; unrelated features need not launch it. |
| “…length-aware Long and Buns” — uncommitted | Long/Buns silhouette and neck/shoulder fit | NECESSARY for this geometry work, not verified by this audit | 2 compiles = 4 passes; 24 screenshots; 360 s timeout | Node clearance/weight checks plus selected visual views | Assess as current work in progress; do not declare accepted from passing unit tests. |
| Playwright configuration artifacts | Root failure screenshots and retained failure traces | USEFUL | Only on failure, in addition to explicit captures | Console/network/state summaries for triage | Keep. Asset Studio config lacks the same failure-artifact defaults; reuse those if needed without adding routine screenshots. |
| Milestone manual visual review | Orientation, hair gaps, anatomical readability, animation feel | NECESSARY for those acceptance criteria | Human/agent review of selected images; potentially many captures | Deterministic gates eliminate invalid candidates first | One review batch per changed artifact set; record which views were reviewed and what passed. |

**Totals:** three root cases, six committed Asset Studio cases, plus one uncommitted case. The committed Studio workflows total 97 explicit images and ten real compile requests (20 Blender passes). Long/Buns adds 24 images and four passes. These counts exclude failure screenshots and the four root asset screenshots plus two root perf screenshots.

**Other expensive loops:** topology matrix has 21 bodies; the documented hairstyle library matrix has six bodies × four styles = 24 artifacts / 48 Blender passes; appearance and bald/haired matrices add further combinations. An older topology summary records roughly 7-second generation durations per case, but current fitting/compiler times were not measured. Do not extrapolate that historical timing to today's entire suite.

**Repeated execution evidence:** multiple local perf directories and two milestone accounts show the same failure was encountered repeatedly. This supports repairing the failure, not an estimate of how many tokens agents wasted. There is no complete agent execution history here.

**Batching policy:** finish static/targeted/round-trip checks first; generate one identified artifact set; then run one relevant browser selection and review a small gallery together. Each existing scenario already batches several poses in one page. Do not combine all scenarios into a giant order-dependent test merely to reduce navigation.

## 5. Agent Efficiency Findings

| Context cost | Evidence | Likely impact | Practical reduction |
| --- | --- | --- | --- |
| Loading oversized UI files | File/function measurements in finding 3 | Very high | Cohesive responsibility extraction, task-to-symbol map; read bounded sections first. |
| Repeated architecture prose | AGENTS 24.6 KB, README 12.8 KB, Asset Studio architecture 19.1 KB, plus runtime/status/parity guides | High | One short agent routing guide; link authoritative architecture sections. Preserve Asset Studio Quick Resume. |
| Generated diagnostic reads | idle.bake-diagnostics.json alone is 1.65 MB | High | Query selected manifest/report fields; keep diagnostics out of ordinary source searches. |
| Unclear “which compiler?” | Generic V1 package versus live creator V6 request and Python/Node schema | High for asset work | One live path diagram and exact file/command mapping. |
| Ambiguous test commands | Root tests discover workspaces but skip their configs; separate checks repeat some tests | High | Validation matrix by subsystem and explicit command ownership. |
| Stale navigation/status | AGENTS points to missing src/runtime/PhaserGame.tsx; actual setup is RuntimePanel. Status docs call dialogue UI functional | Medium/high | Correct those facts before shrinking docs. |
| Broad state snapshots | App serializes project for dirty tracking; Map history clones whole project; updateProject migrates entire project | Medium potential scaling cost | Profile changed-project work before changing state architecture. Avoid reimplementing store or immutable state machinery speculatively. |
| Undeclared direct workspace imports | Root assetStudioContractIntegration imports two contracts not declared as root dependencies | Low now | If retained as a real consumer, declare the dependency; otherwise retire the unused sentinel coherently. |

The repo already has a useful task file map and unusually strong instructions against unnecessary browser tests and generated-file reading. The problem is enforcement, stale facts and concentrated implementation, not a complete absence of guidance.

The static scan found no orphaned production module solely from lack of incoming relative imports once HTML, configuration and CLI entry points were accounted for. Do not apply an “unreferenced file” deletion rule blindly.

### Dependency/tooling judgment

- Keep React/Zustand, Phaser and Three. No concrete benefit supports replacing them.
- Keep Vitest/Testing Library and Node's test runner; they cover different environments. Correct their ownership/configuration rather than standardizing everything for appearance.
- Vite/plugin-react are under root dependencies rather than devDependencies. Low priority in this private workspace; classify them correctly during packaging work, not as a performance fix.
- React runtime is 18 while @types/react and @types/react-dom are 19. Existing typechecks pass; align versions deliberately to reduce future API mismatch risk, not an urgent upgrade project.
- The compiler-contract package is a **probably unused live-runtime dependency**, not proof all its metadata/contracts are worthless. See finding 9 and cleanup table.
- Biome/husky/lint-staged have active configuration. The pre-commit hook invokes a mutating Biome check, so it is not a read-only audit command. CI does not run the same lint step. A read-only lint gate is optional after assessing current violations; do not trigger a repository-wide formatting rewrite.
- Node 22.12.0/npm 10.9.0 were used locally. CI requests Node 20; installed jsdom declares a minimum of 20.19 on that branch. A documented supported runtime is enough; no fashionable toolchain replacement is needed.

## 6. Testing Recommendations

### Validation hierarchy for this repository

1. **Classify the change.** Identify authored data, gameplay, editor UI, Three presentation, creator API or compiler geometry. Read only its routing docs.
2. **Static checks.** Diff review and targeted typecheck; respect package boundaries. Do not run mutating formatting commands during investigation.
3. **Focused deterministic tests.** Existing movement/rules/inventory/quest/NPC/combat/vehicle helpers, migration, creator/contract tests. Use Node for pure logic where configured.
4. **State/component/boundary tests.** Adapter input -> session outcome, store mutation -> expected project, compile request/response failure preservation, loader/cloning/animation state.
5. **Build/integration gate.** One final npm run ci under current instructions; add affected workspace checks and cheap Node compiler tests. Avoid rerunning the same unchanged suite after it passes.
6. **Targeted browser integration.** Only for mounted WebGL, real loader/HTTP behavior, pointer/keyboard focus, browser resource lifecycle or one real compile-to-preview flow.
7. **Visual/performance/compiler matrices.** Only for a changed acceptance criterion: appearance/deformation, timing/rendering, or geometry/compiler invariants. Run the smallest relevant browser case after deterministic validation, and full matrices only when the affected compiler behavior warrants them.

### Small high-value additions

| Priority | Test | What it protects / why screenshots cannot substitute |
| --- | --- | --- |
| P0 | Saved + draft startup/recovery scenarios and write failure | Prevents authoring loss; component/localStorage assertions suffice. |
| P1 | Three dialogue request -> visible node -> choice action -> resumed play | Detects the current status-only implementation; use existing dialogue helpers, mocked renderer. |
| P1 | Repeated input at controlled times; cutscene/end-state Space input | Establishes timing/eligibility parity; assert session position/health and emitted requests. |
| P1 | Startup editor-active area differs from actual spawn, with area objective/reward | Proves on_game_start/progression/first quest sync order and once-only reward semantics. |
| P1 | A compact shared scenario exercised through both adapter boundaries | Startup, pickup/rule, area transition, quest reward; compare selected session fields, not screenshots or whole serialized snapshots. |
| P2 | Same old JSON fixtures migrated twice; explicit empty collections preserved | Protects migration idempotence and frozen compatibility defaults. |
| P2 | Scene mount/unmount and two cloned characters' resource/animation independence | Extend existing loader/renderer tests only for uncovered lifetime behavior; a small browser mount remains useful. |

There is already broad focused coverage: 66 root test files, five workspace test files, eight Node test files and five browser spec files. There is no reason to pursue arbitrary coverage percentages or reproduce all existing helper tests in Playwright.

Adapter coverage is uneven: ThreeRuntimePanel.test.tsx spies through real helper implementations, but also asserts source substrings. RuntimePanel.test.tsx primarily tests HUD helpers. There is no dedicated AdventureScene test file; Phaser is mocked in the mode-switch tests. This leaves event ordering/input policy less protected than pure combat or movement math.

Replace source-string assertions *when touching the related behavior* with observable outcomes; keep simple architecture import guards if useful. Do not undertake a wholesale test rewrite.

### Executed validation

| Check | Result |
| --- | --- |
| npm run ci | Passed: root typecheck, 71 Vitest files / 571 tests, production build. Vitest 247.34 s; Vite build 19.09 s. |
| npm run check:asset-studio | Passed: character contract 15 tests, compiler contract 4, Studio 20, typechecks and build. Studio Vitest 12.46 s; Vite build 5.68 s. |
| npm run test:blender-bake | Passed: 32 tests; Node reports 1.73 s. Includes direct validation of checked-in GLBs; does not rebuild matrices. |
| Read-only movement/migration probes | Confirmed immediate repeated movement acceptance and demo fallback injection for omitted fields. |
| Browser/Blender regeneration | Not run; existing summary artifacts inspected, not presented as a fresh pass. |
| git diff --check | Passed (exit 0); only pre-existing LF/CRLF notices. |

Builds warn about large JS chunks. No runtime performance regression is inferred solely from that warning. No dependencies were installed.

## 7. Dead Code / Cleanup Candidates

“Dead” refers to the inspected checkout's call graph, not permission to delete old user data or externally referenced assets.

| Candidate | Confidence | Evidence and action |
| --- | --- | --- |
| RuntimeCombatEvent.triggerRequested / on_npc_defeated branch | **High confidence dead declaration** | Only declaration and a test asserting it is not emitted were found. RuleTrigger does not expose that event. Retire the stale declaration/docs if no planned consumer; do not invent a new defeat-rule feature to justify it. |
| src/runtime/assetStudioContractIntegration.ts | **High confidence unused in application execution** | Its predicate is imported only by its own test; its metadata type has no located consumer. Likely a boundary sentinel. Remove or turn it into an actual integration assertion only after its intended role is agreed. |
| Generic asset-compiler-contract runtime validators/not_implemented result | **Probably unused in live flow** | No creator/middleware consumer found; real endpoint has its own request shape. Freeze/label, then decide whether to retire when compatibility requirements are known. |
| Three pirate Run_03, Running and Triple_Combo_Attack GLBs | **Probably unused by current built-in registry** | No source/doc literal basename reference found. About 18.4 MiB combined. Verify dynamic/public URLs and authored project references; exclude from a game package before considering deletion. |
| Many unregistered pirate props / alternate vendor FBX formats | **Uncertain** | Lack of literal references is insufficient: they may be a deliberate library/source archive. Keep provenance; exclude unneeded files from shipped builds. |
| failed-v1 and runtime-v2 retarget comparison paths | **Historical but live, not dead** | Query modes and browser comparison test reference them; default preview even fetches the report. Isolate before retirement. |
| threeVisualAssetLoader/Analysis re-export wrappers | **Live compatibility adapters** | Preserve root import paths and diagnostics bridge. Removing them saves little and causes broad churn. |
| Legacy direct interactions, migration fallback shapes | **Live compatibility behavior** | Used alongside rules and covered by saved-data expectations. Do not delete as “old architecture.” |
| src/test/threeDPreview.test.tsx vs sections/ThreeDPreview.test.tsx | **Not established duplicate** | Large mocked interaction integration versus smaller checks; similar names do not prove redundant coverage. Clarify ownership before consolidation. |

No high-confidence unused third-party runtime library was identified. Dependency replacement or a bulk asset purge is not recommended.

## 8. Documentation Recommendations

Use existing documents; add **one** short new guide.

| File | Minimum useful change |
| --- | --- |
| AGENTS.md | Retain invariants, task-to-file map and validation routing in a short entry point. Remove repeated system descriptions; fix PhaserGame.tsx pointer. Explicitly distinguish tests, real compiles, matrices and visual acceptance. |
| README.md | Keep product identity, start/build commands, supported local runtime and links. State browser-only status and JSON export versus playable export. Move historical milestone narrative behind Asset Studio resume links. |
| docs/RUNTIME_ARCHITECTURE.md | Own state boundaries, actual startup ordering and adapter event ownership. Link one small parity acceptance table. |
| docs/THREE_RUNTIME_STATUS.md and docs/THREE_RUNTIME_PARITY_FINDINGS.md | Correct dialogue/timing/input gaps; give one file ownership of the current checklist and link it from the other. Avoid two drifting status inventories. |
| docs/PLAYWRIGHT_SMOKE.md | Expand into the validation decision table for root and Studio; specify when screenshots, real compilation and matrices are warranted. Explain the known failing smoke until fixed. Include command cheat-sheet and failure triage here. |
| docs/ASSET_STUDIO_ARCHITECTURE.md, Quick Resume | Keep its effective file/version map. Distinguish generic contract scaffolding from the live endpoint, historical comparison from default playback, and historical evidence from current validation. Update only after in-progress styles are accepted. |
| **docs/ADDING_A_GAME.md — new** | Blank/demo -> authored content -> JSON export/import -> Play; where new mechanics belong; minimal compatibility checks; asset id workflow; single save/draft limitation; deployment/export limitations. A short worked example, not another architecture treatise. |

Do not add separate repo-map, conventions, testing, debugging and command documents when the existing guides can own those facts. Examples of current drift: AGENTS excludes branching dialogue despite DialogueEditor/dialogueEngine; status docs call Three dialogue UI functional; the 3D tab description still says read-only; roadmap lists already implemented basic combat/economy without separating enhancements.

## 9. LEAVE THIS ALONE

- **GameProject versus RuntimeSession.** Defensive cloning and runtime-owned flags/inventory/quests/stock/health are appropriate and tested.
- **Shared semantic helpers.** Movement, collision, inventory, quests, rule evaluation, NPC resolution, vehicles and combat already have useful pure interfaces.
- **Definition + instance overrides.** Objects/NPCs support reuse without a plugin framework or parallel enemy entity model.
- **One Map Workspace with multiple views.** Keep shared authored data and existing store mutations; do not create a separate 3D editor schema.
- **Grid authority with presentation-only interpolation, height and water.** Do not slip physical gameplay changes into render helpers.
- **Registry -> cache -> skeleton clone -> marker renderer.** Preserve fallback behavior and resource ownership. Re-export adapters are not automatically over-engineering.
- **Recipe source separate from compiled GLB.** Immutable vendor provenance, exported round trips and two-pass determinism are valuable when compiling/promoting assets.
- **Separate Asset Studio app and lightweight npm workspaces.** No Nx/Turborepo, services or larger packaging framework is warranted.
- **Existing focused tests and opt-in browser policy.** Improve their targeting; do not replace them with screenshots.
- **Backward migration compatibility.** Freeze/document necessary legacy behavior; do not silently remove it.
- **Simple JSON authoring export and Zustand state.** Extend recovery as needed; a database or new state-management framework is not currently justified.

## 10. Refactor Roadmap

These are implementation proposals for later phases, not changes made by the audit. P0 = act now; P1 = before substantial work in the affected subsystem; P2 = useful, nonurgent; P3 = optional.

| Phase | Concrete deliverable and acceptance | Benefit | Risk / dependencies | Before more games? |
| --- | --- | --- | --- | --- |
| **0 — Recovery and factual corrections (P0/P1)** | Add saved/draft recovery tests and fix precedence/preservation; correct Three dialogue status, missing file pointers and active compiler path. Report the perf failure explicitly. | Very high reliability; immediate discovery improvement | Medium for persistence; none for factual docs. Preserve legacy storage. | **Yes** for authoring recovery. |
| **1 — Deterministic validation workflow (P1)** | Assign tests to Node/jsdom/workspace owners; extend CI with Studio and cheap compiler checks; remove redundant CI typecheck; document exact command selection. Compare duration and unchanged discovered test count. | High recurring time savings | Low/medium; phase 0 factual mapping. Avoid parallelism changes until isolation is checked. | **Yes** before substantial development; not a reason to stop small content work. |
| **2 — Adapter correctness and trusted smoke (P1)** | Tests for dialogue, timing, paused/end-state attacks and startup order; fix these narrowly. Diagnose existing walk smoke with movement evidence; retain useful perf samples and honest failure reporting. | High correctness and cheaper parity confidence | Medium; use existing shared helpers, clocks and renderer mocks. | **Yes for Three games**; Phaser-only content can continue after recovery fix. |
| **3 — Targeted visual/compile workflow (P1/P2)** | Keep one real compile-browser integration; move repeated numeric checks down; reuse exact validated artifacts for relevant visual review; make historical gallery explicit. Document expected capture/compile counts. | Very high for asset iteration | Medium; preserve fitting review and compiler determinism. Depends on stable artifact identity. | Before large asset-library expansion; no blocker for ordinary map content. |
| **4 — Cohesive extractions (P1/P2)** | Extract one Map inspector/palette/history responsibility, separate Studio preview, then Three scene lifetime if warranted. Existing behavior tests pass after each small change. | High context/review reduction | Medium/high closure/resource-lifetime risk; behavior tests first. No all-at-once module breakup. | Do the next touched hotspot; do not postpone all games for this. |
| **5 — Defaults and distribution boundary (P2; P1 before shipping)** | Freeze legacy migration defaults, neutral new-game defaults, short adding-game guide; define standalone player/export requirements; ship only referenced runtime assets while preserving URLs/compatibility. | Medium for authoring, high for deployment | Medium/high; old JSON fixtures and real deployment target required. | Defaults incrementally; export packaging before distributing games. |
| **6 — Optional measured cleanup (P3)** | Retire confirmed unused declarations/scaffolding, isolate historical retarget diagnostics, align direct dependency/type declarations; evaluate lazy-loading after measuring startup. | Low/medium | Low when isolated; dependency/asset consumers must be verified. | No. |

### Final complexity challenge

The recommendations were reviewed against “Would this make the codebase more complicated?”

**DO NOT DO:**

- Rewrite the engine or migrate to native/C++ to solve agent context costs.
- Introduce an ECS, event bus, dependency-injection framework, plugin framework, microservices or another state store.
- Package every helper as a workspace or replace a large component with dozens of tightly coupled hooks.
- Make all games separate code applications when GameProject data already expresses them.
- Force the real compiler into the generic contract merely because that package exists.
- Delete compatibility paths, source provenance or public assets solely because a static reference search misses them.
- Run the full browser suite, all Blender matrices or historical screenshot comparisons on every change.
- Replace all visual acceptance with geometry bounds, or keep generating screenshots without inspecting the changed criterion.
- Set arbitrary coverage percentages, snapshot whole projects everywhere or add unreliable global FPS gates.
- Optimize whole-project cloning, terrain rendering or animation storage without evidence of an actual bottleneck.

The highest-return sequence is recovery safety, accurate documentation and validation ownership, then adapter correctness and narrow extractions. The existing architecture is a useful foundation.
