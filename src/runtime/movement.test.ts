import { describe, expect, it } from "vitest";
import type { GameArea, PlayerConfig } from "../types/game";
import {
	findDismountTile,
	resolveMovementAt,
	type VehicleMovementConfig,
} from "./movement";

const player: PlayerConfig = {
	name: "Ari",
	mapAvatarId: "scout",
	cutscenePortraitId: "portrait_scout",
	speed: 6,
	health: 5,
	canWalkOn: ["grass", "dirt"],
};

const boat: VehicleMovementConfig = {
	type: "vehicle",
	vehicleType: "boat",
	movementMode: "sail",
	allowedTerrainIds: ["water"],
	dismountAllowedTerrainIds: ["grass", "dirt", "sand", "stone"],
	speedMultiplier: 1.5,
};

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		id: "test-area",
		name: "Test Area",
		kind: "outdoor",
		width: 2,
		height: 2,
		tileSize: 32,
		terrainTiles: [
			{ x: 0, y: 0, tileId: "grass" },
			{ x: 1, y: 0, tileId: "water" },
			{ x: 0, y: 1, tileId: "grass" },
			{ x: 1, y: 1, tileId: "grass" },
		],
		overlayTiles: [],
		structures: [],
		eventBlocks: [],
		...patch,
		objects: patch.objects ?? [],
		pickups: patch.pickups ?? [],
		npcs: patch.npcs ?? [],
	};
}

describe("resolveMovementAt", () => {
	it("allows walkable terrain", () => {
		expect(resolveMovementAt(makeArea(), 0, 0, player).canMove).toBe(true);
	});

	it("blocks terrain the player cannot walk on", () => {
		expect(resolveMovementAt(makeArea(), 1, 0, player)).toMatchObject({
			canMove: false,
			reason: "Blocked by Water.",
		});
	});

	it("allows a walkable overlay to override blocked terrain", () => {
		const area = makeArea({
			overlayTiles: [{ x: 1, y: 0, overlayId: "wooden_planks" }],
		});

		expect(resolveMovementAt(area, 1, 0, player).canMove).toBe(true);
	});

	it("blocks movement through structures", () => {
		const area = makeArea({
			structures: [
				{
					id: "house",
					structureId: "small_house",
					name: "House",
					x: 0,
					y: 1,
					widthTiles: 1,
					heightTiles: 1,
					blocksMovement: true,
				},
			],
		});

		expect(resolveMovementAt(area, 0, 1, player)).toMatchObject({
			canMove: false,
			reason: "Blocked by House.",
		});
	});

	it("blocks out-of-bounds movement", () => {
		expect(resolveMovementAt(makeArea(), -1, 0, player)).toMatchObject({
			canMove: false,
			reason: "Out of bounds.",
		});
	});

	it("blocks movement through NPC instances", () => {
		const area = makeArea({
			npcs: [
				{
					id: "captain",
					npcDefinitionId: "captain-definition",
					areaId: "test-area",
					x: 0,
					y: 1,
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
				},
			],
		});

		expect(resolveMovementAt(area, 0, 1, player)).toMatchObject({
			canMove: false,
			reason: "Blocked by NPC.",
		});
	});

	it("blocks movement through object instances", () => {
		const area = makeArea({
			objects: [
				{
					id: "chest",
					objectDefinitionId: "object_chest",
					areaId: "test-area",
					x: 0,
					y: 1,
					widthTiles: 2,
					heightTiles: 1,
					blocksMovement: true,
				},
			],
		});

		expect(resolveMovementAt(area, 1, 1, player)).toMatchObject({
			canMove: false,
			reason: "Blocked by object.",
		});
	});

	it("allows boat movement over configured water terrain", () => {
		expect(
			resolveMovementAt(makeArea(), 1, 0, player, { activeVehicle: boat }),
		).toMatchObject({
			canMove: true,
			movementMode: "sail",
			speedMultiplier: 1.5,
		});
	});

	it("blocks boat movement onto normal land until dismount", () => {
		expect(
			resolveMovementAt(makeArea(), 0, 1, player, { activeVehicle: boat }),
		).toMatchObject({
			canMove: false,
			reason: "Dismount before moving onto land.",
		});
	});

	it("ignores the currently boarded boat object for movement checks", () => {
		const area = makeArea({
			objects: [
				{
					id: "boat-instance",
					objectDefinitionId: "object_boat",
					areaId: "test-area",
					x: 1,
					y: 0,
					blocksMovement: true,
				},
			],
		});

		expect(
			resolveMovementAt(area, 1, 0, player, {
				activeVehicle: { ...boat, vehicleObjectInstanceId: "boat-instance" },
			}),
		).toMatchObject({ canMove: true });
	});

	it("finds a valid adjacent dismount tile", () => {
		expect(
			findDismountTile(makeArea(), { x: 1, y: 0 }, { x: 0, y: 1 }, boat),
		).toEqual({
			canDismount: true,
			x: 1,
			y: 1,
		});
	});

	it("fails dismount when no valid land is adjacent", () => {
		const waterArea = makeArea({
			terrainTiles: [
				{ x: 0, y: 0, tileId: "water" },
				{ x: 1, y: 0, tileId: "water" },
				{ x: 0, y: 1, tileId: "water" },
				{ x: 1, y: 1, tileId: "water" },
			],
		});

		expect(
			findDismountTile(waterArea, { x: 1, y: 0 }, { x: 0, y: 1 }, boat),
		).toEqual({
			canDismount: false,
			reason: "No place to dismount.",
		});
	});
});
