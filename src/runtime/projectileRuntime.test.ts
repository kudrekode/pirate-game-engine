import { describe, expect, it } from "vitest";
import demo from "../../melee-weapon-v1-demo.project.json";
import { BOW, BOW_ITEM } from "../data/bow";
import { migrateProject } from "../data/migrateProject";
import { createGameSave, parseGameSave, restoreGameSave } from "./gameSave";
import {
	advanceRuntimeProjectiles,
	attemptRuntimeBowAttack,
	type BowAim,
	projectileBoxFraction,
	resolveBowAimPoint,
	traceProjectile,
} from "./projectileRuntime";
import { createRuntimeQuestState } from "./questEngine";
import {
	attemptRuntimeCombatAttack,
	type RuntimeCombatEvent,
} from "./runtimeCombat";
import { collectRuntimeObjectPickup } from "./runtimeObjectInteractions";
import { createRuntimeSession } from "./runtimeSession";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	type TraversalSolid,
} from "./traversal";
import { equipRuntimeWeapon, getEquippedWeapon } from "./weaponRuntime";

const aim: BowAim = {
	origin: { x: 0, y: 1.25, z: 8 },
	direction: { x: 1, y: 0, z: 0 },
};
const spawn = {
	body: { x: 3, y: 1.25, z: 8 },
	muzzle: { x: 3.45, y: 1.25, z: 8 },
};
const wall: TraversalSolid = {
	id: "wall",
	center: [5, 1, 8],
	half: [0.025, 1, 1],
	axes: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
};
function setup(enemyX?: number) {
	const project = migrateProject(demo);
	project.items.push({ ...BOW_ITEM });
	const session = createRuntimeSession(project),
		area = session.project.areas[0];
	area.objects = [];
	area.structures = [];
	area.npcs =
		enemyX === undefined
			? []
			: [
					{
						...area.npcs.find((n) => n.id === "sparring_guard")!,
						x: enemyX,
						y: 8,
					},
				];
	session.playerPosition = { x: 3, y: 8 };
	session.runtimeState.inventory.items.bow = 1;
	equipRuntimeWeapon(session, "bow");
	const world = createTraversalWorld(session.project, area);
	const events: RuntimeCombatEvent[] = [],
		emit = (event: RuntimeCombatEvent) => {
			events.push(event);
		};
	const fire = (time = 0, ray = aim) =>
		attemptRuntimeBowAttack(session, time, ray, emit);
	const advance = (ms: number, source = spawn, blocked = false) =>
		advanceRuntimeProjectiles(session, area, world, ms, source, emit, blocked);
	return { project, session, area, world, events, emit, fire, advance };
}

describe("one shared bow projectile loop", () => {
	it("migrates only explicit bow references and collects/equips via ordinary inventory", () => {
		const project = migrateProject(demo);
		project.items.push({ ...BOW_ITEM });
		const pickup = structuredClone(
			project.areas[0].objects.find((o) => o.id === "sword-pickup")!,
		);
		pickup.id = "bow-pickup";
		pickup.objectDefinitionId = "bow-pickup";
		const definition = structuredClone(
			project.objects.find((o) => o.id === "sword-pickup")!,
		);
		definition.id = "bow-pickup";
		if (definition.defaultInteraction?.type === "collect_item")
			definition.defaultInteraction.itemId = "bow";
		project.objects.push(definition);
		project.areas[0].objects.push(pickup);
		const before = JSON.stringify(project),
			session = createRuntimeSession(project);
		expect(equipRuntimeWeapon(session, "bow")).toBe(false);
		expect(collectRuntimeObjectPickup(session, "bow-pickup", () => {})).toBe(
			true,
		);
		expect(collectRuntimeObjectPickup(session, "bow-pickup", () => {})).toBe(
			false,
		);
		expect(session.runtimeState.inventory.items.bow).toBe(1);
		expect(equipRuntimeWeapon(session, "bow")).toBe(true);
		expect(getEquippedWeapon(session)).toBe(BOW);
		expect(equipRuntimeWeapon(session, undefined)).toBe(true);
		expect(getEquippedWeapon(session)).toBeUndefined();
		expect(JSON.stringify(project)).toBe(before);
		expect(migrateProject(demo).items.some((i) => i.weapon === "bow")).toBe(
			false,
		);
		project.items[project.items.length - 1].weapon = "unknown" as "bow";
		expect(
			migrateProject(project).items[project.items.length - 1]?.weapon,
		).toBeUndefined();
	});
	it("selects Bow without adjacent melee damage, emits once and retains cooldown across switches", () => {
		const s = setup(4),
			health = s.session.runtimeState.npcs[s.area.npcs[0].id].health;
		expect(attemptRuntimeCombatAttack(s.session, s.area, 0, s.emit)).toBe(
			false,
		);
		expect(s.fire()).toBe(true);
		expect(s.session.nextAttackAt).toBe(1000);
		expect(s.fire(999)).toBe(false);
		expect(s.events.filter((e) => e.type === "attackStarted")).toEqual([
			{ type: "attackStarted", weapon: "bow", nextAttackAt: 1000 },
		]);
		expect(s.session.runtimeState.npcs[s.area.npcs[0].id].health).toBe(health);
		s.session.runtimeState.inventory.items.sword = 1;
		expect(equipRuntimeWeapon(s.session, "sword")).toBe(false);
		s.advance(300);
		expect(equipRuntimeWeapon(s.session, "sword")).toBe(true);
		expect(attemptRuntimeCombatAttack(s.session, s.area, 999, s.emit)).toBe(
			false,
		);
		expect(getEquippedWeapon(s.session)?.id).toBe("sword");
		equipRuntimeWeapon(s.session, undefined);
		expect(getEquippedWeapon(s.session)).toBeUndefined();
	});
	it("spawns exactly one arrow at the explicit release boundary and advances the remaining frame time", () => {
		const s = setup();
		s.fire();
		s.advance(299);
		expect(s.session.projectiles?.arrows).toHaveLength(0);
		s.advance(101);
		expect(s.session.projectiles?.spawned).toBe(1);
		expect(s.session.projectiles?.arrows[0].position.x).toBeCloseTo(
			spawn.muzzle.x + 2.8,
		);
		s.advance(100);
		expect(s.session.projectiles?.spawned).toBe(1);
	});
	it("is deterministic across frame partitions", () => {
		const a = setup(),
			b = setup();
		a.fire();
		b.fire();
		a.advance(800);
		for (let i = 0; i < 80; i++) b.advance(10);
		expect(a.session.projectiles?.arrows[0].position.x).toBeCloseTo(
			b.session.projectiles!.arrows[0].position.x,
			10,
		);
	});
	it("sweeps a fast arrow through a thin world wall without damaging the target behind it", () => {
		const s = setup(9);
		s.world.solids.push(wall);
		s.fire();
		s.advance(1000);
		expect(s.session.projectiles?.arrows).toHaveLength(0);
		expect(s.session.projectiles?.lastImpact).toMatchObject({
			kind: "world",
			id: "wall",
		});
		expect(s.events.some((e) => e.type === "npcDamaged")).toBe(false);
	});
	it("hits only the nearest enemy once and reuses Hit, Death, flags and quests", () => {
		const s = setup(8),
			first = s.area.npcs[0];
		s.area.npcs.push({ ...first, id: "far", x: 12 });
		s.session.runtimeState.npcs[first.id].health = 64;
		s.fire();
		s.advance(700);
		expect(s.events.filter((e) => e.type === "npcDamaged")).toMatchObject([
			{ npcId: first.id, damage: 32, health: 32 },
		]);
		s.advance(1000);
		expect(s.events.filter((e) => e.type === "npcDamaged")).toHaveLength(1);
		s.fire(1000);
		s.advance(700);
		expect(s.events).toContainEqual({
			type: "npcDefeated",
			npcId: first.id,
			name: first.nameOverride,
		});
		expect(s.session.defeatedNpcIds.has(first.id)).toBe(true);
		expect(s.session.runtimeState.flags[`npc_defeated_${first.id}`]).toBe(true);
		expect(s.area.npcs.map((n) => n.id)).toEqual(["far"]);
		expect(s.events.some((e) => e.type === "questsChanged")).toBe(true);
		expect(s.session.projectiles?.removed).toBe(2);
	});
	it.each([4.5, 12, 25])("corrects camera/bow parallax at %s metres", (x) => {
		const s = setup(x),
			ray = {
				origin: { x: 0, y: 1.25, z: 8 },
				direction: { x: 1, y: 0, z: 0 },
			};
		const point = resolveBowAimPoint(s.session, s.area, s.world, ray);
		expect(point.x).toBeCloseTo(x - 0.32);
		s.fire(0, ray);
		s.advance(2000, { ...spawn, muzzle: { x: 3.45, y: 1.12, z: 8.28 } });
		expect(s.events.filter((e) => e.type === "npcDamaged")).toHaveLength(1);
	});
	it("checks body-to-muzzle obstruction even when the camera can see around the wall", () => {
		const s = setup(8);
		s.world.solids.push({
			...wall,
			center: [3.22, 1, 8],
			half: [0.02, 1, 0.2],
		});
		s.fire(0, {
			origin: { x: 3, y: 1.25, z: 7 },
			direction: { x: 1, y: 0, z: 0 },
		});
		s.advance(300);
		expect(s.session.projectiles?.spawned).toBe(1);
		expect(s.session.projectiles?.removed).toBe(1);
		expect(s.session.projectiles?.lastImpact).toMatchObject({
			kind: "world",
			id: "wall",
		});
		expect(s.events.some((e) => e.type === "npcDamaged")).toBe(false);
	});
	it("handles rotated boxes and origins inside solids", () => {
		const box = {
			...wall,
			axes: [
				[Math.SQRT1_2, 0, Math.SQRT1_2],
				[0, 1, 0],
				[-Math.SQRT1_2, 0, Math.SQRT1_2],
			] as TraversalSolid["axes"],
		};
		expect(
			projectileBoxFraction({ x: 3, y: 1, z: 8 }, { x: 7, y: 1, z: 8 }, box),
		).toBeLessThan(0.5);
		expect(
			projectileBoxFraction({ x: 5, y: 1, z: 8 }, { x: 7, y: 1, z: 8 }, box),
		).toBe(0);
	});
	it("collides with legacy footprints, terrain and existing elevated floor surfaces", () => {
		const s = setup();
		s.area.objects.push({
			...migrateProject(demo).areas[0].objects[0],
			id: "legacy",
			x: 7,
			y: 8,
			blocksMovement: true,
		});
		expect(
			traceProjectile(s.session, s.area, s.world, spawn.body, {
				x: 12,
				y: 1.25,
				z: 8,
			}),
		).toMatchObject({ id: "legacy" });
		s.area.objects = [];
		expect(
			traceProjectile(s.session, s.area, s.world, spawn.body, {
				x: 6,
				y: -1,
				z: 8,
			}),
		).toMatchObject({ id: "terrain" });
		s.world.floors.push({
			id: "platform",
			corners: [
				[4, 1, 7],
				[6, 1, 7],
				[6, 1, 9],
				[4, 1, 9],
			],
			normal: [0, 1, 0],
		});
		expect(
			traceProjectile(
				s.session,
				s.area,
				s.world,
				{ x: 5, y: 2, z: 8 },
				{ x: 5, y: 0.5, z: 8 },
			),
		).toMatchObject({ id: "platform" });
	});
	it("expires a miss by range, and independently by lifetime", () => {
		const s = setup();
		s.fire();
		s.advance(300);
		s.advance(2000);
		expect(s.session.projectiles?.arrows).toHaveLength(0);
		expect(s.session.projectiles?.lastImpact?.kind).toBe("expired");
		s.fire(2000);
		s.advance(300);
		s.session.projectiles!.arrows[0].speed = 1;
		s.advance(2000);
		expect(s.session.projectiles?.arrows).toHaveLength(0);
		expect(s.session.projectiles?.removed).toBe(2);
	});
	it("rejects airborne, dead, modal and invalid aim attacks", () => {
		const s = setup();
		s.session.traversal = createRuntimeTraversal(
			s.world,
			s.area,
			s.session.project,
			s.session.playerPosition,
		);
		s.session.traversal.motion.phase = "jump";
		expect(s.fire()).toBe(false);
		s.session.traversal.motion.phase = "grounded";
		s.session.runtimePlayerHealth = 0;
		expect(s.fire()).toBe(false);
		s.session.runtimePlayerHealth = 100;
		s.session.startupPending = true;
		expect(s.fire()).toBe(false);
		s.session.startupPending = false;
		expect(s.fire(0, { ...aim, direction: { x: 0, y: 0, z: 0 } })).toBe(false);
		expect(s.session.nextAttackAt).toBe(0);
	});
	it("saves owned equipped Bow but never arrows, queued release or animation clocks", () => {
		const s = setup();
		s.fire();
		s.advance(300);
		const save = createGameSave(s.project, s.session),
			json = JSON.stringify(save);
		expect(json).not.toMatch(
			/projectiles|remainingMs|sourceActor|nextAttackAt/,
		);
		expect(save.player.equippedWeaponId).toBe("bow");
		const restored = restoreGameSave(s.project, parseGameSave(json, s.project));
		expect(getEquippedWeapon(restored)).toBe(BOW);
		expect(restored.projectiles).toBeUndefined();
		expect(restored.nextAttackAt).toBe(0);
	});
	it("clears projectiles on area change or player death", () => {
		const s = setup();
		s.fire();
		s.advance(300);
		s.area.id = "other";
		s.advance(10);
		expect(s.session.projectiles).toBeUndefined();
		const t = setup();
		t.fire();
		t.advance(300);
		t.session.runtimePlayerHealth = 0;
		t.advance(10);
		expect(t.session.projectiles).toBeUndefined();
	});
	it("pauses a pending release for menus without duplicate shots or an equipment change", () => {
		const s = setup();
		s.fire();
		s.advance(200);
		s.advance(2000, spawn, true);
		expect(s.session.projectiles?.spawned).toBe(0);
		expect(equipRuntimeWeapon(s.session, undefined)).toBe(false);
		s.advance(100);
		expect(s.session.projectiles?.spawned).toBe(1);
		expect(s.session.projectiles?.pending).toBeUndefined();
		expect(equipRuntimeWeapon(s.session, undefined)).toBe(true);
	});
	it("awards the existing defeat quest reward exactly once and preserves it through Continue", () => {
		const s = setup(8),
			npc = s.area.npcs[0];
		s.project.quests = [
			{
				id: "range",
				name: "Range practice",
				status: "active",
				objectiveMode: "sequence",
				objectives: [
					{
						id: "target",
						description: "Defeat target",
						condition: {
							type: "flag",
							flag: `npc_defeated_${npc.id}`,
							value: true,
						},
					},
				],
				rewards: [{ type: "item", itemId: "gold_coin", quantity: 1 }],
			},
		];
		s.session.runtimeQuestState = createRuntimeQuestState(s.project.quests);
		s.session.runtimeState.npcs[npc.id].health = 32;
		s.fire();
		s.advance(1000);
		s.advance(1000);
		expect(s.session.runtimeQuestState.quests[0].status).toBe("completed");
		expect(s.session.runtimeState.inventory.items.gold_coin).toBe(1);
		const restored = restoreGameSave(
			s.project,
			createGameSave(s.project, s.session),
		);
		expect(restored.runtimeState.inventory.items.gold_coin).toBe(1);
		expect(restored.runtimeQuestState.quests[0].status).toBe("completed");
	});
	it("bounds simultaneous arrows naturally and drains after sustained fire", () => {
		const s = setup();
		let peak = 0;
		for (let shot = 0; shot < 30; shot++) {
			expect(s.fire(shot * 1000)).toBe(true);
			for (let step = 0; step < 10; step++) {
				s.advance(100);
				peak = Math.max(peak, s.session.projectiles!.arrows.length);
			}
		}
		expect(peak).toBeLessThanOrEqual(2);
		s.advance(2000);
		expect(s.session.projectiles?.spawned).toBe(30);
		expect(s.session.projectiles?.removed).toBe(30);
		expect(s.session.projectiles?.arrows).toHaveLength(0);
	});
});
