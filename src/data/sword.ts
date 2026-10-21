import type { ItemDefinition } from "../types/game";

// One archetype. Items reference this behaviour; inventory identity stays authored.
export const SWORD = {
	id: "sword",
	attackDamage: 35,
	attackRangeTiles: 2,
	attackCooldownMs: 750,
	visualAssetId: "weapon-sword-v1",
	socket: "rightHand",
	grip: {
		position: [-0.035, 0.095, 0.008] as const,
		rotation: [Math.PI / 2, 0, -Math.PI / 8] as const,
		scale: 1,
	},
	attackAnimation: {
		assetId: "golden-sword-actions-v1",
		clipName: "GoldenSword_Attack_V1",
	},
} as const;

export const SWORD_ITEM: ItemDefinition = {
	id: "sword",
	name: "Sword",
	description: "A simple one-handed sword. Equip it from your inventory.",
	category: "weapon",
	weapon: "sword",
	stackable: false,
};
