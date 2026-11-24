// Use a production Vite build and preview server. Run each comparison on the same
// browser, host and viewport, with no other benchmark running at the same time.
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const projects = [
	{
		file: "hollow-kingdom.project.json",
		assets: ["Pine Lookout", "Mere Drake"],
	},
	{
		file: "hollow-kingdom-chapter-one.project.json",
		assets: ["Warrant Runner", "Hollowwood Ashling"],
		alternateSequence: "The Chain in the Silt",
	},
];

const [url, output] = process.argv.slice(2);
const dist = process.env.PROFILE_DIST;
const cinematicsOnly = process.argv.includes("--chapter-cinematics");
const measureClips = process.argv.includes("--clip-decode");
const repeatStages = process.argv.includes("--stage-cycles");
const hardware = process.env.PROFILE_ANGLE === "d3d11";
const viewport = hardware
	? { width: 960, height: 600 }
	: { width: 1440, height: 900 };
if (!url || !output || url === "--list") {
	console.log(
		"Usage: node tools/profile-hollow-editor.mjs PREVIEW_URL OUTPUT.json [--chapter-cinematics [--clip-decode] [--stage-cycles]]",
	);
	console.log(projects.map(({ file }) => file).join("\n"));
	console.log(
		"Set PROFILE_DIST to fulfill local build files when loopback is unavailable.",
	);
	console.log(
		"Set PROFILE_ANGLE=d3d11 to use Direct3D hardware acceleration on Windows.",
	);
	console.log("Set PROFILE_RETRY=1 to exercise the preview retry control.");
	process.exit(url === "--list" ? 0 : 1);
}

const projectList = ".project-list-screen";
const projectHome = ".project-home-screen";
const stage = ".cinema-stage";
const stageReady = `${stage}[data-ready='true']`;
const preview = '.asset-preview [data-preview="animation"]';
const previewLoaded = `${preview}[data-model-status='loaded']`;
const advancing = `${previewLoaded}:not([data-time='0.000'])[data-time]`;
const mimeTypes = {
	".css": "text/css",
	".glb": "model/gltf-binary",
	".html": "text/html",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".wav": "audio/wav",
	".webp": "image/webp",
	".woff2": "font/woff2",
};

async function serveBuildFiles(context) {
	if (!dist) return;
	const origin = new URL(url).origin;
	const roots = [resolve(dist), resolve("public")];
	await context.route(`${origin}/**`, async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		const relativePath =
			pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
		for (const root of roots) {
			const path = resolve(root, relativePath);
			if (!path.startsWith(root + sep)) continue;
			const info = await stat(path).catch(() => undefined);
			if (!info?.isFile()) continue;
			await route.fulfill({ path, contentType: mimeTypes[extname(path)] });
			return;
		}
		await route.fulfill({ status: 404 });
	});
}

function installBrowserProbe() {
	const timings = {};
	const counts = { contexts: 0, contextMs: 0, thumbnails: 0 };
	const longTasks = [];
	const preparation = [];
	let latestRenderer;
	const events = new EventTarget();
	window.__THREE_DEVTOOLS__ = events;
	events.addEventListener("observe", ({ detail: renderer }) => {
		if (!renderer.isWebGLRenderer) return;
		latestRenderer = new WeakRef(renderer);
		const scenes = new WeakSet();
		const compile = renderer.compile.bind(renderer);
		renderer.compile = (...args) => {
			const start = performance.now();
			const result = compile(...args);
			preparation.push({
				phase: "submitPrograms",
				start,
				duration: performance.now() - start,
			});
			return result;
		};
		const render = renderer.render.bind(renderer);
		const shadow = renderer.shadowMap.render.bind(renderer.shadowMap);
		let firstDraw = false;
		renderer.shadowMap.render = (...args) => {
			if (!firstDraw) return shadow(...args);
			const start = performance.now();
			shadow(...args);
			preparation.push({
				phase: "firstDrawShadow",
				start,
				duration: performance.now() - start,
			});
		};
		renderer.render = (scene, camera) => {
			if (scenes.has(scene)) return render(scene, camera);
			scenes.add(scene);
			firstDraw = true;
			const start = performance.now();
			try {
				return render(scene, camera);
			} finally {
				firstDraw = false;
				preparation.push({
					phase: "firstDraw",
					start,
					duration: performance.now() - start,
				});
			}
		};
	});
	performance.setResourceTimingBufferSize(2000);
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			longTasks.push({ start: entry.startTime, duration: entry.duration });
		}
	}).observe({ type: "longtask", buffered: true });

	const canvases = new WeakSet();
	const canvasPrototype = HTMLCanvasElement.prototype;
	const getContext = canvasPrototype.getContext;
	canvasPrototype.getContext = function (kind, ...options) {
		const started = performance.now();
		const context = getContext.call(this, kind, ...options);
		if (context && /^webgl/.test(kind) && !canvases.has(this)) {
			canvases.add(this);
			counts.contexts += 1;
			counts.contextMs += performance.now() - started;
		}
		return context;
	};
	const toDataURL = canvasPrototype.toDataURL;
	canvasPrototype.toDataURL = function (...options) {
		if (canvases.has(this)) counts.thumbnails += 1;
		return toDataURL.apply(this, options);
	};

	function arm({ id, input, shell, ready, selection, frame }) {
		const record = {
			start: input ? null : 0,
			shell: null,
			ready: null,
			countsAtStart: { ...counts },
			countsAtReady: null,
		};
		timings[id] = record;
		const check = (mutations = []) => {
			if (record.start === null) return;
			if (!document.querySelector(shell)) return;
			if (record.shell === null) {
				record.shell = performance.now();
				if (id === "cinematics-1")
					requestAnimationFrame(() =>
						setTimeout(() => {
							const button = document.querySelector(
								".cinema-library button[aria-pressed='true']",
							);
							button?.focus({ preventScroll: true });
							if (button && document.activeElement === button)
								record.shellFocusMs = performance.now() - record.start;
						}, 0),
					);
			}
			const current = document.querySelector(ready);
			if (!current || (selection && !document.querySelector(selection))) return;
			if (
				frame &&
				!mutations.some(
					(entry) =>
						entry.target === current && entry.attributeName === "data-time",
				)
			) {
				return;
			}
			record.ready = performance.now();
			record.countsAtReady = { ...counts };
			observer.disconnect();
		};
		const observer = new MutationObserver(check);
		observer.observe(document, {
			attributes: true,
			attributeFilter: [
				"aria-pressed",
				"data-model-status",
				"data-ready",
				"data-time",
			],
			childList: true,
			subtree: true,
		});
		if (input) {
			document.addEventListener(
				input,
				() => {
					record.start = performance.now();
					record.countsAtStart = { ...counts };
				},
				{ capture: true, once: true },
			);
		} else {
			check();
		}
	}

	const rendererResources = () => {
		const renderer = latestRenderer?.deref();
		if (!renderer?.domElement.isConnected) return null;
		return { ...renderer.info.memory, programs: renderer.info.programs.length };
	};
	window.hollowEditorProfile = {
		arm,
		counts,
		longTasks,
		timings,
		preparation,
		rendererResources,
	};
	arm({
		id: "startup",
		shell: ".project-list-screen",
		ready: ".project-list-card",
	});
}

function resourceMetrics(entries) {
	const resources = {};
	const assets = {};
	for (const entry of entries) {
		const pathname = new URL(entry.name).pathname;
		const extension = pathname.split(".").at(-1);
		const group = ["glb", "js", "css", "woff2"].includes(extension)
			? extension
			: "other";
		resources[group] ??= {
			requests: 0,
			transferBytes: 0,
			encodedBodyBytes: 0,
			cacheHits: 0,
		};
		const totals = resources[group];
		totals.requests++;
		totals.transferBytes += entry.transferSize;
		totals.encodedBodyBytes += entry.encodedBodySize;
		if (entry.transferSize === 0 && entry.encodedBodySize) totals.cacheHits++;
		if (group === "glb") assets[pathname] = (assets[pathname] ?? 0) + 1;
	}
	return { resources, assets };
}

// Measure the same native browser loader as the workspace, after the timed
// visits. Keep fetch/arrayBuffer and GLTF parse (including images) separate.
async function benchmarkLocomotionClips(page) {
	return page.evaluate(async () => {
		const module = performance
			.getEntriesByType("resource")
			.find((entry) =>
				/\/GLTFLoader-[^/]+\.js$/.test(new URL(entry.name).pathname),
			);
		if (!module) throw new Error("Expected the optimized GLTFLoader module");
		const { GLTFLoader } = await import(module.name);
		const loader = new GLTFLoader();
		const directory =
			"/assets/derived/humanoid-animations/golden-reference-v0/";
		const results = [];
		for (const order of [
			["", ".clip"],
			[".clip", ""],
			["", ".clip"],
		]) {
			for (const suffix of order) {
				for (const clip of ["idle", "walk-in-place"]) {
					const file = `${clip}${suffix}.glb`;
					const start = performance.now();
					const response = await fetch(directory + file);
					if (!response.ok) throw new Error(`Failed to fetch ${file}`);
					const bytes = await response.arrayBuffer();
					const fetched = performance.now();
					const result = await loader.parseAsync(bytes, directory);
					results.push({
						file,
						bytes: bytes.byteLength,
						fetchMs: fetched - start,
						parseMs: performance.now() - fetched,
						tracks: result.animations[0].tracks.length,
					});
					// No scene is rendered during this isolated decode experiment.
					result.scene.traverse((node) => {
						for (const material of [node.material].flat().filter(Boolean)) {
							for (const texture of Object.values(material)) {
								if (texture?.isTexture) texture.image?.close?.();
							}
						}
					});
				}
			}
		}
		return results;
	});
}

async function browserMetrics(cdp) {
	const { metrics } = await cdp.send("Performance.getMetrics");
	return Object.fromEntries(
		metrics
			.filter(({ name }) =>
				["JSHeapUsedSize", "Nodes", "TaskDuration", "ScriptDuration"].includes(
					name,
				),
			)
			.map(({ name, value }) => [name, value]),
	);
}

async function readProbe(page, id) {
	await page.waitForFunction(
		(id) =>
			window.hollowEditorProfile.timings[id]?.ready !== null &&
			window.hollowEditorProfile.timings[id]?.ready !== undefined,
		id,
	);
	return page.evaluate((id) => {
		const { timings, longTasks, preparation } = window.hollowEditorProfile;
		const timing = timings[id];
		return {
			...timing,
			preparation: preparation.filter(
				({ start }) => start >= timing.start && start <= timing.ready,
			),
			longTasks: longTasks.filter(
				({ start, duration }) =>
					start + duration >= timing.start && start <= timing.ready,
			),
			previewGeometries:
				document.querySelector(".asset-preview")?.dataset.previewGeometries,
			previewTextures:
				document.querySelector(".asset-preview")?.dataset.previewTextures,
		};
	}, id);
}

function waitForAssetThumbnails(page) {
	return page.waitForFunction(() => {
		const cards = [...document.querySelectorAll(".creator-asset-card")];
		return cards.length > 0 && cards.every((card) => card.querySelector("img"));
	});
}

async function verifyExternalClip(page, asset) {
	await page
		.getByRole("button", { name: "Asset Creator", exact: true })
		.click();
	await page.getByRole("searchbox", { name: "Search assets" }).fill(asset);
	await page.getByRole("button", { name: asset, exact: true }).click();
	await page.locator(advancing).waitFor();
	await page.getByRole("button", { name: "Animations", exact: true }).click();
	await page
		.locator(".creator-resource")
		.filter({
			has: page.getByText("Sword attack", { exact: true }),
			hasText: "Golden Sword V1",
		})
		.click();
	const clipName = "GoldenSword_Attack_V1";
	const animation = page.locator(advancing).filter({ hasText: clipName });
	await animation.waitFor();
	return {
		clipName,
		advancedToSeconds: Number(await animation.getAttribute("data-time")),
		resources: await page.evaluate(() =>
			performance
				.getEntriesByType("resource")
				.filter((entry) => entry.name.endsWith("/golden-sword-v1/actions.glb"))
				.map((entry) => new URL(entry.name).pathname),
		),
	};
}

async function verifyPreviewRetry(browser, scenario) {
	const context = await browser.newContext({ viewport });
	try {
		await serveBuildFiles(context);
		let requests = 0;
		await context.route("**/chapter-one/drake.glb", (route) => {
			requests++;
			return requests === 1 ? route.abort("failed") : route.fallback();
		});
		const page = await context.newPage();
		page.setDefaultTimeout(45_000);
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await page
			.locator('input[type="file"]')
			.first()
			.setInputFiles(scenario.file);
		await page
			.getByRole("button", { name: "Asset Creator", exact: true })
			.click();
		const asset = scenario.assets[1];
		await page.getByRole("searchbox", { name: "Search assets" }).fill(asset);
		await page.getByRole("button", { name: asset, exact: true }).click();
		const message = page.locator(".asset-preview-message");
		const failure = "Model file could not be loaded.";
		await message.filter({ hasText: failure }).waitFor();
		await message
			.getByRole("button", { name: "Retry preview", exact: true })
			.click();
		const animation = page.locator(advancing);
		await animation.waitFor();
		await message.waitFor({ state: "hidden" });
		if (requests !== 2)
			throw new Error(
				`Expected one failed request and one retry, received ${requests}.`,
			);
		return {
			file: scenario.file,
			asset,
			failure,
			requests,
			advancedToSeconds: Number(await animation.getAttribute("data-time")),
		};
	} finally {
		await context.close();
	}
}

async function measureProject(browser, scenario) {
	const project = JSON.parse(await readFile(scenario.file, "utf8"));
	const projectName = project.metadata.name;
	const context = await browser.newContext({ viewport });
	await serveBuildFiles(context);
	const page = await context.newPage();
	page.setDefaultTimeout(45_000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const requestFailures = [];
	page.on("response", (response) => {
		if (response.status() >= 400)
			requestFailures.push([response.status(), response.url()]);
	});
	await page.addInitScript(installBrowserProbe);
	const cdp = await context.newCDPSession(page);
	await cdp.send("Performance.enable");
	const documents = [];
	const results = [];
	const button = (name) => page.getByRole("button", { name, exact: true });
	const sequenceName = project.cutscenes[0].name;
	const stageCycles = [];

	async function measure(
		id,
		{ input = "click", shell, ready = shell, selection, frame, settle },
		action,
	) {
		const before = await browserMetrics(cdp);
		if (id !== "startup") {
			await page.evaluate(
				(settings) => window.hollowEditorProfile.arm(settings),
				{
					id,
					input,
					shell,
					ready,
					selection,
					frame,
				},
			);
		}
		await action();
		const {
			start,
			shell: shellAt,
			ready: readyAt,
			countsAtStart,
			countsAtReady,
			...evidence
		} = await readProbe(page, id);
		const after = await browserMetrics(cdp);
		await settle?.(page);
		const settled =
			settle &&
			(await page.evaluate(() => ({
				at: performance.now(),
				counts: { ...window.hollowEditorProfile.counts },
			})));
		const record = {
			id,
			start,
			readyAt,
			observedUntil: settled ? settled.at : readyAt,
			shellMs: Math.round(shellAt - start),
			readyMs: Math.round(readyAt - start),
			webglContextsCreated:
				(settled?.counts ?? countsAtReady).contexts - countsAtStart.contexts,
			contextMs: countsAtReady.contextMs - countsAtStart.contextMs,
			thumbnailEncodes: countsAtReady.thumbnails - countsAtStart.thumbnails,
			...(settled && {
				thumbnailsReadyMs: Math.round(settled.at - start),
				thumbnailEncodesAfterReady:
					settled.counts.thumbnails - countsAtReady.thumbnails,
			}),
			...evidence,
			jsHeapBytes: after.JSHeapUsedSize,
			domNodes: after.Nodes,
			scriptMs: Math.round(
				(after.ScriptDuration - before.ScriptDuration) * 1000,
			),
			mainThreadTasksMs: Math.round(
				(after.TaskDuration - before.TaskDuration) * 1000,
			),
		};
		results.push(record);
		console.log(
			`${scenario.file} ${id}: ${record.shellMs}/${record.readyMs} ms`,
		);
	}

	async function finishDocument() {
		const entries = await page.evaluate(() =>
			performance.getEntriesByType("resource").map((entry) => entry.toJSON()),
		);
		const current = results.slice(
			documents.reduce((count, document) => count + document.actions.length, 0),
		);
		for (const record of current) {
			Object.assign(
				record,
				resourceMetrics(
					entries.filter(
						({ startTime }) =>
							startTime >= record.start && startTime <= record.observedUntil,
					),
				),
			);
		}
		documents.push({ actions: current, ...resourceMetrics(entries) });
	}

	try {
		await measure("startup", { shell: projectList }, () =>
			page.goto(url, { waitUntil: "commit" }),
		);
		await measure("import-json", { input: "change", shell: projectHome }, () =>
			page.locator('input[type="file"]').first().setInputFiles(scenario.file),
		);
		await finishDocument();
		await measure("startup", { shell: projectList }, () =>
			page.reload({ waitUntil: "commit" }),
		);
		await measure("open-saved-project", { shell: projectHome }, () =>
			button(projectName).click(),
		);
		for (let visit = 1; visit <= 3; visit++) {
			await measure(
				`cinematics-${visit}`,
				{ shell: stage, ready: stageReady },
				() => button("Cinematics").click(),
			);
			await button(sequenceName).waitFor();
			if (visit === 1 && scenario.alternateSequence) {
				const sequence = scenario.alternateSequence;
				await measure(
					"cinematics-cavern-sequence",
					{
						shell: stage,
						ready: stageReady,
						selection: `button[aria-label=${JSON.stringify(sequence)}][aria-pressed='true']`,
					},
					() => button(sequence).click(),
				);
				await measure(
					"cinematics-return-sequence",
					{
						shell: stage,
						ready: stageReady,
						selection: `button[aria-label=${JSON.stringify(sequenceName)}][aria-pressed='true']`,
					},
					() => button(sequenceName).click(),
				);
				if (repeatStages) {
					for (let cycle = 1; cycle <= 3; cycle++) {
						for (const name of [sequence, sequenceName]) {
							await button(name).click();
							await page.locator(stageReady).waitFor();
							const resources = await page.evaluate(() =>
								window.hollowEditorProfile.rendererResources(),
							);
							stageCycles.push({ cycle, name, resources });
						}
					}
				}
			}
			await button("Home").click();
		}
		if (cinematicsOnly) {
			await finishDocument();
			const clipDecode = measureClips
				? await benchmarkLocomotionClips(page)
				: undefined;
			return {
				...scenario,
				documents,
				errors,
				requestFailures,
				clipDecode,
				stageCycles,
			};
		}
		await measure(
			"asset-creator-open",
			{
				shell: preview,
				ready: advancing,
				frame: true,
				settle: waitForAssetThumbnails,
			},
			() => button("Asset Creator").click(),
		);
		for (const [index, asset] of [
			...scenario.assets,
			...scenario.assets,
		].entries()) {
			const search = page.getByRole("searchbox", { name: "Search assets" });
			await search.fill(asset);
			await measure(
				`asset-select-${index + 1}-${asset}`,
				{
					shell: preview,
					ready: advancing,
					selection: `.creator-asset-card[aria-label=${JSON.stringify(asset)}][aria-pressed='true']`,
					frame: true,
				},
				() => button(asset).click(),
			);
		}
		await button("Home").click();
		await measure(
			"asset-creator-reopen",
			{
				shell: preview,
				ready: advancing,
				frame: true,
				settle: waitForAssetThumbnails,
			},
			() => button("Asset Creator").click(),
		);
		await button("Home").click();
		await page.locator(projectHome).waitFor();
		await cdp.send("HeapProfiler.collectGarbage");
		const settledHome = await browserMetrics(cdp);
		await finishDocument();
		const externalClip = await verifyExternalClip(
			page,
			scenario.assets[0],
		).catch((error) => ({ error: error.message }));
		if (externalClip.error) console.error(externalClip.error);
		else
			console.log(
				`${scenario.file} external clip: ${externalClip.clipName} advanced to ${externalClip.advancedToSeconds}s`,
			);
		return {
			...scenario,
			projectName,
			documents,
			errors,
			requestFailures,
			settledHome,
			externalClip,
		};
	} finally {
		await context.close();
	}
}

const browser = await chromium.launch({
	executablePath: process.env.PROFILE_CHROME,
	channel: process.env.PROFILE_CHROME ? undefined : "chrome",
	args: hardware
		? ["--use-angle=d3d11", "--ignore-gpu-blocklist"]
		: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const browserCdp = await browser.newBrowserCDPSession();
const { gpu } = await browserCdp.send("SystemInfo.getInfo");
const evidence = {
	url,
	transport: dist ? "Playwright fulfillment with HTTP cache disabled" : "HTTP",
	browser: browser.version(),
	glRenderer: gpu.auxAttributes?.glRenderer,
	viewport,
	projects: [],
};
try {
	if (hardware && !/direct3d11|d3d11/i.test(evidence.glRenderer ?? "")) {
		throw new Error(
			`Expected Direct3D hardware rendering, received ${evidence.glRenderer}.`,
		);
	}
	for (const scenario of projects) {
		if (cinematicsOnly && !scenario.alternateSequence) continue;
		evidence.projects.push(await measureProject(browser, scenario));
		await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
	}
	if (
		evidence.projects.some(
			({ externalClip, errors }) => externalClip?.error || errors.length,
		)
	) {
		process.exitCode = 1;
	}
	if (process.env.PROFILE_RETRY === "1") {
		evidence.previewRetry = [];
		for (const scenario of projects) {
			const retry = await verifyPreviewRetry(browser, scenario);
			evidence.previewRetry.push(retry);
			console.log(`${retry.file} preview retry passed for ${retry.asset}.`);
			await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
		}
	}
} finally {
	await browser.close();
}
