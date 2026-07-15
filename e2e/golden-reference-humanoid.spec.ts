import { expect, type Page, test } from "@playwright/test";
import type { ThreePerformanceSnapshot } from "../src/runtime/three/threePerformanceDiagnostics";

const ASSET_ID = "golden-reference-quaternius-superhero-male";
const EDITOR_LABEL = "ThreeDPreview";
const RUNTIME_LABEL = "ThreeRuntimePanel";

function goldenReferenceAssetSelect(page: Page) {
	return page.locator(`select:has(option[value="${ASSET_ID}"])`);
}

async function readSnapshot(
	page: Page,
	label: string,
): Promise<ThreePerformanceSnapshot | null> {
	return page.evaluate((snapshotLabel) => {
		const diagnostics = (
			window as Window & {
				__THREE_PERF_DIAGNOSTICS__?: {
					getSnapshot: (requestedLabel?: string) => unknown;
				};
			}
		).__THREE_PERF_DIAGNOSTICS__;
		return diagnostics?.getSnapshot(snapshotLabel) ?? null;
	}, label) as Promise<ThreePerformanceSnapshot | null>;
}

async function waitForGoldenReference(
	page: Page,
	label: string,
): Promise<ThreePerformanceSnapshot> {
	const startedAt = Date.now();
	let snapshot: ThreePerformanceSnapshot | null = null;
	while (Date.now() - startedAt < 30_000) {
		snapshot = await readSnapshot(page, label);
		const metrics = snapshot?.asset.character.assetMetrics.find(
			(candidate) => candidate.definitionId === ASSET_ID,
		);
		if (
			snapshot?.asset.character.activeAssetIds.includes(ASSET_ID) &&
			snapshot.asset.character.activeCloneInstances >= 2 &&
			snapshot.asset.character.skinnedMeshCount >= 6 &&
			snapshot.asset.character.cloneTypes.includes("skeleton-utils") &&
			snapshot.asset.statusCounts.loading === 0 &&
			snapshot.asset.statusCounts.error === 0 &&
			metrics?.boneCount === 65 &&
			metrics.triangleCount === 14318 &&
			metrics.vertexCount === 8483 &&
			metrics.skinnedMeshCount === 3 &&
			metrics.materialCount === 3 &&
			metrics.textureCount === 7 &&
			!snapshot.asset.character.animationClips.some(
				(clip) => clip.definitionId === ASSET_ID,
			)
		) {
			return snapshot;
		}
		await page.waitForTimeout(250);
	}
	throw new Error(
		`Golden Reference Humanoid did not settle in ${label}: ${JSON.stringify(snapshot)}`,
	);
}

test("loads the Golden Reference Humanoid for a player and NPC through shared Three presentation", async ({
	context,
	page,
}, testInfo) => {
	await context.addInitScript(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page.getByRole("button", { name: /Demo Project/ }).click();

	await page.getByRole("button", { exact: true, name: "Character" }).click();
	await goldenReferenceAssetSelect(page).selectOption(ASSET_ID);
	await expect(goldenReferenceAssetSelect(page)).toHaveValue(ASSET_ID);

	await page.getByRole("button", { exact: true, name: "NPCs" }).click();
	await page.getByRole("button", { exact: true, name: "Captain Mira" }).click();
	await goldenReferenceAssetSelect(page).selectOption(ASSET_ID);
	await expect(goldenReferenceAssetSelect(page)).toHaveValue(ASSET_ID);

	await page.getByRole("button", { exact: true, name: "Map" }).click();
	const areaSelector = page.getByRole("combobox", { name: "Editing" });
	await areaSelector.selectOption("area_main");
	await expect(areaSelector).toHaveValue("area_main");
	await page.getByRole("button", { exact: true, name: "3D View" }).click();
	await expect(
		page.getByLabel("3D preview viewport").locator("canvas").first(),
	).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Perf" }).click();
	await expect(page.getByLabel("3D Preview Perf diagnostics")).toBeVisible();
	const editorSnapshot = await waitForGoldenReference(page, EDITOR_LABEL);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("golden-reference-editor.png"),
	});

	await page.getByRole("button", { exact: true, name: "Play" }).click();
	await page.getByRole("button", { name: "Play 3D Experimental" }).click();
	await expect(
		page.locator('canvas[aria-label="Three runtime viewport"]').first(),
	).toBeVisible();
	const continueButton = page.getByRole("button", { name: "Continue" });
	if (await continueButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await continueButton.click();
	}
	await page.getByRole("button", { exact: true, name: "Perf" }).click();
	await expect(page.getByLabel("3D Runtime Perf diagnostics")).toBeVisible();
	const runtimeSnapshot = await waitForGoldenReference(page, RUNTIME_LABEL);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("golden-reference-runtime.png"),
	});

	expect(editorSnapshot.asset.loadFailureCount).toBe(0);
	expect(runtimeSnapshot.asset.loadFailureCount).toBe(0);
	expect(editorSnapshot.asset.character.animationClips).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({ definitionId: ASSET_ID }),
		]),
	);
	expect(runtimeSnapshot.asset.character.animationClips).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({ definitionId: ASSET_ID }),
		]),
	);
});
