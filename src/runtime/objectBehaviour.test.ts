import { describe, expect, it } from "vitest";
import type { ItemDefinition } from "../types/game";
import { runObjectBehaviour } from "./objectBehaviour";
import { createRuntimeState } from "./ruleEngine";

const items: ItemDefinition[] = [
	{
		id: "gold_coin",
		name: "Gold Coin",
		category: "currency",
		stackable: true,
		maxStack: 999,
	},
	{ id: "tavern_key", name: "Tavern Key", category: "key", stackable: false },
];

function makeContext() {
	return {
		itemDefinitions: items,
		objectId: "object",
		openedObjectIds: new Set<string>(),
		state: createRuntimeState({
			flags: { chest_opened: false },
			variables: {},
			inventory: {},
		}),
	};
}

describe("object behaviours", () => {
	it("rejects a whole overflowing container without consuming its once-only state", () => {
		const context = makeContext();
		context.state.inventory.items.gold_coin = 998;
		const behaviour = {
			type: "container" as const,
			once: true,
			openedFlag: "chest_opened",
			contents: [
				{ itemId: "tavern_key", quantity: 1 },
				{ itemId: "gold_coin", quantity: 2 },
			],
		};
		expect(runObjectBehaviour(behaviour, context)).toMatchObject({
			opened: false,
			message: expect.stringContaining("Stack limit: 999"),
		});
		expect(context.state.inventory.items).toEqual({ gold_coin: 998 });
		expect(context.openedObjectIds.size).toBe(0);
		expect(context.state.flags.chest_opened).toBe(false);
		context.state.inventory.items.gold_coin = 997;
		expect(runObjectBehaviour(behaviour, context)).toMatchObject({
			opened: true,
		});
		expect(context.state.inventory.items).toEqual({
			gold_coin: 999,
			tavern_key: 1,
		});
	});
	it("gives container contents once", () => {
		const context = makeContext();
		const behaviour = {
			type: "container" as const,
			contents: [{ itemId: "gold_coin", quantity: 5 }],
			once: true,
			openedFlag: "chest_opened",
		};

		expect(runObjectBehaviour(behaviour, context)).toMatchObject({
			type: "container",
			opened: true,
		});
		expect(context.state.inventory.items.gold_coin).toBe(5);
		expect(context.state.flags.chest_opened).toBe(true);

		expect(runObjectBehaviour(behaviour, context)).toMatchObject({
			type: "container",
			opened: false,
		});
		expect(context.state.inventory.items.gold_coin).toBe(5);
	});

	it("blocks a door when required item is missing", () => {
		const result = runObjectBehaviour(
			{
				type: "door",
				targetAreaId: "tavern",
				targetEventBlockId: "entry",
				requiredItemId: "tavern_key",
				lockedCutsceneId: "locked",
			},
			makeContext(),
		);

		expect(result).toMatchObject({
			type: "door",
			allowed: false,
			lockedCutsceneId: "locked",
			message: "Door is locked. Requires Tavern Key.",
		});
	});

	it("allows a door when required item is present", () => {
		const context = makeContext();
		context.state.inventory.items.tavern_key = 1;

		const result = runObjectBehaviour(
			{
				type: "door",
				targetAreaId: "tavern",
				targetEventBlockId: "entry",
				requiredItemId: "tavern_key",
			},
			context,
		);

		expect(result).toMatchObject({
			type: "door",
			allowed: true,
			targetAreaId: "tavern",
			targetEventBlockId: "entry",
			message: "Door opened. Tavern Key retained.",
		});
		expect(context.state.inventory.items.tavern_key).toBe(1);
	});

	it("returns sign text", () => {
		expect(
			runObjectBehaviour({ type: "sign", text: "Read me." }, makeContext()),
		).toEqual({
			type: "sign",
			handled: true,
			text: "Read me.",
		});
	});

	it("returns a usable vehicle behaviour result", () => {
		expect(
			runObjectBehaviour(
				{
					type: "vehicle",
					vehicleType: "boat",
					movementMode: "sail",
					allowedTerrainIds: ["water"],
					dismountAllowedTerrainIds: ["grass"],
				},
				makeContext(),
			),
		).toMatchObject({
			type: "vehicle",
			handled: true,
			behaviour: { type: "vehicle", vehicleType: "boat" },
			message: "Boarded boat.",
		});
	});
});
