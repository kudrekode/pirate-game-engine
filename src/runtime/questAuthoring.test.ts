import { describe, expect, it } from "vitest";
import harbour from "../../docs/assets/gameplay-interactions/tidewatch-harbour.project.json";
import { migrateProject } from "../data/migrateProject";
import { validateProject } from "../data/validateProject";
import type { ObjectiveCondition } from "../types/game";
import { questProgressMessages } from "./QuestPresentation";
import { activateQuest, getQuestViews, recordQuestFact } from "./questEngine";
import {
	finishQuestConversation,
	observeQuestLocation,
} from "./questInteractions";
import { runActions } from "./ruleEngine";
import {
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "./runtimeObjectInteractions";
import {
	type RuntimeProgressionEvent,
	startRuntimeSession,
	syncRuntimeQuestProgress,
	transitionRuntimeArea,
} from "./runtimeProgression";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEvent,
} from "./runtimeRuleActionDispatcher";
import {
	createRuntimeSession,
	type RuntimeSessionState,
} from "./runtimeSession";

function setup() {
	const project = migrateProject(harbour);
	const area = project.areas[0];
	const keeper = area.npcs[0];
	const key = project.items.find((item) => item.name === "Harbour Key")!;
	const arrival = area.eventBlocks.find(
		(event) => event.name === "Shack interior",
	)!;
	const chest = area.objects.find(
		(object) => object.behaviourOverride?.type === "container",
	)!;
	const door = area.objects.find(
		(object) => object.behaviourOverride?.type === "door",
	)!;
	project.gameState.flags.harbour_done = false;
	project.quests = [
		{
			id: "harbour",
			name: "Harbour Trouble",
			status: "inactive",
			objectiveMode: "sequence",
			completionMessage: "You gained access to the shack.",
			completionActions: [
				{ type: "set_flag", flag: "harbour_done", value: true },
			],
			objectives: [
				{
					id: "talk",
					description: "Talk to the Harbour Keeper",
					condition: {
						type: "interaction_completed",
						areaId: area.id,
						targetId: keeper.id,
					},
				},
				{
					id: "key",
					description: "Find the Harbour Key",
					condition: { type: "has_item", itemId: key.id, quantity: 1 },
				},
				{
					id: "enter",
					description: "Enter the shack",
					condition: {
						type: "enter_event",
						areaId: area.id,
						targetId: arrival.id,
					},
				},
			],
		},
	];
	return { project, area, keeper, key, arrival, chest, door };
}
function bridge(session: RuntimeSessionState) {
	const events: Array<
		RuntimeRuleEvent | RuntimeProgressionEvent | RuntimeObjectInteractionEvent
	> = [];
	function emit(
		event:
			| RuntimeRuleEvent
			| RuntimeProgressionEvent
			| RuntimeObjectInteractionEvent,
	) {
		events.push(event);
		if (event.type === "questAction") emit(event.event);
		if (event.type === "teleportRequested")
			transitionRuntimeArea(session, event.areaId, event.eventBlockId, emit);
	}
	return { events, emit, sync: () => syncRuntimeQuestProgress(session, emit) };
}
function talk(
	session: RuntimeSessionState,
	keeperId: string,
	emit: ReturnType<typeof bridge>["emit"],
) {
	session.pendingInteraction = {
		areaId: session.currentAreaId,
		targetId: keeperId,
		interaction: {
			type: "show_message",
			activationMode: "on_interact",
			lines: ["Keep the key."],
			completionActions: [{ type: "activate_quest", questId: "harbour" }],
		},
	};
	finishQuestConversation(session, emit, emit);
}
const view = (session: RuntimeSessionState) =>
	getQuestViews(session.runtimeQuestState, session.runtimeState)[0];

describe("directed quest authoring runtime", () => {
	it("reports an immediately satisfied Play-start quest and grants completion items only once", () => {
		const { project } = setup();
		project.items.push({
			id: "receipt",
			name: "Receipt",
			category: "misc",
			stackable: true,
		});
		project.gameState.flags.ready = true;
		project.quests[0].status = "active";
		project.quests[0].objectives = [
			{
				id: "ready",
				description: "Be ready",
				condition: { type: "flag", flag: "ready", value: true },
			},
		];
		project.quests[0].completionActions = [
			{ type: "give_item", itemId: "receipt", quantity: 1 },
		];
		const session = createRuntimeSession(project);
		const { sync } = bridge(session);
		sync();
		expect(questProgressMessages([], [view(session)])).toEqual([
			"New Quest: Harbour Trouble",
			"Objective Complete: Be ready",
			"Quest Complete: Harbour Trouble — You gained access to the shack.",
		]);
		sync();
		expect(session.runtimeState.inventory.items.receipt).toBe(1);
		project.quests[0].status = "completed";
		expect(
			questProgressMessages([], [view(createRuntimeSession(project))]),
		).toEqual([]);
	});

	it("records only the final playable arrival during startup", () => {
		const { project, area, arrival } = setup();
		project.quests[0].status = "active";
		project.quests[0].objectives = [project.quests[0].objectives[2]];
		project.progression = [
			{
				id: "provisional",
				action: {
					type: "spawn_player",
					areaId: area.id,
					eventBlockId: arrival.id,
				},
			},
			{
				id: "actual",
				action: {
					type: "spawn_player",
					areaId: area.id,
					eventBlockId: area.eventBlocks[0].id,
				},
			},
		];
		const session = createRuntimeSession(project);
		const { emit } = bridge(session);
		startRuntimeSession(session, (done) => done(), emit);
		expect(view(session).status).toBe("active");
		expect(session.runtimeQuestState.facts.size).toBe(1);
		transitionRuntimeArea(session, area.id, arrival.id, emit);
		expect(view(session).status).toBe("completed");
	});

	it.each([
		"container_opened",
		"door_used",
	] as const)("completes %s through the actual object transaction", (type) => {
		const { project, area, chest, door } = setup();
		project.quests[0].status = "active";
		project.quests[0].objectives = [
			{
				id: "use",
				description: "Use the object",
				condition: {
					type,
					areaId: area.id,
					targetId: type === "container_opened" ? chest.id : door.id,
				},
			},
		];
		const session = createRuntimeSession(project);
		const { emit } = bridge(session);
		runRuntimeObjectBehaviour(session, door, emit);
		expect(view(session).status).toBe("active");
		runRuntimeObjectBehaviour(session, chest, emit);
		if (type === "door_used") {
			expect(view(session).status).toBe("active");
			runRuntimeObjectBehaviour(session, door, emit);
		}
		expect(view(session).status).toBe("completed");
	});
	it("starts only explicitly, advances talk/item/arrival in order, rewards once, and isolates Edit and fresh Play", () => {
		const { project, keeper, chest, door, key } = setup();
		const authored = JSON.stringify(project);
		const session = createRuntimeSession(project);
		const { emit, sync } = bridge(session);
		sync();
		expect(view(session).status).toBe("inactive");
		runRuntimeObjectBehaviour(session, door, emit);
		expect(session.runtimeQuestState.facts.size).toBe(0);
		talk(session, keeper.id, emit);
		expect(
			view(session).objectives.map((objective) => objective.state),
		).toEqual(["complete", "active", "inactive"]);
		const before = [view(session)];
		runRuntimeObjectBehaviour(session, chest, emit);
		expect(
			view(session).objectives.map((objective) => objective.state),
		).toEqual(["complete", "complete", "active"]);
		expect(questProgressMessages(before, [view(session)])).toEqual([
			"Objective Complete: Find the Harbour Key",
			"New Objective: Enter the shack",
		]);
		const entering = [view(session)];
		runRuntimeObjectBehaviour(session, door, emit);
		expect(view(session).status).toBe("completed");
		expect(session.runtimeState.flags.harbour_done).toBe(true);
		expect(session.runtimeState.inventory.items[key.id]).toBe(1);
		expect(questProgressMessages(entering, [view(session)])).toContain(
			"Quest Complete: Harbour Trouble — You gained access to the shack.",
		);
		const factCount = session.runtimeQuestState.facts.size;
		talk(session, keeper.id, emit);
		runRuntimeObjectBehaviour(session, chest, emit);
		sync();
		expect(session.runtimeQuestState.facts.size).toBe(factCount);
		expect(activateQuest(session.runtimeQuestState, "harbour")).toBe(false);
		expect(questProgressMessages([view(session)], [view(session)])).toEqual([]);
		expect(session.runtimeQuestState.completedActionIds.size).toBe(1);
		expect(JSON.stringify(project)).toBe(authored);
		const fresh = createRuntimeSession(project);
		expect(view(fresh).status).toBe("inactive");
		expect(fresh.runtimeQuestState.facts.size).toBe(0);
		expect(fresh.runtimeState.inventory.items[key.id]).toBeUndefined();
	});

	it("uses pre-existing inventory and remembered arrivals when later steps activate", () => {
		const { project, keeper, chest, arrival, area } = setup();
		const session = createRuntimeSession(project);
		const { emit } = bridge(session);
		runRuntimeObjectBehaviour(session, chest, emit);
		// Another valid transition reaches the same authored arrival target.
		transitionRuntimeArea(session, area.id, arrival.id, emit);
		expect(view(session).status).toBe("inactive");
		talk(session, keeper.id, emit);
		expect(view(session).status).toBe("completed");
	});

	it.each([
		"container_opened",
		"door_used",
		"enter_event",
		"interaction_completed",
	] as const)("remembers %s without completing later steps ahead of the sequence", (type) => {
		const { project, area } = setup();
		project.quests[0].status = "active";
		project.quests[0].objectives = [
			{
				id: "flag",
				description: "Wait for flag",
				condition: { type: "flag", flag: "ready", value: true },
			},
			{
				id: "fact",
				description: "Observe target",
				condition: { type, areaId: area.id, targetId: "target" },
			},
		];
		const session = createRuntimeSession(project);
		const { emit, sync } = bridge(session);
		recordQuestFact(session.runtimeQuestState, type, "another-area", "target");
		recordQuestFact(session.runtimeQuestState, type, area.id, "target");
		sync();
		expect(
			view(session).objectives.map((objective) => objective.state),
		).toEqual(["active", "inactive"]);
		runActions(
			[{ type: "set_flag", flag: "ready", value: true }],
			createRuntimeRuleContext(session, emit),
			() => {},
		);
		expect(view(session).status).toBe("completed");
	});

	it("records walking into an arrival cell once, and rejects a fact from another area", () => {
		const { project, area, arrival } = setup();
		project.quests[0].status = "active";
		project.quests[0].objectives = [project.quests[0].objectives[2]];
		const session = createRuntimeSession(project);
		const { emit, sync, events } = bridge(session);
		recordQuestFact(
			session.runtimeQuestState,
			"enter_event",
			"other",
			arrival.id,
		);
		sync();
		expect(view(session).status).toBe("active");
		session.currentAreaId = area.id;
		session.playerPosition = { x: arrival.x, y: arrival.y };
		observeQuestLocation(session, emit);
		expect(view(session).status).toBe("completed");
		const count = events.length;
		observeQuestLocation(session, emit);
		expect(events.length).toBe(count);
	});

	it("does not count a key removed before activation, and latches a completed step", () => {
		const { project, key, keeper, chest } = setup();
		const session = createRuntimeSession(project);
		const { emit, sync } = bridge(session);
		runRuntimeObjectBehaviour(session, chest, emit);
		runActions(
			[{ type: "remove_item", itemId: key.id, quantity: 1 }],
			createRuntimeRuleContext(session, emit),
			() => {},
		);
		talk(session, keeper.id, emit);
		expect(view(session).objectives[1].state).toBe("active");
		runActions(
			[
				{ type: "give_item", itemId: key.id, quantity: 1 },
				{ type: "remove_item", itemId: key.id, quantity: 1 },
			],
			createRuntimeRuleContext(session, emit),
			() => {},
		);
		sync();
		expect(view(session).objectives[1].state).toBe("complete");
	});

	it("round trips additive fields, retains legacy mode and deleted quest lists, and validates missing targets", () => {
		const { project, keeper } = setup();
		keeper.interactionOverride = {
			type: "show_message",
			activationMode: "on_interact",
			lines: ["Hello"],
			completionActions: [{ type: "activate_quest", questId: "harbour" }],
		};
		const migrated = migrateProject(JSON.parse(JSON.stringify(project)));
		expect(migrateProject(JSON.parse(JSON.stringify(migrated)))).toEqual(
			migrated,
		);
		expect(migrated.quests[0]).toMatchObject(project.quests[0]);
		expect(
			migrated.areas[0].npcs[0].interactionOverride?.completionActions,
		).toEqual(keeper.interactionOverride.completionActions);
		for (const type of [
			"container_opened",
			"door_used",
			"enter_event",
			"interaction_completed",
		] as const) {
			migrated.quests[0].objectives[0].condition = {
				type,
				areaId: "missing",
				targetId: "missing",
			};
			expect(
				migrateProject(migrated).quests[0].objectives[0].condition,
			).toEqual(migrated.quests[0].objectives[0].condition);
			expect(
				validateProject(migrated).some((issue) =>
					issue.message.includes("objective target"),
				),
			).toBe(true);
		}
		delete migrated.quests[0].objectiveMode;
		expect(migrateProject(migrated).quests[0].objectiveMode).toBeUndefined();
		migrated.quests = [];
		expect(migrateProject(migrated).quests).toEqual([]);
		expect(migrateProject({ ...migrated, quests: undefined }).quests).toEqual(
			[],
		);
		project.quests[0].objectives[0].condition = {
			type: "unknown",
		} as unknown as ObjectiveCondition;
		expect(migrateProject(project).quests[0].objectives).toHaveLength(2);
	});
});
