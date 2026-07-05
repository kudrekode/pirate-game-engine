import { getTerrainSurfaceY } from "../../data/terrainHeight";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import type { PlaceholderVisualType } from "../../runtime/three/placeholderMeshes";
import {
	type ResolvedThreeVisual,
	resolveThreeVisual,
} from "../../runtime/three/threeVisuals";
import type {
	GameArea,
	NPCDefinition,
	ObjectDefinition,
} from "../../types/game";
import type { MapOverlayFilters } from "./overlayFilters";

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
	visualType: PlaceholderVisualType;
	visual?: ResolvedThreeVisual;
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

function getFootprintSurfaceY(
	area: GameArea,
	x: number,
	y: number,
	widthTiles = 1,
	heightTiles = 1,
): number {
	let surfaceY = getTerrainSurfaceY(area, x, y);
	for (let tileY = y; tileY < y + heightTiles; tileY += 1) {
		for (let tileX = x; tileX < x + widthTiles; tileX += 1) {
			surfaceY = Math.max(surfaceY, getTerrainSurfaceY(area, tileX, tileY));
		}
	}
	return surfaceY;
}

export function areaEntitiesToMarkers(
	area: GameArea | undefined,
	objectDefinitions: ObjectDefinition[],
	npcDefinitionsOrFilters: NPCDefinition[] | boolean | MapOverlayFilters,
	filtersMaybe?: boolean | MapOverlayFilters,
): EntityMarker[] {
	if (!area) {
		return [];
	}
	const npcDefinitions = Array.isArray(npcDefinitionsOrFilters)
		? npcDefinitionsOrFilters
		: [];
	const filtersOrIncludeEventBlocks: boolean | MapOverlayFilters =
		filtersMaybe ??
		(Array.isArray(npcDefinitionsOrFilters) ? false : npcDefinitionsOrFilters);
	const filters =
		typeof filtersOrIncludeEventBlocks === "boolean"
			? ({
					eventBlocks: filtersOrIncludeEventBlocks,
					npcs: true,
					objects: true,
					pickups: true,
					spawnPoints: filtersOrIncludeEventBlocks,
					structures: true,
				} as MapOverlayFilters)
			: filtersOrIncludeEventBlocks;

	const objectDefinitionsById = new Map(
		objectDefinitions.map((definition) => [definition.id, definition]),
	);
	const npcDefinitionsById = new Map(
		npcDefinitions.map((definition) => [definition.id, definition]),
	);
	const markers: EntityMarker[] = [];

	if (filters.structures) {
		area.structures.forEach((structure) => {
			const { threeX, threeZ } = toThreePosition(
				area,
				structure.x,
				structure.y,
				structure.widthTiles,
				structure.heightTiles,
			);
			const surfaceY = getFootprintSurfaceY(
				area,
				structure.x,
				structure.y,
				structure.widthTiles,
				structure.heightTiles,
			);
			const visual = resolveThreeVisual({
				kind: "structure",
				name: structure.name,
				structureId: structure.structureId,
			});
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
				threeY: surfaceY + 0.85,
				threeZ,
				visual,
				visualType: visual.placeholderType,
				width: structure.widthTiles * 0.96,
			});
		});
	}

	if (filters.objects) {
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
			const surfaceY = getFootprintSurfaceY(
				area,
				object.x,
				object.y,
				widthTiles,
				heightTiles,
			);
			const markerHeight = isVehicle ? 0.35 : 0.8;
			const visual = resolveThreeVisual({
				behaviour: object.behaviourOverride ?? definition?.defaultBehaviour,
				category: definition?.category,
				interaction: object.interaction ?? definition?.defaultInteraction,
				kind: "object",
				name: object.nameOverride ?? definition?.name,
				threeVisual: definition?.threeVisual,
			});
			markers.push({
				color: isVehicle
					? ENTITY_MARKER_COLORS.vehicle
					: ENTITY_MARKER_COLORS.object,
				depth: isVehicle
					? Math.max(0.65, heightTiles * 0.7)
					: heightTiles * 0.74,
				gridX: object.x,
				gridY: object.y,
				height: markerHeight,
				id: object.id,
				kind: isVehicle ? "vehicle" : "object",
				opacity: 1,
				shape: "box",
				threeX,
				threeY: surfaceY + markerHeight / 2,
				threeZ,
				visual,
				visualType: visual.placeholderType,
				width: isVehicle ? Math.max(1.1, widthTiles * 0.9) : widthTiles * 0.74,
			});
		});
	}

	if (filters.npcs) {
		area.npcs.forEach((npc) => {
			const definition = npcDefinitionsById.get(npc.npcDefinitionId);
			const resolvedNpc = resolveNPCInstance(definition, npc);
			const { threeX, threeZ } = toThreePosition(area, npc.x, npc.y);
			const markerHeight = 1.25;
			const visual = resolveThreeVisual({
				attributes: resolvedNpc.attributes,
				enemyEnabled: resolvedNpc.enemyBehaviour?.enabled,
				kind: "npc",
				name: resolvedNpc.name,
				threeVisual: definition?.threeVisual,
			});
			markers.push({
				color: ENTITY_MARKER_COLORS.npc,
				depth: 0.48,
				gridX: npc.x,
				gridY: npc.y,
				height: markerHeight,
				id: npc.id,
				kind: "npc",
				opacity: 1,
				shape: "cylinder",
				threeX,
				threeY: getTerrainSurfaceY(area, npc.x, npc.y) + markerHeight / 2,
				threeZ,
				visual,
				visualType: visual.placeholderType,
				width: 0.48,
			});
		});
	}

	if (filters.pickups) {
		area.pickups.forEach((pickup) => {
			const { threeX, threeZ } = toThreePosition(area, pickup.x, pickup.y);
			const markerHeight = 0.34;
			const visual = resolveThreeVisual({ kind: "pickup" });
			markers.push({
				color: ENTITY_MARKER_COLORS.pickup,
				depth: 0.34,
				gridX: pickup.x,
				gridY: pickup.y,
				height: markerHeight,
				id: pickup.id,
				kind: "pickup",
				opacity: 1,
				shape: "box",
				threeX,
				threeY: getTerrainSurfaceY(area, pickup.x, pickup.y) + 0.75,
				threeZ,
				visual,
				visualType: visual.placeholderType,
				width: 0.34,
			});
		});
	}

	if (filters.eventBlocks || filters.spawnPoints) {
		area.eventBlocks.forEach((eventBlock) => {
			if (
				(eventBlock.kind === "spawn" && !filters.spawnPoints) ||
				(eventBlock.kind !== "spawn" && !filters.eventBlocks)
			) {
				return;
			}
			const { threeX, threeZ } = toThreePosition(
				area,
				eventBlock.x,
				eventBlock.y,
			);
			const markerHeight = 0.12;
			const visual = resolveThreeVisual({
				kind: "event",
				name: eventBlock.name,
			});
			markers.push({
				color: ENTITY_MARKER_COLORS.event,
				depth: 0.72,
				gridX: eventBlock.x,
				gridY: eventBlock.y,
				height: markerHeight,
				id: eventBlock.id,
				kind: "event",
				opacity: 0.72,
				shape: "box",
				threeX,
				threeY: getTerrainSurfaceY(area, eventBlock.x, eventBlock.y) + 0.06,
				threeZ,
				visual,
				visualType: visual.placeholderType,
				width: 0.72,
			});
		});
	}

	return markers;
}
