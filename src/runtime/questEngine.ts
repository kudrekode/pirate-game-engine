import type {
	ItemDefinition,
	Objective,
	ObjectiveCondition,
	Quest,
	QuestReward,
	QuestStatus,
} from "../types/game";
import { giveItem, hasItem } from "./inventory";
import {
	type RuleActionContext,
	type RuntimeGameState,
	runActions,
} from "./ruleEngine";

export type RuntimeQuestState = {
	quests: Quest[];
	enteredAreaIds: Set<string>;
	rewardedQuestIds: Set<string>;
	completedObjectiveIds: Set<string>;
};

export type QuestView = {
	id: string;
	name: string;
	description?: string;
	status: QuestStatus;
	objectives: {
		id: string;
		description: string;
		complete: boolean;
	}[];
};

export type ObjectiveEvaluationDiagnostic = {
	conditionType: ObjectiveCondition["type"];
	expected: string;
	actual: string;
	passed: boolean;
};

function cloneQuests(quests: Quest[]): Quest[] {
	return JSON.parse(JSON.stringify(quests)) as Quest[];
}

function objectiveKey(questId: string, objectiveId: string): string {
	return `${questId}:${objectiveId}`;
}

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

export function createRuntimeQuestState(quests: Quest[]): RuntimeQuestState {
	return {
		quests: cloneQuests(quests),
		enteredAreaIds: new Set<string>(),
		rewardedQuestIds: new Set<string>(),
		completedObjectiveIds: new Set<string>(),
	};
}

export function markAreaEntered(
	state: RuntimeQuestState,
	areaId: string,
): void {
	state.enteredAreaIds.add(areaId);
}

export function evaluateObjectiveCondition(
	condition: ObjectiveCondition,
	runtimeState: RuntimeGameState,
	enteredAreaIds: Set<string>,
): boolean {
	if (condition.type === "flag") {
		return (runtimeState.flags[condition.flag] ?? false) === condition.value;
	}

	if (condition.type === "has_item") {
		return hasItem(
			runtimeState.inventory,
			condition.itemId,
			condition.quantity,
		);
	}

	if (condition.type === "enter_area") {
		return enteredAreaIds.has(condition.areaId);
	}

	const value = runtimeState.variables[condition.variable];
	return value === undefined
		? false
		: compareValues(value, condition.value, condition.operator);
}

export function getObjectiveEvaluationDiagnostic(
	condition: ObjectiveCondition,
	runtimeState: RuntimeGameState,
	enteredAreaIds: Set<string>,
): ObjectiveEvaluationDiagnostic {
	const passed = evaluateObjectiveCondition(
		condition,
		runtimeState,
		enteredAreaIds,
	);
	if (condition.type === "flag") {
		const actual =
			condition.flag in runtimeState.flags
				? String(runtimeState.flags[condition.flag])
				: "missing (defaults false)";
		return {
			conditionType: condition.type,
			expected: `${condition.flag}=${condition.value}`,
			actual,
			passed,
		};
	}

	if (condition.type === "has_item") {
		return {
			conditionType: condition.type,
			expected: `${condition.itemId}>=${condition.quantity}`,
			actual: String(runtimeState.inventory.items[condition.itemId] ?? 0),
			passed,
		};
	}

	if (condition.type === "enter_area") {
		return {
			conditionType: condition.type,
			expected: `entered ${condition.areaId}`,
			actual: String(enteredAreaIds.has(condition.areaId)),
			passed,
		};
	}

	const actual = runtimeState.variables[condition.variable];
	return {
		conditionType: condition.type,
		expected: `${condition.variable}${condition.operator}${String(condition.value)}`,
		actual: actual === undefined ? "missing" : String(actual),
		passed,
	};
}

export function getQuestSyncDiagnosticMessages(
	state: RuntimeQuestState,
	runtimeState: RuntimeGameState,
): string[] {
	const activeQuests = state.quests.filter(
		(quest) => quest.status === "active",
	);
	if (activeQuests.length === 0) {
		return ["Quest sync: no active quests evaluated."];
	}

	return activeQuests.flatMap((quest) =>
		quest.objectives.map((objective) => {
			const diagnostic = getObjectiveEvaluationDiagnostic(
				objective.condition,
				runtimeState,
				state.enteredAreaIds,
			);
			return `Quest check: ${quest.name} / ${objective.description} [${diagnostic.conditionType}] expected ${diagnostic.expected}, actual ${diagnostic.actual}, passed ${diagnostic.passed}.`;
		}),
	);
}

export function runQuestCompletionActionsOnce(
	quest: Quest,
	completedQuestActionIds: Set<string>,
	context: RuleActionContext,
	onDone: () => void = () => undefined,
): boolean {
	if (
		completedQuestActionIds.has(quest.id) ||
		!quest.completionActions?.length
	) {
		return false;
	}

	completedQuestActionIds.add(quest.id);
	runActions(quest.completionActions, context, onDone);
	return true;
}

export function evaluateObjective(
	objective: Objective,
	runtimeState: RuntimeGameState,
	enteredAreaIds: Set<string>,
): boolean {
	return evaluateObjectiveCondition(
		objective.condition,
		runtimeState,
		enteredAreaIds,
	);
}

export function evaluateQuest(
	quest: Quest,
	runtimeState: RuntimeGameState,
	enteredAreaIds: Set<string>,
): boolean {
	return (
		quest.objectives.length > 0 &&
		quest.objectives.every((objective) =>
			evaluateObjective(objective, runtimeState, enteredAreaIds),
		)
	);
}

export function grantQuestReward(
	reward: QuestReward,
	runtimeState: RuntimeGameState,
	itemDefinitions: ItemDefinition[],
): void {
	if (reward.type === "item") {
		giveItem(
			runtimeState.inventory,
			itemDefinitions,
			reward.itemId,
			reward.quantity,
		);
		return;
	}

	if (reward.type === "flag") {
		runtimeState.flags[reward.flag] = reward.value;
		return;
	}

	const currentValue = runtimeState.variables[reward.variable];
	runtimeState.variables[reward.variable] =
		(typeof currentValue === "number" ? currentValue : 0) + reward.amount;
}

export function completeQuest(
	state: RuntimeQuestState,
	questId: string,
	runtimeState: RuntimeGameState,
	itemDefinitions: ItemDefinition[],
): boolean {
	const quest = state.quests.find((candidate) => candidate.id === questId);
	if (!quest) {
		return false;
	}

	const statusChanged = quest.status !== "completed";
	quest.status = "completed";
	quest.objectives.forEach((objective) => {
		state.completedObjectiveIds.add(objectiveKey(quest.id, objective.id));
	});
	if (state.rewardedQuestIds.has(quest.id)) {
		return statusChanged;
	}

	quest.rewards?.forEach((reward) => {
		grantQuestReward(reward, runtimeState, itemDefinitions);
	});
	state.rewardedQuestIds.add(quest.id);
	return true;
}

export function activateQuest(
	state: RuntimeQuestState,
	questId: string,
): boolean {
	const quest = state.quests.find((candidate) => candidate.id === questId);
	if (!quest || quest.status === "active") {
		return false;
	}

	quest.status = "active";
	return true;
}

export function failQuest(state: RuntimeQuestState, questId: string): boolean {
	const quest = state.quests.find((candidate) => candidate.id === questId);
	if (!quest || quest.status === "failed") {
		return false;
	}

	quest.status = "failed";
	return true;
}

export function updateQuestProgress(
	state: RuntimeQuestState,
	runtimeState: RuntimeGameState,
	itemDefinitions: ItemDefinition[],
): boolean {
	let changed = false;
	let completedInPass = true;

	while (completedInPass) {
		completedInPass = false;
		state.quests.forEach((quest) => {
			if (quest.status === "active") {
				quest.objectives.forEach((objective) => {
					if (
						!state.completedObjectiveIds.has(
							objectiveKey(quest.id, objective.id),
						) &&
						evaluateObjective(objective, runtimeState, state.enteredAreaIds)
					) {
						state.completedObjectiveIds.add(
							objectiveKey(quest.id, objective.id),
						);
						changed = true;
					}
				});
			}

			if (
				quest.status === "active" &&
				quest.objectives.length > 0 &&
				quest.objectives.every((objective) =>
					state.completedObjectiveIds.has(objectiveKey(quest.id, objective.id)),
				) &&
				completeQuest(state, quest.id, runtimeState, itemDefinitions)
			) {
				changed = true;
				completedInPass = true;
			}
		});
	}

	return changed;
}

export function getQuestViews(
	state: RuntimeQuestState,
	_runtimeState: RuntimeGameState,
): QuestView[] {
	return state.quests.map((quest) => ({
		id: quest.id,
		name: quest.name,
		description: quest.description,
		status: quest.status,
		objectives: quest.objectives.map((objective) => ({
			id: objective.id,
			description: objective.description,
			complete: state.completedObjectiveIds.has(
				objectiveKey(quest.id, objective.id),
			),
		})),
	}));
}
