import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import type { GameArea, GameProject, GameRule } from "../types/game";
import { fireTrigger } from "./ruleEngine";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEvent,
} from "./runtimeRuleActionDispatcher";
import dispatcherSource from "./runtimeRuleActionDispatcher.ts?raw";
import { createRuntimeSession } from "./runtimeSession";

function makeArea(): GameArea {
	return {
		id: "area_test",
		name: "Test Area",
		kind: "outdoor",
		width: 2,
		height: 2,
		tileSize: 32,
		terrainTiles: [{ x: 0, y: 0, tileId: "grass" }],
		overlayTiles: [],
		structures: [],
		objects: [],
		pickups: [],
		npcs: [],
		eventBlocks: [
			{
				id: "entry",
				name: "Entry",
				x: 0,
				y: 0,
				tag: "entry",
				kind: "spawn",
			},
		],
	};
}

function makeProject(patch: Partial<GameProject> = {}): GameProject {
	const project = cloneProject(defaultProject);
	project.activeAreaId = "area_test";
	project.areas = [makeArea()];
	project.gameState = { flags: {}, variables: {}, inventory: {} };
	project.items = [
		{
			id: "gem",
			name: "Gem",
			category: "quest",
			stackable: true,
			maxStack: 99,
		},
		{
			id: "coin",
			name: "Coin",
			category: "currency",
			stackable: true,
			maxStack: 99,
		},
	];
	project.quests = [];
	project.shops = [];
	project.cutscenes = [];
	project.rules = [];
	return { ...project, ...patch };
}

function runRule(project: GameProject, rule: GameRule) {
	project.rules = [rule];
	const session = createRuntimeSession(project);
	const events: RuntimeRuleEvent[] = [];
	fireTrigger(
		{ type: "on_game_start" },
		session.project.rules,
		createRuntimeRuleContext(session, (event) => events.push(event)),
	);
	return { events, session };
}

function makeRule(actions: GameRule["actions"]): GameRule {
	return {
		id: "rule",
		name: "Rule",
		enabled: true,
		trigger: { type: "on_game_start" },
		actions,
	};
}

describe("runtime rule action dispatcher", () => {
	it("updates flags and emits state events", () => {
		const { events, session } = runRule(
			makeProject(),
			makeRule([{ type: "set_flag", flag: "intro_seen", value: true }]),
		);

		expect(session.runtimeState.flags.intro_seen).toBe(true);
		expect(events.some((event) => event.type === "stateChanged")).toBe(true);
		expect(events.some((event) => event.type === "flowLog")).toBe(true);
	});

	it("gives items and syncs quest objectives", () => {
		const { events, session } = runRule(
			makeProject({
				quests: [
					{
						id: "bring-gem",
						name: "Bring Gem",
						status: "active",
						objectives: [
							{
								id: "has-gem",
								description: "Find a gem",
								condition: { type: "has_item", itemId: "gem", quantity: 1 },
							},
						],
					},
				],
			}),
			makeRule([{ type: "give_item", itemId: "gem", quantity: 1 }]),
		);

		expect(session.runtimeState.inventory.items.gem).toBe(1);
		expect(session.runtimeQuestState.quests[0].status).toBe("completed");
		expect(
			events.some(
				(event) =>
					event.type === "questsChanged" &&
					event.quests[0]?.objectives[0]?.complete === true,
			),
		).toBe(true);
	});

	it("activates quests", () => {
		const { events, session } = runRule(
			makeProject({
				quests: [
					{
						id: "intro",
						name: "Intro",
						status: "inactive",
						objectives: [],
					},
				],
			}),
			makeRule([{ type: "activate_quest", questId: "intro" }]),
		);

		expect(session.runtimeQuestState.quests[0].status).toBe("active");
		expect(events.some((event) => event.type === "questsChanged")).toBe(true);
	});

	it("completes quests and grants rewards once", () => {
		const project = makeProject({
			quests: [
				{
					id: "rewarded",
					name: "Rewarded",
					status: "active",
					objectives: [],
					rewards: [{ type: "item", itemId: "coin", quantity: 2 }],
				},
			],
		});
		const rule = makeRule([{ type: "complete_quest", questId: "rewarded" }]);
		project.rules = [rule];
		const session = createRuntimeSession(project);
		const events: RuntimeRuleEvent[] = [];
		const context = createRuntimeRuleContext(session, (event) =>
			events.push(event),
		);

		fireTrigger({ type: "on_game_start" }, session.project.rules, context);
		fireTrigger({ type: "on_game_start" }, session.project.rules, context);

		expect(session.runtimeQuestState.quests[0].status).toBe("completed");
		expect(session.runtimeState.inventory.items.coin).toBe(2);
		expect(
			events.filter((event) => event.type === "questRewardsGranted"),
		).toHaveLength(1);
	});

	it("emits cutscene request events", () => {
		const { events } = runRule(
			makeProject({
				cutscenes: [
					{
						id: "intro",
						name: "Intro",
						backgroundImageId: "forest_path",
						text: "Welcome.",
					},
				],
			}),
			makeRule([{ type: "play_cutscene", cutsceneId: "intro" }]),
		);

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "cutsceneRequested",
				cutsceneId: "intro",
			}),
		);
	});

	it("emits open shop request events", () => {
		const { events, session } = runRule(
			makeProject({
				shops: [
					{
						id: "general",
						name: "General Store",
						currencyItemId: "coin",
						entries: [],
					},
				],
			}),
			makeRule([{ type: "open_shop", shopId: "general" }]),
		);

		expect(session.activeShopId).toBe("general");
		expect(events).toContainEqual(
			expect.objectContaining({ type: "shopOpened", shopId: "general" }),
		);
	});

	it("emits teleport request events", () => {
		const { events } = runRule(
			makeProject(),
			makeRule([
				{ type: "teleport", areaId: "area_test", eventBlockId: "entry" },
			]),
		);

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "teleportRequested",
				areaId: "area_test",
				eventBlockId: "entry",
			}),
		);
	});

	it("does not import renderer or editor modules", () => {
		expect(dispatcherSource).not.toMatch(
			/from\s+["'][^"']*(phaser|three|react|editor|store)/i,
		);
	});
});
