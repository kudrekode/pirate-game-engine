import { describe, expect, it } from "vitest";
import chapterOne from "../../hollow-kingdom-chapter-one.project.json";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { importProjectJson } from "../data/projectImport";
import type {
	EnemyAttack,
	GameArea,
	GameProject,
	NPCInstance,
} from "../types/game";
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

const bite: EnemyAttack = {
	label: "a bite",
	damage: 12,
	rangeTiles: 2.5,
	arcDegrees: 60,
	windupMs: 300,
	impactMs: 120,
	recoveryMs: 500,
	windupClip: "BiteWindup",
	strikeClip: "Bite",
};

const sweep: EnemyAttack = {
	...bite,
	label: "a sweep",
	damage: 18,
	arcDegrees: 360,
	windupClip: "SweepWindup",
	strikeClip: "Sweep",
};

function encounter(areaPatch: Partial<GameArea> = {}) {
	const enemy = makeEnemy();
	enemy.enemyBehaviour = { ...enemy.enemyBehaviour!, attacks: [bite, sweep] };
	const session = makeSession(makeArea({ npcs: [enemy], ...areaPatch }));
	const area = session.project.areas[0];
	const { emit, events } = makeEvents();
	session.playerPosition = { x: 2, y: 1 };
	makeDue(session, enemy.id);
	return {
		session,
		area,
		events,
		tick: (time: number) => tickRuntimeNpcs(session, area, time, emit),
	};
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
		expect(events).toContainEqual({
			type: "enemyTouchedPlayer",
			npcId: "enemy",
		});
		expect(events.some(({ type }) => type === "enemyAttackWindup")).toBe(false);
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
		expect(events.slice(-5).map(({ type }) => type)).toEqual([
			"playerDamaged",
			"status",
			"gameOver",
			"stateChanged",
			"combatChanged",
		]);
	});

	it("telegraphs, strikes, damages once at impact, and cycles after recovery", () => {
		const { session, area, events, tick } = encounter();
		const startingHealth = session.runtimePlayerHealth;
		tick(1000);
		expect(events).toContainEqual({
			type: "enemyAttackWindup",
			npcId: "enemy",
			clip: "BiteWindup",
			durationMs: 300,
			direction: { x: 1, y: 0 },
		});
		tick(1299);
		expect(events.some(({ type }) => type === "enemyAttackStrike")).toBe(false);
		tick(1300);
		expect(events).toContainEqual({
			type: "enemyAttackStrike",
			npcId: "enemy",
			clip: "Bite",
		});
		tick(1419);
		expect(session.runtimePlayerHealth).toBe(startingHealth);
		tick(1420);
		tick(1600);
		expect(events.filter(({ type }) => type === "playerDamaged")).toEqual([
			{
				type: "playerDamaged",
				npcId: "enemy",
				damage: 12,
				health: startingHealth - 12,
				patterned: true,
			},
		]);
		expect(events.some(({ type }) => type === "enemyTouchedPlayer")).toBe(
			false,
		);
		tick(1919);
		expect(area.npcs[0]).toMatchObject({ x: 1, y: 1 });
		expect(
			events.filter(({ type }) => type === "enemyAttackWindup"),
		).toHaveLength(1);
		tick(1920);
		makeDue(session, "enemy");
		tick(1921);
		tick(2221);
		tick(2341);
		expect(events).toContainEqual({
			type: "enemyAttackStrike",
			npcId: "enemy",
			clip: "Sweep",
		});
		expect(session.runtimePlayerHealth).toBe(startingHealth - 12 - 18);
	});

	it.each([
		{ label: "outside the locked arc", position: { x: 1, y: 2 } },
		{ label: "beyond maximum reach", position: { x: 4, y: 1 } },
		{ label: "behind a solid object", position: { x: 3, y: 1 }, blocked: true },
	])("lets the player evade by moving $label during windup", ({
		position,
		blocked,
	}) => {
		const { session, area, events, tick } = encounter();
		const startingHealth = session.runtimePlayerHealth;
		tick(1000);
		session.playerPosition = position;
		if (blocked)
			area.objects.push({
				id: "cover",
				objectDefinitionId: "wall",
				areaId: area.id,
				x: 2,
				y: 1,
				blocksMovement: true,
			});
		tick(1300);
		tick(1420);
		expect(session.runtimePlayerHealth).toBe(startingHealth);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "status",
				message: expect.stringMatching(/bite misses/),
			}),
		);
	});

	it("cancels a pending strike when the NPC becomes neutral", () => {
		const { session, events, tick } = encounter();
		tick(1000);
		session.runtimeState.npcs.enemy.alignment = "neutral";
		tick(1300);
		tick(1420);
		expect(session.enemyAttacks.has("enemy")).toBe(false);
		expect(
			events.some(
				({ type }) => type === "enemyAttackStrike" || type === "playerDamaged",
			),
		).toBe(false);
	});

	it("authored Ashling reuses the Mere Wyrm rig and runs a shorter, single-pattern attack", () => {
		const project = importProjectJson(JSON.stringify(chapterOne));
		function playAttack(id: "mere-wyrm" | "ashling") {
			const session = createRuntimeSession(project);
			const area = session.project.areas.find((area) =>
				area.npcs.some((npc) => npc.id === id),
			)!;
			const npc = area.npcs.find((npc) => npc.id === id)!;
			const definition = project.npcs.find((entry) => entry.id === id)!;
			const attacks = definition.defaultEnemyBehaviour?.attacks;
			if (!attacks) throw new Error(`Missing attacks for ${id}`);
			session.currentAreaId = area.id;
			session.playerPosition = { x: npc.x, y: npc.y + 1 };
			session.runtimeState.npcs[id].alignment = "hostile";
			const { emit, events } = makeEvents();
			makeDue(session, id);
			tickRuntimeNpcs(session, area, 1000, emit);
			const woundUp = 1000 + attacks[0].windupMs;
			tickRuntimeNpcs(session, area, woundUp, emit);
			tickRuntimeNpcs(session, area, woundUp + attacks[0].impactMs, emit);
			return { definition, attacks, events };
		}

		const wyrm = playAttack("mere-wyrm");
		const ashling = playAttack("ashling");
		expect(ashling.definition.threeVisual?.assetId).toBe(
			wyrm.definition.threeVisual?.assetId,
		);
		expect(wyrm.attacks.map(({ strikeClip }) => strikeClip)).toEqual([
			"Bite",
			"Sweep",
		]);
		expect(ashling.attacks.map(({ strikeClip }) => strikeClip)).toEqual([
			"Bite",
		]);
		expect(ashling.attacks[0].rangeTiles).toBeLessThan(
			wyrm.attacks[0].rangeTiles,
		);
		expect(ashling.events).toContainEqual(
			expect.objectContaining({
				type: "enemyAttackWindup",
				npcId: "ashling",
				durationMs: 420,
			}),
		);
		expect(ashling.events).toContainEqual(
			expect.objectContaining({
				type: "playerDamaged",
				npcId: "ashling",
				damage: 6,
			}),
		);
		expect(wyrm.events).toContainEqual(
			expect.objectContaining({
				type: "enemyAttackWindup",
				npcId: "mere-wyrm",
				durationMs: 820,
			}),
		);
		expect(wyrm.events).toContainEqual(
			expect.objectContaining({
				type: "playerDamaged",
				npcId: "mere-wyrm",
				damage: 12,
			}),
		);
	});

	it("does not import renderer or editor modules", () => {
		expect(npcTickSource).not.toMatch(
			/from\s+["'][^"']*(phaser|three|react|editor|store)/i,
		);
	});
});
