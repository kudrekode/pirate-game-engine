# Dialogue graph V1: source contract audit

Audited before UI implementation, 21 October 2026.

`src/types/game.ts` is authoritative. `DialogueDefinition` requires `id`, `name`,
`startNodeId: string`, and `nodes: DialogueNode[]`. Start is a local node reference,
not a node type. All nodes require stable `id` and discriminant `type`; all accept
optional `speaker: string`, `portraitId: string`, `actions: GameAction[]`.

| Type | Additional fields |
| --- | --- |
| text | Required `text: string`; optional `nextNodeId: string` |
| choice | Optional `text: string`; required `choices: DialogueChoice[]` |
| end | Optional `text: string`; no outgoing link |

Responses require `id`, `text`, `targetNodeId` (all strings), and optionally
`conditions: DialogueCondition[]`. IDs are local to the owning dialogue/node.
Response order is semantic; changing order must retain IDs. Empty targets are
representable during editing. Conditions are a flat AND list:

- `flag_is`: `flag: string`, `value: boolean`.
- `variable_compare`: `variable: string`, `operator: == | != | > | < | >= | <=`,
  `value: number | string` (strict equality preserves the value type).
- `has_item` / `not_has_item`: `itemId: string`, optional `quantity` (default 1).
- `quest_status`: `questId: string`, `status: inactive | active | completed | failed`.

Entry actions reuse all 15 `GameAction` variants: set_flag(flag,value),
set_variable(variable,value), change_variable(variable,amount),
give_item/remove_item(itemId,quantity), activate_quest/complete_quest/fail_quest(questId),
play_cutscene(cutsceneId), teleport(areaId,eventBlockId),
change_movement_mode(mode excluding swim), set_npc_alignment(npcId,alignment),
set_npc_health(npcId,value), open_shop(shopId), end_game(). NPC IDs identify placed
instances. Actions execute sequentially and only once per node per conversation
opening, including loops. The existing DialogueEditor lacks several action forms
and exposes teleport without destination fields. Logic already supports all variants.

`dialogueEngine.ts` owns condition evaluation, available choices, entry actions
(through shared runActions), cursor and advance. Both adapters use it. Missing
next/targets end a conversation; End is explicit termination. No automatic routing.
Speaker remains free text. `portraitPresets` and portrait-kind `pixelAssets` are
discoverable references, not typed speaker relations.

Migration (`migrateProject.ts`) generates deterministic fallback dialogue/node/choice
IDs only when absent, defaults missing dialogues/nodes/choices to empty arrays,
defaults missing start to first node, preserves explicitly empty start, normalizes
conditions to arrays, omits empty optional speaker/portrait/actions/text, and defaults
unknown node types to text. JSON project Save/export passes through migration;
cloneProject uses JSON. New optional layout metadata must survive migration and
must never repair links, recreate deleted nodes, or reorder semantic arrays.

Existing editor helpers: local makeNode/makeChoice/replaceNode and store
addDialogue/updateDialogue/deleteDialogue. Store IDs use UUIDs. Deleting a dialogue
clears assignment references. Map Inspector already assigns Start dialogue.
No graph/canvas/layout dependency is installed. Map workspace history is the only
history implementation: 50 project snapshots, grouped edits, context reset. Reuse
that implementation for dialogue editing rather than adding another history engine.

Game saves persist flags, variables, inventory, quests and other session state;
dialogue cursor stays transient. Exact authored-revision hashes exclude active area.
Exclude the new dialogue layout metadata too, preserving the pre-layout hash and
avoiding invalidating Continue just by dragging a graph node. No save version change.

Project validation currently omits dialogue traversal. V1 adds structural diagnostics
and references; cycles remain legal, unreachable/fallback risks remain warnings.
