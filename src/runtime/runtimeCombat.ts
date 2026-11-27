import type { GameArea, NPCInstance } from "../types/game";
import {
	canAttack,
	damageNpc,
	findAttackTarget,
	isNpcAttackable,
	removeDefeatedNpc,
} from "./combat";
import { hasClearGridLine } from "./npcMovement";
import { resolveNPCInstance } from "./npcResolver";
import { isPlayerAirborne } from "./playerLocomotion";
import {
	getQuestViews,
	type QuestView,
	updateQuestProgress,
} from "./questEngine";
import { isRuntimeGameplayBlocked } from "./runtimeInput";
import type { RuntimeSessionState } from "./runtimeSession";
import {
	isInteractionSegmentBlocked,
	type RuntimeTraversal,
} from "./traversal";
import {
	equippedMeleeProfile,
	getEquippedWeapon,
	getRuntimeAttackStats,
} from "./weaponRuntime";

export type RuntimeCombatEvent =
	| {
			type: "attackStarted";
			impactMs?: number;
			nextAttackAt: number;
			weapon?: "sword" | "bow";
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
	| { type: "bladeDeflected"; npcId: string; parry: boolean }
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
	session.enemyAttacks.delete(npc.id);

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

/** Advance absolute combat deadlines by the time spent in an encounter menu. */
export function resumeCombatAfterPause(
	session: RuntimeSessionState,
	pause: number,
) {
	session.nextAttackAt += pause;
	if (session.nextGuardAt !== undefined) session.nextGuardAt += pause;
	if (session.pendingMelee) {
		session.pendingMelee.dueAt += pause;
		if (session.pendingMelee.activeUntil !== undefined)
			session.pendingMelee.activeUntil += pause;
	}
	if (session.riposte) session.riposte.until += pause;
	for (const state of session.enemyAttacks.values()) {
		if (state.pending) state.pending.dueAt += pause;
		if (state.staggerUntil !== undefined) state.staggerUntil += pause;
		if (state.counterReadyAt !== undefined) state.counterReadyAt += pause;
		if (state.lastThreatAt !== undefined) state.lastThreatAt += pause;
		if (state.defence) {
			state.defence.contactAt += pause;
			state.defence.readyAt += pause;
		}
	}
	for (const state of session.npcMovementStates.values())
		state.nextMoveAt += pause;
}

/** Common acceptance/cooldown seam. Projectile impacts never start a second attack. */
export function beginRuntimeCombatAttack(
	session: RuntimeSessionState,
	time: number,
	emit: RuntimeCombatEventEmitter,
): boolean {
	if (
		isPlayerAirborne(session) ||
		session.runtimePlayerHealth <= 0 ||
		isRuntimeGameplayBlocked(session, false)
	)
		return false;
	if (
		(session.guardSince !== undefined &&
			!(session.riposte && time < session.riposte.until)) ||
		session.pendingMelee
	)
		return false;
	if (!canAttack(time, session.nextAttackAt)) {
		emit({ type: "attackBlocked", reason: "cooldown" });
		if (!equippedMeleeProfile(session))
			emit({ type: "status", message: "Attack cooling down." });
		return false;
	}

	session.guardSince = undefined;
	session.guardPressedAt = undefined;
	const weapon = getEquippedWeapon(session);
	const profile = equippedMeleeProfile(session);
	session.nextAttackAt = time + getRuntimeAttackStats(session).attackCooldownMs;
	emit({
		type: "attackStarted",
		nextAttackAt: session.nextAttackAt,
		weapon: weapon?.id,
		...(profile && { impactMs: profile.impactMs }),
	});
	return true;
}

/** Use the same heading as the swing in continuously traversed areas. */
function findMeleeArcTarget(
	session: RuntimeSessionState,
	area: GameArea,
	traversal: RuntimeTraversal | undefined,
	facing: { x: number; y: number },
	reach: number,
): NPCInstance | undefined {
	const origin = traversal?.position ?? session.playerPosition;
	const headingLength = Math.hypot(facing.x, facing.y);
	if (!headingLength) return undefined;
	let nearest: NPCInstance | undefined;
	let closestDistance = Infinity;
	for (const npc of area.npcs) {
		if (
			!isNpcAttackable(
				npc,
				session.runtimeState.npcs[npc.id],
				session.defeatedNpcIds,
			)
		)
			continue;
		const dx = npc.x - origin.x;
		const dy = npc.y - origin.y;
		const distance = Math.hypot(dx, dy);
		const body = traversal
			? traversal.world.actorBodies.get(npc.id)
			: resolveNPCInstance(
					session.project.npcs.find((d) => d.id === npc.npcDefinitionId),
					npc,
				).enemyBehaviour?.body;
		const radius = body?.radius ?? 0;
		if (distance > reach + radius || distance >= closestDistance) continue;
		// Half of a 100-degree swing on either side of the character's heading.
		if (
			dx * facing.x + dy * facing.y <
			distance * headingLength * Math.cos((50 * Math.PI) / 180)
		)
			continue;
		if (
			traversal
				? isInteractionSegmentBlocked(
						traversal.world,
						traversal.position,
						npc,
						npc.id,
					)
				: !hasClearGridLine(area, npc, origin, distance)
		)
			continue;
		nearest = npc;
		closestDistance = distance;
	}
	return nearest;
}

/** Read a committed swing. A defender already delivering or recovering cannot raise a new guard. */
function noticeSwordThreat(
	session: RuntimeSessionState,
	area: GameArea,
	time: number,
	facing: { x: number; y: number },
	reach: number,
	contactAt: number,
) {
	const target = findMeleeArcTarget(
		session,
		area,
		session.traversal,
		facing,
		reach + 0.65,
	);
	if (!target) return;
	const enemy = resolveNPCInstance(
		session.project.npcs.find((d) => d.id === target.npcDefinitionId),
		target,
	);
	const tactics = enemy.enemyBehaviour?.swordTactics;
	if (!tactics || enemy.enemyBehaviour?.weapon !== "sword") return;
	const state = session.enemyAttacks.get(target.id) ?? { index: 0 };
	session.enemyAttacks.set(target.id, state);
	state.consecutiveThreats =
		time - (state.lastThreatAt ?? -Infinity) <= 1050
			? (state.consecutiveThreats ?? 0) + 1
			: 1;
	state.lastThreatAt = time;
	state.defence = undefined;
	// The defender can see a cut during recovery, but cannot bring the blade back
	// before recovering. A swing landing inside that opening still connects.
	const availableAt = Math.max(
		time,
		state.staggerUntil ?? 0,
		state.pending?.phase === "recovery" ? state.pending.dueAt : 0,
	);
	if (state.pending?.phase === "strike") return;
	const parry = state.consecutiveThreats >= tactics.parryAfter;
	if (parry || enemy.enemyBehaviour?.guardWindup)
		state.defence = {
			contactAt,
			readyAt: availableAt + tactics.reactionMs,
			parry,
		};
}

export function attemptRuntimeCombatAttack(
	session: RuntimeSessionState,
	area: GameArea,
	time: number,
	emit: RuntimeCombatEventEmitter,
	facing = session.playerFacing,
): boolean {
	// Bow acceptance requires an explicit aim ray and the shared projectile loop.
	if (getEquippedWeapon(session)?.id === "bow") return false;
	if (!beginRuntimeCombatAttack(session, time, emit)) return false;
	const attack = getRuntimeAttackStats(session);

	const profile = equippedMeleeProfile(session);
	if (profile) {
		noticeSwordThreat(
			session,
			area,
			time,
			facing,
			attack.attackRangeTiles,
			time + profile.impactMs,
		);
		session.pendingMelee = {
			dueAt: time + profile.impactMs,
			activeUntil:
				time +
				Math.min(
					profile.cooldownMs,
					profile.impactMs + (profile.activeMs ?? 0),
				),
			facing: { ...facing },
			damage: attack.attackDamage,
			reach: attack.attackRangeTiles,
		};
		return true;
	}
	return resolveMeleeImpact(
		session,
		area,
		time,
		facing,
		attack.attackRangeTiles,
		attack.attackDamage,
		emit,
	);
}

export function advanceRuntimeMelee(
	session: RuntimeSessionState,
	area: GameArea,
	time: number,
	emit: RuntimeCombatEventEmitter,
) {
	const swing = session.pendingMelee;
	if (!swing || time < swing.dueAt) return;
	if (
		swing.activeUntil !== undefined &&
		swing.activeUntil > swing.dueAt &&
		time > swing.activeUntil
	) {
		session.pendingMelee = undefined;
		emit({ type: "attackBlocked", reason: "missed" });
		emit({ type: "status", message: "Attack missed." });
		return;
	}
	const lastSample = time >= (swing.activeUntil ?? swing.dueAt);
	if (
		session.runtimePlayerHealth <= 0 ||
		resolveMeleeImpact(
			session,
			area,
			time,
			swing.facing,
			swing.reach,
			swing.damage,
			emit,
			lastSample,
		) ||
		lastSample
	)
		session.pendingMelee = undefined;
}

function resolveMeleeImpact(
	session: RuntimeSessionState,
	area: GameArea,
	time: number,
	facing: { x: number; y: number },
	reach: number,
	damage: number,
	emit: RuntimeCombatEventEmitter,
	reportMiss = true,
) {
	const target =
		(session.traversal || equippedMeleeProfile(session)) &&
		!session.playerVehicleState.active
			? findMeleeArcTarget(session, area, session.traversal, facing, reach)
			: findAttackTarget(
					area.npcs,
					session.runtimeState.npcs,
					session.defeatedNpcIds,
					session.playerPosition,
					session.playerFacing,
					reach,
				);

	if (!target) {
		if (!reportMiss) return false;
		emit({ type: "attackBlocked", reason: "missed" });
		emit({ type: "status", message: "Attack missed." });
		return false;
	}

	const state = session.enemyAttacks.get(target.id);
	const riposte =
		session.riposte?.npcId === target.id && time < session.riposte.until;
	if (riposte) {
		session.riposte = undefined;
		const hit = damageRuntimeNpc(
			session,
			area,
			target,
			Math.round(damage * 1.5),
			emit,
		);
		if (hit && !session.defeatedNpcIds.has(target.id))
			emit({ type: "status", message: "Riposte lands. Recover your guard." });
		return hit;
	}
	if (state && (state.defence || state.pending?.phase === "windup")) {
		const enemy = resolveNPCInstance(
			session.project.npcs.find((d) => d.id === target.npcDefinitionId),
			target,
		);
		const direction = state.pending?.direction ?? {
			x: target.facing === "right" ? 1 : target.facing === "left" ? -1 : 0,
			y: target.facing === "down" ? 1 : target.facing === "up" ? -1 : 0,
		};
		const defence = state.defence;
		state.defence = undefined;
		const guarded = enemy.enemyBehaviour?.swordTactics
			? defence &&
				time - defence.contactAt < 200 &&
				defence.readyAt <= defence.contactAt &&
				time >= (state.staggerUntil ?? 0) &&
				(!state.pending || state.pending.phase === "windup")
			: enemy.enemyBehaviour?.guardWindup;
		const origin = session.traversal?.position ?? session.playerPosition;
		if (
			guarded &&
			(origin.x - target.x) * direction.x +
				(origin.y - target.y) * direction.y >
				0
		) {
			const parry = !!defence?.parry;
			if (defence && !state.pending?.counter) {
				state.pending = undefined;
				state.counterQueued = true;
				state.counterReadyAt = time + 100;
				if (parry) {
					session.nextAttackAt = Math.max(session.nextAttackAt, time + 580);
					session.nextGuardAt = Math.max(session.nextGuardAt ?? 0, time + 580);
				}
			}
			emit({ type: "bladeDeflected", npcId: target.id, parry });
			emit({
				type: "status",
				message: parry
					? `${enemy.name} parries your repeated cut!`
					: `${enemy.name} blocks your blade.`,
			});
			return true;
		}
		if (
			state.pending?.phase === "windup" &&
			!state.pending.counter &&
			!enemy.enemyBehaviour?.guardWindup &&
			enemy.enemyBehaviour?.staggerMs
		) {
			state.pending = undefined;
			state.staggerUntil = time + enemy.enemyBehaviour.staggerMs;
		}
	}
	return damageRuntimeNpc(session, area, target, damage, emit);
}

/** Melee and arrow impact share health, reactions, defeat flags and quest rewards. */
export function damageRuntimeNpc(
	session: RuntimeSessionState,
	area: GameArea,
	target: NPCInstance,
	damage: number,
	emit: RuntimeCombatEventEmitter,
): boolean {
	if (
		!area.npcs.includes(target) ||
		!isNpcAttackable(
			target,
			session.runtimeState.npcs[target.id],
			session.defeatedNpcIds,
		)
	)
		return false;
	const attributes = session.runtimeState.npcs[target.id] ?? target.attributes;
	const result = damageNpc(attributes, damage);
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
		damage,
		health: result.health,
		maxHealth: attributes.maxHealth,
	});

	if (result.defeated) {
		defeatRuntimeNpc(session, area, target, enemyName, emit);
	} else {
		emit({
			type: "status",
			message: `Hit ${enemyName} for ${damage}.`,
		});
	}

	emit({ type: "stateChanged" });
	emit({ type: "combatChanged" });
	return true;
}
