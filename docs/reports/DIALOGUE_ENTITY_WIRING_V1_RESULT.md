# Dialogue Entity Wiring V1

## 1. Executive Result
Dialogue uses a searchable entity palette, reference chips, contextual operation choices, inline creation and placed-character assignment. The authoring data remains DialogueDefinition/DialogueCondition/GameAction and Interaction.start_dialogue.

## 2. Entity Catalog
One derived, snapshot-cached catalog resolves placed character overrides, area/coordinates, item icons/categories, quest defaults/objectives and humanized flag keys. Nothing is serialized as an entity registry.

## 3. Reference Chips
Live labels retain stable IDs. Duplicate placed names include area and coordinates. Missing references remain visible; replacement changes only the chosen reference field. Variables remain in Advanced for this stage.

## 4. Typed Drag/Drop
Dedicated reference MIME payloads contain kind, ID and placement area. Targets revalidate against the latest project. Native drops and click/keyboard selection use the same operation chooser; cancellation leaves data unchanged.

## 5. Conditions
Have/Do not have item, Yes/No state and all four quest statuses write existing flat-AND response predicates. No opening-greeting routing or nested dialogue conditions were added.

## 6. Actions
Give/Remove, Remember Yes/No and Start/Complete/Fail quest are contextual choices. The full existing action union remains available in Advanced.

## 7. Inline Creation
Items use ordinary definitions; flags use collision-safe keys and false defaults; quests are inactive, sequential and visibly unfinished. Creation plus the chosen reference is one store update. Open quest navigates to the owning editor; no full Quest editor is embedded in Dialogue.

## 8. NPC Assignment
Assignment previews the exact placement, effective interaction and completion effects. It writes ordinary placement overrides, preserving template defaults and unrelated attributes. Show on map/Open assignment reuse the existing Map.

## 9. Speaker vs Assignment
Copy speaker name copies presentation text. It does not create a live NPC reference or assign the conversation. The controls explicitly describe this distinction.

## 10. Quest Giver Recipe
Preview creates four fresh Yes/No nodes in a new or existing conversation and assigns it to the selected placement. It can select a quest or create an inactive unfinished quest in the same transaction. Yes owns Start Quest and optional acceptance state; for an existing conversation it rejoins the previous Start. No owns optional refusal state and ends. The reviewed replacement clears old completion effects so early close cannot activate the quest. Existing nodes/IDs remain intact; new records get fresh IDs.

## 11. Undo / Persistence
The existing 50-entry workspace history owns edits. Inline creation/wiring and recipe creation/assignment are atomic. Navigation, palette selection and graph view state remain UI-only. History remains local to the mounted editor; navigating to another owner ends that history lifetime.

## 12. Validation / Broken References
Existing validation remains authoritative. Chips retain unresolved IDs, offer replacement and source navigation where a source exists. Empty quests are marked unfinished. No name-based retargeting occurs.

## 13. Runtime Compatibility
No runtime, authored schema or migration changes are required by this stage. Tests execute recipe branches through the existing dialogue and quest helpers and verify project defaults remain unchanged.

## 14. Browser Acceptance
The opt-in @dialogue-entities case passed native drop, operation choice, undo/redo, inline quest creation, exact Quest navigation, keyboard selection, assignment, export/import and Three Play/Save/Continue. @dialogue-graph-scale passed the existing 30-node graph check. Final shared-control verification and durable evidence are recorded in STORY_WORKSPACE_V1_RESULT.md.

## 15. Performance
Catalog and ID lookup caches are keyed by immutable project snapshots. Pointer movement and local search reuse them. Graph layout remains explicit; inserting an entity does not relayout the graph.

## 16. Tests / CI
Focused catalog, mounted editor, recipe-runtime, dialogue and history checks cover stable references, typed rejection, cancellation, missing references, assignment and undo. The repository-wide CI gate is run once after all four requested stages; its final result is recorded in the Story Workspace report.

## 17. Remaining Friction
Flags have humanized keys rather than independently editable labels. Source navigation uses the existing separate editor tabs. History does not span tab lifetimes. Unsupported action fields remain detailed forms.

## 18. Recommended Next Feature
Quest Sequence UX V2. The user explicitly requested the four-stage sequence, so the next stage is authorized separately from this recommendation.
