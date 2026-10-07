import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import harbour from "../../docs/assets/world-kit/tidewatch-harbour.project.json";
import { migrateProject } from "../data/migrateProject";
import { MapInspector } from "../editor/sections/MapInspector";
import { resolveMapEditorSelection } from "../editor/sections/mapEditorSelection";
import { useProjectStore } from "../store/useProjectStore";
import type { EditorSelection } from "../types/game";

beforeEach(() => {
	useProjectStore.getState().setProject(migrateProject(harbour));
});
function Inspector() {
	const project = useProjectStore((s) => s.project);
	const selection = useProjectStore((s) => s.editorSelection);
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
function select(selection: EditorSelection) {
	act(() => useProjectStore.getState().setEditorSelection(selection));
}
it("authors barrel text, chest reward and ordered NPC lines through contextual fields and round trips them", () => {
	const area = useProjectStore.getState().project.areas[0];
	const barrel = area.objects.find(
		(o) => o.objectDefinitionId === "scene-world-barrel",
	)!;
	select({ type: "object", areaId: area.id, id: barrel.id });
	render(<Inspector />);
	fireEvent.click(screen.getByLabelText("Enable interaction"));
	fireEvent.change(screen.getByLabelText("Message text"), {
		target: { value: "Smells strongly of rum." },
	});
	fireEvent.change(screen.getByLabelText("Prompt label"), {
		target: { value: "Examine barrel" },
	});
	expect(screen.queryByLabelText("Reward item")).not.toBeInTheDocument();
	const chest = area.objects.find(
		(o) => o.objectDefinitionId === "scene-world-chest",
	)!;
	select({ type: "object", areaId: area.id, id: chest.id });
	fireEvent.click(screen.getByLabelText("Enable interaction"));
	expect(screen.getByLabelText("Interaction type")).toHaveValue("container");
	fireEvent.change(screen.getByLabelText("New item name"), {
		target: { value: "Harbour Key" },
	});
	fireEvent.click(screen.getByText("Create item and use"));
	fireEvent.change(screen.getByLabelText("Reward quantity"), {
		target: { value: "2" },
	});
	fireEvent.click(screen.getByLabelText("Enable interaction"));
	expect(
		useProjectStore
			.getState()
			.project.areas[0].objects.find((o) => o.id === chest.id)?.interaction
			?.activationMode,
	).toBe("disabled");
	fireEvent.click(screen.getByLabelText("Enable interaction"));
	act(() =>
		useProjectStore.getState().updateNpc(area.npcs[0].id, {
			attributesOverride: { canInteract: false },
		}),
	);
	select({ type: "npc", areaId: area.id, id: area.npcs[0].id });
	fireEvent.click(screen.getByLabelText("Enable interaction"));
	fireEvent.change(screen.getByLabelText("Dialogue line 1"), {
		target: { value: "Storm came through." },
	});
	fireEvent.click(screen.getByText("Add dialogue line"));
	fireEvent.change(screen.getByLabelText("Dialogue line 2"), {
		target: { value: "Keep the key." },
	});
	expect(
		useProjectStore.getState().project.areas[0].npcs[0].attributesOverride
			?.canInteract,
	).toBe(true);
	const sack = area.objects.find(
		(o) => o.objectDefinitionId === "scene-world-sack",
	)!;
	select({ type: "object", areaId: area.id, id: sack.id });
	fireEvent.click(screen.getByLabelText("Enable interaction"));
	fireEvent.change(screen.getByLabelText("Interaction type"), {
		target: { value: "pickup" },
	});
	fireEvent.change(screen.getByLabelText("Pickup quantity"), {
		target: { value: "3" },
	});
	const saved = useProjectStore.getState().project;
	const loaded = migrateProject(JSON.parse(JSON.stringify(saved)));
	expect(
		loaded.areas[0].objects.find((o) => o.id === sack.id)?.interaction,
	).toMatchObject({
		type: "collect_item",
		itemId: saved.items[0].id,
		quantity: 3,
	});
	expect(
		loaded.areas[0].objects.find((o) => o.id === barrel.id)?.interaction?.lines,
	).toEqual(["Smells strongly of rum."]);
	expect(
		loaded.areas[0].objects.find((o) => o.id === chest.id)?.behaviourOverride,
	).toMatchObject({
		type: "container",
		once: true,
		contents: [{ itemId: saved.items[0].id, quantity: 2 }],
	});
	expect(loaded.areas[0].npcs[0].interactionOverride?.lines).toEqual([
		"Storm came through.",
		"Keep the key.",
	]);
});
