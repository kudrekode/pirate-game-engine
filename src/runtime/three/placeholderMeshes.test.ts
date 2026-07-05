import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type {
	NPCAttributes,
	ObjectBehaviour,
	ObjectDefinition,
} from "../../types/game";
import {
	applyPlaceholderMetadata,
	createPlaceholderMeshGroup,
	getPlaceholderSelectableObjects,
	resolvePlaceholderVisualType,
} from "./placeholderMeshes";

const boatBehaviour: Extract<ObjectBehaviour, { type: "vehicle" }> = {
	type: "vehicle",
	vehicleType: "boat",
	movementMode: "sail",
	allowedTerrainIds: ["water"],
	dismountAllowedTerrainIds: ["grass"],
};

function makeObjectDefinition(
	patch: Partial<ObjectDefinition>,
): ObjectDefinition {
	return {
		blocksMovement: false,
		category: "misc",
		heightTiles: 1,
		id: "object",
		name: "Object",
		widthTiles: 1,
		...patch,
	};
}

function makeAttributes(
	alignment: NPCAttributes["alignment"],
): Pick<NPCAttributes, "alignment"> {
	return { alignment };
}

describe("placeholder mesh helpers", () => {
	it("resolves boat objects to boat visuals", () => {
		const definition = makeObjectDefinition({
			category: "vehicle",
			defaultBehaviour: boatBehaviour,
			name: "Boat",
		});

		expect(
			resolvePlaceholderVisualType({
				behaviour: definition.defaultBehaviour,
				category: definition.category,
				kind: "object",
				name: definition.name,
			}),
		).toBe("boat");
	});

	it("resolves container objects to chest visuals", () => {
		expect(
			resolvePlaceholderVisualType({
				category: "container",
				kind: "object",
				name: "Supply Chest",
			}),
		).toBe("chest");
	});

	it("resolves sign objects to sign visuals", () => {
		expect(
			resolvePlaceholderVisualType({
				category: "sign",
				kind: "object",
				name: "Notice Sign",
			}),
		).toBe("sign");
	});

	it("resolves hostile NPCs to hostile NPC visuals", () => {
		expect(
			resolvePlaceholderVisualType({
				attributes: makeAttributes("hostile"),
				kind: "npc",
				name: "Pirate",
			}),
		).toBe("hostileNpc");
	});

	it("falls back unknown objects to generic visuals without mutating input", () => {
		const entity = {
			category: "misc" as const,
			kind: "object" as const,
			name: "Mystery Thing",
		};

		expect(resolvePlaceholderVisualType(entity)).toBe("genericObject");
		expect(entity).toEqual({
			category: "misc",
			kind: "object",
			name: "Mystery Thing",
		});
	});

	it("applies selection metadata to generated selectable children", () => {
		const metadata = {
			areaId: "area",
			entityId: "boat",
			entityType: "object",
			x: 1,
			y: 2,
		};
		const group = createPlaceholderMeshGroup(
			{
				color: 0x0ea5e9,
				depth: 0.7,
				height: 0.35,
				opacity: 1,
				threeX: 1,
				threeY: 0.2,
				threeZ: 2,
				visualType: "boat",
				width: 1.1,
			},
			{ metadata },
		);

		expect(group.userData.selectionMetadata).toEqual(metadata);
		expect(getPlaceholderSelectableObjects(group).length).toBeGreaterThan(0);
		expect(
			getPlaceholderSelectableObjects(group).every(
				(child) => child.userData.selectionMetadata === metadata,
			),
		).toBe(true);
	});

	it("applies metadata to arbitrary object hierarchies", () => {
		const group = new THREE.Group();
		const child = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshStandardMaterial(),
		);
		const metadata = { areaId: "area", entityId: "sign", entityType: "object" };
		group.add(child);

		applyPlaceholderMetadata(group, metadata);

		expect(group.userData.selectionMetadata).toBe(metadata);
		expect(child.userData.selectionMetadata).toBe(metadata);
	});
});
