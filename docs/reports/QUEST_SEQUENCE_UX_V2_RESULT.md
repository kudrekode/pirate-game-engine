# Quest Sequence UX V2

## 1. Executive Result
Quests read as numbered goals involving recognizable entities. The same palette, typed payloads, operation chooser and creation helper used by Dialogue now author ordinary objectives.

## 2. Existing Quest Runtime Reused
No runtime or schema change. Objectives still use current predicates and latches; sequence and legacy independent semantics are preserved.

## 3. Sequence UX
Rows show friendly summaries, author descriptions, semantic hints and Advanced fields. Drag handles and keyboard-accessible Move buttons reorder without changing IDs. Duplicate creates a fresh objective ID; remove is undoable.

## 4. Entity Dragging
The shared catalog includes resolved world objects, event points and areas. Item/state creation and objective insertion commit together. Unsupported entity kinds are rejected.

## 5. Character Objectives
Finish talking writes interaction_completed with containing area and placed ID. Characters without an enabled message/conversation are explained and disabled in the chooser. Imported incompatible references remain editable and visibly warned.

## 6. Item Objectives
Have Item starts at quantity one. Its hint explains current ownership until the objective latches. Full quantity/reference fields remain in Advanced.

## 7. World Objectives
Open Container requires resolved container behavior. Use Door requires resolved door behavior and a valid destination. Reach Point and Enter Area remain distinct. Visual category/name alone never grants capabilities.

## 8. Story State
Yes/No objectives write the existing flag predicate. Inline keys are collision-safe. Variable comparisons remain available in Advanced.

## 9. Completion Effects
Shared ordered action chips expose entity insertion, contextual verbs, drag/keyboard ordering and full Advanced fields. Completion message and legacy rewards stay separate.

## 10. Recipes
Fetch Quest previews and appends Talk → Have Item using current objective records. It explicitly does not imply a later return visit; repeated Talk is historical. Existing objective order mode is preserved. The optional keyed-passage recipe is deferred to the authorized Story Workspace stage.

## 11. Validation
Missing entities, incompatible capabilities, invalid Door destinations and repeated historical facts are shown at the objective. Empty objectives remain visibly unfinished; no retargeting or silent deletion occurs.

## 12. Map Navigation
Show on map selects the exact existing placement through the shared Map workspace. Start sources link directly to the conversation node, rule, quest or placed interaction that owns the activation action.

## 13. Save / Runtime Compatibility
Tests exercise Talk → Have → Use with unchanged quest helpers and a validated GameSave round trip, including facts and objective latches. Editor defaults are preserved.

## 14. Browser Acceptance
The opt-in @quest-sequence case passed authoring the three steps with native drags, reorder/undo, Guard navigation on Map, a completion effect, export/import and the No → Save/Continue → Yes → key → native door route. Final shared-control verification and durable evidence are recorded in STORY_WORKSPACE_V1_RESULT.md.

## 15. Performance
The shared catalog is cached per immutable snapshot. Sequence rendering is linear in objective count; it has no graph layout or extra map renderer.

## 16. Tests / CI
Focused pure and mounted tests cover all entity mappings, capability checks, missing references, stable reorder, inline creation, legacy mode, runtime progression and persistence. Existing Quest editor smoke cases were adapted only where the Advanced effect toggle changes access. One final repository CI gate covers the four requested stages.

## 17. Remaining Friction
Quantity and uncommon objective edits still use Advanced fields. Historical facts do not express “again later”; this limitation is visible. There are no internal quest branches or per-step effects.

## 18. Recommended Next Feature
Logic Blocks V2, separately authorized by the user's request to complete all four stages.
