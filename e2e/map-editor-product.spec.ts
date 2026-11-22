import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { createProjectFromPreset } from "../src/data/projectPresets";
import { getTerrainPresentationSurfaceY } from "../src/data/terrainSurface";
import { previewGridPositionToThreePoint } from "../src/editor/sections/previewMove";
import type { GameArea } from "../src/types/game";
import {
	importProjectFile,
	reloadProject,
	savedProject,
} from "./projectNavigation";

test("builds a scene with handles, an authored character and a persistent Edit/Play loop @map-product", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	const folders = (await fs.readdir("public/assets/project-characters"))
		.filter((name) => /^character-[a-f0-9]{64}$/.test(name))
		.sort();
	expect(
		folders.length,
		"This workflow uses an already finalised imported character; no Blender compilation.",
	).toBeGreaterThan(0);
	const directory = path.join("public/assets/project-characters", folders[0]);
	const asset = JSON.parse(
		await fs.readFile(path.join(directory, "asset.json"), "utf8"),
	);
	expect(
		createHash("sha256")
			.update(await fs.readFile(path.join(directory, "character.glb")))
			.digest("hex"),
	).toBe(asset.artifactHash);
	const project = createProjectFromPreset("blank");
	project.metadata.name = "Harbour Workshop";
	project.characterAssets = [asset];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await importProjectFile(page, {
		name: "harbour.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(project)),
	});
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	const viewport = page.getByRole("img", {
		name: "3D preview viewport",
		exact: true,
	});
	const canvas = viewport.locator("canvas");
	await expect(canvas).toBeVisible();
	await expect(
		viewport.getByText("Drag an asset into the scene to get started.", {
			exact: true,
		}),
	).toBeVisible();
	await page
		.getByRole("textbox", { name: "Search assets" })
		.fill("Supply Crate");
	const card = page.getByRole("article", { name: "Supply Crate", exact: true });
	const bounds = await canvas.boundingBox();
	expect(bounds).not.toBeNull();
	if (!bounds) throw new Error("Expected 3D canvas bounds.");
	await card.dragTo(canvas, {
		targetPosition: { x: bounds.width * 0.56, y: bounds.height * 0.56 },
	});
	await expect(page.getByLabel("Scene name")).toHaveValue("Supply Crate");
	await expect(
		page.getByRole("option", { name: "Supply Crate object" }),
	).toHaveAttribute("aria-selected", "true");
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.asset
						.activeImportedAssetInstances,
			),
		)
		.toBe(1);
	await page
		.getByRole("button", { name: "Focus selected", exact: true })
		.click();
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	if (!box) throw new Error("Expected 3D canvas bounds.");
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const h = box.height;
	async function dragHandle(x: number, y: number, dx: number, dy: number) {
		await page.mouse.move(cx + h * x, cy + h * y);
		await page.mouse.down();
		await page.mouse.move(cx + h * (x + dx), cy + h * (y + dy), { steps: 12 });
		await page.mouse.up();
	}
	const startX = await page.getByLabel("Position X").inputValue();
	await dragHandle(0.078, 0.1, 0.14, 0.08);
	await expect(page.getByLabel("Position X")).not.toHaveValue(startX);
	const movedX = await page.getByLabel("Position X").inputValue();
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(page.getByLabel("Position X")).toHaveValue(startX);
	await page.getByRole("button", { name: "Redo", exact: true }).click();
	await expect(page.getByLabel("Position X")).toHaveValue(movedX);
	await page
		.getByRole("button", { name: "Focus selected", exact: true })
		.click();
	await page.getByRole("button", { name: "Rotate", exact: true }).click();
	await dragHandle(0, 0.114, 0.092, -0.056);
	await expect(page.getByLabel("Rotation Y")).not.toHaveValue("0");
	for (const axis of ["X", "Y", "Z"]) {
		await page.getByLabel(`Rotation ${axis}`).fill("0");
		await page.getByLabel(`Rotation ${axis}`).press("Tab");
	}
	await page.getByRole("button", { name: "Scale", exact: true }).click();
	await dragHandle(0.078, 0.1, 0.07, 0.04);
	await expect(page.getByLabel("Scale X")).not.toHaveValue("1");
	await page.getByRole("button", { name: "Duplicate", exact: true }).click();
	await page.getByLabel("Scene name").fill("Spare supplies");
	await page.getByLabel("Scene name").press("Tab");
	await page.getByRole("textbox", { name: "Search assets" }).fill(asset.name);
	await page
		.getByRole("button", { name: `Add ${asset.name}`, exact: true })
		.click();
	await expect(page.getByLabel("Scene name")).toHaveValue(asset.name);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.asset
						.activeImportedAssetInstances,
			),
		)
		.toBe(3);
	const editBuilds = await page.evaluate(
		() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.scene
				.buildCount,
	);
	await page.getByLabel("Scene name").fill("Harbour guide");
	await page.getByLabel("Position X").fill("12.25");
	await page.getByLabel("Position Z").fill("7");
	await page.getByLabel("Position Z").press("Tab");
	await page
		.getByRole("option", { name: "Supply Crate object", exact: true })
		.click();
	await page.getByLabel("Scene name").fill("Harbour supplies");
	for (const [label, value] of [
		["Position X", "10.5"],
		["Position Z", "7.25"],
		["Position Y", "0.25"],
		["Rotation Y", "45"],
		["Scale X", "1.5"],
		["Scale Y", "1.2"],
	]) {
		await page.getByLabel(label).fill(value);
		await page.getByLabel(label).press("Tab");
	}
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(page.getByLabel("Scale Y")).toHaveValue("1");
	await page.getByRole("button", { name: "Redo", exact: true }).click();
	await expect(page.getByLabel("Scale Y")).toHaveValue("1.2");
	expect(
		await page.evaluate(
			() =>
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.scene
					.buildCount,
		),
	).toBe(editBuilds);
	await page
		.getByRole("option", { name: "Spare supplies object", exact: true })
		.click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(
		page.getByRole("option", { name: "Spare supplies object", exact: true }),
	).toHaveCount(0);
	await page
		.getByRole("option", { name: "Harbour supplies object", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Focus selected", exact: true })
		.click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.asset
						.activeImportedAssetInstances,
			),
		)
		.toBe(2);
	const builds = await page.evaluate(
		() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.scene
				.buildCount,
	);
	await canvas.click({ position: { x: 20, y: 20 } });
	await expect(
		page.getByRole("button", { name: "Duplicate", exact: true }),
	).toBeDisabled();
	await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
	await expect(page.getByLabel("Scene name")).toHaveValue("Harbour supplies");
	expect(
		await page.evaluate(
			() =>
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.scene
					.buildCount,
		),
	).toBe(builds);
	await page.getByRole("button", { name: "Reset camera", exact: true }).click();
	await page.getByRole("textbox", { name: "Search assets" }).fill("");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await savedProject(page);
	await page.screenshot({ path: testInfo.outputPath("editor-workspace.png") });
	const originalCanvas = await canvas.elementHandle();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await expect(
		page.getByLabel("Three runtime viewport", { exact: true }),
	).toBeVisible();
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
							?.asset.character.animation.activeMixers,
				),
			{ timeout: 30_000 },
		)
		.toBe(1);
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("Delete");
	await page.screenshot({ path: testInfo.outputPath("play-scene.png") });
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
	expect(originalCanvas).not.toBeNull();
	if (!originalCanvas) throw new Error("Expected original 3D canvas.");
	expect(await originalCanvas.evaluate((node) => node.isConnected)).toBe(true);
	await expect(page.getByLabel("Scene name")).toHaveValue("Harbour supplies");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(await savedProject(page)).toEqual(saved);
	await reloadProject(page);
	await expect(canvas).toBeVisible();
	await page
		.getByRole("option", { name: "Harbour supplies object", exact: true })
		.click();
	await expect(page.getByLabel("Position X")).toHaveValue("10.5");
	await expect(page.getByLabel("Rotation Y")).toHaveValue("45");
	await expect(page.getByLabel("Scale X")).toHaveValue("1.5");
	await page
		.getByRole("option", { name: "Harbour guide Character", exact: true })
		.click();
	await expect(page.getByLabel("Position X")).toHaveValue("12.25");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(await savedProject(page)).toEqual(saved);
	await page.screenshot({ path: testInfo.outputPath("reloaded-scene.png") });
	await fs.writeFile(
		testInfo.outputPath("persistence-evidence.json"),
		JSON.stringify(
			{
				importedArtifactHash: asset.artifactHash,
				savedArea: saved.areas[0],
				selectionOnlySceneBuilds: builds,
				errors,
			},
			null,
			2,
		),
	);
	expect(errors).toEqual([]);
});

type CameraPoint = [number, number, number];

async function readCameraPoint(
	viewport: Locator,
	property: "position" | "target",
): Promise<CameraPoint> {
	const value = await viewport.getAttribute(`data-camera-${property}`);
	if (!value) throw new Error(`Missing editor camera ${property}.`);
	return JSON.parse(value);
}

async function worldPointer(
	viewport: Locator,
	area: GameArea,
	x: number,
	y: number,
) {
	const canvas = viewport.locator("canvas");
	await expect(canvas).toBeVisible();
	const bounds = await canvas.boundingBox();
	if (!bounds) throw new Error("Expected 3D canvas bounds.");
	const camera = new PerspectiveCamera(50, bounds.width / bounds.height);
	camera.position.set(...(await readCameraPoint(viewport, "position")));
	camera.lookAt(...(await readCameraPoint(viewport, "target")));
	camera.updateMatrixWorld();
	const { x: worldX, z: worldZ } = previewGridPositionToThreePoint(area, {
		x,
		y,
	});
	const projected = new Vector3(
		worldX,
		getTerrainPresentationSurfaceY(area, { x, y }, "smooth"),
		worldZ,
	).project(camera);
	expect(Math.abs(projected.x), `scene tile ${x},${y} on canvas`).toBeLessThan(
		1,
	);
	expect(Math.abs(projected.y), `scene tile ${x},${y} on canvas`).toBeLessThan(
		1,
	);
	return {
		x: ((projected.x + 1) * bounds.width) / 2,
		y: ((1 - projected.y) * bounds.height) / 2,
	};
}

async function setNumber(input: Locator, value: number) {
	await input.fill(String(value));
	await input.press("Tab");
}

async function holdKey(page: Page, key: string, during: () => Promise<void>) {
	await page.keyboard.down(key);
	try {
		await during();
	} finally {
		await page.keyboard.up(key);
	}
}

test("sculpts and saves the real Merewatch world @map-editor-merewatch", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	page.setDefaultTimeout(25_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const button = (name: string) =>
		page.getByRole("button", { name, exact: true });
	const option = (name: string) =>
		page.getByRole("option", { name, exact: true });
	await page.goto("/");
	await importProjectFile(page, "hollow-kingdom.project.json");
	const viewport = page.getByRole("img", { name: "3D preview viewport" });
	const canvas = viewport.locator("canvas");
	await expect(canvas).toBeVisible();
	await expect(viewport).toHaveAttribute("data-camera-position", /\[/);
	const snapshot = () =>
		page.evaluate(() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview"),
		);
	await expect
		.poll(async () => (await snapshot())?.renderer.drawCalls, {
			timeout: 20_000,
		})
		.toBeGreaterThan(0);
	const sceneSearch = page.getByRole("textbox", { name: "Search scene" });
	for (const entity of [
		"Oswin the Ferryman Character",
		"Crooked Cottage object",
		"Mooring Deck object",
	])
		await expect(option(entity).first()).toBeVisible();
	for (const drawer of ["Asset Drawer", "Tools Drawer", "World Details"]) {
		await expect(button(drawer)).toHaveAttribute("aria-expanded", "true");
	}
	await expect
		.poll(async () => (await snapshot())?.asset.activeImportedAssetInstances, {
			timeout: 60_000,
		})
		.toBeGreaterThan(100);
	async function save() {
		await button("Save").click();
		return savedProject(page);
	}
	const baseline = await save();
	const area = (project: typeof baseline) => {
		const result = project.areas.find((entry) => entry.id === "merewatch");
		if (!result) throw new Error("Missing Merewatch area.");
		return result;
	};
	const initialArea = area(baseline);
	const terrainTile = (project: typeof baseline, x: number, y: number) =>
		area(project).terrainTiles.find((tile) => tile.x === x && tile.y === y)
			?.tileId;
	const terrainHeight = (project: typeof baseline, x: number, y: number) =>
		area(project).terrainHeights?.find((tile) => tile.x === x && tile.y === y)
			?.height ?? 0;
	const foliage = (project: typeof baseline) =>
		area(project).objects.filter((entry) => entry.state?.foliageGroupId);

	await button("Fly").click();
	const flyOrigin = new Vector3(
		...(await readCameraPoint(viewport, "position")),
	);
	const flyForward = new Vector3(
		...(await readCameraPoint(viewport, "target")),
	).sub(flyOrigin);
	flyForward.y = 0;
	flyForward.normalize();
	const flyPosition = async () =>
		new Vector3(...(await readCameraPoint(viewport, "position")));
	await holdKey(page, "w", async () => {
		await expect
			.poll(async () => (await flyPosition()).sub(flyOrigin).dot(flyForward), {
				timeout: 15_000,
			})
			.toBeGreaterThan(0.25);
	});
	const beforeUp = (await flyPosition()).y;
	await holdKey(page, "e", async () => {
		await expect
			.poll(async () => (await flyPosition()).y, { timeout: 15_000 })
			.toBeGreaterThan(beforeUp + 0.2);
	});
	const beforeDown = (await flyPosition()).y;
	await holdKey(page, "q", async () => {
		await expect
			.poll(async () => (await flyPosition()).y, { timeout: 15_000 })
			.toBeLessThan(beforeDown - 0.2);
	});
	const beforeLook = await readCameraPoint(viewport, "target");
	const beforeLookPosition = await readCameraPoint(viewport, "position");
	const bounds = await canvas.boundingBox();
	if (!bounds) throw new Error("Expected 3D canvas bounds.");
	const centerX = bounds.x + bounds.width / 2;
	const centerY = bounds.y + bounds.height / 2;
	await page.mouse.move(centerX, centerY);
	await page.mouse.down({ button: "right" });
	await page.mouse.move(centerX + 45, centerY + 20, { steps: 5 });
	await page.mouse.up({ button: "right" });
	await expect
		.poll(() => readCameraPoint(viewport, "target"))
		.not.toEqual(beforeLook);
	expect(
		(await flyPosition()).distanceTo(new Vector3(...beforeLookPosition)),
	).toBeLessThan(0.00001);
	const search = page.getByRole("textbox", { name: "Search assets" });
	await search.fill("");
	await search.pressSequentially("2qwe");
	await expect(search).toHaveValue("2qwe");
	await expect(button("Select")).toHaveAttribute("aria-pressed", "true");
	expect(
		(await flyPosition()).distanceTo(new Vector3(...beforeLookPosition)),
	).toBeLessThan(0.00001);
	expect(await save()).toEqual(baseline);

	await sceneSearch.fill("oswin-at-the-well");
	await expect(sceneSearch).toHaveValue("oswin-at-the-well");
	await option("Oswin the Ferryman Character").click();
	await expect(page.getByLabel("Scene name")).toHaveValue("Oswin the Ferryman");
	const beforeFocus = await readCameraPoint(viewport, "target");
	await viewport.focus();
	await page.keyboard.press("f");
	await expect
		.poll(() => readCameraPoint(viewport, "target"))
		.not.toEqual(beforeFocus);
	await button("Orbit").click();
	await button("Top").click();
	await expect
		.poll(async () => (await readCameraPoint(viewport, "target"))[0])
		.toBe(0);
	const drop = await worldPointer(viewport, initialArea, 12, 48);
	await search.fill("Supply Crate");
	await page
		.getByRole("article", { name: "Supply Crate", exact: true })
		.dragTo(canvas, {
			targetPosition: drop,
		});
	await expect(page.getByLabel("Scene name")).toHaveValue("Supply Crate");
	await page.getByLabel("Scene name").fill("Survey crate");
	await setNumber(page.getByLabel("Position X"), 12.25);
	await setNumber(page.getByLabel("Position Y"), 0.25);
	await setNumber(page.getByLabel("Position Z"), 48.25);
	await setNumber(page.getByLabel("Rotation Y"), 23);
	await setNumber(page.getByLabel("Scale X"), 1.5);
	await page.getByLabel("Collision profile").selectOption("solid");
	await sceneSearch.fill("Survey crate");
	await expect(option("Survey crate object")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	const placed = area(await save()).objects.find(
		(entry) => entry.nameOverride === "Survey crate",
	);
	expect(placed).toMatchObject({
		x: 12,
		y: 48,
		scene: { collision: "solid" },
		transform: {
			position: { x: 0.25, y: 0.25, z: 0.25 },
			rotation: { y: 23 },
			scale: { x: 1.5 },
		},
	});
	await button("Hide Survey crate").click();
	await expect(
		page.getByRole("checkbox", { name: "Visible", exact: true }),
	).not.toBeChecked();
	await button("Lock Survey crate").click();
	await expect(
		page.getByRole("checkbox", { name: "Locked", exact: true }),
	).toBeChecked();
	await expect(page.getByLabel("Position X")).toBeDisabled();
	await button("Show Survey crate").click();
	await button("Unlock Survey crate").click();
	await expect(page.getByLabel("Position X")).toBeEnabled();

	async function focusViewport() {
		await viewport.focus();
	}
	async function paint(x: number, y: number, project = baseline) {
		await canvas.click({
			position: await worldPointer(viewport, area(project), x, y),
		});
	}
	async function foliageStroke() {
		const start = await worldPointer(viewport, initialArea, 11, 43);
		const end = await worldPointer(viewport, initialArea, 14, 43);
		const canvasBounds = await canvas.boundingBox();
		if (!canvasBounds) throw new Error("Expected 3D canvas bounds.");
		await page.mouse.move(canvasBounds.x + start.x, canvasBounds.y + start.y);
		await page.mouse.down();
		await page.mouse.move(canvasBounds.x + end.x, canvasBounds.y + end.y, {
			steps: 8,
		});
		await page.mouse.up();
	}
	await focusViewport();
	await page.keyboard.press("2");
	await expect(button("Foliage Scatter")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await setNumber(page.getByLabel("Seed", { exact: true }), 2026);
	await setNumber(page.getByLabel("Density", { exact: true }), 1);
	await setNumber(page.getByLabel("Brush radius", { exact: true }), 3);
	await foliageStroke();
	const plantedProject = await save();
	const planted = foliage(plantedProject);
	expect(planted.length).toBeGreaterThan(2);
	expect(
		new Set(planted.map((entry) => entry.state?.foliageGroupId)).size,
	).toBe(1);
	expect(
		new Set(planted.map((entry) => entry.objectDefinitionId)).size,
	).toBeGreaterThan(1);
	expect(plantedProject.foliageBrush?.seed).toBe(2026);
	await button("Undo").click();
	expect(foliage(await save())).toHaveLength(0);
	await button("Redo").click();
	expect(foliage(await save())).toEqual(planted);
	await button("Erase").click();
	await foliageStroke();
	expect(foliage(await save())).toHaveLength(0);
	await button("Undo").click();
	expect(foliage(await save())).toEqual(planted);
	await button("Paint").click();
	await page.screenshot({ path: testInfo.outputPath("merewatch-foliage.png") });

	await focusViewport();
	await page.keyboard.press("3");
	await expect(button("Terrain Sculpt")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await button("Raise terrain").click();
	await paint(11, 49);
	const raised = await save();
	expect(terrainHeight(raised, 11, 49)).toBeGreaterThan(
		terrainHeight(baseline, 11, 49),
	);
	await button("Smooth terrain").click();
	await page.getByRole("slider", { name: /^Strength\b/ }).press("End");
	await paint(11, 49, raised);
	const smoothed = await save();
	expect(terrainHeight(smoothed, 11, 49)).toBeLessThan(
		terrainHeight(raised, 11, 49),
	);
	await button("Roughen terrain").click();
	await paint(11, 49, smoothed);
	const roughened = await save();
	expect(area(roughened).terrainHeights).not.toEqual(
		area(smoothed).terrainHeights,
	);
	await button("Paint terrain").click();
	await page.getByLabel("Terrain material").selectOption("sand");
	await paint(12, 50, roughened);
	expect(terrainTile(await save(), 12, 50)).toBe("sand");

	await focusViewport();
	await page.keyboard.press("4");
	await expect(button("Water")).toHaveAttribute("aria-pressed", "true");
	await page.getByLabel("Water brush action").selectOption("restore");
	await page.getByLabel("Shore material").selectOption("sand");
	await paint(12, 34);
	expect(terrainTile(await save(), 12, 34)).toBe("sand");
	await page.getByLabel("Water brush action").selectOption("paint");
	await paint(12, 34, await save());
	expect(terrainTile(await save(), 12, 34)).toBe("water");
	await paint(12, 35);
	const expanded = await save();
	expect(terrainTile(expanded, 12, 35)).toBe("water");
	expect(terrainTile(expanded, 25, 29)).toBe("water");
	await page.getByLabel("Water brush action").selectOption("elevation");
	await setNumber(page.getByLabel("Water level offset"), 1);
	await paint(12, 34, expanded);
	expect(terrainHeight(await save(), 12, 34)).toBe(1);
	await page.screenshot({ path: testInfo.outputPath("merewatch-water.png") });

	await button("Sky, fog & lighting").click();
	await page
		.getByLabel("Atmosphere", { exact: true })
		.selectOption("golden-hour");
	await setNumber(page.getByLabel("Fog near (m)", { exact: true }), 24);
	await button("Player & spawn").click();
	await setNumber(page.getByLabel("Spawn X", { exact: true }), 21);
	await focusViewport();
	await page.keyboard.press("1");
	await expect(button("Select")).toHaveAttribute("aria-pressed", "true");
	await button("Reset camera").click();
	await expect
		.poll(async () => (await readCameraPoint(viewport, "position"))[0])
		.toBeGreaterThan(5);
	await button("Tools Drawer").click();
	const persisted = await save();
	expect(area(persisted).theme?.atmosphere).toBe("golden-hour");
	expect(area(persisted).theme?.fog?.near).toBe(24);
	expect(
		area(persisted).eventBlocks.find((event) => event.id === "lane")?.x,
	).toBe(21);
	expect(
		area(persisted).objects.find((entry) => entry.id === placed?.id),
	).toMatchObject({
		objectDefinitionId: placed?.objectDefinitionId,
		transform: placed?.transform,
		scene: { collision: "solid" },
	});
	expect(persisted.cutscenes).toEqual(baseline.cutscenes);
	expect(
		persisted.objects.find((entry) => entry.id === "mere-cottage"),
	).toEqual(baseline.objects.find((entry) => entry.id === "mere-cottage"));
	await page.screenshot({
		path: testInfo.outputPath("merewatch-map-workspace.png"),
	});

	await button("Play").click();
	await expect(
		page.getByLabel("Three runtime viewport", { exact: true }),
	).toBeVisible();
	await expect(page.locator(".three-runtime-host")).toHaveAttribute(
		"data-traversal",
		/"x":21/,
	);
	await page.screenshot({ path: testInfo.outputPath("merewatch-play.png") });
	await button("Back to Edit").click();
	expect(await save()).toEqual(persisted);
	await reloadProject(page);
	await expect(canvas).toBeVisible();
	await expect(button("Tools Drawer")).toHaveAttribute(
		"aria-expanded",
		"false",
	);
	await sceneSearch.fill("Survey crate");
	await option("Survey crate object").click();
	await expect(page.getByLabel("Position X")).toHaveValue("12.25");
	await expect(page.getByLabel("Collision profile")).toHaveValue("solid");
	expect(await save()).toEqual(persisted);
	expect(errors).toEqual([]);
});
