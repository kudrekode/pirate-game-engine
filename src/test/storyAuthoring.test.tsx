import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DIALOGUE_ENTITY_MIME,
	type DialogueEntityRef,
} from "../editor/sections/dialogueEntities";
import { ProgressionEditor } from "../editor/sections/ProgressionEditor";
import { QuestsEditor } from "../editor/sections/QuestsEditor";
import { StoryWorkspace } from "../editor/sections/StoryWorkspace";
import { useProjectStore } from "../store/useProjectStore";
import { createStoryAuthoringDemo } from "./storyAuthoringDemo";

const project = () => useProjectStore.getState().project;
const click = async (
	name: string | RegExp,
	root: HTMLElement = document.body,
) =>
	act(async () => {
		fireEvent.click(within(root).getByRole("button", { name }));
	});
const change = async (
	label: string,
	value: string,
	root: HTMLElement = document.body,
) =>
	act(async () => {
		fireEvent.change(within(root).getByLabelText(label, { exact: true }), {
			target: { value },
		});
	});
const drop = async (label: string, ref: DialogueEntityRef) =>
	act(async () => {
		fireEvent.drop(screen.getByLabelText(label, { exact: true }), {
			dataTransfer: {
				types: [DIALOGUE_ENTITY_MIME],
				getData: () => JSON.stringify(ref),
			},
		});
	});
beforeEach(() => {
	useProjectStore.getState().openEditorSource(null);
	useProjectStore.getState().setStoryFocusKey("");
	useProjectStore.getState().setProject(createStoryAuthoringDemo());
	vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("Quest Sequence authoring", () => {
	it("wires exact world entities, reorders with stable IDs, undoes and opens the source", async () => {
		render(<QuestsEditor />);
		const areaId = project().areas[0].id;
		for (const [ref, operation] of [
			[{ kind: "npc", areaId, id: "keeper_placed" }, "Finish talking"],
			[{ kind: "item", id: "harbour_key" }, "Have item"],
			[{ kind: "object", areaId, id: "gate_placed" }, "Successfully use door"],
		] as [DialogueEntityRef, string][]) {
			await drop("Add objective from entity", ref);
			await click(operation);
		}
		const before = structuredClone(project());
		expect(before.quests[0].objectives.map((o) => o.condition.type)).toEqual([
			"interaction_completed",
			"has_item",
			"door_used",
		]);
		await click("Move objective 2 down");
		expect(project().quests[0].objectives[2].id).toBe(
			before.quests[0].objectives[1].id,
		);
		await click("Undo");
		expect(project()).toEqual(before);
		await click(
			"Show on map",
			screen.getByLabelText("Objective 1 text").closest("article")!,
		);
		expect(useProjectStore.getState().requestedEditorSource).toEqual({
			section: "map",
			id: "keeper_placed",
			areaId,
		});
		expect(project()).toEqual(before);
	});
	it("creates and references state atomically and preserves independent mode on view load", async () => {
		useProjectStore.getState().updateProject((p) => {
			p.quests[0].objectiveMode = undefined;
		});
		render(<QuestsEditor />);
		const before = structuredClone(project());
		const slot = screen.getByLabelText("Add objective from entity");
		await click("Choose or create…", slot);
		await click("Create entity here", slot);
		await change("Create", "flag", slot);
		await change("Entity name", "Passage reported", slot);
		await click("Create and insert", slot);
		expect(project()).toEqual(before);
		await click("Story state is Yes");
		expect(project().quests[0].objectives[0].condition).toEqual({
			type: "flag",
			flag: "passage_reported",
			value: true,
		});
		expect(project().quests[0].objectiveMode).toBeUndefined();
		await click("Undo");
		expect(project()).toEqual(before);
	});
});

describe("Logic Blocks authoring", () => {
	it("wires a condition and trigger, nests and moves it, preserves Advanced and undoes", async () => {
		render(<ProgressionEditor />);
		await click("Add rule");
		await drop("Choose WHEN entity", {
			kind: "object",
			areaId: project().areas[0].id,
			id: "gate_placed",
		});
		await click("Player interacts with target");
		expect(screen.getByText(/This rule runs in addition/)).toBeInTheDocument();
		await drop("Add IF condition", { kind: "item", id: "harbour_key" });
		await click("Have item");
		await click("Add ANY group");
		const rule = project().rules[0];
		if (rule.conditionTree?.type !== "group") throw Error();
		const [item, group] = rule.conditionTree.conditions;
		await change("Move IF.1 to group", group.id);
		const moved = project().rules[0];
		expect(
			moved.conditionTree?.type === "group" &&
				moved.conditionTree.conditions[0].type === "group" &&
				moved.conditionTree.conditions[0].conditions[0].id,
		).toBe(item.id);
		const before = structuredClone(project());
		await click("Advanced");
		await click("Blocks");
		expect(project()).toEqual(before);
		await click("Undo");
		expect(project().rules[0]).toEqual(rule);
		await drop("Add IF condition", { kind: "quest", id: "keeper_job" });
		expect(
			screen.getByText("Quest status checks are not supported in Logic yet."),
		).toBeInTheDocument();
	});
});

describe("Story Workspace", () => {
	it("creates an unfinished quest inside the shared Quest Giver recipe and undoes all records", async () => {
		render(<StoryWorkspace />);
		const before = structuredClone(project());
		await click("Quest Giver — Yes / No");
		const dialog = screen.getByRole("dialog", {
			name: "Quest Giver — Yes / No",
		});
		await change("Quest", "__new__", dialog);
		await change("New quest name", "Guard duty", dialog);
		await click("Preview recipe", dialog);
		expect(project()).toEqual(before);
		expect(
			within(dialog).getByRole("region", { name: "Recipe preview" }),
		).toHaveTextContent("no objectives yet");
		await click("Create quest giver", dialog);
		const createdQuest = project().quests[project().quests.length - 1];
		const createdDialogue = project().dialogues[project().dialogues.length - 1];
		expect(createdQuest).toMatchObject({
			name: "Guard duty",
			status: "inactive",
			objectives: [],
		});
		expect(createdDialogue.nodes[1].actions).toContainEqual({
			type: "activate_quest",
			questId: createdQuest.id,
		});
		await click("Undo");
		expect(project()).toEqual(before);
	});
	it("navigates derived relationships without mutating project data", async () => {
		render(<StoryWorkspace />);
		const before = structuredClone(project());
		await click("Guard — Village (4, 5) · Characters");
		const assignment = screen.getByText("Assigned conversation").closest("li")!;
		await click("Open owning field", assignment);
		expect(useProjectStore.getState().requestedEditorSource).toMatchObject({
			section: "map",
			id: "keeper_placed",
			field: "interaction",
		});
		await click("Harbour Key · Items");
		expect(screen.getByLabelText("Used by")).toHaveTextContent(
			"Container grants",
		);
		expect(project()).toEqual(before);
	});
	it("commits Fetch story records and assignment in one reversible transaction", async () => {
		render(<StoryWorkspace />);
		const before = structuredClone(project());
		await click("Fetch Quest");
		const dialog = screen.getByRole("dialog", { name: "Fetch Quest" });
		await change("Quest name", "Bring the key", dialog);
		await change("Item", "harbour_key", dialog);
		await click("Preview fetch story", dialog);
		expect(project()).toEqual(before);
		await click("Create fetch story", dialog);
		expect(project().quests).toHaveLength(2);
		expect(project().dialogues).toHaveLength(2);
		await click("Undo");
		expect(project()).toEqual(before);
		await click("Redo");
		expect(project().quests).toHaveLength(2);
	});
});
