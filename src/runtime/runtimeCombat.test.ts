import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type { GameArea, GameProject, NPCInstance } from "../types/game";
import { findNearestInteractableTarget } from "./interactionDiscovery";
import { isNpcTileWalkable } from "./npcMovement";
import {
	attemptRuntimeCombatAttack,
	type RuntimeCombatEvent,
} from "./runtimeCombat";
import combatSource from "./runtimeCombat.ts?raw";
import {
	createRuntimeSession,
	type RuntimeSessionState,
} from "./runtimeSession";

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		id: "area",
		name: "Area",
		kind: "outdoor",
		width: 4,
		height: 4,
		tileSize: 32,
		terrainTiles: Array.from({ length: 16 }, (_, index) => ({
			x: index % 4,
			y: Math.floor(index / 4),
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
		id: "bandit",
		npcDefinitionId: "npc_bandit",
		areaId: "area",
		x: 2,
		y: 1,
		facing: "down",
		blocksMovement: true,
		movementMode: "stationary",
		attributes: {
			maxHealth: 100,
			health: 100,
			faction: "pirates",
			alignment: "hostile",
			canInteract: true,
			movementSpeed: 1,
		},
		...patch,
	};
}

function makeProject(area: GameArea): GameProject {
	const project = cloneProject(defaultProject);
	project.activeAreaId = area.id;
	project.areas = [area];
	project.npcs = [];
	project.rules = [];
	project.quests = [];
	project.gameState = { flags: {}, variables: {}, inventory: {} };
	project.player = {
		...project.player,
		combat: {
			maxHealth: 100,
			health: 100,
			attackDamage: 25,
			attackRangeTiles: 1,
			attackCooldownMs: 500,
		},
	};
	return project;
}

function makeSession(area: GameArea): RuntimeSessionState {
	const session = createRuntimeSession(makeProject(area));
	session.playerPosition = { x: 1, y: 1 };
	session.playerFacing = { x: 1, y: 0 };
	return session;
}

function makeEvents() {
	const events: RuntimeCombatEvent[] = [];
	return {
		emit: (event: RuntimeCombatEvent) => events.push(event),
		events,
	};
}

describe("runtime combat attack", () => {
	it("damages a hostile NPC in facing range", () => {
		const session = makeSession(makeArea({ npcs: [makeNpc()] }));
		const area = session.project.areas[0];
		const { emit, events } = makeEvents();

		expect(attemptRuntimeCombatAttack(session, area, 1000, emit)).toBe(true);

		expect(session.runtimeState.npcs.bandit.health).toBe(75);
		expect(session.recentEnemy).toMatchObject({
			id: "bandit",
			health: 75,
			maxHealth: 100,
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "npcDamaged",
				npcId: "bandit",
				damage: 25,
				health: 75,
			}),
		);
		expect(events).toContainEqual({
			type: "status",
			message: "Hit NPC for 25.",
		});
	});

	it("does not damage friendly NPCs", () => {
		const friend = makeNpc({
			id: "friend",
			attributes: {
				...makeNpc().attributes,
				alignment: "friendly",
			},
		});
		const session = makeSession(makeArea({ npcs: [friend] }));
		const area = session.project.areas[0];
		const { emit, events } = makeEvents();

		expect(attemptRuntimeCombatAttack(session, area, 1000, emit)).toBe(false);

		expect(session.runtimeState.npcs.friend.health).toBe(100);
		expect(events).not.toContainEqual(
			expect.objectContaining({ type: "npcDamaged" }),
		);
		expect(events).toContainEqual({
			type: "attackBlocked",
			reason: "missed",
		});
	});

	it("respects attack cooldown", () => {
		const session = makeSession(makeArea({ npcs: [makeNpc()] }));
		const area = session.project.areas[0];
		const { emit, events } = makeEvents();

		expect(attemptRuntimeCombatAttack(session, area, 1000, emit)).toBe(true);
		expect(attemptRuntimeCombatAttack(session, area, 1200, emit)).toBe(false);

		expect(session.runtimeState.npcs.bandit.health).toBe(75);
		expect(events).toContainEqual({
			type: "attackBlocked",
			reason: "cooldown",
		});
		expect(events).toContainEqual({
			type: "status",
			message: "Attack cooling down.",
		});
	});

	it("misses out-of-range targets after starting cooldown", () => {
		const session = makeSession(
			makeArea({
				npcs: [makeNpc({ x: 3, y: 1 })],
			}),
		);
		const area = session.project.areas[0];
		const { emit, events } = makeEvents();

		expect(attemptRuntimeCombatAttack(session, area, 1000, emit)).toBe(false);

		expect(session.runtimeState.npcs.bandit.health).toBe(100);
		expect(session.nextAttackAt).toBe(1500);
		expect(events).toContainEqual({
			type: "attackBlocked",
			reason: "missed",
		});
		expect(events).toContainEqual({
			type: "status",
			message: "Attack missed.",
		});
	});

	it("marks defeated NPCs, removes collision, and hides them from discovery", () => {
		const npc = makeNpc({
			attributes: { ...makeNpc().attributes, health: 20 },
			interaction: {
				type: "set_flag",
				activationMode: "on_interact",
				flag: "talked_to_bandit",
				value: true,
			},
		});
		const session = makeSession(makeArea({ npcs: [npc] }));
		const area = session.project.areas[0];
		const { emit, events } = makeEvents();

		expect(
			findNearestInteractableTarget({
				project: session.project,
				area,
				playerPosition: session.playerPosition,
				runtimeState: session.runtimeState,
				defeatedNpcIds: session.defeatedNpcIds,
			})?.id,
		).toBe("bandit");

		expect(attemptRuntimeCombatAttack(session, area, 1000, emit)).toBe(true);

		expect(session.defeatedNpcIds.has("bandit")).toBe(true);
		expect(session.runtimeState.flags.npc_defeated_bandit).toBe(true);
		expect(area.npcs).toHaveLength(0);
		expect(isNpcTileWalkable(area, "other", 2, 1)).toBe(true);
		expect(
			findNearestInteractableTarget({
				project: session.project,
				area,
				playerPosition: session.playerPosition,
				runtimeState: session.runtimeState,
				defeatedNpcIds: session.defeatedNpcIds,
			}),
		).toBeNull();
		expect(events).toContainEqual({
			type: "npcDefeated",
			npcId: "bandit",
			name: "NPC",
		});
		expect(events).toContainEqual({
			type: "flagChanged",
			flag: "npc_defeated_bandit",
			value: true,
		});
		expect(events).toContainEqual({
			type: "npcRemoved",
			npcId: "bandit",
		});
		expect(events).not.toContainEqual(
			expect.objectContaining({ type: "triggerRequested" }),
		);
	});

	it("clears NPC movement and contact state on defeat", () => {
		const npc = makeNpc({
			attributes: { ...makeNpc().attributes, health: 20 },
		});
		const session = makeSession(makeArea({ npcs: [npc] }));
		const area = session.project.areas[0];
		session.npcMovementStates.set("bandit", {
			movement: { patrolIndex: 0 },
			nextMoveAt: 1234,
		});
		session.enemyContactCooldowns.set("bandit", 2000);
		const { emit } = makeEvents();

		attemptRuntimeCombatAttack(session, area, 1000, emit);

		expect(session.npcMovementStates.has("bandit")).toBe(false);
		expect(session.enemyContactCooldowns.has("bandit")).toBe(false);
	});

	it("does not import renderer or editor modules", () => {
		expect(combatSource).not.toMatch(
			/from\s+["'][^"']*(phaser|three|react|editor|store)/i,
		);
	});
});
