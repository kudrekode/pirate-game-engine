import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type { GameArea, GameProject, NPCInstance } from "../types/game";
import { type RuntimeNpcTickEvent, tickRuntimeNpcs } from "./runtimeNpcTick";
import npcTickSource from "./runtimeNpcTick.ts?raw";
import {
	createRuntimeSession,
	type RuntimeSessionState,
} from "./runtimeSession";

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		id: "area",
		name: "Area",
		kind: "outdoor",
		width: 5,
		height: 5,
		tileSize: 32,
		terrainTiles: Array.from({ length: 25 }, (_, index) => ({
			x: index % 5,
			y: Math.floor(index / 5),
			tileId: "grass",
		})),
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
		id: "npc",
		npcDefinitionId: "definition",
		areaId: "area",
		x: 1,
		y: 1,
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

function makeEnemy(patch: Partial<NPCInstance> = {}): NPCInstance {
	return makeNpc({
		id: "enemy",
		attributes: {
			...makeNpc().attributes,
			alignment: "hostile",
		},
		enemyBehaviour: {
			enabled: true,
			detectionRadiusTiles: 4,
			chaseRadiusTiles: 7,
			returnToOrigin: true,
			contactDamage: 10,
		},
		...patch,
	});
}

function makeProject(area: GameArea): GameProject {
	const project = cloneProject(defaultProject);
	project.activeAreaId = area.id;
	project.areas = [area];
	project.npcs = [];
	project.rules = [];
	project.gameState = { flags: {}, variables: {}, inventory: {} };
	return project;
}

function makeSession(area: GameArea): RuntimeSessionState {
	return createRuntimeSession(makeProject(area));
}

function makeEvents() {
	const events: RuntimeNpcTickEvent[] = [];
	return {
		emit: (event: RuntimeNpcTickEvent) => events.push(event),
		events,
	};
}

function makeDue(session: RuntimeSessionState, npcId: string): void {
	session.npcMovementStates.set(npcId, {
		movement: { patrolIndex: 0 },
		nextMoveAt: 0,
	});
}

describe("runtime NPC tick", () => {
	it("keeps stationary NPCs in place", () => {
		const area = makeArea({ npcs: [makeNpc()] });
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		makeDue(session, "npc");
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(runtimeArea.npcs[0]).toMatchObject({ x: 1, y: 1, facing: "down" });
		expect(events.some((event) => event.type === "npcMoved")).toBe(false);
	});

	it("advances patrol NPCs", () => {
		const area = makeArea({
			npcs: [
				makeNpc({
					movementMode: "patrol",
					patrolPath: {
						loop: false,
						points: [
							{ x: 1, y: 1 },
							{ x: 3, y: 1 },
						],
					},
				}),
			],
		});
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		makeDue(session, "npc");
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(runtimeArea.npcs[0]).toMatchObject({ x: 2, y: 1, facing: "right" });
		expect(events).toContainEqual(
			expect.objectContaining({ type: "npcMoved", npcId: "npc" }),
		);
	});

	it("moves wander NPCs toward deterministic destinations", () => {
		const area = makeArea({
			npcs: [
				makeNpc({
					movementMode: "wander",
					wanderZone: { x: 3, y: 1, width: 1, height: 1 },
				}),
			],
		});
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		makeDue(session, "npc");
		const { emit } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit, { random: () => 0 });

		expect(runtimeArea.npcs[0]).toMatchObject({ x: 2, y: 1, facing: "right" });
	});

	it("detects and chases the player with hostile NPCs", () => {
		const area = makeArea({ npcs: [makeEnemy()] });
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 3, y: 1 };
		makeDue(session, "enemy");
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(runtimeArea.npcs[0]).toMatchObject({ x: 2, y: 1, facing: "right" });
		expect(events).toContainEqual({
			type: "enemyDetectedPlayer",
			npcId: "enemy",
		});
	});

	it("loses the player and returns toward origin", () => {
		const area = makeArea({
			npcs: [
				makeEnemy({
					x: 3,
					y: 1,
					enemyBehaviour: {
						enabled: true,
						detectionRadiusTiles: 2,
						chaseRadiusTiles: 3,
						returnToOrigin: true,
						contactDamage: 10,
					},
				}),
			],
		});
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 8, y: 1 };
		session.enemyOrigins.set("enemy", { x: 1, y: 1 });
		session.npcMovementStates.set("enemy", {
			movement: { patrolIndex: 0, enemyChasing: true },
			nextMoveAt: 0,
		});
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(runtimeArea.npcs[0]).toMatchObject({ x: 2, y: 1, facing: "left" });
		expect(events).toContainEqual({
			type: "enemyLostPlayer",
			npcId: "enemy",
		});
	});

	it("handles blocked NPC movement without crashing", () => {
		const area = makeArea({
			npcs: [
				makeNpc({
					movementMode: "patrol",
					patrolPath: {
						loop: false,
						points: [
							{ x: 1, y: 1 },
							{ x: 2, y: 1 },
						],
					},
				}),
			],
		});
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 2, y: 1 };
		makeDue(session, "npc");
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(runtimeArea.npcs[0]).toMatchObject({ x: 1, y: 1 });
		expect(events).toContainEqual(
			expect.objectContaining({ type: "npcBlocked", npcId: "npc" }),
		);
	});

	it("applies enemy contact damage", () => {
		const area = makeArea({ npcs: [makeEnemy()] });
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 1, y: 2 };
		makeDue(session, "enemy");
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(session.runtimePlayerHealth).toBe(session.playerCombat.health - 10);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "playerDamaged",
				npcId: "enemy",
				damage: 10,
			}),
		);
	});

	it("respects enemy contact cooldown", () => {
		const area = makeArea({ npcs: [makeEnemy()] });
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 1, y: 2 };
		makeDue(session, "enemy");
		const { emit } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);
		const healthAfterFirstTouch = session.runtimePlayerHealth;
		makeDue(session, "enemy");
		tickRuntimeNpcs(session, runtimeArea, 1500, emit);

		expect(session.runtimePlayerHealth).toBe(healthAfterFirstTouch);
	});

	it("emits game over when contact damage defeats the player", () => {
		const area = makeArea({ npcs: [makeEnemy()] });
		const session = makeSession(area);
		const runtimeArea = session.project.areas[0];
		session.playerPosition = { x: 1, y: 2 };
		session.runtimePlayerHealth = 5;
		makeDue(session, "enemy");
		const { emit, events } = makeEvents();

		tickRuntimeNpcs(session, runtimeArea, 1000, emit);

		expect(session.runtimePlayerHealth).toBe(0);
		expect(events).toContainEqual({ type: "gameOver" });
	});

	it("does not import renderer or editor modules", () => {
		expect(npcTickSource).not.toMatch(
			/from\s+["'][^"']*(phaser|three|react|editor|store)/i,
		);
	});
});
