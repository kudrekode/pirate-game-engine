import { expect, type Page, test } from "@playwright/test";
import type { ThreePerformanceSnapshot } from "../src/runtime/three/threePerformanceDiagnostics";

const ASSET_ID = "procedural-mannequin-quaternius-hair-v0";
const EDITOR_LABEL = "ThreeDPreview";
const RUNTIME_LABEL = "ThreeRuntimePanel";

function mannequinAssetSelect(page: Page) {
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

async function waitForMannequin(
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
			snapshot.asset.character.skinnedMeshCount >= 2 &&
			snapshot.asset.character.cloneTypes.includes("skeleton-utils") &&
			snapshot.asset.statusCounts.loading === 0 &&
			snapshot.asset.statusCounts.error === 0 &&
			metrics?.boneCount === 65 &&
			metrics.triangleCount === 6346 &&
			metrics.vertexCount === 3226 &&
			metrics.skinnedMeshCount === 2 &&
			metrics.materialCount === 2 &&
			metrics.textureCount === 2 &&
			(label !== RUNTIME_LABEL ||
				(snapshot.asset.character.animation.loadingSourceCount === 0 &&
					snapshot.asset.character.animation.missingClipCount === 0 &&
					snapshot.asset.character.animation.incompatibleClipCount === 0 &&
					snapshot.asset.character.animation.activeLoopingActions >= 2 &&
					snapshot.asset.character.animation.sourceAssetIds.includes(
						"golden-reference-quaternius-idle-baked-v1",
					) &&
					snapshot.asset.character.animation.sourceAssetIds.includes(
						"golden-reference-quaternius-walk-baked-v1",
					)))
		) {
			return snapshot;
		}
		await page.waitForTimeout(250);
	}
	throw new Error(
		`Procedural Mannequin did not settle in ${label}: ${JSON.stringify(snapshot)}`,
	);
}

test("loads the Quaternius-haired Procedural Mannequin for a player and NPC through shared Three presentation", async ({
	context,
	page,
}, testInfo) => {
	test.setTimeout(120_000);
	await context.addInitScript(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page.getByRole("button", { name: /Demo Project/u }).click();

	await page.getByRole("button", { exact: true, name: "Character" }).click();
	await mannequinAssetSelect(page).selectOption(ASSET_ID);
	await expect(mannequinAssetSelect(page)).toHaveValue(ASSET_ID);

	await page.getByRole("button", { exact: true, name: "NPCs" }).click();
	await page.getByRole("button", { exact: true, name: "Captain Mira" }).click();
	await mannequinAssetSelect(page).selectOption(ASSET_ID);
	await expect(mannequinAssetSelect(page)).toHaveValue(ASSET_ID);

	await page.getByRole("button", { exact: true, name: "Map" }).click();
	const areaSelector = page.getByRole("combobox", { name: "Editing" });
	await areaSelector.selectOption("area_main");
	await page.getByRole("button", { exact: true, name: "3D View" }).click();
	await page.getByRole("button", { exact: true, name: "Perf" }).click();
	const editorSnapshot = await waitForMannequin(page, EDITOR_LABEL);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("procedural-mannequin-editor.png"),
	});

	await page.getByRole("button", { exact: true, name: "Play" }).click();
	await page.getByRole("button", { name: "Play 3D Experimental" }).click();
	const continueButton = page.getByRole("button", { name: "Continue" });
	if (await continueButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await continueButton.click();
	}
	await page.getByRole("button", { exact: true, name: "Perf" }).click();
	const runtimeSnapshot = await waitForMannequin(page, RUNTIME_LABEL);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("procedural-mannequin-runtime.png"),
	});

	expect(editorSnapshot.asset.loadFailureCount).toBe(0);
	expect(runtimeSnapshot.asset.loadFailureCount).toBe(0);
	expect(runtimeSnapshot.asset.character.animation).toMatchObject({
		activeLoopingActions: 2,
		incompatibleClipCount: 0,
		loadingSourceCount: 0,
		missingClipCount: 0,
		playerState: "idle",
	});
});
