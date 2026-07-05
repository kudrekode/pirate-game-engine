import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type {
	EventBlock,
	GameArea,
	GameProject,
	ObjectBehaviour,
	ObjectInstance,
} from "../types/game";
import {
	buyRuntimeShopEntry,
	collectRuntimePickup,
	dismountRuntimeVehicle,
	openRuntimeShop,
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "./runtimeObjectInteractions";
// @ts-expect-error Vite raw import used for a source-boundary test.
import objectInteractionSource from "./runtimeObjectInteractions.ts?raw";
import { createRuntimeSession } from "./runtimeSession";

const boatBehaviour: Extract<ObjectBehaviour, { type: "vehicle" }> = {
	type: "vehicle",
	vehicleType: "boat",
	movementMode: "sail",
	allowedTerrainIds: ["water"],
	dismountAllowedTerrainIds: ["grass"],
	speedMultiplier: 1.5,
};

function makeEventBlock(id: string, x: number, y: number): EventBlock {
	return {
		id,
		name: id === "entry" ? "Entry" : "Start",
		x,
		y,
		tag: id,
		kind: id === "entry" ? "spawn" : "trigger",
	};
}

function makeObject(
	id: string,
	objectDefinitionId: string,
	patch: Partial<ObjectInstance> = {},
): ObjectInstance {
	return {
		id,
		objectDefinitionId,
		areaId: "area_one",
		x: 1,
		y: 0,
		...patch,
	};
}

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		id: "area_one",
		name: "Area One",
		kind: "outdoor",
		width: 3,
		height: 3,
		tileSize: 32,
		terrainTiles: [
			{ x: 0, y: 0, tileId: "grass" },
			{ x: 1, y: 0, tileId: "water" },
			{ x: 2, y: 0, tileId: "water" },
			{ x: 0, y: 1, tileId: "grass" },
			{ x: 1, y: 1, tileId: "grass" },
			{ x: 2, y: 1, tileId: "grass" },
			{ x: 0, y: 2, tileId: "grass" },
			{ x: 1, y: 2, tileId: "grass" },
			{ x: 2, y: 2, tileId: "grass" },
		],
		overlayTiles: [],
		structures: [],
		objects: [],
		pickups: [],
		npcs: [],
		eventBlocks: [makeEventBlock("start", 0, 0)],
		...patch,
	};
}

function makeAreaTwo(): GameArea {
	return {
		...makeArea({ id: "area_two", name: "Area Two" }),
		eventBlocks: [makeEventBlock("entry", 2, 1)],
	};
}

function makeProject(patch: Partial<GameProject> = {}): GameProject {
	const project = cloneProject(defaultProject);
	project.activeAreaId = "area_one";
	project.areas = [makeArea(), makeAreaTwo()];
	project.gameState = {
		flags: { chest_opened: false },
		variables: {},
		inventory: { coin: 10 },
	};
	project.items = [
		{
			id: "coin",
			name: "Coin",
			category: "currency",
			stackable: true,
			maxStack: 99,
		},
		{
			id: "gem",
			name: "Gem",
			category: "quest",
			stackable: true,
			maxStack: 99,
		},
		{
			id: "potion",
			name: "Potion",
			category: "consumable",
			stackable: true,
			maxStack: 99,
		},
		{
			id: "key",
			name: "Key",
			category: "key",
			stackable: false,
		},
	];
	project.objects = [
		{
			id: "chest_def",
			name: "Chest",
			category: "container",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			defaultBehaviour: {
				type: "container",
				contents: [{ itemId: "gem", quantity: 1 }],
				once: true,
				openedFlag: "chest_opened",
			},
		},
		{
			id: "door_def",
			name: "Door",
			category: "door",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			defaultBehaviour: {
				type: "door",
				targetAreaId: "area_two",
				targetEventBlockId: "entry",
			},
		},
		{
			id: "locked_door_def",
			name: "Locked Door",
			category: "door",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			defaultBehaviour: {
				type: "door",
				targetAreaId: "area_two",
				targetEventBlockId: "entry",
				requiredItemId: "key",
				lockedCutsceneId: "locked",
			},
		},
		{
			id: "sign_def",
			name: "Sign",
			category: "sign",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			defaultBehaviour: { type: "sign", text: "Read me." },
		},
		{
			id: "boat_def",
			name: "Boat",
			category: "vehicle",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: true,
			defaultBehaviour: boatBehaviour,
		},
	];
	project.shops = [
		{
			id: "shop",
			name: "Shop",
			currencyItemId: "coin",
			entries: [
				{ id: "potion_entry", itemId: "potion", buyPrice: 5, stock: 1 },
			],
		},
	];
	project.quests = [];
	project.cutscenes = [
		{
			id: "locked",
			name: "Locked",
			backgroundImageId: "forest_path",
			text: "Locked.",
		},
	];
	project.rules = [];
	return { ...project, ...patch };
}

function collectEvents() {
	const events: RuntimeObjectInteractionEvent[] = [];
	return {
		emit: (event: RuntimeObjectInteractionEvent) => events.push(event),
		events,
	};
}

describe("runtime object interactions", () => {
	it("gives container items once", () => {
		const project = makeProject({
			areas: [
				makeArea({
					objects: [makeObject("chest", "chest_def")],
				}),
			],
		});
		const session = createRuntimeSession(project);
		const object = session.project.areas[0].objects[0];
		const { emit } = collectEvents();

		expect(runRuntimeObjectBehaviour(session, object, emit)).toBe(true);
		expect(session.runtimeState.inventory.items.gem).toBe(1);
		expect(session.runtimeState.flags.chest_opened).toBe(true);

		expect(runRuntimeObjectBehaviour(session, object, emit)).toBe(true);
		expect(session.runtimeState.inventory.items.gem).toBe(1);
	});

	it("emits a teleport request for an unlocked door", () => {
		const project = makeProject({
			areas: [
				makeArea({ objects: [makeObject("door", "door_def")] }),
				makeAreaTwo(),
			],
		});
		const session = createRuntimeSession(project);
		const object = session.project.areas[0].objects[0];
		const { emit, events } = collectEvents();

		runRuntimeObjectBehaviour(session, object, emit);

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "teleportRequested",
				areaId: "area_two",
				eventBlockId: "entry",
			}),
		);
	});

	it("emits a locked cutscene for a locked door without the required item", () => {
		const project = makeProject({
			areas: [
				makeArea({
					objects: [makeObject("locked_door", "locked_door_def")],
				}),
			],
		});
		const session = createRuntimeSession(project);
		const object = session.project.areas[0].objects[0];
		const { emit, events } = collectEvents();

		runRuntimeObjectBehaviour(session, object, emit);

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "cutsceneRequested",
				cutsceneId: "locked",
			}),
		);
	});

	it("emits sign text as a cutscene request", () => {
		const project = makeProject({
			areas: [makeArea({ objects: [makeObject("sign", "sign_def")] })],
		});
		const session = createRuntimeSession(project);
		const object = session.project.areas[0].objects[0];
		const { emit, events } = collectEvents();

		runRuntimeObjectBehaviour(session, object, emit);

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "cutsceneRequested",
				cutscene: expect.objectContaining({ text: "Read me." }),
			}),
		);
	});

	it("collects a once pickup only once", () => {
		const project = makeProject({
			areas: [
				makeArea({
					pickups: [
						{
							id: "gem_pickup",
							itemId: "gem",
							quantity: 2,
							areaId: "area_one",
							x: 0,
							y: 0,
							pickupMode: "on_touch",
							once: true,
						},
					],
				}),
			],
		});
		const session = createRuntimeSession(project);
		const pickup = session.project.areas[0].pickups[0];
		const { emit, events } = collectEvents();

		expect(collectRuntimePickup(session, pickup, emit)).toBe(true);
		expect(collectRuntimePickup(session, pickup, emit)).toBe(false);

		expect(session.runtimeState.inventory.items.gem).toBe(2);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "pickupCollected",
				pickupId: "gem_pickup",
			}),
		);
	});

	it("buys shop entries, decrements stock, and syncs inventory", () => {
		const session = createRuntimeSession(makeProject());
		const { emit, events } = collectEvents();

		openRuntimeShop(session, "shop", emit);
		expect(buyRuntimeShopEntry(session, "potion_entry", emit)).toBe(true);

		expect(session.runtimeState.inventory.items.coin).toBe(5);
		expect(session.runtimeState.inventory.items.potion).toBe(1);
		expect(session.runtimeShopStocks.shop.potion_entry).toBe(0);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "shopChanged",
				message: "Bought Potion.",
			}),
		);
	});

	it("emits a useful failure event when currency is missing", () => {
		const project = makeProject({
			gameState: { flags: {}, variables: {}, inventory: { coin: 1 } },
		});
		const session = createRuntimeSession(project);
		const { emit, events } = collectEvents();

		openRuntimeShop(session, "shop", emit);
		expect(buyRuntimeShopEntry(session, "potion_entry", emit)).toBe(false);

		expect(session.runtimeState.inventory.items.coin).toBe(1);
		expect(session.runtimeState.inventory.items.potion).toBeUndefined();
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "status",
				message:
					"Shop purchase failed: need 5 Coin (coin), player has 1 Coin (coin).",
			}),
		);
	});

	it("boards a boat and updates vehicle state and movement mode", () => {
		const project = makeProject({
			areas: [makeArea({ objects: [makeObject("boat", "boat_def")] })],
		});
		const session = createRuntimeSession(project);
		const object = session.project.areas[0].objects[0];
		const { emit, events } = collectEvents();

		runRuntimeObjectBehaviour(session, object, emit);

		expect(session.playerVehicleState).toMatchObject({
			active: true,
			vehicleObjectInstanceId: "boat",
			vehicleType: "boat",
		});
		expect(session.currentMovementMode).toBe("sail");
		expect(events).toContainEqual(
			expect.objectContaining({ type: "vehicleBoarded" }),
		);
	});

	it("dismounts a boat onto allowed terrain", () => {
		const project = makeProject({
			areas: [makeArea({ objects: [makeObject("boat", "boat_def")] })],
		});
		const session = createRuntimeSession(project);
		const area = session.project.areas[0];
		const object = area.objects[0];
		const { emit, events } = collectEvents();
		runRuntimeObjectBehaviour(session, object, emit);
		session.playerPosition = { x: 1, y: 0 };
		session.playerFacing = { x: 0, y: 1 };

		expect(dismountRuntimeVehicle(session, emit, area)).toBe(true);

		expect(session.playerVehicleState.active).toBe(false);
		expect(session.currentMovementMode).toBe("walk");
		expect(session.playerPosition).toEqual({ x: 1, y: 1 });
		expect(object).toMatchObject({ x: 1, y: 0 });
		expect(events).toContainEqual(
			expect.objectContaining({ type: "vehicleDismounted" }),
		);
	});

	it("keeps the player boarded when no dismount tile exists", () => {
		const waterArea = makeArea({
			objects: [makeObject("boat", "boat_def")],
			terrainTiles: [
				{ x: 0, y: 0, tileId: "water" },
				{ x: 1, y: 0, tileId: "water" },
				{ x: 2, y: 0, tileId: "water" },
				{ x: 0, y: 1, tileId: "water" },
				{ x: 1, y: 1, tileId: "water" },
				{ x: 2, y: 1, tileId: "water" },
			],
		});
		const session = createRuntimeSession(makeProject({ areas: [waterArea] }));
		const area = session.project.areas[0];
		const object = area.objects[0];
		const { emit, events } = collectEvents();
		runRuntimeObjectBehaviour(session, object, emit);
		session.playerPosition = { x: 1, y: 0 };
		session.playerFacing = { x: 0, y: 1 };

		expect(dismountRuntimeVehicle(session, emit, area)).toBe(false);

		expect(session.playerVehicleState.active).toBe(true);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "status",
				message: "No place to dismount.",
			}),
		);
	});

	it("syncs quests after inventory-changing interactions", () => {
		const project = makeProject({
			areas: [makeArea({ objects: [makeObject("chest", "chest_def")] })],
			quests: [
				{
					id: "find-gem",
					name: "Find Gem",
					status: "active",
					objectives: [
						{
							id: "has-gem",
							description: "Find a gem",
							condition: { type: "has_item", itemId: "gem", quantity: 1 },
						},
					],
				},
			],
		});
		const session = createRuntimeSession(project);
		const object = session.project.areas[0].objects[0];
		const { emit, events } = collectEvents();

		runRuntimeObjectBehaviour(session, object, emit);

		expect(session.runtimeQuestState.quests[0].status).toBe("completed");
		expect(
			events.some(
				(event) =>
					event.type === "questsChanged" &&
					event.quests[0]?.objectives[0]?.complete === true,
			),
		).toBe(true);
	});

	it("does not import renderer or editor modules", () => {
		expect(objectInteractionSource).not.toMatch(
			/from\s+["'][^"']*(phaser|three|react|editor|store)/i,
		);
	});
});
