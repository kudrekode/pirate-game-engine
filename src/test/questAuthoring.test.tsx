import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import harbour from "../../docs/assets/gameplay-interactions/tidewatch-harbour.project.json";
import { migrateProject } from "../data/migrateProject";
import { MapInspector } from "../editor/sections/MapInspector";
import { resolveMapEditorSelection } from "../editor/sections/mapEditorSelection";
import { QuestsEditor } from "../editor/sections/QuestsEditor";
import { QuestObjectiveTracker } from "../runtime/QuestPresentation";
import { createRuntimeQuestState, getQuestViews } from "../runtime/questEngine";
import { createRuntimeSession } from "../runtime/runtimeSession";
import { useProjectStore } from "../store/useProjectStore";

let previousStore = useProjectStore.getState();
beforeEach(() => {
	previousStore = useProjectStore.getState();
	useProjectStore.getState().setProject(migrateProject(harbour));
});
afterEach(() => {
	vi.restoreAllMocks();
	act(() => useProjectStore.setState(previousStore, true));
});

function Inspector() {
	const project = useProjectStore((state) => state.project);
	const selection = useProjectStore((state) => state.editorSelection);
	const area = project.areas[0];
	return (
		<MapInspector
			project={project}
			activeArea={area}
			selected={resolveMapEditorSelection(
				project,
				area,
				selection,
				new Map(),
				new Map(),
			)}
			selectedTerrainId="sand"
			selectedOverlayId=""
			recordMapEdit={() => {}}
		/>
	);
}

it("authors a named three-step quest, reorders steps, starts it on Keeper dialogue, and saves/reloads through the store", () => {
	const editor = render(<QuestsEditor />);
	fireEvent.click(screen.getByRole("button", { name: "Add quest" }));
	fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
		target: { value: "Harbour Trouble" },
	});
	fireEvent.change(screen.getByLabelText("Quest completion message"), {
		target: { value: "You found the key and gained access to the shack." },
	});
	function objective(
		index: number,
		text: string,
		type: string,
		targetName: RegExp,
	) {
		fireEvent.click(screen.getByRole("button", { name: "Add objective" }));
		const input = screen.getByLabelText(`Objective ${index} text`);
		fireEvent.change(input, { target: { value: text } });
		const row = within(input.closest(".quest-objective") as HTMLElement);
		fireEvent.change(row.getByLabelText("Objective condition type"), {
			target: { value: type },
		});
		const target = row.getByRole("option", {
			name: targetName,
		}) as HTMLOptionElement;
		fireEvent.change(
			row.getByLabelText(
				type === "has_item" ? "Objective item" : "Objective target",
			),
			{ target: { value: target.value } },
		);
	}
	objective(
		1,
		"Talk to the Harbour Keeper",
		"interaction_completed",
		/Harbour Keeper/,
	);
	objective(2, "Find the Harbour Key", "has_item", /^Harbour Key$/);
	objective(3, "Enter the shack", "enter_event", /Shack interior/);
	fireEvent.click(screen.getByLabelText("Move objective 3 up"));
	expect(screen.getByLabelText("Objective 2 text")).toHaveValue(
		"Enter the shack",
	);
	fireEvent.click(screen.getByLabelText("Move objective 2 down"));
	expect(screen.getByLabelText("Objective 3 text")).toHaveValue(
		"Enter the shack",
	);
	const quest = useProjectStore.getState().project.quests[0];
	expect(quest).toMatchObject({
		status: "inactive",
		objectiveMode: "sequence",
	});
	expect(quest.objectives.map((entry) => entry.condition.type)).toEqual([
		"interaction_completed",
		"has_item",
		"enter_event",
	]);
	editor.unmount();
	const area = useProjectStore.getState().project.areas[0];
	act(() =>
		useProjectStore.getState().setEditorSelection({
			type: "npc",
			areaId: area.id,
			id: area.npcs[0].id,
		}),
	);
	const inspector = render(<Inspector />);
	const originalLines = (
		screen.getByLabelText("Dialogue line 1") as HTMLTextAreaElement
	).value;
	fireEvent.change(screen.getByLabelText("Start Quest"), {
		target: { value: quest.id },
	});
	expect(screen.getByLabelText("Dialogue line 1")).toHaveValue(originalLines);
	const npc = useProjectStore.getState().project.areas[0].npcs[0];
	expect(
		(npc.interactionOverride ?? npc.interaction)?.completionActions,
	).toEqual([{ type: "activate_quest", questId: quest.id }]);
	act(() => useProjectStore.getState().saveToLocalStorage());
	const saved = localStorage.getItem("adventure-builder-project-v1")!;
	inspector.unmount();
	act(() => {
		useProjectStore.getState().setProject(migrateProject(harbour));
		expect(useProjectStore.getState().loadFromLocalStorage()).toBe(true);
	});
	expect(useProjectStore.getState().project).toEqual(JSON.parse(saved));
	const session = createRuntimeSession(useProjectStore.getState().project);
	expect(session.runtimeQuestState.quests[0].status).toBe("inactive");
	expect(session.runtimeQuestState.completedObjectiveIds.size).toBe(0);
	render(<QuestsEditor />);
	expect(screen.getByLabelText("Objective 3 text")).toHaveValue(
		"Enter the shack",
	);
	fireEvent.click(
		screen.getAllByRole("button", { name: "Delete objective" })[2],
	);
	expect(useProjectStore.getState().project.quests[0].objectives).toHaveLength(
		2,
	);
	vi.spyOn(window, "confirm").mockReturnValue(true);
	fireEvent.click(screen.getByRole("button", { name: "Delete quest" }));
	expect(useProjectStore.getState().project.quests).toEqual([]);
});

it("shows only the active step in the shared player HUD", () => {
	const project = migrateProject(harbour);
	project.quests = [
		{
			id: "q",
			name: "Harbour Trouble",
			status: "active",
			objectiveMode: "sequence",
			objectives: [
				{
					id: "first",
					description: "Find the Harbour Key",
					condition: { type: "flag", flag: "key", value: true },
				},
				{
					id: "second",
					description: "Enter the shack",
					condition: { type: "flag", flag: "entered", value: true },
				},
			],
		},
	];
	const session = createRuntimeSession(project);
	const state = createRuntimeQuestState(project.quests);
	render(
		<QuestObjectiveTracker
			project={project}
			quests={getQuestViews(state, session.runtimeState)}
		/>,
	);
	expect(screen.getByLabelText("Current objective")).toHaveTextContent(
		"Find the Harbour Key",
	);
	expect(screen.queryByText("Enter the shack")).not.toBeInTheDocument();
});
