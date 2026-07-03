import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type { GameArea, GameProject, ObjectBehaviour } from "../types/game";
import {
	attemptPlayerMove,
	getPlayerMoveDurationMs,
} from "./playerMovementTransaction";
import { createRuntimeSession } from "./runtimeSession";

const boatBehaviour: Extract<ObjectBehaviour, { type: "vehicle" }> = {
	type: "vehicle",
	vehicleType: "boat",
	movementMode: "sail",
	allowedTerrainIds: ["water"],
	dismountAllowedTerrainIds: ["grass"],
	speedMultiplier: 1.5,
};

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		id: "area_test",
		name: "Test Area",
		kind: "outdoor",
		width: 3,
		height: 3,
		tileSize: 32,
		terrainTiles: [
			{ x: 0, y: 0, tileId: "grass" },
			{ x: 1, y: 0, tileId: "grass" },
			{ x: 2, y: 0, tileId: "grass" },
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
		eventBlocks: [],
		...patch,
	};
}

function makeProject(area: GameArea): GameProject {
	const project = cloneProject(defaultProject);
	project.activeAreaId = area.id;
	project.areas = [area];
	project.player = {
		...project.player,
		speed: 6,
		canWalkOn: ["grass", "dirt"],
	};
	project.items = [
		{
			id: "coin",
			name: "Coin",
			category: "currency",
			stackable: true,
			maxStack: 999,
		},
	];
	project.objects = [
		{
			id: "object_boat",
			name: "Boat",
			category: "vehicle",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: true,
			defaultBehaviour: boatBehaviour,
		},
	];
	project.rules = [];
	return project;
}

describe("player movement transaction", () => {
	it("returns blocked for blocked terrain without moving the player", () => {
		const project = makeProject(
			makeArea({
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "water" },
				],
			}),
		);
		const session = createRuntimeSession(project);

		const result = attemptPlayerMove(session, { x: 1, y: 0 });

		expect(result).toMatchObject({
			type: "blocked",
			reason: "Blocked by Water.",
			from: { x: 0, y: 0 },
			to: { x: 1, y: 0 },
		});
		expect(session.playerPosition).toEqual({ x: 0, y: 0 });
	});

	it("returns moved for walkable terrain and updates runtime position", () => {
		const session = createRuntimeSession(makeProject(makeArea()));

		const result = attemptPlayerMove(session, { x: 1, y: 0 });

		expect(result).toMatchObject({
			type: "moved",
			from: { x: 0, y: 0 },
			to: { x: 1, y: 0 },
			facing: { x: 1, y: 0 },
			moveDurationMs: getPlayerMoveDurationMs(6),
			movementMode: "walk",
		});
		expect(session.playerPosition).toEqual({ x: 1, y: 0 });
	});

	it("updates facing even when movement is blocked", () => {
		const project = makeProject(
			makeArea({
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "water" },
				],
			}),
		);
		const session = createRuntimeSession(project);

		attemptPlayerMove(session, { x: 1, y: 0 });

		expect(session.playerFacing).toEqual({ x: 1, y: 0 });
	});

	it("returns touch pickup targets after movement", () => {
		const session = createRuntimeSession(
			makeProject(
				makeArea({
					pickups: [
						{
							id: "pickup_coin",
							itemId: "coin",
							quantity: 1,
							areaId: "area_test",
							x: 1,
							y: 0,
							pickupMode: "on_touch",
							once: true,
						},
					],
				}),
			),
		);

		const result = attemptPlayerMove(session, { x: 1, y: 0 });

		expect(result.type).toBe("moved");
		if (result.type !== "moved") {
			throw new Error("Expected moved result.");
		}
		expect(result.touchTargets).toHaveLength(1);
		expect(result.touchTargets[0]).toMatchObject({
			type: "pickup",
			id: "pickup_coin",
		});
	});

	it("returns waiting event trigger targets after movement", () => {
		const session = createRuntimeSession(
			makeProject(
				makeArea({
					eventBlocks: [
						{
							id: "goal",
							name: "Goal",
							x: 1,
							y: 0,
							tag: "goal",
							kind: "trigger",
						},
					],
				}),
			),
		);
		session.waitingForTrigger = {
			areaId: "area_test",
			eventBlockId: "goal",
		};

		const result = attemptPlayerMove(session, { x: 1, y: 0 });

		expect(result.type).toBe("moved");
		if (result.type !== "moved") {
			throw new Error("Expected moved result.");
		}
		expect(result.triggerTargets).toHaveLength(1);
		expect(result.triggerTargets[0]).toMatchObject({
			type: "eventBlock",
			id: "goal",
		});
	});

	it("preserves vehicle movement and speed multiplier semantics", () => {
		const session = createRuntimeSession(
			makeProject(
				makeArea({
					terrainTiles: [
						{ x: 0, y: 0, tileId: "water" },
						{ x: 1, y: 0, tileId: "water" },
					],
					objects: [
						{
							id: "boat_instance",
							objectDefinitionId: "object_boat",
							areaId: "area_test",
							x: 1,
							y: 0,
							blocksMovement: true,
						},
					],
				}),
			),
		);
		session.playerVehicleState = {
			active: true,
			vehicleObjectInstanceId: "boat_instance",
			vehicleType: "boat",
			movementMode: "sail",
		};
		session.currentMovementMode = "sail";

		const result = attemptPlayerMove(session, { x: 1, y: 0 });

		expect(result).toMatchObject({
			type: "moved",
			movementMode: "sail",
			moveDurationMs: getPlayerMoveDurationMs(6, 1.5),
		});
	});

	it("does not mutate editor project defaults", () => {
		const project = makeProject(makeArea());
		const before = cloneProject(project);
		const session = createRuntimeSession(project);

		attemptPlayerMove(session, { x: 1, y: 0 });

		expect(project).toEqual(before);
		expect(session.playerPosition).toEqual({ x: 1, y: 0 });
	});
});
