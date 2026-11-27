import type { GameArea, NPCInstance } from "../types/game";
import { tickEnemyAttack } from "./enemyAttack";
import { applyRuntimeEnemyDamage } from "./enemyDamage";
import {
	isEnemyTouchingPlayer,
	isNpcTileWalkable,
	type NPCMovementState,
	updateEnemyNPC,
	updatePatrolNPC,
	updateStationaryNPC,
	updateWanderNPC,
} from "./npcMovement";
import { resolveNPCInstance } from "./npcResolver";
import type {
	RuntimeGridPosition,
	RuntimeSessionState,
} from "./runtimeSession";

import {
	isInteractionSegmentBlocked,
	PLAYER_HALF_WIDTH,
	type TraversalWorld,
} from "./traversal";

export type RuntimeNpcTickEvent =
	| {
			type: "npcMoved";
			npcId: string;
			from: RuntimeGridPosition;
			to: RuntimeGridPosition;
			facing: NonNullable<NPCInstance["facing"]>;
			durationMs: number;
	  }
	| {
			type: "npcBlocked";
			npcId: string;
			x: number;
			y: number;
	  }
	| {
			type: "npcFacingChanged";
			npcId: string;
			facing: NonNullable<NPCInstance["facing"]>;
	  }
	| { type: "enemyDetectedPlayer"; npcId: string }
	| { type: "enemyLostPlayer"; npcId: string }
	| { type: "enemyTouchedPlayer"; npcId: string }
	| {
			type: "enemyAttackWindup";
			npcId: string;
			clip?: string;
			durationMs: number;
			direction: RuntimeGridPosition;
			weapon?: "sword" | "bow";
	  }
	| { type: "guardContact"; parry: boolean; npcId: string }
	| { type: "enemyStaggered"; npcId: string }
	| {
			type: "enemyAttackStrike";
			impactMs?: number;
			npcId: string;
			clip?: string;
			weapon?: "sword" | "bow";
	  }
	| {
			type: "playerDamaged";
			npcId: string;
			damage: number;
			health: number;
			patterned?: boolean;
	  }
	| { type: "gameOver" }
	| { type: "combatChanged" }
	| { type: "stateChanged" }
	| { type: "status"; message: string }
	| { type: "flowLog"; message: string };

export type RuntimeNpcTickEventEmitter = (event: RuntimeNpcTickEvent) => void;

export type RuntimeNpcTickOptions = {
	random?: () => number;
	world?: TraversalWorld;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function getResolvedNpc(session: RuntimeSessionState, npc: NPCInstance) {
	const resolved = resolveNPCInstance(
		session.project.npcs.find(
			(definition) => definition.id === npc.npcDefinitionId,
		),
		npc,
	);
	const runtimeAttributes = session.runtimeState.npcs[npc.id];
	return runtimeAttributes
		? {
				...resolved,
				attributes: runtimeAttributes,
				movementSpeed:
					runtimeAttributes.movementSpeed ?? resolved.movementSpeed,
			}
		: resolved;
}

function applyEnemyContact(
	session: RuntimeSessionState,
	npc: NPCInstance,
	time: number,
	emit: RuntimeNpcTickEventEmitter,
): void {
	const nextAllowedAt = session.enemyContactCooldowns.get(npc.id) ?? 0;
	if (time < nextAllowedAt) {
		return;
	}

	emit({ type: "enemyTouchedPlayer", npcId: npc.id });
	session.enemyContactCooldowns.set(npc.id, time + 1200);
	applyRuntimeEnemyDamage(
		session,
		npc.id,
		npc.enemyBehaviour?.contactDamage ?? 0,
		"Enemy touched player.",
		emit,
	);
}

function shouldEmitBlocked(
	npc: NPCInstance,
	state: NPCMovementState,
	nextState: NPCMovementState,
): boolean {
	return (
		npc.movementMode !== "stationary" ||
		state.enemyChasing === true ||
		nextState.enemyChasing === true
	);
}

export function tickRuntimeNpcs(
	session: RuntimeSessionState,
	area: GameArea,
	time: number,
	emit: RuntimeNpcTickEventEmitter,
	options: RuntimeNpcTickOptions = {},
): void {
	area.npcs.forEach((npc) => {
		if (
			session.runtimePlayerHealth <= 0 ||
			session.defeatedNpcIds.has(npc.id)
		) {
			return;
		}

		const runtime = session.npcMovementStates.get(npc.id) ?? {
			movement: { patrolIndex: 0 },
			nextMoveAt: time + 450,
		};
		const moveDue = time >= runtime.nextMoveAt;
		const attackPending = session.enemyAttacks.get(npc.id)?.pending;
		if (
			!moveDue &&
			!attackPending &&
			!session.enemyAttacks.get(npc.id)?.counterQueued
		) {
			session.npcMovementStates.set(npc.id, runtime);
			return;
		}
		const resolved = getResolvedNpc(session, npc);
		const profile = resolved.enemyBehaviour;
		const world =
			(profile?.weapon || profile?.body || profile?.keepDistanceTiles) &&
			(session.traversal?.world ?? options.world);
		const player = session.traversal?.position ?? session.playerPosition;
		const canMove = (x: number, y: number) =>
			(!profile?.body ||
				Math.hypot(x - player.x, y - player.y) >=
					profile.body.radius + PLAYER_HALF_WIDTH) &&
			!(session.playerPosition.x === x && session.playerPosition.y === y) &&
			isNpcTileWalkable(area, npc.id, x, y) &&
			(!world ||
				!isInteractionSegmentBlocked(
					world,
					{ ...npc, height: world.sampler.sampleSurfaceY(npc, world.mode) },
					{ x, y },
					npc.id,
				));
		if (
			tickEnemyAttack(
				session,
				area,
				resolved,
				time,
				moveDue,
				emit,
				canMove,
				world || undefined,
			)
		)
			return;
		if (!moveDue) return;
		const origin = session.enemyOrigins.get(npc.id) ?? { x: npc.x, y: npc.y };
		session.enemyOrigins.set(npc.id, origin);
		const canUseEnemyMovement =
			resolved.attributes.alignment === "hostile" &&
			resolved.enemyBehaviour?.enabled === true;
		const attackState = session.enemyAttacks.get(npc.id);
		const disengage = attackState?.disengage && profile;
		if (attackState) attackState.disengage = false;
		const mover = disengage
			? {
					...resolved,
					enemyBehaviour: {
						...profile,
						keepDistanceTiles: (profile.keepDistanceTiles ?? 0) + 1.6,
					},
				}
			: resolved;
		const update = canUseEnemyMovement
			? updateEnemyNPC(
					mover,
					session.playerPosition,
					origin,
					runtime.movement,
					canMove,
				)
			: resolved.movementMode === "patrol"
				? updatePatrolNPC(resolved, runtime.movement, canMove)
				: resolved.movementMode === "wander"
					? updateWanderNPC(
							resolved,
							area,
							runtime.movement,
							canMove,
							options.random,
						)
					: updateStationaryNPC(resolved, runtime.movement);
		const speed = clamp(
			session.runtimeState.npcs[npc.id]?.movementSpeed ??
				resolved.movementSpeed,
			0.1,
			10,
		);
		const duration = Math.max(80, 360 / speed);
		const wait = update.moved ? 320 : 560;
		const previous = { x: npc.x, y: npc.y };
		const previousFacing = npc.facing;
		const wasChasing = runtime.movement.enemyChasing === true;
		const isChasing = update.state.enemyChasing === true;

		npc.x = update.x;
		npc.y = update.y;
		npc.facing = update.facing;
		session.npcMovementStates.set(npc.id, {
			movement: update.state,
			nextMoveAt: time + duration + wait,
		});

		if (!wasChasing && isChasing) {
			emit({ type: "enemyDetectedPlayer", npcId: npc.id });
		}
		if (wasChasing && !isChasing) {
			emit({ type: "enemyLostPlayer", npcId: npc.id });
		}

		if (previousFacing !== update.facing) {
			emit({ type: "npcFacingChanged", npcId: npc.id, facing: update.facing });
		}

		if (update.moved) {
			emit({
				type: "npcMoved",
				npcId: npc.id,
				from: previous,
				to: { x: npc.x, y: npc.y },
				facing: update.facing,
				durationMs: duration,
			});
		} else if (shouldEmitBlocked(resolved, runtime.movement, update.state)) {
			emit({ type: "npcBlocked", npcId: npc.id, x: npc.x, y: npc.y });
		}

		if (
			!resolved.enemyBehaviour?.attacks?.length &&
			isEnemyTouchingPlayer(resolved, session.playerPosition)
		) {
			applyEnemyContact(session, resolved, time, emit);
		}
	});
}
