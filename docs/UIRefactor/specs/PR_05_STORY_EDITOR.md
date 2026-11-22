# PR 05 — Story & State: Visual Graph Connected to Real Gameplay

**Branch:** `feat/editor-05-story`  
**Dependency:** PRs 01–04 merged so Asset/Cinema/Map IDs and deep links are stable.  
**Visual source:** master HTML → Story; `refs/story_editor.png`.

## Objective

Deliver a **real authored, executable node-based Story Editor**, not merely an SVG diagram. Replace the old visible collection of Story/Logic/Quest/Dialogue workflows with a cohesive graph-centric entry while preserving the engine's shared quest/dialogue/rules semantics and project compatibility. Users author spawns, waits, cinematic triggers, objectives, conditions, branches and loopbacks without editing raw JSON.

## Visual model

- Left sidebar: graph list (opening, quests, events, optionally dialogue subgraphs) and searchable node palette grouped as **Entries/Triggers, Wait for Events, Actions, Conditions, Flow**. A `+ New Graph` action, graph ownership/type, editable names.
- Centre: performant node canvas with pan/zoom/fit, node drag/reposition, port-to-port connections (True/False distinct), selected edge deletion/redirect, keyboard undo/redo, validation overlay and test/debug controls. Show clear lifecycle of active/completed/waiting states in debug.
- Right: context-sensitive inspector for node parameters and **typed references** to placed NPCs, assets, area/marker, item definitions, quest/objective, cinematic sequence, variables. Reference pickers use IDs plus display names and offer `Find in Map`, `Edit Asset`, `Open Cinematic` deep links.
- Use existing graph library if project already uses one, rather than choosing a new library solely for visuals. Don't invent artificial graph-runtime parity if old systems don't support a node yet: adapt or mark unsupported.

## Node model: first-class catalogue

### Entries / Triggers (beginnings of a graph or event stream)
- `On New Game` (only appropriate for newly-created session, not every Continue).
- `On Area Enter`, `On Quest Start`, `On Quest Complete`, `On Flag Changed`, `On Map Event`.
- `Spawn Player` / `Set Player Spawn` as explicit *actions* tied to an area/marker; avoid defining spawn as an unconditional event that fires on load/Continue repeatedly.

### Wait for gameplay events (suspend graph until observed)
- `Wait: Talk/Interact with NPC` (requires player interaction; never automatically talks merely because preceding node connected).
- `Wait: Reach Location / Trigger Zone`, `Wait: Collect Item`, `Wait: Defeat Enemy/Group`, `Wait: Dialogue Choice`, `Wait: Cinematic Finished/Skipped`, `Wait: Timer/Delay`.
- Event waits should use stable subscriptions, unsubscribing on completion/abort; support once/per-quest/repeatable semantics.

### Actions (execute a validated domain operation)
- `Start Dialogue` (different from wait for interaction), `Play Cinematic`, `Start/Advance/Complete Quest`, `Set Objective`, `Show HUD Notification`, `Set/Clear Flag`, `Set/Add Variable`, `Give/Remove Item`, `Spawn/Despawn NPC`, `Enable/Disable Object`, `Unlock Passage`, `Teleport/Move Player`, `Play Effect/Animation`, `Change NPC State/Reputation` where the runtime supports each action.
- Actions should call shared engine helpers / typed domain functions rather than raw mutable `GameProject` patches. Mark any unavailable runtime functionality clearly.

### Conditions / Flow
- `Has Item`, `Quest State`, `Compare Variable`, `Flag Set`, `NPC Alive`, `Objective Complete`, `Player In Area`, `Reputation/Stat Threshold` where data exists.
- `Branch` (`True`/`False`), `Sequence`, `Parallel` / join (only if deterministic), `Once`, `Delay`, `End/Return`, bounded loop guard, optional subgraph call.
- Do not implement every speculative node on day one; **ship a registry with typed node schemas and a proven vertical set**, then add by category when backed by engine functionality.

## Runtime semantics and safety

- A graph defines authored behaviour; a runtime runner interprets/compiles it into existing event/condition/action semantics, with the original `RuntimeSession` holding active progress.
- Never run an unbounded synchronous cycle. Back-edges must pass through a wait/delay/explicit guard, and validator detects impossible or unsupported loops.
- Side effects (award key, start quest, cinematic completion) need **idempotency keys** scoped to once/per quest/per interaction as intended; save/Continue cannot duplicate them.
- Save durable graph state such as active node/wait subscription/quest flags through current versioned save model, respecting authored-revision policy and old saves.
- Separate dialogue *authoring graph* (line/response-level choices) from quest *event graph* when appropriate. Reuse same typed references and conditions, but don't force every spoken line into general-purpose event nodes.
- Story owns **why/when** a cinematic runs and what quest state changes, not its camera/voice cues. Skipping and completion are explicit outcomes and restore player control.

## Starter node and gameplay path (must actually run)

```
On New Game
 → Spawn Player at Merewatch / Cottage Lane (once on fresh start)
 → Wait: interact with Oswin (E)
 → Play Cinematic: The Light Across the Mere
 → Set Objective: Find the Beacon Key
 → Branch: Has Beacon Key?
    True → Wait: reach Watchtower → Complete Objective
    False → Show Reminder → Wait: collect Beacon Key → re-evaluate Branch
```

Build it by referencing **actual existing Merewatch entities, dialogues, sequences, quests and item IDs**, not names typed into arbitrary strings. Where current quest semantics require a different initial trigger, adapt the graph to produce the same existing gameplay. No automatic Oswin conversation just because the player spawns.

## Acceptance criteria

1. New game enters correct spawn path and subscribes to Oswin interaction; dialogue only starts after E/input.
2. Finishing or skipping cinematic correctly advances objective exactly once; rewinding/Continue doesn't duplicate reward.
3. Has Item True/False branches work; the False path waits for item collection before looping, no busy spin.
4. Runtime quest, inventory and flags persist across Save/Continue, including an active wait; no regression to The Last Watch.
5. Inspector can choose real NPC/quest/asset/item/cinematic IDs from existing registry; invalid references are blocked with specific diagnostics.
6. Graph drag/add/connect/delete/duplicate, pan/zoom, undo/redo and Save/reload work; conditional ports are visually distinct.
7. Cross links navigate to referenced Oswin in Map/Assets and cinematic in Cinematics, and back with selection preserved.
8. Structural validation catches invalid port types, dangling IDs, unreachable nodes, duplicate one-time actions and invalid cycles.
9. Existing manually authored quest/dialogue/rule projects load/migrate or remain editable through retained specialised panels. Never silently reinterpret unknown triggers.
10. Actual Chrome Play tests exercise the new graph with E interaction, item collection, cutscene skip/completion, save/reload and quest completion; TypeScript/CI and golden fixtures pass.

## Implementation strategy

- Inspect existing Story reference index, dialogue graph, quest sequences, rule groups, runtime event/condition/action helpers and project serializers.
- First build an adapter/typed graph node registry + rigorous tests; then the canvas and inspector; then running/progress/save integration. Preserve legacy authoring entry for unsupported subtypes until real parity.
- One lead agent owns graph/runtime/save integration. Subagents may own independent graph canvas UI and node catalogue/validation tests; avoid several agents changing core runtime and migration simultaneously.

## Out of scope

New generic Lua/JS scripting runtime, arbitrary code execution in node payloads, full multiplayer sync, creating inventory item art, visual HUD designer, fully automatic quest generation. Future AI can author **validated graph operations** but is not part of this PR.
