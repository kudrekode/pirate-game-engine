# Narrative Authoring UX Audit - Towards Scratch-Like Story Building

21 October 2026. Documentation-only product, UX and architecture audit of the current working tree, including the existing Dialogue Graph changes. No editor, schema, runtime, library or prototype implementation is part of this audit.

## 1. Executive Summary

Story creation feels complicated because the author must coordinate several independently useful editors, remember when their effects run, and translate between different meanings of "condition", "interaction" and "completion". The primary problem is **connecting content and explaining its semantics**, not a lack of branching dialogue or a need for a universal scripting runtime.

Recommend **C: Hybrid**. A Story Workspace should bring named world entities, references, recipes and contextual controls together, while Dialogue retains conversation topology, Quests retains objective sequences, and Logic retains event/condition/action rules. All views edit the existing authoritative contracts. A relationship line between a chest and an objective must never pretend to be an executable wire.

The best next bounded pass is **extend the existing Dialogue Graph with an entity/reference palette, contextual condition/action chips, inline creation and direct placed-NPC assignment**. This attacks the sample's largest concentration of repeated wiring while reusing a working graph. A standalone rule canvas alone would leave the quest-giver, item, state and assignment journeys fragmented.

Three qualifications prevent an attractive but misleading recommendation:

- Current selectors often already show names. The baseline is not "type every UUID". The bigger cost is repeatedly finding the same entity, choosing the right representation, and knowing which editor owns the effect.
- A normal container has no permission condition. A preceding IF rule does not cancel its built-in behavior. A rule-driven chest-shaped prop can approximate the reward, but does not become a real opened container.
- Dialogue conditions control **player response availability**. They do not automatically change the opening greeting. Generic rules also lack both `start_dialogue` and `show_message` actions. These are semantic boundaries, not styling problems.

### Evidence and method

This is a source-traced authoring walkthrough, not a timed usability study or a newly performed browser authoring session. Counts below describe an explicit reproducible design and the controls required to author it; ranges allow for defaults, duplication and existing assets. No sample project was created. Existing reports/tests support interpretation, but their historical browser passes are not fresh evidence.

Primary evidence:

- [Authoritative schema](src/types/game.ts), [routing instructions](AGENTS.md), [overview](README.md), [roadmap](ROADMAP.md), [runtime architecture](docs/RUNTIME_ARCHITECTURE.md).
- [Dialogue editor](src/editor/sections/DialogueEditor.tsx), [graph](src/editor/sections/DialogueGraph.tsx), [graph transformations](src/editor/sections/dialogueGraphModel.ts), [action fields](src/editor/sections/DialogueActionFields.tsx).
- [Logic editor](src/editor/sections/ProgressionEditor.tsx), [Quests](src/editor/sections/QuestsEditor.tsx), [Map Inspector](src/editor/sections/MapInspector.tsx), [contextual interactions](src/editor/sections/EntityInteractionEditor.tsx).
- [Earlier capability audit](NARRATIVE_QUEST_EVENT_CAPABILITY_AUDIT.md), [Dialogue Graph result](DIALOGUE_GRAPH_EDITOR_V1_RESULT.md). The earlier audit's missing dialogue validation/incomplete dialogue action fields are **superseded**: current code validates dialogues and edits all 15 actions, including teleport destinations. Its runtime distinctions about triggers, conditions and automatic routing remain relevant.

## 2. Sample Story - Current Authoring Journey

### Scope, exactness and starting point

Start with a working walkable Village area and its existing player spawn/startup configuration. Art creation, terrain painting and optional portraits are excluded. Entry means starting at the village entrance; actual travel from another area would additionally require a source area and link. Gate use is an item-locked door transition to an arrival point beyond it, within the same area, with a layout that permits walking back to Guard. This measures successful gate use, not the construction of a sealed physical enclosure. A permanently opened physical gate/collider is not supported by this door contract.

The following is the closest straightforward authorable route using current UI, with two explicit compromises: a **rule-driven reward prop** instead of a permission-gated native container, and **state-conditioned responses** instead of an automatically changed greeting. An exact literal implementation of all requested behavior is unavailable today. Metrics must not disguise this.

Names in backticks below are audit aliases for generated IDs, not instructions to hand-enter them: `guardDef`, `guardPlaced`, `chestDef`, `chestPlaced`, `gateDef`, `gatePlaced`, `key`, `quest`, `conversation`, `gateArrival`, `chestRule`, `deniedScene`, `foundScene`, `village`. Only `guard_permission` and `guard_refused` are manually named state keys. `guard_refused` records the original No and is never reset by later acceptance.

### Ordered walkthrough

Each row identifies the editor and required action. A switch is a change of top-level editing context; selecting another field/node is additional local work. All steps are proposed authoring operations, not changes performed by this audit.

| Step | Editor / selected entity | Required controls and references | Naming, assumptions and repeated work |
| --- | --- | --- | --- |
| 1 | Map / Village | Confirm walkable approach, existing spawn and room beyond Gate | Existing startup must land here; merely renaming an area does not rewrite a different startup destination |
| 2 | Items / new item | Add item; name Harbour Key; category Key; retain non-stackable default | Generated `key`; item definition is not a placed pickup or initial inventory grant |
| 3 | NPCs / new definition | Add NPC; name Guard; retain suitable avatar, friendly, stationary and can-interact defaults | Generated `guardDef`; this creates no map character and no conversation |
| 4 | Objects / new definition | Add object; name Old Chest; category Prop; set Behaviour None and no direct interaction | Generated `chestDef`; deliberate approximation, not Container |
| 5 | Objects / second definition | Add object; name Harbour Gate; category Door; configure/use Door behavior | Generated `gateDef`; category alone does not create behavior |
| 6 | Map / palette | Select Guard definition and place it near the entrance | New `guardPlaced` references `guardDef`; actions/objectives normally need this placed target |
| 7 | Map / palette | Select Old Chest and place it | New `chestPlaced` references `chestDef`; verify effective behavior remains None |
| 8 | Map / palette | Select Harbour Gate and place it | New `gatePlaced` references `gateDef`; keep approach accessible |
| 9 | Map / event tool | Place an arrival event beyond Gate, name it Beyond Gate; use a passive point with no transition/message | New `gateArrival`; a destination is an event-block ID, not just coordinates |
| 10 | Map / Gate inspector | Enable Door / Transition, Interact activation; select Village, Beyond Gate, required Harbour Key | Three references: `village`, `gateArrival`, `key`; place-specific destination belongs on the instance behavior override |
| 11 | Map / Gate inspector | Review prompt and lock feedback | Built-in locked status is sufficient; key is retained; no permanent gate-open state |
| 12 | Game State | Add `guard_permission`, default false | Must satisfy lowercase identifier naming in this editor |
| 13 | Game State | Add `guard_refused`, default false | A second boolean stores the original choice separately from current permission |
| 14 | Quests / new quest | Add quest; name Village Passage; describe finding the key and using Gate | Generated `quest`; retain In order and From an interaction or Start Quest action |
| 15 | Quests / objective 1 | Add objective; text Talk to Guard; Talk to NPC / Examine object; select Village / Guard | Stored condition is `interaction_completed(village, guardPlaced)`; target selection derives both IDs |
| 16 | Quests / objective 2 | Add objective; text Find Harbour Key; change type to Obtain Item; select Harbour Key; quantity 1 | Stored `has_item(key, 1)` reads current ownership when eligible |
| 17 | Quests / objective 3 | Add objective; text Use Harbour Gate; change type to Use Door; select Village / Harbour Gate | Stored `door_used(village, gatePlaced)`; requires successful native door transition |
| 18 | Quests / quest | Enter completion message; review order and inactive start | No manual Complete Quest action needed; final objective completes it |
| 19 | Dialogues / new conversation | Add dialogue; name Guard conversation; create/use Choice as Start | Generated `conversation`; set `startNodeId` using the graph/start control; remove any unused initial node |
| 20 | Dialogues / Start Choice | Enter a neutral greeting/question and Guard speaker | Speaker is a string, not a live character reference; greeting remains fixed on reopen |
| 21 | Dialogues / nodes | Create six Text nodes: Accept, Refuse, Search reminder, Gate instruction, Original Yes remembered, Original No remembered; create one shared End | These are audit titles; cards derive titles from text/type. Set Guard speaker on the reply nodes too; it is copied text. Nodes receive generated IDs |
| 22 | Dialogues / Start responses | Add Yes and No, link each to its respective Text node | Two response IDs and two links; no actions live directly on a response |
| 23 | Dialogues / Yes response | Add Quest status = Village Passage / Inactive and Flag is `guard_refused` / false | Two flat AND conditions; repeat the state selection for No |
| 24 | Dialogues / No response | Add the same two conditions | Duplicated gating ensures initial responses disappear after a decision |
| 25 | Dialogues / Accept Text | Add Set flag `guard_permission` true; add Activate quest Village Passage | Ordered entry actions; this is the UI's "activate quest" action label, not an automatic effect of drawing a link |
| 26 | Dialogues / Refuse Text | Add Set flag `guard_refused` true; enter refusal reply | Does not activate quest; original refusal persists |
| 27 | Dialogues / Start response | Add I've changed my mind, link to Accept; conditions quest Inactive AND refusal true | Third route into shared Accept; no need to duplicate its effects |
| 28 | Dialogues / Start response | Add I'm still searching, link to Search reminder; conditions quest Active AND Does not have item Harbour Key | Re-select quest/status/item, retain quantity 1 |
| 29 | Dialogues / Start response | Add I found the key, link to Gate instruction; conditions quest Active AND Has item Harbour Key | This is how changed dialogue is approximated: player chooses the newly available response |
| 30 | Dialogues / Gate instruction | Write Guard's instruction to use Harbour Gate | No world-object reference in the text; saying "Gate" does not wire the door or objective |
| 31 | Dialogues / Start response | Add a completion response leading to Original Yes remembered; quest Completed AND refusal false | Re-select same quest and flag |
| 32 | Dialogues / Start response | Add a distinct completion response leading to Original No remembered; quest Completed AND refusal true | Different reply acknowledges refusal even if player later helped |
| 33 | Dialogues / Start response | Add unconditional Goodbye, link to End | Ensures at least one response remains; no new fallback runtime |
| 34 | Dialogues / six Text nodes | Connect each Next output to shared End; write the remaining lines | Six more links; graph ports avoid copying local IDs |
| 35 | Dialogues / diagnostics | Review Start, links, reachable nodes, references and action order | Seven conditional responses carry fourteen condition entries; six Text nodes plus Choice and End = eight nodes |
| 36 | Map / placed Guard | Open Advanced interaction; Type Start dialogue; select Guard conversation; Interact activation; useful prompt | `guardPlaced` assignment references `conversation`; confirm canInteract is true |
| 37 | Map / Guard interaction | Leave the interaction's Start Quest convenience selector at None | Otherwise closing No or pressing Escape could activate the quest; acceptance must stay on Accept entry |
| 38 | Cutscenes / new scene | Add Chest denied; enter "Ask Guard for permission first"; keep suitable default background | `deniedScene`; generic rules cannot directly Show message |
| 39 | Cutscenes / second scene | Add Key found; enter "You take Harbour Key from the chest" | `foundScene`; a cutscene definition is extra setup for a short rule response |
| 40 | Logic / new rule | Add rule; name Chest permission; WHEN Player interacts with -> Village / Old Chest | Target is `chestPlaced`, not `chestDef`; rule enables discovery even without a direct interaction |
| 41 | Logic / rule IF | Add Flag is `guard_permission` true | No tree/group needed for this one leaf |
| 42 | Logic / rule THEN | Add Give item Harbour Key x1; add Play cutscene Key found, in that order | `key` and `foundScene`; grant is not a container transaction or physical opening |
| 43 | Logic / rule ELSE | Add Play cutscene Chest denied | `deniedScene`; no fake permission check on the native container |
| 44 | Logic / rule run policy | Choose Once per playthrough; leave enabled | False condition/ELSE does not consume once; successful THEN consumes it after actions return |
| 45 | Map / final inspection | Check Chest has no built-in contents/direct grant, Gate uses native Door, Guard has the right conversation, and arrival is reachable | Avoid duplicate grants or rules followed by unconditional behavior; verify all three placed targets again |
| 46 | Play / New Game | Before talking, try Chest and Gate; choose No; reopen, then change mind; collect key; talk; use Gate; return to Guard | Expected denial, remembered refusal, active quest, changed responses, completion; this is the proposed acceptance route, not a fresh pass |
| 47 | Play / independent route | New Game; accept initially; complete story; verify original-Yes memory; try repeated chest use | Separate state from the previous run; once-per-node is not once-per-playthrough |
| 48 | Save / Continue and Edit | Save gameplay after modal conversations close, Continue and reopen; return to Edit and inspect defaults; save/export authored project separately | Choice effects persist, conversation cursor does not; runtime must not mutate project defaults |

### What this journey does and does not prove

The code supports the composed quest, choice memory and conditional responses. Talk completion includes early conversation close; after Accept activates the quest, closing records Talk and advances to Find Key. A previous No conversation fact can also satisfy Talk on later activation. That is compatible with this first objective, but **cannot enforce a fresh return-to-Guard conversation later** using another identical Talk objective: facts are remembered sets.

Chest success here grants an item once; it emits no `container_opened` fact or container animation/state. After once succeeds, the rule no longer supplies repeat feedback. The sample does not require a fresh return conversation before Gate; a player can use Gate immediately with the key. If that order must be enforced, an explicit flag set only by the Gate-instruction branch and an appropriate gate implementation are extra authoring/semantic work.

Do not abuse `openedFlag` as a permission lock by initializing a real chest as already opened and clearing it on acceptance. That conflates permission with collected state and can render the chest opened before the player opens it.

## 3. Friction Metrics

Counts use the route above and exclude pre-existing Village/spawn, art, optional portraits, JSON editing and error-repair loops. They measure authoring work, not unique gameplay features.

| Measure | Approximate result | Counting basis |
| --- | --- | --- |
| Distinct editor tabs | **9**, plus Play | Map, Items, NPCs, Objects, Game State, Quests, Dialogues, Cutscenes, Logic |
| Editing visits / context departures | **12 visits / 11 switches**, plus Play and return | Map -> Items -> NPCs -> Objects -> Map -> Game State -> Quests -> Dialogues -> Map -> Cutscenes -> Logic -> Map |
| Panels/subcontexts | **About 16-20** | Palette/hierarchy/inspector/advanced behavior, quest sequence, graph/node/response/actions/diagnostics, rule trigger/conditions/THEN/ELSE, definition forms |
| Separate top-level authoring entities | **15** | 1 NPC definition + 1 placement + 2 object definitions + 2 placements + item + quest + dialogue + rule + 2 cutscenes + arrival point + 2 state keys |
| Nested authored records | **20**, yielding **35 total records/keys** | 3 objectives + 8 dialogue nodes + 8 responses + 1 rule condition; excludes action entries and dialogue conditions without IDs |
| Reference occurrences to select/confirm/connect | **About 49** | 3 placement-definition refs + 14 response-condition refs + 3 dialogue-action refs + 15 Start/Next/response links + assignment + 5 objective area/target/item refs + 3 door refs + 5 chest-rule refs |
| Distinct referenced identities | **About 22** | Includes local dialogue nodes, two state keys, the existing area and generated definition/placement/content IDs; excludes visual assets |
| Raw identifier strings requiring manual naming | **2 state keys** | Most entity references use names/selectors; UUID copying is not required for this baseline |
| Dropdown selections or explicit confirmations | **About 55-75** | Roughly 29-42 in dialogue, 9-11 in the rule, 5-7 in quests, remainder definitions/placement/door/assignment; accepted defaults and duplication change the actual click count |
| Other wiring | **14 graph links plus Start**, 14 condition rows, 6 effect entries | Three dialogue effects and three chest-rule effects; typing text and Add buttons are additional |
| Concepts / semantic distinctions to coordinate | **Roughly 20** | Includes template/placement, assignment, nodes/choices, predicates, entry/close effects, quest state/sequence, ownership/history, state keys, rule trigger/once, destination scope and Edit/Play persistence |
| Terminology mismatches encountered | **At least 10** | Enumerated in section 4; not ten missing engine features |

Forty-eight walkthrough rows are grouped tasks, not forty-eight clicks. The repeated state/quest selections, multiple entity representations and return visits explain more than raw ID visibility. Reusing content lowers creation counts; choosing an exact native permission-gated chest does not lower them because that route is blocked.

## 4. Mental Model Audit

Classification concerns the default experience; internal names remain useful in Advanced diagnostics.

| Concepts currently encountered | Classification | Creator-facing treatment |
| --- | --- | --- |
| Character, prop, item, place/area, conversation, player choice | Appropriate player-facing concept | Show named, recognizable entities |
| Quest, objective, ordered steps, reward, current inventory | Appropriate player-facing concept | Present as goals and a sequence |
| WHEN event, IF condition, THEN/ELSE, all/any, ordered effects | Appropriate player-facing concept | Sentence/block composition can teach these directly |
| Remembered Yes/No, story value, quantity, quest active/completed/failed | Appropriate player-facing concept | Explain through story outcomes and examples |
| NPC definition versus placed instance; defaults versus overrides | Maybe advanced | "Character template" versus "Guard in Village"; reveal inheritance when editing shared defaults |
| Rule, run policy, enabled state, folders; sequence versus legacy independent mode | Maybe advanced | Simple one-event rule and sequential quest by default; retain explicit legacy handling |
| Node entry versus conversation-close effects; once scopes; key consumption | Maybe advanced, with essential timing made visible | Label "When this line begins" / "After conversation closes" / "Once this playthrough" |
| Alignment, health comparisons, movement mode, shop stock/currency | Maybe advanced/contextual | Offer on relevant character, travel or shop content |
| `DialogueDefinition`, `GameRule`, `ConditionExpression`, `GameAction` | Technical concept that should be hidden | Persist existing types; show conversation, rule, condition and effect |
| Definition/instance IDs, `targetId`, `areaId`, `itemId`, node/response/group IDs | Technical concept that should be hidden | Resolved entity chips; inspect/copy ID only on demand |
| `interaction_completed`, `door_used`, serialized fact keys, latch/once sets | Technical concept that should be hidden | Explain "has talked to" or "successfully used" and whether remembered |
| Generated defeat flag, action-dispatch callbacks, adapter notifications | Technical concept that should be hidden | A semantic label only where its mapping is accurate |
| Interaction type versus behavior; category versus capability | Technical implementation split, advanced when necessary | Choose one clear interaction recipe, reveal its backing fields |
| Project defaults versus saved Play state | Appropriate creator concept | "New Game defaults" versus "Current playthrough"; never write debug state into defaults |

### Terminology and discoverability

| Current mismatch | Recommended wording / explanation |
| --- | --- |
| Character tab configures player; Scene calls NPCs Character; NPCs tab configures templates | Player / Characters / Character templates |
| Dialogue in simple Map form means inline lines; Dialogues means branching definitions | Quick message / Conversation |
| Start Quest, Activate quest, `activate_quest` | Start quest, with existing status rules unchanged |
| Interaction activation versus rule trigger | "Player presses Interact" versus "When..."; explain both can run |
| Actions on enter versus interaction completion actions versus quest completion rewards | "When this line begins", "After conversation closes", "When quest completes" |
| Set Flag objective is a predicate, not an action | "Story state is Yes/No" |
| Obtain Item is current ownership, not an acquisition event | "Have item xN"; note completion latches |
| Talk to NPC / Examine object uses a completion fact | "Finish talking / examining"; early close currently counts |
| Enter Area / Arrival point means an event cell, unlike Player enters area | "Reach point" versus "Enter area" |
| Event block versus event notification | "Map point/trigger" versus "When something happens" |
| Object category, Object behaviour, Interaction type | "What happens when used" with capability-specific choices |
| Target / NPC instance / definition | Entity name + area + type, with template/placed distinction |

A new author can find Add choice, Add objective and WHEN/IF/THEN fairly readily. Hidden connections remain: start a quest on the **destination node's** action list; item conditions belong to **responses**; a prop advances a quest only through the appropriate fact producer; defeat needs a generated flag; multiple effects use ordered action lists; rule OR does not imply dialogue OR. Inline helper text and contextual suggestions should teach these boundaries at the point of use.

## 5. Character / NPC Authoring

Current [NPCs editor](src/editor/sections/NpcsEditor.tsx) creates reusable definitions with visuals, attributes, movement and enemy defaults. Its default-interaction UI is still a TODO. The placed [NPC inspector](src/editor/sections/MapNpcInspector.tsx) resolves defaults and overrides and supplies section resets; Map Inspector actually assigns a conversation. This division is useful for reuse but expensive for a unique story character.

Desired block: **[character icon | Guard | Village, entrance | placed character]**. Dragging it copies a reference, not a character. Offer the template separately when the intention is to edit all placements. A speaker chip can initially fill speaker text/portrait from the chosen character, but this is a copied attribution: the present dialogue schema has no persistent speaker-to-NPC relationship.

| Contextual block | Status | Exact mapping / limit |
| --- | --- | --- |
| WHEN player interacts with Guard | Already supported | `on_interact.targetId = placed NPC id`; runs before direct conversation, not after talking |
| Talk to Guard (quest step) | Already supported | `interaction_completed` with area and placed ID; requires a supported conversation/message completion |
| Conversation with Guard | Small authoring adapter | Assign existing `Interaction.start_dialogue` on this placement; not a generic action socket |
| Start dialogue with Guard in a rule action list | Genuinely new semantic | No `start_dialogue` GameAction, despite a `dialogueRequested` notification type |
| IF Guard has been defeated | Small authoring adapter over existing semantics | Generate/use exact `npc_defeated_<placedId>` flag; declare default false and explain derived state; no health-zero substitution |
| WHEN Guard is defeated | Missing authored trigger/integration | Combat emits a notification, but no RuleTrigger/editor/matcher implementation |
| Set Guard alignment to Hostile | Already supported | `set_npc_alignment.npcId` targets placement; definition ID is wrong |
| Set Guard health / IF health compares | Already supported in corresponding action/rule contexts | Setting health to zero does not run the combat-defeat transaction |

### Entity selection UX across the product

The current selection baseline is stronger than a raw-ID editor but inconsistent. Most story selectors are native text lists with no thumbnail, coordinate preview or map-focus affordance.

| Entity | What authors see now | Ambiguity / desired reference |
| --- | --- | --- |
| NPC definitions | NPCs names; Asset Browser names and visual thumbnails where available | Mark as template; never silently use as a placed target |
| Placed NPCs | Scene hierarchy icon/name/type; objective targets include area/name; Logic uses area + definition name | Logic target labels ignore `nameOverride`; duplicate Guards in one area remain ambiguous. Resolve effective name, add location and focus |
| Props | Hierarchy name/icon; Logic/quest targets often use area + resolved name | Distinguish definition from instance and actual interaction capability |
| Doors | Object selectors filtered by resolved Door behavior for Use Door objectives | Category or gate-shaped asset alone is not sufficient; include destination summary |
| Containers | Open Container selector filters resolved behavior; contents item selectors show names | Include opened/reward behavior; don't offer native opening conditions on plain props |
| Pickups | Hierarchy normally uses item name; Map item selector may include IDs | Multiple pickups of one item need area/coordinates; physical collection differs from receiving the item |
| Event blocks | Name/tag/kind and position in Map; named rule/destination selectors | "Beyond Gate" should show area and map point; duplicate names need location |
| Items | Items list has icon/name/category; many simple selectors show name | Some quest completion/advanced selectors append ID; reuse item icons in story references |
| Quests | Named list; response selector shows name; some effect selectors append ID | Show status context and objective preview, not another technical reference field |
| Dialogues | Named definitions; local graph links use text-derived titles; Map has selector + Open dialogue | Duplicate titles need previews; add assigned-to/used-by navigation |
| Flags | Raw exact record keys in Game State, select/input/datalist elsewhere | No independent display-label field; same key repeatedly typed or chosen |
| Areas | Named lists, sometimes name + ID | Provide destination point together with area; don't expose invalid independent pairs |

Stable IDs should remain internal. A derived reference presentation should supply icon/thumbnail, effective name, entity kind, template-or-placement, area and optional coordinates. Show a short ID suffix only when needed to disambiguate or diagnose. Renaming a display name must never re-key references.

## 6. Props / World Objects

[Object definitions](src/editor/sections/ObjectsEditor.tsx), [behavior fields](src/editor/ObjectBehaviourEditor.tsx), placed overrides and simple interaction controls are separate. The simple Map form already handles messages, one-item containers, keyed doors and prop pickups, and offers inline item creation for relevant rewards. Advanced fields expose multiple contents, once and openedFlag. Visual appearance and object category do not prove runtime behavior.

| Proposed block | Existing support | Accurate creator promise |
| --- | --- | --- |
| WHEN Old Chest opens | Success notification `containerOpened` and quest fact exist; no generic trigger | Native Open Container objective works; generic WHEN needs new wiring |
| IF Old Chest has opened | `openedObjectIds`, optional `openedFlag`, `container_opened` fact | Rule/dialogue can use an explicitly configured openedFlag; generic history predicate absent. Existing fact alone is not a rule leaf |
| WHEN Key Pickup is collected | Dedicated pickup transaction emits `pickupCollected`; collected set and optional flag | Not generic interact/touch: placed pickup path bypasses that rule dispatch. A later flag check is not an immediate event |
| WHEN Harbour Gate is used | `on_interact` sees attempted use; successful `door_used` fact exists | Use Door objective observes success; generic interact must not be labeled "successfully opened" |
| IF Gate has been used | Historical quest fact only | Can satisfy a quest objective, not a generic condition without a deliberate bridge |
| Open Gate / Open Chest action | No such GameAction | Door interaction and container transaction are existing operations, not callable generic actions |

A generic prop's `state` record is not a universally queryable condition source. Do not offer "Opened?" solely because a model looks like a chest. Metadata can determine sensible options from **resolved behavior**, interaction type, item reference and target kind; it cannot manufacture semantics.

## 7. Items

Inventory ownership already supplies a useful cross-system vocabulary. [Inventory](src/runtime/inventory.ts) and [shop runtime](src/runtime/shopRuntime.ts) own quantities/transactions, while [Items](src/editor/sections/ItemsEditor.tsx) supplies names, icons, category and stack rules. Creating a definition does not give the player one. Optional starting inventory is schema data; the current Game State form edits flags/variables, not a complete starting-inventory UI.

| Item block | Rules | Dialogue | Quests | World interactions |
| --- | --- | --- | --- | --- |
| Has item xN | Condition leaf | Response condition | Objective condition, then latched | Door requires item x1; no universal Interaction condition field |
| Does not have item xN | Condition leaf | Response condition | No equivalent native objective | No universal interaction predicate |
| Give / Remove item xN | GameAction | Node-entry GameAction | Quest completion GameAction | Completion actions only execute in supported completion contexts; containers/pickups have their own grants |

Use one visual item picker and quantity control with **context-specific writers**. It can create `SingleCondition` with an ID, `DialogueCondition` without one, an `ObjectiveCondition`, a `GameAction`, or a door/content field. It must not silently convert current ownership into a historical collection event.

Safe defaults: quantity 1; show icon/name; search existing items; inline Create item then select it; allow explicit stack/category editing without blocking narrative wiring. Grants are not atomic across arbitrary action lists: generic giving can report overflow, while containers and pickups preflight contents. Remove item floors at zero. A block appearance should not imply transaction guarantees the executor lacks.

Shops already use item currency, named entries, prices and stock in [ShopsEditor](src/editor/sections/ShopsEditor.tsx). Keep Open shop contextual to a merchant/shop, reuse these selectors, and link to the existing stock editor. Buying can satisfy ownership objectives; it does not provide a generic Item collected trigger. Shops and inventory do not need replacement systems for narrative authoring.

## 8. Quests

Current new quests already default to inactive and sequential. For **Talk -> Obtain Key -> Use Gate**, the task is Add quest/name; three times Add objective; enter three descriptions; retain/change the condition types; select Guard, Key and Gate; confirm quantity 1 and order. That is roughly **14-18 field/add operations** after entities exist, plus the separate quest-start wiring. The UI already derives area + target from one named selector: authors need not type both IDs.

A sequence view is a natural improvement:

```text
Village Passage  [Starts when chosen in dialogue]
1. Finish talking to [Guard - Village]
2. Have [Harbour Key] x [1]
3. Successfully use [Harbour Gate - Village]
On completion: [Message ...] [effects ...]
```

Dragging a placed NPC, item or native door into a valid step can create the corresponding current objective, derive area/target, generate the objective ID and suggest editable player text. It still needs to verify that Talk's target produces a completion fact, and Gate has a valid destination. This requires authoring work, not a quest graph runtime.

| Quest operation | Where it already works | Where it does not |
| --- | --- | --- |
| Start / Complete / Fail quest | All are GameAction variants: generic rules and dialogue nodes; Quest completion UI offers them too | No automatic relationship edge execution; map convenience selector only exposes Start |
| Quest is Active/Completed/etc. | Dialogue response `quest_status` | Not a generic `SingleCondition`; not an objective predicate; not an Interaction gate |
| Whole quest completion effects | `Quest.completionActions` through integrated shared sync | Not a generic quest-completed RuleTrigger |
| Objective complete | Objective latches / quest HUD / diagnostics | No generic predicate, completion hook or native internal quest branch |

Start is not reset: sequential quests activate only from inactive. Complete can bypass objectives. Fail is an explicit mutation, not an authored failure-condition system. Repeated Talk or Door steps against the same target can be satisfied by old facts; drag-and-drop must expose this limitation rather than suggest every step requires a new event.

Current quest effect forms expose 11 of the 15 GameAction variants. NPC changes, movement mode and end game are omitted there despite executor support. This is a form-coverage issue; a shared palette can improve it without changing quest semantics.

## 9. Dialogue

The new graph makes conversation topology materially more understandable: Start badge, text/choice/end cards, individual response outputs, named connections, loops, action summaries, fit/focus/layout, shared List/Graph editing and local undo. [Component tests](src/test/dialogueGraphEditor.test.tsx) cover connections, conditions, action fields and duplication. It is not reasonable to recommend building branching dialogue again.

Remaining friction is concentrated in the inspector:

- Every response requires Add condition, type, reference and value/status. Fourteen condition entries in the sample repeat the same quest, flag and item context.
- A Yes response must link to a node with actions; effects cannot attach to the response itself. A "When this response is chosen" authoring affordance would need to explicitly create a branch-specific destination node, not attach effects to a shared node and change other routes.
- All 15 action variants are available, but their labels are mechanically derived (`activate quest`, `set npc alignment`), and relevance is not prioritized.
- Flags are key inputs with suggestions; items/quests are text selectors; no Create quest/item/flag workflow is integrated here.
- Conversation assignment still requires returning to Map. Open dialogue navigates from Map to the graph, but a general reverse usage/assignment browser is absent.
- Speaker strings and portraits are separate from the placed character. Copying attribution is easy; making it follow later NPC renames would require explicit metadata/contract decisions.
- Conditions are **flat AND on responses**. The graph does not support conditional automatic entry/next routing, OR groups or runtime action nodes.

An entity palette should let a creator drop Harbour Key onto a response's condition slot, Village Passage onto an entry-action slot, or Guard onto an assignment slot. The drop location determines the meaning; dropping an item onto empty space should offer a small menu, not guess Give versus Has.

## 10. Rules / Events

[ProgressionEditor](src/editor/sections/ProgressionEditor.tsx) is the current **Logic** tab. It already presents WHEN/IF/THEN/ELSE, summaries, recursive groups, folders, enabled state and once policy. Its name does not mean the current rendered tab is a full editor for the separate legacy `project.progression` sequence; that sequence remains a runtime/schema/store contract.

For WHEN interact Gate / IF has Key / THEN teleport / ELSE locked text, after the placed target, item, arrival and locked cutscene exist:

1. Add/name rule.
2. Select trigger type and Gate (2 dropdowns).
3. Add condition; select Has item and Key; retain quantity 1 (2 dropdowns).
4. Add THEN action; select Teleport, destination area and point (3 dropdowns).
5. Add ELSE action; select Play cutscene and locked cutscene (2 dropdowns).
6. Confirm enabled/repetition and check that Gate has no competing native transition if this rule owns passage.

That is **9 dropdown choices**, 3 row-add controls plus Add rule, name entry and policy review; the cutscene/destination/target setup costs extra context switches. There is no plain Show text action. A visual recipe could reduce this to choose Gate, Key, destination and failure text, then expand the failure text to a visible cutscene definition with the current semantics.

This rule teleport route does **not** produce `door_used`, permanently open geometry or consume the key. For the sample's Use Door objective, the native keyed Door behavior is the better mapping. Do not show the same recipe as interchangeable without changing the objective expectation.

### Current triggers

| Friendly top-level block | Runtime mapping | Qualifications |
| --- | --- | --- |
| WHEN a new game starts | `on_game_start` | Continue does not replay startup |
| WHEN player interacts with [entity] | `on_interact` | Structures, props, NPCs and event blocks; attempted interaction, before direct behavior |
| WHEN player reaches/touches [trigger or prop] | `on_touch` | Supported event/object entry paths; not arbitrary regions, NPC contact or pickup-success |
| WHEN player enters [area] | `on_area_enter` | Final startup area and different-area transitions; same-area teleport is not re-entry |
| WHEN [cutscene] finishes | `on_cutscene_end` | Applicable authored cutscene dismissal; not Dialogue ends |

These are straightforward alternative controls over existing triggers. "Target", "touch", and "event block" need context-specific labels. Major expectations missing from this list are evaluated separately in section 19.

## 11. Conditions / IF Logic

The recursive rule condition tree maps naturally to nested blocks. Each group already owns an ID, operator and children; each leaf owns an ID and typed parameters. Dragging/reordering changes that tree, not runtime scheduling. IF is the visual shell around `conditionTree`, THEN around `actions`, ELSE around `elseActions`.

```text
WHEN player interacts with [Gate]
IF ALL
    Have [Harbour Key] x1
    Story state [Guard permission] is Yes
THEN
    Teleport to [Beyond Gate - Village]
ELSE
    Play [Gate locked message cutscene]
```

The tree/actions in this representation are existing rule semantics. Labeling the last two effects Open physical gate and Show inline dialogue would promise unsupported actions. A friendly text-entry recipe may create a cutscene, but should reveal that modal choice.

Nested example:

```text
ALL                              -> ConditionGroup(operator: AND)
  Have [Harbour Key] x1           -> has_item
  ANY                            -> ConditionGroup(operator: OR)
    [Guard permission] is Yes    -> flag_is
    [Guard defeated] is Yes      -> flag_is(npc_defeated_<placedId>)
```

Composition, drop targets, connectors and friendly labels are UI work. A Defeated convenience block is an authoring adapter over the exact generated flag. A generic NOT group, quest-status leaf, world-history predicate or automatic else-if chain is not present. Empty rule groups currently evaluate true, including empty OR; an incomplete visual group needs an explicit warning rather than an assumed false result.

Do not reuse this entire tree in every context. Dialogue only has flat AND lists, objectives one condition, and interactions no general condition expression. Share the leaf presentation and entity picker, then filter capabilities by owning contract. A dialogue OR block cannot be serialized losslessly without deliberate new semantics or visible authored duplication.

## 12. Actions

All 15 GameAction variants should remain accessible, but prominence should follow the current task.

| Tier | Palette entry | Current action |
| --- | --- | --- |
| Basic | Remember [story state] Yes/No | `set_flag` |
| Basic, when item/quest context exists | Give item; Remove item; Start quest | `give_item`, `remove_item`, `activate_quest` |
| Contextual | Complete quest; Fail quest | `complete_quest`, `fail_quest`; explain bypass/failure behavior |
| Contextual | Show story moment / Play cutscene | `play_cutscene`; image/text modal, not a full cinematic system |
| Contextual | Go to [named arrival] | `teleport`; requires area + event |
| Contextual | Open shop | `open_shop`; choose a shop definition, not just an NPC |
| Advanced / Story values | Set value; Change number by | `set_variable`, `change_variable`; numeric changes do not apply to text |
| Advanced / Character context | Change alignment; Set health | `set_npc_alignment`, `set_npc_health` |
| Advanced / Travel context | Change movement mode | `change_movement_mode`; authored values exclude swim; existing UIs differ in exposed options |
| Advanced / Ending context | End game | `end_game` |

Start dialogue, show arbitrary inline message, open container, unlock gate, change patrol and emit custom event are **not GameActions**. Start dialogue may appear in an NPC assignment context, not in a rule action socket. This capability distinction should be visible in contextual menus.

Execution is ordered, not generally atomic. Cutscene callbacks can suspend an action list; teleport/modal effects need careful integration; node effects are guarded once per node per conversation opening. Keep the existing shared dispatcher. A future UX pass must not reorder effect arrays or promise rollback, delay, parallel execution or once-forever behavior by drawing attractive wires.

## 13. Dragging World Entities

Feasible without adding a StoryGraph runtime. There are already two useful sources:

- [SceneHierarchy](src/editor/sections/SceneHierarchy.tsx) uses `sceneEntries(project, area)` for placed names, icons and selection. It currently selects entities; it does not export story-reference drags.
- [AssetBrowser](src/editor/sections/AssetBrowser.tsx) uses `sceneAssets` and `SCENE_ASSET_MIME` from [sceneEditing](src/editor/sections/sceneEditing.ts) to drag **assets/definitions for placement**. It already supports search/categories and registry-backed thumbnails. This is not the same payload as a reference to an existing Old Chest.

Required authoring architecture:

1. Derive an editor-side entity catalog from project arrays, existing scene enumeration, `npcResolver`, resolved object behavior, item presentation and the existing visual resolver/registry. Extend/reuse those mechanisms; do not create a separately persisted entity registry. Existing enumeration is a starting point, not already a complete story selector service.
2. Distinguish a placed-reference drag (`kind`, stable ID, area hint) from asset-placement drag. Resolve it against the latest project at drop time. No live Three/Phaser objects, cloned gameplay entity, raw visual-asset ID masquerading as a character, or stale object snapshot in authored data.
3. Define typed drop slots: placed NPC for an NPC action; item for ownership/give; quest for start; area/event pair for destination; dialogue for assignment. A template dragged into a placed-only slot should request a placement choice or explicit creation, never select the first instance silently.
4. Supply search/click/keyboard equivalents. Dragging is an acceleration, not the sole editing method. Include "Show on map", "Open source", and "Used by".
5. Preserve one Map selection/store/undo owner. The current App mounts one active editor section; true Map-to-Story dragging requires a docked/split surface or a shared hierarchy/palette visible alongside Story. Tab switching is not an existing drag bridge. Start with the palette; do not mount a second independently owned map/renderer.
6. Use a dedicated reference handle/gesture so a story drag cannot move the character on the map. Commit the authoring operation once, with undo. Keep selection, drag hover, pan and zoom outside `GameProject`.

For duplicate Guards show "Guard - Village (4, 7)" and a map highlight. For deleted targets preserve a broken reference chip instead of resolving to a same-named replacement. IDs remain stable; labels are resolved afresh.

## 14. Proposed Block Vocabulary

Use **23 block families**, with contextual variants, rather than exposing every enum as an equally prominent block. Families are compositional controls, not new runtime types. "Available" below is scoped to its host.

| # | Category / family | Backing contract and availability |
| --- | --- | --- |
| 1 | Events: WHEN ... | The five current RuleTrigger variants; target-aware choices |
| 2 | Logic: IF ... THEN ... ELSE ... | GameRule shell |
| 3 | Logic: ALL | Rule ConditionGroup AND |
| 4 | Logic: ANY | Rule ConditionGroup OR; not in dialogue/objectives |
| 5 | State: Story state is Yes/No | Rule/dialogue `flag_is`; objective `flag` |
| 6 | State: Remember Yes/No | `set_flag` |
| 7 | State: Compare story value | Context's existing `variable_compare` |
| 8 | State: Set story value | `set_variable` |
| 9 | State: Change number by | `change_variable` |
| 10 | Inventory: Have / Do not have item | Rule/dialogue predicates; positive Have objective |
| 11 | Inventory: Give item | `give_item` |
| 12 | Inventory: Remove item | `remove_item` |
| 13 | Quests: Start quest | `activate_quest` |
| 14 | Quests: Finish quest as Completed / Failed | `complete_quest` / `fail_quest`, contextual |
| 15 | Quests: Quest status is ... | Dialogue response condition only |
| 16 | Quests: Step ... | Existing objective types, rendered as a sequence, not an executable rule block |
| 17 | Dialogue: Conversation assigned to ... | `Interaction.start_dialogue` assignment; not GameAction |
| 18 | Dialogue: Text / Player choice / End | Existing DialogueNode types, only inside conversation editing |
| 19 | World: Play story moment | `play_cutscene` |
| 20 | World: Go to arrival point | `teleport` |
| 21 | Characters: Read / change character state | Existing alignment/health rule predicates and actions; derived Defeated flag convenience where valid |
| 22 | World: Open shop | `open_shop` |
| 23 | Advanced: Travel mode / End game | Remaining `change_movement_mode` / `end_game` actions |

Entities themselves are reference chips, not additional executable blocks. Character, World, Inventory and Quest filters scope this same vocabulary. Selecting Guard prioritizes assignment/Talk/alignment/health; Chest prioritizes its actual behavior and matching objectives; Key prioritizes Have/Give/Remove; Quest prioritizes Start, completion effects and its permitted status condition.

Unavailable operations must say why: "Quest status is available in dialogue responses; Logic rules do not support it yet." Do not emit a superficially similar flag workaround silently. A runtime notification is not enough to enable a WHEN menu entry.

## 15. Templates / Recipes

Templates should expand to ordinary editable records with fresh IDs and explicit mappings. Preview the generated records, reuse selected entities, commit creation and references together, and allow undo. No template executor, hidden story state or special runtime lifecycle.

| Recipe | Expansion using current schemas | Limit / guardrail |
| --- | --- | --- |
| Quest giver with Yes/No | Dialogue Choice -> branch-specific Text nodes; accept starts quest, optional flag; refusal remembers No; assign on chosen NPC | Do not put Start Quest on whole-conversation completion; Escape/No would start it |
| Talk to NPC -> Start quest | Quick message or referenced conversation with supported completion `activate_quest` | Correct only when every close should start it; not a Yes-only recipe |
| Keyed door | Door ObjectBehaviour with required item + valid destination; optional locked cutscene | Exact native key gate and `door_used`; retains key, no persistent physical unlock |
| Conditional passage | GameRule interact + Have item + Teleport + ELSE Play cutscene | Plain rule-owned target; no native door-used fact. Must expose generated cutscene/destination requirements |
| Fetch and return | Start quest; Have item objective; conditional return response sets a generated `key_reported` flag; final flag objective | A second identical Talk objective cannot enforce return because the first Talk fact is remembered; generated flag is ordinary visible project state |
| Defeat and report | Start quest; exact defeat-flag objective; defeated-conditioned response sets report flag; final report objective | No native Defeat trigger/objective. Show generated mapping and combat completion-dispatch limitation; not a default beginner recipe until explained/tested |

Templates solve several real costs that colored controls alone do not: creating action-bearing response destinations, choosing the right quest-start hook, deriving scoped IDs, and making text feedback content inline. They should not quietly add rewards twice through both legacy `rewards` and `completionActions`.

### Smart defaults

| User action | Safe default |
| --- | --- |
| Drop Item into Have/Give/Remove | Correct item ID, quantity 1; preserve visible quantity |
| Drop placed NPC into Talk step | Derive containing area + placed ID; suggest "Talk to Guard"; flag missing conversation capability |
| Drop Door into Use step | Derive source area + object ID; validate Door behavior/destination |
| Drop entity into WHEN interact | Use its placed ID; show effective name; warn about direct behavior also running |
| Drop Quest into Start effect | Fully configure `activate_quest` with quest ID |
| Drop Dialogue onto placed NPC assignment slot | Write the placement interaction/override, Interact activation and usable prompt; preview replacement of existing behavior |
| Create quest inline | Inactive, sequential, empty objectives; show "Needs objectives" and open embedded sequence editor |
| Create story boolean | False default, generated stable unique key, visible label/key explanation |
| New event/response effects | Offer safe relevant actions, not an arbitrary first item/quest from the project |
| Pick a destination | Select area + actual arrival point together; changing area clears/reselects point explicitly |

### Inline creation

Already present in limited form: Map reward controls can create an item and select it; Logic has missing-flag and missing-variable creation helpers. This is not yet a shared creation workflow. Current Logic key creation also differs from Game State's identifier restrictions.

Add "Create quest", "Create item", "Create conversation" and "Create story state" within relevant pickers. Use existing store mutations/factories or focused editor helpers, return the new ID, select it and keep the parent operation open. Creation must be cancellable and undoable as one authored change; display an unfinished quest explicitly. Do not automatically recreate a deleted referenced entity because a dropdown cannot resolve it.

### Flags and variables

Present booleans as **Story state** with Yes/No, and variables as **Story values** with Number/Text. Number/Text already exists in Game State and the new dialogue literal editor; retain explicit types, including text like "001". Item possession remains inventory rather than an abstract variable named after an item.

Current flags/variables are record keys, with no separate display label. A schema-free first pass can humanize existing keys for presentation and generate a valid collision-safe key from a friendly creation name, then keep that key stable. It cannot promise independently editable persistent labels. Exact custom labels and rename-without-rekey need a separately reviewed metadata addition/migration later; none is proposed as an implicit V1 dependency. Never rebuild the key from an edited label or re-key generated defeat flags. Keep Inspect key available in Advanced.

## 16. Story Workspace Proposal

The workspace should be a place to author **relationships and their existing owning content**, not one graph that executes every kind of node.

```text
LEFT                         CENTRE                         RIGHT
Search entities              Focus: Guard's story           Selected source editor
Characters                   Guard --assigned--> Dialogue   Conversation/node inspector
World                        Dialogue --starts--> Quest     Response conditions/effects
Items                        Quest --requires--> Key        Quest sequence
Quests / Conversations       Quest --observes--> Gate       Rule WHEN/IF/THEN/ELSE
Story state                  [Open conversation]            Used by / diagnostics
```

Use three explicitly distinct relationships:

- **Conversation flow**: solid, directed edges between dialogue nodes/response outputs. These really are next/choice execution links inside one DialogueDefinition.
- **Authored reference/effect**: labeled "assigned conversation", "starts quest", "requires item", "observes use of". Clicking opens the actual assignment, action or objective. Only editing a valid typed slot changes behavior; a drawn decorative edge cannot start a quest.
- **Navigation/dependency**: dashed "used by" or "related through" links, derived from current records. These are read-only relationships, not scheduling.

For `[Talk to Keeper] -> [Dialogue] -> [Quest] -> [Objective] -> [Old Chest]`, the first edge can mean assignment, the second an actual node-entry start action, the third quest ownership/order and the last an objective target. They do not all mean "then execute". A Key objective's link to a chest that grants Key is an inferred dependency with possibly multiple sources, not an exclusive runtime path.

Initially derive the overview each time from existing data; use local UI layout and selection. A saved freeform story canvas would require authoring metadata not currently present and should be a later explicit decision. Reuse the existing conversation layout only for conversation nodes. This fits the roadmap's reference navigation/validation goals and optional future rule visualization without making a new system mandatory.

## 17. Beginner vs Advanced

Feasible as **alternate views of the same values**, not conversion between two story languages.

Simple mode uses entity chips, contextual options, clear effect timing and recipes. Advanced exposes full current condition/action fields, override/default distinctions, run policies, IDs and imported legacy structures. Graph/List in Dialogue is already a useful precedent.

Requirements:

- Merely opening or switching views must not rewrite data, IDs, array order, absent legacy mode or unsupported imported fields.
- If Simple cannot express an existing value, show an Advanced block/card retaining it. Never simplify OR into AND, remove extra rewards, reset an override or select the first valid target automatically.
- Use current validators and shared runtime evaluators for explanations. Do not implement a second evaluator to make block previews look responsive.
- Keep one history transaction for each drop/template/inline create. Existing map/dialogue history is mounted-workspace scoped; a unified pane needs explicit history ownership to avoid losing undo on navigation.
- Preserve Save/export/import and game-save identity expectations. A new metadata field, if ever needed, requires compatibility tests and deliberate revision treatment, not hidden serialization changes.

## 18. Runtime Mapping

| Authoring surface | Authoritative write | Runtime consumer | UI-only versus semantic work |
| --- | --- | --- | --- |
| WHEN card | `GameRule.trigger` | `ruleEngine.fireTrigger` | UI for existing five variants |
| Nested IF | `GameRule.conditionTree` / `ConditionExpression` | `evaluateConditionExpression` | UI for current leaves/AND/OR |
| THEN / ELSE effect stack | `actions` / `elseActions: GameAction[]` | `runActions`, shared action context | UI; keep order and timing |
| Dialogue topology | `DialogueDefinition`, current node/choice links | `dialogueEngine` | Existing graph already does it |
| Response condition chips | `DialogueChoice.conditions` | `isDialogueChoiceAvailable` | UI for flat AND/current leaves |
| Line-entry effects | `DialogueNode.actions` | `enterDialogueNode` | UI; per-opening guard unchanged |
| Conversation assignment | `Interaction.start_dialogue` on instance/default where intended | Resolved interaction and adapter conversation path | UI; distinction from rule action remains |
| Quick message | `Interaction.show_message.lines` | `interactionMessages` -> temporary dialogue nodes | Existing linear experience |
| After-conversation effects | Supported `Interaction.completionActions` | `finishQuestConversation` / `finishQuestInteraction` | UI in supported contexts only |
| Quest sequence / completion | `Quest`, `ObjectiveCondition`, `completionActions` | `questEngine`, integrated dispatcher | UI; facts/latches/current-state distinction unchanged |
| Container, door, pickup recipe | `ObjectBehaviour`, `Interaction`, `PickupObject` | Existing shared transactions | UI for current behavior; permission gating absent |
| Story state/value | `GameProject.gameState` defaults, referenced keys | Isolated runtime game state | UI labels; independent persistent labels need metadata |
| Entity palette / dependency view | No second authored gameplay model | No new runtime consumer | Derived editor data and ordinary references |

Source boundaries: [runtime session](src/runtime/runtimeSession.ts), [rule engine](src/runtime/ruleEngine.ts), [dialogue engine](src/runtime/dialogueEngine.ts), [quest engine](src/runtime/questEngine.ts), [interaction completion](src/runtime/questInteractions.ts), [object transactions](src/runtime/runtimeObjectInteractions.ts), [shared action dispatcher](src/runtime/runtimeRuleActionDispatcher.ts).

"Compile blocks" should mean **write these exact current fields**. It must not mean serialize an executable StoryGraph and keep it synchronized with a second generated rule set. Runtime helpers must remain free of editor store, React, Phaser and Three dependencies; adapters stay presentation owners.

## 19. Missing Runtime Semantics

### Expected triggers, ranked by authoring value

Every native addition below would require a reviewed authored trigger contract and shared dispatch integration. None becomes available simply because the UI uses the word WHEN. Ranking combines usefulness and the absence of an equally direct existing completion hook.

| Rank / expectation | Bespoke observation now | Authorable bridge today | Value of native trigger |
| --- | --- | --- | --- |
| 1. NPC defeated | Combat `npcDefeated`, defeated set, generated flag | Flag objective or later flag condition; no immediate generic rule. Declared `triggerRequested/on_npc_defeated` is not emitted/implemented | High: common combat story, removes generated-key knowledge; fix completion consistency first |
| 2. Container opens | Successful transaction, `containerOpened`, scoped `container_opened` fact | Open Container objective; optional openedFlag usable later; a one-objective quest can approximate a hook but adds lifecycle machinery | High: exact successful opening is currently easy to confuse with attempted interaction |
| 3. Item collected | Pickup notification/set/optional flag; inventory changes from multiple producers | Physical pickup flag later, or Have item objective; neither is a universal acquisition event | High, but first distinguish this pickup collected from item quantity increased by any source |
| 4. Objective completes | Latch changes, QuestView state, presentation notifications | Split into multiple quests/completion actions as an explicit workaround; no per-objective action hook | Medium-high: helps directed sequences without artificial quest fragmentation |
| 5. Quest completes | Shared quest sync and `completionActions` | Put effects directly on that quest; use a completion flag for a later generic condition | Medium: many immediate effects already have a native home; trigger mainly helps central organization |
| 6. Dialogue ends | Pending interaction completion on close, including Escape | Existing supported completionActions; Map UI exposes Start Quest only, though schema/executor support more | Medium: broader action-list UI can solve much first; natural end versus cancelled close is a separate semantic decision |
| 7. Flag changes | Action/interaction mutations and some notifications | Add effects at each known setter, or test later; no universal listener | Medium/low for V1: useful later, but needs old/new value, equality, ordering and re-entry rules |

A quest with one fact objective is a workaround, not a free generic event bridge: it has activation, completion and once semantics. A later predicate test is not equivalent to reacting at the moment something happened.

### Narrow additions genuinely needed for stronger promises

- **Native permission-gated container**: the literal sample needs a supported precondition/failure path around the existing transaction, or an explicit action invoking it with correctly defined ownership. No current field supplies this. Prefer a narrow reviewed interaction/behavior extension when demanded; never rely on an unrelated rule suppressing fallback.
- **Automatic state-conditioned dialogue entry/next**: needed only if Guard must choose the new greeting without a player selecting a conditional response. Define ordering, fallback and loop behavior in a focused change.
- **Quest status in generic rules**: a real predicate/evaluation-context extension. It already exists in dialogue, which does not make it universally available. Objective status/fact predicates likewise require explicit scope.
- **Physical gate open/unlock**: door use currently transitions and retains key; persistent collision/visual open state would be new gameplay semantics if required.
- **Repeat interaction history**: enforcing "talk again after collecting" through a native repeated Talk objective would need temporal/count/activation-boundary semantics. A visible branch-specific flag recipe can handle the narrow return-report case now.

No such addition is required to ship the proposed first authoring pass. General loops, timers, custom events, joins, graph-local state, cinematic orchestration and a universal StoryGraph executor are not justified by this audit.

### Existing integration concern, separate from new features

Current [runtimeCombat](src/runtime/runtimeCombat.ts) calls `updateQuestProgress` directly on defeat rather than `updateSessionQuestProgress`. It can latch/complete a quest while modern completion actions await a subsequent integrated sync. This remains a source-observed concern, not a new browser reproduction. The prior Dialogue Graph report also recommends reviewing action transaction/modal consistency. Preserve that as a focused follow-up prerequisite for claims about immediate defeat-to-completion effects; don't expand the authoring pass into a runtime refactor.

## 20. Validation / Debugging

### Current error experience

[validateProject](src/data/validateProject.ts) now incorporates [validateDialogue](src/data/validateDialogue.ts). Dialogue diagnostics include local node attribution and graph navigation; the App-level validation panel lists severity, entity type and messages, while issue records carry source paths. It is not a general navigable dependency browser. Existing validation is a meaningful foundation, not a story-correctness proof.

| Author operation | Actual current behavior | Authoring consequence |
| --- | --- | --- |
| Delete NPC definition | NPCs editor blocks deletion while placed | Good basic protection; does not explain all narrative dependencies |
| Delete placed NPC or object | Store deletes matching interact/touch **rules** through `cleanRuleTargetReferences`; other quest/action references may remain | Lost rules cannot appear as dangling-reference errors. Remaining target references can warn; map undo is the immediate recovery route |
| Delete quest | Confirmation; references remain; tracked quest cleared | Validation can flag missing quest actions/conditions. Confirmation's reference scan does not cover every dialogue/quest action use |
| Delete dialogue node | Confirm incoming links; disconnect links; clear Start if necessary; retain repairable missing response target | Graph diagnostics expose broken links/start and unreachable nodes; author must repair intent |
| Delete whole dialogue | Confirmation and cleanup of matching definition/legacy/override assignments | Assignment disappears rather than remaining a broken link; preserve unrelated overrides; no automatic reassignment |
| Rename flag | No dedicated rename UI | Editing an input at one use edits that reference, not a global rename; delete/recreate is unsafe |
| Delete flag/variable in Game State | Remove default and selected rule predicates/actions; flag cleanup also removes some direct set-flag interactions | Can silently weaken an IF or leave an empty group that passes. Dialogue/objective/default/override references are not comprehensively rewritten; remaining uses warn or may recreate state at runtime |
| Delete item | Blocked for scanned pickups, rule conditions/actions, quest ownership objectives and legacy rewards | Scan is incomplete for dialogues, containers, door requirements, shops and modern completion actions; deletion can leave references caught later by validators |
| Rename named entity | Name changes retain its ID | References generally survive, but copied speaker strings/player text do not follow the rename |
| Move object within an area | Existing store updates position and keeps containing area ID | Story target identity remains stable |
| Transfer object to another area | No general cross-area transfer/rewiring workflow was found; ordinary update forces the active containing area | An import/manual transfer retaining ID can leave scoped objectives pointing to the old area; generic target-ID rule may still point to it. Delete/recreate instead removes rules and changes identity |

Further gaps: general `checkReference` skips empty values; direct open-shop interaction validation is incomplete; general duplicate-ID checks are not comprehensive outside dialogue; objective target existence does not prove its interaction is enabled or emits the fact; no universal unreachable-world/impossible-condition analysis. `openedFlag`/`collectedFlag` declaration coverage is not a complete state registry. Do not assume a green indicator means the story works.

Recommended visual error behavior:

- Keep unresolved chips at the original slot: "Missing Guard - Talk step" with the ID available on demand, replacement picker and map/source navigation.
- Highlight the **owning field and affected dependency edge**, not just a top-level count. Explain consequences: "This step cannot finish" or "This rule also runs the door's direct interaction".
- Before destructive edits, show the uses and exact effects: delete, leave broken, or explicit reassignment where supported. Do not silently delete a condition and broaden execution.
- Distinguish structural error, missing declaration warning and behavioral warning. No automatic retargeting by name or resurrection of deleted state.
- Reuse existing issue structures/validators; extend only targeted missing checks. A shared reference index can power pickers, Used by and deletion impact without becoming a second data source.

### Read-only Play story debugger

Already available: RuntimeSession has isolated flags/variables/inventory, quest state and objective latches, opened/collected/defeated sets, dialogue cursor, pending interaction and rule once IDs. `getQuestViews` supplies status/current-step presentation. `getObjectiveEvaluationDiagnostic` returns expected/actual/passed. [debugLog](src/runtime/debugLog.ts) holds bounded text events; [RuntimePanel](src/runtime/RuntimePanel.tsx) and [ThreeRuntimePanel](src/runtime/three/ThreeRuntimePanel.tsx) expose flow logs. Rule evaluation logs fired/skipped, including condition failure or already-run reasons.

A useful read-only pane could show:

```text
Village Passage: Active
Current step: Find Harbour Key
Have Harbour Key x1: false (owned: 0)
Guard permission: Yes
Original refusal: Yes
Dialogue: Guard conversation / Gate instruction (when active)
Recent rule: Chest permission - conditions passed
```

Exact "Last event: Old Chest opened" needs a bounded observation trace of existing notifications; quest facts are sets with no timestamps/order, and cannot reconstruct a last event. A causal trace linking event -> rule -> leaf result -> effect -> quest update is **new diagnostic instrumentation**, not information already present in the text log. Record stable IDs plus resolved labels and distinguish attempts from successful transactions. Keep diagnostic snapshots/logs outside authored project data, read-only and bounded; no new runtime execution engine or mutation console is needed.

## 21. Current vs Proposed Authoring Time

No elapsed-time benchmark is claimed. Writing dialogue and choosing story outcomes remain real creative work; a blocks UI cannot remove them.

| Experience | Authoring effort and conceptual steps | What improves / remains |
| --- | --- | --- |
| Current explicit route | 48 grouped tasks; 9 editor tabs; 11 editing switches; about 49 reference occurrences | Capable but fragmented. Author must know target scopes, action timing, condition vocabularies and the two sample compromises |
| Recommended next Dialogue pass | Same runtime data; most of the 14 response conditions, 3 entry effects and NPC assignment stay in one context | Removes re-selection and missing-content detours in the densest part. World/quest sequence/rule setup still exists; do not claim full-workspace metrics yet |
| Full hybrid authoring target | About 10-12 conceptual compositions across Map + Story and focused embedded editors | Repeated entity/ID wiring can be inferred; content and semantics remain explicit |

The hybrid target journey is:

1. Place/select Guard, Chest and Gate in Map.
2. Choose Quest giver on Guard; name the quest inline.
3. Write offer/Yes/No; attach Start quest and remember refusal at their visible moments.
4. Create/select Harbour Key inline.
5. Build quest sequence by adding Guard, Key and Gate.
6. Configure the chest reward/permission recipe, **or show its native permission limitation** rather than invent support.
7. Configure Gate's key and destination point.
8. Add the item-conditioned progress response and instruction.
9. Add completion responses that remember the original choice.
10. Inspect relationship/validation view and test both branches, denial, repeats and Continue.

This is a design target, not proof of a 48-to-10 click reduction. Templates contain several underlying operations. A follow-up usability check should use the same starting project and supported approximation, record actual switches, duplicate searches, manual key entry and successful first Play, and ask the author to explain WHEN a quest starts and what a connection means. Improvement means fewer repeated decisions and fewer semantic mistakes, not simply a more colorful graph. Test the literal chest/greeting requirements separately if semantics change later.

## 22. Recommended Product Architecture

Choose **C. Hybrid**.

| Option | Assessment |
| --- | --- |
| A. Improve each editor separately | Useful immediate work, but independent pickers/creation/deletion/navigation can continue to diverge; author still mentally connects the story |
| B. Unified Story Workspace as the primary editor | Can still write existing schemas and reduce navigation, but replacing every detailed authoring surface together is a much larger UX change. A universal execution graph is neither required by this option nor justified |
| C. Shared Story Workspace with specialized views | Best fit: shared entity references, inline creation, dependency navigation and recipes; conversation topology, objective sequence and event rules retain their current contracts |

Separate responsibilities:

- Derived entity/reference presentation and capability descriptions belong to the editor layer.
- Existing store mutations remain the authoring write path; reusable command helpers may coordinate a drop/template, but no second store of story truth.
- Dialogue graph edits dialogue links, Quest sequence edits objectives, Logic blocks edit GameRule.
- The workspace reads those records to explain relationships and opens the correct owner for edits.
- Shared runtime helpers and isolated Play state remain authoritative. Map 2D/3D views keep their current common selection/mutations and scene lifetime ownership.

This aligns with roadmap work on reference navigation, deletion warnings and optional advanced rule views. It does not require bringing future cinematic, procedural asset or generic scripting systems into scope.

## 23. Minimum Viable Implementation

The smallest high-impact slice is **entity-based dialogue wiring**, not the entire proposed vocabulary/workspace. The sample's dialogue setup repeatedly chooses the same quest, item and state and then leaves to assign it. Build one reusable reference foundation in that existing editor first.

V1 scope:

1. A searchable palette of **placed characters, items, quests and story-state keys**, with friendly chips, area/location disambiguation and keyboard/click insertion as well as drag.
2. Typed drop slots for current response predicates and node-entry actions. Start with Have/Do not have item, flag Yes/No, dialogue-only Quest status, Set flag, Give/Remove item and Start quest. Keep all other existing fields in Advanced.
3. Inline item, flag and minimal quest creation that returns/selects the new stable ID. Offer the existing quest configuration as a focused editing surface; mark empty objectives visibly. Do not build a new quest engine or broad quest graph.
4. A placed-character assignment/use panel in Dialogues, reusing existing Start dialogue interactions/overrides and Open dialogue navigation. Explicitly distinguish copying a speaker name from assigning a conversation.
5. One Quest giver Yes/No recipe that creates visible branch-specific nodes/effects and ordinary state/quest records. Preview what it changes and preserve existing unrelated content.
6. Diagnostics at the target slot, stable ID preservation, atomic undo for authoring operations, and lossless Advanced fallback.

Defer full Map canvas-to-graph dragging, freeform cross-system canvas persistence, generic rule block canvas, broad templates, all lifecycle triggers, automatic greetings, native chest gating and state-label schema additions. Reuse existing rule AND/OR forms when needed; they already compose correctly.

### Focused acceptance criteria for that future pass

- A creator can select Guard, create/select a quest and key without losing the conversation context, wire Yes/No, condition a response on the key, remember refusal and assign the conversation to the placed Guard without entering an entity UUID.
- Existing data remains identical when switching views without edits. Drops update only the intended current union fields; no new runtime types or dependencies.
- Duplicate names resolve to the intended placement; deletion remains visible; imported unsupported/legacy data survives; cancellation and undo leave no orphan content.
- Save/export/import and fresh Play/Continue retain choice effects and IDs; Play does not change defaults. Existing Graph/List navigation and action order remain correct.
- Inserting Quest status in a rule or a tree group in a dialogue is not offered as supported. Starting a quest is attached to the intended accepted branch, not every close.
- Review source/diff, run focused graph-model/component/store/reference checks, then the required CI once. Use one targeted browser authoring check only because actual drag/input acceptance changed; no heavy matrices or new broad suite.

This gives a reusable selector/drop/inline-creation foundation for subsequent Quest sequence and Logic block work while creating a noticeable improvement immediately.

## 24. Recommended Next Implementation

**Choose: extend Dialogue Graph with entity/action drag-and-drop first - "Dialogue Entity Wiring V1".**

Why this next pass: topology is already solved, all 15 action fields already work, and the sample concentrates fourteen conditional entries, three entry effects and assignment here. Improving these operations removes repeated lookup and tab travel. Quest authoring already has sequential objectives and named scoped targets; Logic already has WHEN/IF/THEN/ELSE and recursive groups. Making either one a standalone canvas first would leave the central conversation-to-state-to-quest connection mostly unchanged.

The next pass should implement only section 23 and measure its reduction in repeated reference decisions. The broader Story Workspace is the product direction, not a prerequisite. Preserve the separately identified runtime consistency work, but do not bundle new triggers, automatic routing or permission gating into the UX pass. Exact native chest gating and automatic greeting selection require their own explicit acceptance criteria and future contract review.

## 25. Bottom Line

Make story authoring begin with **Guard, Old Chest, Harbour Key and Village Passage**, then show the valid things each can do in the current context. Infer stable references and safe defaults; create missing content inline; use visible recipes for common wiring; explain when effects run; retain specialized conversation and quest views.

The engine should do the bookkeeping. The creator should choose the story. A unified view over existing data can deliver that without a separate StoryGraph runtime, but a friendly block must never promise an opening event, conditional greeting or generic predicate that the current engine does not support.

### Verification for this audit

- Inspected current schema, relevant editor/store/runtime/validation source, focused test implementations, current AGENTS.md/README/ROADMAP/runtime guidance and both requested earlier reports. This is a source-based journey, not newly recorded UI timing.
- Only `NARRATIVE_AUTHORING_UX_AUDIT.md` was authored. Existing staged Dialogue Graph/capability-audit work was preserved; no production, schema, runtime or test edits were made for this task.
- Required `npm.cmd run ci` executed **once and passed**: **106 Vitest files / 904 tests**, root build, both contract builds, preview-package build, Studio build, and **77 Node compiler/asset tests**. Root and Studio builds emitted large-chunk advisories; they completed successfully.
- No browser suite, visual/performance matrix, real Blender matrix or overlapping compiler gate was run for this documentation-only task. Existing browser reports are not represented as new passes.
- Final review: all 25 requested sections are present; local Markdown source links resolve; `git diff --check` and `git diff --cached --check` are clean. The new untracked document also passes a whitespace check against `/dev/null` (the normal no-index difference exit status is 1). Worktree status matches the initial staged files plus this audit only.
