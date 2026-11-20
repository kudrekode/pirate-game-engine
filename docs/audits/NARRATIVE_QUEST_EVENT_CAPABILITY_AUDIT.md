# Narrative, Quest & Event Capability Audit

21 October 2026. Read-only product/architecture audit of current source, fixtures, tests and result reports. Only this requested document is created; production code, schemas, UI and test expectations remain unchanged.

## 1. Executive Summary

A substantial narrative engine already exists: quests with ordered or independent objectives, persistent flags/variables/inventory, rewards, NPC conversations, **player response choices and branching conversation links**, conditional response visibility, node-entry effects, world interactions and WHEN/IF/THEN/ELSE rules. Branching dialogue already runs in both adapters and has a dedicated form editor. Building that runtime from scratch would duplicate working contracts.

The smallest next layer is better authoring, reference validation and navigation over existing dialogue. Automatic state-conditioned greeting/next-line routing is genuinely absent; it should be a small explicit extension only if V1 promises that behaviour. Choices and node-entry actions do not need inventing.

The engine has event-condition-action rules, not a general executable graph. Five authored triggers drive nested AND/OR checks and ordered shared actions. Quest facts, rule triggers and adapter notifications are distinct vocabularies. A future graph should expose current semantics first, not create parallel state or a second event bus.

Current gaps include no per-objective completion hooks, no native internal quest branches, no generic NOT group, no generic-rule quest-status/objective predicate, and no working authored NPC-defeat trigger. Combat advances quests via a generated flag but bypasses the shared quest completion-action dispatcher. These are findings, not changes made here.

## 2. Current Architecture

| Owner | Authoritative source and responsibility |
| --- | --- |
| Authored contract | [game.ts](../../src/types/game.ts): GameProject, Interaction, DialogueDefinition, Quest, ObjectiveCondition, GameRule, ConditionExpression, GameAction, items, behaviours, progression |
| Isolated Play state | [runtimeSession.ts](../../src/runtime/runtimeSession.ts): cloned project, game/quest state, world sets, conversation cursor and pending interaction |
| Conditions/triggers/actions | [ruleEngine.ts](../../src/runtime/ruleEngine.ts): evaluators, matching, ordered rule/action execution |
| Integrated action context | [runtimeRuleActionDispatcher.ts](../../src/runtime/runtimeRuleActionDispatcher.ts): mutations, quest sync/completion actions, presentation requests |
| Quests and facts | [questEngine.ts](../../src/runtime/questEngine.ts), [questInteractions.ts](../../src/runtime/questInteractions.ts): latches, statuses, history, conversation-close/location observation |
| Dialogue | [dialogueEngine.ts](../../src/runtime/dialogueEngine.ts), [interactionMessages.ts](../../src/runtime/interactionMessages.ts): links/choices/entry actions; inline lines compile into temporary text nodes |
| World transactions | [runtimeObjectInteractions.ts](../../src/runtime/runtimeObjectInteractions.ts), [objectBehaviour.ts](../../src/runtime/objectBehaviour.ts), [inventory.ts](../../src/runtime/inventory.ts), [shopRuntime.ts](../../src/runtime/shopRuntime.ts) |
| Linear flow/startup | [runtimeProgression.ts](../../src/runtime/runtimeProgression.ts): spawn, transition, cutscene/trigger wait, area entry, end |
| NPC/combat | [npcResolver.ts](../../src/runtime/npcResolver.ts), [runtimeNpcTick.ts](../../src/runtime/runtimeNpcTick.ts), [runtimeCombat.ts](../../src/runtime/runtimeCombat.ts) |
| Adapters/HUD | [AdventureScene.ts](../../src/runtime/AdventureScene.ts), [ThreeRuntimePanel.tsx](../../src/runtime/three/ThreeRuntimePanel.tsx), [RuntimePanel.tsx](../../src/runtime/RuntimePanel.tsx), [QuestPresentation.tsx](../../src/runtime/QuestPresentation.tsx) |
| Persistence/validation | [gameSave.ts](../../src/runtime/gameSave.ts), [migrateProject.ts](../../src/data/migrateProject.ts), [validateProject.ts](../../src/data/validateProject.ts), [useProjectStore.ts](../../src/store/useProjectStore.ts), [App.tsx](../../src/App.tsx) |

Shared gameplay owns semantics without React/Phaser/Three dependencies. Adapters translate input, visuals and modal requests. Runtime mutations must not rewrite editor defaults.

### Evidence and historical reports

Read current AGENTS.md, README.md, ROADMAP.md, docs/RUNTIME_ARCHITECTURE.md and relevant portions of QUEST_OBJECTIVE_AUTHORING_RESULT.md, GAMEPLAY_INTERACTION_AUTHORING_RESULT.md, INVENTORY_ITEM_UX_RESULT.md, RUNTIME_PARITY_SAVE_GAME_RESULT.md and INTERACTION_ANIMATION_PROPS_V1_RESULT.md. Current source takes precedence. Earlier quest/interaction reports' statements that their milestones added no game saves are historical; current gameSave.ts persists progress. Static-chest descriptions predate animated-chest presentation. A report mentioning a defeat trigger does not override its absence from current RuleTrigger/matching/dispatch.

### References and IDs

References are plain strings, with typed discriminated unions around them, not branded IDs or a central narrative registry. Items/quests/shops/dialogues/cutscenes use definition IDs; objectives use area + placed target; generic rules use target ID without area; NPC actions use placed NPC IDs. Flags/variables use record keys. Dialogue links use local node IDs; responses have IDs too. Lookups are array find/filter or validation Sets.

Objective latches use questId:objectiveId. Facts JSON-encode [type, areaId, targetId]. Inline-message keys use areaId:targetId. These encodings and scopes differ. UI IDs use UUID-based or timestamp helpers depending on editor; comprehensive duplicate checking is absent. Stable IDs matter to both links and saves.

Dangling references generally fail checks, skip effects, show a status, end dialogue or leave objectives incomplete. Limited item/shop legacy fallbacks are not general repair. No automatic recreation of deleted quests is intended.

### Current validation

validateProject checks nonempty dangling references in rule triggers/trees/actions, progression, objective item/flag/variable/area/compatible target references, rewards/completion actions, shops, container contents, door destinations/items/locked cutscenes, object/NPC definitions, pickups, direct interaction item/destination/cutscene/flag fields, cutscene assets and tracked quest.

It does **not** traverse project.dialogues: starts, node/choice links, choice conditions and node actions lack that validation. checkInteraction also omits start_dialogue.dialogueId and direct open_shop.shopId. No general duplicate-ID, dependency-cycle, reachability or impossible-condition analysis exists. checkReference skips falsy IDs. Compatible target existence does not prove an interaction is enabled, reachable or emits a fact. Migration normalizes shapes/defaults, not story correctness. Save parsing is separately stricter about snapshot shape/references/revision.

## 3. Persistent Narrative State

A saved state value is not automatically an authored predicate.

| State / owner | Authored query/reference | Mutation | Saves? |
| --- | --- | --- | --- |
| runtimeState.flags | Named defaults; rule/dialogue flag_is, objective flag | set_flag true/false, flag interaction, rewards, pickup/container flags, generated defeat flag | Yes |
| runtimeState.variables | Number/string defaults; variable_compare in all three evaluators | Set/change actions, legacy rewards | Yes |
| runtimeState.inventory.items | Item/quantity conditions, door requirement | Give/remove, rewards, collection, buying | Yes |
| runtimeQuestState.quests status | Authored initial status; dialogue quest_status only | Activate/complete/fail, auto-complete | Yes |
| completedObjectiveIds | Objective IDs; quest/HUD internals, no general condition | Auto-latch or force whole quest complete | Yes |
| enteredAreaIds | Objective enter_area | Startup/transition observation | Yes |
| facts | Four historical objective predicates, not rule/dialogue leaves | Supported close/open/arrival/door transactions | Yes |
| rewardedQuestIds / completedActionIds | Internal once guards, no predicate | Quest reward/action dispatch | Yes |
| completedRuleIds | Rule once policy, no general predicate | True once rule after actions return | Yes |
| openedObjectIds | Container logic; objectives consume separate fact | Successful container use; optional openedFlag bridge | Yes |
| collectedPickupIds | Collection/discovery; optional collectedFlag bridge | Successful pickup/prop collection | Yes |
| defeatedNpcIds | Combat/discovery; conditions use flag or health | Combat defeat/removal | Yes |
| Runtime NPC attributes | Generic rule alignment/health conditions | Damage, health/alignment actions; other values from defaults/overrides | Yes |
| firedInteractionIds | Inline message once; no general predicate | Message preparation | Yes |
| Current area/player pose | Destinations authored; no arbitrary position/current-area predicate | Movement/spawn/teleport | Yes |
| Progression index/wait | Authored steps, no generic predicate | Linear progression | Yes |
| Shop stock | Purchase checks, no story stock predicate | Buying | Yes |
| Player health/mode/vehicle/equipped weapon; moved objects | Config/behaviour; no general narrative predicate | Existing gameplay transactions | Yes |
| Conversation cursor/entered nodes/pending interaction | Node IDs authored; no visited/talk-history predicate | Conversation start/advance/close | No |
| NPC movement/detection targets and timing, contact/attack clocks, recent enemy, arrows | Simulation state, not narrative variables | Tick/input | No |
| Durable door open/unlocked state | No native record | Recheck inventory each use; flags can gate rule-based teleport | Unsupported |

NPC wandering/patrol coordinates reset to authored positions on Continue; moved object coordinates persist. Opened/collected/defeated visuals are reconstructed from semantic state, not saved renderer objects.

## 4. Conditions

Complete current authored predicate vocabulary:

| Canonical name | Accepted values / meaning | UI and evaluator |
| --- | --- | --- |
| flag_is | Name + boolean; missing acts false | Logic/evaluateCondition; dialogue choices/evaluateDialogueCondition |
| variable_compare | Name + ==, !=, >, <, >=, <= + number/string literal | Logic, Dialogues, Quests; respective evaluators |
| has_item | Item ID + optional quantity, default 1; current quantity at least threshold | Logic, Dialogues, Quests; shared hasItem |
| not_has_item | Negation of that threshold, including insufficient quantity | Logic and Dialogues |
| npc_alignment | Placed NPC ID + friendly/neutral/hostile | Logic only |
| npc_health_compare | Placed NPC ID + comparison + numeric literal | Logic only |
| quest_status | Quest ID + inactive/active/completed/failed | Dialogue choices only |
| flag | Name + boolean, missing acts false | Quests only/evaluateObjectiveCondition |
| enter_area | Area ever entered | Quests only |
| interaction_completed | Remembered area/target fact | Quests only |
| container_opened | Remembered area/target fact | Quests only |
| enter_event | Remembered area/event fact | Quests only |
| door_used | Remembered area/object fact | Quests only |

Equality is strict; ordered comparisons require numeric operands. Missing variable/NPC attribute fails. No variable-to-variable arithmetic, string operators or existence/null predicate exists.

| Context | AND | OR | NOT | Nesting |
| --- | --- | --- | --- | --- |
| Rule conditionTree | Yes | Yes | No general operator; false flag, inverse comparisons, not_has_item only | Recursive AND/OR groups, supported in UI |
| Dialogue choice.conditions | All entries (every) | No explicit OR | Same specific inversions | Flat list |
| Objective.condition | One leaf only | No | False flag/inverse variable comparison only | None |
| Door behaviour | One required item, quantity 1 | No | No | None |

Missing rule tree and empty group pass, including empty OR (empty check runs first). Empty choice conditions pass. Flag absent and false are indistinguishable.

- Has Key AND Quest Active: directly possible on a dialogue choice, **not** one generic rule (no quest-status leaf). A maintained quest-state flag can bridge the latter.
- Has Key OR Guard Defeated: generic OR of has_item and flag_is(npc_defeated_<placedId>, true); declare that flag for convenient selectors. No dialogue OR.
- NOT Flag X: flag_is false (objective flag false), also passes for missing X.

Other gates are fixed gameplay checks, not extra authored predicates: activation mode, reach/facing/occlusion, canInteract, once/opened/collected/defeated eligibility, full-reward capacity, shop currency/stock, valid destinations, grounded/modal/cooldown/combat checks and a specific progression wait cell. They do not accept arbitrary narrative condition trees.

## 5. Actions

GameAction has exactly 15 variants. runAction/runActions and createRuntimeRuleContext execute them; Logic exposes all. Persistent effects below belong to session state.

| Canonical action | Semantics / validation |
| --- | --- |
| set_flag | Write named boolean; false clears logically, does not delete key. Runtime permits new keys; validator warns about undeclared nonempty names. |
| set_variable | Write number/string, same declaration-warning model. |
| change_variable | Add numeric amount; missing/nonnumeric value starts at zero. |
| give_item | Resolve item, add subject to stack policy; can partially grant/report overflow; limited empty-ID sole-currency fallback. |
| remove_item | Resolve item, subtract to zero/delete; insufficient quantity does not fail the action list. |
| activate_quest | Activate if lifecycle permits; missing quest no-op; no reset of latches. |
| complete_quest | Force complete/all objectives, rewards once, integrated sync dispatches completion actions; missing quest no-op. |
| fail_quest | Set failed; not a failure-condition/time-limit system. |
| play_cutscene | Present authored image/text and wait for dismissal; missing definition reports/skips. |
| teleport | Validate area/event and request shared transition; pose/area persist. |
| change_movement_mode | Set walk/sail/ride/drive; does not create vehicle ownership. |
| set_npc_alignment | Change placed runtime NPC alignment; missing NPC no-op. |
| set_npc_health | Clamp 0..maxHealth; does not invoke combat defeat/removal/flag transaction. |
| open_shop | Resolve shop; empty-ID sole-shop fallback; modal transient, purchases/stock persist. |
| end_game | Adapter ends gameplay; no durable event record. |

Actions run in array order with callbacks; matching rules run in project order. Cutscenes suspend remaining actions; shop opening returns immediately. State changes may settle quests **between actions**, so give-then-remove can latch an Obtain objective. Teleport can dispatch area rules before the parent list continues. Lists are ordered, not atomic.

Dialogue/quest/supported interaction completion reuse GameAction. A response sets a flag by targeting a node with entry actions; choices have no direct action array.

No generic show_message, start_dialogue, complete_objective, unlock_door, open_container, emit_event, run_rule or delay/wait action exists. RuntimeRuleEvent.dialogueRequested is a notification declaration, not an authored start-dialogue action. Direct interactions can start dialogue/messages; rules can present text via play_cutscene.

Separate executors support ten Interaction variants (section 12), container/door/sign/vehicle behaviours, five progression variants (play_cutscene, spawn_player, wait_for_trigger, teleport_player, end_game) and legacy QuestReward item/flag/variable effects. Do not expose these as interchangeable generic actions without their actual execution context.

## 6. Events / Triggers

### Complete authored RuleTrigger vocabulary

| Type | Actual source/match | Repetition |
| --- | --- | --- |
| on_game_start | New Game startup, before progression/initial quest sync | New sessions; Continue bypasses it |
| on_interact | Accepted use of structure/object/event/NPC; target ID match | Each accepted use, rules before direct behaviour |
| on_touch | Object/event touch entry dispatch; target ID match | Movement/entry transactions, not frame polling |
| on_area_enter | Final playable startup area and transition to different area | Re-entry; same-area teleport does not fire it |
| on_cutscene_end | Applicable authored cutscene dismissal; cutscene ID match | Each cutscene completion |

Placed pickups use a dedicated collection path **before rule dispatch**, not generic pickup on_interact/on_touch. NPC touch is not a touch rule path. Arrival objectives can observe any event cell, including spawn points.

Rules have enabled, optional runPolicy once/always, conditionTree, actions and elseActions. Missing policy repeats. Once marks completedRuleIds **after a true-condition action list returns**. False conditions may run ELSE repeatedly and do not consume once. No authored trigger cooldown exists. Multiple enabled matching rules run serially in project order, observing previous effects. Once guards save.

Inline message Interaction.once marks firedInteractionIds at preparation and saves. It is not a universal once wrapper for all interactions. Containers/pickups have their own once policies; quest rewards/completion actions have distinct guards. Node actions run once per node per conversation opening, not once forever.

### Other invocation sources

- Closing supported message/dialogue records interaction_completed and runs its completion actions. Direct flag interactions use the same completion path.
- Dialogue node entry invokes its action list.
- Successful container/pickup/shop transactions change inventory/state and synchronize quests.
- Allowed valid-destination door use records door_used and transitions; arrival records history/facts.
- Objective completion latches/advances; final quest completion runs quest completion actions through shared integrated sync.
- Flag/item/variable actions synchronize quests but do not broadcast generic mutation triggers.
- Continue restores state without replaying New Game/area-entry rules or acquisition/completion notifications.

No authored RuleTrigger exists for objective/quest completion, dialogue end, pickup success, container success, flag mutation, load or NPC defeat. Bespoke hooks/state observations are not generic triggers.

### Existing shared fact model

RuntimeQuestState.facts is the closest central gameplay-fact concept: a Set of JSON tuples [type, areaId, targetId], recorded by recordQuestFact.

| Exact fact kind | Producer | Consumer |
| --- | --- | --- |
| interaction_completed | finishQuestInteraction after supported conversation/message close or flag interaction | Matching quest objective |
| container_opened | Successful container transaction | Matching quest objective |
| enter_event | Location observation, valid transitions, final startup cell | Arrival objective |
| door_used | Allowed door with valid configured destination | Door objective |

This is durable bounded history, not an event queue/count/timestamp log. Repetition collapses into one fact. Facts observed before activation can satisfy later objectives and save. Generic rules/dialogue cannot query them directly. enteredAreaIds is separate history; flags/inventory/variables are current state. Combat uses a flag and defeated-ID Set instead of a quest fact. There is a useful fact boundary, **not a universal event bus**.

### Actual adapter event vocabulary

These notification unions communicate with adapters/HUD/visuals or request shared operations. A declared variant is not necessarily emitted or authorable.

| Union | Real variant names |
| --- | --- |
| RuntimeRuleEvent | status, flowLog, stateChanged, itemFeedback, inventoryChanged, questsChanged, questRewardsGranted, shopOpened, cutsceneRequested, dialogueRequested, teleportRequested, gameEnded, gameOver, movementModeChanged |
| RuntimeProgressionEvent | questAction, spawnPlayer, areaChanged, cutsceneRequested, status, flowLog, stateChanged, itemFeedback, inventoryChanged, questSync, questsChanged, triggerWaiting, areaEnterTriggerRequested, vehicleLeft, endGame |
| RuntimeObjectInteractionEvent | questAction, objectCollected, containerOpened, status, flowLog, stateChanged, itemFeedback, inventoryChanged, questsChanged, cutsceneRequested, teleportRequested, shopChanged, shopClosed, pickupCollected, vehicleBoarded, vehicleDismounted, movementModeChanged, objectMoved, playerMoved |
| RuntimeCombatEvent | attackStarted, attackBlocked, npcDamaged, npcDefeated, npcRemoved, flagChanged, declared triggerRequested, status, stateChanged, combatChanged, itemFeedback, inventoryChanged, questsChanged, flowLog |
| RuntimeNpcTickEvent | npcMoved, npcBlocked, npcFacingChanged, enemyDetectedPlayer, enemyLostPlayer, enemyTouchedPlayer, playerDamaged, gameOver, combatChanged, stateChanged, status, flowLog |

In particular triggerRequested/on_npc_defeated is declared, but defeat does not emit it and RuleTrigger/matching/editor do not implement it. Existing runtimeCombat tests explicitly reject emission of triggerRequested. There is no universal itemObtained/flagSet authored event.

### Is an event graph runtime already present?

**Event-condition-action rules: yes. General graph execution: no.** Already authorable: WHEN interact with guard, IF has_item(key) OR flag_is(npc_defeated_guard,true), THEN teleport, ELSE play locked cutscene. A visual rule view can expose this directly. There is no arbitrary node invocation/custom event, parallel join, scheduled task or graph-local execution context.

### Cycles / loops

Shared quest sync guards re-entry and marks quest completion actions before executing them. Reward/action once sets make ordinary A-completion-starts/completes-B-starts/completes-A chains settle without repeated rewards. This is not dependency-cycle validation or restart semantics.

Flag changes do not trigger generic flag listeners, so two flag-setting rules do not inherently recurse. Teleport/area-entry chains can recursively dispatch, and cutscene-end rules can request the same cutscene again. There is no global cycle/depth protection. Once is marked after actions return, so it is not a reliable recursive re-entry guard before then. Dialogue links can loop; user input advances them and per-opening entered-node guards suppress repeat actions. No validator proves termination/reachability.

## 7. Quest Model

Concise representation of actual fields, using illustrative IDs:

```ts
{
  id: "harbour", name: "Harbour Trouble", description: "...",
  status: "inactive", // inactive | active | completed | failed
  objectiveMode: "sequence", // absent = legacy independent
  completionMessage: "You gained access to the shack.",
  objectives: [
    { id: "talk", description: "Talk to the Keeper",
      condition: { type: "interaction_completed", areaId: "area_main", targetId: "keeper" } },
    { id: "key", description: "Find the key",
      condition: { type: "has_item", itemId: "key", quantity: 1 } }
  ],
  completionActions: [{ type: "set_flag", flag: "harbour_done", value: true }],
  rewards: [] // legacy item / flag / variable effects
}
```

A quest has stable ID/name/status, descriptions, multiple objectives and completion effects. An objective has stable ID, player text and exactly one condition. No optional objectives, alternate completion sets, internal branch edges, per-objective actions or objective counters exist.

New UI quests are inactive/sequential. Explicit At Play start, an interaction Start Quest selector, a dialogue node, generic rule or another quest's completion action can activate them. Only active quests auto-progress. Zero-objective quests do not auto-complete. Final completion latches every objective, grants rewards once and dispatches completion actions through shared integrated sync. Completion message is nonblocking notification text, not a mandatory conversation.

Failure exists via initial failed status or fail_quest, not a fail-condition/time-limit system. Sequential activation permits only inactive -> active, so failed/completed sequences do not restart. Legacy independent quests can reactivate from failed/completed but retain latches/reward/action guards; this is not reset/replay. complete_quest can bypass objectives; fail_quest can overwrite other statuses.

Migration preserves absent mode as independent and does not recreate deleted quests. Legacy rewards convert into shared actions when no explicit completionActions array exists. With an explicit array, the legacy rewards list remains separately supported: manually containing both can execute both, without guaranteed deduplication.

## 8. Objective Types

| Exact type | Label / fact that completes it |
| --- | --- |
| interaction_completed | Talk / Examine: remembered supported close/completion for exact area/placed target. No separate Talk versus Examine verb enum. |
| has_item | Obtain Item: current inventory meets quantity when evaluated, not historical acquisition. |
| container_opened | Open Container: successful transaction for exact area/object. Failed capacity/missing reward and empty repeat do not create success. |
| enter_event | Enter Area / Arrival point: reached exact event cell, including valid transitions/final spawn observation. |
| door_used | Use Door: allowed use with valid destination records source area/object. Owning key or destinationless opening alone is insufficient. |
| flag | Set Flag: current named boolean equals value, not necessarily a new mutation. |
| variable_compare | Current numeric/string variable passes comparison. |
| enter_area | Area is in remembered enteredAreaIds. |

No native Defeat/Kill objective exists: use flag npc_defeated_<placedId> == true. No direct quest-status/objective-complete predicate or condition tree exists inside an objective.

## 9. Quest Sequencing

Sequence evaluation walks objectives, skips latched ones, latches passing ones and stops at first unmet condition. Later steps do not latch ahead of a blocker. Several may complete in one sync when already satisfied. Normally only the first incomplete step is active. With absent mode, all incomplete objectives are independently eligible in an active quest; all remain required.

- Talk -> Obtain -> Arrival: conversation close starts quest; that same fact satisfies Talk.
- Obtain key and reach arrival before Talk: remembered arrival plus still-owned key can complete the chain when Talk activates it.
- Obtain then lose key before its blocked step activates: Obtain remains incomplete; inventory is current evidence.
- Complete Obtain then lose key: it stays latched.
- Flag true then false before eligibility: old value is not remembered, unlike interaction/open/arrival facts.

Multiple quests may be active. Rewards can satisfy other quests and evaluation repeats until those completions settle. Independent objectives can have several active steps; sequential quests expose one current step. Optional/alternative branches need explicit flags/separate quests or new semantics, not a hidden objective dependency mechanism.

## 10. Dialogue Model

Two authored entry experiences share one engine:

1. Map Inspector show_message: one/multiple ordered lines, one optional speaker, prompt/activation/once and supported completion actions. prepareInteractionMessage produces temporary linked text nodes. This simple form is linear.
2. **Dialogues tab**: definition/start selection; text/choice/end nodes; next and response targets; speaker/portrait; conditional responses; actions on enter. Map Inspector Advanced interaction assigns start_dialogue with its dialogue ID.

Text nodes have one optional next. Choice nodes display available player responses and route by targetNodeId. End nodes can display text/actions and close on advance. **Authored player choice and branching links exist.** Speaker strings/portrait IDs attribute lines; no typed NPC/player speaker role or entity speaker reference exists. Response labels represent player options.

Choice conditions read flags, variables, inventory and quest status, all ANDed. Conditional response visibility can lead to different lines, but there is no condition node, conditional text field, automatic start/next selection or first-matching fallback resolver. Every reopening starts at the same startNodeId. A conditioned response can route to a post-quest line; an NPC does not automatically choose a new greeting.

Node actions execute before rendering once per node per conversation opening. Loops do not repeat entry actions in that opening; reopening resets enteredNodeIds. Choices have no actions themselves: point to action-bearing nodes. Persistent flags/items/quest changes remember decisions; cursor/visited nodes do not save. No graph-local variables, visited-choice predicate or resumable conversation stack exists.

Both adapters block ordinary movement/combat and NPC simulation during dialogue. Clicking a response chooses it; E/Enter advances non-choice nodes; Escape closes. Next/End/Close buttons finish at absent/end targets; missing links terminate. No-available-choice paths offer close fallback. Closing a pending conversation calls finishQuestConversation, including early Escape: this counts Talk/Examine and runs completion actions, not a distinct cancelled outcome. Executed node effects are not rolled back.

advanceDialogue itself does not recheck choice availability; Three validates in advanceConversation, while Phaser exposes filtered response UI. A future editor should preserve/test this boundary, not infer an unimplemented shared condition tree.

## 11. NPC Integration

npcResolver combines definition defaults and instance overrides. NPCs support inline or referenced branching conversations; their close can satisfy Talk. Nodes or on_interact rules give items/start quests. Inspector Start Quest runs after supported close, while generic NPC interaction rules run before direct interaction, so their gifts are not delayed until dialogue ends.

Flags/items/quests can affect response availability. Automatic greeting replacement is absent. A talked flag set by node/completion actions can support future memory; the interaction fact also remembers Talk for quests, but dialogue cannot query that fact directly. Defeated NPCs are removed: another NPC can react to the flag, while the defeated instance cannot continue talking.

Stationary/patrol/wander movement can coexist with quest targets and dialogue; no new quest-linked movement engine is needed. Modal dialogue pauses movement. No narrative action changes patrol paths or assigned dialogue dynamically. Runtime health/alignment changes preserve editor defaults. Rule-set health zero is not combat defeat.

## 12. Interaction Integration

Exact Interaction.type vocabulary: show_message, object_behaviour, collect_item, area_link, teleport, play_cutscene, start_dialogue, open_shop, set_flag, change_movement_mode. Activation modes: on_touch/on_interact/both/disabled, constrained by target support.

| Capability | Reads | Writes / triggers / quest overlap |
| --- | --- | --- |
| Examine / Message | Lines/speaker/once/fired IDs | Temporary dialogue; close records interaction_completed and completion actions, can start quest |
| Container | Contents/capacity/once/opened flag or set | Full grant after preflight, opened set/optional flag, container_opened fact, quest sync |
| Door behaviour | Required item quantity 1, valid destination | Retains key, records door_used, transition/arrival facts/history |
| Direct area_link/teleport | Destination | Shared transition/arrival; no lock state or automatic door_used fact |
| Pickup prop / placed pickup | Item/capacity/collected state | Inventory/collected state/optional flag; once prop removed from cloned world; ownership objectives sync |
| Referenced NPC dialogue | Definition/current response conditions | Node actions; close interaction fact/completion effects |
| Event block | One-cell position, interaction/legacy link, rule eligibility | Touch/use rules; message/flag/transition; arrival fact separately |
| set_flag interaction | Named flag/value | Flag write plus finishQuestInteraction/completion actions/sync |
| Cutscene / sign | Referenced cutscene or sign text | Modal; authored cutscene dismissal may trigger on_cutscene_end; not automatically Talk/Examine |
| Shop | Shop/currency/stock | Buy inventory/stock, quest sync; shop modal transient |
| Movement mode / vehicle | Config/eligibility | Mode/vehicle state, not conversation completion |

**Common schema field does not imply a universal hook.** Interaction.completionActions is typed on every interaction, but adapters call finishQuestInteraction for closed messages/referenced dialogues and direct set_flag only. Doors, containers, pickups, shops, movement-mode changes and direct cutscenes do not universally execute attached completionActions. JSON cannot fill that wiring gap. Dedicated world transactions emit their own success facts.

Event blocks are one-cell entry points/zones, not arbitrary resizable regions. General rules can augment interaction, but do not automatically cancel a target's subsequent direct behaviour: a conditional teleport rule should not be combined with an unconditional door transition and assumed to gate it.

## 13. Inventory / Item Integration

Inventory is player item-ID quantities; no NPC inventory, ownership transfer ledger or item-instance identity exists. Item categories include key/currency/consumable/quest/misc/weapon; optional weapon reference supplies weapon behaviour. Quest items remain ordinary quantities and can be removed.

Thresholds support rules, responses, objectives and doors. Node/actions, rewards, containers, pickups and buying mutate the same inventory. remove_item floors at zero without failing a multi-action list. Generic grants can partially fill stacks/report overflow; containers/pickups preflight the whole reward and leave it available if it cannot all fit. These reward semantics differ deliberately.

Door keys are retained and require quantity 1. A consume-key sequence can be manually orchestrated using checks/remove/teleport, but is not a native door field. No universal acquisition event is emitted. Obtain objectives read current inventory then latch permanently. Shops provide selectable purchase menus that change state, but dialogue choice support comes from actual DialogueChoice, not inference from shops.

## 14. Combat Integration

Shared melee/projectile damage uses damageRuntimeNpc. Defeat adds defeatedNpcIds, sets npc_defeated_<placedNpcId> true, removes NPC/collision source and clears movement/contact state. Notifications include npcDefeated/flagChanged/npcRemoved. A flag objective advances on defeat; responses/rules can check its flag, rules can also check health.

The generated flag is not automatically added to authored defaults: selectors/validation may require declaring that exact name. No native Kill picker exists. There is **no working authored on_npc_defeated trigger**, despite the unused notification declaration.

Static integration finding: combat syncQuestProgress calls updateQuestProgress directly, rather than updateSessionQuestProgress. It can complete the quest/latch objectives and grant legacy rewards, but bypasses modern completionActions dispatch. Those effects can remain pending until another transaction reaches shared sync. This limits immediate defeat -> completion -> next-quest/effect guarantees. No fix or fresh interactive reproduction is claimed by this audit.

## 15. Save / Continue

Editor project Save/export serializes authored defaults through store/migration/JSON. Runtime game Save is a separate version-1 snapshot under adventure-builder-game-save-v1:. Identity hashes authored content except active editor area; edited revisions can invalidate Continue even when metadata.version is unchanged.

| Category | Save/Continue classification |
| --- | --- |
| Quest statuses / objective latches | Persisted; not inferred only from current values |
| Flags / variables / inventory | Persisted, including branch/defeat flags |
| Opened containers / collected pickups/props / NPC defeat/attributes | Persisted; world availability reconstructed |
| Entered areas / four quest fact kinds | Persisted |
| Rule/message once / quest reward/action guards | Persisted |
| Progression index / waiting trigger | Persisted |
| Current area/player pose/health/mode/vehicle/equipment / moved objects | Persisted |
| Shop stock | Persisted; open shop UI transient |
| Dialogue cursor/entered nodes/inline definition/pending interaction | Transient, excluded; Save rejected during dialogue |
| Notification event queues/logs/animation/arrows/deadlines | Transient |
| NPC patrol/wander position/timing | Reinitialized from authored scene |
| Native door unlocked/open state | Unsupported; inventory/flag gates persist indirectly |
| Arbitrary region/graph-local state | Unsupported |

Continue validates format/version/references/revision, reconstructs Sets and removed entities, resets transient simulation and initializes inventory/quests silently. It does not replay game-start/initial-area rules or reward notifications. Save rejects modal/startup/quest-sync/airborne/dead states; adapters additionally gate asynchronous presentation. No active conversation or pending action continuation is serialized. Authored project validation and strict game-save validation are separate concerns.

## 16. Existing Authoring UX

| Capability | Current editor |
| --- | --- |
| Inline NPC lines / Examine | Map Inspector -> Properties & gameplay -> Interaction; ordered lines, speaker, activation, prompt |
| Branched conversations | Dialogues tab: definition/start/node list, next/choice links, response conditions, speaker/portrait, entry actions |
| Assign dialogue definition | Map Inspector Advanced interaction -> Start dialogue selector |
| NPC attributes/patrol/overrides | NPC definitions / placed NPC Inspector; shared default-instance resolution |
| Quest/objectives | Quests tab: start status, sequence/Independent (legacy), named target selectors, reorder/delete, completion text/actions, tracked quest |
| Start quest after talking/examining | Map interaction Start Quest selector for message/flag/referenced dialogue |
| WHEN/IF/THEN/ELSE rules | Logic tab / ProgressionEditor: recursive groups, folders, enabled/once, full generic action list |
| Linear startup flow | Logic/progression: cutscene, spawn, wait for event, teleport, end |
| Flags/variables/default inventory | Game State editor; conditions/actions reference names |
| Item/shop definitions | Items and Shops editors; named reward/requirement selectors |
| Containers/keyed doors/prop pickups | Contextual map interaction fields; advanced ObjectBehaviourEditor supports multi-content/repeating/openedFlag configuration |
| Pickups/entry events/triggers | Map tools/Inspector; single event cells, not volume authoring |
| Cutscene image/text | Cutscenes editor |
| Quest HUD | Shared current-objective tracker and nonblocking New Quest/Objective Complete/New Objective/Quest Complete messages; tracked quest with active fallback; existing Phaser quest list |
| Project and gameplay persistence | Separate editor Save/export and Play Save Game/Continue controls |

### Runtime-existing capabilities requiring JSON or another workflow

Logic exposes all 15 GameAction variants. Other forms are incomplete:

- Dialogue selector offers set_flag, give_item, remove_item, activate_quest, complete_quest, play_cutscene, teleport, open_shop, end_game. It omits variable actions, fail_quest, movement mode and NPC actions despite runtime support on imported nodes. Teleport is offered **without destination fields in renderAction**, so its area/event must be configured outside that form.
- Quest completion selector offers item/flag/variable/cutscene/activate/complete/fail quest/teleport/shop actions; movement mode, NPC actions and end_game are runtime-supported but absent there.
- Supported interaction completion exposes a single Start Quest convenience selector, not a full action list. More effects require JSON or restructuring into dialogue nodes/rules. That does not make completionActions work on unsupported interaction variants.
- Defeat objectives need a correctly named generated flag rather than a friendly Defeat selector.

The present authoring fragmentation is substantial, but it is not a lack of branching choices, rule composition or quest sequencing.

## 17. Runtime vs Editor Gaps

| Finding | Classification |
| --- | --- |
| Choice branches, conditioned responses, node-entry actions | Runtime and form UI exist; visualization/navigation can improve |
| Nested generic AND/OR, ordered effects, ELSE | Runtime and UI exist |
| Sequence/independent objectives | Runtime and UI exist |
| Full action editing in dialogue/quest/interaction forms | Executor support exists in applicable contexts; UI partial |
| Automatic conditional conversation start/next line | Runtime missing; canvas alone cannot supply it |
| Dialogue OR/nesting; generic rule quest-status/objective/history checks | Missing in those evaluators, despite related support elsewhere |
| Per-objective completion hooks | Runtime missing; whole-quest hook is different |
| Defeat flag objective | Runtime supported, UI awkward |
| Defeat generic trigger / immediate modern completion effects after combat | Missing trigger wiring / existing synchronization gap |
| Narrative reference/dependency navigation and robust diagnostics | Editor/validation gap; string-link execution already exists |
| Mid-conversation Save/resume | Unsupported; saved choice effects already work |

### Actual demo: Tidewatch Harbour / Harbour Trouble

Inspected selected narrative fields in [the quest showcase JSON](../assets/quest-objectives/tidewatch-harbour.project.json). It has one quest, no authored DialogueDefinition entries, no generic rules, empty initial flags/variables/inventory, and a spawn-only progression. It demonstrates inline dialogue rather than branching.

1. Spawn in area_main at Entry / area_main_spawn (9,8).
2. Optional sign: “Tidewatch Harbour — Traders, sailors and questionable cargo welcome.” Barrel: “Smells strongly of rum.” Quayside (9,6) shows “The eastern quay. Mind the loose boards.” once.
3. Harbour Keeper (npc_instance_108eda9c) says “Storm did a number on the pier.” then “If you're heading inland, keep hold of that key.” Close invokes activate_quest(quest_339d93c5). The same interaction fact completes Talk to the Harbour Keeper.
4. Chest object_instance_f54636e7 gives Harbour Key x1 (item_2af528dd-f6d2-4ff1-961f-07325a8ae67d), once. Find the Harbour Key completes; Enter the shack becomes current.
5. Shack object_instance_1f05d35f requires/retains the key and transitions to Shack interior, eventBlock_6f4efe3c-7828-4e0d-b978-d55d8c12f241 at (5,4), **in the same area**, not a separate interior map.
6. Arrival completes quest. Message: “You found the key and gained access to the shack.” Actual fixture rewards/completionActions are empty; no extra reward/next quest is secretly authored.

The interaction/world-kit fixtures are separate earlier baselines. Current animation demo adds presentation without adding new narrative contracts.

### Existing tests inspected

[dialogueEngine.test.ts](../../src/runtime/dialogueEngine.test.ts) exercises Yes/inventory-gated options, branch navigation, entry actions once per opening and quest activation. [questAuthoring.test.ts](../../src/runtime/questAuthoring.test.ts) tests the Talk/key/arrival chain, early facts, current inventory versus latches, real container/door success, startup boundaries and migration. [questEngine.test.ts](../../src/runtime/questEngine.test.ts) and [ruleEngine.test.ts](../../src/runtime/ruleEngine.test.ts) exercise condition/composition/action contracts. [gameSave.test.ts](../../src/runtime/gameSave.test.ts) continues the actual Harbour route, preserves guards/defeat and resets transients. [questAuthoring.test.tsx](../../src/test/questAuthoring.test.tsx) and [interactionInspector.test.tsx](../../src/test/interactionInspector.test.tsx) mount authoring controls. These prove specific contracts, not every cross-system story combination.

## 18. Expressiveness Matrix

YES = already authorable, including explicit flag/item bridges. PARTIAL names awkward or incomplete authoring and/or the broader interpretation needing new semantics. NO would require new semantics outright. Conditional responses are distinguished from automatic line routing.

| # | Scenario | Verdict | Evidence/limit |
| --- | --- | --- | --- |
| 1 | Talk to NPC to begin quest | YES | Start Quest after close or node activate_quest |
| 2 | NPC gives an item | YES | Node give_item or NPC interaction rule |
| 3 | Different dialogue if player owns item | PARTIAL | Conditioned responses route to different lines; automatic greeting/line selection absent |
| 4 | Choose between two responses | YES | Choice node, two links, rendered in both adapters |
| 5 | Choice sets flag | YES | Selected response targets node with set_flag |
| 6 | Choice permanently changes later dialogue | PARTIAL | Saved flag changes response availability/paths; automatic later greeting absent |
| 7 | Three sequential objectives | YES | sequence mode; actual Harbour fixture |
| 8 | Two objectives in either order | YES | Independent (legacy) mode in Quests; both required |
| 9 | Door only after quest completion | YES | Completion grants exclusive key; door requires it. No direct quest-status door leaf |
| 10 | Kill NPC to progress quest | YES | Generated defeat flag objective; immediate completion-action caveat in section 14 |
| 11 | Enter region to progress quest | PARTIAL | Event cell or whole area works; arbitrary region/volume absent |
| 12 | Examine object to discover quest | YES | Message plus Start Quest on close |
| 13 | Completing quest starts another | YES | completionActions activate_quest; combat sync caveat applies |
| 14 | Quest reward gives item | YES | give_item completion action, also legacy reward |
| 15 | Choose mutually exclusive quests | YES | Unchosen-flag-conditioned responses; each sets branch flag and activates one quest. Author-enforced, not native constraint |
| 16 | NPC remembers prior conversation | YES | Explicit talked flag and later response conditions; no automatic history predicate |
| 17 | Dialogue changes after NPC defeat | PARTIAL | Another NPC's responses query defeat flag; automatic routing absent and defeated NPC removed |
| 18 | One trigger, multiple actions | YES | Ordered rule actions array |
| 19 | Trigger uses multiple requirements | YES | Recursive AND/OR over six supported generic leaves; no quest/objective leaves |
| 20 | Branch survives Save/Continue | YES | Flags/items/quests persist; active conversation cursor does not |

No NO result is manufactured merely because there is no canvas. Broader automatic/region interpretations are explicitly PARTIAL rather than claimed as fully implemented.

## 19. Overlap / Duplication

- Rules, node entry, quest completion and supported interaction completion share GameAction but have different forms/hooks. Reuse the executor.
- Rule/dialogue/objective evaluators repeat flag/item/comparison logic but expose different leaf sets/composition. A palette must respect context.
- Door required-item checks overlap inventory predicates; rule teleport can approximate a gate but does not automatically record door_used or physical door state.
- Inline message nodes reuse dialogue, not a second conversation engine.
- Legacy rewards overlap actions; migration bridges them but both may coexist.
- Facts, opened/collected/defeated sets and bridge flags overlap historically but differ in consumers/save roles.
- Linear progression overlaps cutscene/teleport/end actions while retaining index/wait/startup semantics.
- CamelCase adapter events overlap conceptually with snake_case authored triggers/facts; notification declarations are not authorable hooks.
- Once exists at rule/message/container/pickup/quest/node scopes, each with distinct mark/reset timing.

These are opportunities for future coherence, not requested refactors.

## 20. Missing Runtime Semantics

Genuinely absent, rather than merely hidden UI:

1. Automatic conditional conversation entry/next routing or line selection, with fallback semantics.
2. Dialogue condition OR/nesting/general NOT; direct generic-rule quest-status/objective/fact checks; objective condition composition. These are context gaps, not missing conditions altogether.
3. Per-objective completion effects, optional/alternative objective sets, native quest branch/dependency/exclusivity constraints.
4. A reset/repeat lifecycle that clears latches and defines reward/action replay.
5. Generic lifecycle/mutation triggers for defeat, pickup/container success, dialogue outcome, objective/quest completion, flag mutation and load. Some have bespoke facts/completion hooks already.
6. Generic dialogue/message/custom-event actions; graph-local variables, invocation context, timers/waits/joins/subgraphs. These are absent but not automatically requirements for the next milestone.
7. Typed speaker roles, explicit visited-choice/conversation-history predicates, cancellation distinct from completion, resumable conversation state.
8. Arbitrary spatial regions/volumes and native durable door lock/open state.

Player choices and branching links are **not missing**. Mutually exclusive outcomes can already be authored with flags/conditioned choices; enforced quest constraints are missing. Cycle/reference diagnostics are validation capability, not a replacement runtime. Combat completion sync is an integration defect, not justification for a new quest engine.

## 21. Missing Authoring UX

Runtime-existing capabilities would benefit from:

- A connected view of existing dialogue start/next/choice links, conditions and entry actions, writing the same DialogueDefinition.
- Validation/navigation for starts, links, action references, stale entities, unreachable nodes and no-available-choice outcomes.
- Full action field coverage, especially dialogue teleport destinations and omitted action variants; context-aware reusable action forms.
- General action-list editing for supported interaction-completion contexts, beyond Start Quest.
- Named defeat/remembered-state conveniences and clear references to generated flags.
- Cross-reference inspection for map targets, dialogues, rules, objectives and completion actions, with consistent deletion warnings.
- Visible current-state versus historical checks; sequence versus independent progress; once lifetimes and timing.
- Preview/debug explanations using current evaluators, rather than a second preview logic engine.

These are fragmented authoring tasks over existing semantics. Many do not require manual JSON today.

## 22. Branching Dialogue V1 Recommendation

**Minimum new runtime for basic branching dialogue: zero.** Choices, branch links, conditions, speakers and shared entry actions already work. First improve their discoverability, complete editing fields and validate references. A visual editor should read/write current DialogueDefinition, preserve IDs and round-trip through migration/project JSON.

If V1 promises an NPC automatically changes greeting after a key/quest change, the smallest genuine new semantic is deterministic conditional routing at entry or between nodes, with explicit fallback/loop policy. Define that acceptance criterion before schema changes. Reuse existing effects/predicate semantics where applicable, without pretending flat dialogue lists already accept rule trees.

Keep decisions in existing flags/variables/quests/inventory and current Save/Continue. Graph-local persistence is unnecessary merely to remember Yes/No. Make node-entry effects and per-opening action guards visible, including repeated conversations/shared target nodes. Fix reference and form coverage before promising robust authoring.

## 23. Quest/Event Graph Recommendation

**Yes, potentially as an optional authoring view over current rules/actions/references, after dialogue and integration gaps. Keep dialogue flow and world-event rules as distinct semantic views.** A unified new execution graph would duplicate working systems and obscure their lifetimes.

Derived layers:

| Layer | Existing boundary |
| --- | --- |
| Current state / durable history | Runtime game state, world sets, narrow quest facts; history differs from notifications |
| Predicates | Existing condition unions/evaluators, with context-specific support |
| Effects | GameAction plus explicit world transactions |
| Invocation | Five RuleTrigger variants, supported completion hooks, progression waits |
| Dialogue flow | Links/choices and per-opening cursor/entry guards |
| Quest flow | Long-lived status, order/latches, completion guards |
| Presentation | Modal/HUD/animation requests and adapter input |

An event view can initially show WHEN -> IF -> THEN/ELSE without introducing execution. A quest dependency view can connect objective targets and completion actions while preserving the current quest editor/model. Add predicates/hooks only for demonstrated stories. No library, canvas or node-colour design is needed for this decision.

## 24. Recommended Implementation Order

1. **Existing dialogue authoring/validation pass.** Expose current branching clearly, complete action fields, validate references and preserve save/runtime contracts. Future acceptance should include authored choice -> flag -> later conditional response -> Save/Continue.
2. **Transaction consistency pass.** Verify and correct combat-to-quest completion-action dispatch, guard/re-entry behaviour and deliberately resolve unused defeat-trigger declarations. Separate future change, not implemented here.
3. **Small automatic dialogue-routing extension only if required.** State-conditioned greeting/next path with explicit fallback; reuse existing semantics where appropriate.
4. **Optional event-rule/dependency graph view.** Visualize current rules and references; improve quest navigation. Introduce new hooks one concrete requirement at a time.
5. **Cutscene integration later.** Image/text cutscenes and suspending shared actions already exist. Broader cinematic actor/camera/timing orchestration needs its own acceptance criterion, not inclusion by assumption.

ROADMAP.md already treats optional node-based rule viewing as later work. Planned scope is not evidence existing player-choice execution is absent.

## 25. Bottom Line

Build a small authoring layer over the narrative engine already present: **make existing branching dialogue understandable, complete and validated**. Add automatic state-conditioned routing only when explicitly required. Preserve shared actions, quest latches, current facts and Save/Continue.

A Quest/Event Graph should follow demonstrated authoring needs and initially expose existing rules/references, without duplicate state, a second quest engine or parallel event bus.

### Verification for this audit

- Source, focused test implementations, fixture fields and relevant reports inspected; historical browser results are not claimed as new passes.
- Required npm.cmd run ci invoked once: **103 test files passed, 1 failed; 887 tests passed, 1 failed**. The failure was the unchanged 5-second timeout in src/test/characterGameIntegration.test.tsx:61 (assign/place/duplicate/edit/delete/save workflow). CI stopped before its build/compiler stages.
- Reran only that affected test file, at unchanged limits: **2 passed, 1 timeout again**. No production/test changes were made to address an unrelated document-audit failure. No full-CI rerun or additional expensive suites.
- No browser, visual/performance or Blender matrix run for this document-only audit.
- git diff --check passed. The new document also passed git diff --no-index --check against /dev/null. Worktree review showed only this new audit document; no production or test diff.
