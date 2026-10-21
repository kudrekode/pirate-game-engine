import type { ItemDefinition } from "../types/game";

/** One bow, infinite arrows. Distances are metres and timing is milliseconds. */
export const BOW = {
	id: "bow",
	type: "ranged",
	attackDamage: 32,
	attackCooldownMs: 1000,
	minimumDrawMs: 180,
	fullDrawMs: 1200,
	minimumSpeed: 16,
	projectileSpeed: 40,
	minimumDamage: 18,
	gravity: 9.8,
	maxRange: 120,
	lifetimeMs: 4000,
	// Play the existing clip from its drawn key to its release key.
	drawPoseSeconds: 16 / 60,
	releasePoseSeconds: 18 / 60,
	releaseDelayMs: (2 / 60) * 1000,
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
		"Hold F to draw, then release to fire. Longer draws fly faster and hit harder; aim above distant targets.",
	category: "weapon",
	weapon: "bow",
	stackable: false,
};
