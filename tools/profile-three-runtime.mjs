// Opt-in, headed hardware investigation. Start npm run dev first; --list does not launch a browser.
// No FPS assertions or production hooks. Browser-only injection supports diagnostic comparisons.
// GPU timer queries are asynchronous and ignored when disjoint. CPU_PROFILE=1 captures a separate
// DevTools profile; its start/stop can stall frames, so do not use that window for frame pacing claims.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const out = "test-results/runtime-performance";
const parity = JSON.parse(
	await fs.readFile(
		"docs/assets/runtime-parity/runtime-parity-demo.project.json",
		"utf8",
	),
);
const tide = JSON.parse(
	await fs.readFile(
		"docs/assets/quest-objectives/tidewatch-harbour.project.json",
		"utf8",
	),
);
const args = process.argv.slice(2);
const label = args[0] ?? "baseline";

const cases = [];
for (const count of [-1, 0, 1, 3, 5]) {
	const p = structuredClone(parity);
	const a = p.areas[0];
	const pool = [
		a.npcs[1],
		a.npcs[2],
		a.npcs[4],
		{ ...structuredClone(a.npcs[1]), id: "extra_west", x: 4, y: 3 },
		{ ...structuredClone(a.npcs[2]), id: "extra_east", x: 9, y: 3 },
	];
	a.npcs = pool.slice(0, Math.max(0, count));
	if (count === -1)
		p.player.threeVisual = { mode: "placeholder", placeholderType: "player" };
	cases.push({
		name: `parity-${count < 0 ? "placeholder" : count + "-moving"}`,
		project: p,
	});
}
const idle = structuredClone(cases.at(-1).project);
for (const n of idle.areas[0].npcs) {
	n.movementMode = "stationary";
	n.movementOverride = { movementMode: "stationary", movementSpeed: 1 };
}
cases.push(
	{ name: "parity-5-idle", project: idle },
	{ name: "parity-original", project: parity },
	{ name: "tidewatch-original", project: tide },
);
cases.push({ name: "parity-contact", project: parity, contact: true });
const fixed = structuredClone(tide);
const fa = fixed.areas[0];
const base = fa.npcs[0];
fa.npcs = [
	base,
	...[
		[1, 8, 10],
		[3, 8, 10],
		[5, 8, 10],
		[8, 9, 10],
		[13, 8, 10],
	].map(([x, y, end], i) => ({
		...structuredClone(base),
		id: "harbour_patrol_" + i,
		nameOverride: "Harbour patrol " + i,
		x,
		y,
		transform: undefined,
		interaction: undefined,
		interactionOverride: {
			type: "show_message",
			activationMode: "disabled",
			lines: [],
		},
		movementMode: "patrol",
		movementOverride: {
			movementMode: "patrol",
			movementSpeed: 1,
			patrolPath: {
				loop: true,
				points: [
					{ x, y },
					{ x, y: end },
				],
			},
		},
		patrolPath: {
			loop: true,
			points: [
				{ x, y },
				{ x, y: end },
			],
		},
	})),
];
cases.push({ name: "harbour-patrol", project: fixed });
for (const variant of ["shadows-off", "mixers-off", "dpr2", "dpr1.5"])
	cases.push({ name: "harbour-" + variant, project: fixed, variant });
const simple = structuredClone(fixed);
simple.player.threeVisual = {
	mode: "asset",
	assetId: "procedural-mannequin-v0",
};
for (const n of simple.npcs)
	n.threeVisual = { mode: "asset", assetId: "procedural-mannequin-v0" };
cases.push({ name: "harbour-simple-character", project: simple });
if (args[0] === "--list" || !args[1]) {
	console.log(
		"Usage: node tools/profile-three-runtime.mjs OUTPUT_LABEL EXACT_CASE[,EXACT_CASE...]",
	);
	console.log(cases.map((c) => c.name).join("\n"));
	process.exit(args[0] === "--list" ? 0 : 1);
}
const selected = args[1].split(",");
for (const name of selected)
	if (!cases.some((c) => c.name === name)) throw Error("Unknown case: " + name);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
	headless: false,
	channel: process.env.PROFILE_BROWSER ?? "chrome",
});
const cd = await browser.newBrowserCDPSession();
const system = await cd.send("SystemInfo.getInfo");
const gpu = {
	devices: system.gpu.devices,
	renderer: system.gpu.auxAttributes.glRenderer,
	features: system.gpu.featureStatus,
};
const results = [];
try {
	for (const c of cases.filter((c) => selected.includes(c.name))) {
		console.log("Starting", c.name);
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
		});
		const page = await context.newPage();
		page.setDefaultTimeout(60000);
		const errors = [];
		const loads = {};
		page.on("pageerror", (e) => {
			errors.push(e.message);
			console.error(e.message);
		});
		page.on("request", (r) => {
			if (/\.glb(?:$|\?)/.test(r.url()))
				loads[r.url()] = (loads[r.url()] ?? 0) + 1;
		});
		await page.addInitScript(() => {
			window.__commits = 0;
			window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
				supportsFiber: true,
				renderers: new Map(),
				inject: () => 1,
				onCommitFiberRoot: () => window.__commits++,
				onCommitFiberUnmount: () => {},
			};
		});
		await page.route(
			"**/src/runtime/three/ThreeRuntimePanel.tsx*",
			async (route) => {
				const response = await route.fetch();
				const body = await response.text();
				if (!body.includes("host.appendChild(renderer.domElement);"))
					throw Error("Probe insertion point missing");
				await route.fulfill({
					response,
					body: body.replace(
						"host.appendChild(renderer.domElement);",
						"host.appendChild(renderer.domElement); window.__probe = {scene,renderer,controllers:characterAnimationControllers};",
					),
				});
			},
		);
		await page.goto("http://127.0.0.1:5173/");
		if (await page.getByRole("button", { name: /Blank Project/ }).isVisible())
			await page.getByRole("button", { name: /Blank Project/ }).click();
		await page.locator("input[type=file]").setInputFiles({
			name: "profile.project.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(c.project)),
		});
		await page.getByRole("button", { name: "3D View", exact: true }).click();
		await page.waitForFunction(
			() =>
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeDPreview")?.asset
					.statusCounts.loading === 0,
		);
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await page.waitForFunction(() => {
			const s =
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel");
			return (
				s &&
				s.asset.statusCounts.loading === 0 &&
				s.asset.character.animation.loadingSourceCount === 0 &&
				s.frame.frameCount > 20
			);
		});
		if (c.contact) {
			await page.getByLabel("Three runtime viewport", { exact: true }).focus();
			await page.keyboard.press("ArrowRight");
		}
		await page.waitForTimeout(3000);
		await page.evaluate((variant) => {
			const { scene, renderer, controllers } = window.__probe;
			const skins = [];
			scene.traverse((o) => {
				if (o.isSkinnedMesh) skins.push(o);
			});
			window.__probe.characterResources = {
				meshes: skins.length,
				skeletons: new Set(skins.map((s) => s.skeleton)).size,
				bones: new Set(skins.flatMap((s) => s.skeleton.bones)).size,
				geometries: new Set(skins.map((s) => s.geometry)).size,
				materials: new Set(
					skins.flatMap((s) =>
						Array.isArray(s.material) ? s.material : [s.material],
					),
				).size,
				shadowCasters: skins.filter((s) => s.castShadow).length,
			};
			if (variant === "shadows-off")
				scene.traverse((o) => {
					if (o.isSkinnedMesh) o.castShadow = false;
				});
			if (variant === "mixers-off")
				controllers.forEach((c) => {
					c.update = () => {};
				});
			if (variant?.startsWith("dpr"))
				renderer.setPixelRatio(Number(variant.slice(3)));
			window.__probe.frames = [];
			window.__probe.gpuMs = [];
			window.__probe.positions = {};
			const gl = renderer.getContext(),
				ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
			window.__probe.timerAvailable = !!ext;
			const original = renderer.render.bind(renderer);
			let frame = 0,
				pending,
				last = performance.now();
			renderer.render = (s, c) => {
				const now = performance.now();
				window.__probe.frames.push(now - last);
				last = now;
				if (
					pending &&
					gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)
				) {
					if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
						window.__probe.gpuMs.push(
							gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6,
						);
					gl.deleteQuery(pending);
					pending = null;
				}
				const query =
					ext && !pending && ++frame % 30 === 0 ? gl.createQuery() : null;
				if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
				original(s, c);
				if (query) {
					gl.endQuery(ext.TIME_ELAPSED_EXT);
					pending = query;
				}
				for (const n of JSON.parse(
					document.querySelector(".three-runtime-host").dataset.npcs ?? "[]",
				)) {
					window.__probe.positions[n.id] ??= new Set();
					const set = window.__probe.positions[n.id];
					set.add(n.x + "," + n.y);
				}
			};
		}, c.variant);
		await page.waitForTimeout(1000);
		const session = await context.newCDPSession(page);
		await session.send("Profiler.enable");
		const start = await page.evaluate(() => {
			window.__frameSample = {
				active: true,
				last: performance.now(),
				frames: [],
			};
			const sample = () => {
				const s = window.__frameSample;
				if (!s.active) return;
				const now = performance.now();
				s.frames.push(now - s.last);
				s.last = now;
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
			const d = window.__THREE_PERF_DIAGNOSTICS__;
			d.resetSampleWindow("ThreeRuntimePanel");
			return {
				snapshots: d.getSnapshots(),
				commits: window.__commits,
				time: performance.now(),
			};
		});
		if (process.env.CPU_PROFILE === "1") await session.send("Profiler.start");
		await page.waitForTimeout(10000);
		const profile =
			process.env.CPU_PROFILE === "1"
				? (await session.send("Profiler.stop")).profile
				: null;
		const end = await page.evaluate(() => {
			window.__frameSample.active = false;
			const canvas = document.querySelector(
				'canvas[aria-label="Three runtime viewport"]',
			);
			const gl = canvas.getContext("webgl2");
			const ext = gl.getExtension("WEBGL_debug_renderer_info");
			return {
				sampleFrames: window.__frameSample.frames,
				snapshots: window.__THREE_PERF_DIAGNOSTICS__.getSnapshots(),
				commits: window.__commits,
				time: performance.now(),
				probe: {
					characterResources: window.__probe?.characterResources,
					timerAvailable: window.__probe?.timerAvailable,
					gpuMs: window.__probe?.gpuMs,
					frames: window.__probe?.frames,
					positions: Object.fromEntries(
						Object.entries(window.__probe?.positions ?? {}).map(([id, s]) => [
							id,
							[...s],
						]),
					),
				},
				resolution: {
					width: canvas.width,
					height: canvas.height,
					dpr: devicePixelRatio,
					css: [canvas.clientWidth, canvas.clientHeight],
				},
				renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
				npcs: JSON.parse(
					document.querySelector(".three-runtime-host").dataset.npcs ?? "[]",
				),
			};
		});
		const row = { name: c.name, gpu, start, end, loads, errors };
		results.push(row);
		if (profile)
			await fs.writeFile(
				`${out}/${label}-${c.name}.cpuprofile`,
				JSON.stringify(profile),
			);
		await fs.writeFile(
			`${out}/${label}.json`,
			JSON.stringify(results, null, 2),
		);
		const s = end.snapshots.ThreeRuntimePanel;
		console.log(
			JSON.stringify({
				name: c.name,
				frame: s.frame,
				phases: s.phases,
				renderer: s.renderer,
				builds: [
					start.snapshots.ThreeRuntimePanel.scene.buildCount,
					s.scene.buildCount,
				],
				errors,
			}),
		);
		await context.close();
	}
} finally {
	await browser.close();
}
