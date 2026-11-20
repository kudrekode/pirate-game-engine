import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogueEditor } from "../editor/sections/DialogueEditor";
import {
	DIALOGUE_ENTITY_MIME,
	type DialogueEntityRef,
} from "../editor/sections/dialogueEntities";
import { useProjectStore } from "../store/useProjectStore";
import { createDialogueGraphDemo } from "./dialogueGraphDemo";

const project = () => useProjectStore.getState().project;
const click = async (
	name: string | RegExp,
	root: HTMLElement = document.body,
) => {
	await act(async () => {
		fireEvent.click(within(root).getByRole("button", { name }));
	});
};
const change = async (
	label: string,
	value: string,
	root: HTMLElement = document.body,
) => {
	await act(async () => {
		fireEvent.change(within(root).getByLabelText(label), { target: { value } });
	});
};
const drop = async (target: HTMLElement, ref: DialogueEntityRef) => {
	await act(async () => {
		fireEvent.drop(target, {
			dataTransfer: {
				getData: (type: string) =>
					type === DIALOGUE_ENTITY_MIME ? JSON.stringify(ref) : "",
				types: [DIALOGUE_ENTITY_MIME],
			},
		});
	});
};
const response = () =>
	screen
		.getByLabelText("Choice yes text")
		.closest(".content-card") as HTMLElement;
const conditions = () => {
	const n = project().dialogues[0].nodes[1];
	if (n.type !== "choice") throw Error();
	return n.choices[0].conditions!;
};
beforeEach(() => {
	useProjectStore.getState().setProject(createDialogueGraphDemo());
	vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("entity-based dialogue authoring", () => {
	it("previews a recipe and restores both conversation and assignment in one undo", async () => {
		render(<DialogueEditor />);
		const before = structuredClone(project());
		await click("Quest Giver — Yes / No");
		const dialog = screen.getByRole("dialog", {
			name: "Quest Giver — Yes / No",
		});
		await change(
			"Placed character",
			JSON.stringify(["npc", project().areas[0].id, "keeper_placed"]),
			dialog,
		);
		await change("Quest", "keeper_job", dialog);
		await click("Preview recipe", dialog);
		expect(project()).toEqual(before);
		await click("Create quest giver", dialog);
		expect(project().dialogues).toHaveLength(2);
		const id = project().dialogues[1].id;
		await click("Undo");
		expect(project()).toEqual(before);
		await click("Redo");
		expect(project().dialogues[1].id).toBe(id);
	});
	it("creates an item from a response picker without leaving orphan data after Undo", async () => {
		render(<DialogueEditor />);
		await click("Select choice: What do you say?");
		const before = structuredClone(project());
		const slot = within(response()).getByLabelText("Add condition from entity");
		await click("Choose or create…", slot);
		await click("Create entity here", slot);
		await change("Entity name", "Village Key", slot);
		await change("Item category", "key", slot);
		await click("Create and insert", slot);
		expect(project()).toEqual(before);
		await click("Have item");
		const item = project().items.slice(-1)[0];
		expect(item).toMatchObject({
			name: "Village Key",
			category: "key",
			stackable: false,
		});
		expect(conditions().slice(-1)[0]).toEqual({
			type: "has_item",
			itemId: item.id,
			quantity: 1,
		});
		await click("Undo");
		expect(project()).toEqual(before);
		await click("Redo");
		expect(project().items.slice(-1)[0].id).toBe(item.id);
	});

	it("keeps imported legacy fallbacks explicit and unchanged while browsing chips", async () => {
		const p = createDialogueGraphDemo();
		p.items[0].category = "currency";
		p.dialogues[0].nodes[0].actions = [
			{ type: "give_item", itemId: "", quantity: 2 },
		];
		useProjectStore.getState().setProject(p);
		const before = structuredClone(project());
		render(<DialogueEditor />);
		expect(
			screen.getByText(/Legacy fallback: Harbour Key/),
		).toBeInTheDocument();
		await click("List");
		await click("Graph");
		expect(project()).toEqual(before);
	});
	it("keeps browsing, selection and Graph/List switches out of project data", async () => {
		render(<DialogueEditor />);
		const before = structuredClone(project());
		await change("Search entities", "key");
		await click(/Harbour Key · Items/);
		await click("List");
		await click("Graph");
		expect(project()).toEqual(before);
	});

	it("drops into one response, edits the contextual chip and undoes without touching other branches", async () => {
		render(<DialogueEditor />);
		await click("Select choice: What do you say?");
		const before = structuredClone(project().dialogues[0]);
		await drop(within(response()).getByLabelText("Add condition from entity"), {
			kind: "item",
			id: "harbour_key",
		});
		expect(project().dialogues[0]).toEqual(before);
		await click("Have item");
		expect(conditions().slice(-1)[0]).toEqual({
			type: "has_item",
			itemId: "harbour_key",
			quantity: 1,
		});
		const chip = within(response())
			.getByText("Have Harbour Key ×1")
			.closest("details")!;
		fireEvent.click(chip.querySelector("summary")!);
		await change("Item check", "not_has_item", chip);
		await change("Quantity", "2", chip);
		expect(conditions().slice(-1)[0]).toEqual({
			type: "not_has_item",
			itemId: "harbour_key",
			quantity: 2,
		});
		await click("Undo");
		await click("Undo");
		await click("Undo");
		expect(project().dialogues[0]).toEqual(before);
		await click("Redo");
		expect(conditions().slice(-1)[0]).toMatchObject({
			type: "has_item",
			itemId: "harbour_key",
		});
	});

	it("offers keyboard/click insertion and commits inline creation with its effect in one undo", async () => {
		render(<DialogueEditor />);
		const before = structuredClone(project());
		const slot = screen.getByLabelText("Add entry effect");
		await click("Choose or create…", slot);
		await click("Create entity here", slot);
		await change("Create", "quest", slot);
		await change("Entity name", "Village Passage", slot);
		await click("Cancel creation", slot);
		expect(project()).toEqual(before);
		await click("Create entity here", slot);
		await change("Entity name", "Village Passage", slot);
		await click("Create and insert", slot);
		await click("Start quest");
		const quest = project().quests.slice(-1)[0]!;
		expect(quest.name).toBe("Village Passage");
		expect(project().dialogues[0].nodes[0].actions).toEqual([
			{ type: "activate_quest", questId: quest.id },
		]);
		expect(
			screen.getByText("Unfinished quest: add objectives before Play."),
		).toBeInTheDocument();
		await click("Undo");
		expect(project()).toEqual(before);
		await click("Redo");
		expect(project().quests.slice(-1)[0]?.id).toBe(quest.id);
		await click(/Harbour Key · Items/);
		await click("Add entry effect: Harbour Key");
		await click("Give item");
		expect(project().dialogues[0].nodes[0].actions?.slice(-1)[0]).toEqual({
			type: "give_item",
			itemId: "harbour_key",
			quantity: 1,
		});
	});

	it("creates typed story state with stable keys and defaults separate from node effects", async () => {
		render(<DialogueEditor />);
		const slot = screen.getByLabelText("Add entry effect");
		await click("Choose or create…", slot);
		await click("Create entity here", slot);
		await change("Create", "flag", slot);
		await change("Entity name", "Guard permission", slot);
		await click("Create and insert", slot);
		await click("Remember Yes");
		expect(project().gameState.flags.guard_permission).toBe(false);
		expect(project().dialogues[0].nodes[0].actions?.[0]).toEqual({
			type: "set_flag",
			flag: "guard_permission",
			value: true,
		});
	});

	it("rejects incompatible/stale drops and shows deleted references without name-based retargeting", async () => {
		render(<DialogueEditor />);
		await click("Select choice: What do you say?");
		const before = structuredClone(project());
		const slot = within(response()).getByLabelText("Add condition from entity");
		await drop(slot, {
			kind: "npc",
			id: "keeper_placed",
			areaId: project().areas[0].id,
		});
		expect(project()).toEqual(before);
		expect(within(slot).getByRole("alert")).toHaveTextContent(
			"response condition",
		);
		await drop(slot, { kind: "item", id: "deleted" });
		expect(project()).toEqual(before);
		expect(within(slot).getByRole("alert")).toHaveTextContent(
			"no longer exists",
		);
		await drop(slot, { kind: "item", id: "harbour_key" });
		await click("Have item");
		await act(async () => {
			useProjectStore.getState().updateProject((p) => {
				p.items = [{ ...p.items[0], id: "replacement" }];
			});
		});
		expect(
			within(response()).getByText(/Have Missing item: harbour_key/),
		).toBeInTheDocument();
		expect(conditions().slice(-1)[0]).toMatchObject({ itemId: "harbour_key" });
	});

	it("reviews assignment to the exact placement across areas and undoes it independently of speaker text", async () => {
		const p = project();
		const second = structuredClone(p.areas[0]);
		second.id = "village";
		second.name = "Village";
		second.npcs[0].id = "second_guard";
		second.npcs[0].areaId = second.id;
		second.npcs[0].nameOverride = "Guard";
		second.npcs[0].attributesOverride = { canInteract: false, health: 42 };
		second.npcs[0].interactionOverride = {
			type: "collect_item",
			itemId: "harbour_key",
			quantity: 1,
			activationMode: "on_interact",
		};
		useProjectStore
			.getState()
			.setProject({ ...p, areas: [...p.areas, second] });
		render(<DialogueEditor />);
		await click(/Guard — Village \(4, 5\) · Characters/);
		await click("Copy speaker name: Guard — Village (4, 5)");
		expect(project().dialogues[0].nodes[0].speaker).toBe("Guard");
		expect(project().areas[1].npcs[0].interactionOverride?.type).toBe(
			"collect_item",
		);
		const before = structuredClone(project());
		await click("Assign conversation: Guard — Village (4, 5)");
		expect(screen.getByLabelText("Review assignment")).toHaveTextContent(
			"collect item",
		);
		await click("Cancel assignment");
		expect(project()).toEqual(before);
		await click("Assign conversation: Guard — Village (4, 5)");
		await click("Replace assignment");
		expect(project().areas[0]).toEqual(before.areas[0]);
		expect(project().npcs).toEqual(before.npcs);
		expect(project().areas[1].npcs[0].interactionOverride).toMatchObject({
			type: "start_dialogue",
			dialogueId: "keeper_dialogue",
			activationMode: "on_interact",
		});
		expect(project().areas[1].npcs[0].attributesOverride).toEqual({
			...before.areas[1].npcs[0].attributesOverride,
			canInteract: true,
		});
		await click("Undo");
		expect(project()).toEqual(before);
	});
});
