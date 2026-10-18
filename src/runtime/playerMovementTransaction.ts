import type { GameArea, MovementMode } from "../types/game";
import {
	findTouchInteractableTarget,
	type InteractableTarget,
	resolveObjectBehaviour,
	type TouchInteractableTarget,
} from "./interactionDiscovery";
import { resolveMovementAt, type VehicleMovementConfig } from "./movement";
import { canAcceptRuntimeInput } from "./runtimeInput";
import type {
	RuntimeGridPosition,
	RuntimeSessionState,
} from "./runtimeSession";
import { createRuntimeTraversal, sweepTraversal } from "./traversal";

export type PlayerMoveBlockedResult = {
	type: "blocked";
	reason?: string;
	from: RuntimeGridPosition;
	to: RuntimeGridPosition;
	facing: RuntimeGridPosition;
};

export type PlayerMoveMovedResult = {
	type: "moved";
	from: RuntimeGridPosition;
	to: RuntimeGridPosition;
	facing: RuntimeGridPosition;
	moveDurationMs: number;
	movementMode: MovementMode;
	touchTargets: TouchInteractableTarget[];
	triggerTargets: InteractableTarget[];
};

export type PlayerMoveResult = PlayerMoveBlockedResult | PlayerMoveMovedResult;

export function getPlayerMoveDurationMs(
	playerSpeed: number,
	speedMultiplier = 1,
): number {
	const clampedSpeed = Math.min(20, Math.max(1, playerSpeed));
	const clampedMultiplier = Math.min(4, Math.max(0.1, speedMultiplier));
	const baseDuration = 360 - clampedSpeed * 24;
	return Math.max(50, baseDuration / clampedMultiplier);
}

function getCurrentArea(session: RuntimeSessionState): GameArea {
	const area =
		session.project.areas.find(
			(candidate) => candidate.id === session.currentAreaId,
		) ?? session.project.areas[0];
	if (!area) {
		throw new Error("Runtime session must include at least one area.");
	}
	return area;
}

function getActiveVehicleBehaviour(
	session: RuntimeSessionState,
	area: GameArea,
): VehicleMovementConfig | undefined {
	if (
		!session.playerVehicleState.active ||
		!session.playerVehicleState.vehicleObjectInstanceId
	) {
		return undefined;
	}

	const vehicleObject = area.objects.find(
		(candidate) =>
			candidate.id === session.playerVehicleState.vehicleObjectInstanceId,
	);
	if (!vehicleObject) {
		return undefined;
	}

	const behaviour = resolveObjectBehaviour(session.project, vehicleObject);
	return behaviour.type === "vehicle" ? behaviour : undefined;
}

function findWaitingTriggerTarget(
	session: RuntimeSessionState,
	area: GameArea,
	position: RuntimeGridPosition,
): InteractableTarget[] {
	const waitingForTrigger = session.waitingForTrigger;
	if (!waitingForTrigger) {
		return [];
	}

	const isInTargetArea =
		!waitingForTrigger.areaId || waitingForTrigger.areaId === area.id;
	if (!isInTargetArea) {
		return [];
	}

	const eventBlock = area.eventBlocks.find(
		(candidate) => candidate.id === waitingForTrigger.eventBlockId,
	);
	if (
		!eventBlock ||
		eventBlock.x !== position.x ||
		eventBlock.y !== position.y
	) {
		return [];
	}

	return [
		{
			type: "eventBlock",
			id: eventBlock.id,
			areaId: area.id,
			x: eventBlock.x,
			y: eventBlock.y,
			label: eventBlock.name,
			distance: 0,
			eventBlock,
		},
	];
}

export function attemptPlayerMove(
	session: RuntimeSessionState,
	direction: RuntimeGridPosition,
	nowMs = 0,
	distance = 1,
): PlayerMoveResult {
	const area = getCurrentArea(session);
	let traversal = session.playerVehicleState.active
		? undefined
		: session.traversal;
	if (traversal?.world.areaId !== area.id) traversal = undefined;
	if (
		traversal &&
		(traversal.grid.x !== session.playerPosition.x ||
			traversal.grid.y !== session.playerPosition.y)
	) {
		traversal = createRuntimeTraversal(
			traversal.world,
			area,
			session.project,
			session.playerPosition,
		);
		session.traversal = traversal;
	}
	const from = traversal
		? { x: traversal.position.x, y: traversal.position.y }
		: { ...session.playerPosition };
	const facing = { ...direction };
	let to = {
		x: from.x + direction.x * (traversal ? distance : 1),
		y: from.y + direction.y * (traversal ? distance : 1),
	};

	if (!canAcceptRuntimeInput(session, nowMs, false)) {
		return {
			type: "blocked",
			reason: "Gameplay input is paused.",
			from,
			to,
			facing: { ...session.playerFacing },
		};
	}
	// Combat/vehicle interactions address integer cells; presentation may face
	// along the continuous movement vector without changing that contract.
	session.playerFacing = traversal
		? Math.abs(direction.x) > Math.abs(direction.y)
			? { x: Math.sign(direction.x), y: 0 }
			: { x: 0, y: Math.sign(direction.y) }
		: facing;

	if (
		!traversal &&
		(to.x < 0 || to.y < 0 || to.x >= area.width || to.y >= area.height)
	) {
		return {
			type: "blocked",
			from,
			to,
			facing,
		};
	}

	const activeVehicle = getActiveVehicleBehaviour(session, area);
	const swept = traversal
		? sweepTraversal(
				traversal.world,
				area,
				session.project,
				traversal.position,
				{ x: to.x - from.x, y: to.y - from.y },
			)
		: undefined;
	if (swept) to = { x: swept.position.x, y: swept.position.y };
	const movement = swept
		? {
				canMove: swept.path.length > 1,
				reason: swept.reason,
				speedMultiplier: resolveMovementAt(
					area,
					Math.round(to.x),
					Math.round(to.y),
					session.project.player,
					{ ignoredObjectIds: traversal?.world.profiledObjects },
				).speedMultiplier,
				movementMode: session.currentMovementMode,
			}
		: resolveMovementAt(area, to.x, to.y, session.project.player, {
				activeVehicle: activeVehicle
					? {
							...activeVehicle,
							vehicleObjectInstanceId:
								session.playerVehicleState.vehicleObjectInstanceId,
						}
					: undefined,
			});
	if (!movement.canMove) {
		if (traversal) traversal.lastReason = movement.reason;
		return {
			type: "blocked",
			reason: movement.reason ?? "Blocked.",
			from,
			to,
			facing,
		};
	}

	const moveDurationMs =
		getPlayerMoveDurationMs(
			session.project.player.speed,
			movement.speedMultiplier,
		) * (traversal ? Math.hypot(to.x - from.x, to.y - from.y) : 1);
	session.nextMoveAt = nowMs + moveDurationMs;
	const grid = traversal ? { x: Math.round(to.x), y: Math.round(to.y) } : to;
	const enteredCell =
		grid.x !== session.playerPosition.x || grid.y !== session.playerPosition.y;
	session.playerPosition = grid;
	if (traversal && swept) {
		traversal.position = swept.position;
		traversal.path = swept.path;
		traversal.grid = grid;
		traversal.startMs = nowMs;
		traversal.durationMs = moveDurationMs;
		traversal.lastReason = swept.reason;
	}
	const touchTarget = findTouchInteractableTarget({
		project: session.project,
		area,
		playerPosition: session.playerPosition,
		runtimeState: session.runtimeState,
		collectedPickupIds: session.collectedPickupIds,
		defeatedNpcIds: session.defeatedNpcIds,
	});

	return {
		type: "moved",
		from,
		to,
		facing,
		moveDurationMs,
		movementMode: movement.movementMode ?? session.currentMovementMode,
		touchTargets: enteredCell && touchTarget ? [touchTarget] : [],
		triggerTargets: !enteredCell
			? []
			: findWaitingTriggerTarget(session, area, session.playerPosition),
	};
}
