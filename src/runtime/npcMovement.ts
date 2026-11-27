import {
	getOverlayPreset,
	getStructurePreset,
	getTerrainPreset,
} from "../data/mapVisuals";
import type { GameArea, NPCInstance, PatrolPoint } from "../types/game";
import { blocksMapEntity } from "./mapCollision";

export type NPCMovementState = {
	patrolIndex: number;
	wanderTarget?: PatrolPoint;
	stopped?: boolean;
	enemyChasing?: boolean;
};

export type NPCMovementUpdate = {
	moved: boolean;
	x: number;
	y: number;
	facing: NonNullable<NPCInstance["facing"]>;
	state: NPCMovementState;
};

type CanMove = (x: number, y: number) => boolean;

function samePoint(a: PatrolPoint, b: PatrolPoint): boolean {
	return a.x === b.x && a.y === b.y;
}

function tileDistance(a: PatrolPoint, b: PatrolPoint): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function stepToward(from: PatrolPoint, target: PatrolPoint): PatrolPoint {
	if (from.x !== target.x) {
		return { x: from.x + Math.sign(target.x - from.x), y: from.y };
	}

	return { x: from.x, y: from.y + Math.sign(target.y - from.y) };
}

function stepOptionsToward(
	from: PatrolPoint,
	target: PatrolPoint,
): PatrolPoint[] {
	const options: PatrolPoint[] = [];
	const deltaX = Math.sign(target.x - from.x);
	const deltaY = Math.sign(target.y - from.y);
	const xDistance = Math.abs(target.x - from.x);
	const yDistance = Math.abs(target.y - from.y);

	if (xDistance >= yDistance && deltaX !== 0) {
		options.push({ x: from.x + deltaX, y: from.y });
	}
	if (deltaY !== 0) {
		options.push({ x: from.x, y: from.y + deltaY });
	}
	if (xDistance < yDistance && deltaX !== 0) {
		options.push({ x: from.x + deltaX, y: from.y });
	}

	return options;
}

function facingForStep(
	from: PatrolPoint,
	to: PatrolPoint,
	fallback: NPCMovementUpdate["facing"],
) {
	if (to.x < from.x) {
		return "left";
	}
	if (to.x > from.x) {
		return "right";
	}
	if (to.y < from.y) {
		return "up";
	}
	if (to.y > from.y) {
		return "down";
	}
	return fallback;
}

function unchanged(
	npc: NPCInstance,
	state: NPCMovementState,
): NPCMovementUpdate {
	return {
		moved: false,
		x: npc.x,
		y: npc.y,
		facing: npc.facing ?? "down",
		state,
	};
}

function moveToward(
	npc: NPCInstance,
	state: NPCMovementState,
	target: PatrolPoint,
	canMove: CanMove,
): NPCMovementUpdate {
	const next = stepToward(npc, target);
	if (!canMove(next.x, next.y)) {
		return unchanged(npc, state);
	}

	return {
		moved: true,
		x: next.x,
		y: next.y,
		facing: facingForStep(npc, next, npc.facing ?? "down"),
		state,
	};
}

function moveTowardWithAlternate(
	npc: NPCInstance,
	state: NPCMovementState,
	target: PatrolPoint,
	canMove: CanMove,
): NPCMovementUpdate {
	for (const next of stepOptionsToward(npc, target)) {
		if (canMove(next.x, next.y)) {
			return {
				moved: true,
				x: next.x,
				y: next.y,
				facing: facingForStep(npc, next, npc.facing ?? "down"),
				state,
			};
		}
	}

	return unchanged(npc, state);
}

export function updateStationaryNPC(
	npc: NPCInstance,
	state: NPCMovementState = { patrolIndex: 0 },
): NPCMovementUpdate {
	return unchanged(npc, state);
}

export function updatePatrolNPC(
	npc: NPCInstance,
	state: NPCMovementState = { patrolIndex: 0 },
	canMove: CanMove = () => true,
): NPCMovementUpdate {
	const path = npc.patrolPath;
	if (!path || path.points.length === 0 || state.stopped) {
		return unchanged(npc, state);
	}

	let patrolIndex = Math.min(
		Math.max(0, state.patrolIndex),
		path.points.length - 1,
	);
	let target = path.points[patrolIndex];
	if (samePoint(npc, target)) {
		if (patrolIndex >= path.points.length - 1) {
			if (!path.loop) {
				return unchanged(npc, { ...state, stopped: true });
			}
			patrolIndex = 0;
		} else {
			patrolIndex += 1;
		}
		target = path.points[patrolIndex];
	}

	return moveToward(npc, { ...state, patrolIndex }, target, canMove);
}

export function generateWanderDestination(
	npc: NPCInstance,
	area: Pick<GameArea, "width" | "height">,
	random = Math.random,
): PatrolPoint | undefined {
	const zone = npc.wanderZone;
	if (!zone || zone.width <= 0 || zone.height <= 0) {
		return undefined;
	}

	const minX = Math.max(0, Math.round(zone.x));
	const minY = Math.max(0, Math.round(zone.y));
	const maxX = Math.min(
		area.width - 1,
		minX + Math.max(1, Math.round(zone.width)) - 1,
	);
	const maxY = Math.min(
		area.height - 1,
		minY + Math.max(1, Math.round(zone.height)) - 1,
	);
	if (maxX < minX || maxY < minY) {
		return undefined;
	}

	return {
		x: minX + Math.floor(random() * (maxX - minX + 1)),
		y: minY + Math.floor(random() * (maxY - minY + 1)),
	};
}

export function updateWanderNPC(
	npc: NPCInstance,
	area: Pick<GameArea, "width" | "height">,
	state: NPCMovementState = { patrolIndex: 0 },
	canMove: CanMove = () => true,
	random = Math.random,
): NPCMovementUpdate {
	const target =
		state.wanderTarget && !samePoint(npc, state.wanderTarget)
			? state.wanderTarget
			: generateWanderDestination(npc, area, random);
	if (!target || samePoint(npc, target)) {
		return unchanged(npc, { ...state, wanderTarget: undefined });
	}

	const nextState = { ...state, wanderTarget: target };
	const update = moveToward(npc, nextState, target, canMove);
	return update.moved
		? update
		: unchanged(npc, { ...state, wanderTarget: undefined });
}

function retreatOptions(npc: NPCInstance, player: PatrolPoint) {
	return [
		{ x: npc.x + 1, y: npc.y },
		{ x: npc.x - 1, y: npc.y },
		{ x: npc.x, y: npc.y + 1 },
		{ x: npc.x, y: npc.y - 1 },
	]
		.filter(
			(p) =>
				Math.hypot(p.x - player.x, p.y - player.y) >
				Math.hypot(npc.x - player.x, npc.y - player.y),
		)
		.sort(
			(a, b) =>
				Math.hypot(b.x - player.x, b.y - player.y) -
				Math.hypot(a.x - player.x, a.y - player.y),
		);
}

export function hasRetreatStep(
	npc: NPCInstance,
	player: PatrolPoint,
	canMove: CanMove,
) {
	return retreatOptions(npc, player).some((p) => canMove(p.x, p.y));
}

export function updateEnemyNPC(
	npc: NPCInstance,
	player: PatrolPoint,
	origin: PatrolPoint,
	state: NPCMovementState = { patrolIndex: 0 },
	canMove: CanMove = () => true,
): NPCMovementUpdate {
	const behaviour = npc.enemyBehaviour;
	const isEnabled =
		npc.attributes.alignment === "hostile" && behaviour?.enabled === true;
	if (!isEnabled) {
		return unchanged(npc, { ...state, enemyChasing: false });
	}

	const distance = tileDistance(npc, player);
	const detectionRadius = Math.max(
		0,
		Math.round(behaviour.detectionRadiusTiles),
	);
	const chaseRadius = Math.max(
		detectionRadius,
		Math.round(behaviour.chaseRadiusTiles),
	);

	if (state.enemyChasing && distance > chaseRadius) {
		if (behaviour.returnToOrigin && !samePoint(npc, origin)) {
			return moveTowardWithAlternate(
				npc,
				{ ...state, enemyChasing: false },
				origin,
				canMove,
			);
		}

		return unchanged(npc, { ...state, enemyChasing: false });
	}

	if (state.enemyChasing || distance <= detectionRadius) {
		if (
			behaviour.keepDistanceTiles &&
			Math.hypot(npc.x - player.x, npc.y - player.y) <
				behaviour.keepDistanceTiles
		) {
			const next = retreatOptions(npc, player).find((p) => canMove(p.x, p.y));
			if (next)
				return {
					...next,
					moved: true,
					facing: facingForStep(npc, player, npc.facing ?? "down"),
					state: { ...state, enemyChasing: true },
				};
		}
		if (distance <= 1) {
			return unchanged(npc, { ...state, enemyChasing: true });
		}

		return moveTowardWithAlternate(
			npc,
			{ ...state, enemyChasing: true },
			player,
			canMove,
		);
	}

	return unchanged(npc, { ...state, enemyChasing: false });
}

export function isEnemyTouchingPlayer(
	npc: NPCInstance,
	player: PatrolPoint,
): boolean {
	return (
		npc.attributes.alignment === "hostile" &&
		npc.enemyBehaviour?.enabled === true &&
		tileDistance(npc, player) <= 1
	);
}

export function applyEnemyContactDamage(
	currentHealth: number,
	contactDamage = 0,
): number {
	return Math.max(0, currentHealth - Math.max(0, Math.round(contactDamage)));
}

export function hasClearGridLine(
	area: GameArea,
	npc: NPCInstance,
	player: PatrolPoint,
	distance: number,
) {
	const steps = Math.ceil(distance * 2);
	for (let i = 1; i < steps; i += 1) {
		const x = Math.round(npc.x + (player.x - npc.x) * (i / steps));
		const y = Math.round(npc.y + (player.y - npc.y) * (i / steps));
		if (x === player.x && y === player.y) break;
		if (x === npc.x && y === npc.y) continue;
		if (!isNpcTileWalkable(area, npc.id, x, y)) return false;
	}
	return true;
}

export function isNpcTileWalkable(
	area: GameArea,
	movingNpcId: string,
	x: number,
	y: number,
): boolean {
	if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
		return false;
	}

	if (
		area.structures.some((structure) => {
			const preset = getStructurePreset(structure.structureId);
			return (
				x >= structure.x &&
				y >= structure.y &&
				x < structure.x + structure.widthTiles &&
				y < structure.y + structure.heightTiles &&
				blocksMapEntity(
					structure,
					structure.blocksMovement ||
						(structure.movementRule ?? preset.movementRule).walkable === false,
				)
			);
		})
	) {
		return false;
	}

	if (
		area.npcs.some(
			(npc) =>
				npc.id !== movingNpcId &&
				blocksMapEntity(npc, npc.blocksMovement) &&
				npc.x === x &&
				npc.y === y,
		)
	) {
		return false;
	}

	if (
		area.objects.some((object) => {
			const widthTiles = object.widthTiles ?? 1;
			const heightTiles = object.heightTiles ?? 1;
			return (
				blocksMapEntity(object, object.blocksMovement === true) &&
				x >= object.x &&
				y >= object.y &&
				x < object.x + widthTiles &&
				y < object.y + heightTiles
			);
		})
	) {
		return false;
	}

	const terrainTile = area.terrainTiles.find(
		(tile) => tile.x === x && tile.y === y,
	);
	if (!terrainTile) {
		return false;
	}

	const overlayTile = area.overlayTiles.find(
		(tile) => tile.x === x && tile.y === y,
	);
	if (overlayTile) {
		const overlayRule = getOverlayPreset(overlayTile.overlayId).movementRule;
		if (overlayRule.walkable !== undefined) {
			return overlayRule.walkable;
		}
	}

	return getTerrainPreset(terrainTile.tileId).movementRule.walkable !== false;
}
