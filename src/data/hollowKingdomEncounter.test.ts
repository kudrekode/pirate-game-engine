import { expect, it } from "vitest";
import demo from "../../hollow-kingdom.project.json";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
	getDialogueNode,
} from "../runtime/dialogueEngine";
import { createGameSave, restoreGameSave } from "../runtime/gameSave";
import { attemptRuntimeCombatAttack } from "../runtime/runtimeCombat";
import { createRuntimeRuleContext } from "../runtime/runtimeRuleActionDispatcher";
import { createRuntimeSession } from "../runtime/runtimeSession";
import { equipRuntimeWeapon } from "../runtime/weaponRuntime";
import { importProjectJson } from "./projectImport";

it("keeps Oswin's offer, both defeats and the coffer reward consistent across Continue", () => {
	const project = importProjectJson(JSON.stringify(demo));
	let session = createRuntimeSession(project);
	const conversation = (dialogueId: string, ...choices: string[]) => {
		const dialogue = project.dialogues.find(
			(definition) => definition.id === dialogueId,
		)!;
		const state = createRuntimeDialogueState(dialogue);
		let node = getDialogueNode(dialogue, state.nodeId)!;
		const available = () =>
			getAvailableDialogueChoices(
				node,
				session.runtimeState,
				session.runtimeQuestState,
			).map((option) => option.id);
		for (const choice of choices) {
			expect(available()).toContain(choice);
			node = advanceDialogue(dialogue, state, choice)!;
			enterDialogueNode(
				state,
				node,
				createRuntimeRuleContext(session, () => {}),
				() => {},
			);
		}
		return available();
	};

	expect(equipRuntimeWeapon(session, "watch-sword")).toBe(false);
	conversation("oswins-watch", "offer", "accept");
	expect(equipRuntimeWeapon(session, "watch-sword")).toBe(true);
	expect(conversation("oswins-watch")).not.toContain("offer");
	expect(conversation("search-coffer")).not.toContain("loot");
	expect(conversation("keepers-dispatch")).not.toContain("open");
	let time = 1000;
	function fight(npcId: string, strikes: number) {
		const area = session.project.areas[0];
		const target = area.npcs.find((npc) => npc.id === npcId)!;
		session.playerPosition = { x: target.x - 1, y: target.y };
		session.playerFacing = { x: 1, y: 0 };
		for (let swing = 0; swing < strikes; swing++) {
			expect(attemptRuntimeCombatAttack(session, area, time, () => {})).toBe(
				true,
			);
			time += 750;
		}
		expect(session.defeatedNpcIds.has(npcId)).toBe(true);
	}
	fight("pine-lookout", 2);
	expect(conversation("search-coffer")).not.toContain("loot");
	session = restoreGameSave(project, createGameSave(project, session));
	expect(session.equippedWeaponId).toBe("watch-sword");
	expect(
		session.project.areas[0].npcs.some((npc) => npc.id === "pine-lookout"),
	).toBe(false);
	fight("ash-coat", 3);
	conversation("search-coffer", "loot");
	session = restoreGameSave(project, createGameSave(project, session));
	expect(session.runtimeState.inventory.items).toMatchObject({
		"beacon-key": 1,
		"ferry-penny": 3,
	});
	expect(conversation("search-coffer")).not.toContain("loot");
	expect(conversation("oswins-watch")).toContain("cross");
	expect(conversation("oswins-watch")).not.toContain("deliver");
	conversation("keepers-dispatch", "open");
	session = restoreGameSave(project, createGameSave(project, session));
	expect(session.runtimeState.inventory.items["watch-letter"]).toBe(1);
	expect(conversation("keepers-dispatch")).not.toContain("open");
	conversation("oswins-watch", "deliver");
	session = restoreGameSave(project, createGameSave(project, session));
	expect(session.runtimeState.inventory.items["watch-letter"] ?? 0).toBe(0);
	expect(session.runtimeState.inventory.items["ferry-penny"]).toBe(15);
	expect(conversation("oswins-watch")).toEqual(["after", "farewell"]);
	expect(conversation("keepers-dispatch")).not.toContain("open");
	expect(project.gameState.inventory).toEqual({});
});
