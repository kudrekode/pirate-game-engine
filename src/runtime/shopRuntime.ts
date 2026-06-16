import type {
	InventoryState,
	ItemDefinition,
	ShopDefinition,
} from "../types/game";
import { giveItem, hasItem, removeItem } from "./inventory";

export type RuntimeShopStocks = Record<string, Record<string, number>>;

export type RuntimeShopPanelState = {
	shopId: string;
	stockByEntryId: Record<string, number>;
	message?: string;
};

export type ShopPurchaseResult =
	| { success: true; message: string }
	| { success: false; message: string };

export function createRuntimeShopStocks(
	shops: ShopDefinition[],
): RuntimeShopStocks {
	return Object.fromEntries(
		shops.map((shop) => [
			shop.id,
			Object.fromEntries(
				shop.entries.flatMap((entry) =>
					entry.stock === undefined
						? []
						: [[entry.id, Math.max(0, Math.round(entry.stock))]],
				),
			),
		]),
	);
}

export function buyShopEntry(
	shop: ShopDefinition,
	entryId: string,
	inventory: InventoryState,
	itemDefinitions: ItemDefinition[],
	stockByEntryId: Record<string, number>,
): ShopPurchaseResult {
	const entry = shop.entries.find((candidate) => candidate.id === entryId);
	if (!entry) {
		return { success: false, message: "Shop entry missing." };
	}

	if (entry.stock !== undefined && (stockByEntryId[entry.id] ?? 0) <= 0) {
		return { success: false, message: "Out of stock." };
	}

	if (!hasItem(inventory, shop.currencyItemId, entry.buyPrice)) {
		const currency = itemDefinitions.find(
			(item) => item.id === shop.currencyItemId,
		);
		const owned = inventory.items[shop.currencyItemId] ?? 0;
		const label = currency
			? `${currency.name} (${currency.id})`
			: shop.currencyItemId;
		return {
			success: false,
			message: `Shop purchase failed: need ${entry.buyPrice} ${label}, player has ${owned} ${label}.`,
		};
	}

	removeItem(inventory, shop.currencyItemId, entry.buyPrice);
	giveItem(inventory, itemDefinitions, entry.itemId, 1);
	if (entry.stock !== undefined) {
		stockByEntryId[entry.id] = Math.max(
			0,
			(stockByEntryId[entry.id] ?? entry.stock) - 1,
		);
	}

	const item = itemDefinitions.find(
		(candidate) => candidate.id === entry.itemId,
	);
	return { success: true, message: `Bought ${item?.name ?? entry.itemId}.` };
}
