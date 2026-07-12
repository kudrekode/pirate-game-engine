import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { ThreePerformanceSnapshot } from "../src/runtime/three/threePerformanceDiagnostics";

type ConsoleEntry = {
	location: ReturnType<import("@playwright/test").ConsoleMessage["location"]>;
	text: string;
	type: string;
};

type PageErrorEntry = {
	message: string;
	stack?: string;
};

type NetworkFailureEntry = {
	errorText?: string;
	method: string;
	resourceType: string;
	status?: number;
	url: string;
};

const ARTIFACT_DIR = path.resolve(process.cwd(), "test-results", "perf");
const EDITOR_SNAPSHOT_LABEL = "ThreeDPreview";
const RUNTIME_SNAPSHOT_LABEL = "ThreeRuntimePanel";
const PIRATE_PROJECT_NAME = "Demo Adventure";
const PIRATE_AREA_ID = "area_main";
const PIRATE_AREA_NAME = "Main Area";
const EXPECTED_PIRATE_ASSET_IDS = ["pirate-chest", "pirate-small-ship"];
const EXPECTED_CHARACTER_ASSET_ID = "pirate-character-walk";
const EXPECTED_CHARACTER_CLONE_COUNT = 3;
const EXPECTED_CHARACTER_CLIP_NAME = "Armature|walking_man|baselayer";
const EDITOR_MIN_PIRATE_ENTITY_COUNT = 13;
const RUNTIME_MIN_PIRATE_ENTITY_COUNT = 16;

async function resetArtifactDir(): Promise<void> {
	const workspaceRoot = path.resolve(process.cwd());
	if (
		ARTIFACT_DIR !== workspaceRoot &&
		!ARTIFACT_DIR.startsWith(`${workspaceRoot}${path.sep}`)
	) {
		throw new Error(
			`Refusing to clear artifact path outside workspace: ${ARTIFACT_DIR}`,
		);
	}

	await fs.rm(ARTIFACT_DIR, { force: true, recursive: true });
	await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

async function writeJson(fileName: string, data: unknown): Promise<string> {
	const filePath = path.join(ARTIFACT_DIR, fileName);
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
	return filePath;
}

async function readSnapshot(
	page: Page,
	label: string,
): Promise<ThreePerformanceSnapshot | null> {
	return page.evaluate((snapshotLabel) => {
		const diagnostics = (
			window as Window & {
				__THREE_PERF_DIAGNOSTICS__?: {
					getSnapshot: (label?: string) => unknown;
				};
			}
		).__THREE_PERF_DIAGNOSTICS__;
		return diagnostics?.getSnapshot(snapshotLabel) ?? null;
	}, label) as Promise<ThreePerformanceSnapshot | null>;
}

async function resetSampleWindow(page: Page, label: string): Promise<void> {
	const didReset = await page.evaluate((snapshotLabel) => {
		const diagnostics = (
			window as Window & {
				__THREE_PERF_DIAGNOSTICS__?: {
					resetSampleWindow: (label?: string) => boolean;
				};
			}
		).__THREE_PERF_DIAGNOSTICS__;
		return diagnostics?.resetSampleWindow(snapshotLabel) ?? false;
	}, label);
	if (!didReset) {
		throw new Error(
			`Could not reset Three diagnostics sample window for ${label}`,
		);
	}
}

function meetsPirateBenchmarkRequirements(
	snapshot: ThreePerformanceSnapshot | null,
	minEntityCount: number,
): boolean {
	if (!snapshot) {
		return false;
	}
	return (
		snapshot.label.length > 0 &&
		snapshot.scene.projectName === PIRATE_PROJECT_NAME &&
		snapshot.scene.areaId === PIRATE_AREA_ID &&
		snapshot.scene.areaName === PIRATE_AREA_NAME &&
		snapshot.scene.entityCount >= minEntityCount &&
		snapshot.frame.frameCount > 0 &&
		snapshot.asset.activeImportedAssetInstances >=
			EXPECTED_PIRATE_ASSET_IDS.length &&
		snapshot.asset.activeCloneInstances >= EXPECTED_PIRATE_ASSET_IDS.length &&
		snapshot.asset.statusCounts.loaded >= EXPECTED_PIRATE_ASSET_IDS.length &&
		snapshot.asset.statusCounts.loading === 0 &&
		snapshot.asset.stuckLoadingCount === 0 &&
		EXPECTED_PIRATE_ASSET_IDS.every((assetId) =>
			snapshot.asset.activeImportedAssetIds.includes(assetId),
		) &&
		snapshot.asset.character.activeAssetIds.includes(
			EXPECTED_CHARACTER_ASSET_ID,
		) &&
		snapshot.asset.character.activeCloneInstances >=
			EXPECTED_CHARACTER_CLONE_COUNT &&
		snapshot.asset.character.skinnedMeshCount >=
			EXPECTED_CHARACTER_CLONE_COUNT &&
		snapshot.asset.character.cloneTypes.includes("skeleton-utils") &&
		snapshot.asset.character.animationClips.some(
			(clip) =>
				clip.definitionId === EXPECTED_CHARACTER_ASSET_ID &&
				clip.name === EXPECTED_CHARACTER_CLIP_NAME,
		) &&
		snapshot.asset.character.assetMetrics.some(
			(metrics) =>
				metrics.definitionId === EXPECTED_CHARACTER_ASSET_ID &&
				metrics.skinnedMeshCount >= 1 &&
				metrics.triangleCount > 0 &&
				metrics.vertexCount > 0 &&
				metrics.boneCount > 0 &&
				metrics.materialTypes.includes("MeshStandardMaterial"),
		)
	);
}

function describePirateBenchmarkSnapshot(
	snapshot: ThreePerformanceSnapshot | null,
): string {
	if (!snapshot) {
		return "snapshot missing";
	}
	return JSON.stringify({
		activeCloneInstances: snapshot.asset.activeCloneInstances,
		activeImportedAssetIds: snapshot.asset.activeImportedAssetIds,
		activeImportedAssetInstances: snapshot.asset.activeImportedAssetInstances,
		character: snapshot.asset.character,
		areaId: snapshot.scene.areaId,
		areaName: snapshot.scene.areaName,
		entityCount: snapshot.scene.entityCount,
		frameCount: snapshot.frame.frameCount,
		label: snapshot.label,
		projectName: snapshot.scene.projectName,
		statusCounts: snapshot.asset.statusCounts,
		stuckLoadingCount: snapshot.asset.stuckLoadingCount,
	});
}

async function waitForPirateBenchmarkSnapshot(
	page: Page,
	label: string,
	minEntityCount: number,
): Promise<ThreePerformanceSnapshot> {
	const startedAt = Date.now();
	let snapshot: ThreePerformanceSnapshot | null = null;
	while (Date.now() - startedAt < 30_000) {
		snapshot = await readSnapshot(page, label);
		if (meetsPirateBenchmarkRequirements(snapshot, minEntityCount)) {
			return snapshot;
		}
		await page.waitForTimeout(250);
	}
	throw new Error(
		`Three benchmark scene did not settle for ${label}. Last snapshot: ${describePirateBenchmarkSnapshot(
			snapshot,
		)}`,
	);
}

async function waitForTerrainModeSnapshot(
	page: Page,
	label: string,
	minEntityCount: number,
	mode: "blocky" | "smooth",
): Promise<ThreePerformanceSnapshot> {
	const startedAt = Date.now();
	let snapshot: ThreePerformanceSnapshot | null = null;
	while (Date.now() - startedAt < 30_000) {
		snapshot = await readSnapshot(page, label);
		if (
			meetsPirateBenchmarkRequirements(snapshot, minEntityCount) &&
			snapshot.terrain.mode === mode
		) {
			return snapshot;
		}
		await page.waitForTimeout(250);
	}
	throw new Error(
		`Three benchmark scene did not switch ${label} to ${mode}. Last snapshot: ${describePirateBenchmarkSnapshot(
			snapshot,
		)}`,
	);
}

async function selectTerrainMode(
	page: Page,
	mode: "Blocky terrain" | "Smooth terrain",
): Promise<void> {
	await page
		.getByRole("button", { exact: true, name: mode })
		.dispatchEvent("click");
}

function isLocalAssetUrl(url: string): boolean {
	return (
		url.includes("/assets/") ||
		url.startsWith("http://127.0.0.1:5173/") ||
		url.startsWith("http://localhost:5173/")
	);
}

function validateSnapshot(
	snapshot: ThreePerformanceSnapshot | null,
	label: string,
	failures: string[],
): void {
	if (!snapshot) {
		failures.push(`${label} snapshot was missing.`);
		return;
	}
	if (snapshot.frame.frameCount <= 0) {
		failures.push(`${label} did not record any frames.`);
	}
	if (snapshot.frame.fps <= 0) {
		failures.push(`${label} reported 0 FPS.`);
	}
	if (typeof snapshot.renderer.drawCalls !== "number") {
		failures.push(`${label} renderer draw calls were unavailable.`);
	}
}

function validatePirateBenchmarkSnapshot(
	snapshot: ThreePerformanceSnapshot | null,
	label: string,
	minEntityCount: number,
	failures: string[],
): void {
	if (!snapshot) {
		failures.push(`${label} pirate benchmark snapshot was missing.`);
		return;
	}
	if (snapshot.label !== label) {
		failures.push(`${label} snapshot label was ${snapshot.label}.`);
	}
	if (snapshot.scene.projectName !== PIRATE_PROJECT_NAME) {
		failures.push(`${label} measured project ${snapshot.scene.projectName}.`);
	}
	if (snapshot.scene.areaId !== PIRATE_AREA_ID) {
		failures.push(`${label} measured area ${snapshot.scene.areaId}.`);
	}
	if (snapshot.scene.areaName !== PIRATE_AREA_NAME) {
		failures.push(`${label} measured area name ${snapshot.scene.areaName}.`);
	}
	if (snapshot.scene.entityCount < minEntityCount) {
		failures.push(
			`${label} measured ${snapshot.scene.entityCount} entities, expected at least ${minEntityCount}.`,
		);
	}
	for (const assetId of EXPECTED_PIRATE_ASSET_IDS) {
		if (!snapshot.asset.activeImportedAssetIds.includes(assetId)) {
			failures.push(`${label} missing active imported asset ${assetId}.`);
		}
	}
	if (
		!snapshot.asset.character.activeAssetIds.includes(
			EXPECTED_CHARACTER_ASSET_ID,
		)
	) {
		failures.push(`${label} missing active character asset.`);
	}
	if (
		snapshot.asset.character.activeCloneInstances <
		EXPECTED_CHARACTER_CLONE_COUNT
	) {
		failures.push(`${label} character clone count below benchmark minimum.`);
	}
	if (
		snapshot.asset.character.skinnedMeshCount < EXPECTED_CHARACTER_CLONE_COUNT
	) {
		failures.push(
			`${label} character skinned mesh count below benchmark minimum.`,
		);
	}
	if (!snapshot.asset.character.cloneTypes.includes("skeleton-utils")) {
		failures.push(`${label} did not use SkeletonUtils character clones.`);
	}
	if (
		!snapshot.asset.character.animationClips.some(
			(clip) =>
				clip.definitionId === EXPECTED_CHARACTER_ASSET_ID &&
				clip.name === EXPECTED_CHARACTER_CLIP_NAME,
		)
	) {
		failures.push(`${label} did not discover the walking character clip.`);
	}
	if (
		!snapshot.asset.character.assetMetrics.some(
			(metrics) =>
				metrics.definitionId === EXPECTED_CHARACTER_ASSET_ID &&
				metrics.skinnedMeshCount >= 1 &&
				metrics.triangleCount > 0 &&
				metrics.vertexCount > 0 &&
				metrics.boneCount > 0 &&
				metrics.materialTypes.includes("MeshStandardMaterial"),
		)
	) {
		failures.push(`${label} did not report prepared character asset metrics.`);
	}
	if (
		snapshot.asset.activeImportedAssetInstances <
		EXPECTED_PIRATE_ASSET_IDS.length
	) {
		failures.push(`${label} imported asset instances below benchmark minimum.`);
	}
	if (snapshot.asset.activeCloneInstances < EXPECTED_PIRATE_ASSET_IDS.length) {
		failures.push(`${label} active asset clones below benchmark minimum.`);
	}
	if (snapshot.asset.statusCounts.loaded < EXPECTED_PIRATE_ASSET_IDS.length) {
		failures.push(`${label} loaded asset count below benchmark minimum.`);
	}
	if (snapshot.asset.statusCounts.loading !== 0) {
		failures.push(`${label} still has loading assets.`);
	}
	if (snapshot.asset.stuckLoadingCount !== 0) {
		failures.push(`${label} has stuck loading assets.`);
	}
	if (snapshot.renderer.drawCalls <= 0 || snapshot.renderer.triangles <= 0) {
		failures.push(`${label} renderer metrics were not populated.`);
	}
	if (snapshot.terrain.waterMeshCount <= 0) {
		failures.push(`${label} did not report any water presentation meshes.`);
	}
	if (snapshot.terrain.coastlineEdgeCount <= 0) {
		failures.push(`${label} did not report any coastline edges.`);
	}
}

test("captures Three editor and runtime perf diagnostics", async ({
	context,
	page,
}) => {
	await resetArtifactDir();
	await context.addInitScript(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	const consoleEntries: ConsoleEntry[] = [];
	const pageErrors: PageErrorEntry[] = [];
	const networkFailures: NetworkFailureEntry[] = [];
	const failures: string[] = [];
	const artifacts: Record<string, string> = {};
	let editorSnapshot: ThreePerformanceSnapshot | null = null;
	let runtimeCollapsedSnapshot: ThreePerformanceSnapshot | null = null;
	let runtimeSnapshot: ThreePerformanceSnapshot | null = null;
	let runtimeAfterMoveSnapshot: ThreePerformanceSnapshot | null = null;
	let fatalError: unknown;

	page.on("console", (message) => {
		if (message.type() !== "error" && message.type() !== "warning") {
			return;
		}
		consoleEntries.push({
			location: message.location(),
			text: message.text(),
			type: message.type(),
		});
	});
	page.on("pageerror", (error) => {
		pageErrors.push({ message: error.message, stack: error.stack });
	});
	page.on("requestfailed", (request) => {
		networkFailures.push({
			errorText: request.failure()?.errorText,
			method: request.method(),
			resourceType: request.resourceType(),
			url: request.url(),
		});
	});
	page.on("response", (response) => {
		if (!response.ok() && isLocalAssetUrl(response.url())) {
			networkFailures.push({
				method: response.request().method(),
				resourceType: response.request().resourceType(),
				status: response.status(),
				url: response.url(),
			});
		}
	});

	try {
		const mainResponse = await page.goto("/", {
			waitUntil: "domcontentloaded",
		});
		if (!mainResponse?.ok()) {
			failures.push(
				`Main app load failed with status ${mainResponse?.status() ?? "none"}.`,
			);
		}

		await expect(page.getByLabel("Choose a starter project")).toBeVisible();
		await page.getByRole("button", { name: /Demo Project/ }).click();
		await expect(page.getByLabel("Project")).toHaveValue("Demo Adventure");
		const areaSelector = page.getByRole("combobox", { name: "Editing" });
		await areaSelector.selectOption(PIRATE_AREA_ID);
		await expect(areaSelector).toHaveValue(PIRATE_AREA_ID);

		await page.getByRole("button", { name: "3D View" }).click();
		const editorCanvas = page
			.getByLabel("3D preview viewport")
			.locator("canvas")
			.first();
		await expect(editorCanvas).toBeVisible();
		await page.getByRole("button", { name: "Perf" }).click();
		await expect(page.getByLabel("3D Preview Perf diagnostics")).toBeVisible();
		await waitForPirateBenchmarkSnapshot(
			page,
			EDITOR_SNAPSHOT_LABEL,
			EDITOR_MIN_PIRATE_ENTITY_COUNT,
		);
		await selectTerrainMode(page, "Smooth terrain");
		await waitForTerrainModeSnapshot(
			page,
			EDITOR_SNAPSHOT_LABEL,
			EDITOR_MIN_PIRATE_ENTITY_COUNT,
			"smooth",
		);
		await resetSampleWindow(page, EDITOR_SNAPSHOT_LABEL);
		await page.waitForTimeout(1000);
		await page.waitForTimeout(3000);
		editorSnapshot = await readSnapshot(page, EDITOR_SNAPSHOT_LABEL);
		artifacts.editorSnapshot = await writeJson(
			"three-editor-snapshot.json",
			editorSnapshot,
		);
		artifacts.editorScreenshot = path.join(ARTIFACT_DIR, "three-editor.png");
		await page.screenshot({ fullPage: true, path: artifacts.editorScreenshot });

		await page.getByRole("button", { exact: true, name: "Play" }).click();
		await page.getByRole("button", { name: "Play 3D Experimental" }).click();
		const runtimeCanvas = page
			.locator('canvas[aria-label="Three runtime viewport"]')
			.first();
		await expect(runtimeCanvas).toBeVisible();
		const continueButton = page.getByRole("button", { name: "Continue" });
		if (await continueButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await continueButton.click();
		}
		await waitForPirateBenchmarkSnapshot(
			page,
			RUNTIME_SNAPSHOT_LABEL,
			RUNTIME_MIN_PIRATE_ENTITY_COUNT,
		);
		await selectTerrainMode(page, "Smooth terrain");
		await waitForTerrainModeSnapshot(
			page,
			RUNTIME_SNAPSHOT_LABEL,
			RUNTIME_MIN_PIRATE_ENTITY_COUNT,
			"smooth",
		);
		await resetSampleWindow(page, RUNTIME_SNAPSHOT_LABEL);
		await page.waitForTimeout(1000);
		await page.waitForTimeout(5000);
		runtimeCollapsedSnapshot = await readSnapshot(page, RUNTIME_SNAPSHOT_LABEL);
		artifacts.runtimeCollapsedSnapshot = await writeJson(
			"three-runtime-collapsed-snapshot.json",
			runtimeCollapsedSnapshot,
		);
		await page.getByRole("button", { name: "Perf" }).click();
		await expect(page.getByLabel("3D Runtime Perf diagnostics")).toBeVisible();
		await resetSampleWindow(page, RUNTIME_SNAPSHOT_LABEL);
		await page.waitForTimeout(1000);
		await page.waitForTimeout(5000);
		runtimeSnapshot = await readSnapshot(page, RUNTIME_SNAPSHOT_LABEL);
		artifacts.runtimeSnapshot = await writeJson(
			"three-runtime-snapshot.json",
			runtimeSnapshot,
		);
		await resetSampleWindow(page, RUNTIME_SNAPSHOT_LABEL);
		await runtimeCanvas.focus();
		await page.keyboard.press("ArrowUp");
		await page.waitForTimeout(250);
		await page.keyboard.press("ArrowLeft");
		await page.waitForTimeout(4000);
		runtimeAfterMoveSnapshot = await readSnapshot(page, RUNTIME_SNAPSHOT_LABEL);
		artifacts.runtimeAfterMoveSnapshot = await writeJson(
			"three-runtime-after-move-snapshot.json",
			runtimeAfterMoveSnapshot,
		);
		artifacts.runtimeScreenshot = path.join(ARTIFACT_DIR, "three-runtime.png");
		await page.screenshot({
			fullPage: true,
			path: artifacts.runtimeScreenshot,
		});
	} catch (error) {
		fatalError = error;
	} finally {
		validateSnapshot(editorSnapshot, EDITOR_SNAPSHOT_LABEL, failures);
		validateSnapshot(
			runtimeCollapsedSnapshot,
			RUNTIME_SNAPSHOT_LABEL,
			failures,
		);
		validateSnapshot(runtimeSnapshot, RUNTIME_SNAPSHOT_LABEL, failures);
		validatePirateBenchmarkSnapshot(
			editorSnapshot,
			EDITOR_SNAPSHOT_LABEL,
			EDITOR_MIN_PIRATE_ENTITY_COUNT,
			failures,
		);
		validatePirateBenchmarkSnapshot(
			runtimeCollapsedSnapshot,
			RUNTIME_SNAPSHOT_LABEL,
			RUNTIME_MIN_PIRATE_ENTITY_COUNT,
			failures,
		);
		validatePirateBenchmarkSnapshot(
			runtimeSnapshot,
			RUNTIME_SNAPSHOT_LABEL,
			RUNTIME_MIN_PIRATE_ENTITY_COUNT,
			failures,
		);
		validatePirateBenchmarkSnapshot(
			runtimeAfterMoveSnapshot,
			RUNTIME_SNAPSHOT_LABEL,
			RUNTIME_MIN_PIRATE_ENTITY_COUNT,
			failures,
		);
		if (pageErrors.length > 0) {
			failures.push(`${pageErrors.length} uncaught page error(s) occurred.`);
		}

		artifacts.console = await writeJson("console.json", {
			errors: consoleEntries.filter((entry) => entry.type === "error"),
			warnings: consoleEntries.filter((entry) => entry.type === "warning"),
		});
		artifacts.networkFailures = await writeJson(
			"network-failures.json",
			networkFailures,
		);
		artifacts.summary = await writeJson("summary.json", {
			artifacts,
			consoleErrorCount: consoleEntries.filter(
				(entry) => entry.type === "error",
			).length,
			consoleWarningCount: consoleEntries.filter(
				(entry) => entry.type === "warning",
			).length,
			failures,
			fatalError:
				fatalError instanceof Error
					? { message: fatalError.message, stack: fatalError.stack }
					: fatalError,
			networkFailureCount: networkFailures.length,
			pageErrors,
			snapshots: {
				editor: editorSnapshot,
				runtimeCollapsed: runtimeCollapsedSnapshot,
				runtime: runtimeSnapshot,
				runtimeAfterMove: runtimeAfterMoveSnapshot,
			},
		});
	}

	if (fatalError) {
		throw fatalError;
	}
	expect(failures).toEqual([]);
});
