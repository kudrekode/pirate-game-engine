import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";

// The pacing-only repeat uses the application's ordinary frame callback.
// Read the active camera direction for deterministic input; skip shadow hooks,
// GL timers, draw-list enumeration and scene-world transform instrumentation.
export function observeWorldCamera() {
	const events = new EventTarget();
	window.__THREE_DEVTOOLS__ = events;
	events.addEventListener("observe", ({ detail: renderer }) => {
		if (!renderer.isWebGLRenderer) return;
		window.hollowWorldRenderer = new WeakRef(renderer);
		const draw = renderer.render.bind(renderer);
		renderer.render = (scene, camera) => {
			if (window.hollowCamera?.deref() !== camera)
				window.hollowCamera = new WeakRef(camera);
			draw(scene, camera);
		};
	});
}

export async function captureWorldBitmap(page, pose) {
	// Read the true displayed color buffer immediately after a render; the
	// driver can discard it after the callback returns. HUD belongs to the DOM.
	const png = await page.evaluate(
		(pose) =>
			new Promise((resolvePng) => {
				const renderer = window.hollowWorldRenderer.deref();
				const draw = renderer.render;
				renderer.render = function (scene, camera) {
					this.render = draw;
					const shot = pose ? camera.clone() : camera;
					if (pose) {
						shot.position.fromArray(pose.eye);
						shot.lookAt(...pose.target);
						shot.fov = pose.fov;
						shot.updateProjectionMatrix();
						shot.updateMatrixWorld(true);
					}
					draw.call(this, scene, shot);
					resolvePng(this.domElement.toDataURL("image/png"));
				};
			}),
		pose,
	);
	return Buffer.from(png.split(",")[1], "base64");
}

// Hook the same loader the bundle imports. Parse timings are wall time with
// overlapping async dependencies. Pre-importing its JS precedes the Play timer.
async function timeModelParsing(page, build) {
	const files = await readdir(resolve(build, "assets"));
	const loader = files.find((name) => /^GLTFLoader-.+\.js$/.test(name));
	assert.ok(
		loader,
		"Expected a Vite test build containing the GLTFLoader module",
	);
	await page.evaluate(async (url) => {
		const { GLTFLoader } = await import(url);
		const parse = GLTFLoader.prototype.parse;
		window.worldModelParses = [];
		window.hollowWorldScale = true;
		GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
			const start = performance.now();
			return parse.call(
				this,
				data,
				path,
				(result) => {
					window.worldModelParses.push({
						name: result.scene.name,
						bytes: data.byteLength,
						ms: performance.now() - start,
					});
					onLoad(result);
				},
				onError,
			);
		};
	}, `/assets/${loader}`);
}

export async function measureWorldScale({
	page,
	cdp,
	fixture,
	data,
	checkpoint,
	build,
	captureWorldView,
	ready,
	sample,
	memory,
	position,
	inspect,
	canvas,
}) {
	const label = "ThreeRuntimePanel";
	const button = (name) => page.getByRole("button", { name, exact: true });
	data.fixture = {
		...fixture.counts,
		sha256: createHash("sha256")
			.update(JSON.stringify(fixture.project))
			.digest("hex"),
	};
	await button("Story").click();
	await timeModelParsing(page, build);
	const play = () => page.getByRole("button", { name: /Test Flow$/ }).click();
	async function open() {
		const started = performance.now();
		// A genuine renderer exception should identify the failed stage directly.
		const { promise, reject } = Promise.withResolvers();
		page.on("pageerror", reject);
		let snapshot;
		try {
			snapshot = await Promise.race([
				promise,
				play().then(() => ready(page, label, fixture.areaId)),
			]);
		} finally {
			page.off("pageerror", reject);
		}
		assert.equal(snapshot.raf.activeLoopCount, 1);
		assert.equal(snapshot.asset.errorFallbackCount, 0);
		if (data.fieldStudy) {
			assert.equal(snapshot.asset.missingFallbackCount, 0);
			const placed = new Set(
				fixture.project.areas[0].objects.map(
					(object) => object.objectDefinitionId,
				),
			);
			for (const definition of fixture.project.objects) {
				const id = definition.threeVisual?.assetId;
				if (placed.has(definition.id) && id?.startsWith("mere-lane-"))
					assert.ok(
						snapshot.asset.activeImportedAssetIds.includes(id),
						`Expected loaded scenery: ${id}`,
					);
			}
		}
		return {
			readyMs: performance.now() - started,
			scene: snapshot.scene,
			terrain: snapshot.terrain,
			renderer: snapshot.renderer,
		};
	}
	data.cold = await open();
	if (data.fieldStudy) {
		const surface = await canvas(page).evaluate((node) => {
			const size = node.getBoundingClientRect();
			return {
				css: { width: size.width, height: size.height },
				buffer: { width: node.width, height: node.height },
				dpr: window.devicePixelRatio,
				scenery: JSON.parse(node.dataset.sceneryBatching),
			};
		});
		assert.ok(surface.buffer.width > 0 && surface.buffer.height > 0);
		assert.equal(surface.scenery.enabled, data.fieldStudy.batching !== "off");
		assert.equal(
			surface.scenery.mode,
			data.fieldStudy.batching === "on" ? "lod" : data.fieldStudy.batching,
		);
		assert.equal(surface.scenery.markers > 0, surface.scenery.enabled);
		data.fieldStudy.surface = surface;
		// Loading can finish ahead of the driver's first shaded frames. Track
		// this cost separately from the settled input budget, including stalls.
		const started = performance.now();
		await page.evaluate(
			() =>
				new Promise((done) => {
					let frames = 0;
					const settle = () => {
						if (++frames === 30) done();
						else requestAnimationFrame(settle);
					};
					requestAnimationFrame(settle);
				}),
		);
		data.fieldStudy.settle30FramesMs = performance.now() - started;
	}
	data.parses = await page.evaluate(() => window.worldModelParses);
	assert.ok(data.parses.length > 0);
	const start = await position(page);
	assert.ok(
		Math.abs(start.x - fixture.spawn.x) < 0.1 &&
			Math.abs(start.y - fixture.spawn.y) < 0.1,
		"Expected to spawn on the survey road",
	);
	await checkpoint("world ready");
	// Diagnostic A/B only. The existing shadow cache orders its verified fixed
	// scenery roots before the cache marker. Keep animated and moving roots live.
	if (process.argv.includes("--world-fixed-matrices")) {
		data.fixedMatrixTrial = await page.evaluate(() => {
			const scene = window.hollowScene.deref();
			const boundary = scene.children.findIndex(
				(node) => node.name === "Static scenery shadow cache",
			);
			if (boundary < 1)
				throw new Error("Expected an active static scenery cache");
			scene.updateMatrixWorld(true);
			scene.matrixAutoUpdate = false;
			let nodes = 0;
			for (const group of scene.children.slice(0, boundary)) {
				group.traverse((node) => {
					if (node.isSkinnedMesh || node.isBone || node.animations.length)
						throw new Error("Unexpected animated scenery");
					node.matrixAutoUpdate = false;
					nodes++;
				});
			}
			return { groups: boundary, nodes };
		});
	}
	if (process.argv.includes("--world-phases")) {
		await page.evaluate(() => {
			const scene = window.hollowScene.deref();
			const list = window.hollowWorldRenderer.deref().renderLists.get(scene, 0);
			// Instrument top-level calls only. No per-mesh clocks in the render path.
			const matrix = scene.updateMatrixWorld;
			scene.updateMatrixWorld = function (...args) {
				const start = performance.now();
				const result = matrix.apply(this, args);
				if (window.worldPhases)
					window.worldPhases.matrices += performance.now() - start;
				return result;
			};
			const begin = list.init;
			const finish = list.finish;
			let projectionStart = 0;
			list.init = function (...args) {
				const result = begin.apply(this, args);
				projectionStart = performance.now();
				return result;
			};
			list.finish = function (...args) {
				const result = finish.apply(this, args);
				if (window.worldPhases) {
					window.worldPhases.projection += performance.now() - projectionStart;
					window.worldPhases.frames++;
				}
				return result;
			};
			window.worldPhases = { matrices: 0, projection: 0, frames: 0 };
		});
	}
	async function travel(name, toY, key) {
		const from = await position(page);
		await page.evaluate(() => {
			if (window.worldPhases)
				window.worldPhases = { matrices: 0, projection: 0, frames: 0 };
		});
		data.runtime[name] = await sample(page, label, async () => {
			await canvas(page).focus();
			await page.keyboard.down(key);
			try {
				await page.waitForFunction(
					(y) => {
						const raw =
							document.querySelector(".three-runtime-hud")?.dataset
								.traversalTarget;
						return raw && JSON.parse(raw).y >= y;
					},
					toY,
					{ timeout: Math.max(15000, (toY - from.y) * 800) },
				);
			} finally {
				await page.keyboard.up(key);
			}
		});
		const to = await position(page);
		data.runtime[name].route = { from, to };
		data.runtime[name].traversalCpu = await page.evaluate(
			() => window.worldPhases,
		);
		assert.ok(
			Math.abs(to.x - from.x) < 1.1 && to.y >= toY,
			`Stay on the road during ${name}`,
		);
		await checkpoint(name);
	}
	// The default third-person camera faces along local -Z. Both directions
	// below use ordinary camera-relative input on the same southbound road.
	const southboundKey = () =>
		page.evaluate(() =>
			window.hollowCamera.deref().matrixWorld.elements[10] < 0 ? "w" : "s",
		);
	const forwardKey = await southboundKey();
	if (data.fieldStudy)
		assert.equal(forwardKey, "w", "Face into the valley at spawn");
	await travel("followWalk", 11.8, forwardKey);
	await page.waitForTimeout(350);
	await canvas(page).focus();
	await page.keyboard.press("e");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		/E dismounts/i,
		{ timeout: 3500 },
	);
	await travel("ride", 37, forwardKey);
	await inspect(page);
	const viewport = canvas(page);
	await viewport.hover();
	await page.keyboard.down("Alt");
	await page.mouse.down();
	try {
		data.runtime.orbit = await sample(page, label, async () => {
			for (let index = 0; index < 55; index++) {
				await page.mouse.move(
					480 + 130 * Math.sin(index / 10),
					310 + 22 * Math.cos(index / 10),
				);
				await page.waitForTimeout(35);
			}
		});
	} finally {
		await page.mouse.up();
		await page.keyboard.up("Alt");
	}
	// Compare the same local route and orbit at each scale before continuing
	// to the far boundary on a real, uninterrupted mounted journey.
	await button("Follow Player").click();
	await page.waitForTimeout(750);
	const rideKey = await southboundKey();
	if (data.fieldStudy)
		assert.equal(rideKey, "w", "Ride forward down the valley");
	await travel("farRide", fixture.counts.height - 8, rideKey);
	if (data.fieldStudy) {
		await inspect(page);
		await page.waitForTimeout(300);
		const yaw = await page.evaluate(() => {
			const m = window.hollowCamera.deref().matrixWorld.elements;
			return Math.atan2(m[8], m[10]);
		});
		// Inspect uses 0.005 radians per horizontal pointer pixel. Turn back
		// over the entire road via a real Alt-drag from the settled follow rig.
		const dx = -yaw / 0.005;
		const bounds = await viewport.boundingBox();
		const x = bounds.x + bounds.width * (dx < 0 ? 0.67 : 0.33);
		const y = bounds.y + bounds.height * 0.78;
		assert.ok(
			await viewport.evaluate(
				(canvas, point) =>
					document.elementFromPoint(point.x, point.y) === canvas,
				{ x, y },
			),
			"Start the orbit on the canvas clear of the runtime HUD",
		);
		await page.mouse.move(x, y);
		await page.keyboard.down("Alt");
		await page.mouse.down();
		try {
			data.runtime.farTurn = await sample(page, label, async () => {
				for (let i = 1; i <= 48; i++) {
					await page.mouse.move(x + (dx * i) / 48, y);
					await page.waitForTimeout(32);
				}
			});
		} finally {
			await page.mouse.up();
			await page.keyboard.up("Alt");
		}
		await page.waitForTimeout(450);
		data.fieldStudy.farCamera = await page.evaluate(() => {
			const camera = window.hollowCamera.deref();
			return {
				eye: camera.position.toArray(),
				quaternion: camera.quaternion.toArray(),
				fov: camera.fov,
				north: camera.matrixWorld.elements[10],
			};
		});
		assert.ok(
			data.fieldStudy.farCamera.north > 0.85,
			"Look back north over the road",
		);
		data.runtime.farView = await sample(page, label);
		if (
			data.fieldStudy.batching === "on" &&
			fixture.counts.height >= 120 &&
			data.runtime.farView.view
		)
			assert.ok(
				data.runtime.farView.view.submittedProxyTrees > 0,
				"Submit distant tree representatives on the long view",
			);
		if (data.runtime.farView.view)
			assert.ok(
				data.runtime.farView.view.maxVisibleMarkers >
					fixture.counts.objects * 0.3,
				"Far vista submits the valley",
			);
		data.runtime.farView.position = await position(page);
		await checkpoint("farView");
	}
	data.playHeap = await memory(cdp);
	if (captureWorldView && data.fieldStudy) {
		const { width, height } = fixture.counts;
		const eye = [
			Math.floor(width / 2) - width / 2 + 0.5,
			4.2,
			height / 2 - 2.1,
		];
		const road = { eye, target: [eye[0], 2.2, eye[2] - 12], fov: 55 };
		const area = fixture.project.areas[0];
		const trees = area.objects
			.filter((object) =>
				["mere-spruce", "mere-lane-ash"].includes(object.objectDefinitionId),
			)
			.map((object) => {
				const offset = object.transform?.position;
				const x = object.x - width / 2 + 0.5 + (offset?.x ?? 0);
				const z = object.y - height / 2 + 0.5 + (offset?.z ?? 0);
				const terrainHeight =
					area.terrainHeights.find(
						(tile) => tile.x === object.x && tile.y === object.y,
					)?.height ?? 0;
				return {
					id: object.id,
					target: [x, terrainHeight + 2.3, z],
					distance: Math.hypot(x - eye[0], z - eye[2]),
				};
			})
			.filter((tree) => tree.target[2] < eye[2] - 25)
			.sort((a, b) => Math.abs(a.distance - 42) - Math.abs(b.distance - 42));
		const tree = trees[0];
		const detail = { eye, target: tree.target, fov: 28 };
		data.fieldStudy.tripods = {
			road,
			detail,
			tree: tree.id,
			distance: tree.distance,
		};
		await captureWorldView("far-road", road);
		await captureWorldView("tree-detail", detail);
	} else await captureWorldView?.("far-road");
	await button("Back to Edit").click();
	data.editHeap = await memory(cdp);
	data.warm = await open();
	data.warmHeap = await memory(cdp);
	data.warmParses = await page.evaluate(
		(prior) => window.worldModelParses.length - prior,
		data.parses.length,
	);
	await captureWorldView?.("entrance");
}
