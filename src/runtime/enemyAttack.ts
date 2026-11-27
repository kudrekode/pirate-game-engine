import type { EnemyAttack, GameArea, ResolvedNPC } from "../types/game";
import type { CombatPoint } from "./combat";
import { applyRuntimeEnemyDamage } from "./enemyDamage";
import { hasClearGridLine, hasRetreatStep } from "./npcMovement";
import { queueEnemyArrow } from "./projectileRuntime";
import type { RuntimeNpcTickEventEmitter } from "./runtimeNpcTick";
import type { RuntimeSessionState } from "./runtimeSession";
import { isInteractionSegmentBlocked, type TraversalWorld } from "./traversal";

export type RuntimeEnemyAttack = {
	index: number;
	staggerUntil?: number;
	lastThreatAt?: number;
	consecutiveThreats?: number;
	defence?: { contactAt: number; readyAt: number; parry: boolean };
	disengage?: boolean;
	counterQueued?: boolean;
	counterReadyAt?: number;
	pending?: {
		phase: "windup" | "strike" | "recovery";
		dueAt: number;
		direction: CombatPoint;
		aimDistance?: number;
		counter?: boolean;
	};
};

function hasAttackSight(
	session: RuntimeSessionState,
	area: GameArea,
	npc: ResolvedNPC,
	distance: number,
	world?: TraversalWorld,
): boolean {
	if (world) {
		const position = session.playerVehicleState.active
			? session.playerPosition
			: (session.traversal?.position ?? session.playerPosition);
		if (
			isInteractionSegmentBlocked(
				world,
				{
					...position,
					height: world.sampler.sampleSurfaceY(position, world.mode),
				},
				npc,
				npc.id,
			)
		)
			return false;
		return hasClearGridLine(area, npc, session.playerPosition, distance);
	}
	if (session.traversal && !session.playerVehicleState.active) {
		return !isInteractionSegmentBlocked(
			session.traversal.world,
			session.traversal.position,
			npc,
			npc.id,
		);
	}
	return hasClearGridLine(area, npc, session.playerPosition, distance);
}

function canConnect(
	session: RuntimeSessionState,
	area: GameArea,
	npc: ResolvedNPC,
	attack: EnemyAttack,
	direction: CombatPoint,
	delta: CombatPoint,
	world?: TraversalWorld,
) {
	const distance = Math.hypot(delta.x, delta.y);
	return (
		distance <= attack.rangeTiles &&
		delta.x * direction.x + delta.y * direction.y >=
			distance * Math.cos((attack.arcDegrees * Math.PI) / 360) - 1e-8 &&
		hasAttackSight(session, area, npc, distance, world)
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
	canMove: (x: number, y: number) => boolean,
	world?: TraversalWorld,
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
	if (time < (state.staggerUntil ?? 0)) return true;
	const attack = behaviour.attacks[state.index % behaviour.attacks.length];
	const player = session.playerVehicleState.active
		? session.playerPosition
		: (session.traversal?.position ?? session.playerPosition);
	const delta = { x: player.x - npc.x, y: player.y - npc.y };
	const pending = state.pending;
	const defence = state.defence;
	// A swordsman who has seen the cut in time commits to the ward instead
	// of simultaneously launching an attack or stepping into the blade.
	if (
		defence &&
		session.pendingMelee?.dueAt === defence.contactAt &&
		defence.readyAt <= defence.contactAt &&
		time >= defence.readyAt &&
		(!pending || pending.phase === "windup") &&
		(!pending ||
			delta.x * pending.direction.x + delta.y * pending.direction.y > 0)
	)
		return true;
	if (!pending) {
		if (state.disengage && !state.counterQueued) return false;
		if (state.counterQueued && time < (state.counterReadyAt ?? 0)) return true;
		if (!canStart && !state.counterQueued) return false;
		if (
			!state.counterQueued &&
			behaviour.keepDistanceTiles &&
			Math.hypot(delta.x, delta.y) < behaviour.keepDistanceTiles &&
			hasRetreatStep(npc, session.playerPosition, canMove)
		)
			return false;
		const distance = Math.hypot(delta.x, delta.y);
		const direction =
			distance > 0
				? { x: delta.x / distance, y: delta.y / distance }
				: { x: 0, y: 1 };
		if (
			distance > behaviour.detectionRadiusTiles ||
			!canConnect(session, area, npc, attack, direction, delta, world)
		) {
			state.counterQueued = false;
			return false;
		}
		const counter = state.counterQueued;
		const windup =
			counter && behaviour.swordTactics
				? behaviour.swordTactics.counterWindupMs
				: attack.windupMs;
		state.counterQueued = false;
		state.pending = {
			phase: "windup",
			counter,
			dueAt: time + windup,
			aimDistance: distance,
			direction,
		};
		session.enemyAttacks.set(npc.id, state);
		emit({
			type: "enemyAttackWindup",
			npcId: npc.id,
			clip: attack.windupClip,
			weapon: behaviour.weapon,
			durationMs: windup,
			direction,
		});
		emit({
			type: "status",
			message: counter
				? `${npc.name} turns the blade for a counter.`
				: `${npc.name} prepares ${attack.label}.${attack.unblockable ? " Step clear!" : behaviour.guardWindup ? " Guard raised." : ""}`,
		});
		return true;
	}
	if (time < pending.dueAt) return true;
	if (pending.phase === "windup") {
		pending.phase = "strike";
		pending.dueAt = time + attack.impactMs;
		emit({
			type: "enemyAttackStrike",
			npcId: npc.id,
			clip: attack.strikeClip,
			weapon: behaviour.weapon,
			...(behaviour.weapon === "sword" && { impactMs: attack.impactMs }),
		});
	} else if (pending.phase === "strike") {
		pending.phase = "recovery";
		pending.dueAt = time + attack.recoveryMs;
		if (attack.arrowSpeed) {
			queueEnemyArrow(
				session,
				npc,
				pending.direction,
				pending.aimDistance ?? attack.rangeTiles,
				attack,
			);
			emit({ type: "status", message: `${npc.name} looses ${attack.label}.` });
		} else if (
			canConnect(session, area, npc, attack, pending.direction, delta, world)
		) {
			const result = applyRuntimeEnemyDamage(
				session,
				npc.id,
				attack.damage,
				`${npc.name}: ${attack.label} hits.`,
				emit,
				true,
				{ time, incoming: pending.direction, unblockable: attack.unblockable },
			);
			if (result === "parry" && behaviour.swordTactics)
				state.index = (state.index + 1) % behaviour.attacks.length;
			if (result === "hit" && behaviour.swordTactics) {
				// Recoiling from a counter is forced downtime. The defender still
				// recognizes an immediate return to the same attack on recovery.
				if (pending.counter) state.lastThreatAt = time;
				// With the opponent recoiling, recover the blade sooner. A whiff
				// or a block still exposes the full authored recovery.
				pending.dueAt = time + Math.round(attack.recoveryMs * 0.48);
				session.nextAttackAt = Math.max(
					session.nextAttackAt,
					time + (pending.counter ? 540 : 390),
				);
			}
		} else {
			emit({ type: "status", message: `${npc.name}: ${attack.label} misses.` });
		}
	} else {
		state.index = (state.index + 1) % behaviour.attacks.length;
		state.pending = undefined;
		// Recover measure after a committed cut. The movement helper chooses a legal retreat cell.
		if (
			behaviour.swordTactics &&
			behaviour.keepDistanceTiles &&
			!pending.counter
		) {
			state.disengage = true;
			return false;
		}
		// Re-evaluate range before stepping into the target after recovery.
		return !!(behaviour.keepDistanceTiles || behaviour.body);
	}
	return true;
}
