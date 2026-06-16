import type { GameArea, ObjectDefinition } from "../../types/game";

export type EntityMarkerKind =
	| "object"
	| "structure"
	| "npc"
	| "pickup"
	| "vehicle"
	| "event";

export type EntityMarkerShape = "box" | "cylinder";

export type EntityMarker = {
	id: string;
	kind: EntityMarkerKind;
	shape: EntityMarkerShape;
	color: number;
	opacity: number;
	gridX: number;
	gridY: number;
	width: number;
	height: number;
	depth: number;
	threeX: number;
	threeY: number;
	threeZ: number;
};

const ENTITY_MARKER_COLORS: Record<EntityMarkerKind, number> = {
	event: 0xc026d3,
	npc: 0xf97316,
	object: 0x8b5a2b,
	pickup: 0xfacc15,
	structure: 0x64748b,
	vehicle: 0x0f766e,
};

function toThreePosition(
	area: GameArea,
	x: number,
	y: number,
	widthTiles = 1,
	heightTiles = 1,
) {
	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	return {
		threeX: x + (widthTiles - 1) / 2 - centerX,
		threeZ: y + (heightTiles - 1) / 2 - centerZ,
	};
}

function isVehicleObject(definition: ObjectDefinition | undefined): boolean {
	return (
		definition?.category === "vehicle" ||
		definition?.defaultBehaviour?.type === "vehicle"
	);
}

export function areaEntitiesToMarkers(
	area: GameArea | undefined,
	objectDefinitions: ObjectDefinition[],
	includeEventBlocks: boolean,
): EntityMarker[] {
	if (!area) {
		return [];
	}

	const objectDefinitionsById = new Map(
		objectDefinitions.map((definition) => [definition.id, definition]),
	);
	const markers: EntityMarker[] = [];

	area.structures.forEach((structure) => {
		const { threeX, threeZ } = toThreePosition(
			area,
			structure.x,
			structure.y,
			structure.widthTiles,
			structure.heightTiles,
		);
		markers.push({
			color: ENTITY_MARKER_COLORS.structure,
			depth: structure.heightTiles * 0.96,
			gridX: structure.x,
			gridY: structure.y,
			height: 1.7,
			id: structure.id,
			kind: "structure",
			opacity: 1,
			shape: "box",
			threeX,
			threeY: 1.85,
			threeZ,
			width: structure.widthTiles * 0.96,
		});
	});

	area.objects.forEach((object) => {
		const definition = objectDefinitionsById.get(object.objectDefinitionId);
		const widthTiles = object.widthTiles ?? definition?.widthTiles ?? 1;
		const heightTiles = object.heightTiles ?? definition?.heightTiles ?? 1;
		const isVehicle =
			object.behaviourOverride?.type === "vehicle" ||
			isVehicleObject(definition);
		const { threeX, threeZ } = toThreePosition(
			area,
			object.x,
			object.y,
			widthTiles,
			heightTiles,
		);
		markers.push({
			color: isVehicle
				? ENTITY_MARKER_COLORS.vehicle
				: ENTITY_MARKER_COLORS.object,
			depth: isVehicle ? Math.max(0.65, heightTiles * 0.7) : heightTiles * 0.74,
			gridX: object.x,
			gridY: object.y,
			height: isVehicle ? 0.35 : 0.8,
			id: object.id,
			kind: isVehicle ? "vehicle" : "object",
			opacity: 1,
			shape: "box",
			threeX,
			threeY: isVehicle ? 1.18 : 1.4,
			threeZ,
			width: isVehicle ? Math.max(1.1, widthTiles * 0.9) : widthTiles * 0.74,
		});
	});

	area.npcs.forEach((npc) => {
		const { threeX, threeZ } = toThreePosition(area, npc.x, npc.y);
		markers.push({
			color: ENTITY_MARKER_COLORS.npc,
			depth: 0.48,
			gridX: npc.x,
			gridY: npc.y,
			height: 1.25,
			id: npc.id,
			kind: "npc",
			opacity: 1,
			shape: "cylinder",
			threeX,
			threeY: 1.62,
			threeZ,
			width: 0.48,
		});
	});

	area.pickups.forEach((pickup) => {
		const { threeX, threeZ } = toThreePosition(area, pickup.x, pickup.y);
		markers.push({
			color: ENTITY_MARKER_COLORS.pickup,
			depth: 0.34,
			gridX: pickup.x,
			gridY: pickup.y,
			height: 0.34,
			id: pickup.id,
			kind: "pickup",
			opacity: 1,
			shape: "box",
			threeX,
			threeY: 1.75,
			threeZ,
			width: 0.34,
		});
	});

	if (includeEventBlocks) {
		area.eventBlocks.forEach((eventBlock) => {
			const { threeX, threeZ } = toThreePosition(
				area,
				eventBlock.x,
				eventBlock.y,
			);
			markers.push({
				color: ENTITY_MARKER_COLORS.event,
				depth: 0.72,
				gridX: eventBlock.x,
				gridY: eventBlock.y,
				height: 0.12,
				id: eventBlock.id,
				kind: "event",
				opacity: 0.72,
				shape: "box",
				threeX,
				threeY: 1.08,
				threeZ,
				width: 0.72,
			});
		});
	}

	return markers;
}
