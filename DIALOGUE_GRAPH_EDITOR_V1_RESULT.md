# Dialogue Graph Editor V1 — Result

21 October 2026.

## 1. Executive Result

**PASS.** A creator
can visually author and understand branching dialogue using the existing
`DialogueDefinition` and dialogue engine. No executable graph format, alternate
condition evaluator, action executor, or dialogue runtime was introduced.

## 2. Existing Runtime Reused

The pre-implementation [schema audit](docs/DIALOGUE_GRAPH_SCHEMA_AUDIT.md) records
required/optional fields, exact predicates/actions, migration defaults, reference
scopes, forms, serialization and save contracts. `src/types/game.ts` remains the
one authored schema. `dialogueEngine.ts`, `ruleEngine.ts`, shared action dispatch,
Phaser and Three dialogue execution are unchanged. The only runtime-file change
excludes optional authoring layout from the existing game-save revision identity.

## 3. Graph Architecture

`DialogueGraph.tsx` renders HTML node cards and SVG directed edges inside a local
pan/zoom surface. No graph library was already installed, and no dependency was
added. `dialogueGraphModel.ts` owns editor transformations, UUID creation,
duplication, links and basic breadth-first layout. `DialogueEditor.tsx` integrates
the canvas, definition list, existing forms and diagnostics with the existing store.

## 4. Node Types

Text, Choice and End are the existing runtime types. Cards show speaker, text
preview and ordered entry-action summaries. Choice cards show each response and
its AND-condition summary; End explicitly shows conversation termination. Start
is a badge on the real node referenced by `startNodeId`. There are no action nodes.

## 5. Connections

Click a Next/response output, then the destination's incoming port. This works by
pointer and keyboard without tracking IDs. Text has one next output, each response
has one output, and End has none. Edges display response text; select an edge and
use Delete connection or Delete. Disconnecting Text unsets next; disconnecting a
response leaves its target empty and produces an error. Cycles and self-links are
legal; backward links route around cards. Node deletion warns about incoming
branch count, disconnects them, and clears a deleted Start without retargeting it.

## 6. Conditions

The inspector edits `flag_is`, `variable_compare`, `has_item`, `not_has_item`, and
`quest_status`. Conditions remain flat AND lists. Flags/variables have named
suggestions, items and quests have selectors, quantities/statuses are editable,
and explicit Number/Text literal selection preserves strings such as `"001"`.
Broken references appear in diagnostics. There is no OR/nesting or new predicate.

## 7. Actions

All 15 existing `GameAction` variants have complete fields: flag, set/change
variable, give/remove item, activate/complete/fail quest, cutscene, teleport, shop,
movement mode, placed NPC alignment/health, and end game. The UI explains sequential
execution and the existing once-per-node-per-conversation guard. Add/remove/move
up/move down preserve action order. Teleport selects a valid area/event pair and
resets the destination when changing areas; it cannot be newly selected when no
destination exists. Imported incomplete actions remain visible for repair.

## 8. Speaker / Portrait

Speaker stays a string, with existing NPC names offered as suggestions. Portrait
selection includes built-in portraits and discoverable portrait pixel assets.
No entity relation, generation pipeline, audio or animation contract was added.

## 9. Validation

`validateDialogue.ts` supplies both selected-dialogue diagnostics and the project's
existing validation panel. Errors cover missing Start, duplicate/empty node and
local response IDs, broken links, missing targets, conditions/actions referring
to missing items/quests/areas/destinations/shops/cutscenes/placed NPCs, and invalid
quantities. Project validation also checks duplicate dialogue IDs and dialogue
assignments, including instance overrides and definition defaults.

Warnings cover unreachable nodes, Text without next, possible no-response states,
undeclared flag/variable defaults and missing portraits. Empty action item/shop
references retain the runtime's sole-currency/sole-shop fallback as warnings when
applicable. No loop is rejected and no story-correctness proof is attempted.
Save/export retain the existing policy and remain available while editing.

## 10. Inspector / Editor UX

Graph/List toggle shares one inspector. Dialogues can be created, renamed,
duplicated, deleted and selected. Nodes/responses get stable UUIDs, duplicated
nodes regenerate response IDs, and whole-dialogue duplication remaps internal
links and layout. Response reordering preserves IDs. Focus selected, Fit graph,
Auto layout, Delete, Escape and Ctrl/Cmd+Z / Shift+Z are supported. Explicit
confirmation protects node-type conversion and deletion.

Undo/redo reuses the existing `useMapEditHistory` snapshot implementation and
50-entry policy for all dialogue/store edits, with text edits grouped by focus
and moves committed at pointer release. Like the existing map workspace, history
is scoped to the mounted editor lifetime; it is not persisted across tab changes.

## 11. Layout Persistence

Optional `DialogueDefinition.editorLayout.nodes[nodeId] = { x, y }` contains only
authoring coordinates. Migration accepts finite positions for surviving nodes,
drops malformed/stale entries, preserves absent metadata and explicit empty
Start/nodes, and never repairs links. Pan, zoom, selection and pending connections
remain UI state. Moving nodes does not reorder semantic arrays. Project Save,
export and reload preserve content and layout; layout edits retain game-save
identity, including the same hash as a pre-layout project.

## 12. NPC Assignment

Map Inspector keeps Start dialogue and its definition selector in the shared
2D/3D workspace. Open dialogue navigates directly to the assigned definition via
UI-only store state. Deleting a dialogue clears matching default, legacy and
override assignments without removing overrides that reference another dialogue.
The browser acceptance route assigns the newly authored conversation to Keeper.

## 13. Runtime Compatibility

Three and Phaser both execute the same authored definition through their existing
dialogue paths. Fresh browser checks covered real Three authoring/Play/Continue
and Phaser conversation choice clicks, flag mutation, quest activation, item grant
and game save. Gameplay engine/adapter dialogue code was not modified.

## 14. Save / Continue

The real acceptance route chooses Yes, runs actions, closes conversation, saves,
returns to Edit, re-enters Play, chooses Continue, and speaks to Keeper again.
Yes is then hidden and "I am already helping." is available. Helper tests also
check quest-status AND conditions after restoration, ordered actions and isolated
editor defaults. Dialogue cursor stays transient; mid-conversation saving and
automatic greeting routing were not introduced.

## 15. Demo

Import [dialogue-graph-v1-demo.project.json](dialogue-graph-v1-demo.project.json).
Open Dialogues → Keeper's request → Fit graph. In Play, Keeper is immediately
south of the spawn; press E. The fixed opening leads to Yes/No, a flag-and-quest
conditioned progress response, and Ask me again (a loop). Yes sets
`accepted_keeper_job`, activates Harbour Trouble and grants Harbour Key; No sets
`refused_keeper_job`. Branches reconnect at explicit End. Save after closing,
return to Edit, Play → Continue and reopen the conversation.

The quest deliberately remains active until the authored `keeper_job_done` flag
is set elsewhere. This demo proves dialogue actions and persistent branch state,
not an additional quest gameplay route.

## 16. Browser Acceptance

Three opt-in cases in `e2e/dialogue-graph.spec.ts` passed:

- `@dialogue-graph`: actual UI creation of a dialogue, Text/Choice/End nodes,
  separate Yes/No/progress links, flag conditions and flag/quest/item actions;
  disconnect/error/repair; unreachable warning; drag/pan/zoom/focus/fit/layout;
  Save/export/reload equality; NPC assignment/Open dialogue; Three Play and
  Save/Continue; project equality after Play. Passed in 49.0 seconds.
- `@dialogue-graph-scale`: 30 nodes with several choices, branches and loops;
  layout, List/Graph navigation, focus, dragging, editing and Save preserving
  node order. Passed in 4.6 seconds.
- `@dialogue-graph-phaser`: actual canvas conversation and choice input; persisted
  accepted flag, Harbour Key and active quest verified in game save. Passed in
  7.7 seconds.

Each selection was listed before execution. Screenshots were visually reviewed.
The full authoring run is under `test-results/playwright/`; the two supplemental
cases are under `test-results/dialogue-graph-extra/`. These are local ignored test
artifacts. Source-controlled evidence: [graph authoring](docs/assets/dialogue-graph-v1/graph-authoring.png),
[continued choices](docs/assets/dialogue-graph-v1/continued-choices.png),
[30-node focus](docs/assets/dialogue-graph-v1/30-node-focused.png),
[Phaser choices](docs/assets/dialogue-graph-v1/phaser-choices.png).

## 17. Performance

Graph gestures update local state at animation-frame cadence and commit one
project change at drag release. Layout runs initially or on explicit Auto layout,
not per keystroke. Unmounted Dialogues has no gesture listeners or animation loop.
The 30-node test completed its focused drag/edit/screenshots/Save sequence in
588 ms on this run. That is an interaction observation, not a renderer frame-time
benchmark or a hardware-independent budget. Large overviews require zoom/focus;
the V1 layout is intentionally basic.

## 18. Validation / CI

- Focused helper/runtime/migration/reference run: 40 tests passed.
- Existing editor smoke suite: 47 tests passed.
- Graph helper/component run: 15 tests passed, including assignment cleanup
  and legacy fallback diagnostics.
- Final component regression run: 7 tests passed, including duplication/layout
  persistence for imported dialogues without metadata; final TypeScript check passed.
- Three selected browser cases passed as detailed above.
- `npm.cmd run ci` ran once: all 106 Vitest files / 903 tests passed. The root
  build then caught an incorrect `ObjectInstance.interactionOverride` reference
  in deletion cleanup. It was removed; the type-safe root build now passes.
  Contract, preview-package and Studio builds then passed, as did all 77 Node
  compiler/asset tests. The passing full Vitest suite was not rerun. A final
  imported-dialogue duplication correction was checked with the focused component
  suite and root TypeScript check above.
- `git diff --check`: clean.

Builds emitted their existing large-chunk advisories. One installed-chest test
logged a texture-load warning; its assertions and the overall compiler gate passed.

No Blender matrix, broad browser sweep, snapshot suite, coverage threshold or
overlapping compiler gate was added or run.

## 19. Remaining Limitations

The layout is basic; it does not minimize crossings or prove loop termination.
Connection gestures use two clicks rather than a dragged wire. Response conditions
and large action lists are summarized in cards and fully edited in the inspector.
History follows the existing mounted-workspace lifetime. A dependency browser and
state simulator remain outside V1. Existing runtime action transaction/modal behavior
is unchanged; this pass does not make action lists atomic.

## 20. Recommended Next Feature

**Narrative transaction consistency.** Review ordered dialogue/quest/rule actions
and modal/transition completion behavior through the shared dispatcher before
expanding narrative semantics. This recommendation was not implemented.
