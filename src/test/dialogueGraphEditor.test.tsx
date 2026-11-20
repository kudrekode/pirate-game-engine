import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogueEditor } from "../editor/sections/DialogueEditor";
import { useProjectStore } from "../store/useProjectStore";
import { createDialogueGraphDemo } from "./dialogueGraphDemo";

const click = async (name: string | RegExp) => {
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name }));
	});
};
const change = async (label: string | RegExp, value: string) => {
	await act(async () => {
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
	});
};
const current = () => useProjectStore.getState().project.dialogues[0];
const openChipFields = async (
	label: string,
	root: HTMLElement = document.body,
) => {
	const chip = within(root)
		.getByLabelText(label)
		.closest(".dialogue-wiring-chip")!;
	await act(async () => {
		for (const details of chip.querySelectorAll("details")) {
			if (!details.open) fireEvent.click(details.querySelector("summary")!);
		}
	});
};
beforeEach(() => {
	useProjectStore.getState().setProject(createDialogueGraphDemo());
	vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("Dialogue graph inspector", () => {
	it("persists a duplicated node's position when an imported dialogue has no layout", async () => {
		const project = createDialogueGraphDemo();
		delete project.dialogues[0].editorLayout;
		useProjectStore.getState().setProject(project);
		render(<DialogueEditor />);
		await click("Duplicate node");
		const copy = current().nodes[current().nodes.length - 1];
		expect(current().editorLayout?.nodes[copy.id]).toEqual({ x: 80, y: 100 });
		expect(Object.keys(current().editorLayout!.nodes)).toHaveLength(7);
	});
	it("clears only matching legacy/default/override assignments on dialogue deletion", () => {
		const state = useProjectStore.getState();
		const project = createDialogueGraphDemo();
		project.dialogues.push({
			id: "other",
			name: "Other",
			startNodeId: "end",
			nodes: [{ id: "end", type: "end" }],
		});
		project.areas[0].npcs.push({
			...project.areas[0].npcs[0],
			id: "other_npc",
			interaction: {
				type: "start_dialogue",
				dialogueId: "keeper_dialogue",
				activationMode: "on_interact",
			},
			interactionOverride: {
				type: "start_dialogue",
				dialogueId: "other",
				activationMode: "on_interact",
			},
		});
		state.setProject(project);
		state.deleteDialogue("keeper_dialogue");
		const result = useProjectStore.getState().project;
		expect(result.npcs[0].defaultInteraction).toBeUndefined();
		expect(result.areas[0].npcs[0].interactionOverride).toBeUndefined();
		expect(result.areas[0].npcs[1].interactionOverride?.dialogueId).toBe(
			"other",
		);
		expect(result.areas[0].npcs[1].interaction).toBeUndefined();
	});
	it("authors each node type, sets Start, connects outputs, removes edges and shares edits with list view", async () => {
		render(<DialogueEditor />);
		await click("Add dialogue");
		await change("Name", "Authored conversation");
		await change("Text", "Opening");
		await click("Set as Start");
		await click("Add text node");
		await change("Text", "Downstream");
		await click("Add choice node");
		await click("Add choice");
		await click("Add end node");
		await change("Text", "Finished");
		await click("Connect next: text: Opening");
		await click("Connect here: choice: Choose a response.");
		await click("Connect response: New choice");
		await click("Connect here: text: Downstream");
		await click("Connect next: text: Downstream");
		await click("Connect here: end: Finished");
		const authored = useProjectStore.getState().project.dialogues[1];
		expect(authored.name).toBe("Authored conversation");
		expect(authored.nodes.map((node) => node.type)).toEqual([
			"text",
			"text",
			"choice",
			"end",
		]);
		expect(authored.nodes[0]).toMatchObject({
			nextNodeId: authored.nodes[2].id,
		});
		await click("List");
		await click("text: Opening");
		expect(screen.getByLabelText("Text")).toHaveValue("Opening");
	});

	it("connects branches with graph controls and safely undoes deletion", async () => {
		render(<DialogueEditor />);
		await click("Connect next: text: Are you willing to help?");
		await click("Connect here: end: Farewell.");
		expect(current().nodes[0]).toMatchObject({ nextNodeId: "end" });
		await act(async () => {
			fireEvent.click(
				screen.getAllByRole("button", {
					name: "Connection Next to end: Farewell.",
				})[0],
			);
		});
		await click("Delete connection");
		expect(current().nodes[0]).toMatchObject({ nextNodeId: undefined });
		await click("Undo");
		expect(current().nodes[0]).toMatchObject({ nextNodeId: "end" });
		await click("Connect response: Yes.");
		await click("Connect here: text: Perhaps another time.");
		expect(current().nodes[1]).toMatchObject({
			choices: [
				expect.objectContaining({ targetNodeId: "refused" }),
				expect.anything(),
				expect.anything(),
				expect.anything(),
			],
		});
		await click("Select end: Farewell.");
		await click("Delete node");
		expect(window.confirm).toHaveBeenCalledWith(
			expect.stringContaining("referenced by 4 branches"),
		);
		expect(current().nodes.some((n) => n.id === "end")).toBe(false);
		await click("Undo");
		expect(current().nodes.some((n) => n.id === "end")).toBe(true);
		await click("Redo");
		expect(current().nodes.some((n) => n.id === "end")).toBe(false);
	});

	it("edits conditions, preserves literal types and response IDs when reordered", async () => {
		render(<DialogueEditor />);
		await click("Select choice: What do you say?");
		const before = current().nodes[1];
		if (before.type !== "choice") throw Error();
		const response = screen
			.getByLabelText("Choice yes text")
			.closest(".content-card")!;
		await openChipFields("Condition 1 flag", response as HTMLElement);
		fireEvent.change(
			within(response as HTMLElement).getByLabelText("Condition 1 flag"),
			{ target: { value: "refused_keeper_job" } },
		);
		await click("Move response 1 down");
		const after = current().nodes[1];
		if (after.type !== "choice") throw Error();
		expect(after.choices[1].id).toBe("yes");
		expect(after.choices[1].conditions?.[0]).toMatchObject({
			flag: "refused_keeper_job",
		});
		const yes = screen
			.getByLabelText("Choice yes text")
			.closest(".content-card")!;
		fireEvent.change(
			within(yes as HTMLElement).getByLabelText("Condition 1 type"),
			{ target: { value: "variable_compare" } },
		);
		fireEvent.change(
			within(yes as HTMLElement).getByLabelText(
				"Condition 1 compare value kind",
			),
			{ target: { value: "string" } },
		);
		fireEvent.change(
			within(yes as HTMLElement).getByLabelText("Condition 1 compare value"),
			{ target: { value: "001" } },
		);
		const next = current().nodes[1];
		if (next.type !== "choice") throw Error();
		expect(next.choices[1].conditions?.[0]).toMatchObject({ value: "001" });
		await click("Duplicate node");
		const copy = current().nodes[current().nodes.length - 1];
		if (copy.type !== "choice") throw Error();
		expect(
			copy.choices.some((c) => before.choices.some((old) => old.id === c.id)),
		).toBe(false);
	});

	it("configures and reorders actions including complete teleport destinations and all runtime variants", async () => {
		render(<DialogueEditor />);
		await click("Select text: Thank you. Take the Harbour Key.");
		await openChipFields("Action 1 type");
		await click("Move action 1 down");
		expect(current().nodes[2].actions?.[1].type).toBe("set_flag");
		await change("Action 1 type", "teleport");
		expect(screen.getByLabelText("Action 1 area")).toHaveValue(
			useProjectStore.getState().project.areas[0].id,
		);
		expect(screen.getByLabelText("Action 1 destination")).not.toHaveValue("");
		for (const type of [
			"set_variable",
			"change_variable",
			"fail_quest",
			"set_npc_alignment",
			"set_npc_health",
			"change_movement_mode",
			"play_cutscene",
			"open_shop",
			"remove_item",
			"end_game",
		]) {
			await change("Action 1 type", type);
			expect(current().nodes[2].actions?.[0].type).toBe(type);
		}
		await click("Add action");
		expect(current().nodes[2].actions).toHaveLength(4);
		await openChipFields("Action 4 type");
		await click("Delete action 4");
		expect(current().nodes[2].actions).toHaveLength(3);
	});

	it("keeps diagnostics and layout visible, supports empty end text, and duplicates dialogues", async () => {
		render(<DialogueEditor />);
		await click("Add end node");
		await change("Text", "Unreachable ending");
		expect(screen.getByLabelText("Dialogue diagnostics")).toHaveTextContent(
			"unreachable",
		);
		await click("Set as Start");
		await click("Auto layout");
		expect(Object.keys(current().editorLayout!.nodes)).toHaveLength(7);
		await click("List");
		expect(
			screen.queryByRole("region", { name: "Dialogue graph" }),
		).not.toBeInTheDocument();
		await click("Graph");
		expect(
			screen.getByRole("region", { name: "Dialogue graph" }),
		).toBeInTheDocument();
		await click("Duplicate dialogue");
		expect(useProjectStore.getState().project.dialogues).toHaveLength(2);
		await click("Delete dialogue");
		expect(useProjectStore.getState().project.dialogues).toHaveLength(1);
	});
});
