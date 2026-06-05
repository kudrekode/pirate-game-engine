import { describe, expect, it } from "vitest";
import type { ItemDefinition } from "../types/game";
import { createRuntimeState } from "./ruleEngine";
import { runObjectBehaviour } from "./objectBehaviour";

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
		});
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
