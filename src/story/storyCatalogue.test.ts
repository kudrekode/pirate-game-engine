import { describe, expect, it } from "vitest";
import { defaultProject } from "../data/defaultProject";
import type { StoryEdge, StoryGraph, StoryNode } from "../types/game";
import {
	isKnownStoryNode,
	resolveStoryMapPosition,
	storyFieldOptions,
	storyMapPositions,
	storyNodeCatalogue,
	validateStoryGraph,
} from "./storyCatalogue";

function graph(nodes: StoryNode[], edges: StoryEdge[]): StoryGraph {
	return { id: "test", name: "Test", kind: "opening", nodes, edges };
}

function connect(
	from: string,
	to: string,
	port: StoryEdge["port"] = "next",
): StoryEdge {
	return { id: `${from}-${port}-${to}`, from, to, port };
}

const base = { x: 0, y: 0 };
const entry = { ...base, id: "entry", type: "newGame", data: {} } as const;
const end = { ...base, id: "end", type: "end", data: {} } as const;
const branch = {
	...base,
	id: "branch",
	type: "hasItem",
	data: { itemId: defaultProject.items[0].id, quantity: 1 },
} as const;
const waitItem = {
	...base,
	id: "wait",
	type: "waitItem",
	data: { itemId: defaultProject.items[0].id },
} as const;

describe("Story graph catalogue", () => {
	it("accepts an item wait loop and rejects a synchronous branch loop", () => {
		const story = graph(
			[entry, branch, waitItem, end],
			[
				connect("entry", "branch"),
				connect("branch", "end", "true"),
				connect("branch", "wait", "false"),
				connect("wait", "branch"),
			],
		);
		expect(validateStoryGraph(defaultProject, story)).toEqual([]);
		story.edges[1] = connect("branch", "branch", "true");
		expect(validateStoryGraph(defaultProject, story)).toContainEqual({
			severity: "error",
			message: expect.stringContaining("This loop can run continuously"),
			nodeId: "branch",
			edgeId: "branch-true-branch",
		});
	});

	it("supports a loop whose back edge crosses an explicit Once node", () => {
		const once = { ...base, id: "once", type: "once", data: {} } as const;
		const story = graph(
			[entry, once, branch, end],
			[
				connect("entry", "once"),
				connect("once", "branch"),
				connect("branch", "end", "true"),
				connect("branch", "once", "false"),
			],
		);
		expect(validateStoryGraph(defaultProject, story)).toEqual([]);
	});

	it("diagnoses ports, duplicate outputs and missing endpoints", () => {
		const story = graph(
			[entry, branch, waitItem, end],
			[
				connect("entry", "branch", "false"),
				connect("wait", "entry"),
				connect("branch", "end", "true"),
				connect("branch", "wait", "true"),
				connect("branch", "missing", "false"),
			],
		);
		const diagnostics = validateStoryGraph(defaultProject, story);
		for (const edge of story.edges.filter(
			(edge) => edge.id !== "branch-true-end",
		)) {
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ severity: "error", edgeId: edge.id }),
				]),
			);
		}
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				severity: "warning",
				nodeId: "wait",
				message: "Node cannot be reached from an entry.",
			}),
		);
	});

	it("finds invalid references and duplicate once-per-session effects", () => {
		const firstGift = { ...branch, id: "gift1", type: "giveItem" } as const;
		const secondGift = { ...firstGift, id: "gift2" };
		const missingItem = { ...waitItem, data: { itemId: "deleted" } };
		const story = graph(
			[entry, firstGift, secondGift, missingItem, end],
			[
				connect("entry", "gift1"),
				connect("gift1", "gift2"),
				connect("gift2", "wait"),
				connect("wait", "end"),
			],
		);
		expect(validateStoryGraph(defaultProject, story)).toEqual([
			{
				severity: "warning",
				message: expect.stringContaining("Duplicate one-time action"),
				nodeId: "gift2",
			},
			{
				severity: "error",
				message: 'Item "deleted" is unavailable for this node.',
				nodeId: "wait",
			},
		]);
	});

	it("resolves the current map marker coordinates and catches deleted targets", () => {
		const project = structuredClone(defaultProject);
		const area = project.areas[0];
		const marker = {
			id: "arrival-marker",
			name: "Cottage Lane",
			x: 3,
			y: 4,
			kind: "spawn",
			tag: "",
		} as const;
		area.eventBlocks.push({ ...marker });
		const spawn = {
			...base,
			id: "spawn",
			type: "spawn",
			data: {
				areaId: area.id,
				x: 0,
				y: 0,
				target: { type: "eventBlock", id: marker.id },
			},
		} as const;
		const story = graph(
			[entry, spawn, end],
			[connect("entry", "spawn"), connect("spawn", "end")],
		);
		expect(storyMapPositions(project, spawn)).toContainEqual(
			expect.objectContaining({
				entityId: marker.id,
				label: "Cottage Lane (3, 4)",
			}),
		);
		expect(resolveStoryMapPosition(project, spawn.data)).toEqual({
			x: 3,
			y: 4,
		});
		area.eventBlocks[area.eventBlocks.length - 1].x = 8;
		expect(resolveStoryMapPosition(project, spawn.data)).toEqual({
			x: 8,
			y: 4,
		});
		expect(validateStoryGraph(project, story)).toEqual([]);
		area.eventBlocks.pop();
		expect(validateStoryGraph(project, story)[0]).toMatchObject({
			severity: "error",
			nodeId: "spawn",
			message: expect.stringContaining(marker.id),
		});
	});

	it("filters real dialogue responses by their parent choice node", () => {
		const project = structuredClone(defaultProject);
		project.dialogues.push({
			id: "oswin",
			name: "Oswin's offer",
			startNodeId: "offer",
			nodes: [
				{
					id: "offer",
					type: "choice",
					text: "Help?",
					choices: [{ id: "accept", text: "Yes", targetNodeId: "leave" }],
				},
				{ id: "leave", type: "end" },
			],
		});
		const wait = {
			...base,
			id: "response",
			type: "waitDialogueChoice",
			data: { dialogueId: "oswin", nodeId: "offer", choiceId: "accept" },
		} as const;
		const [, nodeField, choiceField] =
			storyNodeCatalogue.waitDialogueChoice.fields;
		expect(storyFieldOptions(project, wait, nodeField)).toEqual([
			{ value: "offer", label: "Help?" },
		]);
		expect(storyFieldOptions(project, wait, choiceField)).toEqual([
			{ value: "accept", label: "Yes" },
		]);
		expect(isKnownStoryNode("waitDialogueChoice")).toBe(true);
		expect(isKnownStoryNode("constructor")).toBe(false);
	});
});
