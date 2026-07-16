import { expect, type Locator, type Page, test } from "@playwright/test";

const SOURCE_ID = "procedural-mannequin-v0";
const CAMERA_PRESETS = ["Front", "Side", "Three-quarter"] as const;

async function captureCanvas(page: Page, canvas: Locator, path: string) {
	const overlays = page.locator(
		".preview-controls, .animation-controls, .preview-label, .preview-status, .preview-diagnostics",
	);
	await overlays.evaluateAll((elements) => {
		for (const element of elements)
			(element as HTMLElement).style.visibility = "hidden";
	});
	await canvas.screenshot({ path });
	await overlays.evaluateAll((elements) => {
		for (const element of elements)
			(element as HTMLElement).style.visibility = "";
	});
}

test("previews the deterministic Procedural Mannequin V0 and disposes cleanly on source switches", async ({
	page,
}, testInfo) => {
	test.setTimeout(180_000);
	const consoleErrors: string[] = [];
	page.on("console", (message) => {
		if (
			message.type() === "error" &&
			/asset|track|bind|skeleton|webgl|uncaught/iu.test(message.text())
		) {
			consoleErrors.push(message.text());
		}
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));

	await page.goto("/");
	await page.getByLabel("Preview source").selectOption(SOURCE_ID);
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);
	const canvas = page.getByLabel("Procedural Mannequin V0 preview");
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle");
	await expect(host).toHaveAttribute("data-deterministic-build", "true");
	await expect(host).toHaveAttribute("data-recipe-hash", /^[0-9a-f]{64}$/u);
	await expect(host).toHaveAttribute("data-semantic-hash", /^[0-9a-f]{64}$/u);
	const diagnostics = page.getByLabel("Procedural Mannequin V0 diagnostics");
	await expect(diagnostics).toContainText("procedural-mannequin-v0 · V0");
	await expect(diagnostics).toContainText(
		"1 mesh · 648 vertices · 1108 triangles",
	);
	await expect(diagnostics).toContainText("65-joint Golden template");
	await expect(diagnostics).toContainText("golden-humanoid-v0");
	await expect(diagnostics).toContainText("procedural-mannequin-blender-v0");
	await expect(diagnostics).toContainText("Deterministic buildPass");
	await expect(page.locator("canvas")).toHaveCount(1);

	await page.getByRole("button", { exact: true, name: "Pause" }).click();
	await expect(host).toHaveAttribute("data-animation-playing", "false");
	await page.getByRole("button", { exact: true, name: "Rest" }).click();
	const restPose = await host.getAttribute("data-pose-snapshot");
	for (const preset of CAMERA_PRESETS) {
		await page.getByRole("button", { exact: true, name: preset }).click();
		await expect(host).toHaveAttribute(
			"data-camera-preset",
			preset.toLowerCase(),
		);
		await captureCanvas(
			page,
			canvas,
			testInfo.outputPath(`mannequin-rest-${preset.toLowerCase()}.png`),
		);
	}

	for (const state of ["Idle", "Walk"] as const) {
		await page.getByRole("button", { exact: true, name: state }).click();
		const poses: string[] = [];
		const pelvisPositions: string[] = [];
		for (const sample of state === "Idle"
			? [0.25, 0.75]
			: [0, 0.25, 0.5, 0.75]) {
			await page.getByLabel("Animation sample time").fill(String(sample));
			poses.push((await host.getAttribute("data-pose-snapshot")) ?? "");
			pelvisPositions.push(
				(await host.getAttribute("data-pelvis-horizontal")) ?? "",
			);
			await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
			await page
				.getByRole("button", { exact: true, name: "Three-quarter" })
				.click();
			await captureCanvas(
				page,
				canvas,
				testInfo.outputPath(
					`mannequin-${state.toLowerCase()}-${String(Math.round(sample * 100)).padStart(2, "0")}.png`,
				),
			);
		}
		expect(new Set(poses).size).toBeGreaterThan(1);
		expect(new Set(pelvisPositions).size).toBe(1);
	}

	await page.getByRole("button", { exact: true, name: "Rest" }).click();
	expect(await host.getAttribute("data-pose-snapshot")).toBe(restPose);
	const cameraBeforeOrbit = await host.getAttribute("data-camera-position");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("Procedural mannequin canvas is not measurable.");
	await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.55);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.65, {
		steps: 8,
	});
	await page.mouse.up();
	await expect(host).not.toHaveAttribute(
		"data-camera-position",
		cameraBeforeOrbit ?? "",
	);
	const cameraBeforeZoom = await host.getAttribute("data-camera-position");
	await canvas.hover({
		position: { x: box.width * 0.2, y: box.height * 0.55 },
	});
	await page.mouse.wheel(0, -500);
	await expect(host).not.toHaveAttribute(
		"data-camera-position",
		cameraBeforeZoom ?? "",
	);
	await page.getByRole("button", { exact: true, name: "Reset view" }).click();
	await expect(host).toHaveAttribute("data-camera-preset", "three-quarter");

	await page
		.getByLabel("Preview source")
		.selectOption("golden-reference-humanoid-v0");
	await expect(
		page.locator('[data-preview-source="golden-reference-humanoid-v0"]'),
	).toBeVisible();
	await expect(page.locator("canvas")).toHaveCount(1);
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await page.getByLabel("Preview source").selectOption(SOURCE_ID);
	await expect(host).toBeVisible();
	await expect(page.locator("canvas")).toHaveCount(1);
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	expect(consoleErrors).toEqual([]);
});

test("authors height through Blender and reloads only validated generated assets", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	const consoleErrors: string[] = [];
	page.on("console", (message) => {
		if (
			message.type() === "error" &&
			/asset|track|bind|skeleton|webgl|uncaught|compile/iu.test(message.text())
		) {
			consoleErrors.push(message.text());
		}
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));

	await page.goto("/");
	const height = page.getByRole("slider", { name: "Height" });
	const compile = page.getByRole("button", { exact: true, name: "Compile" });
	const compileStatus = page.locator("[data-compile-status]");
	const host = page.locator(`[data-preview-source="${SOURCE_ID}"]`);

	async function compileHeight(value: number) {
		await height.fill(String(value));
		await compile.click();
		await expect(compileStatus).toHaveAttribute(
			"data-compile-status",
			"compiling",
		);
		await expect(compileStatus).toHaveAttribute(
			"data-compile-status",
			"succeeded",
			{
				timeout: 90_000,
			},
		);
		await expect(page.locator(".preview-status")).toHaveAttribute(
			"data-status",
			"loaded",
			{ timeout: 60_000 },
		);
		await expect(host).toHaveAttribute("data-height-metres", String(value));
		await expect(host).toHaveAttribute("data-animation-state", "idle");
		await expect(page.locator("canvas")).toHaveCount(1);
		return {
			assetHash: (await host.getAttribute("data-asset-hash")) ?? "",
			boundsHeight: Number(await host.getAttribute("data-bounds-height")),
			recipeHash: (await host.getAttribute("data-recipe-hash")) ?? "",
			revision: (await host.getAttribute("data-preview-revision")) ?? "",
		};
	}

	const first = await compileHeight(1.68);
	expect(first.assetHash).toMatch(/^[0-9a-f]{64}$/u);
	expect(first.recipeHash).toMatch(/^[0-9a-f]{64}$/u);
	expect(first.boundsHeight).toBeCloseTo(1.68, 4);
	await page.screenshot({
		path: testInfo.outputPath("creator-height-1.68.png"),
	});

	const repeated = await compileHeight(1.68);
	expect(repeated.recipeHash).toBe(first.recipeHash);
	expect(repeated.assetHash).toBe(first.assetHash);
	expect(repeated.boundsHeight).toBe(first.boundsHeight);
	expect(repeated.revision).not.toBe(first.revision);

	const taller = await compileHeight(1.96);
	expect(taller.recipeHash).not.toBe(first.recipeHash);
	expect(taller.assetHash).not.toBe(first.assetHash);
	expect(taller.boundsHeight).toBeCloseTo(1.96, 4);
	expect(taller.boundsHeight).toBeGreaterThan(first.boundsHeight);
	await page.screenshot({
		path: testInfo.outputPath("creator-height-1.96.png"),
	});

	const creatorDiagnostics = page.getByLabel("Creator compilation diagnostics");
	await expect(creatorDiagnostics).toContainText(taller.recipeHash);
	await expect(creatorDiagnostics).toContainText(taller.assetHash);
	await expect(creatorDiagnostics).toContainText(
		"procedural-mannequin-blender-v0",
	);
	await expect(creatorDiagnostics).toContainText(
		"procedural-mannequin-roundtrip-v1",
	);

	await page.getByRole("button", { exact: true, name: "Pause" }).click();
	for (const state of ["Idle", "Walk"] as const) {
		await page.getByRole("button", { exact: true, name: state }).click();
		await page.getByLabel("Animation sample time").fill("0.25");
		const firstPose = await host.getAttribute("data-pose-snapshot");
		await page.getByLabel("Animation sample time").fill("0.75");
		const secondPose = await host.getAttribute("data-pose-snapshot");
		expect(secondPose).not.toBe(firstPose);
		await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
	}

	expect(consoleErrors).toEqual([]);
});
