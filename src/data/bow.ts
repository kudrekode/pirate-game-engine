import type { ItemDefinition } from "../types/game";

/** One bow, infinite arrows. Distances are metres and timing is milliseconds. */
export const BOW = {
	id: "bow",
	type: "ranged",
	attackDamage: 32,
	attackCooldownMs: 1000,
	projectileSpeed: 28,
	maxRange: 48,
	lifetimeMs: 2000,
	releaseDelayMs: 300,
	visualAssetId: "weapon-bow-v1",
	projectileAssetId: "weapon-arrow-v1",
	socket: "leftHand",
	grip: {
		position: [0.035, 0.095, 0.008] as const,
		rotation: [-1.648906, 0.043131, 1.530908] as const,
		scale: 1,
	},
	// Arrow tip, relative to the grip-centred bow asset (+Z is forward).
	projectileSocket: [0, 0.035, 0.28] as const,
	attackAnimation: {
		assetId: "golden-bow-actions-v1",
		clipName: "GoldenBow_Fire_V1",
	},
} as const;

export const BOW_ITEM: ItemDefinition = {
	id: "bow",
	name: "Bow",
	description:
		"A simple bow with unlimited arrows. Equip it, aim with the camera and press F.",
	category: "weapon",
	weapon: "bow",
	stackable: false,
};
