// biome-ignore-all lint/style/noNonNullAssertion: Browser assertions intentionally fail at the exact missing-value boundary.
// biome-ignore-all lint/suspicious/noExplicitAny: The test-only page instrumentation augments Window at runtime.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createProjectFromPreset } from "../src/data/projectPresets";
import { defaultNPCAttributes } from "../src/runtime/npcResolver";

test("records finalised-character runtime cost, collision and camera compatibility @character-runtime-observation", async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);
	const folders = (await fs.readdir("public/assets/project-characters")).filter(
		(name) => /^character-[a-f0-9]{64}$/.test(name),
	);
	expect(
		folders.length,
		"Run @game-character first to import the real authored result",
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
	project.characterAssets = [asset];
	project.player.threeVisual = { mode: "asset", assetId: asset.id };
	project.npcs = [
		{
			id: "npc-authored",
			name: asset.name,
			mapAvatarId: "scout",
			threeVisual: { mode: "asset", assetId: asset.id },
			defaultMovement: { movementMode: "stationary", movementSpeed: 1 },
		},
	];
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "GET" && request.url().endsWith("/character.glb"))
			requests.push(request.url());
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	const observations: Record<string, unknown> = { asset };
	const output = testInfo.outputPath("runtime-observations.json");
	await fs.mkdir(path.dirname(output), { recursive: true });
	for (const total of [2, 3, 5]) {
		project.areas[0].npcs = Array.from({ length: total - 1 }, (_, i) => ({
			id: `npc-${i}`,
			npcDefinitionId: "npc-authored",
			areaId: project.activeAreaId,
			x: 12 + i,
			y: 7,
			facing: "down" as const,
			blocksMovement: true,
			movementMode: "stationary" as const,
			attributes: { ...defaultNPCAttributes },
		}));
		await page.locator('input[type="file"]').setInputFiles({
			name: "characters.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(project)),
		});
		const start = Date.now();
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await page.getByRole("button", { name: "Play 3D Experimental" }).click();
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
								"ThreeRuntimePanel",
							)?.asset.character.animation.activeMixers,
					),
				{ timeout: 45_000 },
			)
			.toBe(total);
		const loadMs = Date.now() - start;
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
								"ThreeRuntimePanel",
							)?.frame.frameCount ?? 0,
					),
				{ timeout: 30_000 },
			)
			.toBeGreaterThan(35);
		observations[String(total)] = {
			loadMs,
			snapshot: await page.evaluate(() =>
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel"),
			),
		};
		await fs.writeFile(output, JSON.stringify(observations, null, 2));
		if (total === 3) {
			await page.getByLabel("Three runtime viewport", { exact: true }).focus();
			await page.keyboard.press("ArrowRight");
			await expect(page.getByText("Pos: 11, 7", { exact: true })).toBeVisible();
			await page.keyboard.press("ArrowRight");
			await expect(
				page.getByText("Blocked by NPC.", { exact: true }),
			).toBeVisible();
			await expect(page.getByText("Pos: 11, 7", { exact: true })).toBeVisible();
			await page.getByRole("button", { name: "Inspect", exact: true }).click();
			await page
				.getByRole("button", { name: "Follow Player", exact: true })
				.click();
			observations.collisionAndCamera = "passed";
			observations.renderer = await page.evaluate(() => {
				const canvas = document.querySelector(
					'canvas[aria-label="Three runtime viewport"]',
				) as HTMLCanvasElement;
				const gl = canvas.getContext("webgl2")!;
				const debug = gl.getExtension("WEBGL_debug_renderer_info");
				return debug
					? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
					: gl.getParameter(gl.RENDERER);
			});
		}
		await page
			.getByRole("button", { name: "Back to editor", exact: true })
			.click();
	}
	expect(requests).toHaveLength(1);
	observations.characterGetRequests = requests.length;
	await fs.writeFile(output, JSON.stringify(observations, null, 2));
	await testInfo.attach("runtime-observations.json", {
		path: output,
		contentType: "application/json",
	});
});

test("finalises a character into a persistent player and independent NPCs @game-character", async ({
	page,
}, testInfo) => {
	test.setTimeout(360_000);
	page.setDefaultTimeout(20_000);
	const errors: string[] = [];
	const observations: Record<string, unknown> = {};
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.getByRole("button", { name: "Asset Creator", exact: true })
		.click();
	await expect(page.getByRole("dialog").getByRole("status")).toContainText(
		"ready to open",
	);
	const popup = page.waitForEvent("popup");
	await page.getByRole("link", { name: "Open Asset Creator" }).click();
	const studio = await popup;
	studio.on("pageerror", (error) => errors.push(error.message));
	await expect(studio.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await studio
		.getByRole("navigation", { name: "Character categories" })
		.getByRole("button", { name: "Body", exact: true })
		.click();
	await studio.getByRole("button", { name: "Broad body preset" }).click();
	await studio
		.getByRole("navigation", { name: "Character categories" })
		.getByRole("button", { name: "Clothing", exact: true })
		.click();
	await studio.getByRole("button", { name: "Navy top", exact: true }).click();
	let finalised: any;
	for (const mode of ["preview", "compile"]) {
		const started = Date.now();
		const response = studio.waitForResponse(
			(r) => r.url().endsWith(`/${mode}`) && r.request().method() === "POST",
			{ timeout: 180_000 },
		);
		await studio
			.getByRole("button", {
				name: mode === "preview" ? "Generate Preview" : "Finalise Character",
				exact: true,
			})
			.click();
		finalised = await (await response).json();
		expect(finalised.status, JSON.stringify(finalised)).toBe("succeeded");
		observations[`${mode}Ms`] = Date.now() - started;
		await expect(studio.locator("[data-preview-revision]")).toHaveAttribute(
			"data-preview-revision",
			finalised.requestId,
		);
		await expect(studio.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
		if (mode === "preview")
			await expect(
				studio.getByRole("button", { name: "Use in Game", exact: true }),
			).toHaveCount(0);
	}
	await studio.screenshot({
		path: testInfo.outputPath("finalised-creator.png"),
	});
	const imported = page.waitForResponse((r) =>
		r.url().endsWith("/__game/characters/import"),
	);
	await studio
		.getByRole("button", { name: "Use in Game", exact: true })
		.click();
	const importResponse = await imported;
	const importResult = await importResponse.json();
	expect(importResponse.ok(), JSON.stringify(importResult)).toBe(true);
	await expect(
		page.getByRole("region", { name: "Project characters" }),
	).toBeVisible();
	const card = page.getByRole("article", { name: importResult.asset.name });
	await card.getByRole("button", { name: "Set as Player Character" }).click();
	await card.getByRole("button", { name: "Add to NPC palette" }).click();
	await page.getByRole("button", { name: "Map", exact: true }).click();
	await page.getByRole("button", { name: "Tile 12, 7", exact: true }).click();
	const loads: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "GET" && request.url().endsWith("/character.glb"))
			loads.push(request.url());
	});
	async function play(instances: number) {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await page.getByRole("button", { name: "Play 3D Experimental" }).click();
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const state =
							window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
								"ThreeRuntimePanel",
							);
						return state?.asset.character.animation.loadingSourceCount === 0 &&
							state?.asset.character.animation.missingClipCount === 0
							? state?.asset.character.animation.activeMixers
							: 0;
					}),
				{ timeout: 60_000 },
			)
			.toBe(instances);
		await expect
			.poll(
				() =>
					page.evaluate(
						() =>
							window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
								"ThreeRuntimePanel",
							)?.frame.frameCount ?? 0,
					),
				{ timeout: 30_000 },
			)
			.toBeGreaterThan(35);
		return page.evaluate(() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel"),
		);
	}
	observations.twoInstances = await play(2);
	await page
		.getByRole("button", { name: "Back to editor", exact: true })
		.click();
	// Re-enter the existing NPC placement mode and add another reference.
	await page.getByRole("button", { name: "Tile 13, 7", exact: true }).click();
	await page.keyboard.press("1");
	await page.getByRole("button", { name: "Tile 13, 7", exact: true }).click();
	await page.getByLabel("Scale", { exact: true }).fill("1.1");
	await page.getByLabel("Rotation offset", { exact: true }).fill("25");
	await page.getByRole("button", { name: "Duplicate NPC instance" }).click();
	await page.getByLabel("X", { exact: true }).fill("14");
	await page.getByRole("button", { name: "Delete NPC instance" }).click();
	observations.threeInstances = await play(3);
	await page.evaluate(() => {
		(window as any).__characterWalkObserved = false;
		const tick = () => {
			const state =
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
					?.asset.character.animation.playerState;
			if (state === "walk") (window as any).__characterWalkObserved = true;
			else (window as any).__characterObserver = requestAnimationFrame(tick);
		};
		tick();
	});
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await page.keyboard.press("ArrowUp");
	await expect(page.getByText("Pos: 10, 6", { exact: true })).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => (window as any).__characterWalkObserved))
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
						?.asset.character.animation.playerState,
			),
		)
		.toBe("idle");
	await page.screenshot({
		path: testInfo.outputPath("three-characters-runtime.png"),
	});
	await page
		.getByRole("button", { name: "Back to editor", exact: true })
		.click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() =>
		JSON.parse(localStorage.getItem("adventure-builder-project-v1")!),
	);
	expect(saved.characterAssets[0].artifactHash).toBe(
		finalised.manifest.outputHash,
	);
	expect(saved.player.threeVisual.assetId).toBe(importResult.asset.id);
	expect(saved.areas[0].npcs).toHaveLength(2);
	expect(saved.areas[0].npcs[1].threeVisual).toMatchObject({
		scale: 1.1,
		rotationOffset: 25,
	});
	expect(loads).toHaveLength(1);
	async function reloadSaved() {
		await page.reload();
		const savedChoice = page.getByRole("button", {
			name: "Use saved project",
			exact: true,
		});
		await expect(
			savedChoice.or(page.getByRole("button", { name: "Play", exact: true })),
		).toBeVisible();
		if (await savedChoice.isVisible()) await savedChoice.click();
	}
	await reloadSaved();
	observations.reloaded = await play(3);
	await page.screenshot({ path: testInfo.outputPath("reloaded-runtime.png") });
	await page
		.getByRole("button", { name: "Back to editor", exact: true })
		.click();
	await page.getByRole("button", { name: "Export JSON", exact: true }).click();
	// The same saved project also works in a fresh browser page with no loader cache.
	await page.getByRole("button", { name: "Map", exact: true }).click();
	await page.keyboard.press("1");
	await page.getByRole("button", { name: "Tile 12, 7", exact: true }).click();
	for (const x of [14, 15]) {
		await page.getByRole("button", { name: "Duplicate NPC instance" }).click();
		await page.getByLabel("X", { exact: true }).fill(String(x));
	}
	observations.fiveInstances = await play(5);
	await page.screenshot({
		path: testInfo.outputPath("five-characters-runtime.png"),
	});
	await page
		.getByRole("button", { name: "Back to editor", exact: true })
		.click();
	await page.getByRole("button", { name: "Load", exact: true }).click();
	await page.route(`**${importResult.asset.glbUrl}`, (route) =>
		route.fulfill({ status: 404, body: "Missing character" }),
	);
	await reloadSaved();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await page.getByRole("button", { name: "Play 3D Experimental" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"A visual asset is unavailable",
		{ timeout: 30_000 },
	);
	expect(
		await page.evaluate(
			() =>
				JSON.parse(localStorage.getItem("adventure-builder-project-v1")!).player
					.threeVisual.assetId,
		),
	).toBe(importResult.asset.id);
	observations.missingAssetPreserved = true;
	observations.savedProject = saved;
	observations.characterGetRequests = loads.length;
	observations.artifactHash = finalised.manifest.outputHash;
	observations.pageErrors = errors;
	expect(errors).toEqual([]);
	await testInfo.attach("game-character-observations.json", {
		path: await (async () => {
			const output = testInfo.outputPath("game-character-observations.json");
			await fs.writeFile(output, JSON.stringify(observations, null, 2));
			return output;
		})(),
		contentType: "application/json",
	});
});

test("opens Asset Creator and explains an unavailable Studio @integration", async ({
	page,
}) => {
	let available = true;
	await page.route("**/__asset-studio/health", async (route) => {
		if (available)
			await route.fulfill({
				json: { app: "asset-studio" },
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		else await route.abort();
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	const launcher = page.getByRole("button", {
		name: "Asset Creator",
		exact: true,
	});
	await launcher.click();
	const dialog = page.getByRole("dialog", { name: "Asset Creator" });
	await expect(dialog.getByRole("status")).toContainText("ready to open");
	await expect(dialog.getByRole("link")).toHaveAttribute("target", "_blank");
	await expect(dialog.getByRole("link")).toHaveAttribute(
		"href",
		`http://127.0.0.1:5174/?returnTo=${encodeURIComponent(page.url())}`,
	);
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(launcher).toBeFocused();
	available = false;
	await launcher.click();
	await expect(dialog.getByRole("status")).toContainText(
		"could not be reached",
	);
	await dialog.getByText("Local setup and connection help").click();
	await expect(dialog.getByText("npm run dev:asset-studio")).toBeVisible();
	await dialog.getByRole("button", { name: "Close", exact: true }).click();
	await expect(dialog).not.toBeVisible();
});

// Explicit two-server acceptance; start Asset Studio on its configured origin.
test("edits and finalises the canonical human from Game Engine and returns @workflow-navigation @canonical-human", async ({
	page,
}) => {
	// Three real compile requests (four Blender passes), plus software WebGL on CI.
	test.setTimeout(300_000);
	const timings: Record<string, number> = {};
	const openedAt = Date.now();
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.getByRole("button", { name: "Asset Creator", exact: true })
		.click();
	await expect(page.getByRole("dialog").getByRole("status")).toContainText(
		"ready to open",
	);
	const popup = page.waitForEvent("popup");
	await page.getByRole("link", { name: "Open Asset Creator" }).click();
	const studio = await popup;
	const errors: string[] = [];
	studio.on("pageerror", (error) => errors.push(error.message));
	const host = studio.locator(
		'[data-preview-source="authored-human-canonical-v1"]',
	);
	await expect(studio.getByLabel("Character type")).toHaveValue("authored");
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle", {
		timeout: 30_000,
	});
	timings.initialLoadMs = Date.now() - openedAt;
	const category = (name: string) =>
		studio
			.getByRole("navigation", { name: "Character categories" })
			.getByRole("button", { name, exact: true });
	const cameras = studio.getByRole("group", { name: "3D preview controls" });
	const canvas = host.locator("canvas");
	const box = await canvas.boundingBox();
	expect(box?.width).toBeGreaterThan(650);
	expect(box?.height).toBeGreaterThan(400);
	if (!box) {
		throw new Error("The 3D preview canvas has no bounding box.");
	}
	for (const [label, preset] of [
		["Full Body", "full-body"],
		["Upper Body", "upper-body"],
		["Face", "face"],
		["Back", "back"],
	]) {
		await cameras.getByRole("button", { name: label, exact: true }).click();
		await expect(host).toHaveAttribute("data-camera-preset", preset);
	}
	await studio.getByRole("button", { name: "Full Body", exact: true }).click();
	const initialCamera = await host.getAttribute("data-camera-position");
	await canvas.hover();
	await studio.mouse.wheel(0, -160);
	await expect
		.poll(() => host.getAttribute("data-camera-position"))
		.not.toBe(initialCamera);
	const zoomed = await host.getAttribute("data-camera-position");
	await studio.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
	await studio.mouse.down();
	await studio.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, {
		steps: 8,
	});
	await studio.mouse.up();
	await expect
		.poll(() => host.getAttribute("data-camera-position"))
		.not.toBe(zoomed);
	await category("Face").click();
	await expect(host).toHaveAttribute("data-camera-preset", "custom");
	await studio
		.getByRole("button", { name: "Reset Camera", exact: true })
		.click();
	let requests = 0;
	studio.on("request", (request) => {
		if (
			request.method() === "POST" &&
			/\/(preview|compile)$/.test(request.url())
		)
			requests++;
	});

	await category("Body").click();
	await expect(host).toHaveAttribute("data-camera-preset", "full-body");
	const switchAt = Date.now();
	await studio.getByRole("button", { name: "Fuller body preset" }).click();
	timings.presetSwitchMs = Date.now() - switchAt;
	await studio.getByLabel("Build", { exact: true }).fill("0.85");
	await expect(studio.getByText("Custom", { exact: true })).toBeVisible();
	await expect(studio.getByText(/Changes not previewed/)).toBeVisible();
	expect(requests).toBe(0);
	const previewAt = Date.now();
	const previewResponse = studio.waitForResponse(
		(r) => r.url().endsWith("/preview") && r.request().method() === "POST",
	);
	await studio
		.getByRole("button", { name: "Generate Preview", exact: true })
		.click();
	const preview = await (await previewResponse).json();
	expect(preview.status, JSON.stringify(preview)).toBe("succeeded");
	timings.bodyPreviewMs = Date.now() - previewAt;
	expect(preview.manifest.geometrySource.values.mass).toBe(0.85);
	expect(preview.manifest.geometrySource.values.headWidth).toBe(0);
	expect(preview.manifest.validationLevel).toBe("preview");
	expect(preview.manifest.deterministicBuild).toBe(false);
	await expect(
		studio.getByText("Preview ready", { exact: true }),
	).toBeVisible();
	await expect(host).toHaveAttribute(
		"data-preview-revision",
		preview.requestId,
	);
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
	);
	await studio.screenshot({
		path: "test-results/canonical-creator-full-body.png",
	});

	await category("Face").click();
	await expect(host).toHaveAttribute("data-camera-preset", "face");
	await studio.getByRole("button", { name: "Square face preset" }).click();
	await studio.getByLabel("Head Width", { exact: true }).fill("0.7");
	await cameras.getByRole("button", { name: "Face", exact: true }).click();
	const chosenFaceCamera = await host.getAttribute("data-camera-position");
	if (!chosenFaceCamera) {
		throw new Error("The face camera position was not recorded.");
	}
	const faceResponse = studio.waitForResponse(
		(r) => r.url().endsWith("/preview") && r.request().method() === "POST",
	);
	const faceAt = Date.now();
	await studio
		.getByRole("button", { name: "Generate Preview", exact: true })
		.click();
	const facePreview = await (await faceResponse).json();
	timings.facePreviewMs = Date.now() - faceAt;
	expect(facePreview.status, JSON.stringify(facePreview)).toBe("succeeded");
	expect(facePreview.manifest.geometrySource.values.headWidth).toBe(0.7);
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
	);
	await expect(host).toHaveAttribute("data-camera-preset", "face");
	await expect(host).toHaveAttribute("data-camera-position", chosenFaceCamera);
	await studio.screenshot({ path: "test-results/canonical-creator-face.png" });
	await category("Hair").click();
	await studio.getByRole("button", { name: "No hair", exact: true }).click();
	await studio.getByRole("button", { name: "Short hair", exact: true }).click();
	await studio
		.getByRole("button", { name: "Auburn hair", exact: true })
		.click();
	await expect(studio.getByText(/Changes not previewed/)).toBeVisible();
	const finaliseAt = Date.now();
	const fullResponse = studio.waitForResponse(
		(r) => r.url().endsWith("/compile") && r.request().method() === "POST",
	);
	await studio
		.getByRole("button", { name: "Finalise Character", exact: true })
		.click();
	const full = await (await fullResponse).json();
	expect(full.status, JSON.stringify(full)).toBe("succeeded");
	expect(full.manifest.deterministicBuild).toBe(true);
	timings.finaliseMs = Date.now() - finaliseAt;
	expect(full.manifest.appearance.hair.authoredColor).toBe("#8b3f27");
	expect(full.manifest.geometrySource.values.mass).toBe(0.85);
	expect(full.manifest.geometrySource.values.headWidth).toBe(0.7);
	await expect(
		studio.getByText("Character finalised", { exact: true }),
	).toBeVisible();
	await expect(
		studio.getByRole("link", { name: "Download character GLB" }),
	).toBeVisible();
	expect(requests).toBe(3);
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
	);
	await cameras.getByRole("button", { name: "Full Body", exact: true }).click();
	await category("Body").click();
	await studio.screenshot({ path: "test-results/creator-product-final.png" });
	await test.info().attach("creator timings", {
		body: JSON.stringify(timings),
		contentType: "application/json",
	});
	console.log("CREATOR_TIMINGS", JSON.stringify(timings));
	expect(errors).toEqual([]);
	const back = studio.getByRole("link", { name: "Back to Game Engine" });
	await expect(back).toHaveAttribute("href", page.url());
	await back.click();
	await expect(studio).toHaveURL(page.url());
	await expect(
		studio.getByRole("button", { name: "Asset Creator", exact: true }),
	).toBeVisible();
});

// Explicit clothing acceptance: two previews, one finalisation, and recipe reopening.
test("creates and reopens a dressed character @first-outfit", async ({
	page,
}) => {
	test.setTimeout(300_000);
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.getByRole("button", { name: "Asset Creator", exact: true })
		.click();
	await expect(page.getByRole("dialog").getByRole("status")).toContainText(
		"ready to open",
	);
	const popup = page.waitForEvent("popup");
	await page.getByRole("link", { name: "Open Asset Creator" }).click();
	const studio = await popup;
	studio.setDefaultTimeout(60_000);
	const errors: string[] = [];
	studio.on("pageerror", (e) => errors.push(e.message));
	const loaded = async () => {
		await expect(studio.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
	};
	await loaded();
	await expect(studio.getByLabel("Character type")).toHaveValue("authored");
	const category = (name: string) =>
		studio
			.getByRole("navigation", { name: "Character categories" })
			.getByRole("button", { name, exact: true });
	const camera = (name: string) =>
		studio
			.getByRole("group", { name: "3D preview controls" })
			.getByRole("button", { name, exact: true });
	let requests = 0;
	studio.on("request", (r) => {
		if (r.method() === "POST" && /\/(preview|compile)$/.test(r.url()))
			requests++;
	});
	await category("Body").click();
	await studio.getByRole("button", { name: "Athletic body preset" }).click();
	await category("Face").click();
	await studio.getByRole("button", { name: "Square face preset" }).click();
	await category("Hair").click();
	await studio.getByRole("button", { name: "Short hair", exact: true }).click();
	await category("Clothing").click();
	await studio.getByRole("button", { name: /Everyday Outfit/ }).click();
	await studio.getByRole("button", { name: "White top", exact: true }).click();
	await expect(studio.getByText(/Changes not previewed/)).toBeVisible();
	expect(requests).toBe(0);
	const compile = async (mode: "preview" | "compile") => {
		const response = studio.waitForResponse(
			(r) => r.url().endsWith(`/${mode}`) && r.request().method() === "POST",
			{ timeout: 180_000 },
		);
		await studio
			.getByRole("button", {
				name: mode === "preview" ? "Generate Preview" : "Finalise Character",
				exact: true,
			})
			.click();
		const result = await (await response).json();
		expect(result.status, JSON.stringify(result)).toBe("succeeded");
		await expect(studio.locator("[data-preview-revision]")).toHaveAttribute(
			"data-preview-revision",
			result.requestId,
		);
		await loaded();
		return result;
	};
	const athletic = await compile("preview");
	expect(athletic.manifest.clothing.top.color).toBe("#dddcd5");
	expect(athletic.manifest.geometrySource.values.mass).toBe(0);
	expect(athletic.manifest.validationLevel).toBe("preview");
	expect(athletic.manifest.deterministicBuild).toBe(false);
	await camera("Full Body").click();
	await studio.screenshot({
		path: "test-results/first-outfit/browser-athletic-front.png",
	});
	await camera("Back").click();
	await studio.screenshot({
		path: "test-results/first-outfit/browser-athletic-back.png",
	});
	await studio.getByRole("button", { name: "Walk", exact: true }).click();
	const walkingHost = studio.locator("[data-animation-state]");
	await expect(walkingHost).toHaveAttribute("data-animation-state", "walk");
	const firstPose = await walkingHost.getAttribute("data-pose-snapshot");
	await expect
		.poll(() => walkingHost.getAttribute("data-pose-snapshot"))
		.not.toBe(firstPose);
	await camera("Three-quarter").click();
	await studio.screenshot({
		path: "test-results/first-outfit/browser-athletic-walk.png",
	});
	await category("Body").click();
	await studio.getByRole("button", { name: "Fuller body preset" }).click();
	const fuller = await compile("preview");
	expect(fuller.manifest.geometrySource.values.mass).toBe(1);
	expect(fuller.manifest.clothing).toEqual(athletic.manifest.clothing);
	await studio.getByRole("button", { name: "Idle", exact: true }).click();
	await camera("Full Body").click();
	await studio.screenshot({
		path: "test-results/first-outfit/browser-fuller.png",
	});
	const full = await compile("compile");
	expect(full.manifest.deterministicBuild).toBe(true);
	expect(full.manifest.validationLevel).toBe("full");
	expect(full.manifest.outputHash).toBe(fuller.manifest.outputHash);
	await expect(
		studio.getByRole("link", { name: "Download character GLB" }),
	).toBeVisible();
	const assetDownload = studio.waitForEvent("download");
	await studio.getByRole("link", { name: "Download character GLB" }).click();
	expect(await (await assetDownload).failure()).toBeNull();
	const recipeDownload = studio.waitForEvent("download");
	await studio
		.getByRole("button", { name: "Save character", exact: true })
		.click();
	const saved = await recipeDownload;
	const recipePath = await saved.path();
	expect(recipePath).toBeTruthy();
	await category("Clothing").click();
	await studio.getByRole("button", { name: /No outfit/ }).click();
	await studio.locator('input[type="file"]').setInputFiles(recipePath!);
	await expect(studio.getByText(/Loaded /)).toBeVisible();
	await category("Clothing").click();
	await expect(
		studio.getByRole("button", { name: /Everyday Outfit/ }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(
		studio.getByRole("button", { name: "White top", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	expect(requests).toBe(3);
	await test.info().attach("outfit compile evidence", {
		body: JSON.stringify({
			athletic: athletic.manifest,
			fuller: fuller.manifest,
			full: full.manifest,
		}),
		contentType: "application/json",
	});
	console.log(
		"OUTFIT_TIMINGS",
		JSON.stringify({
			athletic: athletic.compilationDurationMs,
			fuller: fuller.compilationDurationMs,
			full: full.compilationDurationMs,
			fullHash: full.manifest.outputHash,
		}),
	);
	expect(errors).toEqual([]);
	const back = studio.getByRole("link", { name: "Back to Game Engine" });
	await expect(back).toHaveAttribute("href", page.url());
	await back.click();
	await expect(studio).toHaveURL(page.url());
	await expect(
		studio.getByRole("button", { name: "Asset Creator", exact: true }),
	).toBeVisible();
});
