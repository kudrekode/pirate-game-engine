import { describe, expect, it, vi } from "vitest";
import type { ConditionExpression, GameRule, NPCInstance } from "../types/game";
import {
	createRuntimeState,
	evaluateCondition,
	evaluateConditionExpression,
	fireTrigger,
	type RuleActionContext,
} from "./ruleEngine";

const captain: NPCInstance = {
	id: "npc-captain",
	npcDefinitionId: "captain",
	areaId: "village",
	x: 1,
	y: 1,
	blocksMovement: true,
	movementMode: "stationary",
	attributes: {
		maxHealth: 100,
		health: 75,
		faction: "villagers",
		alignment: "friendly",
		canInteract: true,
		movementSpeed: 1,
	},
};

function makeContext() {
	const state = createRuntimeState(
		{
			flags: { has_key: true, admin_override: false },
			variables: { gold: 5, lockpick_count: 0, title: "guest" },
			inventory: { gold_coin: 5 },
		},
		[captain],
	);
	const teleport = vi.fn();
	const activateQuest = vi.fn();
	const completeQuest = vi.fn();
	const failQuest = vi.fn();
	const openShop = vi.fn();
	const context: RuleActionContext = {
		state,
		playCutscene: vi.fn(),
		teleport,
		changeMovementMode: vi.fn(),
		endGame: vi.fn(),
		activateQuest,
		completeQuest,
		failQuest,
		openShop,
		itemDefinitions: [
			{
				id: "gold_coin",
				name: "Gold Coin",
				category: "currency",
				stackable: true,
				maxStack: 99,
			},
			{
				id: "tavern_key",
				name: "Tavern Key",
				category: "key",
				stackable: false,
			},
		],
	};

	return {
		activateQuest,
		completeQuest,
		context,
		failQuest,
		openShop,
		state,
		teleport,
	};
}

describe("rule engine conditions", () => {
	it("evaluates flag conditions", () => {
		const { state } = makeContext();

		expect(
			evaluateCondition(
				{ id: "has-key", type: "flag_is", flag: "has_key", value: true },
				state,
			),
		).toBe(true);
		expect(
			evaluateCondition(
				{
					id: "override",
					type: "flag_is",
					flag: "admin_override",
					value: true,
				},
				state,
			),
		).toBe(false);
	});

	it("evaluates numeric and text variable conditions", () => {
		const { state } = makeContext();

		expect(
			evaluateCondition(
				{
					id: "gold",
					type: "variable_compare",
					variable: "gold",
					operator: ">=",
					value: 5,
				},
				state,
			),
		).toBe(true);
		expect(
			evaluateCondition(
				{
					id: "title",
					type: "variable_compare",
					variable: "title",
					operator: "==",
					value: "guest",
				},
				state,
			),
		).toBe(true);
	});

	it("evaluates AND, OR, and nested condition groups", () => {
		const { state } = makeContext();
		const expression: ConditionExpression = {
			id: "root",
			type: "group",
			operator: "OR",
			conditions: [
				{
					id: "requirements",
					type: "group",
					operator: "AND",
					conditions: [
						{ id: "has-key", type: "flag_is", flag: "has_key", value: true },
						{
							id: "gold",
							type: "variable_compare",
							variable: "gold",
							operator: ">=",
							value: 5,
						},
					],
				},
				{
					id: "override",
					type: "flag_is",
					flag: "admin_override",
					value: true,
				},
			],
		};

		expect(evaluateConditionExpression(expression, state)).toBe(true);

		state.flags.has_key = false;
		expect(evaluateConditionExpression(expression, state)).toBe(false);

		state.flags.admin_override = true;
		expect(evaluateConditionExpression(expression, state)).toBe(true);
	});

	it("treats missing and empty conditions as always true", () => {
		const { state } = makeContext();

		expect(evaluateConditionExpression(undefined, state)).toBe(true);
		expect(
			evaluateConditionExpression(
				{ id: "empty", type: "group", operator: "OR", conditions: [] },
				state,
			),
		).toBe(true);
	});

	it("evaluates has_item and not_has_item conditions", () => {
		const { state } = makeContext();

		expect(
			evaluateCondition(
				{ id: "coins", type: "has_item", itemId: "gold_coin", quantity: 5 },
				state,
			),
		).toBe(true);
		expect(
			evaluateCondition(
				{
					id: "more-coins",
					type: "has_item",
					itemId: "gold_coin",
					quantity: 6,
				},
				state,
			),
		).toBe(false);
		expect(
			evaluateCondition(
				{ id: "key", type: "not_has_item", itemId: "tavern_key" },
				state,
			),
		).toBe(true);
	});

	it("evaluates NPC alignment and health conditions", () => {
		const { state } = makeContext();

		expect(
			evaluateCondition(
				{
					id: "friendly",
					type: "npc_alignment",
					npcId: "npc-captain",
					alignment: "friendly",
				},
				state,
			),
		).toBe(true);
		expect(
			evaluateCondition(
				{
					id: "health",
					type: "npc_health_compare",
					npcId: "npc-captain",
					operator: ">=",
					value: 75,
				},
				state,
			),
		).toBe(true);
		expect(
			evaluateCondition(
				{
					id: "missing",
					type: "npc_health_compare",
					npcId: "missing",
					operator: ">",
					value: 0,
				},
				state,
			),
		).toBe(false);
	});

	it("creates an isolated runtime NPC attribute copy", () => {
		const { state } = makeContext();

		state.npcs["npc-captain"].health = 10;

		expect(captain.attributes.health).toBe(75);
	});
});

describe("rule engine triggers and actions", () => {
	it("runs matching triggers and applies state and teleport actions", () => {
		const { context, state, teleport } = makeContext();
		const rule: GameRule = {
			id: "enter-tavern",
			name: "Enter Tavern",
			enabled: true,
			trigger: { type: "on_interact", targetId: "tavern-door" },
			conditionTree: {
				id: "requirements",
				type: "group",
				operator: "AND",
				conditions: [
					{
						id: "gold",
						type: "variable_compare",
						variable: "gold",
						operator: ">=",
						value: 5,
					},
				],
			},
			actions: [
				{ type: "set_flag", flag: "has_key", value: false },
				{ type: "change_variable", variable: "gold", amount: -5 },
				{ type: "teleport", areaId: "tavern", eventBlockId: "entry" },
			],
		};

		fireTrigger(
			{ type: "on_interact", targetId: "tavern-door" },
			[rule],
			context,
		);

		expect(state.flags.has_key).toBe(false);
		expect(state.variables.gold).toBe(0);
		expect(teleport).toHaveBeenCalledWith("tavern", "entry");
	});

	it("does not run disabled or non-matching rules", () => {
		const { context, teleport } = makeContext();
		const rule: GameRule = {
			id: "disabled",
			name: "Disabled",
			enabled: false,
			trigger: { type: "on_touch", targetId: "gate" },
			actions: [{ type: "teleport", areaId: "cave", eventBlockId: "entry" }],
		};

		fireTrigger({ type: "on_touch", targetId: "gate" }, [rule], context);

		expect(teleport).not.toHaveBeenCalled();
	});

	it("checks inventory and applies give and remove item actions", () => {
		const { context, state } = makeContext();
		const rule: GameRule = {
			id: "trade-coins",
			name: "Trade Coins",
			enabled: true,
			trigger: { type: "on_interact", targetId: "door" },
			conditionTree: {
				id: "coins",
				type: "has_item",
				itemId: "gold_coin",
				quantity: 5,
			},
			actions: [
				{ type: "remove_item", itemId: "gold_coin", quantity: 5 },
				{ type: "give_item", itemId: "tavern_key", quantity: 3 },
			],
		};

		fireTrigger({ type: "on_interact", targetId: "door" }, [rule], context);

		expect(state.inventory.items.gold_coin).toBeUndefined();
		expect(state.inventory.items.tavern_key).toBe(1);
	});

	it("runs quest lifecycle actions", () => {
		const { activateQuest, completeQuest, context, failQuest } = makeContext();
		const rule: GameRule = {
			id: "quest-actions",
			name: "Quest actions",
			enabled: true,
			trigger: { type: "on_game_start" },
			actions: [
				{ type: "activate_quest", questId: "quest-a" },
				{ type: "complete_quest", questId: "quest-b" },
				{ type: "fail_quest", questId: "quest-c" },
			],
		};

		fireTrigger({ type: "on_game_start" }, [rule], context);

		expect(activateQuest).toHaveBeenCalledWith("quest-a");
		expect(completeQuest).toHaveBeenCalledWith("quest-b");
		expect(failQuest).toHaveBeenCalledWith("quest-c");
	});

	it("runs open shop actions", () => {
		const { context, openShop } = makeContext();
		const rule: GameRule = {
			id: "merchant",
			name: "Merchant",
			enabled: true,
			trigger: { type: "on_interact", targetId: "npc-merchant" },
			actions: [{ type: "open_shop", shopId: "general-store" }],
		};

		fireTrigger(
			{ type: "on_interact", targetId: "npc-merchant" },
			[rule],
			context,
		);

		expect(openShop).toHaveBeenCalledWith("general-store");
	});

	it("fires an NPC on_interact rule that activates a quest", () => {
		const { activateQuest, context } = makeContext();
		const rule: GameRule = {
			id: "captain-intro",
			name: "Captain intro",
			enabled: true,
			trigger: { type: "on_interact", targetId: "npc-captain" },
			actions: [{ type: "activate_quest", questId: "tavern-access" }],
		};

		fireTrigger(
			{ type: "on_interact", targetId: "npc-captain" },
			[rule],
			context,
		);

		expect(activateQuest).toHaveBeenCalledWith("tavern-access");
	});

	it("fires an object on_interact rule", () => {
		const { context, state } = makeContext();
		const rule: GameRule = {
			id: "open-chest",
			name: "Open chest",
			enabled: true,
			trigger: { type: "on_interact", targetId: "object-chest" },
			actions: [
				{ type: "give_item", itemId: "gold_coin", quantity: 2 },
				{ type: "set_flag", flag: "has_key", value: false },
			],
		};

		fireTrigger(
			{ type: "on_interact", targetId: "object-chest" },
			[rule],
			context,
		);

		expect(state.inventory.items.gold_coin).toBe(7);
		expect(state.flags.has_key).toBe(false);
	});

	it("applies NPC alignment and health actions to runtime state", () => {
		const { context, state } = makeContext();
		const rule: GameRule = {
			id: "change-captain",
			name: "Change captain",
			enabled: true,
			trigger: { type: "on_game_start" },
			actions: [
				{
					type: "set_npc_alignment",
					npcId: "npc-captain",
					alignment: "hostile",
				},
				{ type: "set_npc_health", npcId: "npc-captain", value: 120 },
			],
		};

		fireTrigger({ type: "on_game_start" }, [rule], context);

		expect(state.npcs["npc-captain"]).toMatchObject({
			alignment: "hostile",
			health: 100,
		});
		expect(captain.attributes).toMatchObject({
			alignment: "friendly",
			health: 75,
		});
	});

	it("runs a once rule only once per runtime session", () => {
		const { context, state } = makeContext();
		const rule: GameRule = {
			id: "gift-once",
			name: "Gift once",
			enabled: true,
			runPolicy: "once",
			trigger: { type: "on_interact", targetId: "npc-captain" },
			actions: [{ type: "give_item", itemId: "gold_coin", quantity: 2 }],
		};

		fireTrigger(rule.trigger, [rule], context);
		fireTrigger(rule.trigger, [rule], context);

		expect(state.inventory.items.gold_coin).toBe(7);
		expect(state.completedRuleIds).toEqual(new Set(["gift-once"]));
		expect(rule).not.toHaveProperty("completed");
	});

	it("does not complete a once rule when conditions fail and ELSE runs", () => {
		const { context, state } = makeContext();
		const rule: GameRule = {
			id: "conditional-once",
			name: "Conditional once",
			enabled: true,
			runPolicy: "once",
			trigger: { type: "on_game_start" },
			conditionTree: {
				id: "missing",
				type: "flag_is",
				flag: "admin_override",
				value: true,
			},
			actions: [{ type: "give_item", itemId: "gold_coin", quantity: 2 }],
			elseActions: [{ type: "set_flag", flag: "has_key", value: false }],
		};

		fireTrigger(rule.trigger, [rule], context);

		expect(state.flags.has_key).toBe(false);
		expect(state.completedRuleIds).not.toContain(rule.id);
	});

	it("logs fired, skipped, and action events without changing rule behavior", () => {
		const { context, state } = makeContext();
		const logEvent = vi.fn();
		context.logEvent = logEvent;
		const rule: GameRule = {
			id: "logged-rule",
			name: "Logged Rule",
			enabled: true,
			trigger: { type: "on_game_start" },
			conditionTree: {
				id: "condition",
				type: "flag_is",
				flag: "admin_override",
				value: true,
			},
			actions: [{ type: "set_flag", flag: "has_key", value: false }],
		};

		fireTrigger(rule.trigger, [rule], context);

		expect(state.flags.has_key).toBe(true);
		expect(logEvent).toHaveBeenCalledWith(
			"Rule skipped: Logged Rule conditions failed.",
		);

		state.flags.admin_override = true;
		fireTrigger(rule.trigger, [rule], context);

		expect(state.flags.has_key).toBe(false);
		expect(logEvent).toHaveBeenCalledWith("Rule fired: Logged Rule.");
		expect(logEvent).toHaveBeenCalledWith(
			"Action ran: set flag has_key to false.",
		);
	});
});
