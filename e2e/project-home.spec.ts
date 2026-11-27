import fs from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { importProjectJson } from "../src/data/projectImport";
import { createGameSave, GAME_SAVE_PREFIX } from "../src/runtime/gameSave";
import { createRuntimeSession } from "../src/runtime/runtimeSession";
import {
	createStarterProject,
	importProjectFile,
	legacyProjectKey,
	openEditor,
	projectCard,
	projectTool,
	readProjectRecord,
	reloadProject,
	requireGameSave,
	savedProject,
	savedProjectJson,
	selectedProjectId,
} from "./projectNavigation";

test.use({
	viewport: { width: 1440, height: 900 },
	trace: { mode: "retain-on-failure", screenshots: false, snapshots: false },
});

const homeDestinations = ["Asset Creator", "Cinematics", "Map Editor", "Story"];

test("recovers a full browser store and retries the actual arena file @project-storage", async ({
	page,
}) => {
	const arenaPath = "hollow-kingdom-combat-arena.project.json";
	const demo = JSON.parse(await fs.readFile(arenaPath, "utf8"));
	const arenaName: string = demo.metadata.name;
	demo.metadata.name = `${arenaName} - disposable demo copy`;
	const button = (name: string) =>
		page.getByRole("button", { name, exact: true });
	await page.goto("/");
	await createStarterProject(page, "blank", "Keep this world");
	const keepId = await selectedProjectId(page);
	if (!keepId) throw new Error("Missing starter project");
	const keep = await readProjectRecord(page, keepId);
	await button("Projects").click();
	await importProjectFile(
		page,
		{
			name: "demo.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(demo)),
		},
		false,
	);
	const oldId = await selectedProjectId(page);
	if (!oldId) throw new Error("Missing demo project");

	// Fill only this disposable origin. Probe down to 1 KiB using the browser's real quota.
	const quotaName = await page.evaluate(() => {
		let blocks = 0;
		let failure = "";
		for (let size = 1024 * 1024; size >= 1024; size /= 2) {
			const value = "x".repeat(size);
			while (blocks < 64) {
				try {
					localStorage.setItem(`quota-test-${blocks++}`, value);
				} catch (error) {
					failure = (error as DOMException).name;
					break;
				}
			}
		}
		return failure;
	});
	expect(quotaName).toBe("QuotaExceededError");
	await button("Project tools").click();
	const picker = page.waitForEvent("filechooser");
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Import JSON" })
		.click();
	await (await picker).setFiles(arenaPath);
	const manager = page.getByRole("dialog", { name: "Manage storage" });
	await expect(manager).toContainText("Browser storage is full");
	await expect(manager).toContainText(arenaPath);
	await manager.getByRole("button", { name: "Retry import" }).click();
	await expect(manager).toBeVisible();
	const removeDemo = manager.getByRole("button", {
		name: `Delete ${demo.metadata.name}`,
		exact: true,
	});
	await removeDemo.click();
	await button("Cancel").click();
	expect(await readProjectRecord(page, oldId)).not.toBeNull();
	await removeDemo.click();
	await button("Delete project").click();
	await manager.getByRole("button", { name: "Retry import" }).click();
	await expect(
		page.getByRole("heading", { name: arenaName, exact: true }),
	).toBeVisible();
	expect((await savedProject(page)).metadata.name).toBe(arenaName);
	expect(await readProjectRecord(page, oldId)).toBeNull();
	expect(await readProjectRecord(page, keepId)).toEqual(keep);
	await page.reload();
	await expect(button(demo.metadata.name)).toHaveCount(0);
	await expect(button("Keep this world")).toBeVisible();
	await button(arenaName).click();
	await expect(button("Play")).toBeVisible();
});

async function capture(page: Page, testInfo: TestInfo, name: string) {
	const path = testInfo.outputPath(name);
	await page.screenshot({ path, animations: "disabled" });
	await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectHomeGrid(page: Page) {
	const viewport = page.viewportSize();
	if (!viewport)
		throw new Error("Expected a fixed viewport for the home grid.");
	const cards = page.getByRole("main").getByRole("button");
	await expect(cards).toHaveCount(homeDestinations.length);
	const boxes = await Promise.all(
		homeDestinations.map(async (name) => {
			const tile = page
				.getByRole("main")
				.getByRole("button", { name, exact: true });
			const box = await tile.boundingBox();
			if (!box) throw new Error(`Missing workspace tile ${name}`);
			return box;
		}),
	);
	const [first, second, third, fourth] = boxes;
	expect(first.x).toBeCloseTo(third.x, 0);
	expect(second.x).toBeCloseTo(fourth.x, 0);
	expect(first.y).toBeCloseTo(second.y, 0);
	expect(third.y).toBeCloseTo(fourth.y, 0);
	expect(second.x).toBeGreaterThan(first.x);
	expect(third.y).toBeGreaterThan(first.y);
	for (const box of boxes) {
		expect(box.width).toBeCloseTo(first.width, 0);
		expect(box.height).toBeCloseTo(first.height, 0);
		expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
	}
}

test("opens Merewatch, switches independent projects and round-trips authored changes @integration @project-home", async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);
	const legacyJson = await fs.readFile("hollow-kingdom.project.json", "utf8");
	const legacyProject = importProjectJson(legacyJson);
	const legacyName = legacyProject.metadata.name;
	const legacySave = createGameSave(
		legacyProject,
		createRuntimeSession(legacyProject),
	);
	const legacySaveKey = GAME_SAVE_PREFIX + legacySave.projectId;
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.addInitScript(
		({ key, project, saveKey, save }) => {
			if (!localStorage.getItem(key)) localStorage.setItem(key, project);
			if (!localStorage.getItem(saveKey)) localStorage.setItem(saveKey, save);
		},
		{
			key: legacyProjectKey,
			project: legacyJson,
			saveKey: legacySaveKey,
			save: JSON.stringify(legacySave),
		},
	);
	await page.goto("/");
	const projectsHeading = page.getByRole("heading", {
		name: "Your projects",
		exact: true,
	});
	const legacyCard = page.getByRole("button", {
		name: legacyName,
		exact: true,
	});
	const homeHeading = page.getByRole("heading", {
		name: legacyName,
		exact: true,
	});
	const projects = page.getByRole("button", { name: "Projects", exact: true });
	const home = page.getByRole("button", { name: "Home", exact: true });
	const save = page.getByRole("button", { name: "Save", exact: true });
	await expect(projectsHeading).toBeVisible();
	await legacyCard.focus();
	await page.keyboard.press("Enter");
	await expect(homeHeading).toBeFocused();
	await expectHomeGrid(page);
	await capture(page, testInfo, "merewatch-home-1440x900.png");
	await page.setViewportSize({ width: 1120, height: 740 });
	await expectHomeGrid(page);
	await capture(page, testInfo, "merewatch-home-1120x740.png");

	const firstAuthoringSnapshot = await savedProjectJson(page);
	await openEditor(page, "assets");
	await expect(
		page.getByRole("button", { name: "Blender Studio", exact: true }),
	).toBeVisible();
	await home.click();
	await openEditor(page, "cutscenes");
	await expect(
		page.getByRole("button", {
			name: "The Light Across the Mere",
			exact: true,
		}),
	).toBeVisible();
	await home.click();
	await openEditor(page, "story");
	await expect(page.getByLabel("Story graph inspector")).toBeVisible();
	await home.click();
	await openEditor(page, "map");
	await expect(
		page
			.getByRole("navigation", { name: "Editor workspaces" })
			.getByRole("button", { name: "Map Editor", exact: true }),
	).toHaveAttribute("aria-current", "page");
	await expect(
		page.getByRole("button", { name: "3D View", exact: true }),
	).toBeVisible();
	await openEditor(page, "quests");
	await expect(
		page.getByRole("button", { name: "Add quest", exact: true }),
	).toBeVisible();
	await home.click();
	await expect(homeHeading).toBeVisible();
	expect(await savedProjectJson(page)).toBe(firstAuthoringSnapshot);
	await openEditor(page, "map");
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await home.click();
	const play = page.getByRole("button", { name: "Play", exact: true });
	const continueGame = page.getByRole("button", {
		name: "Continue",
		exact: true,
	});
	const back = page.getByRole("button", { name: "Back to Edit", exact: true });
	await play.click();
	await continueGame.click();
	await expect(page.getByLabel("Three runtime viewport")).toBeVisible();
	const saveGame = page.getByRole("button", { name: "Save Game", exact: true });
	await saveGame.click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	const playedSave = await requireGameSave(page);
	expect(playedSave.projectId).toBe(legacySave.projectId);
	expect(playedSave.player.areaId).toBe(legacySave.player.areaId);
	await back.click();
	await expect(homeHeading).toBeVisible();
	await reloadProject(page, false);
	await play.click();
	await continueGame.click();
	await expect(page.getByLabel("Three runtime viewport")).toBeVisible();
	await back.click();

	await projects.click();
	await createStarterProject(page, "blank", "Project B");
	const secondId = await selectedProjectId(page);
	if (!secondId) throw new Error("Expected a stable ID for Project B.");
	expect(secondId).not.toBe("legacy");
	const created = await readProjectRecord(page, secondId);
	await openEditor(page, "character");
	const characterName = page.getByLabel("Character name", { exact: true });
	await characterName.fill("Merewatch Surveyor");
	await projects.click();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(characterName).toHaveValue("Merewatch Surveyor");
	await projects.click();
	await page
		.getByRole("button", { name: "Save and continue", exact: true })
		.click();
	await expect(projectsHeading).toBeVisible();
	expect((await readProjectRecord(page, secondId))?.modifiedAt).not.toBe(
		created?.modifiedAt,
	);
	await page.setViewportSize({ width: 1440, height: 900 });
	await capture(page, testInfo, "projects-1440x900.png");
	await page.setViewportSize({ width: 1120, height: 740 });
	await legacyCard.click();
	expect(await savedProjectJson(page)).toBe(firstAuthoringSnapshot);
	await projects.click();
	await projectCard(page, secondId).click();
	await openEditor(page, "character");
	await expect(characterName).toHaveValue("Merewatch Surveyor");
	await characterName.fill("Merewatch Surveyor draft");
	await projects.click();
	await page
		.getByRole("button", { name: "Keep draft and continue", exact: true })
		.click();
	await projectCard(page, secondId).click();
	await page
		.getByRole("button", { name: "Recover draft", exact: true })
		.click();
	await openEditor(page, "character");
	await expect(characterName).toHaveValue("Merewatch Surveyor draft");
	await characterName.fill("Merewatch Surveyor");
	await save.click();
	const unchanged = await readProjectRecord(page, secondId);
	await reloadProject(page, false);
	expect(await selectedProjectId(page)).toBe(secondId);
	await expect(
		page.getByRole("heading", { name: "Project B", exact: true }),
	).toBeVisible();
	await openEditor(page, "character");
	await expect(characterName).toHaveValue("Merewatch Surveyor");
	expect(await readProjectRecord(page, secondId)).toEqual(unchanged);

	await page
		.locator('input[type="file"]')
		.first()
		.setInputFiles({
			name: "invalid.json",
			mimeType: "application/json",
			buffer: Buffer.from("{invalid"),
		});
	await expect(page.getByText(/Import failed/)).toBeVisible();
	await expect(characterName).toHaveValue("Merewatch Surveyor");
	expect(await readProjectRecord(page, secondId)).toEqual(unchanged);
	const download = page.waitForEvent("download");
	await projectTool(page, "Export JSON");
	const exportPath = testInfo.outputPath("project-b.project.json");
	await (await download).saveAs(exportPath);
	expect(JSON.parse(await fs.readFile(exportPath, "utf8"))).toEqual(
		await savedProject(page),
	);
	await projects.click();
	const fileChooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import JSON", exact: true }).click();
	await (await fileChooser).setFiles(exportPath);
	await expect.poll(() => selectedProjectId(page)).not.toBe(secondId);
	const copyId = await selectedProjectId(page);
	if (!copyId) throw new Error("Expected a stable ID for the imported copy.");
	expect(copyId).not.toBe(secondId);
	expect(await savedProject(page)).toEqual(
		JSON.parse(unchanged?.saved ?? "null"),
	);
	await openEditor(page, "character");
	await characterName.fill("Imported copy only");
	await save.click();
	await projects.click();
	await expect(
		page.getByRole("button", { name: "Project B", exact: true }),
	).toHaveCount(2);
	await projectCard(page, secondId).click();
	await openEditor(page, "character");
	await expect(characterName).toHaveValue("Merewatch Surveyor");
	await page.reload();
	await expect(projectsHeading).toBeVisible();
	await projectCard(page, copyId).click();
	await openEditor(page, "character");
	await expect(characterName).toHaveValue("Imported copy only");
	await projects.click();
	// The earlier Continue checks cover Three. Checking the copied save slot
	// only needs the runtime entry flow, so leave the third renderer launch in 2D.
	await page.evaluate(() =>
		localStorage.setItem("map-workspace-view-v1", "2d"),
	);
	await importProjectFile(page, "hollow-kingdom.project.json", false);
	await play.click();
	await expect(saveGame).toBeVisible();
	await expect(continueGame).toHaveCount(0);
	await back.click();
	const preservedSave = await page.evaluate(
		(key) => localStorage.getItem(key),
		legacySaveKey,
	);
	expect(JSON.parse(preservedSave ?? "null")).toEqual(playedSave);
	const preservedLegacy = await page.evaluate(
		(key) => localStorage.getItem(key),
		legacyProjectKey,
	);
	expect(preservedLegacy).toBe(legacyJson);
	expect(errors).toEqual([]);
});
