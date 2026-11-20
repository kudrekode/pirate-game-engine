# Story Workspace V1

## 1. Executive Result

The four requested authoring stages are implemented in order: Dialogue Entity Wiring, Quest Sequence, Logic Blocks and Story Workspace. Story provides a searchable entity palette, focused relationships, a summary inspector and contextual creation. Specialized editors still own detailed editing. This authoring pass adds no runtime or authored schema.

Earlier stage reports: [Dialogue Entity Wiring](DIALOGUE_ENTITY_WIRING_V1_RESULT.md), [Quest Sequence](QUEST_SEQUENCE_UX_V2_RESULT.md), [Logic Blocks](LOGIC_BLOCKS_V2_RESULT.md).

## 2. Product Architecture

DialogueDefinition owns conversation flow, Quest owns objectives and GameRule owns WHEN/IF/THEN/ELSE. Map remains the single placement and selection workspace. Story reads these records and navigates their owners; it has no executable graph or persistent canvas positions. The pre-existing staged Dialogue Graph changes are preserved.

## 3. Entity Palette

One shared catalog resolves placed characters, effective world behaviors, physical pickups, items, quests, conversations, rules, story state/values, areas, arrival points, story moments and shops. Search and category filters use friendly names. Placement labels include area and coordinates. Stable IDs appear in Advanced identity and missing-reference diagnostics.

## 4. Reference Index

`storyReferenceIndex.ts` derives outgoing and incoming references from the current immutable project snapshot. Sources record the owner, dialogue node and field/objective/condition/action position. The index and entity catalog use WeakMap caches. Neither is serialized or consulted by the runtime.

## 5. Relationship Types

Green dialogue flow denotes Start, Next and response destinations. Blue authored references describe actual assignments, predicates and effects. Dashed derived dependencies identify possible item sources and existing defeat-state associations. Each row labels its meaning; derived rows cannot be wired as execution.

## 6. Character View

Placed-character views show location, effective conversation assignment, quest observations, rule targets, NPC action references and declared defeat-state associations. Show on map selects the existing placement; conversation, quest and rule rows lead to their owners. Speaker text remains presentation text, separate from assignment.

## 7. World Object View

Containers expose actual contents/opened state. Doors expose required item, destination and locked story moment. Pickups expose item/collection state. Quests and rules appear under Used by. Capabilities come from resolved behavior rather than visual category. Missing or disabled capabilities are warned in Quest Sequence.

## 8. Item View

Used by includes physical pickups, containers, doors, quest objectives, dialogue predicates/effects, rule conditions/actions, and shop currency/stock. Quest-to-source suggestions are derived navigation. They do not guarantee the item is reachable or enforce a story order.

## 9. Quest View

The inspector summarizes initial status, sequence versus independent mode, objectives and completion actions. Incoming references show activation/status checks; outgoing rows expose observed entities and effects. Empty quests remain visibly unfinished. Open Quest Sequence retains current IDs and semantics.

## 10. Dialogue View

Conversation views show actual internal flow alongside referenced quests, items and state. Used by reveals placed assignments. Open owning field can select the exact node and entry effect or response condition, expanding and focusing the relevant controls. Opening-greeting routing is unchanged.

## 11. Logic View

Rule summaries read WHEN / IF / THEN / ELSE, with friendly entity labels and enabled/run policy. Detailed editing opens Logic Blocks. Nested ALL/ANY groups remain the existing condition tree; advanced forms remain available without conversion.

## 12. Contextual Creation / Recipes

Character shortcuts create a conversation, interaction rule, Quest Giver or Fetch Quest. Quest Giver reuses the PR1 helper and UI, supports new/existing conversations and new/existing quests, and previews replacement of placement interaction/completion effects. Yes owns Start Quest; No/early close do not. Existing-conversation Yes rejoins the old Start; No ends safely.

Fetch combines the same Quest Giver helper with ordinary Talk → Have objectives. It explicitly does not pretend to require a return visit. Keyed Passage configures native Door item/destination fields with an optional Use Door objective. Conditional Response creates an ordinary response and opens the existing Dialogue condition tools. Creation remains reversible in Story before navigating to the created content.

## 13. Used By / Navigation

Major catalog entities expose incoming uses and outgoing references. Owner links select dialogue/node/response/action, quest/objective, rule/trigger/condition/action, state key, shop entry or Map placement. Navigation requests and focused selection are UI state, not project fields or history edits. No second Map mounts.

## 14. Diagnostics

Broken relationships preserve original IDs and link to the owning editor for repair. Native Door destinations, missing entities, incompatible quest capabilities, repeated historical Talk facts, direct behavior plus rules, and response-visibility-only conditions are explained. No name-based reassignment or silent reference removal occurs.

## 15. Beginner / Advanced

Story provides context and shortcuts; Dialogue Graph, Quest Sequence, Logic Blocks and Map provide depth. Advanced fields remain available for every existing specialized contract. The workspace does not duplicate all owner forms.

## 16. Save / Serialization

Only existing project records are edited. The ordinary demo is `story-workspace-v1-demo.project.json`; export/import and Play/Save/Continue use the existing mechanisms. Tests verify unchanged editor defaults after Play, stable references after import, quest facts/latches, remembered flags and completed-rule IDs. No Story runtime state or template runtime exists.

## 17. Browser Acceptance

The targeted cases in `e2e/dialogue-graph.spec.ts` cover all four stages. Story checks Guard search/location/assignment, exact Start Quest effect navigation, quest references, item uses, Gate behavior/rule references, contextual response creation, item and inline state predicates, updated read/write relationships, export/import and the complete Yes route with Save/Continue. Quest Sequence covers remembered No → Continue → later Yes → key → native Door. Logic covers locked ELSE and successful once-only THEN. The 30-node Dialogue graph check also passed during this work.

Fresh browser results: `@dialogue-entities`, `@quest-sequence` and `@logic-blocks` passed together; `@story-workspace` passed after correcting the scale fixture setup to import while Story is open. The first scale attempt imported 150 overlapping NPCs while the 3D Map was active and timed out before opening Story; no Story/runtime change was made for that test setup correction.

Reviewed evidence:

- [Dialogue entity wiring](../assets/story-workspace-v1/entity-wiring.png)
- [Quest sequence and completion effects](../assets/story-workspace-v1/quest-sequence.png)
- [Logic blocks](../assets/story-workspace-v1/logic-blocks.png)
- [Item uses](../assets/story-workspace-v1/story-item-uses.png)
- [Story state reads/writes](../assets/story-workspace-v1/story-state-uses.png)
- [Larger-project focused neighborhood](../assets/story-workspace-v1/story-scale-focus.png)

Import [the tested demo](../../story-workspace-v1-demo.project.json), open Story, and select Guard or Harbour Key. In Three Play, talk to the Guard, choose Yes, open the Old Chest, then use the Harbour Gate. Choosing No first remembers refusal; Continue retains it, and the same conversation allows later acceptance. The added key response appears after acceptance and key acquisition.

## 18. Performance

Only the selected entity's neighborhood renders. Local search and pointer movement reuse the cached catalog/index; project edits invalidate by snapshot identity. The Story browser acceptance also imports 600 additional entities and checks that selecting one character renders only its single outgoing relationship. This is a responsiveness check, not a formal performance budget or claim about unbounded project sizes.

## 19. Tests / CI

Focused tests cover catalog/reference identity, typed insertion, cancellation, missing references, assignment, recipes, capability validation, sequence persistence, nested condition moves, runtime semantics, source navigation and coherent undo. The initial combined focused run passed 43 tests; the subsequent inline Quest Giver regression passed 10 tests across its two affected suites. Door recipe/history boundary checks passed all 6 tests.

Final validation on 21 October 2026:

- `npm.cmd run ci` ran once. All **940 tests in 113 files passed**. The build then caught three `Array.at()` calls in a newly added test, incompatible with the repository's existing TypeScript library target.
- Replaced those test-only calls with array indexing; the affected mounted suite passed all **6 tests**.
- Resumed only the failed/unreached gates: root build, both contract package builds, shared Three preview package build, Asset Studio build and **77 Node compiler/asset checks**. All passed. No runtime source changed for the fix; the 940-test suite was not needlessly repeated.
- Four authoring browser cases passed, plus the earlier 30-node Dialogue graph case. Native drag/click/keyboard, undo, persistence, actual Play and focused scale behavior were exercised.
- Final `git diff --check` passed. CI logs remain in `test-results/story-authoring-ci.log` and `test-results/story-authoring-ci-remaining.log`.

## 20. Remaining Friction

- Undo follows the existing mounted-editor lifetime; it does not span tab navigation.
- Story state names are humanized stable keys; independent display-name metadata was not introduced.
- Common edits have contextual controls; uncommon fields still use Advanced forms.
- The index focuses on placed entities and current story owners; unused NPC/object definitions are not separate Story nodes.
- Historical quest facts cannot express “again later”; rule teleport cannot emit native `door_used`; rules do not cancel direct behavior.
- The optional Play debug panel and arbitrary persistent Story canvas remain deferred.

## 21. Recommended Next Chapter

**Narrative runtime consistency.** Audit the already documented historical-fact, early-close and direct-behavior interactions across adapters before adding more semantics. This recommendation is not implemented in this authoring pass.
