import { describe, expect, it } from "vitest";
import { resolveThreeVisual } from "../runtime/three/threeVisuals";
import type { ObjectBehaviour, ObjectDefinition } from "../types/game";
import { defaultProject } from "./defaultProject";
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

describe("defaultProject pirate demo visuals", () => {
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
	});
});
