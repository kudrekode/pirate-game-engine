# Logic Blocks V2

## 1. Executive Result
The Logic editor now opens in Blocks, with readable WHEN / IF ALL or ANY / THEN / ELSE sections. Advanced retains the previous complete forms. Both edit the same GameRule records.

## 2. Existing Rule Runtime Reused
No new trigger, predicate, action, schema, runtime or visual compilation format was added. The five existing triggers, recursive condition tree and ordered action arrays remain authoritative.

## 3. Block Architecture
Vertical blocks compose directly over the selected rule. Nested groups are ordinary ConditionGroup values; every leaf keeps its existing ID.

## 4. WHEN
Entity selection/drop resolves placed interaction targets, areas and story moments. Touch is offered for reachable event/object targets, not NPCs or blocking props. New-game start and detailed imported triggers remain accessible.

## 5. IF / ALL / ANY
Groups can be added, removed, reordered and moved across groups by drag or a destination selector. Moving into self/descendants is rejected. Empty groups visibly warn that they pass under current runtime semantics.

## 6. Conditions
Items, Yes/No state, typed story values, NPC alignment and health use existing leaves. Defeated is offered only for the exact existing generated npc_defeated_<placementId> flag. Generic quest-status checks are explicitly rejected.

## 7. Entity Wiring
The shared catalog, typed reference MIME, picker, contextual operation dialog and atomic inline creation are reused. Renames resolve through stable references; missing values remain visible.

## 8. THEN / ELSE
Both stacks display action order and support drag and keyboard ordering. ELSE remains subordinate and may be empty. There is no else-if or arbitrary execution graph.

## 9. Actions
Shared chips support item/state/quest operations, NPC changes, story moments, arrival points and shops. Advanced retains all 15 actual actions. Inline story moments use ordinary Cutscene fields with an existing background preset.

## 10. Recipes
Locked Passage and Conditional NPC Interaction preview fresh ordinary rules. The former explicitly warns that teleport does not emit door_used; the latter does not cancel an NPC's direct dialogue.

## 11. Conflict Warnings
Targets with direct behavior show that the rule runs in addition. Run policy retains Every time/Once per playthrough; help explains that ELSE does not consume once state and successful THEN consumes it after its actions finish.

## 12. Advanced Compatibility
Blocks/Advanced switching does not rewrite data. The original detailed condition, trigger and action forms remain available. Existing smoke tests still exercise them through the explicit Advanced toggle.

## 13. Undo / Persistence
Existing workspace history owns rule and inline-entity edits. Insertions and recipe creation are single updates. IDs survive nested moves, view changes and export/import.

## 14. Browser Acceptance
The fresh @logic-blocks case passed: native WHEN/IF/THEN drops, nested ANY, move/undo/redo, inline ELSE story moment, Advanced round trip, export/import, actual locked ELSE, state/key acquisition, successful THEN and once-state Save/Continue. The reviewed screenshot is `docs/assets/story-workspace-v1/logic-blocks.png`; final four-stage verification is recorded in STORY_WORKSPACE_V1_RESULT.md.

## 15. Performance
Local tree edits do not run a graph layout. The palette reuses the snapshot catalog. Only the selected rule renders its block tree.

## 16. Tests / CI
Focused pure and mounted tests passed for trigger mappings, predicate restrictions, defeat convenience, nested identity/cycle safety, empty-group behavior, ordered THEN/ELSE, once semantics and undo. Final repository CI is recorded with the four-stage result.

## 17. Remaining Missing Semantics
No generic quest status, dialogue-ended/container-opened/defeated triggers, cancellation of direct behavior, timers, delays, joins or custom scripting. These remain deliberate runtime limitations.

## 18. Recommended Next Feature
Story Workspace V1, separately authorized as the fourth stage of the user's request.
