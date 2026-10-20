import type { GameArea, NPCInstance } from "../types/game";
import {
	canAttack,
	damageNpc,
	findAttackTarget,
	removeDefeatedNpc,
} from "./combat";
import { resolveNPCInstance } from "./npcResolver";
import { isPlayerAirborne } from "./playerLocomotion";
import {
	getQuestViews,
	type QuestView,
	updateQuestProgress,
} from "./questEngine";
import { isRuntimeGameplayBlocked } from "./runtimeInput";
import type { RuntimeSessionState } from "./runtimeSession";
import { getEquippedWeapon, getRuntimeAttackStats } from "./weaponRuntime";

export type RuntimeCombatEvent =
	| {
			type: "attackStarted";
			nextAttackAt: number;
			weapon?: "sword";
	  }
	| {
			type: "attackBlocked";
			reason: "cooldown" | "missed";
	  }
	| {
			type: "npcDamaged";
			npcId: string;
			name: string;
			damage: number;
			health: number;
			maxHealth: number;
	  }
	| {
			type: "npcDefeated";
			npcId: string;
			name: string;
	  }
	| { type: "npcRemoved"; npcId: string }
	| { type: "flagChanged"; flag: string; value: boolean }
	| {
			type: "triggerRequested";
			triggerType: "on_npc_defeated";
			targetId: string;
	  }
	| { type: "status"; message: string }
	| { type: "stateChanged" }
	| { type: "combatChanged" }
	| { type: "itemFeedback"; message: string }
	| { type: "inventoryChanged"; inventory: Record<string, number> }
	| { type: "questsChanged"; quests: QuestView[] }
	| { type: "flowLog"; message: string };

export type RuntimeCombatEventEmitter = (event: RuntimeCombatEvent) => void;

function getNpcName(session: RuntimeSessionState, npc: NPCInstance): string {
	return resolveNPCInstance(
		session.project.npcs.find(
			(definition) => definition.id === npc.npcDefinitionId,
		),
		npc,
	).name;
}

function syncQuestProgress(
	session: RuntimeSessionState,
	emit: RuntimeCombatEventEmitter,
): void {
	const stateChanged = updateQuestProgress(
		session.runtimeQuestState,
		session.runtimeState,
		session.project.items,
		(message) => emit({ type: "itemFeedback", message }),
	);
	if (stateChanged) {
		emit({
			type: "inventoryChanged",
			inventory: { ...session.runtimeState.inventory.items },
		});
		emit({ type: "stateChanged" });
	}
	emit({
		type: "questsChanged",
		quests: getQuestViews(session.runtimeQuestState, session.runtimeState),
	});
}

function defeatRuntimeNpc(
	session: RuntimeSessionState,
	area: GameArea,
	npc: NPCInstance,
	enemyName: string,
	emit: RuntimeCombatEventEmitter,
): void {
	session.defeatedNpcIds.add(npc.id);
	const defeatedFlag = `npc_defeated_${npc.id}`;
	session.runtimeState.flags[defeatedFlag] = true;
	area.npcs = removeDefeatedNpc(area.npcs, npc.id);
	session.npcMovementStates.delete(npc.id);
	session.enemyContactCooldowns.delete(npc.id);

	emit({ type: "npcDefeated", npcId: npc.id, name: enemyName });
	emit({ type: "flagChanged", flag: defeatedFlag, value: true });
	emit({ type: "npcRemoved", npcId: npc.id });
	emit({ type: "status", message: `${enemyName} defeated.` });
	syncQuestProgress(session, emit);
}

function updateRecentEnemy(
	session: RuntimeSessionState,
	npc: NPCInstance,
	enemyName: string,
	health: number,
	maxHealth: number,
): void {
	session.recentEnemy = {
		id: npc.id,
		name: enemyName,
		health,
		maxHealth,
	};
}

export function attemptRuntimeCombatAttack(
	session: RuntimeSessionState,
	area: GameArea,
	time: number,
	emit: RuntimeCombatEventEmitter,
): boolean {
	if (
		isPlayerAirborne(session) ||
		session.runtimePlayerHealth <= 0 ||
		isRuntimeGameplayBlocked(session, false)
	)
		return false;
	if (!canAttack(time, session.nextAttackAt)) {
		emit({ type: "attackBlocked", reason: "cooldown" });
		emit({ type: "status", message: "Attack cooling down." });
		return false;
	}

	const attack = getRuntimeAttackStats(session);
	session.nextAttackAt = time + attack.attackCooldownMs;
	emit({
		type: "attackStarted",
		nextAttackAt: session.nextAttackAt,
		weapon: getEquippedWeapon(session)?.id,
	});

	const target = findAttackTarget(
		area.npcs,
		session.runtimeState.npcs,
		session.defeatedNpcIds,
		session.playerPosition,
		session.playerFacing,
		attack.attackRangeTiles,
	);

	if (!target) {
		emit({ type: "attackBlocked", reason: "missed" });
		emit({ type: "status", message: "Attack missed." });
		return false;
	}

	const attributes = session.runtimeState.npcs[target.id] ?? target.attributes;
	const result = damageNpc(attributes, attack.attackDamage);
	const enemyName = getNpcName(session, target);
	updateRecentEnemy(
		session,
		target,
		enemyName,
		result.health,
		attributes.maxHealth,
	);
	emit({
		type: "npcDamaged",
		npcId: target.id,
		name: enemyName,
		damage: attack.attackDamage,
		health: result.health,
		maxHealth: attributes.maxHealth,
	});

	if (result.defeated) {
		defeatRuntimeNpc(session, area, target, enemyName, emit);
	} else {
		emit({
			type: "status",
			message: `Hit ${enemyName} for ${attack.attackDamage}.`,
		});
	}

	emit({ type: "stateChanged" });
	emit({ type: "combatChanged" });
	return true;
}
