// @ts-expect-error Root-node owns these fixture reads; the browser tsconfig omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import arena from "../../hollow-kingdom-combat-arena.project.json";
import { importProjectJson } from "../data/projectImport";
import { createGameSave, restoreGameSave } from "./gameSave";
import { advanceRuntimeProjectiles } from "./projectileRuntime";
import {
	advanceRuntimeMelee,
	attemptRuntimeCombatAttack,
} from "./runtimeCombat";
import { type RuntimeNpcTickEvent, tickRuntimeNpcs } from "./runtimeNpcTick";
import { createRuntimeSession } from "./runtimeSession";
import { createTraversalWorld, sweepTraversal } from "./traversal";
import { advanceHeldGuard, raiseGuard, releaseGuard } from "./weaponRuntime";

const project = importProjectJson(JSON.stringify(arena));
function fixture(id = "blade") {
	const session = createRuntimeSession(project),
		area = session.project.areas.find((a) => a.id === id);
	if (!area) throw Error(`Missing fixture ${id}`);
	const npc = area.npcs[0];
	session.currentAreaId = id;
	session.equippedWeaponId = "quay-blade";
	session.playerPosition = { x: npc.x, y: npc.y - 1 };
	session.playerFacing = { x: 0, y: 1 };
	session.npcMovementStates.set(npc.id, {
		movement: { patrolIndex: 0 },
		nextMoveAt: 0,
	});
	const events: RuntimeNpcTickEvent[] = [];
	const emit = (event: RuntimeNpcTickEvent) => events.push(event);
	const tick = (t: number) => tickRuntimeNpcs(session, area, t, emit);
	return { session, area, npc, events, emit, tick };
}
describe("authored combat encounters", () => {
	it.each([
		"hollow-kingdom-chapter-one",
		"merewatch-field-study",
		"merewatch-frontier",
		"merewatch-vale",
	])("continues a legacy %s project with its original health and area", (name) => {
		const legacy = importProjectJson(
			readFileSync(
				new URL(`../../${name}.project.json`, import.meta.url),
				"utf8",
			),
		);
		const live = createRuntimeSession(legacy);
		const originalHealth = live.runtimePlayerHealth;
		live.runtimePlayerHealth -= 1;
		const resumed = restoreGameSave(legacy, createGameSave(legacy, live));
		expect(resumed.currentAreaId).toBe(live.currentAreaId);
		expect(resumed.runtimePlayerHealth).toBe(originalHealth - 1);
		expect(legacy.areas.every((a) => a.encounter === undefined)).toBe(true);
		expect(createRuntimeSession(legacy).runtimePlayerHealth).toBe(
			originalHealth,
		);
	});
	it("preserves optional definitions through export/import and clamps unsafe times", () => {
		const again = importProjectJson(JSON.stringify(project));
		expect(again.areas[0].encounter).toEqual(arena.areas[0].encounter);
		expect(
			again.npcs.find((n) => n.id === "bow-opponent")?.defaultEnemyBehaviour,
		).toMatchObject({
			keepDistanceTiles: 4.2,
			attacks: [{ arrowSpeed: 10 }],
		});
		expect(again.items[0].melee).toEqual(project.items[0].melee);
		const input = structuredClone(arena);
		const profile = input.items[0].melee;
		if (!profile) throw Error("Missing blade profile");
		profile.cooldownMs = 2;
		expect(
			importProjectJson(JSON.stringify(input)).items[0].melee?.cooldownMs,
		).toBe(profile.impactMs);
	});
	it("substitutes the second opponent and blade using their authored profiles", () => {
		const guard = fixture("guard");
		guard.tick(0);
		const events: string[] = [];
		const swing = () =>
			attemptRuntimeCombatAttack(guard.session, guard.area, 5, () => {});
		expect(swing()).toBe(true);
		advanceRuntimeMelee(guard.session, guard.area, 220, (e) => {
			if (e.type === "status") events.push(e.message);
		});
		expect(events).toContain("Edric, keeper of the gate blocks your blade.");
		expect(guard.session.runtimeState.npcs[guard.npc.id].health).toBe(84);
		const heavy = fixture("falchion");
		heavy.session.equippedWeaponId = heavy.area.encounter?.weaponItemId;
		attemptRuntimeCombatAttack(heavy.session, heavy.area, 0, () => {});
		advanceRuntimeMelee(heavy.session, heavy.area, 324, () => {});
		expect(heavy.session.runtimeState.npcs[heavy.npc.id].health).toBe(84);
		advanceRuntimeMelee(heavy.session, heavy.area, 325, () => {});
		expect(heavy.session.runtimeState.npcs[heavy.npc.id].health).toBe(50);
	});
	it("samples reach at the delayed impact and only consumes a swing once", () => {
		const { session, area, npc } = fixture();
		const health = session.runtimeState.npcs[npc.id].health;
		const emit = () => {};
		expect(attemptRuntimeCombatAttack(session, area, 10, emit)).toBe(true);
		advanceRuntimeMelee(session, area, 224, emit);
		expect(session.runtimeState.npcs[npc.id].health).toBe(health);
		npc.x += 2;
		advanceRuntimeMelee(session, area, 225, emit);
		expect(session.runtimeState.npcs[npc.id].health).toBe(health);
		advanceRuntimeMelee(session, area, 299, emit);
		npc.x -= 2;
		attemptRuntimeCombatAttack(session, area, 1200, emit);
		advanceRuntimeMelee(session, area, 1415, emit);
		advanceRuntimeMelee(session, area, 1416, emit);
		expect(session.runtimeState.npcs[npc.id].health).toBe(health - 22);
	});
	it.each([
		[100, "Blocked."],
		[500, "Parry!"],
	])("resolves directional guard raised at %i ms", (time, msg) => {
		const { session, tick, npc, events } = fixture();
		tick(0);
		tick(410);
		expect(raiseGuard(session, Number(time))).toBe(true);
		tick(570);
		expect(session.runtimePlayerHealth).toBe(112);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "status",
				message: expect.stringContaining(String(msg)),
			}),
		);
		if (msg === "Parry!")
			expect(session.enemyAttacks.get(npc.id)?.staggerUntil).toBe(1470);
	});
	it("a rear hit breaks the swing and a fresh session restores neither guard nor windup", () => {
		const { session, area, tick } = fixture();
		tick(0);
		tick(410);
		session.playerFacing = { x: 0, y: -1 };
		attemptRuntimeCombatAttack(session, area, 500, () => {});
		tick(570);
		expect(session.pendingMelee).toBeUndefined();
		expect(session.runtimePlayerHealth).toBe(92);
		expect(raiseGuard(session, 600)).toBe(false);
		const save = createGameSave(project, session);
		const continued = restoreGameSave(project, save);
		expect(continued.runtimePlayerHealth).toBe(92);
		expect(continued.enemyAttacks.size).toBe(0);
		expect(continued.guardSince).toBeUndefined();
		expect(project.player.combat?.health).toBe(112);
	});
	it.each([
		100, 130, 220, 660, 710,
	])("the guard punishes frontal attacks repeated every %i ms", (interval) => {
		const spam = fixture("guard");
		const messages: string[] = [];
		for (
			let t = 0;
			t < 30000 && spam.session.runtimePlayerHealth && spam.area.npcs.length;
			t += 10
		) {
			if (t % interval === 0)
				attemptRuntimeCombatAttack(spam.session, spam.area, t, () => {});
			advanceRuntimeMelee(spam.session, spam.area, t, (e) => {
				if (e.type === "status") messages.push(e.message);
			});
			spam.tick(t);
		}
		expect(spam.session.runtimePlayerHealth, JSON.stringify(messages)).toBe(0);
		expect(
			messages.some((m) => m.includes("blocks") || m.includes("parries")),
		).toBe(true);
	});
	it.each([
		110, 160, 710,
	])("the pressure fighter keeps initiative after countering repeated attacks at %i ms", (interval) => {
		const duel = fixture("blade");
		for (
			let t = 0;
			t < 30000 && duel.session.runtimePlayerHealth && duel.area.npcs.length;
			t += 10
		) {
			if (t % interval === 0)
				attemptRuntimeCombatAttack(duel.session, duel.area, t, () => {});
			advanceRuntimeMelee(duel.session, duel.area, t, () => {});
			duel.tick(t);
		}
		expect(duel.session.runtimePlayerHealth).toBe(0);
	});
	it("buffers a held block through recovery using the original press for parries, and cancels on release", () => {
		const { session, area } = fixture();
		attemptRuntimeCombatAttack(session, area, 0, () => {});
		advanceRuntimeMelee(session, area, 215, () => {});
		expect(raiseGuard(session, 300)).toBe(false);
		advanceHeldGuard(session, 659);
		expect(session.guardSince).toBeUndefined();
		advanceHeldGuard(session, 660);
		expect(session.guardSince).toBe(300);
		releaseGuard(session);
		expect(raiseGuard(session, 680)).toBe(false);
		releaseGuard(session);
		advanceHeldGuard(session, 1800);
		expect(session.guardSince).toBeUndefined();
	});
	it("gives a guarded opponent a retreat and leaves the aggressive opponent close after recovery", () => {
		for (const id of ["guard", "blade"]) {
			const duel = fixture(id);
			const attack = duel.session.project.npcs.find((n) => n.id === duel.npc.id)
				?.defaultEnemyBehaviour?.attacks?.[0];
			if (!attack) throw Error("Missing opening cut");
			const startY = duel.npc.y;
			duel.tick(0);
			raiseGuard(duel.session, 100);
			duel.tick(attack.windupMs);
			const contact = attack.windupMs + attack.impactMs;
			duel.tick(contact);
			duel.tick(contact + attack.recoveryMs);
			expect(duel.npc.y).toBe(startY + (id === "guard" ? 1 : 0));
			duel.tick(contact + attack.recoveryMs + 650);
			expect(duel.npc.y).toBe(startY);
		}
	});
	it("accepts one riposte directly from a timed guard", () => {
		const duel = fixture("guard");
		duel.tick(0);
		duel.tick(680);
		expect(raiseGuard(duel.session, 740)).toBe(true);
		duel.tick(855);
		expect(duel.session.riposte).toEqual({ npcId: duel.npc.id, until: 1755 });
		expect(
			attemptRuntimeCombatAttack(duel.session, duel.area, 880, () => {}),
		).toBe(true);
		advanceRuntimeMelee(duel.session, duel.area, 1095, () => {});
		expect(duel.session.runtimeState.npcs[duel.npc.id].health).toBe(51);
		expect(duel.session.riposte).toBeUndefined();
		expect(duel.session.runtimePlayerHealth).toBe(112);
	});
	it("distinguishes entering the active arc from a block facing the wrong way", () => {
		const duel = fixture();
		duel.npc.x += 3;
		attemptRuntimeCombatAttack(duel.session, duel.area, 0, () => {});
		advanceRuntimeMelee(duel.session, duel.area, 215, () => {});
		duel.npc.x -= 3;
		advanceRuntimeMelee(duel.session, duel.area, 255, () => {});
		expect(duel.session.runtimeState.npcs[duel.npc.id].health).toBe(62);
		duel.tick(1000);
		duel.tick(1410);
		duel.session.playerFacing = { x: 0, y: -1 };
		raiseGuard(duel.session, 1500);
		duel.tick(1570);
		expect(duel.session.runtimePlayerHealth).toBe(92);
		expect(duel.session.riposte).toBeUndefined();
	});
	it("preserves authored sword tactics, bounds unsafe values and leaves legacy actors without tactics", () => {
		const input = structuredClone(arena);
		const guard = input.npcs.find((n) => n.id === "guard-opponent")
			?.defaultEnemyBehaviour.swordTactics;
		if (!guard) throw Error("Missing sword tactics");
		guard.reactionMs = -3;
		guard.parryAfter = 200;
		const imported = importProjectJson(JSON.stringify(input));
		expect(
			imported.npcs.find((n) => n.id === "guard-opponent")
				?.defaultEnemyBehaviour?.swordTactics,
		).toEqual({ ...guard, reactionMs: 0, parryAfter: 8 });
		expect(
			imported.npcs.find((n) => n.id === "bow-opponent")?.defaultEnemyBehaviour
				?.swordTactics,
		).toBeUndefined();
	});
	it("refuses a shot through cover; swept flight hits intervening cover after launch", () => {
		const { session, area, npc, tick, emit } = fixture("bow");
		session.playerPosition = { x: npc.x, y: npc.y - 7 };
		const wall = {
			...area.objects[0],
			id: "test-cover",
			objectDefinitionId: "",
			blocksMovement: true,
			x: npc.x,
			y: npc.y - 3,
		};
		area.objects.push(wall);
		tick(0);
		expect(session.enemyAttacks.get(npc.id)?.pending).toBeUndefined();
		area.objects.pop();
		npc.x = 11;
		npc.y = 16;
		session.npcMovementStates.set(npc.id, {
			movement: { patrolIndex: 0 },
			nextMoveAt: 0,
		});
		tick(1000);
		tick(2150);
		tick(2200);
		expect(session.projectiles?.enemyShots).toHaveLength(1);
		area.objects.push(wall);
		const world = createTraversalWorld(session.project, area, "smooth");
		const body = { x: 11, y: 1.25, z: 9 };
		advanceRuntimeProjectiles(
			session,
			area,
			world,
			1000,
			{ body, muzzle: body },
			() => {},
			false,
			{ time: 3200, emit },
		);
		expect(session.projectiles?.lastImpact).toMatchObject({
			kind: "world",
			id: "test-cover",
		});
		expect(session.runtimePlayerHealth).toBe(112);
	});
	it("stops a player outside the wyrm body and clears the volume on defeat", () => {
		const { session, area, npc } = fixture("wyrm");
		const world = createTraversalWorld(session.project, area);
		const from = {
			x: npc.x,
			y: npc.y - 2,
			height: world.sampler.sampleSurfaceY(npc),
		};
		const advance = () =>
			sweepTraversal(world, area, session.project, from, { x: 0, y: 2 });
		const blocked = advance();
		expect(blocked.reason).toBe("Blocked by NPC.");
		expect(npc.y - blocked.position.y).toBeGreaterThanOrEqual(1.1 - 1e-8);
		area.npcs = [];
		expect(advance().reason).toBeUndefined();
	});
	it("a close archer backs away and a courser's locked arc can be sidestepped", () => {
		const bow = fixture("bow");
		bow.tick(0);
		expect(bow.npc.y).toBe(17);
		const horse = fixture("courser");
		horse.tick(0);
		horse.session.playerPosition = { x: horse.npc.x + 1, y: horse.npc.y };
		horse.tick(880);
		horse.tick(1065);
		expect(horse.session.runtimePlayerHealth).toBe(112);
	});
});
