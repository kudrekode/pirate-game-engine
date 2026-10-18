// Opt-in combat-event investigation. Browser-only probes; no production mutation API.
// Start Vite, then --list. CPU_PROFILE=1 is discovery only, never pacing evidence.
import fs from "node:fs/promises";
import ts from "typescript";
import { chromium, expect } from "@playwright/test";
const label = process.argv[2];
if (label === "--list" || !label) {
	console.log(
		"Usage: node tools/profile-combat-hitch.mjs LABEL [REPEATS=5]\nExact case: runtime-parity-demo; separate miss, nonlethal, contact and lethal windows.",
	);
	process.exit(label ? 0 : 1);
}
const repeats = Number(process.argv[3] ?? 5);
if (
	!/^[\w-]+$/.test(label) ||
	!Number.isInteger(repeats) ||
	repeats < 1 ||
	repeats > 20
)
	throw Error("Invalid label/repeat count");
const out = "test-results/combat-hitch";
await fs.mkdir(out, { recursive: true });
const names = new Set([
	"attemptRuntimeCombatAttack",
	"findAttackTarget",
	"damageNpc",
	"damagePlayer",
	"defeatRuntimeNpc",
	"syncQuestProgress",
	"updateRecentEnemy",
	"updateQuestProgress",
	"getQuestViews",
	"applyEnemyContact",
	"isEnemyTouchingPlayer",
	"tickRuntimeNpcs",
	"handleKeyDown",
	"handleCombatEvent",
	"handleNpcEvent",
	"forceRender",
	"ThreeRuntimePanel",
	"createTraversalWorld",
	"areaEntitiesToMarkers",
	"createThreeVisualMarkerGroup",
	"createThreeCharacterAnimationController",
	"requestThreeVisualAssetAnimationClip",
	"prepareThreeCharacterAnimationClip",
	"triggerAttack",
	"applySemanticState",
	"refresh",
	"dispose",
	"showItemFeedback",
	"setQuests",
	"InventoryNotifications",
	"QuestObjectiveTracker",
	"ThreePerformanceOverlay",
	"DevelopmentPerformanceOverlay",
	"removeNpcPresentation",
	"questProgressMessages",
	"App",
	"RuntimePanel",
	"MapEditor",
	"ThreeDPreview",
]);
const instrumented = new Set();
function instrument(body, url) {
	const tree = ts.createSourceFile(
		url,
		body,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const edits = [];
	const add = (pos, text) => edits.push({ pos, text });
	function visit(n) {
		if (
			(ts.isFunctionDeclaration(n) ||
				ts.isArrowFunction(n) ||
				ts.isFunctionExpression(n)) &&
			n.body &&
			ts.isBlock(n.body)
		) {
			const parent = n.parent;
			let name =
				n.name?.getText(tree) ??
				(ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)
					? parent.name.getText(tree)
					: undefined);
			const source = n.body.getText(tree);
			if (url.includes("ThreeRuntimePanel")) {
				if (
					!name &&
					source.includes("const sceneBuildStartedAt =") &&
					source.includes("const scene = new THREE.Scene")
				)
					name = "sceneEffect";
				else if (
					source.startsWith("{\n      diagnostics.recordRafLoopCancel") ||
					(!name &&
						source.includes("renderer.dispose();") &&
						source.includes("cancelAnimationFrame"))
				)
					name = "sceneCleanup";
				else if (name === "render" && source.includes("frameCallbackStartedAt"))
					name = "runtimeRAF";
			}
			if (name === "dispose" && url.includes("threeCharacterAnimation"))
				name = "controllerDispose";
			if (
				names.has(name) ||
				[
					"sceneEffect",
					"sceneCleanup",
					"runtimeRAF",
					"controllerDispose",
				].includes(name)
			) {
				const key =
					name === "handleCombatEvent" || name === "handleNpcEvent"
						? `${JSON.stringify(name + ":")} + event.type`
						: JSON.stringify(name);
				add(
					n.body.getStart(tree) + 1,
					`\nconst __ct = window.__combatProbe.begin(${key}); try {\n`,
				);
				add(
					n.body.end - 1,
					`\n} finally { window.__combatProbe.end(__ct); }\n`,
				);
				instrumented.add(name);
				if (name === "handleCombatEvent" || name === "handleNpcEvent")
					add(
						n.body.getStart(tree) + 1,
						`\nwindow.__combatProbe.event(event);\n`,
					);
			}
		}
		if (ts.isExpressionStatement(n) || ts.isIfStatement(n)) {
			const source = n.getText(tree);
			let stage;
			if (
				ts.isExpressionStatement(n) &&
				ts.isCallExpression(n.expression) &&
				n.expression.expression.getText(tree) === "emit"
			) {
				const argument = n.expression.arguments[0];
				if (argument && ts.isObjectLiteralExpression(argument)) {
					const type = argument.properties.find(
						(property) =>
							ts.isPropertyAssignment(property) &&
							property.name.getText(tree) === "type",
					);
					if (
						type &&
						ts.isStringLiteral(type.initializer) &&
						["status", "itemFeedback"].includes(type.initializer.text)
					)
						stage = "notificationGeneration";
				}
			}

			if (
				ts.isExpressionStatement(n) &&
				source === "renderer.render(scene, camera);"
			)
				stage = "renderSubmission";
			if (
				ts.isExpressionStatement(n) &&
				source.startsWith("session.runtimePlayerHealth =")
			)
				stage = "playerHealthMutation";
			if (
				ts.isExpressionStatement(n) &&
				source.startsWith("session.runtimeState.flags[defeatedFlag] =")
			)
				stage = "defeatFlagMutation";
			if (
				ts.isIfStatement(n) &&
				n.expression.getText(tree) === "result.defeated" &&
				url.includes("runtimeNpcTick")
			)
				stage = "gameOverCheck";
			if (stage) {
				add(
					n.getStart(tree),
					`{const __stage=window.__combatProbe.begin(${JSON.stringify(stage)});try{`,
				);
				add(n.end, "}finally{window.__combatProbe.end(__stage)}}");
				instrumented.add(stage);
			}
		}
		if (
			(ts.isNewExpression(n) &&
				n.expression.getText(tree) === "THREE.WebGLRenderer") ||
			(ts.isCallExpression(n) &&
				n.expression.getText(tree) === "requestThreeVisualAssetAnimationClip")
		) {
			const stage = ts.isNewExpression(n)
				? "rendererCreate"
				: "animationClipRequest";
			add(
				n.getStart(tree),
				`window.__combatProbe.measure(${JSON.stringify(stage)},()=>`,
			);
			add(n.end, ")");
			instrumented.add(stage);
		}
		ts.forEachChild(n, visit);
	}
	visit(tree);
	if (url.includes("ThreeRuntimePanel")) {
		const needle = "host.appendChild(renderer.domElement);";
		const i = body.indexOf(needle);
		if (i >= 0)
			add(
				i + needle.length,
				"\nwindow.__combatProbe.scene = {scene,renderer,controllers:characterAnimationControllers};",
			);
	}
	edits.sort((a, b) => b.pos - a.pos);
	for (const e of edits)
		body = body.slice(0, e.pos) + e.text + body.slice(e.pos);
	return body;
}
const browser = await chromium.launch({
	headless: false,
	channel: process.env.PROFILE_BROWSER ?? "chrome",
});
const system = await (await browser.newBrowserCDPSession()).send(
	"SystemInfo.getInfo",
);
const results = [];
try {
	for (let run = 0; run < repeats; run++) {
		console.log("Run", run + 1);
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
		});
		const page = await context.newPage();
		page.setDefaultTimeout(60000);
		const errors = [];
		page.on("pageerror", (e) => {
			errors.push(e.message);
			console.error(e.message);
		});
		await page.addInitScript(() => {
			const p = (window.__combatProbe = {
				active: false,
				spans: [],
				events: [],
				frames: [],
				commits: [],
				longTasks: [],
				stack: [],
				rendered: [],
				lastFrame: 0,
			});
			p.begin = (name) => {
				if (!p.active) return null;
				if (
					[
						"App",
						"RuntimePanel",
						"MapEditor",
						"ThreeDPreview",
						"ThreeRuntimePanel",
						"InventoryNotifications",
						"QuestObjectiveTracker",
						"ThreePerformanceOverlay",
						"DevelopmentPerformanceOverlay",
					].includes(name)
				)
					p.rendered.push(name);
				const s = { name, start: performance.now(), depth: p.stack.length };
				p.stack.push(s);
				return s;
			};
			p.end = (s) => {
				if (!s) return;
				s.end = performance.now();
				s.duration = s.end - s.start;
				p.spans.push(s);
				p.stack.pop();
			};
			p.measure = (name, fn) => {
				const s = p.begin(name);
				try {
					return fn();
				} finally {
					p.end(s);
				}
			};
			p.event = (e) => {
				if (p.active) p.events.push({ ...e, time: performance.now() });
			};
			const frame = () => {
				const now = performance.now();
				if (p.active && p.lastFrame)
					p.frames.push({ time: now, gap: now - p.lastFrame });
				p.lastFrame = now;
				requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
			new PerformanceObserver((list) => {
				if (p.active)
					for (const e of list.getEntries())
						p.longTasks.push({ start: e.startTime, duration: e.duration });
			}).observe({ type: "longtask", buffered: false });
			window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
				supportsFiber: true,
				renderers: new Map(),
				inject: () => 1,
				onCommitFiberRoot: (_, root) => {
					if (!p.active) return;
					p.commits.push({
						time: performance.now(),
						components: [...new Set(p.rendered)],
					});
					p.rendered = [];
				},
				onCommitFiberUnmount: () => {},
			};
		});
		await page.route("**/src/**", async (route) => {
			if (!/\.(tsx?|jsx?)(\?|$)/.test(route.request().url()))
				return route.continue();
			const r = await route.fetch();
			let body = await r.text();
			if (
				/runtime\/(?:three\/)?|editor\/sections\/(?:entityMarkers|MapEditor|ThreeDPreview)|src\/App/.test(
					route.request().url(),
				)
			)
				body = instrument(body, route.request().url());
			await route.fulfill({ response: r, body });
		});
		await page.goto("http://127.0.0.1:5173/");
		if (await page.getByRole("button", { name: /Blank Project/ }).isVisible())
			await page.getByRole("button", { name: /Blank Project/ }).click();
		await page
			.locator("input[type=file]")
			.setInputFiles(
				"docs/assets/runtime-parity/runtime-parity-demo.project.json",
			);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		const authored = await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		);
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
				s.frame.frameCount > 40
			);
		});
		await page.waitForTimeout(1500);
		await page.getByLabel("Three runtime viewport", { exact: true }).focus();
		const cdp = await context.newCDPSession(page);
		if (process.env.CPU_PROFILE === "1") {
			await cdp.send("Profiler.enable");
			await cdp.send("Profiler.start");
			await page.waitForTimeout(300);
		}
		const capture = async (name, action, wait = 650) => {
			const before = await page.evaluate(() => {
				const p = window.__combatProbe;
				p.spans = [];
				p.events = [];
				p.frames = [];
				p.commits = [];
				p.longTasks = [];
				p.stack = [];
				p.rendered = [];
				p.identities = {
					scene: p.scene.scene,
					renderer: p.scene.renderer,
					controllers: new Map(p.scene.controllers),
				};
				const d =
					window.__THREE_PERF_DIAGNOSTICS__.getSnapshot("ThreeRuntimePanel");
				p.active = true;
				return {
					time: performance.now(),
					scene: d.scene,
					asset: d.asset,
					react: d.react,
				};
			});
			await action();
			await page.waitForTimeout(wait);
			const after = await page.evaluate(() => {
				const p = window.__combatProbe;
				p.active = false;
				const d =
					window.__THREE_PERF_DIAGNOSTICS__.getSnapshot("ThreeRuntimePanel");
				return {
					time: performance.now(),
					scene: d.scene,
					asset: d.asset,
					react: d.react,
					spans: p.spans,
					events: p.events,
					frames: p.frames,
					commits: p.commits,
					longTasks: p.longTasks,
					identities: {
						scene: p.scene.scene === p.identities.scene,
						renderer: p.scene.renderer === p.identities.renderer,
						controllers: [...p.identities.controllers].map(([id, c]) => ({
							id,
							same: p.scene.controllers.get(id) === c,
							present: p.scene.controllers.has(id),
						})),
					},
					hud: document.querySelector(".three-runtime-hud").textContent,
					npcs: JSON.parse(
						document.querySelector(".three-runtime-host").dataset.npcs || "[]",
					),
				};
			});
			if (label.startsWith("after")) {
				expect(after.scene.buildCount).toBe(before.scene.buildCount);
				expect(after.scene.cleanupCount).toBe(before.scene.cleanupCount);
				expect(after.asset.cloneCount).toBe(before.asset.cloneCount);
				expect(after.identities.scene).toBe(true);
				expect(after.identities.renderer).toBe(true);
				for (const actor of after.identities.controllers) {
					const removed = name === "lethal" && actor.id === "sparring_guard";
					expect(actor.present).toBe(!removed);
					expect(actor.same).toBe(!removed);
				}
				expect(
					after.spans.filter(
						(s) => s.name === "createThreeCharacterAnimationController",
					),
				).toHaveLength(0);
				expect(
					after.spans.filter((s) => s.name === "controllerDispose"),
				).toHaveLength(name === "lethal" ? 1 : 0);
			}
			const row = { run, name, before, after };
			results.push(row);
			console.log(name, JSON.stringify(summarize(row)));
			await fs.writeFile(
				`${out}/${label}.json`,
				JSON.stringify(
					{ gpu: system.gpu, errors, results, instrumented: [...instrumented] },
					null,
					2,
				),
			);
		};
		await capture("miss", () => page.keyboard.press("Space"));
		await page.keyboard.press("ArrowRight");
		await page.waitForFunction(() =>
			JSON.parse(
				document.querySelector(".three-runtime-host").dataset.npcs || "[]",
			).some((n) => n.id === "sparring_guard" && n.x === 4),
		);
		await capture("contact", async () => {}, 4500);
		await capture("nonlethal", async () => {
			await page.keyboard.press("Space");
			await page.keyboard.press("Space");
		});
		await expect(page.locator(".three-runtime-hud")).toContainText(
			"Sparring Guard 25/50",
		);
		await capture("lethal", () => page.keyboard.press("Space"));
		await expect(page.locator(".three-runtime-hud")).toContainText(
			"Sparring Guard defeated.",
		);
		if (process.env.CPU_PROFILE === "1") {
			const { profile } = await cdp.send("Profiler.stop");
			await fs.writeFile(
				`${out}/${label}-${run}.cpuprofile`,
				JSON.stringify(profile),
			);
		}
		const backend = await page.evaluate(() => {
			const c = document.querySelector(
					'canvas[aria-label="Three runtime viewport"]',
				),
				gl = c.getContext("webgl2"),
				ext = gl.getExtension("WEBGL_debug_renderer_info");
			return {
				renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
				width: c.width,
				height: c.height,
				dpr: devicePixelRatio,
			};
		});
		await page
			.getByRole("button", { name: "Back to Edit", exact: true })
			.click();
		await page.getByRole("button", { name: "Save", exact: true }).click();
		expect(
			await page.evaluate(() =>
				localStorage.getItem("adventure-builder-project-v1"),
			),
		).toBe(authored);
		if (errors.length) throw Error(errors.join("\n"));
		await fs.writeFile(
			`${out}/${label}.json`,
			JSON.stringify(
				{
					gpu: system.gpu,
					backend,
					errors,
					results,
					instrumented: [...instrumented],
					projectUnchanged: true,
				},
				null,
				2,
			),
		);
		await context.close();
	}
} finally {
	await browser.close();
}
function summarize({ before, after }) {
	const pct = (a, n) => {
		const s = a.toSorted((a, b) => a - b);
		return s[Math.min(s.length - 1, Math.ceil(s.length * n) - 1)] ?? 0;
	};
	return {
		events: after.events.filter((e) =>
			["npcDamaged", "playerDamaged", "attackBlocked"].includes(e.type),
		),
		p95: pct(
			after.frames.map((f) => f.gap),
			0.95,
		),
		p99: pct(
			after.frames.map((f) => f.gap),
			0.99,
		),
		worst: Math.max(...after.frames.map((f) => f.gap)),
		builds: after.scene.buildCount - before.scene.buildCount,
		clones: after.asset.cloneCount - before.asset.cloneCount,
		commits: after.commits.length,
		slow: after.spans
			.filter((s) => s.duration > 20)
			.map((s) => ({ name: s.name, ms: s.duration })),
	};
}
