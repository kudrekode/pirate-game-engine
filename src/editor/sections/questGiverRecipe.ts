import type { DialogueDefinition, GameProject, Quest } from "../../types/game";
import {
	type DialogueEntityRef,
	dialogueAssignmentPatch,
	placedDialogueNpc,
} from "./dialogueEntities";
import { autoLayoutDialogue, makeDialogueId } from "./dialogueGraphModel";

export type QuestGiverInput = {
	character: DialogueEntityRef;
	questId: string;
	acceptanceFlag?: string;
	refusalFlag?: string;
	conversationId?: string;
	conversationSnapshot?: string;
};

/** A recipe produces only ordinary authored records. Previewing never mutates. */
export function makeQuestGiver(
	project: GameProject,
	input: QuestGiverInput,
): DialogueDefinition | undefined {
	const npc = placedDialogueNpc(project, input.character);
	const quest = project.quests.find((q) => q.id === input.questId);
	const existing = input.conversationId
		? project.dialogues.find((d) => d.id === input.conversationId)
		: undefined;
	if (
		input.conversationId &&
		(!existing || !existing.nodes.some((n) => n.id === existing.startNodeId))
	)
		return;
	if (
		!npc ||
		!quest ||
		[input.acceptanceFlag, input.refusalFlag].some(
			(flag) => flag && !(flag in project.gameState.flags),
		)
	)
		return;
	const choiceId = makeDialogueId("node"),
		yesId = makeDialogueId("node"),
		noId = makeDialogueId("node"),
		endId = makeDialogueId("node");
	const dialogue: DialogueDefinition = {
		id: existing?.id ?? makeDialogueId("dialogue"),
		name: existing?.name ?? `${npc.name}: ${quest.name}`,
		startNodeId: choiceId,
		nodes: [
			{
				id: choiceId,
				type: "choice",
				speaker: npc.name,
				text: `Will you help with ${quest.name}?`,
				choices: [
					{
						id: makeDialogueId("choice"),
						text: "Yes",
						targetNodeId: yesId,
						conditions: [],
					},
					{
						id: makeDialogueId("choice"),
						text: "No",
						targetNodeId: noId,
						conditions: [],
					},
				],
			},
			{
				id: yesId,
				type: "text",
				speaker: npc.name,
				text: "Thank you. I am counting on you.",
				nextNodeId: existing?.startNodeId ?? endId,
				actions: [
					{ type: "activate_quest", questId: quest.id },
					...(input.acceptanceFlag
						? [
								{
									type: "set_flag" as const,
									flag: input.acceptanceFlag,
									value: true,
								},
							]
						: []),
				],
			},
			{
				id: noId,
				type: "text",
				speaker: npc.name,
				text: "Perhaps another time.",
				nextNodeId: endId,
				...(input.refusalFlag
					? {
							actions: [
								{
									type: "set_flag" as const,
									flag: input.refusalFlag,
									value: true,
								},
							],
						}
					: {}),
			},
			{ id: endId, type: "end" as const, speaker: npc.name, text: "Farewell." },
			...(existing ? structuredClone(existing.nodes) : []),
		],
	};
	dialogue.editorLayout = autoLayoutDialogue(dialogue);
	if (existing?.editorLayout) {
		const offset =
			Math.max(
				0,
				...Object.values(existing.editorLayout.nodes).map((p) => p.x),
			) + 420;
		for (const node of dialogue.nodes.slice(0, 4))
			dialogue.editorLayout.nodes[node.id].x += offset;
		Object.assign(dialogue.editorLayout.nodes, existing.editorLayout.nodes);
	}
	return dialogue;
}

/** One store update owns the fresh conversation and exact placed-NPC override. */
export function commitQuestGiver(
	project: GameProject,
	input: QuestGiverInput,
	dialogue: DialogueDefinition,
	newQuest?: Quest,
): boolean {
	if (
		newQuest &&
		(newQuest.id !== input.questId ||
			project.quests.some((q) => q.id === newQuest.id))
	)
		return false;
	const validationProject = newQuest
		? { ...project, quests: [...project.quests, newQuest] }
		: project;
	if (
		!makeQuestGiver(validationProject, input) ||
		input.character.kind !== "npc"
	)
		return false;
	const existing = project.dialogues.find((d) => d.id === dialogue.id);
	if (
		existing &&
		(!input.conversationId ||
			JSON.stringify(existing) !== input.conversationSnapshot)
	)
		return false;
	if (input.conversationId && !existing) return false;
	const ref = input.character;
	const placed = project.areas
		.find((a) => a.id === ref.areaId)
		?.npcs.find((n) => n.id === ref.id);
	if (!placed) return false;
	if (newQuest) project.quests.push(structuredClone(newQuest));
	if (existing)
		project.dialogues = project.dialogues.map((d) =>
			d.id === existing.id ? dialogue : d,
		);
	else project.dialogues.push(dialogue);
	const patch = dialogueAssignmentPatch(project, input.character, dialogue.id)!;
	// Recipe replaces the reviewed interaction. No branch effect may leak through
	// inherited completionActions, which also run on early close.
	patch.interaction = { ...patch.interaction!, completionActions: [] };
	patch.interactionOverride = patch.interaction;
	Object.assign(placed, patch);
	return true;
}
