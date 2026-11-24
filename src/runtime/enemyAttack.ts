import type { EnemyAttack, GameArea, ResolvedNPC } from "../types/game";
import { type CombatPoint, damagePlayer } from "./combat";
import { isNpcTileWalkable } from "./npcMovement";
import type { RuntimeNpcTickEventEmitter } from "./runtimeNpcTick";
import type { RuntimeSessionState } from "./runtimeSession";
import { isInteractionSegmentBlocked } from "./traversal";

export type RuntimeEnemyAttack = {
	index: number;
	pending?: {
		phase: "windup" | "strike" | "recovery";
		dueAt: number;
		direction: CombatPoint;
	};
};

export function applyRuntimeEnemyDamage(
	session: RuntimeSessionState,
	npcId: string,
	damage: number,
	message: string,
	emit: RuntimeNpcTickEventEmitter,
	patterned = false,
) {
	let defeated = false;
	if (damage > 0) {
		const result = damagePlayer(session.runtimePlayerHealth, damage);
		session.runtimePlayerHealth = result.health;
		session.bowDraw = undefined;
		defeated = result.defeated;
		emit({
			type: "playerDamaged",
			npcId,
			damage,
			health: result.health,
			...(patterned && { patterned }),
		});
	}
	emit({
		type: "status",
		message:
			damage > 0
				? `${message} Health ${session.runtimePlayerHealth}/${session.playerCombat.maxHealth}.`
				: message,
	});
	if (defeated) emit({ type: "gameOver" });
	emit({ type: "stateChanged" });
	emit({ type: "combatChanged" });
}

function hasAttackSight(
	session: RuntimeSessionState,
	area: GameArea,
	npc: ResolvedNPC,
	distance: number,
): boolean {
	if (session.traversal && !session.playerVehicleState.active) {
		return !isInteractionSegmentBlocked(
			session.traversal.world,
			session.traversal.position,
			npc,
			npc.id,
		);
	}
	const steps = Math.ceil(distance * 2);
	const player = session.playerPosition;
	for (let i = 1; i < steps; i += 1) {
		const x = Math.round(npc.x + (player.x - npc.x) * (i / steps));
		const y = Math.round(npc.y + (player.y - npc.y) * (i / steps));
		if (x === player.x && y === player.y) break;
		if (x === npc.x && y === npc.y) continue;
		if (!isNpcTileWalkable(area, npc.id, x, y)) return false;
	}
	return true;
}

function canConnect(
	session: RuntimeSessionState,
	area: GameArea,
	npc: ResolvedNPC,
	attack: EnemyAttack,
	direction: CombatPoint,
	delta: CombatPoint,
) {
	const distance = Math.hypot(delta.x, delta.y);
	return (
		distance <= attack.rangeTiles &&
		delta.x * direction.x + delta.y * direction.y >=
			distance * Math.cos((attack.arcDegrees * Math.PI) / 360) - 1e-8 &&
		hasAttackSight(session, area, npc, distance)
	);
}

/** True holds locomotion. The windup locks a heading and impact samples the live player position. */
export function tickEnemyAttack(
	session: RuntimeSessionState,
	area: GameArea,
	npc: ResolvedNPC,
	time: number,
	canStart: boolean,
	emit: RuntimeNpcTickEventEmitter,
): boolean {
	const behaviour = npc.enemyBehaviour;
	if (
		!behaviour?.enabled ||
		!behaviour.attacks?.length ||
		npc.attributes.alignment !== "hostile"
	) {
		session.enemyAttacks.delete(npc.id);
		return false;
	}
	const state = session.enemyAttacks.get(npc.id) ?? { index: 0 };
	const attack = behaviour.attacks[state.index % behaviour.attacks.length];
	const player = session.playerVehicleState.active
		? session.playerPosition
		: (session.traversal?.position ?? session.playerPosition);
	const delta = { x: player.x - npc.x, y: player.y - npc.y };
	const pending = state.pending;
	if (!pending) {
		if (!canStart) return false;
		const distance = Math.hypot(delta.x, delta.y);
		const direction =
			distance > 0
				? { x: delta.x / distance, y: delta.y / distance }
				: { x: 0, y: 1 };
		if (
			distance > behaviour.detectionRadiusTiles ||
			!canConnect(session, area, npc, attack, direction, delta)
		)
			return false;
		state.pending = {
			phase: "windup",
			dueAt: time + attack.windupMs,
			direction,
		};
		session.enemyAttacks.set(npc.id, state);
		emit({
			type: "enemyAttackWindup",
			npcId: npc.id,
			clip: attack.windupClip,
			durationMs: attack.windupMs,
			direction,
		});
		emit({ type: "status", message: `${npc.name} prepares ${attack.label}.` });
		return true;
	}
	if (time < pending.dueAt) return true;
	if (pending.phase === "windup") {
		pending.phase = "strike";
		pending.dueAt = time + attack.impactMs;
		emit({ type: "enemyAttackStrike", npcId: npc.id, clip: attack.strikeClip });
	} else if (pending.phase === "strike") {
		pending.phase = "recovery";
		pending.dueAt = time + attack.recoveryMs;
		if (canConnect(session, area, npc, attack, pending.direction, delta)) {
			applyRuntimeEnemyDamage(
				session,
				npc.id,
				attack.damage,
				`${npc.name}: ${attack.label} hits.`,
				emit,
				true,
			);
		} else {
			emit({ type: "status", message: `${npc.name}: ${attack.label} misses.` });
		}
	} else {
		state.index = (state.index + 1) % behaviour.attacks.length;
		state.pending = undefined;
		return false;
	}
	return true;
}
