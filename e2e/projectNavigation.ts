import { expect, type Locator, type Page } from "@playwright/test";
import type { GameSave } from "../src/runtime/gameSave";
import type { GameProject } from "../src/types/game";

export const legacyProjectKey = "adventure-builder-project-v1";
const projectRecordPrefix = "adventure-builder-editor-project-v1:";
const selectedProjectKey = "adventure-builder-editor-selected-v1";
const gameSavePrefix = "adventure-builder-game-save-v1:";
const scopedGameSavePrefix = "adventure-builder-editor-runtime:";

const workspaceLabels = {
	assets: "Asset Creator",
	cutscenes: "Cinematics",
	map: "Map Editor",
	story: "Story",
};

type EditorDestination =
	| keyof typeof workspaceLabels
	| "camera"
	| "character"
	| "dialogues"
	| "game-state"
	| "items"
	| "npcs"
	| "objects"
	| "progression"
	| "quests"
	| "shops"
	| "three-d-preview";

export function projectCard(page: Page, id: string) {
	return page.locator(`button[data-project-id=${JSON.stringify(id)}]`);
}

export function selectedProjectId(page: Page) {
	return page.evaluate((key) => localStorage.getItem(key), selectedProjectKey);
}

export async function openEditor(page: Page, destination: EditorDestination) {
	if (destination in workspaceLabels) {
		await page
			.getByRole("button", {
				name: workspaceLabels[destination as keyof typeof workspaceLabels],
				exact: true,
			})
			.click();
		return;
	}
	const select = page
		.getByRole("navigation", { name: "Editor workspaces" })
		.getByRole("combobox", { name: /^More editors\b/ });
	if (!(await select.count())) await openEditor(page, "story");
	await select.selectOption(destination);
}

export async function projectTool(page: Page, name: string) {
	const dialog = page.getByRole("dialog", {
		name: "Project tools",
		exact: true,
	});
	if (!(await dialog.isVisible()))
		await page
			.getByRole("button", { name: "Project tools", exact: true })
			.click();
	await dialog.getByRole("button", { name, exact: true }).click();
	if (await dialog.isVisible())
		await dialog.getByRole("button", { name: "Close", exact: true }).click();
}

export async function openAssetCreator(page: Page) {
	await openEditor(page, "assets");
	await page
		.getByRole("button", { name: "Open Asset Creator", exact: true })
		.click();
}

export async function createStarterProject(
	page: Page,
	preset: "blank" | "demo",
	name?: string,
) {
	await page.getByRole("button", { name: /^New Project\b/i }).click();
	const dialog = page.getByRole("dialog", { name: "Choose a starter project" });
	if (name) await dialog.getByLabel("Project name", { exact: true }).fill(name);
	await dialog
		.getByRole("radio", {
			name: preset === "blank" ? /Blank Project/ : /Demo Project/,
		})
		.check();
	await dialog
		.getByRole("button", { name: "Create project", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Map Editor", exact: true }),
	).toBeVisible();
}

export async function importProjectFile(
	page: Page,
	file: Parameters<Locator["setInputFiles"]>[0],
	openMap = true,
) {
	const previousId = await selectedProjectId(page);
	await page.locator('input[type="file"]').first().setInputFiles(file);
	await expect.poll(() => selectedProjectId(page)).not.toBe(previousId);
	if (openMap) await openEditor(page, "map");
}

export async function reloadProject(page: Page, openMap = true) {
	const id = await selectedProjectId(page);
	if (!id) throw new Error("Expected a selected project before reloading.");
	await page.reload();
	await projectCard(page, id).click();
	const savedChoice = page.getByRole("button", {
		name: "Use saved project",
		exact: true,
	});
	await expect(
		savedChoice.or(
			page.getByRole("button", { name: "Map Editor", exact: true }),
		),
	).toBeVisible();
	if (await savedChoice.isVisible()) await savedChoice.click();
	if (openMap) await openEditor(page, "map");
}

export function readProjectRecord(page: Page, id?: string) {
	return page.evaluate(
		({ prefix, selectedKey, projectId }) => {
			const activeId = projectId ?? localStorage.getItem(selectedKey);
			const raw = activeId ? localStorage.getItem(prefix + activeId) : null;
			return raw
				? (JSON.parse(raw) as {
						id: string;
						modifiedAt: string | null;
						saved: string | null;
						draft: string | null;
					})
				: null;
		},
		{
			prefix: projectRecordPrefix,
			selectedKey: selectedProjectKey,
			projectId: id,
		},
	);
}

export async function savedProjectJson(page: Page) {
	const record = await readProjectRecord(page);
	if (!record?.saved) throw new Error("Expected a saved project.");
	return record.saved;
}

export async function savedProject(page: Page): Promise<GameProject> {
	return JSON.parse(await savedProjectJson(page));
}

export function readGameSave(page: Page): Promise<GameSave | null> {
	return page.evaluate(
		({ legacyPrefix, scopedPrefix, selectedKey }) => {
			const id = localStorage.getItem(selectedKey);
			if (!id) return null;
			const prefix =
				id === "legacy" ? legacyPrefix : `${scopedPrefix}${id}:${legacyPrefix}`;
			const key = Object.keys(localStorage).find((key) =>
				key.startsWith(prefix),
			);
			const raw = key ? localStorage.getItem(key) : null;
			return raw ? JSON.parse(raw) : null;
		},
		{
			legacyPrefix: gameSavePrefix,
			scopedPrefix: scopedGameSavePrefix,
			selectedKey: selectedProjectKey,
		},
	);
}

export async function requireGameSave(page: Page): Promise<GameSave> {
	const save = await readGameSave(page);
	if (!save) throw new Error("Expected a save game for the selected project.");
	return save;
}
