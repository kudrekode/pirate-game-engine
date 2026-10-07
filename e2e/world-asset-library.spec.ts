import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createProjectFromPreset } from "../src/data/projectPresets";

// Explicit screenshots and the saved-project checkpoint are sufficient evidence;
// a frame-by-frame trace of this dressing workflow is hundreds of megabytes.
test.use({ trace: "off" });

test("composes and persists a harbour using every kit asset through the Map Editor @world-kit", async ({
	page,
}, testInfo) => {
	test.setTimeout(900_000);
	page.setDefaultTimeout(20_000);
	const manifest = JSON.parse(
		await fs.readFile("public/assets/world-kit/manifest.json", "utf8"),
	) as {
		assets: { id: string; name: string; category: string; url: string }[];
	};
	const assetRoot =
		"public/assets/project-characters/character-6c63a38a4e7048c3f37eff4c2c6a4594f6267b5b523ed7ee6a23e87bdbe72e19";
	const character = JSON.parse(
		await fs.readFile(`${assetRoot}/asset.json`, "utf8"),
	);
	expect(
		createHash("sha256")
			.update(await fs.readFile(`${assetRoot}/character.glb`))
			.digest("hex"),
	).toBe(character.artifactHash);
	const project = createProjectFromPreset("blank");
	project.metadata.name = "Tidewatch Harbour";
	project.characterAssets = [character];
	project.player.canWalkOn.push("sand");
	project.camera.three = {
		...(project.camera.three ?? {}),
		distance: 13,
		height: 8,
		lookAtHeight: 0.8,
	};
	const area = project.areas[0];
	area.name = "Tidewatch Harbour";
	area.eventBlocks[0].x = 9;
	area.eventBlocks[0].y = 8;
	// Ordinary imported project ground, no new terrain tool or default scene.
	area.terrainTiles = area.terrainTiles.map((tile) => ({
		...tile,
		tileId:
			tile.y >= 11
				? "water"
				: tile.y >= 8 || (tile.x >= 3 && tile.x <= 13 && tile.y >= 3)
					? "sand"
					: "grass",
	}));
	const errors: string[] = [];
	const failedAssets: string[] = [];
	const requests: Record<string, number> = {};
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("response", (response) => {
		const url = new URL(response.url());
		if (url.pathname.endsWith(".glb"))
			requests[url.pathname] = (requests[url.pathname] ?? 0) + 1;
		if (url.pathname.startsWith("/assets/") && response.status() >= 400)
			failedAssets.push(url.pathname);
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page.locator('input[type="file"]').setInputFiles({
		name: "tidewatch-ground.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(project)),
	});
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	const canvas = page
		.getByRole("img", { name: "3D preview viewport", exact: true })
		.locator("canvas");
	await expect(canvas).toBeVisible();
	const search = page.getByRole("textbox", { name: "Search assets" });
	const snapshot = (label: string) =>
		page.evaluate(
			(name) => window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(name),
			label,
		);
	async function field(label: string, value: number) {
		const input = page.getByLabel(label, { exact: true });
		if ((await input.inputValue()) === String(value)) return;
		await input.fill(String(value));
		await input.press("Tab");
	}
	async function position(x: number, z: number, yaw = 0, y = 0) {
		await field("Position X", x);
		await field("Position Z", z);
		await field("Rotation Y", yaw);
		await field("Position Y", y);
	}
	// x, z, yaw, elevation: each is authored through the inspector below.
	const placements: Record<string, number[]> = {
		barrel: [6.8, 7.7, 15],
		crate: [3.1, 7.1, -10],
		chest: [5, 5.2],
		dock: [8.5, 11.3],
		floor: [5, 5.9, 0, -0.15],
		palm: [2, 4, 30],
		bush: [2.3, 8.8],
		grass: [14.4, 8.9],
		rowboat: [11.4, 12.3, 75],
		railing: [6.4, 10.5],
		wall: [13.7, 4.2, 90],
		post: [13.7, 5.3],
		stairs: [8.5, 10.1],
		table: [11.2, 7.9],
		stool: [11.3, 8.8],
		sack: [10.2, 5.5],
		lantern: [11.5, 7.9, 0, 0.78],
		sign: [6.6, 9.7, 15],
		rope: [8.6, 11.3, 0, 0.65],
		"rock-small": [14.8, 10.2],
		"rock-large": [16.2, 9.2, 25],
		shack: [5, 3.9],
		stall: [11, 4.5],
	};
	let placed = 0;
	for (const asset of manifest.assets) {
		await search.fill("");
		await page
			.getByRole("button", { name: asset.category, exact: true })
			.click();
		await search.fill(asset.id === "world-barrel" ? "Barrel" : asset.name);
		const card = page.getByRole("article", { name: asset.name, exact: true });
		await expect(card).toBeVisible();
		await expect
			.poll(() =>
				card
					.locator("img")
					.evaluate(
						(img: HTMLImageElement) => img.complete && img.naturalWidth === 256,
					),
			)
			.toBe(true);
		const bounds = await canvas.boundingBox();
		if (!bounds) throw new Error("Missing editor viewport");
		await card.dragTo(canvas, {
			targetPosition: { x: bounds.width * 0.5, y: bounds.height * 0.5 },
		});
		await expect(page.getByLabel("Scene name")).toHaveValue(asset.name);
		await expect(
			page.getByRole("option", { name: `${asset.name} object`, exact: true }),
		).toHaveAttribute("aria-selected", "true");
		placed++;
		await expect
			.poll(
				async () =>
					(await snapshot("ThreeDPreview"))?.asset.activeImportedAssetInstances,
				{ timeout: 30_000 },
			)
			.toBe(placed);
		if (asset.id === "world-barrel") {
			await page
				.getByRole("button", { name: "Focus selected", exact: true })
				.click();
			const b = await canvas.boundingBox();
			if (!b) throw new Error("Missing viewport");
			const x = b.x + b.width / 2,
				y = b.y + b.height / 2,
				h = b.height;
			const before = await page.getByLabel("Position X").inputValue();
			await page.mouse.move(x + h * 0.078, y + h * 0.14);
			await page.mouse.down();
			await page.mouse.move(x + h * 0.218, y + h * 0.22, { steps: 12 });
			await page.mouse.up();
			await expect(page.getByLabel("Position X")).not.toHaveValue(before);
			await page
				.getByRole("button", { name: "Reset camera", exact: true })
				.click();
		}
		const p = placements[asset.id.slice(6)];
		await position(p[0], p[1], p[2], p[3]);
		// Each model must survive the actual duplicate/transform/delete workflow.
		await page.getByRole("button", { name: "Duplicate", exact: true }).click();
		await expect(page.getByLabel("Scene name")).toHaveValue(
			`${asset.name} copy`,
		);
		await field("Rotation Y", 45);
		await page.getByRole("button", { name: "Delete", exact: true }).click();
		await page
			.getByRole("option", { name: `${asset.name} object`, exact: true })
			.click();
		await expect(page.getByLabel("Position X")).toHaveValue(String(p[0]));
		console.log(`Placed, transformed and duplicated: ${asset.name}`);
	}
	for (const [name, x, z, yaw] of [
		["Wooden Barrel", 7.9, 7.9, -15],
		["Supply Crate", 3.5, 8.3, 10],
		["Dock Section", 8.5, 13.3, 0],
		["Coastal Palm", 15.3, 3.5, -35],
		["Coastal Bush", 14.7, 7.2, 75],
		["Grass Clump", 3, 3, 20],
		["Wooden Stool", 10.3, 8.1, 20],
	] as const) {
		await page
			.getByRole("option", { name: `${name} object`, exact: true })
			.click();
		await page.getByRole("button", { name: "Duplicate", exact: true }).click();
		await position(x, z, yaw);
		placed++;
	}
	await search.fill("");
	await page.getByRole("button", { name: "Characters", exact: true }).click();
	await page
		.getByRole("button", { name: `Add ${character.name}`, exact: true })
		.click();
	await page.getByLabel("Scene name").fill("Harbour Keeper");
	await position(7.3, 6.1, 0);
	await page.getByRole("button", { name: "Character", exact: true }).click();
	await page
		.getByRole("button", { name: "Set as Player Character", exact: true })
		.click();
	await page.getByRole("button", { name: "Map", exact: true }).click();
	await search.fill("");
	await page.getByRole("button", { name: "All", exact: true }).click();
	await page.getByRole("button", { name: "Reset camera", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await fs.writeFile(
		testInfo.outputPath("composition-checkpoint.json"),
		await page.evaluate(() => {
			const project = localStorage.getItem("adventure-builder-project-v1");
			if (!project) throw new Error("Expected saved project.");
			return project;
		}),
	);
	await expect
		.poll(
			async () =>
				(await snapshot("ThreeDPreview"))?.asset.activeImportedAssetInstances,
			{ timeout: 30_000 },
		)
		.toBe(placed + 2);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() => {
		const project = localStorage.getItem("adventure-builder-project-v1");
		if (!project) throw new Error("Expected saved project.");
		return JSON.parse(project);
	});
	expect(saved.areas[0].objects).toHaveLength(30);
	await page.screenshot({ path: testInfo.outputPath("harbour-editor.png") });
	const editor = await snapshot("ThreeDPreview");
	const beforePlayRequests = { ...requests };
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const runtime = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(runtime).toBeVisible();
	await expect
		.poll(
			async () =>
				(await snapshot("ThreeRuntimePanel"))?.asset.character.animation
					.activeMixers,
			{ timeout: 45_000 },
		)
		.toBe(2);
	await runtime.focus();
	await page.keyboard.press("ArrowDown");
	const frameStart =
		(await snapshot("ThreeRuntimePanel"))?.frame.frameCount ?? 0;
	await expect
		.poll(
			async () => (await snapshot("ThreeRuntimePanel"))?.frame.frameCount ?? 0,
			{ timeout: 30_000 },
		)
		.toBeGreaterThan(frameStart + 30);
	const play = await snapshot("ThreeRuntimePanel");
	expect(play?.asset.loadFailureCount).toBe(0);
	expect(play?.asset.errorFallbackCount).toBe(0);
	expect(play?.asset.activeImportedAssetInstances).toBe(32);
	for (const asset of manifest.assets)
		expect(requests[asset.url], asset.name).toBe(1);
	expect(requests[character.glbUrl]).toBe(beforePlayRequests[character.glbUrl]);
	await page.screenshot({ path: testInfo.outputPath("harbour-play.png") });
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
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
	await expect
		.poll(
			async () =>
				(await snapshot("ThreeDPreview"))?.asset.activeImportedAssetInstances,
			{ timeout: 30_000 },
		)
		.toBe(32);
	await page.getByRole("button", { name: "Props", exact: true }).click();
	await search.fill("Barrel");
	await expect(
		page
			.getByRole("article", { name: "Wooden Barrel", exact: true })
			.locator("img"),
	).toBeVisible();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() => {
			const project = localStorage.getItem("adventure-builder-project-v1");
			if (!project) throw new Error("Expected saved project.");
			return JSON.parse(project);
		}),
	).toEqual(saved);
	await page.screenshot({ path: testInfo.outputPath("harbour-reloaded.png") });
	await fs.writeFile(
		testInfo.outputPath("tidewatch-harbour.project.json"),
		JSON.stringify(saved, null, 2),
	);
	await fs.writeFile(
		testInfo.outputPath("observations.json"),
		JSON.stringify(
			{
				editor,
				play,
				requests,
				failedAssets,
				errors,
				objectCount: 30,
				characterArtifactHash: character.artifactHash,
			},
			null,
			2,
		),
	);
	expect(failedAssets).toEqual([]);
	expect(errors).toEqual([]);
});
