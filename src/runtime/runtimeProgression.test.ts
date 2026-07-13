import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type { EventBlock, GameArea, GameProject } from "../types/game";
import {
	checkRuntimeWaitingTrigger,
	completeRuntimeProgressionCutscene,
	markRuntimeAreaEntered,
	processRuntimeProgression,
	type RuntimeProgressionEvent,
	transitionRuntimeArea,
} from "./runtimeProgression";
import progressionSource from "./runtimeProgression.ts?raw";
import { createRuntimeSession } from "./runtimeSession";

function makeEventBlock(id: string, x: number, y: number): EventBlock {
	return {
		id,
		name: id === "entry" ? "Entry" : "Goal",
		x,
		y,
		tag: id,
		kind: id === "entry" ? "spawn" : "trigger",
	};
}

function makeArea(id: string, eventBlocks: EventBlock[]): GameArea {
	return {
		id,
		name: id === "area_two" ? "Second Area" : "Test Area",
		kind: "outdoor",
		width: 3,
		height: 3,
		tileSize: 32,
		terrainTiles: [{ x: 0, y: 0, tileId: "grass" }],
		overlayTiles: [],
		structures: [],
		objects: [],
		pickups: [],
		npcs: [],
		eventBlocks,
	};
}

function makeProject(patch: Partial<GameProject> = {}): GameProject {
	const areaOne = makeArea("area_one", [
		makeEventBlock("start", 0, 0),
		makeEventBlock("goal", 1, 1),
	]);
	const areaTwo = makeArea("area_two", [makeEventBlock("entry", 2, 1)]);
	const project = cloneProject(defaultProject);
	project.activeAreaId = areaOne.id;
	project.areas = [areaOne, areaTwo];
	project.gameState = { flags: {}, variables: {}, inventory: {} };
	project.items = [
		{
			id: "coin",
			name: "Coin",
			category: "currency",
			stackable: true,
			maxStack: 99,
		},
	];
	project.quests = [];
	project.cutscenes = [];
	project.progression = [];
	project.rules = [];
	return { ...project, ...patch };
}

function collectEvents() {
	const events: RuntimeProgressionEvent[] = [];
	return {
		emit: (event: RuntimeProgressionEvent) => events.push(event),
		events,
	};
}

describe("runtime progression", () => {
	it("requests the intro cutscene before spawning on game start progression", () => {
		const session = createRuntimeSession(
			makeProject({
				cutscenes: [
					{
						id: "intro",
						name: "Intro",
						backgroundImageId: "forest_path",
						text: "Welcome.",
					},
				],
				progression: [
					{
						id: "intro-step",
						action: { type: "play_cutscene", cutsceneId: "intro" },
					},
					{
						id: "spawn-step",
						action: {
							type: "spawn_player",
							areaId: "area_one",
							eventBlockId: "start",
						},
					},
				],
			}),
		);
		const { emit, events } = collectEvents();

		processRuntimeProgression(session, emit);

		expect(events[0]).toMatchObject({
			type: "cutsceneRequested",
			cutsceneId: "intro",
		});
		expect(session.progressionIndex).toBe(0);

		completeRuntimeProgressionCutscene(session, emit);

		expect(events.some((event) => event.type === "spawnPlayer")).toBe(true);
		expect(session.playerPosition).toEqual({ x: 0, y: 0 });
		expect(session.progressionIndex).toBe(2);
	});

	it("spawns at an event block and updates runtime area state", () => {
		const session = createRuntimeSession(makeProject());
		const { emit, events } = collectEvents();

		transitionRuntimeArea(session, "area_two", "entry", emit);

		expect(session.currentAreaId).toBe("area_two");
		expect(session.playerPosition).toEqual({ x: 2, y: 1 });
		expect(events).toContainEqual(
			expect.objectContaining({ type: "areaChanged", areaId: "area_two" }),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "spawnPlayer",
				areaId: "area_two",
				eventBlockId: "entry",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "areaEnterTriggerRequested",
				areaId: "area_two",
			}),
		);
	});

	it("teleports through progression and updates current area and position", () => {
		const session = createRuntimeSession(
			makeProject({
				progression: [
					{
						id: "teleport-step",
						action: {
							type: "teleport_player",
							areaId: "area_two",
							eventBlockId: "entry",
						},
					},
				],
			}),
		);
		const { emit } = collectEvents();

		processRuntimeProgression(session, emit);

		expect(session.currentAreaId).toBe("area_two");
		expect(session.playerPosition).toEqual({ x: 2, y: 1 });
		expect(session.progressionIndex).toBe(1);
	});

	it("marks entered areas and syncs enter-area quest objectives", () => {
		const session = createRuntimeSession(
			makeProject({
				quests: [
					{
						id: "visit-second-area",
						name: "Visit Second Area",
						status: "active",
						objectives: [
							{
								id: "enter",
								description: "Enter the second area",
								condition: { type: "enter_area", areaId: "area_two" },
							},
						],
					},
				],
			}),
		);
		const { emit, events } = collectEvents();

		transitionRuntimeArea(session, "area_two", "entry", emit);

		expect(session.runtimeQuestState.enteredAreaIds.has("area_two")).toBe(true);
		expect(session.runtimeQuestState.quests[0].status).toBe("completed");
		expect(
			events.some(
				(event) =>
					event.type === "questsChanged" &&
					event.quests[0]?.objectives[0]?.complete === true,
			),
		).toBe(true);
	});

	it("marks the current area entered without performing a transition", () => {
		const session = createRuntimeSession(
			makeProject({
				quests: [
					{
						id: "visit-start-area",
						name: "Visit Start Area",
						status: "active",
						objectives: [
							{
								id: "enter",
								description: "Enter the start area",
								condition: { type: "enter_area", areaId: "area_one" },
							},
						],
					},
				],
			}),
		);
		const { emit, events } = collectEvents();

		markRuntimeAreaEntered(session, "area_one", emit);

		expect(session.currentAreaId).toBe("area_one");
		expect(session.playerPosition).toEqual({ x: 0, y: 0 });
		expect(session.runtimeQuestState.enteredAreaIds.has("area_one")).toBe(true);
		expect(
			events.some(
				(event) =>
					event.type === "questsChanged" &&
					event.quests[0]?.objectives[0]?.complete === true,
			),
		).toBe(true);
		expect(events.some((event) => event.type === "areaChanged")).toBe(false);
		expect(events.some((event) => event.type === "spawnPlayer")).toBe(false);
	});

	it("waits for trigger progression until the matching trigger is reached", () => {
		const session = createRuntimeSession(
			makeProject({
				progression: [
					{
						id: "wait-step",
						action: {
							type: "wait_for_trigger",
							areaId: "area_one",
							eventBlockId: "goal",
						},
					},
					{ id: "end-step", action: { type: "end_game" } },
				],
			}),
		);
		const { emit, events } = collectEvents();

		processRuntimeProgression(session, emit);

		expect(session.waitingForTrigger).toEqual({
			areaId: "area_one",
			eventBlockId: "goal",
		});
		expect(session.progressionIndex).toBe(0);
		expect(events.some((event) => event.type === "endGame")).toBe(false);
	});

	it("continues progression when the matching waiting trigger is touched", () => {
		const session = createRuntimeSession(
			makeProject({
				progression: [
					{
						id: "wait-step",
						action: {
							type: "wait_for_trigger",
							areaId: "area_one",
							eventBlockId: "goal",
						},
					},
					{ id: "end-step", action: { type: "end_game" } },
				],
			}),
		);
		const { emit, events } = collectEvents();
		processRuntimeProgression(session, emit);
		session.playerPosition = { x: 1, y: 1 };

		const advanced = checkRuntimeWaitingTrigger(session, emit);

		expect(advanced).toBe(true);
		expect(session.waitingForTrigger).toBeNull();
		expect(session.progressionIndex).toBe(2);
		expect(events.some((event) => event.type === "endGame")).toBe(true);
	});

	it("emits end game events", () => {
		const session = createRuntimeSession(
			makeProject({
				progression: [{ id: "end-step", action: { type: "end_game" } }],
			}),
		);
		const { emit, events } = collectEvents();

		processRuntimeProgression(session, emit);

		expect(events).toContainEqual({ type: "endGame" });
		expect(session.progressionIndex).toBe(1);
	});

	it("does not import renderer or editor modules", () => {
		expect(progressionSource).not.toMatch(
			/from\s+["'][^"']*(phaser|three|react|editor|store)/i,
		);
	});
});
