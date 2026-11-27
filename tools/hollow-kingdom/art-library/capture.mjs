import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
	captureWorldBitmap,
	observeWorldCamera,
} from "../../../e2e/hollow-world-scale.mjs";

// Run against a test-mode Vite build. Both poses use the normal Play scene,
// camera lens, scene lights, renderer and loader; only the tripod is positioned.
const [build, edition] = process.argv.slice(2);
assert(
	build && ["before", "after"].includes(edition),
	"Usage: node capture.mjs <test build> before|after",
);
const roots = [resolve(build), resolve("public")];
const output = resolve("docs/assets/art-library/play");
await mkdir(output, { recursive: true });
const project = JSON.parse(
	await readFile("merewatch-art-study.project.json", "utf8"),
);
const families = [
	["mere-heron-well", "mere-well", "art-library/waterworks/heron-well", "well"],
	[
		"mere-tide-lantern",
		"mere-lantern",
		"art-library/waterworks/tide-lantern",
		"lantern",
	],
	[
		"mere-oswin-ferryman",
		"mere-ferryman",
		"art-library/humans/oswin",
		"ferryman",
	],
	[
		"chapter-blackwater-wyrm",
		"chapter-mere-drake",
		"art-library/creatures/blackwater-wyrm",
		"chapter-one/drake",
	],
	[
		"mere-road-mare",
		"mere-horse",
		"art-library/creatures/bracken-road-mare",
		"horse",
	],
	[
		"bell-tide-keeper",
		"bell-keeper",
		"art-library/humans/keeper/keeper",
		"bell-court/keeper",
	],
	[
		"mere-heron-hanger",
		"bell-hanger",
		"art-library/armoury/heron-hanger",
		"bell-court/hanger",
	],
];
if (edition === "before") {
	const original = new Map(families.map(([id, base]) => [id, base]));
	for (const def of [...project.npcs, ...project.objects]) {
		const v = def.threeVisual;
		if (original.has(v?.assetId)) v.assetId = original.get(v.assetId);
	}
	project.items.find((item) => item.id === "watch-sword").melee.weaponAssetId =
		"bell-hanger";
}
const expectedUrls = families.map(
	(f) => `/assets/hollow-kingdom/${f[edition === "before" ? 3 : 2]}.glb`,
);
const types = {
	".html": "text/html",
	".css": "text/css",
	".js": "text/javascript",
	".json": "application/json",
	".glb": "model/gltf-binary",
	".png": "image/png",
	".jpg": "image/jpeg",
	".woff2": "font/woff2",
	".wav": "audio/wav",
};
const browser = await chromium.launch({
	executablePath: process.env.HOLLOW_CHROME_PATH,
	args: [
		`--use-angle=${process.env.HOLLOW_ANGLE ?? "d3d11"}`,
		"--ignore-gpu-blocklist",
		"--enable-unsafe-swiftshader",
	],
});
try {
	const page = await browser.newPage({
		viewport: { width: 1360, height: 900 },
		deviceScaleFactor: 1,
	});
	const errors = [];
	const modelHashes = new Map();
	page.on("pageerror", (e) => errors.push(e.message));
	await page.addInitScript(observeWorldCamera);
	await page.route("http://127.0.0.1:5194/**", async (route) => {
		const url = new URL(route.request().url());
		const path = decodeURIComponent(url.pathname.slice(1)) || "index.html";
		const file = roots
			.map((root) => ({ root, file: resolve(root, path) }))
			.find((v) => v.file.startsWith(v.root + sep) && existsSync(v.file));
		if (!file) return route.fulfill({ status: 404 });
		if (expectedUrls.includes(url.pathname)) {
			const bytes = await readFile(file.file);
			modelHashes.set(
				url.pathname,
				createHash("sha256").update(bytes).digest("hex"),
			);
			return route.fulfill({ body: bytes, contentType: "model/gltf-binary" });
		}
		return route.fulfill({
			path: file.file,
			contentType: types[extname(path)],
		});
	});
	await page.goto("http://127.0.0.1:5194/");
	await page
		.locator("input[type=file]")
		.first()
		.setInputFiles({
			name: "study.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(project)),
		});
	const btn = (name) => page.getByRole("button", { name, exact: true });
	await btn("Play").click();
	const canvas = page.getByLabel("Three runtime viewport", { exact: true });
	if (!(await canvas.count())) await btn("Play 3D Experimental").click();
	await expect(canvas).toBeVisible({ timeout: 45_000 });
	await page.waitForFunction(
		() => {
			const a =
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot(
					"ThreeRuntimePanel",
				)?.asset;
			const npcs = JSON.parse(
				document.querySelector(".three-runtime-host")?.dataset.npcs ?? "[]",
			);
			return (
				a?.statusCounts.loading === 0 &&
				a.activeCloneInstances > 0 &&
				a.character.animation.loadingSourceCount === 0 &&
				[
					"oswin-at-the-well",
					"wyrm-on-the-bank",
					"keeper-by-the-cottage",
				].every((id) => npcs.some((n) => n.id === id && n.clipTime > 0))
			);
		},
		undefined,
		{ timeout: 85_000 },
	);
	const stats = await page.evaluate(() => {
		const a =
			window.__THREE_PERF_DIAGNOSTICS__.getSnapshot("ThreeRuntimePanel").asset;
		const actors = JSON.parse(
			document.querySelector(".three-runtime-host").dataset.npcs,
		);
		return {
			errorFallbacks: a.errorFallbackCount,
			clones: a.activeCloneInstances,
			mixers: a.character.animation.activeMixers,
			actors: actors
				.filter((n) =>
					[
						"oswin-at-the-well",
						"wyrm-on-the-bank",
						"keeper-by-the-cottage",
					].includes(n.id),
				)
				.map(({ id, clip, clipTime, position }) => ({
					id,
					clip,
					clipTime,
					position,
				})),
		};
	});
	assert.equal(stats.errorFallbacks, 0);
	const [oswin, wyrm, keeper] = [
		"oswin-at-the-well",
		"wyrm-on-the-bank",
		"keeper-by-the-cottage",
	].map((id) => stats.actors.find((a) => a.id === id));
	const [x, y, z] = oswin.position;
	const [wx, wy, wz] = wyrm.position;
	const [kx, ky, kz] = keeper.position;
	const poses = {
		"well-court": {
			eye: [x + 2.92, y + 1.81, z + 4.44],
			target: [x + 0.67, y + 1.51, z - 0.67],
			fov: 43,
		},
		ferryman: {
			eye: [x + 0.72, y + 1.73, z + 2.34],
			target: [x, y + 1.4, z],
			fov: 32,
		},
		wyrm: {
			eye: [wx - 3.9, wy + 1.15, wz + 3.22],
			target: [wx, wy + 0.94, wz],
			fov: 39,
		},
		keeper: {
			eye: [kx + 0.85, ky + 1.63, kz + 2.8],
			target: [kx, ky + 1.19, kz],
			fov: 36,
		},
	};
	for (const [name, pose] of Object.entries(poses)) {
		await writeFile(
			resolve(output, `${name}-${edition}.png`),
			await captureWorldBitmap(page, pose),
		);
	}
	await canvas.focus();
	await page.keyboard.press("i");
	await page.getByRole("button", { name: /^Equip/ }).click();
	await page.keyboard.press("i");
	await page.waitForFunction(
		() =>
			JSON.parse(
				document.querySelector(".three-runtime-host")?.dataset.weapon ?? "{}",
			).attached,
	);
	const weapon = await page.evaluate(() =>
		JSON.parse(document.querySelector(".three-runtime-host").dataset.weapon),
	);
	assert.equal(weapon.bone, "hand_r");
	assert.equal(weapon.equippedWeaponId, "watch-sword");
	await canvas.focus();
	await page.keyboard.press("f");
	await page.waitForFunction(
		() =>
			JSON.parse(document.querySelector(".three-runtime-host").dataset.weapon)
				.semanticState === "attack",
		undefined,
		{ polling: "raf" },
	);
	stats.weapon = {
		socket: weapon.bone,
		item: weapon.equippedWeaponId,
		attackClip: await page.evaluate(
			() =>
				JSON.parse(document.querySelector(".three-runtime-host").dataset.weapon)
					.activeClip,
		),
	};
	for (const url of expectedUrls)
		assert(modelHashes.has(url), `Missing game request ${url}`);
	await btn("Inspect").click();
	await canvas.focus();
	for (const [x, y] of [
		[21, 54],
		[28, 54],
		[28, 53],
	]) {
		await expect
			.poll(
				() =>
					page.evaluate(
						({ x, y }) => {
							const current = JSON.parse(
								document.querySelector(".three-runtime-hud").dataset
									.traversalTarget,
							);
							const dx = x - current.x,
								dy = y - current.y;
							if (Math.abs(dx) < 0.26 && Math.abs(dy) < 0.26) return true;
							const key =
								Math.abs(dx) >= 0.26
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
							window.dispatchEvent(new KeyboardEvent("keydown", options));
							window.dispatchEvent(new KeyboardEvent("keyup", options));
							return [current.x, current.y];
						},
						{ x, y },
					),
				{ timeout: 18_000, intervals: [110] },
			)
			.toBe(true);
	}
	await page.keyboard.press("e");
	await page.waitForFunction(
		() =>
			JSON.parse(document.querySelector(".three-runtime-host").dataset.weapon)
				.activeClip === "Ride",
		undefined,
		{ timeout: 8000 },
	);
	stats.mountedClip = "Ride";
	const mountedPose = {
		eye: [8.5, 3.4, 25.2],
		target: [6.5, 2.4, 22.8],
		fov: 46,
	};
	await writeFile(
		resolve(output, `bracken-${edition}.png`),
		await captureWorldBitmap(page, mountedPose),
	);
	poses.bracken = mountedPose;
	assert.deepEqual(errors, []);
	const assets = Object.fromEntries(
		expectedUrls.map((url) => [url, modelHashes.get(url)]),
	);
	await writeFile(
		resolve(output, `${edition}.json`),
		`${JSON.stringify(
			{ browser: browser.version(), assets, ...stats, poses, errors },
			null,
			"\t",
		)}\n`,
	);
	console.log(edition, JSON.stringify(stats));
} finally {
	await browser.close();
}
