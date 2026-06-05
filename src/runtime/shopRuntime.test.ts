import { describe, expect, it } from "vitest";
import type { ItemDefinition, ShopDefinition } from "../types/game";
import { createInventory } from "./inventory";
import { buyShopEntry, createRuntimeShopStocks } from "./shopRuntime";

const items: ItemDefinition[] = [
	{
		id: "gold_coin",
		name: "Gold Coin",
		category: "currency",
		stackable: true,
		maxStack: 999,
	},
	{ id: "tavern_key", name: "Tavern Key", category: "key", stackable: false },
	{
		id: "rum_bottle",
		name: "Rum Bottle",
		category: "consumable",
		stackable: true,
		maxStack: 12,
	},
];

const shop: ShopDefinition = {
	id: "general_store",
	name: "General Store",
	currencyItemId: "gold_coin",
	entries: [
		{ id: "key", itemId: "tavern_key", buyPrice: 5, stock: 1 },
		{ id: "rum", itemId: "rum_bottle", buyPrice: 2 },
	],
};

describe("shop runtime", () => {
	it("buys an item when the player has enough currency", () => {
		const inventory = createInventory({ gold_coin: 5 });
		const stocks = createRuntimeShopStocks([shop]);

		expect(
			buyShopEntry(shop, "key", inventory, items, stocks.general_store),
		).toMatchObject({
			success: true,
		});
		expect(inventory.items.gold_coin).toBeUndefined();
		expect(inventory.items.tavern_key).toBe(1);
	});

	it("fails when the player does not have enough currency", () => {
		const inventory = createInventory({ gold_coin: 4 });
		const stocks = createRuntimeShopStocks([shop]);

		expect(
			buyShopEntry(shop, "key", inventory, items, stocks.general_store),
		).toEqual({
			success: false,
			message: "Not enough currency.",
		});
		expect(inventory.items.gold_coin).toBe(4);
		expect(inventory.items.tavern_key).toBeUndefined();
	});

	it("decrements runtime stock and blocks stock zero purchases", () => {
		const inventory = createInventory({ gold_coin: 10 });
		const stocks = createRuntimeShopStocks([shop]);

		expect(
			buyShopEntry(shop, "key", inventory, items, stocks.general_store).success,
		).toBe(true);
		expect(stocks.general_store.key).toBe(0);
		expect(
			buyShopEntry(shop, "key", inventory, items, stocks.general_store),
		).toEqual({
			success: false,
			message: "Out of stock.",
		});
	});

	it("does not mutate editor shop definition stock", () => {
		const inventory = createInventory({ gold_coin: 10 });
		const stocks = createRuntimeShopStocks([shop]);

		buyShopEntry(shop, "key", inventory, items, stocks.general_store);

		expect(shop.entries[0].stock).toBe(1);
		expect(stocks.general_store.key).toBe(0);
	});
});
