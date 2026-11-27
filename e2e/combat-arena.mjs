import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import { installRenderProbe } from "./hollow-render-probe.mjs";

const cases = [
	"blade",
	"bow",
	"courser",
	"wyrm",
	"guard",
	"falchion",
	"footwork",
];
if (process.argv.includes("--list")) {
	console.log(cases.join("\n"));
	process.exit(0);
}
const selected = process.argv.slice(2);
for (const id of selected) assert(cases.includes(id), `Unknown case ${id}`);
const output = resolve(process.env.ARENA_OUTPUT ?? "test-results/combat-arena");
const roots = [
	resolve(process.env.ARENA_BUILD ?? "test-results/combat-arena-build"),
	resolve("public"),
];
const types = {
	".js": "application/javascript",
	".css": "text/css",
	".html": "text/html",
	".glb": "model/gltf-binary",
	".jpg": "image/jpeg",
	".png": "image/png",
	".woff2": "font/woff2",
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.HOLLOW_CHROME_PATH,
	args: [
		`--use-angle=${process.env.HOLLOW_ANGLE ?? "d3d11"}`,
		"--ignore-gpu-blocklist",
	],
});
const page = await browser.newPage({
	viewport: { width: 1120, height: 760 },
	deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(installRenderProbe, false);
await page.route("http://127.0.0.1:5194/**", (route) => {
	const relative =
		decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) ||
		"index.html";
	const file = roots
		.map((root) => ({ root, path: resolve(root, relative) }))
		.find((f) => f.path.startsWith(f.root + sep) && existsSync(f.path));
	return file
		? route.fulfill({ path: file.path, contentType: types[extname(file.path)] })
		: route.fulfill({ status: 404 });
});
const btn = (name) => page.getByRole("button", { name, exact: true });
const host = page.locator(".three-runtime-host");
const hud = page.locator(".encounter-hud");
const meter = (name) => hud.getByRole("meter", { name });
const hp = async (name = "Player health") =>
	Number(await meter(name).getAttribute("value"));
const tap = (key) => page.keyboard.press(key);
async function waitFor(check, arg) {
	await page.waitForFunction(check, arg, { timeout: 17000 });
}
async function start() {
	await expect(btn("Begin bout")).toBeEnabled({ timeout: 40000 });
	await waitFor(
		() =>
			window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")?.asset
				.character.animation.activeMixers >= 2,
	);
	await btn("Begin bout").click();
}
function observe() {
	const node = document.querySelector(".three-runtime-host");
	const log = {
		messages: [],
		clips: [],
		projectiles: [],
		positions: [],
		playerClips: [],
		loops: {},
		exchange: [],
		events: [],
	};
	window.boutLog = log;
	let previousNpc;
	const frame = (t) => {
		if (log !== window.boutLog || !node.isConnected) return;
		const npc = JSON.parse(node.dataset.npcs ?? "[]")[0];
		const msg = document.querySelector(
			".encounter-hud [role=status]",
		)?.textContent;
		if (msg && log.messages.at(-1) !== msg) {
			log.messages.push(msg);
			log.events.push({ t, msg });
		}
		if (npc) {
			if (
				npc.clip &&
				npc.clip === previousNpc?.clip &&
				npc.clipTime < previousNpc.clipTime - 0.05
			)
				log.loops[npc.clip] = (log.loops[npc.clip] ?? 0) + 1;
			previousNpc = npc;
			if (npc.clip && !log.clips.includes(npc.clip)) log.clips.push(npc.clip);
			const pos = [npc.x, npc.y].join(",");
			if (log.positions.at(-1) !== pos) log.positions.push(pos);
		}
		const weapon = JSON.parse(node.dataset.weapon ?? "{}");
		if (weapon.activeClip && !log.playerClips.includes(weapon.activeClip))
			log.playerClips.push(weapon.activeClip);
		const snapshot = {
			t: Math.round(t),
			phase: npc?.phase,
			counter: npc?.counter,
			due: npc?.dueAt,
			npcClip: npc?.clip,
			npcTime: npc?.clipTime,
			npcHealth: npc?.health ?? 0,
			playerClip: weapon.activeClip,
			playerTime: weapon.clipTime,
			health: document.querySelector('[aria-label="Player health"]')?.value,
			guard: weapon.guard,
			openUntil: weapon.openUntil,
			attackDue: weapon.attackDue,
			stagger: npc?.staggerUntil,
			npcWeapon: npc?.attachedWeapon,
			playerWeapon: weapon.attached,
		};
		const last = log.exchange.at(-1);
		if (
			!last ||
			[
				"phase",
				"counter",
				"npcClip",
				"npcHealth",
				"playerClip",
				"health",
				"guard",
				"openUntil",
				"attackDue",
				"stagger",
			].some((key) => snapshot[key] !== last[key])
		)
			log.exchange.push(snapshot);
		const arrow = JSON.parse(node.dataset.projectiles ?? "{}");
		if (arrow.active && !log.projectiles.includes("flight"))
			log.projectiles.push("flight");
		if (arrow.lastImpact && !log.projectiles.includes(arrow.lastImpact.kind))
			log.projectiles.push(arrow.lastImpact.kind);
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}
async function beginSampling() {
	await page.evaluate(() => {
		window.__THREE_PERF_DIAGNOSTICS__.resetSampleWindow("ThreeRuntimePanel");
		const sample = {
			active: true,
			intervals: [],
			gpu: [],
			renderFrames: 0,
			shadowFrames: 0,
			shadowDraws: 0,
		};
		window.hollowBenchmarkFrames = sample;
		let previous;
		const frame = (t) => {
			if (!sample.active) return;
			if (previous !== undefined) sample.intervals.push(t - previous);
			previous = t;
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	});
}
async function endSampling() {
	return page.evaluate(() => {
		const s = window.hollowBenchmarkFrames;
		s.active = false;
		const d =
			window.__THREE_PERF_DIAGNOSTICS__.getSnapshot("ThreeRuntimePanel");
		const quant = (a, q) =>
			a.length
				? Number(
						[...a]
							.sort((x, y) => x - y)
							[Math.ceil(a.length * q) - 1].toFixed(2),
					)
				: null;
		const gl = document
				.querySelector(".three-runtime-host canvas")
				.getContext("webgl2"),
			info = gl.getExtension("WEBGL_debug_renderer_info");
		return {
			samples: s.intervals.length,
			p50: quant(s.intervals, 0.5),
			p95: quant(s.intervals, 0.95),
			p99: quant(s.intervals, 0.99),
			gpuSamples: s.gpu.length,
			gpuMedian: quant(s.gpu, 0.5),
			renderer: info
				? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
				: gl.getParameter(gl.RENDERER),
			visible: s.view?.minVisible,
			draws: s.view?.draws,
			triangles: s.view?.triangles,
			callback: d.phases.frameCallback,
			render: d.phases.render,
			animation: d.phases.animationUpdate,
			mixers: d.asset.character.animation.activeMixers,
			skinnedMeshes: d.asset.character.skinnedMeshCount,
			missingClips: d.asset.character.animation.missingClipCount,
			incompatibleClips: d.asset.character.animation.incompatibleClipCount,
		};
	});
}
async function history(text) {
	await waitFor(
		(t) => window.boutLog.messages.some((m) => m.includes(t)),
		text,
	);
}
async function screenshot(name) {
	await page.screenshot({ path: resolve(output, `${name}.jpg`), quality: 88 });
}
async function defeatWithBlade() {
	for (let i = 0; i < 23 && !(await hud.getByText(/Victory/).count()); i++) {
		await tap("f");
		await page.waitForTimeout(710);
	}
	await expect(hud.getByText(/Victory/)).toBeVisible();
}

async function defeatWithBow() {
	const canvas = host.locator("canvas");
	if (!(await locked())) await canvas.click({ position: { x: 540, y: 270 } });
	await waitFor(() => !!document.pointerLockElement);
	let mx = 540,
		my = 270;
	for (
		let shot = 0;
		shot < 7 && !(await hud.getByText(/Victory/).count());
		shot++
	) {
		for (let i = 0; i < 12; i++) {
			const offset = await page.evaluate(() => {
				const camera = window.hollowCamera.deref();
				const pos = JSON.parse(
					document.querySelector(".three-runtime-host").dataset.npcs,
				)[0]?.position;
				if (!pos) return null;
				const aim = camera.getWorldDirection(camera.position.clone());
				const target = camera.position
					.clone()
					.set(pos[0], pos[1] + 1.25, pos[2])
					.sub(camera.position);
				const yaw =
					((Math.atan2(target.x, target.z) - Math.atan2(aim.x, aim.z)) * 180) /
					Math.PI;
				const pitch =
					((Math.atan2(-target.y, Math.hypot(target.x, target.z)) -
						Math.atan2(-aim.y, Math.hypot(aim.x, aim.z))) *
						180) /
					Math.PI;
				return { yaw: ((yaw + 540) % 360) - 180, pitch };
			});
			if (
				!offset ||
				(Math.abs(offset.yaw) < 0.18 && Math.abs(offset.pitch) < 0.18)
			)
				break;
			mx -= offset.yaw / 0.22;
			my += offset.pitch / 0.18;
			await page.mouse.move(mx, my);
			await page.waitForTimeout(190);
		}
		await page.keyboard.down("f");
		await page.waitForTimeout(800);
		await page.keyboard.up("f");
		await page.waitForTimeout(1250);
	}
	await expect(hud.getByText(/Victory/)).toBeVisible();
}

const locked = () =>
	page.evaluate(
		() =>
			document.pointerLockElement?.matches(".three-runtime-host canvas") &&
			document.activeElement === document.pointerLockElement,
	);
async function openMenu() {
	if (!(await page.getByLabel("Encounter", { exact: true }).isVisible()))
		await tap("m");
	await expect(page.getByLabel("Encounter", { exact: true })).toBeVisible();
	await waitFor(() => !document.pointerLockElement);
}
async function resetBout() {
	await openMenu();
	const started = Date.now();
	await btn("Reset encounter").click();
	await expect(btn("Begin bout")).toBeEnabled({ timeout: 20000 });
	return Date.now() - started;
}
async function duel(id) {
	await openMenu();
	await page.getByLabel("Encounter", { exact: true }).selectOption(id);
	await page.evaluate(observe);
	await start();
	await expect.poll(locked).toBeTruthy();
	await waitFor(
		() =>
			JSON.parse(document.querySelector(".three-runtime-host").dataset.npcs)[0]
				?.phase === "windup",
	);
	await openMenu();
	const pausedHealth = await hp();
	await page.waitForTimeout(1050);
	assert.equal(await hp(), pausedHealth);
	await expect(page.getByLabel("Encounter", { exact: true })).toBeFocused();
	await btn("Resume bout").click();
	await expect.poll(locked).toBeTruthy();
	const result = {
		id,
		navigation: {
			pausedMs: 1050,
			startLocked: true,
			menuUnlocked: true,
			resumedLocked: true,
		},
	};
	await openMenu();
	const other = id === "guard" ? "blade" : "guard";
	await page.getByLabel("Encounter", { exact: true }).selectOption(other);
	await start();
	await expect.poll(locked).toBeTruthy();
	const readView = () =>
		host.evaluate((node) => {
			const camera = window.hollowCamera.deref();
			const look = camera.getWorldDirection(camera.position.clone());
			return {
				yaw: Math.atan2(look.x, look.z),
				grid: JSON.parse(node.dataset.traversal ?? "null")?.grid,
			};
		});
	const before = await readView();
	await page.mouse.move(280, 180);
	await expect
		.poll(async () => Math.abs((await readView()).yaw - before.yaw))
		.toBeGreaterThan(0.01);
	await page.keyboard.down("d");
	await page.waitForTimeout(480);
	await page.keyboard.up("d");
	const after = await readView();
	assert(after.grid, "Movement must reach the traversal system");
	assert.notDeepEqual(before.grid, after.grid);
	result.navigation.movementAndCamera = { before, after };
	await openMenu();
	await page.getByLabel("Encounter", { exact: true }).selectOption(id);
	await expect(btn("Begin bout")).toBeEnabled();
	result.navigation.switchedDuringFight = [id, other, id];
	result.navigation.resetMs = await resetBout();
	const full = await hp(),
		enemyFull = await hp("Enemy health");
	await page.evaluate(observe);
	await start();
	await beginSampling();
	const spamStart = Date.now();
	let presses = 0;
	while (
		(await hp()) > 0 &&
		(await hp("Enemy health")) > 0 &&
		Date.now() - spamStart < 30000
	) {
		await tap("f");
		presses++;
		await page.waitForTimeout(115);
	}
	const perf = await endSampling();
	result.spam = {
		presses,
		playerHealth: await hp(),
		enemyHealth: await hp("Enemy health"),
		log: await page.evaluate(() => window.boutLog),
		perf,
	};
	if (id === "guard" || id === "blade")
		assert.equal(
			result.spam.playerHealth,
			0,
			"Frontal attack spam must lose this duel",
		);
	assert(result.spam.playerHealth < full, "Careless entries must take damage");
	await screenshot(`${id}-spam-outcome`);
	result.navigation.afterSpamResetMs = await resetBout();
	assert.equal(await hp(), full);
	assert.equal(await hp("Enemy health"), enemyFull);
	await page.evaluate(observe);
	await start();
	await expect.poll(locked).toBeTruthy();
	await page.keyboard.down("q");
	await history("Blocked.");
	assert.equal(await hp(), full);
	await page.keyboard.up("q");
	await beginSampling();
	for (
		let exchange = 0;
		exchange < 6 && (await hp("Enemy health")) > 0;
		exchange++
	) {
		await waitFor(
			() =>
				JSON.parse(
					document.querySelector(".three-runtime-host").dataset.npcs,
				)[0]?.phase === "windup",
		);
		if (!exchange) {
			await page.waitForTimeout(225);
			await screenshot(`${id}-01-windup`);
		}
		await waitFor(() => {
			const npc = JSON.parse(
				document.querySelector(".three-runtime-host").dataset.npcs,
			)[0];
			return npc?.phase === "strike" && npc.dueAt - performance.now() < 104;
		});
		const previous = await hp("Enemy health");
		await page.keyboard.down("q");
		await waitFor(
			() =>
				JSON.parse(document.querySelector(".three-runtime-host").dataset.weapon)
					.openUntil > performance.now(),
		);
		if (!exchange) await screenshot(`${id}-02-parry`);
		await tap("f");
		await page.keyboard.up("q");
		await expect
			.poll(() => hp("Enemy health"), { timeout: 1800 })
			.toBeLessThan(previous);
		if (!exchange) {
			await screenshot(`${id}-03-riposte`);
			if (id === "guard") {
				await openMenu();
				await btn("Save Game").click();
				if (await btn("Replace save").isVisible())
					await btn("Replace save").click();
				await expect(
					page.getByText("Game saved.", { exact: true }),
				).toBeVisible();
				result.savedEnemyHealth = await hp("Enemy health");
				await btn("Resume bout").click();
				await expect.poll(locked).toBeTruthy();
			}
		}
	}
	result.defence = {
		playerHealth: await hp(),
		enemyHealth: await hp("Enemy health"),
		log: await page.evaluate(() => window.boutLog),
		perf: await endSampling(),
	};
	assert.equal(result.defence.enemyHealth, 0);
	assert.equal(result.defence.playerHealth, full);
	await expect(hud.getByText(/Victory/)).toBeVisible();
	await openMenu();
	await screenshot(`${id}-04-victory`);
	assert(result.defence.log.playerClips.includes("OutsideWard"));
	assert(
		result.defence.log.exchange.some(
			(row) => row.npcWeapon && row.playerWeapon,
		),
	);
	assert.equal(perf.missingClips + perf.incompatibleClips, 0);
	assert(perf.samples > 50);
	if (result.savedEnemyHealth !== undefined) {
		await btn("Back to Edit").click();
		await btn("Play").click();
		await btn("Continue").click();
		await expect(btn("Begin bout")).toBeEnabled({ timeout: 20000 });
		assert.equal(await hp("Enemy health"), result.savedEnemyHealth);
		assert.equal(await hp(), full);
		await resetBout();
	}
	return result;
}

async function verifyFootwork() {
	await openMenu();
	await page.getByLabel("Encounter", { exact: true }).selectOption("guard");
	await page.evaluate(observe);
	await start();
	const full = await hp();
	await history("prepares a guarded");
	await page.keyboard.down("q");
	await history("Guard raised.");
	await page.keyboard.up("q");
	await expect.poll(() => hp()).toBeLessThan(full);
	const exposedHealth = await hp();
	await resetBout();
	await page.evaluate(observe);
	await start();
	await history("prepares a guarded");
	await page.keyboard.down("d");
	try {
		await history("misses.");
	} finally {
		await page.keyboard.up("d");
	}
	const sidestepHealth = await hp();
	assert.equal(sidestepHealth, full);
	await openMenu();
	return {
		id: "footwork",
		full,
		exposedHealth,
		sidestepHealth,
		log: await page.evaluate(() => window.boutLog),
	};
}

async function run(id) {
	if (id === "footwork") return verifyFootwork();
	if (["blade", "guard", "falchion"].includes(id)) return duel(id);
	await openMenu();
	await page.getByLabel("Encounter", { exact: true }).selectOption(id);
	await expect(btn("Begin bout")).toBeVisible();
	await page.evaluate(observe);
	if (id === "courser") await waitFor(() => window.boutLog.loops.HorseIdle > 0);
	await start();
	const full = await hp();
	const initialEnemy = await hp("Enemy health");
	await beginSampling();
	// Live keyboard input and mixer/health observations only.
	await page.waitForTimeout(5000);
	const perf = await endSampling();
	await screenshot(id);
	assert(
		perf.samples > 20 && perf.visible >= 2,
		"Both combatants must be in the measured camera view " +
			JSON.stringify(perf),
	);
	assert.equal(perf.missingClips + perf.incompatibleClips, 0);
	const evidence = { id, perf };
	if (id === "bow") {
		await history("Arrow hits.");
		await page.keyboard.down("f");
		await page.waitForTimeout(900);
		await page.keyboard.up("f");
		await page.keyboard.down("w");
		await page.keyboard.down("a");
		await page.waitForTimeout(2250);
		await page.keyboard.up("a");
		await page.keyboard.up("w");
		await waitFor(() => window.boutLog.positions.length > 1);
		const log = await page.evaluate(() => window.boutLog);
		assert(
			log.projectiles.includes("flight") && log.projectiles.includes("player"),
		);
		evidence.approach = log;
		await resetBout();
		await page.evaluate(observe);
		await start();
		await defeatWithBow();
	} else {
		await history(
			id === "courser" ? "forehoof strike hits" : "tail sweep hits",
		);
		assert((await hp()) < full);
		const log = await page.evaluate(() => window.boutLog);
		for (const clip of id === "courser"
			? ["HorseWalk", "PawLift", "PawStrike"]
			: ["BiteWindup", "Bite", "SweepWindup", "Sweep"])
			assert(log.clips.includes(clip), JSON.stringify(log.clips));
		await defeatWithBlade();
	}
	evidence.log = await page.evaluate(() => window.boutLog);
	evidence.victory = await hud.getByText(/Victory/).isVisible();
	await resetBout();
	await expect(btn("Begin bout")).toBeVisible();
	assert.equal(await hp(), full);
	assert.equal(await hp("Enemy health"), initialEnemy);
	if (id === "courser") {
		await page.evaluate(observe);
		await start();
		await history("prepares a forehoof strike");
		await page.keyboard.down("d");
		try {
			await history("forehoof strike misses.");
		} finally {
			await page.keyboard.up("d");
		}
		assert.equal(await hp(), full);
		evidence.sidestep = await page.evaluate(() => window.boutLog.messages);
		await resetBout();
	}
	if (id === "wyrm") {
		await page.evaluate(observe);
		await start();
		await page.keyboard.down("q");
		await history("Blocked.");
		assert.equal(await hp(), full);
		await history("tail sweep hits.");
		await page.keyboard.up("q");
		evidence.guardedSweepHealth = await hp();
		assert.equal(evidence.guardedSweepHealth, full - 28);
		await expect(meter("Player health")).toHaveAttribute("value", "0", {
			timeout: 45000,
		});
		await btn("Reset encounter").click();
		assert.equal(await hp(), full);
		evidence.resetAfterPlayerDefeat = true;
	}
	return evidence;
}
try {
	await page.goto("http://127.0.0.1:5194/");
	await page
		.locator("input[type=file]")
		.first()
		.setInputFiles(
			process.env.ARENA_PROJECT ?? "hollow-kingdom-combat-arena.project.json",
		);
	await btn("Play").click({ timeout: 20000 });
	if (!(await hud.count())) await btn("Play 3D Experimental").click();
	const bundle = (await readdir(resolve(roots[0], "assets"))).find((n) =>
		/^index-.*\.js$/.test(n),
	);
	const bundleSha256 = createHash("sha256")
		.update(await readFile(resolve(roots[0], "assets", bundle)))
		.digest("hex");
	for (const id of selected.length ? selected : cases) {
		const result = await run(id);
		assert.deepEqual(errors, []);
		await writeFile(
			resolve(output, `${id}.json`),
			`${JSON.stringify(
				{ browser: browser.version(), bundleSha256, ...result },
				null,
				2,
			)}\n`,
		);
		console.log(
			id,
			"passed",
			JSON.stringify(
				result.perf ??
					(result.id === "footwork"
						? {
								exposedHealth: result.exposedHealth,
								sidestepHealth: result.sidestepHealth,
							}
						: {
								spamHP: result.spam.playerHealth,
								defenceHP: result.defence.playerHealth,
							}),
			),
		);
	}
} catch (error) {
	console.error((await page.locator("body").innerText()).slice(-1900));
	console.error(
		await host.getAttribute("data-npcs", { timeout: 1000 }).catch(() => null),
		await page.evaluate(() => window.boutLog),
		errors,
	);
	await screenshot("failure");
	throw error;
} finally {
	await browser.close();
}
