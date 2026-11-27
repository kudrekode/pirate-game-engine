import {
	GAME_SAVE_PREFIX,
	type GameSaveStorage,
	gameSaveProjectId,
	loadGameSave,
} from "../runtime/gameSave";
import type { GameProject } from "../types/game";
import { readProjectJson } from "./projectImport";

export const STORAGE_KEY = "adventure-builder-project-v1";
export const AUTOSAVE_DRAFT_STORAGE_KEY = "adventure-builder-project-draft-v1";
export const PROJECT_RECORD_PREFIX = "adventure-builder-editor-project-v1:";
export const SELECTED_PROJECT_KEY = "adventure-builder-editor-selected-v1";
export const LEGACY_PROJECT_ID = "legacy";
const PROJECT_RUNTIME_PREFIX = "adventure-builder-editor-runtime:";

export type ProjectRecord = {
	id: string;
	name: string;
	version: string;
	modifiedAt: string | null;
	saved: string | null;
	draft: string | null;
	legacySaveId?: string;
};

function readLegacyProject(raw: string | null): GameProject | null {
	if (!raw) return null;
	try {
		return readProjectJson(raw);
	} catch {
		return null;
	}
}

function migrateLegacyRecord(storage: Storage): ProjectRecord | null {
	const saved = readLegacyProject(storage.getItem(STORAGE_KEY));
	const draft = readLegacyProject(storage.getItem(AUTOSAVE_DRAFT_STORAGE_KEY));
	const project = saved ?? draft;
	if (!project) return null;
	const savedSnapshot = saved ? JSON.stringify(saved) : null;
	const draftSnapshot = draft ? JSON.stringify(draft) : null;
	return {
		id: LEGACY_PROJECT_ID,
		name: project.metadata.name,
		version: project.metadata.version,
		modifiedAt: null,
		saved: savedSnapshot,
		draft: draftSnapshot === savedSnapshot ? null : draftSnapshot,
	};
}

export function readProjectCatalog(storage: Storage) {
	const records: ProjectRecord[] = [];
	let warning = "";
	for (let index = 0; index < storage.length; index++) {
		const key = storage.key(index);
		if (!key?.startsWith(PROJECT_RECORD_PREFIX)) continue;
		try {
			const record: ProjectRecord = JSON.parse(storage.getItem(key) ?? "null");
			if (
				!record ||
				typeof record.id !== "string" ||
				key !== PROJECT_RECORD_PREFIX + record.id ||
				typeof record.name !== "string" ||
				typeof record.version !== "string" ||
				(record.modifiedAt !== null &&
					!Number.isFinite(Date.parse(record.modifiedAt))) ||
				(record.saved !== null && typeof record.saved !== "string") ||
				(record.draft !== null && typeof record.draft !== "string") ||
				(record.legacySaveId !== undefined &&
					typeof record.legacySaveId !== "string") ||
				!(record.saved || record.draft)
			)
				throw new Error("Invalid project record");
			records.push(record);
		} catch {
			warning =
				"Some project records could not be read. Their browser data is still available.";
		}
	}
	if (storage.getItem(PROJECT_RECORD_PREFIX + LEGACY_PROJECT_ID) === null) {
		const legacy = migrateLegacyRecord(storage);
		if (legacy) {
			records.push(legacy);
			try {
				writeProjectRecord(storage, legacy);
			} catch {
				warning =
					"Could not migrate the saved project into the catalog. You can open and export the original.";
			}
		}
	}
	return {
		records,
		warning,
		lastProjectId: storage.getItem(SELECTED_PROJECT_KEY),
	};
}

export function writeProjectRecord(storage: Storage, record: ProjectRecord) {
	// One write commits the authored snapshot and its list metadata together.
	storage.setItem(PROJECT_RECORD_PREFIX + record.id, JSON.stringify(record));
}

export function hasStoredProject(storage: Storage, id: string) {
	return (
		storage.getItem(PROJECT_RECORD_PREFIX + id) !== null ||
		(id === LEGACY_PROJECT_ID &&
			(storage.getItem(STORAGE_KEY) !== null ||
				storage.getItem(AUTOSAVE_DRAFT_STORAGE_KEY) !== null))
	);
}

function projectStorageKeys(storage: Storage, id: string) {
	// Shared, pre-catalog game saves may belong to more than one revision.
	const scopedSaves = `${PROJECT_RUNTIME_PREFIX}${id}:${GAME_SAVE_PREFIX}`;
	const keys: string[] = [];
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (key?.startsWith(scopedSaves)) keys.push(key);
	}
	if (id === LEGACY_PROJECT_ID)
		keys.push(STORAGE_KEY, AUTOSAVE_DRAFT_STORAGE_KEY);
	keys.push(PROJECT_RECORD_PREFIX + id);
	return keys;
}

export function projectStorageBytes(storage: Storage, id: string) {
	const parts: string[] = [];
	for (const key of projectStorageKeys(storage, id)) {
		const value = storage.getItem(key);
		if (value !== null) parts.push(key, value);
	}
	return new Blob(parts).size;
}

export function removeProjectRecord(storage: Storage, id: string) {
	const keys = projectStorageKeys(storage, id);
	if (storage.getItem(SELECTED_PROJECT_KEY) === id)
		storage.removeItem(SELECTED_PROJECT_KEY);
	for (const key of keys) storage.removeItem(key);
}

export function createProjectRecord(
	project: GameProject,
	legacySaveId?: string,
): ProjectRecord & { saved: string } {
	return {
		id: crypto.randomUUID(),
		name: project.metadata.name,
		version: project.metadata.version,
		modifiedAt: new Date().toISOString(),
		saved: JSON.stringify(project),
		draft: null,
		legacySaveId,
	};
}

export function updateProjectRecord(
	record: ProjectRecord,
	project: GameProject,
	mode: "save" | "draft",
): ProjectRecord {
	const snapshot = JSON.stringify(project);
	return {
		...record,
		name: project.metadata.name,
		version: project.metadata.version,
		modifiedAt:
			snapshot === (record.draft ?? record.saved)
				? record.modifiedAt
				: new Date().toISOString(),
		saved: mode === "save" ? snapshot : record.saved,
		draft: mode === "draft" && snapshot !== record.saved ? snapshot : null,
	};
}

// Earlier versions could create a game save before any editor snapshot had been
// saved. The first matching import may continue that save, while copies get
// independent slots. Keep the original runtime slot available to older builds.
export function unclaimedLegacySave(
	project: GameProject,
	records: ProjectRecord[],
	storage: GameSaveStorage & Partial<Pick<Storage, "key" | "length">>,
): string | undefined {
	if (storage.key && typeof storage.length === "number") {
		let found = false;
		for (let i = 0; i < storage.length && !found; i++)
			found = !!storage.key(i)?.startsWith(GAME_SAVE_PREFIX);
		if (!found) return;
	}
	try {
		const legacySave = loadGameSave(project, {
			getItem: (key) => storage.getItem(key),
			setItem: () => {},
		});
		if (!legacySave) return;
		const id = gameSaveProjectId(project);
		if (records.some((record) => record.legacySaveId === id)) return;
		const legacyRecord = records.find(
			(record) => record.id === LEGACY_PROJECT_ID,
		);
		const legacyOwnsSave = [legacyRecord?.saved, legacyRecord?.draft].some(
			(raw) => {
				const snapshot = readLegacyProject(raw ?? null);
				return snapshot && gameSaveProjectId(snapshot) === id;
			},
		);
		if (!legacyOwnsSave) return id;
	} catch {
		// An unreadable save cannot be attached to an imported project.
	}
}

export function projectGameSaveStorage(
	record: ProjectRecord,
	project: GameProject,
	storage: GameSaveStorage,
	records: ProjectRecord[] = [],
): GameSaveStorage {
	if (record.id === LEGACY_PROJECT_ID) {
		const claims = records.flatMap((item) => item.legacySaveId ?? []);
		if (claims.length === 0 || !claims.includes(gameSaveProjectId(project)))
			return storage;
	}
	const prefix = `${PROJECT_RUNTIME_PREFIX}${record.id}:`;
	const readLegacy =
		record.legacySaveId && record.legacySaveId === gameSaveProjectId(project);
	return {
		getItem: (key) =>
			storage.getItem(prefix + key) ??
			(readLegacy ? storage.getItem(key) : null),
		setItem: (key, value) => storage.setItem(prefix + key, value),
	};
}
