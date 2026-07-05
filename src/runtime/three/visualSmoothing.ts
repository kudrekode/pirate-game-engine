export type VisualGridPosition = {
	x: number;
	y: number;
};

export type VisualWorldPosition = {
	x: number;
	y: number;
	z: number;
};

export type VisualGridMotion = {
	from: VisualGridPosition;
	to: VisualGridPosition;
	startMs: number;
	durationMs: number;
};

export type VisualEntityState = {
	areaId: string;
	facing: VisualGridPosition;
	motion?: VisualGridMotion;
	position: VisualGridPosition;
};

export type VisualGridMove = {
	from: VisualGridPosition;
	to: VisualGridPosition;
	facing: VisualGridPosition;
	durationMs: number;
};

export type VisualGridPositionResult = {
	done: boolean;
	position: VisualGridPosition;
	progress: number;
};

export type CameraFollowRig = {
	lookAt: VisualWorldPosition;
	position: VisualWorldPosition;
};

export type CameraFollowOptions = {
	lookOffset?: VisualWorldPosition;
	offset?: VisualWorldPosition;
};

const DEFAULT_CAMERA_OFFSET = { x: 5, y: 6.5, z: 7 };
const DEFAULT_LOOK_OFFSET = { x: 0, y: 0.05, z: 0 };

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function cloneGridPosition(position: VisualGridPosition): VisualGridPosition {
	return { x: position.x, y: position.y };
}

function lerp(start: number, end: number, progress: number): number {
	return start + (end - start) * progress;
}

export function gridPositionsEqual(
	first: VisualGridPosition,
	second: VisualGridPosition,
	epsilon = 0.0001,
): boolean {
	return (
		Math.abs(first.x - second.x) <= epsilon &&
		Math.abs(first.y - second.y) <= epsilon
	);
}

export function resetVisualEntityState(
	areaId: string,
	position: VisualGridPosition,
	facing: VisualGridPosition = { x: 0, y: 1 },
): VisualEntityState {
	return {
		areaId,
		facing: cloneGridPosition(facing),
		position: cloneGridPosition(position),
	};
}

export function getVisualGridPosition(
	state: VisualEntityState,
	nowMs: number,
): VisualGridPositionResult {
	if (!state.motion) {
		return {
			done: true,
			position: cloneGridPosition(state.position),
			progress: 1,
		};
	}

	const durationMs = Math.max(1, state.motion.durationMs);
	const progress = clamp((nowMs - state.motion.startMs) / durationMs, 0, 1);
	const position =
		progress >= 1
			? cloneGridPosition(state.motion.to)
			: {
					x: lerp(state.motion.from.x, state.motion.to.x, progress),
					y: lerp(state.motion.from.y, state.motion.to.y, progress),
				};

	return {
		done: progress >= 1,
		position,
		progress,
	};
}

export function getVisualStateTargetPosition(
	state: VisualEntityState,
): VisualGridPosition {
	return cloneGridPosition(state.motion?.to ?? state.position);
}

export function startVisualGridMove(
	previousState: VisualEntityState | undefined,
	areaId: string,
	move: VisualGridMove,
	startMs: number,
): VisualEntityState {
	const canContinueFromCurrentVisual =
		previousState?.areaId === areaId &&
		gridPositionsEqual(getVisualStateTargetPosition(previousState), move.from);
	const visualFrom = canContinueFromCurrentVisual
		? getVisualGridPosition(previousState, startMs).position
		: cloneGridPosition(move.from);

	if (gridPositionsEqual(visualFrom, move.to)) {
		return resetVisualEntityState(areaId, move.to, move.facing);
	}

	return {
		areaId,
		facing: cloneGridPosition(move.facing),
		motion: {
			durationMs: Math.max(1, move.durationMs),
			from: visualFrom,
			startMs,
			to: cloneGridPosition(move.to),
		},
		position: visualFrom,
	};
}

export function settleVisualEntityState(
	state: VisualEntityState,
	nowMs: number,
): VisualEntityState {
	const visual = getVisualGridPosition(state, nowMs);
	if (!state.motion || !visual.done) {
		return {
			...state,
			position: visual.position,
		};
	}

	return {
		areaId: state.areaId,
		facing: cloneGridPosition(state.facing),
		position: cloneGridPosition(state.motion.to),
	};
}

export function facingToYawRadians(facing: VisualGridPosition): number {
	if (facing.x === 0 && facing.y === 0) {
		return 0;
	}
	return Math.atan2(-facing.x, -facing.y);
}

export function getCameraFollowTarget(
	playerPosition: VisualWorldPosition,
	options: CameraFollowOptions = {},
): CameraFollowRig {
	const offset = options.offset ?? DEFAULT_CAMERA_OFFSET;
	const lookOffset = options.lookOffset ?? DEFAULT_LOOK_OFFSET;
	return {
		lookAt: {
			x: playerPosition.x + lookOffset.x,
			y: playerPosition.y + lookOffset.y,
			z: playerPosition.z + lookOffset.z,
		},
		position: {
			x: playerPosition.x + offset.x,
			y: playerPosition.y + offset.y,
			z: playerPosition.z + offset.z,
		},
	};
}

export function getFrameLerpAlpha(deltaMs: number, responsiveness = 9): number {
	const clampedDeltaSeconds = clamp(deltaMs, 0, 250) / 1000;
	const clampedResponsiveness = clamp(responsiveness, 0.1, 30);
	return 1 - Math.exp(-clampedResponsiveness * clampedDeltaSeconds);
}

export function lerpWorldPosition(
	current: VisualWorldPosition,
	target: VisualWorldPosition,
	alpha: number,
): VisualWorldPosition {
	const clampedAlpha = clamp(alpha, 0, 1);
	return {
		x: lerp(current.x, target.x, clampedAlpha),
		y: lerp(current.y, target.y, clampedAlpha),
		z: lerp(current.z, target.z, clampedAlpha),
	};
}

export function advanceCameraFollowRig(
	current: CameraFollowRig,
	target: CameraFollowRig,
	alpha: number,
): CameraFollowRig {
	return {
		lookAt: lerpWorldPosition(current.lookAt, target.lookAt, alpha),
		position: lerpWorldPosition(current.position, target.position, alpha),
	};
}
