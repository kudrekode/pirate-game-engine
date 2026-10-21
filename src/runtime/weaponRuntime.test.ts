import { describe, expect, it } from "vitest";
import demo from "../../melee-weapon-v1-demo.project.json";
import { defaultProject } from "../data/defaultProject";
import { migrateProject } from "../data/migrateProject";
import { SWORD, SWORD_ITEM } from "../data/sword";
import { createGameSave, parseGameSave, restoreGameSave } from "./gameSave";
import { removeItem } from "./inventory";
import {
	attemptRuntimeCombatAttack,
	type RuntimeCombatEvent,
} from "./runtimeCombat";
import { collectRuntimeObjectPickup } from "./runtimeObjectInteractions";
import { createRuntimeSession } from "./runtimeSession";
import { createRuntimeTraversal, createTraversalWorld } from "./traversal";
import {
	equipRuntimeWeapon,
	getEquippedWeapon,
	getRuntimeAttackStats,
} from "./weaponRuntime";

function setup() {
	const project = migrateProject(demo),
		session = createRuntimeSession(project),
		area = session.project.areas[0];
	session.playerPosition = { x: 3, y: 8 };
	session.playerFacing = { x: 1, y: 0 };
	return { project, session, area };
}
describe("one equipped sword through existing transactions", () => {
	it("requires ownership; collects exactly once; equips and unequips without touching authored defaults", () => {
		const { project, session, area } = setup(),
			before = JSON.stringify(project);
		expect(equipRuntimeWeapon(session, "sword")).toBe(false);
		expect(equipRuntimeWeapon(session, "rope")).toBe(false);
		expect(collectRuntimeObjectPickup(session, "sword-pickup", () => {})).toBe(
			true,
		);
		expect(collectRuntimeObjectPickup(session, "sword-pickup", () => {})).toBe(
			false,
		);
		expect(session.runtimeState.inventory.items.sword).toBe(1);
		expect(area.objects.some((o) => o.id === "sword-pickup")).toBe(false);
		expect(getEquippedWeapon(session)).toBeUndefined();
		expect(equipRuntimeWeapon(session, "sword")).toBe(true);
		expect(getEquippedWeapon(session)).toBe(SWORD);
		expect(equipRuntimeWeapon(session, undefined)).toBe(true);
		expect(getRuntimeAttackStats(session)).toBe(session.playerCombat);
		expect(JSON.stringify(project)).toBe(before);
	});
	it("parameterises damage, range and cooldown, retaining Hit/defeat flags and immediate collision removal", () => {
		const { session, area } = setup(),
			events: RuntimeCombatEvent[] = [];
		const attack = (t: number) =>
			attemptRuntimeCombatAttack(session, area, t, (e) => events.push(e));
		expect(attack(0)).toBe(true);
		expect(session.runtimeState.npcs.sparring_guard.health).toBe(75);
		expect(session.nextAttackAt).toBe(500);
		collectRuntimeObjectPickup(session, "sword-pickup", () => {});
		equipRuntimeWeapon(session, "sword");
		expect(attack(499)).toBe(false); // Equip cannot bypass the previous cooldown.
		session.playerPosition = { x: 2, y: 8 };
		expect(attack(500)).toBe(true); // Same target, now two cells away.
		expect(session.runtimeState.npcs.sparring_guard.health).toBe(40);
		expect(session.nextAttackAt).toBe(1250);
		expect(attack(1249)).toBe(false);
		expect(attack(1250)).toBe(true);
		expect(session.runtimeState.npcs.sparring_guard.health).toBe(5);
		expect(attack(2000)).toBe(true);
		expect(area.npcs.some((n) => n.id === "sparring_guard")).toBe(false);
		expect(session.runtimeState.flags.npc_defeated_sparring_guard).toBe(true);
		expect(events.filter((e) => e.type === "npcDefeated")).toHaveLength(1);
		expect(
			events.filter((e) => e.type === "attackStarted").map((e) => e.weapon),
		).toEqual([undefined, "sword", "sword", "sword"]);
	});
	it("falls back to the exact unarmed stats on unequip or loss of ownership, with bounded target reach", () => {
		const { session, area } = setup();
		collectRuntimeObjectPickup(session, "sword-pickup", () => {});
		equipRuntimeWeapon(session, "sword");
		session.playerPosition = { x: 1, y: 8 };
		expect(attemptRuntimeCombatAttack(session, area, 0, () => {})).toBe(false);
		expect(session.runtimeState.npcs.sparring_guard.health).toBe(100);
		equipRuntimeWeapon(session, undefined);
		session.playerPosition = { x: 2, y: 8 };
		expect(attemptRuntimeCombatAttack(session, area, 750, () => {})).toBe(
			false,
		);
		equipRuntimeWeapon(session, "sword");
		removeItem(session.runtimeState.inventory, "sword", 1);
		expect(getEquippedWeapon(session)).toBeUndefined();
		expect(getRuntimeAttackStats(session)).toEqual(session.playerCombat);
	});
	it("blocks modal, startup, death and airborne actions without consuming cooldown", () => {
		const { session, area } = setup();
		session.runtimeState.inventory.items.sword = 1;
		for (const blocked of ["startup", "shop", "death", "airborne"]) {
			session.startupPending = blocked === "startup";
			session.activeShopId = blocked === "shop" ? "shop" : undefined;
			session.runtimePlayerHealth = blocked === "death" ? 0 : 100;
			session.traversal = createRuntimeTraversal(
				createTraversalWorld(session.project, area),
				area,
				session.project,
				session.playerPosition,
			);
			if (blocked === "airborne") session.traversal.motion.phase = "jump";
			expect(equipRuntimeWeapon(session, "sword")).toBe(false);
			expect(attemptRuntimeCombatAttack(session, area, 1000, () => {})).toBe(
				false,
			);
			expect(session.nextAttackAt).toBe(0);
		}
	});
	it("restores owned/equipped and owned/unequipped saves, rejects invalid equip references, accepts older v1 saves", () => {
		const { project, session } = setup();
		collectRuntimeObjectPickup(session, "sword-pickup", () => {});
		equipRuntimeWeapon(session, "sword");
		const save = createGameSave(project, session),
			restored = restoreGameSave(project, save);
		expect(restored.equippedWeaponId).toBe("sword");
		expect(getEquippedWeapon(restored)).toBe(SWORD);
		expect(restored.runtimeState.inventory.items.sword).toBe(1);
		expect(collectRuntimeObjectPickup(restored, "sword-pickup", () => {})).toBe(
			false,
		);
		equipRuntimeWeapon(session, undefined);
		expect(
			restoreGameSave(project, createGameSave(project, session))
				.equippedWeaponId,
		).toBeUndefined();
		delete save.player.equippedWeaponId;
		expect(restoreGameSave(project, save).equippedWeaponId).toBeUndefined();
		save.player.equippedWeaponId = "rope";
		expect(() => parseGameSave(JSON.stringify(save), project)).toThrow();
		save.player.equippedWeaponId = "sword";
		delete save.state.inventory.sword;
		expect(() => parseGameSave(JSON.stringify(save), project)).toThrow();
	});
	it("migrates only explicit sword data and never restores deleted items", () => {
		expect(migrateProject({ ...defaultProject, items: [] }).items).toEqual([]);
		expect(
			migrateProject({ ...defaultProject, items: [SWORD_ITEM] }).items[0],
		).toMatchObject(SWORD_ITEM);
		expect(
			migrateProject({
				...defaultProject,
				items: [{ ...SWORD_ITEM, weapon: "unsupported" }],
			}).items[0].weapon,
		).toBeUndefined();
	});
});
