import {
	getOverlayPreset,
	getStructurePreset,
	getTerrainPreset,
} from "../data/mapVisuals";
import type {
	GameArea,
	MapStructure,
	ObjectInstance,
	MovementResult,
	MovementRule,
	ObjectBehaviour,
	PlayerConfig,
} from "../types/game";

function coversTile(structure: MapStructure, x: number, y: number): boolean {
	return (
		x >= structure.x &&
		y >= structure.y &&
		x < structure.x + structure.widthTiles &&
		y < structure.y + structure.heightTiles
	);
}

function objectCoversTile(
	object: ObjectInstance,
	area: GameArea,
	x: number,
	y: number,
): boolean {
	void area;
	const widthTiles = object.widthTiles ?? 1;
	const heightTiles = object.heightTiles ?? 1;
	return (
		x >= object.x &&
		y >= object.y &&
		x < object.x + widthTiles &&
		y < object.y + heightTiles
	);
}

function normalizeSpeedMultiplier(rule?: MovementRule): number {
	const multiplier = rule?.speedMultiplier ?? 1;
	return Number.isFinite(multiplier) ? Math.max(0.1, multiplier) : 1;
}

function block(reason: string, rule?: MovementRule): MovementResult {
	return {
		canMove: false,
		reason,
		speedMultiplier: normalizeSpeedMultiplier(rule),
		movementMode: rule?.movementMode,
	};
}

function allow(rule?: MovementRule): MovementResult {
	return {
		canMove: true,
		speedMultiplier: normalizeSpeedMultiplier(rule),
		movementMode: rule?.movementMode,
	};
}

export type VehicleMovementConfig = Extract<
	ObjectBehaviour,
	{ type: "vehicle" }
>;

export type MovementResolveOptions = {
	activeVehicle?: VehicleMovementConfig & {
		vehicleObjectInstanceId?: string;
	};
};

export type DismountSearchResult =
	| { canDismount: true; x: number; y: number }
	| { canDismount: false; reason: string };

function terrainIdAt(area: GameArea, x: number, y: number): string | undefined {
	return area.terrainTiles.find((tile) => tile.x === x && tile.y === y)?.tileId;
}

function overlayIdAt(area: GameArea, x: number, y: number): string | undefined {
	return area.overlayTiles.find((tile) => tile.x === x && tile.y === y)
		?.overlayId;
}

function resolveVehicleMovementAt(
	area: GameArea,
	x: number,
	y: number,
	vehicle: VehicleMovementConfig,
): MovementResult {
	const terrainId = terrainIdAt(area, x, y);
	if (!terrainId) {
		return block("No tile.");
	}

	const overlayId = overlayIdAt(area, x, y);
	if (overlayId && vehicle.allowedOverlayIds?.includes(overlayId)) {
		return allow({
			walkable: true,
			movementMode: vehicle.movementMode,
			speedMultiplier: vehicle.speedMultiplier,
		});
	}

	if (vehicle.allowedTerrainIds.includes(terrainId)) {
		return allow({
			walkable: true,
			movementMode: vehicle.movementMode,
			speedMultiplier: vehicle.speedMultiplier,
		});
	}

	if (
		vehicle.dismountAllowedTerrainIds.includes(terrainId) ||
		(overlayId && vehicle.dismountAllowedOverlayIds?.includes(overlayId))
	) {
		return block("Dismount before moving onto land.", {
			walkable: false,
			movementMode: vehicle.movementMode,
			speedMultiplier: vehicle.speedMultiplier,
		});
	}

	return block("Vehicle cannot move there.", {
		walkable: false,
		movementMode: vehicle.movementMode,
		speedMultiplier: vehicle.speedMultiplier,
	});
}

export function resolveMovementAt(
	area: GameArea,
	x: number,
	y: number,
	player: PlayerConfig,
	options: MovementResolveOptions = {},
): MovementResult {
	if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
		return block("Out of bounds.");
	}

	const blockingStructure = area.structures.find((structure) => {
		if (!coversTile(structure, x, y)) {
			return false;
		}

		const preset = getStructurePreset(structure.structureId);
		const rule = structure.movementRule ?? preset.movementRule;
		return structure.blocksMovement || rule.walkable === false;
	});

	if (blockingStructure) {
		const preset = getStructurePreset(blockingStructure.structureId);
		return block(
			`Blocked by ${blockingStructure.name}.`,
			blockingStructure.movementRule ?? preset.movementRule,
		);
	}

	const blockingObject = area.objects.find((object) => {
		if (options.activeVehicle?.vehicleObjectInstanceId === object.id) {
			return false;
		}

		if (!objectCoversTile(object, area, x, y)) {
			return false;
		}

		return object.blocksMovement === true;
	});

	if (blockingObject) {
		return block("Blocked by object.");
	}

	const blockingNpc = area.npcs.find(
		(npc) => npc.blocksMovement && npc.x === x && npc.y === y,
	);
	if (blockingNpc) {
		return block("Blocked by NPC.");
	}

	// TODO: Add object layer movement rules when object placement becomes first-class.

	if (options.activeVehicle) {
		return resolveVehicleMovementAt(area, x, y, options.activeVehicle);
	}

	const terrainTile = area.terrainTiles.find(
		(tile) => tile.x === x && tile.y === y,
	);
	if (!terrainTile) {
		return block("No tile.");
	}

	const overlayTile = area.overlayTiles.find(
		(tile) => tile.x === x && tile.y === y,
	);
	if (overlayTile) {
		const overlay = getOverlayPreset(overlayTile.overlayId);

		if (overlay.movementRule.walkable === true) {
			return allow(overlay.movementRule);
		}

		if (overlay.movementRule.walkable === false) {
			return block(`Blocked by ${overlay.label}.`, overlay.movementRule);
		}
	}

	const terrain = getTerrainPreset(terrainTile.tileId);
	if (
		terrain.movementRule.walkable === false ||
		!player.canWalkOn.includes(terrainTile.tileId)
	) {
		return block(`Blocked by ${terrain.label}.`, terrain.movementRule);
	}

	return allow(terrain.movementRule);
}

export function canDismountAt(
	area: GameArea,
	x: number,
	y: number,
	vehicle: VehicleMovementConfig,
): boolean {
	if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
		return false;
	}

	const terrainId = terrainIdAt(area, x, y);
	const overlayId = overlayIdAt(area, x, y);
	return Boolean(
		(terrainId && vehicle.dismountAllowedTerrainIds.includes(terrainId)) ||
			(overlayId && vehicle.dismountAllowedOverlayIds?.includes(overlayId)),
	);
}

function isBlockedForDismount(area: GameArea, x: number, y: number): boolean {
	const blockingStructure = area.structures.some((structure) => {
		if (!coversTile(structure, x, y)) {
			return false;
		}

		const preset = getStructurePreset(structure.structureId);
		const rule = structure.movementRule ?? preset.movementRule;
		return structure.blocksMovement || rule.walkable === false;
	});

	if (blockingStructure) {
		return true;
	}

	if (
		area.objects.some(
			(object) =>
				object.blocksMovement === true && objectCoversTile(object, area, x, y),
		)
	) {
		return true;
	}

	return area.npcs.some(
		(npc) => npc.blocksMovement && npc.x === x && npc.y === y,
	);
}

export function findDismountTile(
	area: GameArea,
	origin: { x: number; y: number },
	facing: { x: number; y: number },
	vehicle: VehicleMovementConfig,
): DismountSearchResult {
	const candidates = [
		{ x: origin.x + facing.x, y: origin.y + facing.y },
		{ x: origin.x, y: origin.y - 1 },
		{ x: origin.x + 1, y: origin.y },
		{ x: origin.x, y: origin.y + 1 },
		{ x: origin.x - 1, y: origin.y },
	];
	const seen = new Set<string>();

	for (const candidate of candidates) {
		const key = `${candidate.x}:${candidate.y}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);

		if (!canDismountAt(area, candidate.x, candidate.y, vehicle)) {
			continue;
		}

		if (!isBlockedForDismount(area, candidate.x, candidate.y)) {
			return { canDismount: true, x: candidate.x, y: candidate.y };
		}
	}

	return { canDismount: false, reason: "No place to dismount." };
}
