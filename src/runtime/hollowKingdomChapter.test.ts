import { expect, it } from "vitest";
import chapter from "../../hollow-kingdom-chapter-one.project.json?raw";
import { importProjectJson } from "../data/projectImport";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
	getDialogueNode,
} from "./dialogueEngine";
import { createGameSave, restoreGameSave } from "./gameSave";
import { runRule } from "./ruleEngine";
import { damageRuntimeNpc } from "./runtimeCombat";
import {
	startRuntimeSession,
	transitionRuntimeArea,
} from "./runtimeProgression";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEvent,
} from "./runtimeRuleActionDispatcher";
import { createRuntimeSession } from "./runtimeSession";
import { initializeRuntimeStory, tickRuntimeStory } from "./storyRuntime";

for (const outcome of ["released", "slain"] as const) {
	it(`continues from the authored cave checkpoint and records the ${outcome} ending`, () => {
		const project = importProjectJson(chapter);
		let session = createRuntimeSession(project);
		const scenes: string[] = [];
		function onRule(event: RuntimeRuleEvent) {
			if (event.type === "teleportRequested") {
				transitionRuntimeArea(
					session,
					event.areaId,
					event.eventBlockId,
					() => {},
				);
			}
			if (event.type === "cutsceneRequested") {
				scenes.push(event.cutsceneId);
				event.onDone();
			}
		}
		function converse(id: string, ...answers: string[]) {
			const definition = project.dialogues.find((entry) => entry.id === id)!;
			const state = createRuntimeDialogueState(definition);
			let node = getDialogueNode(definition, state.nodeId);
			for (const answer of answers) {
				expect(node).toBeDefined();
				if (node?.type === "choice") {
					expect(
						getAvailableDialogueChoices(
							node,
							session.runtimeState,
							session.runtimeQuestState,
						).map((choice) => choice.id),
					).toContain(answer);
				}
				node = advanceDialogue(definition, state, answer);
				expect(node).toBeDefined();
				let settled = false;
				enterDialogueNode(
					state,
					node!,
					createRuntimeRuleContext(session, onRule),
					() => {
						settled = true;
					},
				);
				expect(settled).toBe(true);
			}
		}

		initializeRuntimeStory(session, true);
		startRuntimeSession(
			session,
			(done) => done(),
			() => {},
		);
		tickRuntimeStory(session, {
			emitRule: onRule,
			emitProgression: () => {},
			canPresent: () => true,
		});
		expect(session.runtimeQuestState.quests[0].status).toBe("active");
		converse("chapter-oswin", "what", "next");
		converse("hollowwood-road", "cross");
		converse("split-marker", "study");
		converse("iven", "ask", "next", outcome === "released" ? "free" : "seal");
		if (outcome === "released") {
			expect(session.runtimeState.npcs["oath-reader"].alignment).toBe(
				"neutral",
			);
		} else {
			expect(session.runtimeState.npcs["oath-reader"].alignment).toBe(
				"hostile",
			);
			converse("supply-cache", "open");
			expect(session.runtimeState.inventory.items["keeper-bow"]).toBe(1);
		}
		converse("charter-cairn", "read");
		converse("ashen-chapel-road", "enter");
		converse("veyr", "terms", "next");
		converse("chapel-scroll", "read");
		converse("vigil-breath", "step");
		converse("vigil-water", "reset-1");
		expect(session.runtimeState.variables.vigil).toBe(0);
		converse("vigil-breath", "step");
		converse("vigil-name", "step");
		converse("vigil-water", "step");
		if (outcome === "released") {
			runRule(
				project.rules[0],
				createRuntimeRuleContext(session, onRule),
				() => {},
			);
			converse("choir-crypt", "roll");
		}
		converse("crypt-latch", "down");
		expect(session.currentAreaId).toBe("wyrms-hollow");
		session = restoreGameSave(project, createGameSave(project, session));
		converse("confront-wyrm", "approach");
		expect(session.runtimeState.npcs["mere-wyrm"].alignment).toBe("hostile");
		if (outcome === "slain") {
			const area = session.project.areas.find(
				(area) => area.id === session.currentAreaId,
			)!;
			const wyrm = area.npcs.find((npc) => npc.id === "mere-wyrm")!;
			for (let i = 0; i < 6; i += 1)
				damageRuntimeNpc(session, area, wyrm, 35, () => {});
			expect(session.defeatedNpcIds.has(wyrm.id)).toBe(true);
		}
		converse("flood-chain", outcome === "released" ? "release" : "cut");
		if (outcome === "released")
			expect(session.runtimeState.npcs["mere-wyrm"].alignment).toBe("neutral");
		converse("sluice-exit", "out");
		expect(session.currentAreaId).toBe("merewatch");
		converse(
			"chapter-oswin",
			outcome === "released" ? "saved-wyrm" : "slain-wyrm",
			"next",
		);
		if (outcome === "released") converse("chapter-oswin", "names");
		const final = createGameSave(project, session);
		expect(final.quests.statuses["wyrm-beneath-the-mere"]).toBe("completed");
		expect(final.quests.statuses["names-in-the-ash"]).toBe(
			outcome === "released" ? "completed" : "inactive",
		);
		expect(final.state.variables.verdict).toBe(outcome);
		expect(
			final.state.inventory[
				outcome === "released" ? "opened-chain-token" : "broken-spur"
			],
		).toBe(1);
		expect(scenes).toEqual([
			"three-horns-under-stone",
			"what-the-ash-covered",
			"the-chain-in-the-silt",
		]);
		expect(project.gameState.variables.verdict).toBe("unsettled");
	});
}
