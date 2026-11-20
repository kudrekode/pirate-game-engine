import { resolveObjectBehaviour } from "../../runtime/interactionDiscovery";
import type { DialogueDefinition, GameProject, Quest } from "../../types/game";
import {
	createDialogueEntity,
	type DialogueEntityRef,
	placedDialogueNpc,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { makeChoice, makeDialogueId, makeNode } from "./dialogueGraphModel";
import {
	commitQuestGiver,
	makeQuestGiver,
	type QuestGiverInput,
} from "./questGiverRecipe";
import { makeEntityObjective, makeFetchObjectives } from "./questSequenceModel";

export type StoryFetchPreview = {
	quest: Quest;
	dialogue: DialogueDefinition;
	input: QuestGiverInput;
	item: DialogueEntityRef;
};
export function previewStoryFetch(
	project: GameProject,
	character: DialogueEntityRef,
	item: DialogueEntityRef,
	name: string,
): StoryFetchPreview | undefined {
	if (!name.trim() || item.kind !== "item") return;
	if (
		!placedDialogueNpc(project, character) ||
		!resolveDialogueEntity(project, item)
	)
		return;
	const scratch = structuredClone(project);
	const ref = createDialogueEntity(scratch, {
		kind: "quest",
		name,
		description: "",
		category: "quest",
		value: false,
	});
	const quest = scratch.quests.find((q) => q.id === ref.id)!;
	const input = { character, questId: quest.id },
		dialogue = makeQuestGiver(scratch, input);
	if (!dialogue || !commitQuestGiver(scratch, input, dialogue)) return;
	const objectives = makeFetchObjectives(scratch, character, item);
	if (!objectives) return;
	quest.objectives = objectives;
	return { quest, dialogue, input, item };
}
export function commitStoryFetch(
	project: GameProject,
	preview: StoryFetchPreview,
): boolean {
	if (
		project.quests.some((q) => q.id === preview.quest.id) ||
		project.dialogues.some((d) => d.id === preview.dialogue.id) ||
		!placedDialogueNpc(project, preview.input.character) ||
		!resolveDialogueEntity(project, preview.item)
	)
		return false;
	project.quests.push(structuredClone(preview.quest));
	return commitQuestGiver(
		project,
		preview.input,
		structuredClone(preview.dialogue),
	);
}

export type KeyedPassageInput = {
	door: DialogueEntityRef;
	itemId: string;
	destination: DialogueEntityRef;
	questId?: string;
};
export function configureKeyedPassage(
	project: GameProject,
	input: KeyedPassageInput,
): boolean {
	const { door, destination } = input;
	if (
		door.kind !== "object" ||
		destination.kind !== "event" ||
		!resolveDialogueEntity(project, destination) ||
		!project.items.some((i) => i.id === input.itemId) ||
		(input.questId && !project.quests.some((q) => q.id === input.questId))
	)
		return false;
	const object = project.areas
		.find((a) => a.id === door.areaId)
		?.objects.find((o) => o.id === door.id);
	if (!object) return false;
	const behaviour = resolveObjectBehaviour(project, object);
	if (behaviour.type !== "door") return false;
	const interaction =
		object.interaction ??
		project.objects.find((d) => d.id === object.objectDefinitionId)
			?.defaultInteraction;
	if (
		interaction?.type === "object_behaviour" &&
		interaction.activationMode === "disabled"
	)
		object.interaction = { ...interaction, activationMode: "on_interact" };
	object.behaviourOverride = {
		...behaviour,
		requiredItemId: input.itemId,
		targetAreaId: destination.areaId,
		targetEventBlockId: destination.id,
	};
	if (input.questId) {
		const objective = makeEntityObjective(project, door, "door_used");
		if (objective)
			project.quests
				.find((q) => q.id === input.questId)!
				.objectives.push(objective);
	}
	return true;
}

export function createCharacterConversation(
	project: GameProject,
	ref: DialogueEntityRef,
): DialogueDefinition | undefined {
	const character = placedDialogueNpc(project, ref);
	if (!character) return;
	const node = makeNode("end");
	node.speaker = character.name;
	node.text = "Hello.";
	const dialogue = {
		id: makeDialogueId("dialogue"),
		name: `${character.name} Conversation`,
		startNodeId: node.id,
		nodes: [node],
	};
	project.dialogues.push(dialogue);
	return dialogue; // Assignment remains the existing reviewed owning control.
}

export function addContextResponse(
	project: GameProject,
	dialogueId: string,
	nodeId: string,
	text: string,
	targetId: string,
) {
	const dialogue = project.dialogues.find((d) => d.id === dialogueId),
		node = dialogue?.nodes.find((n) => n.id === nodeId);
	if (
		node?.type !== "choice" ||
		!text.trim() ||
		!dialogue?.nodes.some((n) => n.id === targetId)
	)
		return;
	const choice = { ...makeChoice(), text: text.trim(), targetNodeId: targetId };
	node.choices.push(choice);
	return choice;
}
