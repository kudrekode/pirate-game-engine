import type { GameArea, MovementMode } from "../types/game";
import {
	findTouchInteractableTarget,
	type InteractableTarget,
	resolveObjectBehaviour,
	type TouchInteractableTarget,
} from "./interactionDiscovery";
import { resolveMovementAt, type VehicleMovementConfig } from "./movement";
import type {
	RuntimeGridPosition,
	RuntimeSessionState,
} from "./runtimeSession";

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
): PlayerMoveResult {
	const area = getCurrentArea(session);
	const from = { ...session.playerPosition };
	const facing = { ...direction };
	const to = {
		x: from.x + direction.x,
		y: from.y + direction.y,
	};

	session.playerFacing = facing;

	if (to.x < 0 || to.y < 0 || to.x >= area.width || to.y >= area.height) {
		return {
			type: "blocked",
			from,
			to,
			facing,
		};
	}

	const activeVehicle = getActiveVehicleBehaviour(session, area);
	const movement = resolveMovementAt(area, to.x, to.y, session.project.player, {
		activeVehicle: activeVehicle
			? {
					...activeVehicle,
					vehicleObjectInstanceId:
						session.playerVehicleState.vehicleObjectInstanceId,
				}
			: undefined,
	});
	if (!movement.canMove) {
		return {
			type: "blocked",
			reason: movement.reason ?? "Blocked.",
			from,
			to,
			facing,
		};
	}

	session.playerPosition = to;
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
		moveDurationMs: getPlayerMoveDurationMs(
			session.project.player.speed,
			movement.speedMultiplier,
		),
		movementMode: movement.movementMode ?? session.currentMovementMode,
		touchTargets: touchTarget ? [touchTarget] : [],
		triggerTargets: findWaitingTriggerTarget(
			session,
			area,
			session.playerPosition,
		),
	};
}
