import { describe, expect, it } from "vitest";
import {
	createGameSave,
	loadGameSave,
	storeGameSave,
} from "../runtime/gameSave";
import { createRuntimeSession } from "../runtime/runtimeSession";
import { migrateProject } from "./migrateProject";
import {
	createProjectRecord,
	LEGACY_PROJECT_ID,
	projectGameSaveStorage,
	unclaimedLegacySave,
	updateProjectRecord,
} from "./projectCatalog";
import { createProjectFromPreset } from "./projectPresets";

function setup() {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	};
	const project = migrateProject(createProjectFromPreset("blank"));
	const gameSave = createGameSave(project, createRuntimeSession(project));
	return { storage, project, gameSave };
}

describe("project record boundaries", () => {
	it("keeps the edit time when committing a draft or saving without edits", () => {
		const { project } = setup();
		const saved = {
			...createProjectRecord(project),
			modifiedAt: "2026-01-01T12:00:00.000Z",
		};
		const edited = {
			...project,
			metadata: { ...project.metadata, name: "Edited" },
		};
		const draft = updateProjectRecord(saved, edited, "draft");
		expect(draft.modifiedAt).not.toBe(saved.modifiedAt);
		expect(draft.saved).toBe(saved.saved);
		expect(draft.draft).toBe(JSON.stringify(edited));

		const committed = updateProjectRecord(draft, edited, "save");
		expect(committed).toMatchObject({
			modifiedAt: draft.modifiedAt,
			saved: draft.draft,
			draft: null,
		});
		expect(updateProjectRecord(committed, edited, "save")).toEqual(committed);
	});

	it("keeps a migrated project's existing game save separate from identical copies", () => {
		const { storage, project, gameSave } = setup();
		const legacy = { ...createProjectRecord(project), id: LEGACY_PROJECT_ID };
		const original = projectGameSaveStorage(legacy, project, storage);
		storeGameSave(project, gameSave, original);
		const first = projectGameSaveStorage(
			createProjectRecord(project),
			project,
			storage,
		);
		const second = projectGameSaveStorage(
			createProjectRecord(project),
			project,
			storage,
		);

		expect(unclaimedLegacySave(project, [legacy], storage)).toBeUndefined();
		expect(loadGameSave(project, first)).toBeNull();
		storeGameSave(
			project,
			{ ...gameSave, savedAt: "2026-01-01T12:00:00.000Z" },
			first,
		);
		expect(loadGameSave(project, first)?.savedAt).toBe(
			"2026-01-01T12:00:00.000Z",
		);
		expect(loadGameSave(project, second)).toBeNull();
		expect(loadGameSave(project, storage)).toEqual(gameSave);
	});

	it("lets the first matching import recover a runtime-only save and writes subsequent saves to its own slot", () => {
		const { storage, project, gameSave } = setup();
		storeGameSave(project, gameSave, storage);
		const claim = unclaimedLegacySave(project, [], storage);
		expect(claim).toBe(gameSave.projectId);
		const owner = createProjectRecord(project, claim);
		const scoped = projectGameSaveStorage(owner, project, storage);
		expect(loadGameSave(project, scoped)).toEqual(gameSave);
		expect(unclaimedLegacySave(project, [owner], storage)).toBeUndefined();
		expect(
			loadGameSave(
				project,
				projectGameSaveStorage(createProjectRecord(project), project, storage),
			),
		).toBeNull();

		const nextSave = { ...gameSave, savedAt: "2026-01-01T12:00:00.000Z" };
		storeGameSave(project, nextSave, scoped);
		expect(loadGameSave(project, scoped)).toEqual(nextSave);
		expect(loadGameSave(project, storage)).toEqual(gameSave);
	});

	it("can recover an older imported revision alongside a different migrated project", () => {
		const { storage, project, gameSave } = setup();
		storeGameSave(project, gameSave, storage);
		const legacy = {
			...createProjectRecord(createProjectFromPreset("demo")),
			id: LEGACY_PROJECT_ID,
		};
		const claim = unclaimedLegacySave(project, [legacy], storage);
		expect(claim).toBe(gameSave.projectId);

		const imported = createProjectRecord(project, claim);
		const records = [legacy, imported];
		expect(
			loadGameSave(
				project,
				projectGameSaveStorage(imported, project, storage, records),
			),
		).toEqual(gameSave);
		expect(
			loadGameSave(
				project,
				projectGameSaveStorage(legacy, project, storage, records),
			),
		).toBeNull();
	});
});
