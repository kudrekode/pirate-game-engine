import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createProjectFromPreset } from "../src/data/projectPresets";

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
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page.locator('input[type="file"]').setInputFiles({
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
		page.getByText("Drag an asset into the scene to get started.", {
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
	const saved = await page.evaluate(() => {
		const project = localStorage.getItem("adventure-builder-project-v1");
		if (!project) throw new Error("Expected saved project.");
		return JSON.parse(project);
	});
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
	expect(
		await page.evaluate(() => {
			const project = localStorage.getItem("adventure-builder-project-v1");
			if (!project) throw new Error("Expected saved project.");
			return JSON.parse(project);
		}),
	).toEqual(saved);
	await page.reload();
	const recovery = page.getByRole("button", {
		name: "Use saved project",
		exact: true,
	});
	await expect(
		recovery.or(page.getByRole("button", { name: "Play", exact: true })),
	).toBeVisible();
	if (await recovery.isVisible()) await recovery.click();
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
	expect(
		await page.evaluate(() => {
			const project = localStorage.getItem("adventure-builder-project-v1");
			if (!project) throw new Error("Expected saved project.");
			return JSON.parse(project);
		}),
	).toEqual(saved);
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
