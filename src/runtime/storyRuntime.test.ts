import { expect, it, vi } from "vitest";
import merewatch from "../../hollow-kingdom.project.json";
import { importProjectJson } from "../data/projectImport";
import { createProjectFromPreset } from "../data/projectPresets";
import { createGameSave, gameSaveProjectId, restoreGameSave } from "./gameSave";
import { runAction } from "./ruleEngine";
import { startRuntimeSession } from "./runtimeProgression";
import { createRuntimeRuleContext } from "./runtimeRuleActionDispatcher";
import {
	createRuntimeSession,
	type RuntimeSessionState,
} from "./runtimeSession";
import {
	initializeRuntimeStory,
	queueStoryEvent,
	type StoryRuntimeHost,
	tickRuntimeStory,
} from "./storyRuntime";

const openProject = () => importProjectJson(JSON.stringify(merewatch));

function createHost(session: RuntimeSessionState) {
	const emitRule = vi.fn<StoryRuntimeHost["emitRule"]>();
	const host: StoryRuntimeHost = {
		emitRule,
		emitProgression: () => {},
		canPresent: () => true,
	};
	const tick = (deltaMs?: number) => tickRuntimeStory(session, host, deltaMs);
	return { emitRule, host, tick };
}

for (const outcome of ["finished", "skipped"] as const) {
	it(`waits for real inputs, resumes after the cinematic is ${outcome} and continues without replay`, () => {
		const project = openProject();
		const session = createRuntimeSession(project);
		const { host, tick, emitRule } = createHost(session);
		const activeNode = (state = session) => state.story?.cursors[0]?.nodeId;
		const trail = (state = session) =>
			state.runtimeQuestState.quests.find(
				(quest) => quest.id === "beacon-trail",
			);
		initializeRuntimeStory(session, true);
		startRuntimeSession(session, (done) => done(), host.emitProgression);
		tick();
		expect(session.playerPosition).toEqual({ x: 20, y: 56 });
		expect(activeNode()).toBe("oswin-interaction");
		expect(session.dialogue).toBeUndefined();
		queueStoryEvent(session, {
			type: "npc",
			areaId: "merewatch",
			npcId: "pine-lookout",
		});
		tick();
		expect(activeNode()).toBe("oswin-interaction");
		queueStoryEvent(session, {
			type: "npc",
			areaId: "merewatch",
			npcId: "oswin-at-the-well",
		});
		tick();
		expect(activeNode()).toBe("accept-offer");
		expect(emitRule).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "cutsceneRequested" }),
		);
		queueStoryEvent(session, {
			type: "dialogueChoice",
			dialogueId: "oswins-watch",
			nodeId: "offer",
			choiceId: "accept",
		});
		tick();
		expect(emitRule).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "cutsceneRequested",
				cutsceneId: "the-light-across-the-mere",
			}),
		);
		expect(trail()?.status).toBe("inactive");
		expect(() => createGameSave(project, session)).toThrow(/before saving/);
		const request = emitRule.mock.calls
			.map(([event]) => event)
			.find((event) => event.type === "cutsceneRequested");
		queueStoryEvent(session, {
			type: "cinematic",
			cinematicId: "the-light-across-the-mere",
			outcome,
		});
		tick();
		expect(trail()?.status).toBe("inactive");
		queueStoryEvent(session, {
			type: "cinematic",
			cinematicId: "the-light-across-the-mere",
			outcome,
			playbackId: request?.storyPlaybackId,
		});
		tick();
		expect(trail()?.status).toBe("active");
		expect(
			session.runtimeQuestState.completedObjectiveIds.has(
				"beacon-trail:briefed",
			),
		).toBe(true);
		expect(activeNode()).toBe("wait-for-key");
		expect(
			emitRule.mock.calls.filter(([event]) => event.type === "itemFeedback"),
		).toHaveLength(1);
		tick(10000);
		expect(activeNode()).toBe("wait-for-key");
		const save = createGameSave(project, session);
		const resumed = restoreGameSave(project, save);
		const continued = createHost(resumed);
		expect(activeNode(resumed)).toBe("wait-for-key");
		runAction(
			{ type: "give_item", itemId: "beacon-key", quantity: 1 },
			createRuntimeRuleContext(resumed, continued.emitRule),
			() => {},
		);
		continued.tick();
		expect(activeNode(resumed)).toBe("watchtower");
		resumed.playerPosition = { x: 23, y: 6 };
		continued.tick();
		expect(resumed.story?.cursors[0]?.status).toBe("completed");
		expect(trail(resumed)?.status).toBe("completed");
		expect(project.gameState.inventory).toEqual({});
		expect(
			project.quests.find((quest) => quest.id === "beacon-trail")?.status,
		).toBe("inactive");
		expect(continued.emitRule).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "cutsceneRequested" }),
		);
	});
}

it("round-trips authored graphs and scopes save identity to gameplay changes", () => {
	const project = openProject();
	const graph = project.storyGraphs?.[0];
	if (!graph) throw new Error("The bundled story graph is missing.");
	expect(importProjectJson(JSON.stringify(project)).storyGraphs).toEqual(
		project.storyGraphs,
	);
	const fingerprint = gameSaveProjectId(project);
	graph.nodes[0].x = 42;
	graph.nodes[0].title = "Begin";
	expect(gameSaveProjectId(project)).toBe(fingerprint);
	graph.edges.pop();
	expect(gameSaveProjectId(project)).not.toBe(fingerprint);
	project.storyGraphs = [];
	expect(importProjectJson(JSON.stringify(project)).storyGraphs).toEqual([]);
});

it("resumes a timer in a repeatable flow and keeps an item grant single-use", () => {
	const project = createProjectFromPreset("blank");
	project.items = [
		{ id: "coin", name: "Coin", category: "currency", stackable: true },
	];
	project.gameState.flags.go = false;
	project.storyGraphs = [
		{
			id: "flow",
			name: "Flow",
			kind: "event",
			nodes: [
				{
					id: "entry",
					type: "flagChanged",
					x: 0,
					y: 0,
					data: { flagId: "go" },
				},
				{ id: "timer", type: "delay", x: 200, y: 0, data: { seconds: 1 } },
				{
					id: "award",
					type: "giveItem",
					x: 400,
					y: 0,
					data: { itemId: "coin", quantity: 1 },
				},
			],
			edges: [
				{ id: "start", from: "entry", to: "timer", port: "next" },
				{ id: "elapsed", from: "timer", to: "award", port: "next" },
			],
		},
	];
	let session = createRuntimeSession(project);
	initializeRuntimeStory(session, true);
	createHost(session).tick();
	session.runtimeState.flags.go = true;
	const before = createHost(session);
	before.tick();
	before.tick(700);
	session = restoreGameSave(project, createGameSave(project, session));
	const continued = createHost(session);
	continued.tick(299);
	expect(session.runtimeState.inventory.items.coin).toBeUndefined();
	continued.tick(1);
	expect(session.runtimeState.inventory.items.coin).toBe(1);
	session.runtimeState.flags.go = false;
	continued.tick();
	continued.tick(1000);
	expect(session.runtimeState.inventory.items.coin).toBe(1);
	expect(session.story?.cursors[0]?.status).toBe("completed");
});
