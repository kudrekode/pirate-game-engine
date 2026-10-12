import { describe, expect, it } from "vitest";
import type { ItemDefinition, PickupObject } from "../types/game";
import {
	collectPickup,
	createInventory,
	giveItem,
	hasItem,
	inventoryRewardIssue,
	removeItem,
} from "./inventory";

const items: ItemDefinition[] = [
	{
		id: "gold_coin",
		name: "Gold Coin",
		category: "currency",
		stackable: true,
		maxStack: 10,
	},
	{ id: "tavern_key", name: "Tavern Key", category: "key", stackable: false },
];

const pickup: PickupObject = {
	id: "pickup_gold",
	itemId: "gold_coin",
	quantity: 3,
	areaId: "area_main",
	x: 1,
	y: 1,
	pickupMode: "on_touch",
	once: true,
};

describe("inventory", () => {
	it("leaves overflow pickups available and accepts the whole reward after space is freed", () => {
		const inventory = createInventory({ gold_coin: 9 });
		const collected = new Set<string>();
		expect(collectPickup(pickup, inventory, items, collected)).toBe(false);
		expect(inventory.items.gold_coin).toBe(9);
		expect(collected.size).toBe(0);
		removeItem(inventory, "gold_coin", 2);
		expect(collectPickup(pickup, inventory, items, collected)).toBe(true);
		expect(inventory.items.gold_coin).toBe(10);
	});
	it("checks repeated reward entries together and preserves legacy quantities above a changed limit", () => {
		const inventory = createInventory({ gold_coin: 8 });
		expect(
			inventoryRewardIssue(inventory, items, [
				{ itemId: "gold_coin", quantity: 2 },
				{ itemId: "gold_coin", quantity: 1 },
			]),
		).toContain("Stack limit: 10");
		expect(inventory.items.gold_coin).toBe(8);
		inventory.items.gold_coin = 20;
		giveItem(inventory, items, "gold_coin", 1);
		expect(inventory.items.gold_coin).toBe(20);
	});
	it("gives and removes items without going below zero", () => {
		const inventory = createInventory();

		giveItem(inventory, items, "gold_coin", 5);
		expect(hasItem(inventory, "gold_coin", 5)).toBe(true);

		removeItem(inventory, "gold_coin", 8);
		expect(inventory.items.gold_coin).toBeUndefined();
	});

	it("caps non-stackable items at one", () => {
		const inventory = createInventory();

		giveItem(inventory, items, "tavern_key", 4);

		expect(inventory.items.tavern_key).toBe(1);
	});

	it("caps stackable items at maxStack", () => {
		const inventory = createInventory();

		giveItem(inventory, items, "gold_coin", 40);

		expect(inventory.items.gold_coin).toBe(10);
	});

	it("collects a pickup only once when configured", () => {
		const inventory = createInventory();
		const collectedPickupIds = new Set<string>();

		expect(collectPickup(pickup, inventory, items, collectedPickupIds)).toBe(
			true,
		);
		expect(collectPickup(pickup, inventory, items, collectedPickupIds)).toBe(
			false,
		);
		expect(inventory.items.gold_coin).toBe(3);
	});
});
