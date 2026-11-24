import assert from "node:assert/strict";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

// Build with Vite's test mode to expose the read-only Three diagnostics.
// HOLLOW_OFFLINE_ROUTE=1 fulfils requests from the same build and public roots
// when the browser cannot connect to localhost. Use the same mode in both runs.
const [, , buildArgument, outputArgument, ...options] = process.argv;
const cameraOnly = options.includes("--camera");
const lifecycleOnly = options.includes("--lifecycle");
const selected = options.filter((option) => !option.startsWith("--"));
if (!buildArgument || !outputArgument) {
	throw new Error(
		"Usage: node e2e/hollow-runtime-baseline.mjs <Vite test-mode build> <output folder> [--camera | --lifecycle] [merewatch] [chapter-one]",
	);
}

const editorLabel = "ThreeDPreview";
const runtimeLabel = "ThreeRuntimePanel";
const timeout = 45_000;
const chromePath = process.env.HOLLOW_CHROME_PATH;
const angle = process.env.HOLLOW_ANGLE;
const chromiumArgs = angle
	? [`--use-angle=${angle}`, "--ignore-gpu-blocklist"]
	: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const viewport = { width: 960, height: 600 };
const roots = [resolve(buildArgument), resolve("public")];
const output = resolve(outputArgument);
const offline = process.env.HOLLOW_OFFLINE_ROUTE === "1";
const contentTypes = {
	".css": "text/css",
	".html": "text/html",
	".js": "text/javascript",
	".json": "application/json",
	".jpg": "image/jpeg",
	".png": "image/png",
	".glb": "model/gltf-binary",
	".wav": "audio/wav",
	".woff2": "font/woff2",
};

function findAsset(address) {
	const url = new URL(address, "http://127.0.0.1");
	const name = decodeURIComponent(url.pathname.slice(1)) || "index.html";
	return roots
		.map((root) => ({ root, path: resolve(root, name) }))
		.find(({ root, path }) => path.startsWith(root + sep) && existsSync(path));
}

function contentType(file) {
	return contentTypes[extname(file)] ?? "application/octet-stream";
}

function server() {
	return createServer(async (request, response) => {
		try {
			const file = findAsset(request.url);
			if (!file) {
				response.writeHead(404).end();
				return;
			}
			const metadata = await stat(file.path);
			response.writeHead(200, {
				"Cache-Control": "max-age=3600",
				"Content-Length": metadata.size,
				"Content-Type": contentType(file.path),
			});
			createReadStream(file.path).pipe(response);
		} catch {
			response.writeHead(500).end();
		}
	});
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const conversation = (page) =>
	page.getByRole("dialog", { name: "Conversation" });
const canvas = (page) =>
	page.getByLabel("Three runtime viewport", { exact: true });

async function snapshot(page, label) {
	return page.evaluate(
		(key) => window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(key),
		label,
	);
}

async function ready(page, label, areaId) {
	const handle = await page.waitForFunction(
		({ label, areaId, panel }) => {
			const snapshot = window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(label);
			const container = document.querySelector(panel);
			return snapshot?.scene.areaId === areaId &&
				container?.dataset.groundReady !== "false" &&
				!container?.querySelector(".scene-loading") &&
				snapshot.frame.frameCount > 0 &&
				snapshot.asset.activeImportedAssetInstances > 0 &&
				snapshot.asset.activeCloneInstances > 0 &&
				snapshot.asset.statusCounts.loading === 0 &&
				snapshot.asset.character.animation.loadingSourceCount === 0 &&
				snapshot.renderer.drawCalls > 0
				? snapshot
				: false;
		},
		{
			label,
			areaId,
			panel:
				label === editorLabel
					? ".three-d-preview-panel"
					: ".three-runtime-panel",
		},
		{ polling: 200, timeout },
	);
	try {
		return await handle.jsonValue();
	} finally {
		await handle.dispose();
	}
}

async function startFrames(page, label) {
	await page.evaluate((label) => {
		window.__THREE_PERF_DIAGNOSTICS__.resetSampleWindow(label);
		const distribution = {
			intervals: [],
			previous: undefined,
			active: true,
		};
		window.hollowBenchmarkFrames = distribution;
		const record = (timestamp) => {
			if (!distribution.active) return;
			if (distribution.previous !== undefined) {
				distribution.intervals.push(timestamp - distribution.previous);
			}
			distribution.previous = timestamp;
			requestAnimationFrame(record);
		};
		requestAnimationFrame(record);
	}, label);
}

function stats(intervals) {
	const ordered = intervals.toSorted((first, second) => first - second);
	const percentile = (fraction) =>
		ordered[Math.max(0, Math.ceil(fraction * ordered.length) - 1)];
	return {
		count: ordered.length,
		p50: percentile(0.5),
		p95: percentile(0.95),
		p99: percentile(0.99),
		max: ordered.at(-1),
		over33: ordered.filter((time) => time > 33.4).length,
		over50: ordered.filter((time) => time > 50).length,
	};
}

async function finishFrames(page, label) {
	const intervals = await page.evaluate(() => {
		window.hollowBenchmarkFrames.active = false;
		return window.hollowBenchmarkFrames.intervals;
	});
	return { intervals: stats(intervals), snapshot: await snapshot(page, label) };
}

async function sample(page, label, action) {
	await startFrames(page, label);
	const started = performance.now();
	if (action) await action();
	else {
		await page.waitForTimeout(3000);
		await page
			.waitForFunction(
				() => window.hollowBenchmarkFrames.intervals.length >= 10,
				undefined,
				{ polling: 200, timeout: 9000 },
			)
			.catch((error) => {
				if (error.name !== "TimeoutError") throw error;
			});
	}
	return {
		durationMs: performance.now() - started,
		...(await finishFrames(page, label)),
	};
}

async function sampleCamera(page) {
	const viewport = page
		.getByLabel("3D preview viewport")
		.locator("canvas")
		.first();
	const isometric = button(page, "Isometric");
	await expect(isometric).toHaveAttribute("aria-pressed", "true");
	await viewport.hover();
	await viewport.evaluate((canvas) => {
		const preset = Array.from(
			document.querySelectorAll("button[aria-pressed]"),
		).find((button) => button.textContent.trim() === "Isometric");
		let started;
		canvas.addEventListener(
			"wheel",
			(event) => {
				if (event.isTrusted) started = performance.now();
			},
			{ capture: true, once: true },
		);
		const observer = new MutationObserver(() => {
			if (
				started === undefined ||
				preset.getAttribute("aria-pressed") !== "false"
			)
				return;
			window.hollowWheelToCameraUiMs = performance.now() - started;
			observer.disconnect();
		});
		observer.observe(preset, {
			attributes: true,
			attributeFilter: ["aria-pressed"],
		});
	});
	const movement = await sample(page, editorLabel, async () => {
		await page.mouse.wheel(0, -100);
		await expect(isometric).toHaveAttribute("aria-pressed", "false");
		for (let step = 0; step < 24; step += 1) {
			await page.mouse.wheel(0, step % 2 === 0 ? 100 : -100);
			await page.waitForTimeout(100);
		}
	});
	const wheelToCameraUiMs = await page.evaluate(
		() => window.hollowWheelToCameraUiMs,
	);
	assert.ok(
		Number.isFinite(wheelToCameraUiMs),
		"Expected an observed wheel-driven camera UI update",
	);
	return { wheelToCameraUiMs, movement };
}

async function position(page) {
	const data = await page
		.locator(".three-runtime-hud")
		.getAttribute("data-traversal-target", { timeout: 2000 });
	return JSON.parse(data);
}

async function movementLatency(page, key) {
	await canvas(page).focus();
	return page.evaluate((key) => {
		const hud = document.querySelector(".three-runtime-hud");
		const initial = hud.dataset.traversalTarget;
		const options = { key, code: key, bubbles: true, cancelable: true };
		const started = performance.now();
		return new Promise((resolve) => {
			const observe = () => {
				if (hud.dataset.traversalTarget !== initial) {
					resolve(performance.now() - started);
				} else if (performance.now() - started > 2500) {
					resolve(null);
				} else {
					requestAnimationFrame(observe);
				}
			};
			requestAnimationFrame(observe);
			window.dispatchEvent(new KeyboardEvent("keydown", options));
			window.dispatchEvent(new KeyboardEvent("keyup", options));
		});
	}, key);
}

async function walk(page, waypoints) {
	await canvas(page).focus();
	for (const [x, y] of waypoints) {
		await expect
			.poll(
				() =>
					page.evaluate(
						({ x, y }) => {
							const target =
								document.querySelector(".three-runtime-hud")?.dataset
									.traversalTarget;
							if (!target) return "Loading traversal";
							const current = JSON.parse(target);
							const dx = x - current.x;
							const dy = y - current.y;
							if (Math.abs(dx) <= 0.26 && Math.abs(dy) <= 0.26)
								return `${x},${y}`;
							const key =
								Math.abs(dx) > 0.26
									? dx > 0
										? "ArrowRight"
										: "ArrowLeft"
									: dy > 0
										? "ArrowDown"
										: "ArrowUp";
							const options = {
								key,
								code: key,
								bubbles: true,
								cancelable: true,
							};
							// Send the key edges together so stalls do not add held movement steps.
							window.dispatchEvent(new KeyboardEvent("keydown", options));
							window.dispatchEvent(new KeyboardEvent("keyup", options));
							return `${current.x.toFixed(2)},${current.y.toFixed(2)}`;
						},
						{ x, y },
					),
				{ intervals: [90, 110, 125], timeout, message: `Walk to ${x},${y}` },
			)
			.toBe(`${x},${y}`);
	}
}

async function interact(page) {
	await canvas(page).focus();
	await expect
		.poll(
			async () => {
				if (!(await conversation(page).isVisible()))
					await page.keyboard.press("e");
				return conversation(page).isVisible();
			},
			{ timeout },
		)
		.toBe(true);
}

async function choice(page, name) {
	await conversation(page).getByRole("button", { name, exact: true }).click();
}

async function skipCinematic(page) {
	await button(page, "Skip cinematic").click();
}

async function inspect(page) {
	await expect(canvas(page)).toBeVisible({ timeout });
	const inspect = button(page, "Inspect");
	if (!(await inspect.getAttribute("class"))?.split(" ").includes("active")) {
		await inspect.click();
	}
}

async function saveState(page) {
	return page.evaluate(() => {
		const key = Object.keys(localStorage).find((name) =>
			name.includes("adventure-builder-game-save-v1:"),
		);
		return key ? JSON.parse(localStorage.getItem(key)) : null;
	});
}

async function savedAuthoring(page) {
	return page.evaluate(() => {
		const selected = localStorage.getItem(
			"adventure-builder-editor-selected-v1",
		);
		return JSON.parse(
			localStorage.getItem(`adventure-builder-editor-project-v1:${selected}`),
		).saved;
	});
}

async function memory(cdp) {
	await cdp.send("HeapProfiler.collectGarbage");
	const { usedSize, totalSize, embedderHeapUsedSize, backingStorageSize } =
		await cdp.send("Runtime.getHeapUsage");
	return { usedSize, totalSize, embedderHeapUsedSize, backingStorageSize };
}

async function trackChooser(page) {
	await page.evaluate(() => {
		const timings = { setup: performance.now() };
		window.hollowChooserTimings = timings;
		const capture = (event) => {
			if (
				!event.target
					.closest("button")
					?.textContent.trim()
					.endsWith("Test Flow")
			)
				return;
			timings[event.type] = {
				event: event.timeStamp,
				handler: performance.now(),
			};
		};
		document.addEventListener("pointerdown", capture, true);
		document.addEventListener("click", capture, true);
		const observer = new MutationObserver(() => {
			if (
				!document
					.querySelector(".runtime-entry")
					?.textContent.includes("Continue")
			)
				return;
			timings.dom = performance.now();
			document.removeEventListener("pointerdown", capture, true);
			document.removeEventListener("click", capture, true);
			observer.disconnect();
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});
}

async function continuedCycles(page, cdp, data, area, saveAuthoring) {
	data.cycles = [];
	for (let iteration = 0; iteration < 3; iteration += 1) {
		await page.waitForTimeout(500);
		const checkpoint = await position(page);
		const saveStarted = performance.now();
		await button(page, "Save Game").click();
		await expect(page.locator(".runtime-save-status")).toHaveText(
			"Game saved.",
			{ timeout },
		);
		const saveMs = performance.now() - saveStarted;
		const saved = await saveState(page);
		assert.equal(saved.player.areaId, area);
		assert.deepEqual(
			saved.player.traversal && {
				x: saved.player.traversal.x,
				y: saved.player.traversal.y,
				height: saved.player.traversal.height,
			},
			checkpoint,
		);
		const playMemory = await memory(cdp);
		const exitStarted = performance.now();
		await button(page, "Back to Edit").click();
		await expect(canvas(page)).toHaveCount(0, { timeout });
		assert.equal(await snapshot(page, runtimeLabel), null);
		const exitMs = performance.now() - exitStarted;
		const editMemory = await memory(cdp);
		await trackChooser(page);
		const entryStarted = performance.now();
		await page.getByRole("button", { name: /Test Flow$/ }).click();
		await expect(button(page, "Continue")).toBeVisible({ timeout });
		const chooserMs = performance.now() - entryStarted;
		const chooserBrowserTimings = await page.evaluate(
			() => window.hollowChooserTimings,
		);
		const continueStarted = performance.now();
		await button(page, "Continue").click();
		const resumed = await ready(page, runtimeLabel, area);
		const continueMs = performance.now() - continueStarted;
		assert.deepEqual(await position(page), checkpoint);
		assert.deepEqual(await saveState(page), saved);
		assert.equal(await savedAuthoring(page), saveAuthoring);
		data.cycles.push({
			saveMs,
			exitMs,
			chooserMs,
			chooserBrowserTimings,
			continueMs,
			playMemory,
			editMemory,
			resumed,
		});
	}
}

async function assets(page) {
	return page.evaluate(() =>
		performance
			.getEntriesByType("resource")
			.filter((entry) =>
				/\.(?:glb|gltf|wav|png|jpe?g)(?:\?|$)/i.test(entry.name),
			)
			.map((entry) => ({
				path: new URL(entry.name).pathname,
				durationMs: entry.duration,
				encodedBytes: entry.encodedBodySize,
				transferBytes: entry.transferSize,
			})),
	);
}

async function writeReport(file, data) {
	await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

const projects = {
	merewatch: {
		file: "hollow-kingdom.project.json",
		editorAreas: ["merewatch"],
	},
	"chapter-one": {
		file: "hollow-kingdom-chapter-one.project.json",
		editorAreas: ["merewatch", "hollowwood", "ashen-chapel", "wyrms-hollow"],
	},
};

async function runProject(browser, address, id, machine) {
	const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
	if (offline) {
		await context.route(`${address}/**`, (route) => {
			const file = findAsset(route.request().url());
			return file
				? route.fulfill({
						path: file.path,
						contentType: contentType(file.path),
					})
				: route.fulfill({ status: 404 });
		});
	}
	const page = await context.newPage();
	page.setDefaultTimeout(timeout);
	const cdp = await context.newCDPSession(page);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const data = {
		id,
		machine,
		viewport,
		editor: {},
		runtime: {},
		errors,
		stage: "import",
	};
	const report = resolve(output, `${id}.json`);
	const { file, editorAreas } = projects[id];
	const checkpoint = async (stage) => {
		data.stage = stage;
		await writeReport(report, data);
		console.log(`${id}: ${stage}`);
	};
	try {
		const navigationStarted = performance.now();
		await page.goto(address, { waitUntil: "domcontentloaded" });
		data.domLoadedMs = performance.now() - navigationStarted;
		await page.locator('input[type="file"]').first().setInputFiles(file);
		await expect(button(page, "Map Editor")).toBeVisible({ timeout });
		await button(page, "Save").click();
		await expect.poll(() => savedAuthoring(page), { timeout }).toBeTruthy();
		if (lifecycleOnly) {
			const saveAuthoring = await savedAuthoring(page);
			await button(page, "Story").click();
			const started = performance.now();
			await page.getByRole("button", { name: /Test Flow$/ }).click();
			const firstFrame = await ready(page, runtimeLabel, "merewatch");
			data.runtime.merewatch = {
				readyMs: performance.now() - started,
				firstFrame,
			};
			await continuedCycles(page, cdp, data, "merewatch", saveAuthoring);
			assert.deepEqual(errors, []);
			await checkpoint("Three Play lifecycle complete");
			return;
		}
		await button(page, "Map Editor").click();
		const editorStarted = performance.now();
		await button(page, "3D View").click();
		const firstMap = await ready(page, editorLabel, "merewatch");
		data.editor.merewatch = {
			readyMs: performance.now() - editorStarted,
			firstMap,
		};
		if (cameraOnly) {
			data.editor.merewatch.camera = await sampleCamera(page);
			assert.deepEqual(errors, []);
			await checkpoint("3D Map camera complete");
			return;
		}
		data.editor.merewatch.idle = await sample(page, editorLabel);
		await checkpoint("3D Map in Merewatch");
		const areaPicker = page.locator(".map-workspace-area-picker select");
		const worldDetails = button(page, "World Details");
		if (
			editorAreas.length > 1 &&
			(await worldDetails.getAttribute("aria-expanded")) !== "true"
		) {
			await worldDetails.click();
		}
		for (const area of editorAreas.slice(1)) {
			const started = performance.now();
			await areaPicker.selectOption(area);
			const firstMap = await ready(page, editorLabel, area);
			data.editor[area] = { readyMs: performance.now() - started, firstMap };
			data.editor[area].idle = await sample(page, editorLabel);
			await checkpoint(`3D Map in ${area}`);
		}
		if (editorAreas.length > 1) await areaPicker.selectOption("merewatch");
		const saveAuthoring = await savedAuthoring(page);
		await button(page, "Story").click();
		const playStarted = performance.now();
		await page.getByRole("button", { name: /Test Flow$/ }).click();
		const firstFrame = await ready(page, runtimeLabel, "merewatch");
		data.runtime.merewatch = {
			readyMs: performance.now() - playStarted,
			firstFrame,
		};
		data.runtime.merewatch.idle = await sample(page, runtimeLabel);
		await inspect(page);
		data.runtime.merewatch.movementLatencyMs = await movementLatency(
			page,
			id === "merewatch" ? "ArrowRight" : "ArrowUp",
		);
		await checkpoint("Three Play in Merewatch");
		if (id === "merewatch") {
			data.runtime.merewatch.walkToOswin = await sample(
				page,
				runtimeLabel,
				() =>
					walk(page, [
						[22, 56],
						[22, 44],
						[23, 44],
						[23, 43],
					]),
			);
			await interact(page);
			await choice(page, "She hasn't shuttered it tonight?");
			await choice(page, "Lend me a blade. I'll bring back word.");
			await skipCinematic(page);
			await choice(page, "End conversation");
			await canvas(page).focus();
			await page.keyboard.press("i");
			await page.getByRole("button", { name: /^Equip/ }).click();
			await page.keyboard.press("i");
			await checkpoint("Oswin and Merewatch cinematic");
			data.runtime.merewatch.walkToCamp = await sample(page, runtimeLabel, () =>
				walk(page, [
					[23, 44],
					[22, 44],
					[22, 56],
					[29, 56],
				]),
			);
			await checkpoint("Merewatch camp approach");
			await canvas(page).focus();
			await page.keyboard.press("ArrowRight");
			await expect
				.poll(
					async () => {
						const text = await page.locator(".three-runtime-hud").innerText();
						if (/Pine Lookout|Ash Coat/.test(text)) return true;
						await page.keyboard.press("f");
						return false;
					},
					{ timeout: 4000 },
				)
				.toBe(true);
			await checkpoint("Merewatch camp combat");
			await walk(page, [[24, 56]]);
			await continuedCycles(page, cdp, data, "merewatch", saveAuthoring);
		} else {
			data.runtime.merewatch.walkToOswin = await sample(
				page,
				runtimeLabel,
				() => walk(page, [[22, 43]]),
			);
			await interact(page);
			await choice(
				page,
				"Tell me what happened after I brought you Mara's letter.",
			);
			await choice(page, "Next");
			await skipCinematic(page);
			await choice(page, "End conversation");
			await canvas(page).focus();
			await page.keyboard.press("i");
			await page.getByRole("button", { name: /^Equip/ }).click();
			await page.keyboard.press("i");
			await checkpoint("Oswin and Chapter One cinematic");
			data.runtime.merewatch.walkToRidge = await sample(
				page,
				runtimeLabel,
				() =>
					walk(page, [
						[22, 47],
						[25, 47],
						[25, 50],
						[30, 50],
						[30, 52],
						[34, 52],
						[34, 53],
						[37, 53],
					]),
			);
			await interact(page);
			const transitionStarted = performance.now();
			await choice(page, "Follow the ridge into Hollowwood.");
			await choice(page, "End conversation");
			const firstFrame = await ready(page, runtimeLabel, "hollowwood");
			data.runtime.hollowwood = {
				readyMs: performance.now() - transitionStarted,
				firstFrame,
			};
			data.runtime.hollowwood.idle = await sample(page, runtimeLabel);
			await inspect(page);
			await checkpoint("Three Play in Hollowwood");
			data.runtime.hollowwood.walkToMilestone = await sample(
				page,
				runtimeLabel,
				() =>
					walk(page, [
						[24, 59],
						[27, 59],
						[27, 58],
					]),
			);
			await interact(page);
			await choice(page, "Follow the marks with your eye.");
			await choice(page, "End conversation");
			data.runtime.hollowwood.walkToIven = await sample(
				page,
				runtimeLabel,
				() =>
					walk(page, [
						[30, 58],
						[30, 53],
						[29, 53],
						[29, 48],
						[26, 48],
						[26, 46],
						[23, 46],
					]),
			);
			await interact(page);
			await choice(page, "Who did this?");
			await choice(page, "Next");
			await choice(
				page,
				"Cut Iven free. Leave him the seal to bargain his way home.",
			);
			await choice(page, "End conversation");
			await checkpoint("Hollowwood dialogue");
			await continuedCycles(page, cdp, data, "hollowwood", saveAuthoring);
		}
		assert.deepEqual(errors, []);
		await checkpoint("complete");
	} catch (error) {
		data.failure = String(error);
		data.lastPosition = await position(page).catch(() => null);
		data.lastDiagnostics = await page
			.evaluate(() => window.__THREE_PERF_DIAGNOSTICS__?.getSnapshots())
			.catch(() => null);
		await page
			.screenshot({
				path: resolve(output, `${id}-failure.png`),
				timeout: 10_000,
			})
			.catch(() => {});
		throw error;
	} finally {
		data.assets = await assets(page).catch(() => []);
		await writeReport(report, data);
		await context.close();
	}
}

assert.ok(
	existsSync(resolve(roots[0], "index.html")),
	"Build index.html is missing",
);
await mkdir(output, { recursive: true });
const http = server();
await new Promise((done) => http.listen(0, "127.0.0.1", done));
const address = `http://127.0.0.1:${http.address().port}`;
try {
	const browser = await chromium.launch({
		executablePath: chromePath,
		args: chromiumArgs,
	});
	try {
		const browserCdp = await browser.newBrowserCDPSession();
		const { gpu } = await browserCdp.send("SystemInfo.getInfo");
		const machine = { chrome: browser.version(), chromiumArgs, gpu, offline };
		for (const id of selected.length ? selected : Object.keys(projects)) {
			assert.ok(projects[id], `Unknown fixture ${id}`);
			try {
				await runProject(browser, address, id, machine);
			} catch (error) {
				console.error(error);
				process.exitCode = 1;
			}
		}
	} finally {
		await browser.close();
	}
} finally {
	await new Promise((done, fail) =>
		http.close((error) => (error ? fail(error) : done())),
	);
}
