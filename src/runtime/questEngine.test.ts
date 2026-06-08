import { describe, expect, it } from "vitest";
import type { ItemDefinition, Quest } from "../types/game";
import {
	activateQuest,
	completeQuest,
	createRuntimeQuestState,
	evaluateObjectiveCondition,
	failQuest,
	getObjectiveEvaluationDiagnostic,
	getQuestSyncDiagnosticMessages,
	grantQuestReward,
	markAreaEntered,
	updateQuestProgress,
} from "./questEngine";
import { createRuntimeState, fireTrigger } from "./ruleEngine";

const items: ItemDefinition[] = [
	{
		id: "gold_coin",
		name: "Gold Coin",
		category: "currency",
		stackable: true,
		maxStack: 99,
	},
	{ id: "boat_pass", name: "Boat Pass", category: "quest", stackable: false },
];

function makeRuntimeState() {
	return createRuntimeState({
		flags: { cave_open: true },
		variables: { gold: 10 },
		inventory: { gold_coin: 5 },
	});
}

function makeQuest(): Quest {
	return {
		id: "tavern-access",
		name: "Get Tavern Access",
		status: "active",
		objectives: [
			{
				id: "coins",
				description: "Have coins",
				condition: { type: "has_item", itemId: "gold_coin", quantity: 5 },
			},
			{
				id: "flag",
				description: "Open cave",
				condition: { type: "flag", flag: "cave_open", value: true },
			},
			{
				id: "gold",
				description: "Save gold",
				condition: {
					type: "variable_compare",
					variable: "gold",
					operator: ">=",
					value: 10,
				},
			},
			{
				id: "enter",
				description: "Enter tavern",
				condition: { type: "enter_area", areaId: "tavern" },
			},
		],
		rewards: [{ type: "item", itemId: "boat_pass", quantity: 1 }],
	};
}

describe("quest objective evaluation", () => {
	it("evaluates item, flag, variable, and entered-area objectives", () => {
		const runtimeState = makeRuntimeState();
		const enteredAreaIds = new Set(["tavern"]);

		expect(
			evaluateObjectiveCondition(
				{ type: "has_item", itemId: "gold_coin", quantity: 5 },
				runtimeState,
				enteredAreaIds,
			),
		).toBe(true);
		expect(
			evaluateObjectiveCondition(
				{ type: "flag", flag: "cave_open", value: true },
				runtimeState,
				enteredAreaIds,
			),
		).toBe(true);
		expect(
			evaluateObjectiveCondition(
				{
					type: "variable_compare",
					variable: "gold",
					operator: ">=",
					value: 10,
				},
				runtimeState,
				enteredAreaIds,
			),
		).toBe(true);
		expect(
			evaluateObjectiveCondition(
				{ type: "enter_area", areaId: "tavern" },
				runtimeState,
				enteredAreaIds,
			),
		).toBe(true);
	});
});

describe("quest progress", () => {
	it("completes a quest automatically and grants rewards once", () => {
		const runtimeState = makeRuntimeState();
		const questState = createRuntimeQuestState([makeQuest()]);
		markAreaEntered(questState, "tavern");

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
		expect(runtimeState.inventory.items.boat_pass).toBe(1);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(false);
		expect(
			completeQuest(questState, "tavern-access", runtimeState, items),
		).toBe(false);
		expect(runtimeState.inventory.items.boat_pass).toBe(1);
	});

	it("activates, completes, and fails quests explicitly", () => {
		const runtimeState = makeRuntimeState();
		const quest = makeQuest();
		quest.status = "inactive";
		const questState = createRuntimeQuestState([quest]);

		expect(activateQuest(questState, quest.id)).toBe(true);
		expect(questState.quests[0].status).toBe("active");
		expect(failQuest(questState, quest.id)).toBe(true);
		expect(questState.quests[0].status).toBe("failed");
		expect(completeQuest(questState, quest.id, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
		expect(runtimeState.inventory.items.boat_pass).toBe(1);
	});

	it("keeps achieved objectives complete after their source value changes", () => {
		const runtimeState = makeRuntimeState();
		const quest = makeQuest();
		quest.objectives = [quest.objectives[0], quest.objectives[3]];
		const questState = createRuntimeQuestState([quest]);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		runtimeState.inventory.items.gold_coin = 0;
		markAreaEntered(questState, "tavern");

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
	});

	it("grants flag and variable rewards through existing game state", () => {
		const runtimeState = makeRuntimeState();

		grantQuestReward(
			{ type: "flag", flag: "reward_claimed", value: true },
			runtimeState,
			items,
		);
		grantQuestReward(
			{ type: "variable", variable: "gold", amount: 4 },
			runtimeState,
			items,
		);

		expect(runtimeState.flags.reward_claimed).toBe(true);
		expect(runtimeState.variables.gold).toBe(14);
	});

	it("completes an active flag objective after a rule sets it and rewards once", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: false },
			variables: {},
		});
		const quest: Quest = {
			id: "talk-quest",
			name: "Talk Quest",
			status: "active",
			objectives: [
				{
					id: "talked",
					description: "Talk to the captain",
					condition: { type: "flag", flag: "flag_1", value: true },
				},
			],
			rewards: [{ type: "item", itemId: "gold_coin", quantity: 2 }],
		};
		const questState = createRuntimeQuestState([quest]);
		const context = {
			state: runtimeState,
			playCutscene: () => undefined,
			teleport: () => undefined,
			changeMovementMode: () => undefined,
			endGame: () => undefined,
			itemDefinitions: items,
		};

		fireTrigger(
			{ type: "on_interact", targetId: "captain" },
			[
				{
					id: "talk",
					name: "Talk",
					enabled: true,
					trigger: { type: "on_interact", targetId: "captain" },
					actions: [{ type: "set_flag", flag: "flag_1", value: true }],
				},
			],
			context,
		);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
		expect(runtimeState.inventory.items.gold_coin).toBe(2);

		fireTrigger(
			{ type: "on_interact", targetId: "captain" },
			[
				{
					id: "talk",
					name: "Talk",
					enabled: true,
					trigger: { type: "on_interact", targetId: "captain" },
					actions: [{ type: "set_flag", flag: "flag_1", value: true }],
				},
			],
			context,
		);
		expect(updateQuestProgress(questState, runtimeState, items)).toBe(false);
		expect(runtimeState.inventory.items.gold_coin).toBe(2);
	});

	it("does not progress inactive quests until a rule activates them", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: true },
			variables: {},
		});
		const quest: Quest = {
			id: "inactive-quest",
			name: "Inactive Quest",
			status: "inactive",
			objectives: [
				{
					id: "flag",
					description: "Flag is true",
					condition: { type: "flag", flag: "flag_1", value: true },
				},
			],
		};
		const questState = createRuntimeQuestState([quest]);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(false);
		expect(questState.quests[0].status).toBe("inactive");

		activateQuest(questState, quest.id);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
	});

	it("supports game-start rules before the first quest sync", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: false },
			variables: {},
		});
		const quest: Quest = {
			id: "startup-quest",
			name: "Startup Quest",
			status: "active",
			objectives: [
				{
					id: "flag",
					description: "Flag is initialized",
					condition: { type: "flag", flag: "flag_1", value: true },
				},
			],
		};
		const questState = createRuntimeQuestState([quest]);

		fireTrigger(
			{ type: "on_game_start" },
			[
				{
					id: "startup-rule",
					name: "Startup Rule",
					enabled: true,
					trigger: { type: "on_game_start" },
					actions: [{ type: "set_flag", flag: "flag_1", value: true }],
				},
			],
			{
				state: runtimeState,
				playCutscene: () => undefined,
				teleport: () => undefined,
				changeMovementMode: () => undefined,
				endGame: () => undefined,
				itemDefinitions: items,
			},
		);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
	});

	it("does not complete a false flag objective before game-start rules can initialize it", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: false },
			variables: {},
		});
		const quest: Quest = {
			id: "false-flag-quest",
			name: "False Flag Quest",
			status: "active",
			objectives: [
				{
					id: "flag",
					description: "Flag stays false",
					condition: { type: "flag", flag: "flag_1", value: false },
				},
			],
		};
		const questState = createRuntimeQuestState([quest]);

		fireTrigger(
			{ type: "on_game_start" },
			[
				{
					id: "startup-rule",
					name: "Startup Rule",
					enabled: true,
					trigger: { type: "on_game_start" },
					actions: [{ type: "set_flag", flag: "flag_1", value: true }],
				},
			],
			{
				state: runtimeState,
				playCutscene: () => undefined,
				teleport: () => undefined,
				changeMovementMode: () => undefined,
				endGame: () => undefined,
				itemDefinitions: items,
			},
		);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(false);
		expect(questState.quests[0].status).toBe("active");
	});

	it("completes active variable and item objectives after runtime actions", () => {
		const runtimeState = createRuntimeState({
			flags: {},
			variables: { gold: 0 },
			inventory: {},
		});
		const quest: Quest = {
			id: "state-quest",
			name: "State Quest",
			status: "active",
			objectives: [
				{
					id: "set-variable",
					description: "Set gold",
					condition: {
						type: "variable_compare",
						variable: "gold",
						operator: ">=",
						value: 10,
					},
				},
				{
					id: "has-item",
					description: "Have boat pass",
					condition: { type: "has_item", itemId: "boat_pass", quantity: 1 },
				},
			],
		};
		const questState = createRuntimeQuestState([quest]);

		fireTrigger(
			{ type: "on_interact", targetId: "captain" },
			[
				{
					id: "state-rule",
					name: "State Rule",
					enabled: true,
					trigger: { type: "on_interact", targetId: "captain" },
					actions: [
						{ type: "set_variable", variable: "gold", value: 6 },
						{ type: "change_variable", variable: "gold", amount: 4 },
						{ type: "give_item", itemId: "boat_pass", quantity: 1 },
					],
				},
			],
			{
				state: runtimeState,
				playCutscene: () => undefined,
				teleport: () => undefined,
				changeMovementMode: () => undefined,
				endGame: () => undefined,
				itemDefinitions: items,
			},
		);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
	});

	it("does not mutate editor quest defaults when runtime rewards are granted", () => {
		const runtimeState = makeRuntimeState();
		const editorQuest = makeQuest();
		const questState = createRuntimeQuestState([editorQuest]);
		markAreaEntered(questState, "tavern");

		updateQuestProgress(questState, runtimeState, items);

		expect(editorQuest.status).toBe("active");
		expect(editorQuest.objectives).toHaveLength(4);
		expect(editorQuest.rewards).toEqual([
			{ type: "item", itemId: "boat_pass", quantity: 1 },
		]);
		expect(runtimeState.inventory.items.boat_pass).toBe(1);
	});

	it("re-evaluates and completes a flag objective through the rule stateChanged callback", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: false },
			variables: {},
		});
		const quest: Quest = {
			id: "callback-quest",
			name: "Callback Quest",
			status: "active",
			objectives: [
				{
					id: "flag",
					description: "Set flag_1",
					condition: { type: "flag", flag: "flag_1", value: true },
				},
			],
			rewards: [{ type: "item", itemId: "gold_coin", quantity: 2 }],
		};
		const questState = createRuntimeQuestState([quest]);
		const syncQuestProgress = () =>
			updateQuestProgress(questState, runtimeState, items);

		fireTrigger(
			{ type: "on_interact", targetId: "captain" },
			[
				{
					id: "set-flag",
					name: "Set Flag",
					enabled: true,
					trigger: { type: "on_interact", targetId: "captain" },
					actions: [{ type: "set_flag", flag: "flag_1", value: true }],
				},
			],
			{
				state: runtimeState,
				playCutscene: () => undefined,
				teleport: () => undefined,
				changeMovementMode: () => undefined,
				endGame: () => undefined,
				itemDefinitions: items,
				stateChanged: syncQuestProgress,
			},
		);

		expect(questState.quests[0].status).toBe("completed");
		expect(runtimeState.inventory.items.gold_coin).toBe(2);

		fireTrigger(
			{ type: "on_interact", targetId: "captain" },
			[
				{
					id: "set-flag",
					name: "Set Flag",
					enabled: true,
					trigger: { type: "on_interact", targetId: "captain" },
					actions: [{ type: "set_flag", flag: "flag_1", value: true }],
				},
			],
			{
				state: runtimeState,
				playCutscene: () => undefined,
				teleport: () => undefined,
				changeMovementMode: () => undefined,
				endGame: () => undefined,
				itemDefinitions: items,
				stateChanged: syncQuestProgress,
			},
		);

		expect(runtimeState.inventory.items.gold_coin).toBe(2);
	});

	it("reports an exact flag ID mismatch and does not complete the quest", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: true },
			variables: {},
		});
		const condition = { type: "flag", flag: "flag-1", value: true } as const;
		const questState = createRuntimeQuestState([
			{
				id: "mismatch",
				name: "Mismatch",
				status: "active",
				objectives: [
					{
						id: "flag",
						description: "Set mismatched flag",
						condition,
					},
				],
			},
		]);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(false);
		expect(questState.quests[0].status).toBe("active");
		expect(
			getObjectiveEvaluationDiagnostic(
				condition,
				runtimeState,
				questState.enteredAreaIds,
			),
		).toEqual({
			conditionType: "flag",
			expected: "flag-1=true",
			actual: "missing (defaults false)",
			passed: false,
		});
		expect(getQuestSyncDiagnosticMessages(questState, runtimeState)).toEqual([
			"Quest check: Mismatch / Set mismatched flag [flag] expected flag-1=true, actual missing (defaults false), passed false.",
		]);
	});

	it("reports when inactive quests leave no active quests to evaluate", () => {
		const runtimeState = createRuntimeState({
			flags: { flag_1: true },
			variables: {},
		});
		const questState = createRuntimeQuestState([
			{
				id: "inactive",
				name: "Inactive",
				status: "inactive",
				objectives: [
					{
						id: "flag",
						description: "Set flag",
						condition: { type: "flag", flag: "flag_1", value: true },
					},
				],
			},
		]);

		expect(getQuestSyncDiagnosticMessages(questState, runtimeState)).toEqual([
			"Quest sync: no active quests evaluated.",
		]);
	});
});
