import { describe, expect, it } from "vitest";
import type { ItemDefinition, Quest, ShopDefinition } from "../types/game";
import { createInventory } from "./inventory";
import {
	createRuntimeQuestState,
	runQuestCompletionActionsOnce,
	updateQuestProgress,
} from "./questEngine";
import { createRuntimeState } from "./ruleEngine";
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
			message:
				"Shop purchase failed: need 5 Gold Coin (gold_coin), player has 4 Gold Coin (gold_coin).",
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

	it("allows a shop purchase to complete an item quest objective", () => {
		const runtimeState = createRuntimeState({
			flags: {},
			variables: {},
			inventory: { gold_coin: 5 },
		});
		const stocks = createRuntimeShopStocks([shop]);
		const quest: Quest = {
			id: "buy-key",
			name: "Buy Key",
			status: "active",
			objectives: [
				{
					id: "has-key",
					description: "Buy a tavern key",
					condition: { type: "has_item", itemId: "tavern_key", quantity: 1 },
				},
			],
		};
		const questState = createRuntimeQuestState([quest]);

		expect(
			buyShopEntry(
				shop,
				"key",
				runtimeState.inventory,
				items,
				stocks.general_store,
			).success,
		).toBe(true);

		expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
		expect(questState.quests[0].status).toBe("completed");
	});

	it("succeeds when a quest-style reward uses the shop currency item ID", () => {
		const runtimeState = createRuntimeState({
			flags: {},
			variables: {},
			inventory: {},
		});
		const stocks = createRuntimeShopStocks([shop]);
		const quest: Quest = {
			id: "currency-reward",
			name: "Currency Reward",
			status: "completed",
			objectives: [],
			completionActions: [
				{ type: "give_item", itemId: "gold_coin", quantity: 5 },
			],
		};
		runQuestCompletionActionsOnce(quest, new Set(), {
			state: runtimeState,
			playCutscene: () => undefined,
			teleport: () => undefined,
			changeMovementMode: () => undefined,
			endGame: () => undefined,
			itemDefinitions: items,
		});

		expect(
			buyShopEntry(
				shop,
				"key",
				runtimeState.inventory,
				items,
				stocks.general_store,
			).success,
		).toBe(true);
	});

	it("makes a currency item ID mismatch obvious", () => {
		const inventory = createInventory({ silver: 1000 });
		const stocks = createRuntimeShopStocks([shop]);

		expect(
			buyShopEntry(shop, "key", inventory, items, stocks.general_store),
		).toEqual({
			success: false,
			message:
				"Shop purchase failed: need 5 Gold Coin (gold_coin), player has 0 Gold Coin (gold_coin).",
		});
	});

	it("repairs a missing quest currency reward target when one currency item exists", () => {
		const silverItems: ItemDefinition[] = [
			{
				id: "item_78643486",
				name: "silver",
				category: "currency",
				stackable: true,
				maxStack: 9999,
			},
			{
				id: "cutlass",
				name: "Cutlass",
				category: "misc",
				stackable: false,
			},
		];
		const silverShop: ShopDefinition = {
			id: "merchant",
			name: "Merchant",
			currencyItemId: "item_78643486",
			entries: [{ id: "cutlass", itemId: "cutlass", buyPrice: 1000 }],
		};
		const runtimeState = createRuntimeState({
			flags: {},
			variables: {},
			inventory: {},
		});
		const quest: Quest = {
			id: "silver-reward",
			name: "Silver Reward",
			status: "completed",
			objectives: [],
			completionActions: [{ type: "give_item", itemId: "", quantity: 1000 }],
		};
		const logs: string[] = [];
		runQuestCompletionActionsOnce(quest, new Set(), {
			state: runtimeState,
			playCutscene: () => undefined,
			teleport: () => undefined,
			changeMovementMode: () => undefined,
			endGame: () => undefined,
			itemDefinitions: silverItems,
			logEvent: (message) => logs.push(message),
		});

		expect(runtimeState.inventory.items.item_78643486).toBe(1000);
		expect(runtimeState.inventory.items[""]).toBeUndefined();
		expect(logs).toContain(
			"Action repaired: give item target was missing, using silver (item_78643486).",
		);
		expect(
			buyShopEntry(
				silverShop,
				"cutlass",
				runtimeState.inventory,
				silverItems,
				{},
			).success,
		).toBe(true);
	});
});
