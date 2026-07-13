import { describe, expect, it } from "vitest";
import { getThreeVisualAssetDefinition } from "../runtime/three/threeVisualAssetRegistry";
import {
	resolveThreeCharacterVisual,
	resolveThreeVisual,
} from "../runtime/three/threeVisuals";
import { deriveCoastlineEdges } from "../runtime/three/waterPresentation";
import type { ObjectBehaviour, ObjectDefinition } from "../types/game";
import { defaultProject } from "./defaultProject";
import defaultProjectSource from "./defaultProject.ts?raw";
import { migrateProject } from "./migrateProject";

function findObjectDefinition(
	project: typeof defaultProject,
	objectDefinitionId: string,
): ObjectDefinition {
	const definition = project.objects.find(
		(object) => object.id === objectDefinitionId,
	);
	if (!definition) {
		throw new Error(`Missing object definition: ${objectDefinitionId}`);
	}
	return definition;
}

function findMainArea(project: typeof defaultProject) {
	const area = project.areas.find((candidate) => candidate.id === "area_main");
	if (!area) {
		throw new Error("Missing Main Area.");
	}
	return area;
}

const decorativeDefinitions = [
	{ assetId: "pirate-palm", blocksMovement: true, id: "object_pirate_palm" },
	{ assetId: "pirate-rocks", blocksMovement: true, id: "object_pirate_rocks" },
	{ assetId: "pirate-crate", blocksMovement: false, id: "object_pirate_crate" },
	{ assetId: "pirate-dock", blocksMovement: false, id: "object_pirate_dock" },
	{ assetId: "pirate-flag", blocksMovement: false, id: "object_pirate_flag" },
] as const;

describe("defaultProject pirate demo visuals", () => {
	it("keeps Main Area and its gameplay-critical pirate route authored in place", () => {
		const mainArea = findMainArea(defaultProject);

		expect(defaultProject.activeAreaId).toBe("area_main");
		expect(mainArea).toMatchObject({ height: 15, id: "area_main", width: 20 });
		expect(mainArea.eventBlocks).toContainEqual(
			expect.objectContaining({ id: "spawn_start", x: 2, y: 2 }),
		);
		expect(mainArea.npcs).toContainEqual(
			expect.objectContaining({ id: "npc_instance_captain_mira", x: 3, y: 4 }),
		);
		expect(mainArea.npcs).toContainEqual(
			expect.objectContaining({ id: "npc_instance_merchant", x: 4, y: 2 }),
		);
		expect(mainArea.objects).toContainEqual(
			expect.objectContaining({ id: "object_coin_chest", x: 6, y: 4 }),
		);
		expect(mainArea.objects).toContainEqual(
			expect.objectContaining({ id: "object_dock_marker", x: 15, y: 7 }),
		);
		expect(mainArea.structures).toContainEqual(
			expect.objectContaining({ id: "structure_demo_house", x: 7, y: 9 }),
		);
	});

	it("assigns the shared skinned pirate character visual without changing gameplay data", () => {
		const captain = defaultProject.npcs.find(
			(npc) => npc.id === "npc_captain_mira",
		);
		const bandit = defaultProject.npcs.find((npc) => npc.id === "npc_bandit");

		expect(defaultProject.player.threeVisual).toEqual({
			assetId: "pirate-character-walk",
			mode: "asset",
			placeholderType: "player",
		});
		expect(captain?.threeVisual).toEqual({
			assetId: "pirate-character-walk",
			mode: "asset",
			placeholderType: "npc",
		});
		expect(bandit?.threeVisual).toEqual({
			assetId: "pirate-character-walk",
			mode: "asset",
			placeholderType: "hostileNpc",
		});
		expect(captain?.defaultAttributes?.alignment).toBe("friendly");
		expect(bandit?.defaultAttributes?.alignment).toBe("hostile");
		expect(bandit?.defaultEnemyBehaviour?.enabled).toBe(true);
		expect(
			resolveThreeCharacterVisual({
				kind: "player",
				threeVisual: defaultProject.player.threeVisual,
			}),
		).toMatchObject({
			assetId: "pirate-character-walk",
			mode: "asset",
			scale: 0.75,
		});
	});

	it("adds presentation-only dressing with valid registry visuals and authored bounds", () => {
		const mainArea = findMainArea(defaultProject);
		const definitionIds = new Set(
			defaultProject.objects.map((object) => object.id),
		);
		const decorativeDefinitionIds = new Set<string>(
			decorativeDefinitions.map((definition) => definition.id),
		);
		const decorativeInstances = mainArea.objects.filter((object) =>
			decorativeDefinitionIds.has(object.objectDefinitionId),
		);

		expect(decorativeInstances).toHaveLength(12);
		expect(new Set(decorativeInstances.map((object) => object.id)).size).toBe(
			decorativeInstances.length,
		);
		for (const expected of decorativeDefinitions) {
			const definition = findObjectDefinition(defaultProject, expected.id);
			expect(definitionIds.has(expected.id)).toBe(true);
			expect(definition).toMatchObject({
				blocksMovement: expected.blocksMovement,
				category: "prop",
				id: expected.id,
			});
			expect(definition.defaultBehaviour).toBeUndefined();
			expect(definition.defaultInteraction).toBeUndefined();
			expect(definition.threeVisual?.assetId).toBe(expected.assetId);
			expect(
				getThreeVisualAssetDefinition(definition.threeVisual?.assetId),
			).toBeDefined();
		}
		for (const instance of decorativeInstances) {
			expect(instance.areaId).toBe(mainArea.id);
			expect(instance.x).toBeGreaterThanOrEqual(0);
			expect(instance.y).toBeGreaterThanOrEqual(0);
			expect(instance.x).toBeLessThan(mainArea.width);
			expect(instance.y).toBeLessThan(mainArea.height);
		}
	});

	it("keeps decorative scene data out of loader and gameplay code", () => {
		expect(defaultProjectSource).not.toMatch(/GLTFLoader/);
		expect(defaultProjectSource).not.toMatch(/requestThreeVisualAsset/);
	});
	it("places the demo boat on authored river water with derivable coastline", () => {
		const mainArea = defaultProject.areas.find(
			(area) => area.id === "area_main",
		);
		expect(mainArea).toBeDefined();

		const boat = mainArea?.objects.find(
			(object) => object.id === "object_dock_marker",
		);
		const boatTerrain = mainArea?.terrainTiles.find(
			(tile) => tile.x === boat?.x && tile.y === boat?.y,
		);

		expect(boatTerrain?.tileId).toBe("water");
		expect(deriveCoastlineEdges(mainArea)).not.toHaveLength(0);
	});

	it("assigns Pirate Chest to the existing container definition without changing gameplay", () => {
		const chest = findObjectDefinition(defaultProject, "object_chest");

		expect(chest).toMatchObject({
			blocksMovement: true,
			category: "container",
			heightTiles: 1,
			id: "object_chest",
			name: "Chest",
			widthTiles: 1,
		});
		expect(chest.defaultBehaviour).toEqual({
			contents: [{ itemId: "gold_coin", quantity: 5 }],
			once: true,
			openedFlag: "demo_chest_opened",
			type: "container",
		} satisfies ObjectBehaviour);
		expect(chest.threeVisual).toEqual({
			assetId: "pirate-chest",
			mode: "asset",
			placeholderType: "chest",
		});
		expect(
			resolveThreeVisual({
				behaviour: chest.defaultBehaviour,
				category: chest.category,
				kind: "object",
				name: chest.name,
				threeVisual: chest.threeVisual,
			}),
		).toMatchObject({
			assetId: "pirate-chest",
			mode: "asset",
			placeholderType: "chest",
			scale: 0.22,
		});
	});

	it("assigns Pirate Small Ship to the existing boat vehicle without changing gameplay", () => {
		const boat = findObjectDefinition(defaultProject, "object_dock_marker");

		expect(boat).toMatchObject({
			blocksMovement: false,
			category: "vehicle",
			heightTiles: 1,
			id: "object_dock_marker",
			name: "Boat",
			widthTiles: 1,
		});
		expect(boat.defaultBehaviour).toEqual({
			allowedTerrainIds: ["water"],
			dismountAllowedTerrainIds: ["grass", "dirt", "sand", "stone"],
			movementMode: "sail",
			speedMultiplier: 1,
			type: "vehicle",
			vehicleType: "boat",
		} satisfies ObjectBehaviour);
		expect(boat.threeVisual).toEqual({
			assetId: "pirate-small-ship",
			mode: "asset",
			placeholderType: "boat",
		});
		expect(
			resolveThreeVisual({
				behaviour: boat.defaultBehaviour,
				category: boat.category,
				kind: "object",
				name: boat.name,
				threeVisual: boat.threeVisual,
			}),
		).toMatchObject({
			assetId: "pirate-small-ship",
			mode: "asset",
			placeholderType: "boat",
			scale: 0.12,
		});
	});

	it("migration accepts the authored pirate visual assignments", () => {
		const migrated = migrateProject(defaultProject);

		expect(findObjectDefinition(migrated, "object_chest").threeVisual).toEqual({
			assetId: "pirate-chest",
			mode: "asset",
			placeholderType: "chest",
		});
		expect(
			findObjectDefinition(migrated, "object_dock_marker").threeVisual,
		).toEqual({
			assetId: "pirate-small-ship",
			mode: "asset",
			placeholderType: "boat",
		});
		expect(
			migrated.areas
				.find((area) => area.id === "area_main")
				?.objects.filter((object) =>
					object.objectDefinitionId.startsWith("object_pirate_"),
				),
		).toHaveLength(12);
	});
});
