import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, platform, release, totalmem } from "node:os";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import { installRenderProbe } from "./hollow-render-probe.mjs";
import {
	installTransitionProbe,
	traceRidgeTransition,
} from "./hollow-transition-trace.mjs";

// Build with Vite's test mode to expose the read-only Three diagnostics.
// HOLLOW_OFFLINE_ROUTE=1 fulfils requests from the same build and public roots
// when the browser cannot connect to localhost. Use the same mode in both runs.
const [, , buildArgument, outputArgument, ...options] = process.argv;
const cameraOnly = options.includes("--camera");
const laneGallery = options.includes("--lane-gallery");
const lifecycleOnly = options.includes("--lifecycle");
const fieldStudy = options.includes("--field-study");
const worldScale = fieldStudy || options.includes("--world-scale");
const batching = options.includes("--unbatched")
	? "off"
	: options.includes("--instances-only")
		? "instances"
		: "on";
const playSession = options.includes("--play-session");
const transitionOnly = options.includes("--transition-only");
const traceScheduler = options.includes("--trace-scheduler");
const traceTransition =
	options.includes("--trace-transition") || traceScheduler;
const selected = options.filter((option) => !option.startsWith("--"));
const landscape = fieldStudy
	? await import("../tools/hollow-kingdom/field-study/fixture.mjs")
	: undefined;
if (landscape && options.includes("--list")) {
	console.table(landscape.landscapeScales);
	process.exit(0);
}
if (!buildArgument || !outputArgument) {
	throw new Error(
		[
			"Usage: node e2e/hollow-runtime-baseline.mjs <Vite test-mode build> <output folder> <route>",
			"  [--camera | --lifecycle] [merewatch] [chapter-one]",
			"  --play-session [--walking-only | --combat-only | --mounted-only | --transition-only] chapter-one",
			"  Ridge options: --repeat-ridge, --trace-transition, --trace-scheduler, --ridge-recovery",
			"  Animation/shadow options: --observe-gaits, --view-gaits, --verify-shadows, --native-mounted-shadows",
			"  --world-scale [small] [medium] [large] [stress] [frontier]",
			"  --field-study [--list] [--unbatched | --instances-only] [small | medium | large | stress | upland | frontier | reach]",
			"  Add --world-views to record the far view and warm-replay spawn after the timed samples.",
			"  World options: --world-phases [--world-fixed-matrices] or --world-pacing-only",
		].join("\n"),
	);
}
if (
	worldScale &&
	options.includes("--world-pacing-only") &&
	(options.includes("--world-phases") ||
		options.includes("--world-fixed-matrices"))
)
	throw new Error(
		"Select world phase instrumentation or a pacing-only repeat.",
	);

const editorLabel = "ThreeDPreview";
const runtimeLabel = "ThreeRuntimePanel";
const timeout = 45_000;
const chromePath = process.env.HOLLOW_CHROME_PATH;
const angle = process.env.HOLLOW_ANGLE;
const chromiumArgs = angle
	? [`--use-angle=${angle}`, "--ignore-gpu-blocklist"]
	: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const viewport = laneGallery
	? { width: 1536, height: 960 }
	: { width: 960, height: 600 };
const roots = [resolve(buildArgument), resolve("public")];
const output = resolve(outputArgument);
const offline = process.env.HOLLOW_OFFLINE_ROUTE === "1";
const contentTypes = {
	".css": "text/css",
	".html": "text/html",
	".js": "text/javascript",
	".json": "application/json",
	".jpg": "image/jpeg",
	".webp": "image/webp",
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

// The test build serves these authored images and models from public/. A
// matching JS bundle alone cannot identify two loads of the same art revision.
async function landscapeArtHash() {
	const folder = resolve("public/assets/hollow-kingdom");
	const files = (await readdir(folder, { recursive: true }))
		.filter((name) => /\.(?:glb|gltf|jpe?g|png|webp|ktx2)$/i.test(name))
		.map((name) => name.split(sep).join("/"));
	const hash = createHash("sha256");
	for (const name of files.sort()) {
		hash.update(name).update(await readFile(resolve(folder, name)));
	}
	return hash.digest("hex");
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
			gpu: [],
			renderFrames: 0,
			shadowFrames: 0,
			shadowDraws: 0,
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
	if (fieldStudy) {
		// Establish a timestamp before input. The first interval must include
		// any expensive frame immediately after the action starts.
		await page.evaluate(() => new Promise(requestAnimationFrame));
	}
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
		over33ms: ordered.filter((time) => time > 33).length,
		over33: ordered.filter((time) => time > 33.4).length,
		over50: ordered.filter((time) => time > 50).length,
	};
}

async function finishFrames(page, label) {
	const {
		intervals,
		gpu,
		renderFrames,
		shadowFrames,
		shadowDraws,
		view,
		motion,
	} = await page.evaluate(() => {
		window.hollowBenchmarkFrames.active = false;
		return window.hollowBenchmarkFrames;
	});
	return {
		intervals: stats(intervals),
		...(motion && { motion }),
		snapshot: await snapshot(page, label),
		...(view && {
			view,
			gpuMs: stats(gpu),
			renderFrames,
			shadowFrames,
			shadowDraws,
		}),
	};
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

async function chapterSession(page, cdp, data, checkpoint) {
	const authored = await savedAuthoring(page);
	await button(page, "Story").click();
	const startPlay = () =>
		page.getByRole("button", { name: /Test Flow$/ }).click();
	const start = performance.now();
	await startPlay();
	await ready(page, runtimeLabel, "merewatch");
	data.coldPlayMs = performance.now() - start;
	await button(page, "Save Game").click();
	await expect(page.locator(".runtime-save-status")).toHaveText("Game saved.");
	const originalSave = await saveState(page);
	async function restoreAt(areaId, x, y, facing, flags = {}) {
		await button(page, "Back to Edit").click();
		const save = structuredClone(originalSave);
		Object.assign(save.player, {
			areaId,
			position: { x, y },
			facing,
			equippedWeaponId: "watch-sword",
		});
		delete save.player.traversal;
		Object.assign(save.state.flags, flags);
		await page.evaluate((save) => {
			const key = Object.keys(localStorage).find((name) =>
				name.includes("adventure-builder-game-save-v1:"),
			);
			localStorage.setItem(key, JSON.stringify(save));
		}, save);
		await startPlay();
		await button(page, "Continue").click();
		await ready(page, runtimeLabel, areaId);
		await canvas(page).focus();
	}
	async function measure(name, action) {
		const before = await snapshot(page, runtimeLabel);
		const capture = async () => {
			data.runtime[name] = await sample(page, runtimeLabel, action);
		};
		if (
			options.includes("--observe-gaits") &&
			(name === "followWalk" || name === "ride")
		) {
			const { observeGait } = await import("./hollow-gait-observer.mjs");
			const observed = await observeGait(page, name, capture);
			data.runtime[name].gait = observed;
		} else await capture();
		data.runtime[name].initialMixers =
			before.asset.character.animation.activeMixers;
		await checkpoint(name);
	}
	async function rideMare() {
		await restoreAt("merewatch", 27, 50, { x: 0, y: -1 });
		await page.keyboard.press("e");
		await expect(page.locator(".three-runtime-hud")).toContainText(
			/E dismounts/i,
		);
		await inspect(page);
		await measure("ride", async () => {
			const from = await position(page);
			await canvas(page).focus();
			for (const key of [
				"ArrowRight",
				"ArrowLeft",
				"ArrowRight",
				"ArrowLeft",
			]) {
				await page.keyboard.down(key);
				await page.waitForTimeout(750);
				await page.keyboard.up(key);
				if (key === "ArrowRight")
					assert.notDeepEqual(await position(page), from);
			}
		});
	}
	async function crossRidge(name = "ridgeTransition") {
		await restoreAt(
			"merewatch",
			37,
			53,
			{ x: 1, y: 0 },
			{ "chapter-briefed": true },
		);
		await interact(page);
		const cross = async () => {
			await choice(page, "Follow the ridge into Hollowwood.");
			await choice(page, "End conversation");
			await ready(page, runtimeLabel, "hollowwood");
		};
		if (options.includes("--ridge-recovery")) {
			const { verifyRidgeRecovery } = await import(
				"./hollow-ridge-recovery.mjs"
			);
			await verifyRidgeRecovery({
				page,
				cross,
				ready: () => ready(page, runtimeLabel, "hollowwood"),
				snapshot: () => snapshot(page, runtimeLabel),
				authored: () => savedAuthoring(page),
			});
			return;
		}
		const run = () => measure(name, cross);
		if (traceTransition && name === "ridgeTransition")
			await traceRidgeTransition(
				page,
				cdp,
				output,
				roots[0],
				run,
				traceScheduler,
			);
		else await run();
		const arrival = data.runtime[name].snapshot;
		assert.equal(arrival.scene.areaId, "hollowwood");
		assert.equal(arrival.raf.activeLoopCount, 1);
		const { x, y } = await position(page);
		assert.deepEqual(
			{ x, y },
			{ x: 24, y: 64 },
			"Arrive at the forest-arrival marker",
		);
	}
	if (options.includes("--mounted-only")) {
		await rideMare();
		assert.deepEqual(await savedAuthoring(page), authored);
		return;
	}
	if (transitionOnly) {
		await crossRidge();
		if (options.includes("--repeat-ridge"))
			await crossRidge("ridgeTransitionWarm");
		assert.deepEqual(await savedAuthoring(page), authored);
		return;
	}
	if (!options.includes("--combat-only")) {
		if (options.includes("--verify-shadows")) {
			data.shadowComparison = await page.evaluate(
				() =>
					new Promise((resolve) => {
						window.compareShadows = resolve;
					}),
			);
			await checkpoint("shadowComparison");
			assert.ok(data.shadowComparison.casters > 0);
			assert.equal(
				data.shadowComparison.count,
				0,
				"Cached and native shadows differ",
			);
			assert.equal(
				data.shadowComparison.error,
				0,
				"WebGL error during shadow comparison",
			);
		}
		await measure("initialFrames");
		await canvas(page).focus();
		await measure("followWalk", async () => {
			const start = await position(page);
			await page.evaluate(() => {
				window.hollowWalking = true;
			});
			await page.keyboard.down("w");
			await page.waitForTimeout(1650);
			await page.keyboard.up("w");
			await page.evaluate(() => {
				window.hollowWalking = false;
			});
			assert.notDeepEqual(await position(page), start);
		});
		if (options.includes("--walking-only")) return;
		await restoreAt("merewatch", 22, 47, { x: 0, y: -1 });
		await inspect(page);
		await measure("walk", () => walk(page, [[22, 43]]));
		await canvas(page).hover();
		await page.keyboard.down("Alt");
		await page.mouse.down();
		await measure("orbit", async () => {
			for (let i = 0; i < 80; i++) {
				await page.mouse.move(
					480 + 120 * Math.sin(i / 13),
					300 + 20 * Math.cos(i / 13),
				);
				await page.waitForTimeout(35);
			}
		});
		await page.mouse.up();
		await page.keyboard.up("Alt");
		await interact(page);
		await choice(
			page,
			"Tell me what happened after I brought you Mara's letter.",
		);
		await choice(page, "Next");
		await skipCinematic(page);
		await measure("returnFromCinematic", async () => {
			await choice(page, "End conversation");
			await walk(page, [
				[22, 47],
				[25, 47],
			]);
		});
		await rideMare();
		await crossRidge();
		await measure("hollowwoodArrival");
		await measure("hollowwoodSettled");
		await continuedCycles(page, cdp, data, "hollowwood", authored);
	}
	for (const [name, areaId, x, y] of [
		["woodCombat", "hollowwood", 35, 19],
		["wyrm", "wyrms-hollow", 19, 16],
	]) {
		if (name === "wyrm") {
			// Resume at the seam and activate hostility through the authored dialogue.
			await restoreAt(areaId, 19, 26, { x: 0, y: -1 });
			await interact(page);
			await choice(page, "Step out and see what Mara was holding.");
			await skipCinematic(page);
			await choice(page, "End conversation");
			await inspect(page);
			await walk(page, [
				[18, 26],
				[18, 22],
				[18, 19],
				[19, 19],
			]);
		} else await restoreAt(areaId, x, y, { x: 0, y: 1 });
		await button(page, "Follow Player").click();
		await canvas(page).focus();
		await page.waitForTimeout(400);
		await page.screenshot({ path: resolve(output, `${name}-view.png`) });
		await measure(name, async () => {
			for (let i = 0; i < 50; i++) {
				const key = await page.evaluate(
					(drake) => {
						const roots = window.hollowScene.deref().children;
						const humans = roots.filter((r) => r.getObjectByName("pelvis"));
						const player = humans.pop();
						const enemies = drake
							? roots.filter((r) => r.getObjectByName("Tail4"))
							: humans;
						const nearest = enemies.sort(
							(a, b) =>
								a.position.distanceToSquared(player.position) -
								b.position.distanceToSquared(player.position),
						)[0];
						if (!nearest || nearest.position.distanceTo(player.position) > 10)
							return null;
						const dx = nearest.position.x - player.position.x,
							dz = nearest.position.z - player.position.z;
						const m = window.hollowCamera.deref().matrixWorld.elements;
						const forward = -dx * m[8] - dz * m[10],
							right = dx * m[0] + dz * m[2];
						return Math.abs(forward) > Math.abs(right)
							? forward > 0
								? "ArrowUp"
								: "ArrowDown"
							: right > 0
								? "ArrowRight"
								: "ArrowLeft";
					},
					name === "wyrm" || i >= 22,
				);
				if (key) await page.keyboard.press(key);
				await page.keyboard.press("f");
				await page.waitForTimeout(205);
			}
		});
		await button(page, "Save Game").click();
		const replace = button(page, "Replace save");
		if (await replace.isVisible()) await replace.click();
		await expect(page.locator(".runtime-save-status")).toHaveText(
			"Game saved.",
		);
		const saved = await saveState(page);
		data.runtime[name].combat = {
			playerHealth: saved.player.health,
			enemies: Object.fromEntries(
				Object.entries(saved.state.npcs)
					.filter(([id, n]) => n.health !== originalSave.state.npcs[id].health)
					.map(([id, n]) => [id, n.health]),
			),
		};
		for (const id of name === "woodCombat"
			? ["oath-reader", "ashling"]
			: ["mere-wyrm"]) {
			assert.ok(
				data.runtime[name].combat.enemies[id] <
					originalSave.state.npcs[id].health,
				JSON.stringify(data.runtime[name].combat),
			);
		}
	}
	assert.equal(await savedAuthoring(page), authored);
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
	...(laneGallery && {
		"merewatch-art": { file: "merewatch-field-study.project.json" },
		"green-road": { file: "merewatch-vale.project.json" },
	}),
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
	if (traceTransition)
		await page.addInitScript({
			content: `(${installRenderProbe})(false); (${installTransitionProbe})();`,
		});
	else if (worldScale && options.includes("--world-pacing-only")) {
		const { observeWorldCamera } = await import("./hollow-world-scale.mjs");
		await page.addInitScript(observeWorldCamera);
	} else if (playSession || worldScale)
		await page.addInitScript(
			installRenderProbe,
			options.includes("--native-mounted-shadows") &&
				options.includes("--mounted-only")
				? "native-mounted"
				: options.includes("--verify-shadows"),
		);
	if (laneGallery) {
		await page.addInitScript({
			content: `window.hollowWorldScale = true; (${installRenderProbe})(false);`,
		});
	}
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
	const fixture = landscape
		? await landscape.createLandscapeFixture(id)
		: worldScale
			? await (await import("./hollow-world-fixture.mjs")).createWorldFixture(
					id,
				)
			: undefined;
	if (fieldStudy) {
		data.fieldStudy = {
			batching,
			artSha256: await landscapeArtHash(),
			probes: options.includes("--world-pacing-only") ? "pacing" : "render",
			buildIndexSha256: createHash("sha256")
				.update(await readFile(resolve(roots[0], "index.html")))
				.digest("hex"),
		};
	}
	const { file, editorAreas } = projects[id] ?? {};
	const checkpoint = async (stage) => {
		data.stage = stage;
		await writeReport(report, data);
		console.log(`${id}: ${stage}`);
	};
	try {
		if (options.includes("--view-gaits")) {
			const { captureStationaryGaits } = await import(
				"./hollow-gait-capture.mjs"
			);
			data.stationaryGaits = await captureStationaryGaits(
				page,
				address,
				output,
			);
			assert.deepEqual(errors, []);
			await checkpoint("complete");
			return;
		}
		const navigationStarted = performance.now();
		await page.goto(
			fieldStudy || laneGallery
				? `${address}/?sceneryBatching=${batching}`
				: address,
			{
				waitUntil: "domcontentloaded",
			},
		);
		data.domLoadedMs = performance.now() - navigationStarted;
		await page
			.locator('input[type="file"]')
			.first()
			.setInputFiles(
				fixture
					? {
							name: `survey-${id}.project.json`,
							mimeType: "application/json",
							buffer: Buffer.from(JSON.stringify(fixture.project)),
						}
					: file,
			);
		await expect(button(page, "Map Editor")).toBeVisible({ timeout });
		if (laneGallery) {
			const { captureCottageLane } = await import("./hollow-lane-gallery.mjs");
			data.gallery = await captureCottageLane({
				page,
				ready,
				sample,
				output,
				id,
				position,
				canvas,
			});
			assert.deepEqual(errors, []);
			await checkpoint("complete");
			return;
		}
		if (fixture) {
			const { captureWorldBitmap, measureWorldScale } = await import(
				"./hollow-world-scale.mjs"
			);
			await measureWorldScale({
				page,
				cdp,
				fixture,
				data,
				checkpoint,
				build: roots[0],
				captureWorldView: options.includes("--world-views")
					? async (name, pose) =>
							writeFile(
								resolve(output, `${id}-${name}.png`),
								await captureWorldBitmap(page, pose),
							)
					: undefined,
				ready,
				sample,
				memory,
				position,
				inspect,
				canvas,
			});
			if (fieldStudy)
				assert.equal(
					await landscapeArtHash(),
					data.fieldStudy.artSha256,
					"Field-study assets changed during the route",
				);
			assert.deepEqual(errors, []);
			await checkpoint("complete");
			return;
		}
		await button(page, "Save").click();
		await expect.poll(() => savedAuthoring(page), { timeout }).toBeTruthy();
		if (playSession) {
			assert.equal(id, "chapter-one");
			await chapterSession(page, cdp, data, checkpoint);
			assert.deepEqual(errors, []);
			await checkpoint("complete");
			return;
		}
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
		if (angle === "d3d11")
			assert.match(gpu.auxAttributes?.glRenderer ?? "", /direct3d11/i);
		const machine = { chrome: browser.version(), chromiumArgs, gpu, offline };
		if (fieldStudy) {
			const processors = cpus();
			machine.host = {
				os: `${platform()} ${release()}`,
				cpu: processors[0]?.model,
				logicalCpus: processors.length,
				ramGiB: Math.round(totalmem() / 2 ** 30),
			};
		}
		const fixtures = landscape
			? Object.keys(landscape.landscapeScales)
			: worldScale
				? Object.keys((await import("./hollow-world-fixture.mjs")).worldScales)
				: playSession
					? ["chapter-one"]
					: laneGallery
						? ["merewatch", "merewatch-art"]
						: Object.keys(projects);
		for (const id of selected.length ? selected : fixtures) {
			assert.ok(
				worldScale ? fixtures.includes(id) : projects[id],
				`Unknown fixture ${id}`,
			);
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
