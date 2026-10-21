import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { createProjectFromPreset } from "../data/projectPresets";
import { MapEditor } from "../editor/sections/MapEditor";
import { STORAGE_KEY, useProjectStore } from "../store/useProjectStore";
import type { GameProject } from "../types/game";

vi.mock("../runtime/RuntimePanel", () => ({
	RuntimePanel: ({
		onClose,
		project,
	}: {
		onClose: () => void;
		project: GameProject;
	}) => (
		<div>
			<button
				type="button"
				onClick={() => {
					project.gameState.flags.played = true;
				}}
			>
				Change runtime state
			</button>
			<button type="button" onClick={onClose}>
				Back to Edit
			</button>
		</div>
	),
}));

beforeEach(() => {
	localStorage.clear();
	useProjectStore.getState().setProject(createProjectFromPreset("blank"));
	useProjectStore.getState().resizeMap(12, 10);
	useProjectStore.getState().setMapPaletteSelection({ type: "none" });
});

it("adds, selects, renames, transforms and duplicates a prop with grouped inspector undo and safe form shortcuts", async () => {
	render(<MapEditor />);
	await act(async () =>
		fireEvent.click(screen.getByLabelText("Add Supply Crate")),
	);
	expect(
		screen.getByRole("option", { name: "Supply Crate object" }),
	).toHaveAttribute("aria-selected", "true");
	const area = () => useProjectStore.getState().project.areas[0];
	const originalX = area().objects[0].x;
	const xInput = screen.getByLabelText("Position X");
	fireEvent.focus(xInput);
	fireEvent.pointerUp(xInput);
	fireEvent.change(xInput, { target: { value: "6" } });
	fireEvent.change(xInput, { target: { value: "6.25" } });
	fireEvent.blur(xInput);
	expect(area().objects[0]).toMatchObject({
		x: 6,
		transform: { position: { x: 0.25 } },
	});
	fireEvent.click(screen.getByText("Undo", { selector: "button" }));
	expect(area().objects[0].x).toBe(originalX);
	fireEvent.click(screen.getByText("Redo", { selector: "button" }));
	expect(screen.getByLabelText("Position X")).toHaveValue(6.25);
	const name = screen.getByLabelText("Scene name");
	fireEvent.focus(name);
	fireEvent.change(name, { target: { value: "Harbour supplies" } });
	fireEvent.keyDown(name, { key: "Delete" });
	fireEvent.keyDown(name, { key: "d", ctrlKey: true });
	expect(area().objects).toHaveLength(1);
	fireEvent.blur(name);
	await act(async () => fireEvent.keyDown(window, { key: "d", ctrlKey: true }));
	expect(area().objects).toHaveLength(2);
	expect(area().objects[1].transform).toEqual(area().objects[0].transform);
	expect(
		screen.getByRole("option", { name: "Harbour supplies copy object" }),
	).toHaveAttribute("aria-selected", "true");
	await act(async () => fireEvent.keyDown(window, { key: "Delete" }));
	expect(area().objects).toHaveLength(1);
	expect(useProjectStore.getState().editorSelection?.type).toBe("area");
	fireEvent.click(
		screen.getByRole("option", {
			name: "Harbour supplies object",
		}),
	);
	expect(screen.getByLabelText("Position X")).toHaveValue(6.25);
	useProjectStore.getState().saveToLocalStorage();
	const savedProject = localStorage.getItem(STORAGE_KEY);
	expect(savedProject).toBeDefined();
	if (!savedProject) throw new Error("Expected saved project.");
	const saved = JSON.parse(savedProject);
	expect(saved.areas[0].objects).toEqual(
		JSON.parse(JSON.stringify(area().objects)),
	);
}, 30000);

it("keeps the editor mounted and selected through isolated Play, blocks editor shortcuts there and retains history", async () => {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(useProjectStore.getState().project),
	);
	render(<App />);
	await act(async () =>
		fireEvent.click(screen.getByLabelText("Add Supply Crate")),
	);
	const canvas = screen.getByRole("application", {
		name: "Map editing canvas",
	});
	const selection = useProjectStore.getState().editorSelection;
	const before = JSON.stringify(useProjectStore.getState().project);
	fireEvent.click(screen.getByText("Play", { selector: "button" }));
	expect(canvas).not.toBeVisible();
	fireEvent.keyDown(window, { key: "Delete" });
	fireEvent.keyDown(window, { key: "d", ctrlKey: true });
	fireEvent.click(screen.getByRole("button", { name: "Change runtime state" }));
	expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);
	fireEvent.click(screen.getByRole("button", { name: "Back to Edit" }));
	expect(screen.getByRole("application", { name: "Map editing canvas" })).toBe(
		canvas,
	);
	expect(canvas).toBeVisible();
	expect(useProjectStore.getState().editorSelection).toEqual(selection);
	fireEvent.click(screen.getByText("Undo", { selector: "button" }));
	expect(useProjectStore.getState().project.areas[0].objects).toHaveLength(0);
}, 30000);
