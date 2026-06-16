import { describe, expect, it } from "vitest";
import type { GameArea, ObjectDefinition } from "../../types/game";
import { areaEntitiesToMarkers } from "./entityMarkers";

function makeArea(overrides: Partial<GameArea> = {}): GameArea {
	return {
		eventBlocks: [],
		height: 8,
		id: "area",
		kind: "outdoor",
		name: "Area",
		npcs: [],
		objects: [],
		overlayTiles: [],
		pickups: [],
		structures: [],
		terrainTiles: [],
		tileSize: 32,
		width: 10,
		...overrides,
	};
}

const objectDefinitions: ObjectDefinition[] = [
	{
		blocksMovement: true,
		category: "container",
		heightTiles: 1,
		id: "chest",
		name: "Chest",
		widthTiles: 1,
	},
	{
		blocksMovement: false,
		category: "vehicle",
		heightTiles: 1,
		id: "boat",
		name: "Boat",
		widthTiles: 2,
	},
];

describe("areaEntitiesToMarkers", () => {
	it("converts structures, objects, NPCs, pickups, and vehicles to markers", () => {
		const markers = areaEntitiesToMarkers(
			makeArea({
				npcs: [
					{
						attributes: {
							alignment: "friendly",
							canInteract: true,
							faction: "villagers",
							health: 10,
							maxHealth: 10,
							movementSpeed: 1,
						},
						blocksMovement: true,
						id: "npc",
						areaId: "area",
						movementMode: "stationary",
						npcDefinitionId: "captain",
						x: 4,
						y: 3,
					},
				],
				objects: [
					{
						areaId: "area",
						id: "chest-1",
						objectDefinitionId: "chest",
						x: 1,
						y: 2,
					},
					{
						areaId: "area",
						id: "boat-1",
						objectDefinitionId: "boat",
						x: 5,
						y: 6,
					},
				],
				pickups: [
					{
						areaId: "area",
						id: "coin",
						itemId: "gold",
						once: true,
						pickupMode: "on_touch",
						quantity: 1,
						x: 2,
						y: 3,
					},
				],
				structures: [
					{
						blocksMovement: true,
						heightTiles: 2,
						id: "house",
						name: "House",
						structureId: "small_house",
						widthTiles: 3,
						x: 2,
						y: 1,
					},
				],
			}),
			objectDefinitions,
			false,
		);

		expect(markers.map((marker) => marker.kind)).toEqual([
			"structure",
			"object",
			"vehicle",
			"npc",
			"pickup",
		]);
		expect(markers.find((marker) => marker.id === "house")).toMatchObject({
			depth: 1.92,
			threeX: -1.5,
			threeZ: -2,
			width: 2.88,
		});
		expect(markers.find((marker) => marker.id === "npc")).toMatchObject({
			shape: "cylinder",
			threeX: -0.5,
			threeZ: -0.5,
		});
		expect(markers.find((marker) => marker.id === "boat-1")).toMatchObject({
			kind: "vehicle",
			width: 1.8,
		});
	});

	it("keeps event blocks behind the debug toggle", () => {
		const area = makeArea({
			eventBlocks: [
				{
					id: "spawn",
					kind: "spawn",
					name: "Spawn",
					tag: "start",
					x: 3,
					y: 4,
				},
			],
		});

		expect(areaEntitiesToMarkers(area, objectDefinitions, false)).toEqual([]);
		expect(areaEntitiesToMarkers(area, objectDefinitions, true)).toMatchObject([
			{
				id: "spawn",
				kind: "event",
				opacity: 0.72,
			},
		]);
	});

	it("places entity markers on top of raised terrain", () => {
		const markers = areaEntitiesToMarkers(
			makeArea({
				npcs: [
					{
						areaId: "area",
						attributes: {
							alignment: "friendly",
							canInteract: true,
							faction: "villagers",
							health: 10,
							maxHealth: 10,
						},
						blocksMovement: true,
						id: "npc",
						movementMode: "stationary",
						npcDefinitionId: "captain",
						x: 1,
						y: 1,
					},
				],
				terrainHeights: [{ x: 1, y: 1, height: 2 }],
				terrainTiles: [{ x: 1, y: 1, tileId: "grass" }],
			}),
			objectDefinitions,
			false,
		);

		expect(markers.find((marker) => marker.id === "npc")).toMatchObject({
			threeY: 3.625,
		});
	});

	it("handles missing areas", () => {
		expect(areaEntitiesToMarkers(undefined, objectDefinitions, true)).toEqual(
			[],
		);
	});
});
