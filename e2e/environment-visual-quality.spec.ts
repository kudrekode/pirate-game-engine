import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", viewport: { width: 1600, height: 1000 } });

test("Tidewatch environment comparison and persistence @environment-visual", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	const phase = process.env.VISUAL_PHASE ?? "after";
	const output = `docs/assets/environment-visual/${phase}`;
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [];
	const failedAssets: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("response", (response) => {
		if (response.url().includes("/assets/") && response.status() >= 400)
			failedAssets.push(response.url());
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("docs/assets/world-kit/tidewatch-harbour.project.json");
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	const editorCanvas = page
		.getByRole("img", { name: "3D preview viewport", exact: true })
		.locator("canvas");
	const snapshot = (name: string) =>
		page.evaluate(
			(label) => window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(label),
			name,
		);
	async function settle(name: string) {
		await expect
			.poll(
				async () => (await snapshot(name))?.asset.activeImportedAssetInstances,
				{ timeout: 45_000 },
			)
			.toBe(32);
		const start = (await snapshot(name))?.frame.frameCount ?? 0;
		await expect
			.poll(async () => (await snapshot(name))?.frame.frameCount ?? 0, {
				timeout: 45_000,
			})
			.toBeGreaterThan(start + 20);
		const result = await snapshot(name);
		expect(result?.asset.loadFailureCount).toBe(0);
		expect(result?.asset.errorFallbackCount).toBe(0);
		return result;
	}
	await expect(editorCanvas).toBeVisible();
	const editor = await settle("ThreeDPreview");
	await editorCanvas.screenshot({ path: `${output}/editor.png` });
	if (phase === "after") {
		await page.getByRole("button", { name: "Low angle", exact: true }).click();
		await editorCanvas.screenshot({ path: `${output}/coastal-sky.png` });
		await page
			.getByRole("button", { name: "Reset camera", exact: true })
			.click();
	}
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saved = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const runtime = page.getByLabel("Three runtime viewport", { exact: true });
	await expect(runtime).toBeVisible();
	const play = await settle("ThreeRuntimePanel");
	expect(play?.asset.character.animation.activeMixers).toBe(2);
	if (phase === "after") expect(play?.scene.entityCount).toBe(32);
	await runtime.screenshot({ path: `${output}/play.png` });
	await runtime.focus();
	await page.keyboard.press("ArrowDown");
	await expect(page.getByText("Pos: 9, 9", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await page.reload();
	const recovery = page.getByRole("button", {
		name: "Use saved project",
		exact: true,
	});
	await expect(
		recovery.or(page.getByRole("button", { name: "Play", exact: true })),
	).toBeVisible();
	if (await recovery.isVisible()) await recovery.click();
	await expect(editorCanvas).toBeVisible();
	await settle("ThreeDPreview");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(saved);
	await fs.writeFile(
		`${output}/observations.json`,
		JSON.stringify(
			{ editor, play, errors, failedAssets, projectUnchanged: true },
			null,
			2,
		),
	);
	expect(failedAssets).toEqual([]);
	expect(errors).toEqual([]);
	await testInfo.attach("environment-observations", {
		path: `${output}/observations.json`,
		contentType: "application/json",
	});
});
