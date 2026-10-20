import type { ItemDefinition } from "../types/game";

export const itemCategoryLabels: Record<ItemDefinition["category"], string> = {
	key: "Key Item",
	misc: "General",
	currency: "Currency",
	quest: "Quest Item",
	consumable: "Consumable",
	weapon: "Weapon",
};

// Small authored symbols, with category fallbacks for missing/legacy icon ids.
export const itemIcons = { key: "⚿", coin: "◉", parcel: "▣", scroll: "▤" };

export function itemIcon(item?: ItemDefinition): string {
	if (item?.iconId && Object.keys(itemIcons).includes(item.iconId))
		return itemIcons[item.iconId as keyof typeof itemIcons];
	return item?.category === "key"
		? itemIcons.key
		: item?.category === "currency"
			? itemIcons.coin
			: item?.category === "quest"
				? itemIcons.scroll
				: itemIcons.parcel;
}
