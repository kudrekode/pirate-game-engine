import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { createRuntimeSession, getInitialRuntimeArea } from "./runtimeSession";

describe("runtime session", () => {
	it("creates an isolated runtime project snapshot without mutating the source project", () => {
		const project = cloneProject(defaultProject);
		project.gameState.inventory = { gold_coin: 2 };
		const before = JSON.stringify(project);

		const session = createRuntimeSession(project);

		expect(JSON.stringify(project)).toBe(before);
		expect(session.project).not.toBe(project);
		expect(session.project.areas).not.toBe(project.areas);
		expect(session.currentAreaId).toBe("area_main");
		expect(session.playerPosition).toEqual({ x: 0, y: 0 });
		expect(session.playerFacing).toEqual({ x: 0, y: 1 });
		expect(session.currentMovementMode).toBe("walk");
		expect(session.playerVehicleState).toEqual({ active: false });
		expect(session.progressionIndex).toBe(0);
		expect(session.waitingForTrigger).toBeNull();
	});

	it("preserves active-area fallback behavior", () => {
		const project = cloneProject(defaultProject);
		project.activeAreaId = "missing-area";

		const session = createRuntimeSession(project);

		expect(getInitialRuntimeArea(project).id).toBe(project.areas[0].id);
		expect(session.currentAreaId).toBe(project.areas[0].id);
	});

	it("keeps runtime flags variables inventory and NPC attributes separate from editor defaults", () => {
		const project = cloneProject(defaultProject);
		project.gameState.inventory = { gold_coin: 2 };
		const session = createRuntimeSession(project);

		session.runtimeState.flags.intro_seen = true;
		session.runtimeState.variables.gold = 99;
		session.runtimeState.inventory.items.gold_coin = 9;
		session.runtimeState.npcs.npc_instance_captain_mira.health = 10;

		expect(project.gameState.flags.intro_seen).toBe(false);
		expect(project.gameState.variables.gold).toBe(3);
		expect(project.gameState.inventory.gold_coin).toBe(2);
		expect(
			project.areas[0].npcs.find(
				(npc) => npc.id === "npc_instance_captain_mira",
			)?.attributes.health,
		).toBe(100);
	});

	it("keeps runtime quest state and shop stock separate from editor definitions", () => {
		const project = cloneProject(defaultProject);
		const session = createRuntimeSession(project);

		session.runtimeQuestState.quests[0].status = "completed";
		session.runtimeQuestState.rewardedQuestIds.add("quest_tavern_access");
		session.runtimeShopStocks.shop_general_store.shop_entry_tavern_key = 0;

		expect(project.quests[0].status).toBe("active");
		expect(project.shops[0].entries[0].stock).toBe(1);
	});

	it("keeps player combat health runtime-owned", () => {
		const project = cloneProject(defaultProject);
		const session = createRuntimeSession(project);

		session.runtimePlayerHealth = 1;
		session.playerCombat.health = 1;

		expect(project.player.combat?.health).toBe(100);
		expect(project.player.health).toBe(100);
	});
});
