import type {
	NPCAttributes,
	NPCInstance,
	PlayerCombatStats,
	PlayerConfig,
} from "../types/game";

export type CombatPoint = { x: number; y: number };

export type RuntimeCombatHudState = {
	playerHealth: number;
	playerMaxHealth: number;
	recentEnemy?: {
		id: string;
		name: string;
		health: number;
		maxHealth: number;
	};
	gameOver: boolean;
};

export function getPlayerCombatStats(player: PlayerConfig): PlayerCombatStats {
	const maxHealth = Math.max(1, Math.round(player.combat?.maxHealth ?? 100));
	const health = Math.max(
		0,
		Math.min(
			maxHealth,
			Math.round(player.combat?.health ?? player.health ?? maxHealth),
		),
	);

	return {
		maxHealth,
		health,
		attackDamage: Math.max(0, Math.round(player.combat?.attackDamage ?? 25)),
		attackRangeTiles: Math.max(
			1,
			Math.round(player.combat?.attackRangeTiles ?? 1),
		),
		attackCooldownMs: Math.max(
			0,
			Math.round(player.combat?.attackCooldownMs ?? 500),
		),
	};
}

export function canAttack(time: number, nextAttackAt: number): boolean {
	return time >= nextAttackAt;
}

export function isNpcAttackable(
	npc: NPCInstance,
	attributes: NPCAttributes | undefined,
	defeatedNpcIds: Set<string>,
): boolean {
	return (
		!defeatedNpcIds.has(npc.id) &&
		(attributes ?? npc.attributes).alignment === "hostile"
	);
}

export function findAttackTarget(
	npcs: NPCInstance[],
	runtimeAttributes: Record<string, NPCAttributes>,
	defeatedNpcIds: Set<string>,
	playerPosition: CombatPoint,
	facing: CombatPoint,
	attackRangeTiles: number,
): NPCInstance | undefined {
	for (let distance = 1; distance <= attackRangeTiles; distance += 1) {
		const targetX = playerPosition.x + facing.x * distance;
		const targetY = playerPosition.y + facing.y * distance;
		const npc = npcs.find(
			(candidate) => candidate.x === targetX && candidate.y === targetY,
		);
		if (
			npc &&
			isNpcAttackable(npc, runtimeAttributes[npc.id], defeatedNpcIds)
		) {
			return npc;
		}
	}

	return undefined;
}

export function damageNpc(
	attributes: NPCAttributes,
	damage: number,
): { health: number; defeated: boolean } {
	const health = Math.max(
		0,
		attributes.health - Math.max(0, Math.round(damage)),
	);
	attributes.health = health;
	return { health, defeated: health <= 0 };
}

export function damagePlayer(
	currentHealth: number,
	damage: number,
): { health: number; defeated: boolean } {
	const health = Math.max(0, currentHealth - Math.max(0, Math.round(damage)));
	return { health, defeated: health <= 0 };
}

export function removeDefeatedNpc(
	npcs: NPCInstance[],
	npcId: string,
): NPCInstance[] {
	return npcs.filter((npc) => npc.id !== npcId);
}
