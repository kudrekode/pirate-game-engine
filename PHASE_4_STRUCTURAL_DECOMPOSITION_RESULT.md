# Phase 4 — Structural Decomposition for Feature Development

## 1. Executive Summary

The useful boundaries were the Map Workspace's inspector/history responsibilities
and Asset Studio's independent humanoid preview. Those were extracted incrementally,
with focused validation between checkpoints. No gameplay, authored schema, saved-data
semantics, compiler generation, asset appearance or creator workflow was intentionally
changed. No new framework, dependency, global state system or scene controller was added.

MapEditor now delegates inspector editing, NPC overrides, selection projection and
undo/redo while retaining workspace gestures, palette state, layout and rendering.
It went from 5,019 to 2,922 lines. Asset Studio App went from 2,218 to 1,172 lines;
its preview now owns its complete resource lifetime in a separate module with the
same two inputs. These counts describe source locality, not token or runtime savings.

The two root Three surfaces were assessed but not split. Their shared mutable refs,
input state and cleanup make a mechanical effect extraction a poor interface today.
AdventureScene and migration also remain intentionally centralized. Further splitting
was stopped where plumbing would outweigh the benefit.

## 2. Hotspot Classification

Classification was completed and recorded before the first production extraction.
Physical line counts exclude a trailing empty line; they are not complexity scores.

| File | Before | Classification | Reason | Action |
| --- | ---: | --- | --- | --- |
| `src/editor/sections/MapEditor.tsx` | 5,019 | HIGH VALUE TO SPLIT | Frequent editor work mixes pointer gestures, rendering, inspector fields, links/NPC overrides, history, palettes and pixel tools. Inspector editing has no renderer lifetime; history already has explicit snapshot boundaries. High context benefit; moderate selection/store risk. | Extract inspector, NPC controls, selection projection and history. Keep gesture/palette/layout orchestration together. |
| `apps/asset-studio/src/App.tsx` | 2,218 | HIGH VALUE TO SPLIT | Frequent creator work shares a file with independent WebGL loading, animation, camera and disposal. Preview already has a two-input contract. High context benefit; resource risk controlled by moving the complete component unchanged. | Extract HumanoidPreview and preview source descriptors. Keep draft/compile/history transaction in App. |
| `src/editor/sections/ThreeDPreview.tsx` | 2,411 | POSSIBLY WORTH SPLITTING | Frequent 3D authoring work; one effect shares pick meshes, terrain strokes, drag/placement ghosts, camera, store callbacks, rebuild triggers and cleanup. A standalone renderer would expose many gesture refs/dependencies. | Leave effect intact; document ownership and existing terrain/input/presentation helpers. |
| `src/runtime/three/ThreeRuntimePanel.tsx` | 2,387 | POSSIBLY WORTH SPLITTING | Session/event/dialogue bridge and rendering share camera, player/NPC smoothing, animation-controller and modal refs. Future runtime UI work is likely, but changing these lifetimes is high risk. | Leave intact; avoid moving Phase 2 orchestration or inventing a mutable controller interface. |
| `src/runtime/AdventureScene.ts` | 2,219 | LEAVE ALONE | Size largely reflects a legitimate Phaser adapter: scene resources, input, world/UI cameras, tweens and shared-runtime event callbacks. Most methods need the same scene/session lifetime. | Keep one scene adapter; passing the scene through helper wrappers would fragment ownership. |
| `src/data/migrateProject.ts` | 2,068 | LEAVE ALONE | Individually named domain migrations plus a clear ordered entry point. Changes are schema-specific; no proven navigation problem requires disturbing compatibility-sensitive fallbacks. | No changes. |

For the Three candidates, scene creation/disposal, loading, camera/input, entity
presentation and UI/session ownership were examined. Pure camera/terrain/loader/
visual helpers already exist. Extracting the remaining effect alone would primarily
move a closure and add a wide interface, rather than reduce the state a developer
must understand. HUD-only extraction has less benefit than the completed work.

## 3. Extractions Performed

### Checkpoint 1: map inspector ownership

Moved field editors, direct interactions and rule warnings, area-link editing,
object behaviour/state, pickup/structure/event controls and deletion transactions
from MapEditor into `src/editor/sections/MapInspector.tsx`. It takes six explicit
inputs: project, active area, resolved selection, selected terrain/overlay ids and
the history recording callback. Existing store mutations remain the write boundary.
Ordinary field edits retain their prior history behaviour; deletion still records
before/after snapshots and selects the area.

`mapEditorSelection.ts` contains the existing selection projection, reused for
canvas/status and inspector inputs. It receives the existing terrain/overlay lookups
so duplicate-tile and fallback semantics remain unchanged. It introduces no state,
subscription, effect or alternate map schema.

Validation: baseline 66 existing tests passed; after extraction all 45 editor smoke
tests and root typechecking passed. This includes selection, dragging, deletion,
painting, undo, NPC fields, interaction warnings and sidebar behaviour.

### Checkpoint 2: placed NPC controls

Moved NPC attributes, movement, patrol/wander, enemy settings and definition-override
reset logic from the extracted inspector into `MapNpcInspector.tsx`. Five inputs
provide the project, selected instance, update/delete callbacks and interaction UI.
NPC resolution continues through `npcResolver`; store writes and interaction
selection remain with the inspector. No local state or resource lifetime was added.

Validation: seven focused NPC/interaction editor tests and root typechecking passed.
The parent inspector is now concerned with routing and common entity editing rather
than all NPC override details.

### Checkpoint 3: workspace undo/redo

Moved full-project snapshot capture, no-op detection, undo/redo stacks, 50-entry
limits and restore selection into `useMapEditHistory.ts`. The hook accepts the active
area id and returns record/undo/redo plus button eligibility. MapEditor calls it once
per workspace mount; gestures still choose when a transaction starts and commits.
MapInspector reuses its snapshot helper for deletion. This is not a new history model.

Validation: five focused checks passed, including existing drag/erase/undo workflows
and two new history-boundary tests in `src/test/mapEditHistory.test.tsx`. They verify
snapshot isolation, area selection, no-op redo preservation, new-edit redo clearing,
50-entry retention and reset on remount. Root typechecking passed.

### Checkpoint 4: Asset Studio preview

Moved HumanoidPreview, its animation/quality metadata types, camera presets and clip
loading helper from App to `apps/asset-studio/src/HumanoidPreview.tsx`.
`previewSources.ts` owns the source descriptor type and checked-in fixture descriptors.
App still supplies only `source` and `onManifestLoaded` to the preview.

The effect's creation, RAF, observers, camera controls, clone skeletons, animation
mixer, transient cache disposal and cleanup were moved together. No dependency array,
callback identity policy, resource ownership or animation ownership changed.

Validation: all 21 creator/component tests and Studio typechecking passed. The
existing browser preview smoke passed with fixture animation, source switching,
canvas ownership, and added navigation away/back to exercise unmount/remount.
It performed no real compilation and produced no success screenshots.

### Inspection checkpoint and stop decision

A normalized TypeScript source comparison confirmed the complete HumanoidPreview
function body, including effect dependencies and cleanup, is identical to the original.
It also confirmed 111 unchanged map function bodies are preserved across the new
owners. Deliberate differences are the parent/delegating JSX, NPC component boundary
and the history restore function's active-area-id parameter.

Logical checkpoints were recorded locally in this report rather than making commits.
After each passing checkpoint the interface was inspected before the next extraction.
No extraction required a dependency-injection layer, broad mocks or an event bus.

## 4. Before / After Structure

| Source | Before | After | Ownership |
| --- | ---: | ---: | --- |
| `src/editor/sections/MapEditor.tsx` | 5,019 | 2,922 | Workspace tools, gestures, palette state, canvas, layout, pixel editing and 2D/3D bridge |
| `src/editor/sections/MapInspector.tsx` | — | 1,469 | Selection-driven field editing, interactions, links, object behaviour and deletion |
| `src/editor/sections/MapNpcInspector.tsx` | — | 638 | Placed NPC controls, inheritance and overrides |
| `src/editor/sections/mapEditorSelection.ts` | — | 77 | Shared selection projection and its result type |
| `src/editor/sections/useMapEditHistory.ts` | — | 80 | Workspace snapshot history |
| `apps/asset-studio/src/App.tsx` | 2,218 | 1,172 | Recipe editing, compile lifecycle, history/results and application layout |
| `apps/asset-studio/src/HumanoidPreview.tsx` | — | 1,021 | Preview scene, cameras, animation, loaded-asset diagnostics and disposal |
| `apps/asset-studio/src/previewSources.ts` | — | 46 | Fixture/source descriptors |

Lines moved across boundaries are not deleted functionality. A developer changing
NPC override reset now starts with the 638-line NPC inspector and resolver rather
than locating it inside 5,019 lines of workspace code. An undo change starts with
an 80-line hook and its test. Creator fields no longer share a module with a
1,021-line rendering/animation surface. No token-savings estimate is claimed.

## 5. MapEditor Routing

Paths without a directory in this table are under `src/editor/sections/`.

| Future task | Read these 2–4 files first |
| --- | --- |
| Painting, brush/shape/fill gestures | `MapEditor.tsx`, `terrainBrush.ts`, `terrainBrush.test.ts`, `src/store/useProjectStore.ts` |
| Object placement and instance fields | `MapEditor.tsx` for placement, `MapInspector.tsx` for fields, `src/editor/ObjectBehaviourEditor.tsx`, store mutations |
| NPC instance attributes/patrol/overrides | `MapNpcInspector.tsx`, `MapInspector.tsx` for interactions/deletion, `src/runtime/npcResolver.ts`, editor smoke tests |
| Inspector selection, links, interactions | `MapInspector.tsx`, `mapEditorSelection.ts`, `src/types/game.ts`, `src/test/editorSmoke.test.tsx` |
| Palette/tools and layout | `MapEditor.tsx`, `src/styles.css`, `overlayFilters.ts`, editor smoke tests |
| History and transaction boundaries | `useMapEditHistory.ts`, `src/test/mapEditHistory.test.tsx`, gesture callers in `MapEditor.tsx`, deletion callers in `MapInspector.tsx` |
| Pixel tools | `MapEditor.tsx`, `src/data/mapVisuals.ts`, `src/store/useProjectStore.ts` |

Palette/tool state stays with gesture orchestration. Its controls set active tool,
paint target, terrain arming, definition choices and the shared 3D palette together.
Extracting the entire palette now would require a broad collection of setters or a
new state owner. The remaining workspace is large intentionally; a future specific
interaction feature can establish a narrower boundary with its acceptance criteria.

## 6. Asset Studio Routing

Paths without a directory are under `apps/asset-studio/src/`.

| Future task | Read first |
| --- | --- |
| Creator UI/draft recipe state | `App.tsx`, `App.test.tsx`, `packages/character-contract/src/index.ts` |
| Compile request/lifecycle | `App.tsx` (`handleCompile`), `proceduralMannequinCreator.ts`, `proceduralMannequinCreator.test.ts`; endpoint changes additionally use `apps/asset-studio/dev/procedural-mannequin-compile-api.mjs` |
| Preview scene and resource lifetime | `HumanoidPreview.tsx`, `previewSources.ts`, shared loader in `packages/three-asset-preview/src/index.ts` |
| Animation, camera and visual inspection | `HumanoidPreview.tsx`, `apps/asset-studio/e2e/procedural-mannequin.spec.ts`, `docs/PLAYWRIGHT_SMOKE.md` |
| Recent history/restore/result metadata | `App.tsx` (`selectRecentCompilation`, compile diagnostics/recent list), `App.test.tsx`, `proceduralMannequinCreator.ts` |
| Loaded artifact diagnostics | `HumanoidPreview.tsx`, manifest types in `proceduralMannequinCreator.ts` |

Creator/editor state, compile lifecycle, recent history and result inspection were
all investigated. Their draft snapshots, result, manifest and preview-source selection
must be restored together. App now presents that single workflow without renderer
internals, so a second hook moving all those states would add indirection with little
additional context benefit. Result UI remains beside the state it presents; loaded
asset/animation diagnostics remain beside the preview. No workflow redesign or asset
quality work was introduced.

## 7. Three Routing

The root editor's renderer, input listeners, pick/ghost meshes and cleanup remain
in `ThreeDPreview.tsx`. Store state is authored editor state. Its pure terrain,
selection/placement, camera and visual helpers remain the narrower entry points
for those tasks.

The experimental runtime's session/event bridge and scene effect remain in
`ThreeRuntimePanel.tsx`. Session state stays in RuntimeSession; gameplay decisions
stay in shared runtime helpers. Camera/smoothing/animation refs remain with their
current component lifetime. No root scene effect, RAF, listener, renderer ref or
animation-controller map was moved or duplicated.

Asset Studio's separate preview lifetime is now wholly in HumanoidPreview. The
shared asset-preview package retains source caching, analysis and cloning ownership.
The browser smoke verifies successful mount/switch/remount and animation, while the
source comparison confirms cleanup was preserved. This is not an exhaustive GPU
leak benchmark; no renderer algorithm or ownership policy changed.

## 8. Intentionally Large Files

- MapEditor remains the workspace gesture/layout owner. Palette, painting, dragging,
  pixel UI and 2D/3D controls still share editor state; a broad hook would hide that
  coupling rather than resolve it.
- MapInspector remains a cohesive field/interaction editor. Small terrain, structure,
  pickup and event editors share interaction defaults and link handling; splitting
  each into tiny components is not currently warranted. The larger NPC subsystem
  has a separate owner.
- Asset Studio App keeps one creator transaction; HumanoidPreview keeps one renderer
  lifetime and its diagnostics. Neither is split solely for a line-count target.
- ThreeDPreview and ThreeRuntimePanel keep scene/input/ref cleanup together for the
  reasons in the classification. Existing domain helpers remain available.
- AdventureScene remains a legitimate Phaser adapter. migrateProject remains a
  searchable sequence of domain migrations. Both are unchanged.

## 9. Validation Results

| Gate/checkpoint | Result |
| --- | --- |
| Baseline editor + Studio component/request tests | 66 passed in three files; 42.18 s |
| Inspector extraction | 45 editor smoke tests passed; 32.90 s; root typecheck passed |
| NPC controls extraction | 7 selected editor tests passed; 7.79 s; root typecheck passed |
| History extraction | 5 selected history/gesture tests passed; 8.24 s; root typecheck passed |
| Studio preview extraction | 21 component/request tests passed; 8.39 s; Studio typecheck passed |
| Existing Studio browser preview integration | 1 passed; 15.5 s test / 17.8 s command; source switch, unmount/remount and animation; zero compiler requests/success images |
| Source-body comparison | Complete HumanoidPreview body identical; 111 unchanged map helper bodies identical |
| Final `npm run ci` | Passed once: 616 Vitest tests / 74 files, all root/workspace builds/typechecks, 43 Node compiler/provenance tests |
| Final `git diff --check` | Passed; no whitespace errors |

Local logs are `test-results/phase4-baseline.log`, `phase4-inspector.log`,
`phase4-npc.log`, `phase4-history.log`, `phase4-preview.log`,
`phase4-preview-browser.log`, `phase4-body-comparison.log` and `phase4-ci.log`.
They are ignored local evidence. Test counts for filtered runs exclude skipped cases.

During iteration, typechecking caught one missing store binding in the moved inspector
and the new history test using `title` instead of the existing metadata `name` field;
both were corrected before their checkpoints passed. One Windows command forwarding
a regex pipe failed before tests ran; direct Node invocation preserved the selector.
These were extraction/test setup corrections, not production-behaviour changes.

CI includes all workspace builds/typechecks and the cheap compiler/provenance/installed
artifact checks. No overlapping package/compiler gate is added afterward. No visual
gallery, performance benchmark, real compiler request or Blender matrix was run:
asset appearance, geometry, compiler output and root renderer lifetime did not change.

## 10. Deferred Findings

- The Map Workspace still couples palette/tool selection to 2D/3D interaction state.
  Address a narrower part when implementing an actual interaction requirement;
  do not introduce an all-purpose editor hook during cleanup.
- History remains full-project snapshots with its existing coverage boundaries.
  Delta history, broader inspector undo and persistence changes are feature/design
  work, not part of this extraction.
- Root Three scene effects remain substantial. A future lifecycle change needs a
  concrete ownership contract and targeted browser evidence; moving closures alone
  is not an improvement.
- Creator compile/history state remains local and in-session. Persistent job libraries,
  cancellation and artifact reuse require separate product requirements.
- Asset packaging, Long/Buns fitting and character quality work remain deferred.
  This report provides no new visual acceptance of those assets.

## 11. Feature-Development Readiness

**Yes: the repository is structurally ready for substantial engine feature development.**
This means there are clear owners and validation routes for the main authoring tasks;
it does not mean the engine or Asset Studio is feature-complete. Further general
cleanup is not a prerequisite merely because several large files remain.

The best next areas, consistent with current product gaps and ROADMAP.md, are:

1. Editor interaction usability: drag/placement feedback, predictable selection and
   inspector shortcuts, with concrete 2D/3D authoring workflows as acceptance criteria.
2. Asset Studio/creator completion: length-aware Long/Buns fitting and clearance review,
   then deliberately scoped creator/library workflows; retain rendered acceptance.
3. Core authoring workflows: reference navigation, deletion/validation feedback, map
   overlays and bulk editing. Playable export/asset packaging remains separate work.

These are candidate feature areas, not implementation commitments or new systems
started here. Phase 4 stops with this report.