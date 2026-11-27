import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { migrateProject } from "../data/migrateProject";
import {
	createProjectRecord,
	LEGACY_PROJECT_ID,
	PROJECT_RECORD_PREFIX,
	type ProjectRecord,
	projectGameSaveStorage,
	SELECTED_PROJECT_KEY,
	writeProjectRecord,
} from "../data/projectCatalog";
import { createProjectFromPreset } from "../data/projectPresets";
import { GAME_SAVE_PREFIX } from "../runtime/gameSave";
import {
	AUTOSAVE_DRAFT_STORAGE_KEY as DRAFT,
	STORAGE_KEY as SAVE,
	useProjectStore,
} from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({ RuntimePanel: () => null }));
vi.mock("../editor/sections/ThreeDPreview", () => ({
	ThreeDPreview: () => null,
}));

function project(name: string) {
	const value = createProjectFromPreset("blank");
	value.metadata.name = name;
	return value;
}
function store(key: string, name: string) {
	localStorage.setItem(key, JSON.stringify(project(name)));
}

function openProject(name: string | RegExp) {
	fireEvent.click(screen.getByRole("button", { name }));
}

function currentProject() {
	return useProjectStore.getState().project;
}

function required<T>(value: T | null) {
	if (value === null) throw new Error("Expected fixture data to exist");
	return value;
}

function legacyRecord(): ProjectRecord {
	return JSON.parse(
		required(localStorage.getItem(PROJECT_RECORD_PREFIX + LEGACY_PROJECT_ID)),
	);
}

function renameProject(name: string) {
	act(() => useProjectStore.getState().updateMetadata({ name }));
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
		openProject(/Manual A|Draft B/);
		expect(
			screen.getByRole("dialog", { name: "Recover a project" }),
		).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(6000));
		expect(localStorage.getItem(DRAFT)).toBe(draft);
		fireEvent.click(screen.getByRole("button", { name: "Recover draft" }));
		expect(currentProject().metadata.name).toBe("Draft B");
		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
		expect(JSON.parse(required(localStorage.getItem(SAVE)))).toMatchObject({
			metadata: { name: "Manual A" },
		});
	});
	it("requires an explicit choice for an unrelated draft and does not overwrite it on choosing the save", () => {
		store(SAVE, "Project One");
		store(DRAFT, "Unrelated Project");
		const draft = localStorage.getItem(DRAFT);
		render(<App />);
		openProject(/Project One|Unrelated Project/);
		const migratedDraft = legacyRecord().draft;
		fireEvent.click(screen.getByRole("button", { name: "Use saved project" }));
		expect(currentProject().metadata.name).toBe("Project One");
		act(() => vi.advanceTimersByTime(6000));
		expect(localStorage.getItem(DRAFT)).toBe(draft);
		expect(legacyRecord().draft).toBe(migratedDraft);
	});
	it.each([
		[SAVE, DRAFT, "Loaded saved project."],
		[DRAFT, SAVE, "Loaded autosaved draft."],
	])("loads the valid %s even if %s is corrupt", (valid, corrupt, message) => {
		store(valid, "Valid project");
		localStorage.setItem(corrupt, "{broken");
		render(<App />);
		openProject("Valid project");
		expect(currentProject().metadata.name).toBe("Valid project");
		expect(screen.getByText(message)).toBeInTheDocument();
		expect(localStorage.getItem(corrupt)).toBe("{broken");
	});
	it("loads legacy raw saves and identical save/draft pairs without a recovery prompt", () => {
		store(SAVE, "Legacy");
		localStorage.setItem(DRAFT, required(localStorage.getItem(SAVE)));
		render(<App />);
		openProject("Legacy");
		expect(currentProject().metadata.name).toBe("Legacy");
		expect(
			screen.queryByRole("dialog", { name: "Recover a project" }),
		).not.toBeInTheDocument();
	});
	it("does not overwrite invalid recovery data while Projects is open", () => {
		localStorage.setItem(SAVE, "null");
		localStorage.setItem(DRAFT, "{broken");
		render(<App />);
		expect(
			screen.getByRole("heading", { name: "Your projects" }),
		).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(6000));
		expect(localStorage.getItem(DRAFT)).toBe("{broken");
	});
	it("reports autosave failure without a success timestamp, then retries after another edit", () => {
		store(SAVE, "Saved");
		render(<App />);
		openProject("Saved");
		const write = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("quota");
			});
		renameProject("Edited");
		act(() => vi.advanceTimersByTime(3000));
		expect(screen.getByText(/Could not autosave/)).toBeInTheDocument();
		expect(screen.queryByText(/Draft autosaved/)).not.toBeInTheDocument();
		write.mockRestore();
		renameProject("Retried");
		act(() => vi.advanceTimersByTime(3000));
		expect(JSON.parse(required(legacyRecord().draft))).toMatchObject({
			metadata: { name: "Retried" },
		});
	});
	it("reports manual save failure and keeps the project dirty", () => {
		store(SAVE, "Saved");
		render(<App />);
		openProject("Saved");
		renameProject("Edited");
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("quota");
		});
		fireEvent.keyDown(window, { ctrlKey: true, key: "s" });
		expect(screen.getByText(/Could not save/)).toBeInTheDocument();
		expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
		expect(JSON.parse(required(legacyRecord().saved))).toMatchObject({
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
	openProject("Old map");
	expect(currentProject().metadata.name).toBe("Old map");
	expect(currentProject().areas[0].width).toBe(2);
	act(() => vi.advanceTimersByTime(6000));
	expect(localStorage.getItem(SAVE)).toBe(legacy);
});

describe("project storage management", () => {
	it("removes only the confirmed copy and its scoped saves, including legacy backups that would reappear after reload", () => {
		store(SAVE, "Old demo");
		store(DRAFT, "Older draft");
		const keep = createProjectRecord(project("Old demo"));
		writeProjectRecord(localStorage, keep);
		const slot = `${GAME_SAVE_PREFIX}revision`;
		const legacyScopedSlot = `adventure-builder-editor-runtime:legacy:${slot}`;
		localStorage.setItem(SELECTED_PROJECT_KEY, LEGACY_PROJECT_ID);
		localStorage.setItem(legacyScopedSlot, "old scoped save");
		localStorage.setItem(slot, "shared save");
		const otherSaves = projectGameSaveStorage(
			keep,
			project("Old demo"),
			localStorage,
		);
		otherSaves.setItem(slot, "keep scoped save");
		const view = render(<App />);
		openProject("Manage storage");
		const manager = within(
			screen.getByRole("dialog", { name: "Manage storage" }),
		);
		const deleteLastOpened = () => {
			const row = required(manager.getByText("Last opened").closest("li"));
			fireEvent.click(
				within(row).getByRole("button", { name: "Delete Old demo" }),
			);
		};
		deleteLastOpened();
		openProject("Cancel");
		expect(localStorage.getItem(SAVE)).toBeTruthy();
		deleteLastOpened();
		openProject("Delete project");
		for (const key of [
			SAVE,
			DRAFT,
			SELECTED_PROJECT_KEY,
			PROJECT_RECORD_PREFIX + LEGACY_PROJECT_ID,
			legacyScopedSlot,
		])
			expect(localStorage.getItem(key)).toBeNull();
		expect(localStorage.getItem(slot)).toBe("shared save");
		expect(otherSaves.getItem(slot)).toBe("keep scoped save");
		expect(localStorage.getItem(PROJECT_RECORD_PREFIX + keep.id)).toBe(
			JSON.stringify(keep),
		);
		view.unmount();
		render(<App />);
		expect(screen.getAllByRole("button", { name: "Old demo" })).toHaveLength(1);
		expect(
			localStorage.getItem(PROJECT_RECORD_PREFIX + LEGACY_PROJECT_ID),
		).toBeNull();
	});

	it("keeps a validated file through quota failures and retries after the last stored project is deleted", async () => {
		const old = createProjectRecord(migrateProject(project("Old demo")));
		writeProjectRecord(localStorage, old);
		const write = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
			this: Storage,
			key,
			value,
		) {
			if (
				key.startsWith(PROJECT_RECORD_PREFIX) &&
				this.getItem(PROJECT_RECORD_PREFIX + old.id)
			)
				throw new DOMException("Storage limit", "QuotaExceededError");
			write.call(this, key, value);
		});
		const { container } = render(<App />);
		openProject("Old demo");
		const text = vi.fn(async () => JSON.stringify(project("Sword arena")));
		await act(async () => {
			fireEvent.change(
				required(container.querySelector('input[type="file"]')),
				{
					target: { files: [{ name: "arena.json", text }] },
				},
			);
		});
		expect(
			screen.getByRole("dialog", { name: "Manage storage" }),
		).toHaveTextContent("Browser storage is full");
		openProject("Retry import");
		expect(screen.getByText("arena.json")).toBeVisible();
		openProject("Close");
		openProject("Manage storage");
		openProject("Delete Old demo");
		openProject("Delete project");
		expect(
			screen.getByText("No saved projects to delete in this browser."),
		).toBeVisible();
		openProject("Retry import");
		expect(screen.getByRole("heading", { name: "Sword arena" })).toBeVisible();
		expect(text).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem(PROJECT_RECORD_PREFIX + old.id)).toBeNull();
		const importedId = localStorage.getItem(SELECTED_PROJECT_KEY);
		expect(
			JSON.parse(
				required(localStorage.getItem(PROJECT_RECORD_PREFIX + importedId)),
			),
		).toMatchObject({ name: "Sword arena" });
	});

	it("can free space while an unsaved edit is waiting to be saved before switching projects", () => {
		const editing = createProjectRecord(
			migrateProject(project("Keep my edits")),
		);
		const demo = createProjectRecord(project("Unused demo"));
		writeProjectRecord(localStorage, editing);
		writeProjectRecord(localStorage, demo);
		render(<App />);
		openProject("Keep my edits");
		renameProject("Edited in this tab");
		const write = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
			this: Storage,
			key,
			value,
		) {
			if (this.getItem(PROJECT_RECORD_PREFIX + demo.id))
				throw new DOMException("Storage limit", "QuotaExceededError");
			write.call(this, key, value);
		});
		openProject("Projects");
		openProject("Save and continue");
		openProject("Manage storage");
		expect(
			screen.getByRole("button", { name: "Delete Keep my edits" }),
		).toBeDisabled();
		openProject("Delete Unused demo");
		openProject("Delete project");
		openProject("Close");
		openProject("Save and continue");
		expect(
			screen.getByRole("button", { name: "Edited in this tab" }),
		).toBeVisible();
		expect(localStorage.getItem(PROJECT_RECORD_PREFIX + demo.id)).toBeNull();
	});

	it("keeps an edited project in memory if another tab deleted its record", () => {
		const old = createProjectRecord(project("Other tab"));
		writeProjectRecord(localStorage, old);
		render(<App />);
		openProject("Other tab");
		localStorage.removeItem(PROJECT_RECORD_PREFIX + old.id);
		renameProject("Still editing");
		act(() => vi.advanceTimersByTime(3000));
		expect(screen.getByText(/deleted in another tab/)).toBeVisible();
		expect(currentProject().metadata.name).toBe("Still editing");
		expect(localStorage.getItem(PROJECT_RECORD_PREFIX + old.id)).toBeNull();
	});
});
