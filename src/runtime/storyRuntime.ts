import {
	resolveStoryMapPosition,
	storyNodeCatalogue,
	validateStoryGraph,
} from "../story/storyCatalogue";
import type {
	GameAction,
	StoryEdge,
	StoryGraph,
	StoryNode,
} from "../types/game";
import { isPlayerAirborne } from "./playerLocomotion";
import { completeQuestObjective } from "./questEngine";
import { evaluateCondition, runAction } from "./ruleEngine";
import {
	moveRuntimePlayer,
	type RuntimeProgressionEventEmitter,
	syncRuntimeQuestProgress,
} from "./runtimeProgression";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEventEmitter,
} from "./runtimeRuleActionDispatcher";
import type { RuntimeSessionState } from "./runtimeSession";

export type StoryEvent =
	| { type: "newGame" }
	| { type: "areaEnter"; areaId: string }
	| { type: "questStart" | "questComplete"; questId: string }
	| { type: "flagChanged"; flagId: string }
	| { type: "mapEvent"; areaId: string; eventBlockId: string }
	| { type: "npc"; areaId: string; npcId: string }
	| { type: "enemy"; areaId: string; npcId: string }
	| { type: "item"; itemId: string }
	| {
			type: "dialogueChoice";
			dialogueId: string;
			nodeId: string;
			choiceId: string;
	  }
	| {
			type: "cinematic";
			cinematicId: string;
			outcome: "finished" | "skipped";
			playbackId?: string;
	  }
	| { type: "location" };

export type StoryCursor = {
	graphId: string;
	entryId: string;
	nodeId?: string;
	status: "running" | "waiting" | "completed" | "blocked";
	remainingMs?: number;
	playing?: boolean;
	detail?: string;
};

export type StoryProgress = {
	cursors: StoryCursor[];
	effects: { graphId: string; nodeId: string }[];
};

export type StoryDebugSnapshot = Omit<
	StoryCursor,
	"entryId" | "remainingMs" | "playing"
>[];

type CompiledGraph = {
	graph: StoryGraph;
	nodes: Map<string, StoryNode>;
	links: Map<string, Map<StoryEdge["port"], string>>;
	entries: StoryNode[];
};

export type RuntimeStoryState = StoryProgress & {
	graphs: CompiledGraph[];
	events: StoryEvent[];
	position: { areaId: string; x: number; y: number };
	flags: Map<string, boolean>;
	quests: Map<string, string>;
	items: Map<string, number>;
	enemies: Map<string, string>;
	debugRevision: string;
};

export type StoryRuntimeHost = {
	emitRule: RuntimeRuleEventEmitter;
	emitProgression: RuntimeProgressionEventEmitter;
	canPresent: () => boolean;
	onDebug?: (snapshot: StoryDebugSnapshot) => void;
};

const STEPS_PER_TICK = 512;
const MAX_PENDING_EVENTS = 512;

export function initializeRuntimeStory(
	session: RuntimeSessionState,
	fresh: boolean,
	progress?: StoryProgress,
) {
	const definitions = session.project.storyGraphs;
	if (!definitions?.length || session.story) return;
	const state: RuntimeStoryState = {
		cursors: progress?.cursors.map((cursor) => ({ ...cursor })) ?? [],
		effects: progress?.effects.map((effect) => ({ ...effect })) ?? [],
		graphs: [],
		events: fresh ? [{ type: "newGame" }] : [],
		position: { areaId: session.currentAreaId, ...session.playerPosition },
		flags: new Map(),
		quests: new Map(),
		items: new Map(),
		enemies: new Map(),
		debugRevision: "",
	};
	for (const graph of definitions) {
		const error = validateStoryGraph(session.project, graph).find(
			(entry) => entry.severity === "error",
		);
		if (error) {
			if (!state.cursors.some((cursor) => cursor.graphId === graph.id))
				state.cursors.push({
					graphId: graph.id,
					entryId: "",
					status: "blocked",
					detail: error.message,
				});
			continue;
		}
		const links: CompiledGraph["links"] = new Map();
		for (const edge of graph.edges) {
			const outputs = links.get(edge.from) ?? new Map();
			outputs.set(edge.port, edge.to);
			links.set(edge.from, outputs);
		}
		state.graphs.push({
			graph,
			nodes: new Map(graph.nodes.map((node) => [node.id, node])),
			links,
			entries: graph.nodes.filter(
				(node) => !storyNodeCatalogue[node.type].input,
			),
		});
		for (const node of graph.nodes) {
			if (node.type === "flagChanged")
				state.flags.set(
					node.data.flagId,
					session.runtimeState.flags[node.data.flagId] ?? false,
				);
			if (node.type === "waitItem")
				state.items.set(
					node.data.itemId,
					session.runtimeState.inventory.items[node.data.itemId] ?? 0,
				);
			if (
				node.type === "waitEnemy" &&
				!session.defeatedNpcIds.has(node.data.npcId)
			)
				state.enemies.set(node.data.npcId, node.data.areaId);
			if (node.type === "questStart" || node.type === "questComplete") {
				const quest = session.runtimeQuestState.quests.find(
					(entry) => entry.id === node.data.questId,
				);
				if (quest) state.quests.set(quest.id, quest.status);
			}
		}
	}
	session.story = state;
}

export function queueStoryEvent(
	session: RuntimeSessionState,
	event: StoryEvent,
) {
	const events = session.story?.events;
	if (events && events.length < MAX_PENDING_EVENTS) events.push(event);
}

function observeState(session: RuntimeSessionState, story: RuntimeStoryState) {
	const areaId = session.currentAreaId;
	const { x, y } = session.playerPosition;
	const previous = story.position;
	if (
		story.events[0]?.type !== "newGame" &&
		!isPlayerAirborne(session) &&
		(previous.areaId !== areaId || previous.x !== x || previous.y !== y)
	) {
		story.position = { areaId, x, y };
		if (previous.areaId !== areaId)
			queueStoryEvent(session, { type: "areaEnter", areaId });
		queueStoryEvent(session, { type: "location" });
		const area = session.project.areas.find((entry) => entry.id === areaId);
		for (const marker of area?.eventBlocks ?? [])
			if (marker.kind !== "spawn" && marker.x === x && marker.y === y)
				queueStoryEvent(session, {
					type: "mapEvent",
					areaId,
					eventBlockId: marker.id,
				});
	}
	for (const [flagId, previousValue] of story.flags) {
		const value = session.runtimeState.flags[flagId] ?? false;
		if (previousValue === value) continue;
		story.flags.set(flagId, value);
		queueStoryEvent(session, { type: "flagChanged", flagId });
	}
	for (const [itemId, previousCount] of story.items) {
		const count = session.runtimeState.inventory.items[itemId] ?? 0;
		story.items.set(itemId, count);
		if (count > previousCount)
			queueStoryEvent(session, { type: "item", itemId });
	}
	for (const [npcId, npcArea] of story.enemies) {
		if (!session.defeatedNpcIds.has(npcId)) continue;
		story.enemies.delete(npcId);
		queueStoryEvent(session, { type: "enemy", areaId: npcArea, npcId });
	}
	for (const quest of session.runtimeQuestState.quests) {
		if (
			!story.quests.has(quest.id) ||
			story.quests.get(quest.id) === quest.status
		)
			continue;
		story.quests.set(quest.id, quest.status);
		if (quest.status === "active")
			queueStoryEvent(session, { type: "questStart", questId: quest.id });
		if (quest.status === "completed")
			queueStoryEvent(session, { type: "questComplete", questId: quest.id });
	}
}

function matchesEntry(node: StoryNode, event: StoryEvent): boolean {
	switch (node.type) {
		case "newGame":
			return event.type === "newGame";
		case "areaEnter":
			return event.type === "areaEnter" && event.areaId === node.data.areaId;
		case "questStart":
		case "questComplete":
			return event.type === node.type && event.questId === node.data.questId;
		case "flagChanged":
			return event.type === "flagChanged" && event.flagId === node.data.flagId;
		case "mapEvent":
			return (
				event.type === "mapEvent" &&
				event.areaId === node.data.areaId &&
				event.eventBlockId === node.data.eventBlockId
			);
		default:
			return false;
	}
}

function matchesWait(
	session: RuntimeSessionState,
	node: StoryNode,
	event: StoryEvent,
): boolean {
	switch (node.type) {
		case "waitNpc":
		case "waitEnemy":
			return (
				(event.type === "npc" || event.type === "enemy") &&
				event.type === (node.type === "waitNpc" ? "npc" : "enemy") &&
				event.areaId === node.data.areaId &&
				event.npcId === node.data.npcId
			);
		case "waitItem":
			return event.type === "item" && event.itemId === node.data.itemId;
		case "waitDialogueChoice":
			return (
				event.type === "dialogueChoice" &&
				event.dialogueId === node.data.dialogueId &&
				event.nodeId === node.data.nodeId &&
				event.choiceId === node.data.choiceId
			);
		case "cinematic":
		case "waitCinematic":
			return (
				event.type === "cinematic" &&
				event.cinematicId === node.data.cinematicId
			);
		case "waitLocation": {
			if (
				event.type !== "location" ||
				session.currentAreaId !== node.data.areaId
			)
				return false;
			const target = resolveStoryMapPosition(session.project, node.data);
			return (
				!!target &&
				Math.hypot(
					session.playerPosition.x - target.x,
					session.playerPosition.y - target.y,
				) <= node.data.radius
			);
		}
		default:
			return false;
	}
}

function branchResult(
	session: RuntimeSessionState,
	node: StoryNode,
): boolean | undefined {
	const { runtimeState } = session;
	switch (node.type) {
		case "hasItem":
			return evaluateCondition(
				{ id: node.id, type: "has_item", ...node.data },
				runtimeState,
			);
		case "questState": {
			const { questId, status } = node.data;
			return session.runtimeQuestState.quests.some(
				(quest) => quest.id === questId && quest.status === status,
			);
		}
		case "flagSet":
			return evaluateCondition(
				{ id: node.id, type: "flag_is", flag: node.data.flagId, value: true },
				runtimeState,
			);
		case "compareVariable":
			return evaluateCondition(
				{
					id: node.id,
					type: "variable_compare",
					variable: node.data.variableId,
					operator: node.data.operator,
					value: node.data.value,
				},
				runtimeState,
			);
		case "inArea":
			return session.currentAreaId === node.data.areaId;
		default:
			return undefined;
	}
}

function ruleAction(node: StoryNode): GameAction | undefined {
	switch (node.type) {
		case "startQuest":
			return { type: "activate_quest", questId: node.data.questId };
		case "completeQuest":
			return { type: "complete_quest", questId: node.data.questId };
		case "setFlag":
			return {
				type: "set_flag",
				flag: node.data.flagId,
				value: node.data.value,
			};
		case "setVariable":
			return {
				type: "set_variable",
				variable: node.data.variableId,
				value: node.data.value,
			};
		case "giveItem":
			return { type: "give_item", ...node.data };
		default:
			return undefined;
	}
}

function moveCursor(
	cursor: StoryCursor,
	compiled: CompiledGraph,
	port: StoryEdge["port"],
) {
	const next = cursor.nodeId
		? compiled.links.get(cursor.nodeId)?.get(port)
		: undefined;
	cursor.nodeId = next;
	cursor.status = next ? "running" : "completed";
	cursor.playing = undefined;
	cursor.remainingMs = undefined;
}

function alreadyApplied(
	story: RuntimeStoryState,
	graphId: string,
	nodeId: string,
) {
	return story.effects.some(
		(effect) => effect.graphId === graphId && effect.nodeId === nodeId,
	);
}

function playbackId(cursor: StoryCursor) {
	return JSON.stringify([cursor.graphId, cursor.entryId, cursor.nodeId]);
}

function advanceCursor(
	session: RuntimeSessionState,
	story: RuntimeStoryState,
	host: StoryRuntimeHost,
	compiled: CompiledGraph,
	cursor: StoryCursor,
	budget: { steps: number },
	event?: StoryEvent,
	deltaMs = 0,
) {
	while (
		cursor.nodeId &&
		(cursor.status === "running" || cursor.status === "waiting")
	) {
		const node = compiled.nodes.get(cursor.nodeId);
		if (!node) {
			cursor.status = "blocked";
			cursor.detail = "Current node is missing.";
			return;
		}
		if (cursor.status === "waiting") {
			if (node.type === "delay") {
				cursor.remainingMs = Math.max(
					0,
					(cursor.remainingMs ?? node.data.seconds * 1000) - deltaMs,
				);
				if (cursor.remainingMs > 0) return;
			} else {
				if (!event || !matchesWait(session, node, event)) return;
				if (
					node.type === "cinematic" &&
					event.type === "cinematic" &&
					event.playbackId !== playbackId(cursor)
				)
					return;
				if (event.type === "cinematic")
					cursor.detail = `Cinematic ${event.outcome}.`;
			}
			moveCursor(cursor, compiled, "next");
			// A later wait always observes a later event, even when looping.
			event = undefined;
			deltaMs = 0;
			continue;
		}
		if (--budget.steps < 0) return;
		if (node.type === "cinematic") {
			if (!host.canPresent()) return;
			const cutscene = session.project.cutscenes.find(
				(entry) => entry.id === node.data.cinematicId,
			);
			if (cutscene?.cinematic?.areaId !== session.currentAreaId) {
				cursor.status = "blocked";
				cursor.detail =
					"Cinematic requires the player to be in its authored area.";
				return;
			}
			cursor.status = "waiting";
			cursor.playing = true;
			host.emitRule({
				type: "cutsceneRequested",
				cutsceneId: node.data.cinematicId,
				storyPlaybackId: playbackId(cursor),
				onDone: () => {},
			});
			return;
		}
		if (node.type === "delay" || node.type.startsWith("wait")) {
			cursor.status = "waiting";
			if (node.type === "delay") cursor.remainingMs = node.data.seconds * 1000;
			return;
		}
		if (node.type === "end") {
			cursor.nodeId = undefined;
			cursor.status = "completed";
			return;
		}
		const branch = branchResult(session, node);
		if (branch !== undefined) {
			cursor.detail = branch ? "Condition was True." : "Condition was False.";
			moveCursor(cursor, compiled, branch ? "true" : "false");
			continue;
		}
		const once = storyNodeCatalogue[node.type].once;
		if (once && alreadyApplied(story, cursor.graphId, node.id)) {
			if (node.type === "once") {
				cursor.nodeId = undefined;
				cursor.status = "completed";
				return;
			}
			moveCursor(cursor, compiled, "next");
			continue;
		}
		if (node.type === "spawn" || node.type === "teleport") {
			if (!host.canPresent()) return;
			const position = resolveStoryMapPosition(session.project, node.data);
			if (!position) {
				cursor.status = "blocked";
				cursor.detail = "Map target is unavailable.";
				return;
			}
			moveRuntimePlayer(
				session,
				node.data.areaId,
				position,
				host.emitProgression,
				node.data.target?.type === "eventBlock"
					? node.data.target.id
					: undefined,
			);
		}
		if (node.type === "objective") {
			const { questId, objectiveId } = node.data;
			if (
				!completeQuestObjective(session.runtimeQuestState, questId, objectiveId)
			) {
				cursor.status = "blocked";
				cursor.detail =
					"Objective is unavailable. Start its quest and complete preceding objectives first.";
				return;
			}
			syncRuntimeQuestProgress(session, host.emitProgression);
		}
		if (node.type === "notify")
			host.emitRule({ type: "itemFeedback", message: node.data.message });
		const action = ruleAction(node);
		if (action)
			runAction(
				action,
				createRuntimeRuleContext(session, host.emitRule),
				() => {},
			);
		if (once) story.effects.push({ graphId: cursor.graphId, nodeId: node.id });
		moveCursor(cursor, compiled, "next");
	}
}

export function tickRuntimeStory(
	session: RuntimeSessionState,
	host: StoryRuntimeHost,
	deltaMs = 0,
) {
	const story = session.story;
	if (!story || session.startupPending) return;
	const budget = { steps: STEPS_PER_TICK };
	observeState(session, story);
	const count = story.events.length;
	for (const compiled of story.graphs) {
		for (const cursor of story.cursors) {
			if (cursor.graphId !== compiled.graph.id) continue;
			advanceCursor(
				session,
				story,
				host,
				compiled,
				cursor,
				budget,
				undefined,
				deltaMs,
			);
		}
	}
	for (let index = 0; index < count && budget.steps > 0; index += 1) {
		const event = story.events.shift();
		if (!event) break;
		for (const compiled of story.graphs) {
			for (const cursor of story.cursors) {
				if (cursor.graphId !== compiled.graph.id) continue;
				advanceCursor(session, story, host, compiled, cursor, budget, event);
			}
			for (const entry of compiled.entries) {
				if (!matchesEntry(entry, event)) continue;
				let cursor = story.cursors.find(
					(value) =>
						value.graphId === compiled.graph.id && value.entryId === entry.id,
				);
				if (
					cursor &&
					(cursor.status !== "completed" || entry.type === "newGame")
				)
					continue;
				if (!cursor) {
					cursor = {
						graphId: compiled.graph.id,
						entryId: entry.id,
						status: "running",
					};
					story.cursors.push(cursor);
				}
				cursor.nodeId = entry.id;
				cursor.status = "running";
				cursor.detail = undefined;
				advanceCursor(session, story, host, compiled, cursor, budget);
			}
		}
		if (event.type === "newGame") {
			const areaId = session.currentAreaId;
			story.position = { areaId, ...session.playerPosition };
			queueStoryEvent(session, { type: "areaEnter", areaId });
		}
	}
	if (budget.steps < 0) {
		for (const cursor of story.cursors) {
			if (cursor.status !== "running") continue;
			cursor.status = "blocked";
			cursor.detail = "Story execution exceeded the per-tick step limit.";
		}
	}
	if (host.onDebug) {
		const snapshot = story.cursors.map(
			({ graphId, nodeId, status, detail }) => ({
				graphId,
				nodeId,
				status,
				detail,
			}),
		);
		const revision = JSON.stringify(snapshot);
		if (revision !== story.debugRevision) {
			story.debugRevision = revision;
			host.onDebug(snapshot);
		}
	}
}
