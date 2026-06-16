import type {
	InventoryState,
	ItemDefinition,
	PickupObject,
} from "../types/game";

function normalizedQuantity(quantity: number): number {
	return Math.max(0, Math.round(Number.isFinite(quantity) ? quantity : 0));
}

function findItem(
	items: ItemDefinition[],
	itemId: string,
): ItemDefinition | undefined {
	return items.find((item) => item.id === itemId);
}

export function createInventory(
	items: Record<string, number> = {},
): InventoryState {
	return {
		items: Object.fromEntries(
			Object.entries(items).map(([itemId, quantity]) => [
				itemId,
				normalizedQuantity(quantity),
			]),
		),
	};
}

export function hasItem(
	inventory: InventoryState,
	itemId: string,
	quantity = 1,
): boolean {
	return (
		(inventory.items[itemId] ?? 0) >= Math.max(1, normalizedQuantity(quantity))
	);
}

export function giveItem(
	inventory: InventoryState,
	items: ItemDefinition[],
	itemId: string,
	quantity: number,
): number {
	const item = findItem(items, itemId);
	const currentQuantity = inventory.items[itemId] ?? 0;
	const requestedQuantity = currentQuantity + normalizedQuantity(quantity);
	const maxQuantity = item?.stackable === false ? 1 : item?.maxStack;
	const nextQuantity =
		maxQuantity === undefined
			? requestedQuantity
			: Math.min(maxQuantity, requestedQuantity);

	inventory.items[itemId] = nextQuantity;
	return nextQuantity;
}

export function removeItem(
	inventory: InventoryState,
	itemId: string,
	quantity: number,
): number {
	const nextQuantity = Math.max(
		0,
		(inventory.items[itemId] ?? 0) - normalizedQuantity(quantity),
	);

	if (nextQuantity === 0) {
		delete inventory.items[itemId];
	} else {
		inventory.items[itemId] = nextQuantity;
	}

	return nextQuantity;
}

export function collectPickup(
	pickup: PickupObject,
	inventory: InventoryState,
	items: ItemDefinition[],
	collectedPickupIds: Set<string>,
): boolean {
	if (pickup.once && collectedPickupIds.has(pickup.id)) {
		return false;
	}

	giveItem(inventory, items, pickup.itemId, pickup.quantity);
	if (pickup.once) {
		collectedPickupIds.add(pickup.id);
	}
	return true;
}
