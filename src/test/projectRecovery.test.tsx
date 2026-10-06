import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { createProjectFromPreset } from "../data/projectPresets";
import {
	AUTOSAVE_DRAFT_STORAGE_KEY as DRAFT,
	STORAGE_KEY as SAVE,
	useProjectStore,
} from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({ RuntimePanel: () => null }));
vi.mock("../editor/sections/ThreeDPreview", () => ({
	ThreeDPreview: () => null,
}));
vi.mock("../editor/sections", () => ({
	editorSections: [{ id: "map", label: "Map", component: () => null }],
}));

function project(name: string) {
	const value = createProjectFromPreset("blank");
	value.metadata.name = name;
	return value;
}
function store(key: string, name: string) {
	localStorage.setItem(key, JSON.stringify(project(name)));
}
beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	useProjectStore.getState().setProject(project("Initial"));
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("save and draft recovery", () => {
	it("preserves manual A and newer draft B until a recovery choice, then recovers B", () => {
		store(SAVE, "Manual A");
		store(DRAFT, "Draft B");
		const draft = localStorage.getItem(DRAFT);
		render(<App />);
		expect(
			screen.getByRole("dialog", { name: "Recover a project" }),
		).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(6000));
		expect(localStorage.getItem(DRAFT)).toBe(draft);
		fireEvent.click(screen.getByRole("button", { name: "Recover draft" }));
		expect(screen.getByLabelText("Project")).toHaveValue("Draft B");
		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem(SAVE)!)).toMatchObject({
			metadata: { name: "Manual A" },
		});
	});
	it("requires an explicit choice for an unrelated draft and does not overwrite it on choosing the save", () => {
		store(SAVE, "Project One");
		store(DRAFT, "Unrelated Project");
		const draft = localStorage.getItem(DRAFT);
		render(<App />);
		fireEvent.click(screen.getByRole("button", { name: "Use saved project" }));
		expect(screen.getByLabelText("Project")).toHaveValue("Project One");
		act(() => vi.advanceTimersByTime(6000));
		expect(localStorage.getItem(DRAFT)).toBe(draft);
	});
	it.each([
		[SAVE, DRAFT, "Loaded saved project."],
		[DRAFT, SAVE, "Loaded autosaved draft."],
	])("loads the valid %s even if %s is corrupt", (valid, corrupt, message) => {
		store(valid, "Valid project");
		localStorage.setItem(corrupt, "{broken");
		render(<App />);
		expect(screen.getByLabelText("Project")).toHaveValue("Valid project");
		expect(screen.getByText(message)).toBeInTheDocument();
	});
	it("loads legacy raw saves and identical save/draft pairs without a recovery prompt", () => {
		store(SAVE, "Legacy");
		localStorage.setItem(DRAFT, localStorage.getItem(SAVE)!);
		render(<App />);
		expect(screen.getByLabelText("Project")).toHaveValue("Legacy");
		expect(
			screen.queryByRole("dialog", { name: "Recover a project" }),
		).not.toBeInTheDocument();
	});
	it("does not overwrite invalid recovery data while the initial chooser is open", () => {
		localStorage.setItem(SAVE, "null");
		localStorage.setItem(DRAFT, "{broken");
		render(<App />);
		expect(
			screen.getByLabelText("Choose a starter project"),
		).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(6000));
		expect(localStorage.getItem(DRAFT)).toBe("{broken");
	});
	it("reports autosave failure without a success timestamp, then retries after another edit", () => {
		store(SAVE, "Saved");
		render(<App />);
		const write = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("quota");
			});
		fireEvent.change(screen.getByLabelText("Project"), {
			target: { value: "Edited" },
		});
		act(() => vi.advanceTimersByTime(3000));
		expect(screen.getByText(/Could not autosave/)).toBeInTheDocument();
		expect(screen.queryByText(/Draft autosaved/)).not.toBeInTheDocument();
		write.mockRestore();
		fireEvent.change(screen.getByLabelText("Project"), {
			target: { value: "Retried" },
		});
		act(() => vi.advanceTimersByTime(3000));
		expect(JSON.parse(localStorage.getItem(DRAFT)!)).toMatchObject({
			metadata: { name: "Retried" },
		});
	});
	it("reports manual save failure and keeps the project dirty", () => {
		store(SAVE, "Saved");
		render(<App />);
		fireEvent.change(screen.getByLabelText("Project"), {
			target: { value: "Edited" },
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("quota");
		});
		fireEvent.keyDown(window, { ctrlKey: true, key: "s" });
		expect(screen.getByText(/Could not save/)).toBeInTheDocument();
		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem(SAVE)!)).toMatchObject({
			metadata: { name: "Saved" },
		});
	});
});

it("loads historical single-map browser saves without replacing the stored data", () => {
	const legacy = JSON.stringify({
		metadata: { name: "Old map", version: "0.0.1" },
		map: {
			width: 2,
			height: 1,
			tileSize: 32,
			tiles: [{ x: 0, y: 0, tileId: "grass" }],
		},
	});
	localStorage.setItem(SAVE, legacy);
	render(<App />);
	expect(screen.getByLabelText("Project")).toHaveValue("Old map");
	expect(useProjectStore.getState().project.areas[0].width).toBe(2);
	act(() => vi.advanceTimersByTime(6000));
	expect(localStorage.getItem(SAVE)).toBe(legacy);
});
