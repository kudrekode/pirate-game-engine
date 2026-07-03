import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type {
	GameArea,
	GameProject,
	Interaction,
	MapStructure,
	NPCInstance,
	ObjectInstance,
	PickupObject,
} from "../types/game";
import {
	findNearestInteractableTarget,
	findTouchInteractableTarget,
} from "./interactionDiscovery";
import { createRuntimeSession } from "./runtimeSession";

const interact: Interaction = {
	type: "set_flag",
	activationMode: "on_interact",
	flag: "used",
	value: true,
};

const touch: Interaction = {
	type: "set_flag",
	activationMode: "on_touch",
	flag: "touched",
	value: true,
};

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		id: "area_test",
		name: "Test Area",
		kind: "outdoor",
		width: 8,
		height: 8,
		tileSize: 32,
		terrainTiles: [],
		terrainHeights: undefined,
		overlayTiles: [],
		structures: [],
		objects: [],
		pickups: [],
		npcs: [],
		eventBlocks: [],
		...patch,
	};
}

function makeNpc(patch: Partial<NPCInstance> = {}): NPCInstance {
	return {
		id: "npc_one",
		npcDefinitionId: "npc_definition",
		areaId: "area_test",
		x: 2,
		y: 3,
		facing: "down",
		blocksMovement: true,
		movementMode: "stationary",
		attributes: {
			maxHealth: 100,
			health: 100,
			faction: "villagers",
			alignment: "friendly",
			canInteract: true,
			movementSpeed: 1,
		},
		...patch,
	};
}

function makeObject(patch: Partial<ObjectInstance> = {}): ObjectInstance {
	return {
		id: "object_one",
		objectDefinitionId: "object_definition",
		areaId: "area_test",
		x: 2,
		y: 3,
		...patch,
	};
}

function makePickup(patch: Partial<PickupObject> = {}): PickupObject {
	return {
		id: "pickup_one",
		itemId: "gold_coin",
		quantity: 1,
		areaId: "area_test",
		x: 2,
		y: 3,
		pickupMode: "on_interact",
		once: true,
		...patch,
	};
}

function makeStructure(patch: Partial<MapStructure> = {}): MapStructure {
	return {
		id: "structure_one",
		structureId: "house",
		name: "Structure",
		x: 2,
		y: 3,
		widthTiles: 1,
		heightTiles: 1,
		blocksMovement: true,
		interaction: interact,
		...patch,
	};
}

function makeProject(area: GameArea): GameProject {
	const project = cloneProject(defaultProject);
	project.activeAreaId = area.id;
	project.areas = [area];
	project.items = [
		{
			id: "gold_coin",
			name: "Gold Coin",
			category: "currency",
			stackable: true,
			maxStack: 999,
		},
	];
	project.objects = [
		{
			id: "object_definition",
			name: "Object",
			category: "prop",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			defaultInteraction: interact,
		},
	];
	project.npcs = [
		{
			id: "npc_definition",
			name: "Guide",
			mapAvatarId: "ranger",
			defaultAttributes: {
				maxHealth: 100,
				health: 100,
				faction: "villagers",
				alignment: "friendly",
				canInteract: true,
				movementSpeed: 1,
			},
			defaultMovement: { movementMode: "stationary", movementSpeed: 1 },
			defaultInteraction: interact,
		},
	];
	project.rules = [];
	return project;
}

function findNearest(project: GameProject, position = { x: 2, y: 2 }) {
	const session = createRuntimeSession(project);
	const area = session.project.areas[0];
	session.playerPosition = position;
	return findNearestInteractableTarget({
		project: session.project,
		area,
		playerPosition: session.playerPosition,
		runtimeState: session.runtimeState,
		collectedPickupIds: session.collectedPickupIds,
		defeatedNpcIds: session.defeatedNpcIds,
	});
}

describe("interaction discovery", () => {
	it("discovers the nearest NPC", () => {
		const project = makeProject(makeArea({ npcs: [makeNpc()] }));

		const target = findNearest(project);

		expect(target?.type).toBe("npc");
		expect(target?.id).toBe("npc_one");
		expect(target?.label).toBe("Guide");
	});

	it("ignores NPCs when runtime canInteract is false", () => {
		const project = makeProject(makeArea({ npcs: [makeNpc()] }));
		const session = createRuntimeSession(project);
		const area = session.project.areas[0];
		session.playerPosition = { x: 2, y: 2 };
		session.runtimeState.npcs.npc_one.canInteract = false;

		const target = findNearestInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
		});

		expect(target).toBeNull();
	});

	it("discovers an object interaction", () => {
		const project = makeProject(makeArea({ objects: [makeObject()] }));

		const target = findNearest(project);

		expect(target?.type).toBe("object");
		if (target?.type !== "object") {
			throw new Error("Expected object target.");
		}
		expect(target.id).toBe("object_one");
		expect(target.interactionKind).toBe("set_flag");
	});

	it("discovers an event block interaction", () => {
		const project = makeProject(
			makeArea({
				eventBlocks: [
					{
						id: "event_one",
						name: "Event",
						x: 2,
						y: 3,
						tag: "event",
						kind: "trigger",
						interaction: interact,
					},
				],
			}),
		);

		const target = findNearest(project);

		expect(target?.type).toBe("eventBlock");
		expect(target?.id).toBe("event_one");
	});

	it("discovers an interact pickup and ignores it after collection", () => {
		const project = makeProject(makeArea({ pickups: [makePickup()] }));
		const session = createRuntimeSession(project);
		const area = session.project.areas[0];
		session.playerPosition = { x: 2, y: 2 };

		const target = findNearestInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
			collectedPickupIds: session.collectedPickupIds,
		});
		session.collectedPickupIds.add("pickup_one");
		const collectedTarget = findNearestInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
			collectedPickupIds: session.collectedPickupIds,
		});

		expect(target?.type).toBe("pickup");
		expect(target?.id).toBe("pickup_one");
		expect(collectedTarget).toBeNull();
	});

	it("keeps event blocks ahead of same-distance targets", () => {
		const project = makeProject(
			makeArea({
				eventBlocks: [
					{
						id: "event_one",
						name: "Event",
						x: 2,
						y: 3,
						tag: "event",
						kind: "trigger",
						interaction: interact,
					},
				],
				objects: [makeObject()],
				structures: [makeStructure()],
				npcs: [makeNpc()],
				pickups: [makePickup()],
			}),
		);

		const target = findNearest(project);

		expect(target?.type).toBe("eventBlock");
		expect(target?.id).toBe("event_one");
	});

	it("ignores out-of-range targets", () => {
		const project = makeProject(makeArea({ npcs: [makeNpc({ x: 6, y: 6 })] }));

		expect(findNearest(project)).toBeNull();
	});

	it("ignores defeated NPCs when the runtime session marks them defeated", () => {
		const project = makeProject(makeArea({ npcs: [makeNpc()] }));
		const session = createRuntimeSession(project);
		const area = session.project.areas[0];
		session.playerPosition = { x: 2, y: 2 };
		session.defeatedNpcIds.add("npc_one");

		const target = findNearestInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
			defeatedNpcIds: session.defeatedNpcIds,
		});

		expect(target).toBeNull();
	});

	it("discovers touch targets using pickup object then event priority", () => {
		const project = makeProject(
			makeArea({
				eventBlocks: [
					{
						id: "event_one",
						name: "Event",
						x: 2,
						y: 2,
						tag: "event",
						kind: "trigger",
						interaction: touch,
					},
				],
				objects: [makeObject({ interaction: touch, x: 2, y: 2 })],
				pickups: [makePickup({ pickupMode: "on_touch", x: 2, y: 2 })],
			}),
		);
		const session = createRuntimeSession(project);
		const area = session.project.areas[0];
		session.playerPosition = { x: 2, y: 2 };

		const pickupTarget = findTouchInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
			collectedPickupIds: session.collectedPickupIds,
		});
		session.collectedPickupIds.add("pickup_one");
		const objectTarget = findTouchInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
			collectedPickupIds: session.collectedPickupIds,
		});
		area.objects = [];
		const eventTarget = findTouchInteractableTarget({
			project: session.project,
			area,
			playerPosition: session.playerPosition,
			runtimeState: session.runtimeState,
			collectedPickupIds: session.collectedPickupIds,
		});

		expect(pickupTarget?.type).toBe("pickup");
		expect(objectTarget?.type).toBe("object");
		expect(eventTarget?.type).toBe("eventBlock");
	});
});
