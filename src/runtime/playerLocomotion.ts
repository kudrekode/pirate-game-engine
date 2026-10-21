import { isRuntimeGameplayBlocked } from "./runtimeInput";
import type { RuntimeSessionState } from "./runtimeSession";
import {
	isTraversalBodyBlocked,
	resolveTraversalFloor,
	sampleTraversalMotion,
} from "./traversal";

export const SPRINT_MULTIPLIER = 1.65;
export const AIR_CONTROL_MULTIPLIER = 0.85;
export const JUMP_SPEED = 4.8;
export const JUMP_GRAVITY = 13;
export const LAND_SECONDS = 0.22;

export function isPlayerAirborne(session: RuntimeSessionState): boolean {
	const phase = session.traversal?.motion.phase;
	return phase === "jump" || phase === "fall";
}

export function setPlayerSprint(
	session: RuntimeSessionState,
	held: boolean,
	moving: boolean,
	blocked = false,
): void {
	if (session.traversal)
		session.traversal.motion.sprinting =
			held &&
			!session.bowDraw &&
			moving &&
			!session.playerVehicleState.active &&
			session.runtimePlayerHealth > 0 &&
			!isRuntimeGameplayBlocked(session, blocked);
}

export function tryPlayerJump(
	session: RuntimeSessionState,
	nowMs: number,
	blocked = false,
): boolean {
	const traversal = session.traversal;
	if (
		!traversal ||
		session.playerVehicleState.active ||
		isPlayerAirborne(session) ||
		session.runtimePlayerHealth <= 0 ||
		isRuntimeGameplayBlocked(session, blocked)
	)
		return false;
	const area = session.project.areas.find(
		(a) => a.id === session.currentAreaId,
	);
	if (!area || traversal.world.areaId !== area.id) return false;
	const point = sampleTraversalMotion(traversal, nowMs);
	const support = resolveTraversalFloor(
		traversal.world,
		area,
		session.project,
		point,
		point.height,
	);
	if (
		!support ||
		isTraversalBodyBlocked(traversal.world, {
			...point,
			height: support.height + 0.04,
		})
	)
		return false;
	traversal.motion.phase = "jump";
	session.bowDraw = undefined;
	traversal.motion.height = support.height;
	traversal.motion.verticalVelocity = JUMP_SPEED;
	traversal.motion.elapsed = 0;
	return true;
}

/** Exact constant-acceleration integration in bounded substeps; no renderer clock or physics objects. */
export function advancePlayerLocomotion(
	session: RuntimeSessionState,
	deltaSeconds: number,
	nowMs: number,
): boolean {
	const traversal = session.traversal;
	if (!traversal) return false;
	const motion = traversal.motion;
	const point = sampleTraversalMotion(traversal, nowMs);
	if (!isPlayerAirborne(session)) {
		motion.height = point.height;
		if (motion.phase === "land") {
			motion.elapsed += Math.max(0, deltaSeconds);
			if (motion.elapsed >= LAND_SECONDS) motion.phase = "grounded";
		}
		return false;
	}
	const area = session.project.areas.find(
		(a) => a.id === session.currentAreaId,
	);
	if (!area || traversal.world.areaId !== area.id) return false;
	// A suspended tab cannot tunnel through a ceiling or skip a landing.
	let remaining = Math.min(0.1, Math.max(0, deltaSeconds));
	while (remaining > 1e-8) {
		const dt = Math.min(1 / 120, remaining);
		remaining -= dt;
		const nextHeight =
			motion.height +
			motion.verticalVelocity * dt -
			(JUMP_GRAVITY * dt * dt) / 2;
		const nextVelocity = motion.verticalVelocity - JUMP_GRAVITY * dt;
		// Horizontal traversal always retains a reachable supporting floor. Never invent one.
		const floor = resolveTraversalFloor(
			traversal.world,
			area,
			session.project,
			point,
			point.height,
		);
		if (nextVelocity <= 0 && floor && nextHeight <= floor.height + 0.001) {
			motion.height = floor.height;
			motion.verticalVelocity = 0;
			motion.phase = "land";
			motion.elapsed = 0;
			return true;
		}
		if (
			motion.verticalVelocity > 0 &&
			isTraversalBodyBlocked(traversal.world, { ...point, height: nextHeight })
		) {
			motion.verticalVelocity = 0;
			motion.phase = "fall";
		} else {
			motion.height = nextHeight;
			motion.verticalVelocity = nextVelocity;
		}
		motion.elapsed += dt;
		if (motion.verticalVelocity <= 0) motion.phase = "fall";
	}
	return false;
}
