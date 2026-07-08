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

async function waitForSnapshot(
	page: Page,
	label: string,
): Promise<ThreePerformanceSnapshot> {
	await page.waitForFunction(
		(snapshotLabel) => {
			const diagnostics = (
				window as Window & {
					__THREE_PERF_DIAGNOSTICS__?: {
						getSnapshot: (label?: string) => {
							frame?: { frameCount?: number };
						} | null;
					};
				}
			).__THREE_PERF_DIAGNOSTICS__;
			const snapshot = diagnostics?.getSnapshot(snapshotLabel);
			return Boolean(snapshot && (snapshot.frame?.frameCount ?? 0) > 0);
		},
		label,
		{ timeout: 15_000 },
	);

	const snapshot = await readSnapshot(page, label);
	if (!snapshot) {
		throw new Error(`Missing Three performance snapshot for ${label}`);
	}
	return snapshot;
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

		await page.getByRole("button", { name: "3D View" }).click();
		const editorCanvas = page
			.getByLabel("3D preview viewport")
			.locator("canvas")
			.first();
		await expect(editorCanvas).toBeVisible();
		await page.getByRole("button", { name: "Perf" }).click();
		await expect(page.getByLabel("3D Preview Perf diagnostics")).toBeVisible();
		await page.waitForTimeout(3500);
		editorSnapshot = await waitForSnapshot(page, EDITOR_SNAPSHOT_LABEL);
		artifacts.editorSnapshot = await writeJson(
			"three-editor-snapshot.json",
			editorSnapshot,
		);
		await editorCanvas.hover();
		await page.mouse.wheel(0, 160);
		await page.waitForTimeout(250);
		artifacts.editorScreenshot = path.join(ARTIFACT_DIR, "three-editor.png");
		await page.screenshot({ fullPage: true, path: artifacts.editorScreenshot });

		await page.getByRole("button", { exact: true, name: "Play" }).click();
		await page.getByRole("button", { name: "Play 3D Experimental" }).click();
		const runtimeCanvas = page
			.locator('canvas[aria-label="Three runtime viewport"]')
			.first();
		await expect(runtimeCanvas).toBeVisible();
		await page.getByRole("button", { name: "Perf" }).click();
		await expect(page.getByLabel("3D Runtime Perf diagnostics")).toBeVisible();
		await page.waitForTimeout(4000);
		runtimeSnapshot = await waitForSnapshot(page, RUNTIME_SNAPSHOT_LABEL);
		artifacts.runtimeSnapshot = await writeJson(
			"three-runtime-snapshot.json",
			runtimeSnapshot,
		);
		await runtimeCanvas.focus();
		await page.keyboard.press("ArrowUp");
		await page.waitForTimeout(250);
		await page.keyboard.press("ArrowLeft");
		await page.waitForTimeout(750);
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
		validateSnapshot(runtimeSnapshot, RUNTIME_SNAPSHOT_LABEL, failures);
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
