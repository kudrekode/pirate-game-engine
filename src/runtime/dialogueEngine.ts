import type {
	DialogueChoice,
	DialogueCondition,
	DialogueDefinition,
	DialogueNode,
} from "../types/game";
import { hasItem } from "./inventory";
import type { RuntimeQuestState } from "./questEngine";
import {
	type RuleActionContext,
	type RuntimeGameState,
	runActions,
} from "./ruleEngine";

export type RuntimeDialogueState = {
	dialogueId: string;
	nodeId: string;
	enteredNodeIds: Set<string>;
};

function compareValues(
	left: number | string,
	right: number | string,
	operator: string,
): boolean {
	if (operator === "==") {
		return left === right;
	}
	if (operator === "!=") {
		return left !== right;
	}
	if (typeof left !== "number" || typeof right !== "number") {
		return false;
	}
	if (operator === ">") {
		return left > right;
	}
	if (operator === "<") {
		return left < right;
	}
	if (operator === ">=") {
		return left >= right;
	}
	return left <= right;
}

export function getDialogueNode(
	dialogue: DialogueDefinition,
	nodeId: string,
): DialogueNode | undefined {
	return dialogue.nodes.find((node) => node.id === nodeId);
}

export function createRuntimeDialogueState(
	dialogue: DialogueDefinition,
): RuntimeDialogueState {
	return {
		dialogueId: dialogue.id,
		enteredNodeIds: new Set<string>(),
		nodeId: dialogue.startNodeId,
	};
}

export function evaluateDialogueCondition(
	condition: DialogueCondition,
	runtimeState: RuntimeGameState,
	questState: RuntimeQuestState,
): boolean {
	if (condition.type === "flag_is") {
		return (runtimeState.flags[condition.flag] ?? false) === condition.value;
	}

	if (condition.type === "has_item") {
		return hasItem(
			runtimeState.inventory,
			condition.itemId,
			condition.quantity,
		);
	}

	if (condition.type === "not_has_item") {
		return !hasItem(
			runtimeState.inventory,
			condition.itemId,
			condition.quantity,
		);
	}

	if (condition.type === "quest_status") {
		return (
			questState.quests.find((quest) => quest.id === condition.questId)
				?.status === condition.status
		);
	}

	const currentValue = runtimeState.variables[condition.variable];
	return currentValue === undefined
		? false
		: compareValues(currentValue, condition.value, condition.operator);
}

export function isDialogueChoiceAvailable(
	choice: DialogueChoice,
	runtimeState: RuntimeGameState,
	questState: RuntimeQuestState,
): boolean {
	return (choice.conditions ?? []).every((condition) =>
		evaluateDialogueCondition(condition, runtimeState, questState),
	);
}

export function getAvailableDialogueChoices(
	node: DialogueNode,
	runtimeState: RuntimeGameState,
	questState: RuntimeQuestState,
): DialogueChoice[] {
	return node.type === "choice"
		? node.choices.filter((choice) =>
				isDialogueChoiceAvailable(choice, runtimeState, questState),
			)
		: [];
}

export function enterDialogueNode(
	dialogueState: RuntimeDialogueState,
	node: DialogueNode,
	context: RuleActionContext,
	onDone: () => void,
): void {
	if (dialogueState.enteredNodeIds.has(node.id)) {
		onDone();
		return;
	}

	dialogueState.enteredNodeIds.add(node.id);
	runActions(node.actions ?? [], context, onDone);
}

export function advanceDialogue(
	dialogue: DialogueDefinition,
	dialogueState: RuntimeDialogueState,
	choiceId?: string,
): DialogueNode | undefined {
	const node = getDialogueNode(dialogue, dialogueState.nodeId);
	if (!node) {
		return undefined;
	}

	if (node.type === "text") {
		dialogueState.nodeId = node.nextNodeId ?? "";
		return dialogueState.nodeId
			? getDialogueNode(dialogue, dialogueState.nodeId)
			: undefined;
	}

	if (node.type === "choice") {
		const choice = node.choices.find((candidate) => candidate.id === choiceId);
		dialogueState.nodeId = choice?.targetNodeId ?? "";
		return dialogueState.nodeId
			? getDialogueNode(dialogue, dialogueState.nodeId)
			: undefined;
	}

	dialogueState.nodeId = "";
	return undefined;
}
