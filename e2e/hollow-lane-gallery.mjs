import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { captureWorldBitmap } from "./hollow-world-scale.mjs";

// Additional cameras use Three world coordinates in the 44 x 60 village.
// The first view uses the unmodified third-person camera at the authored spawn.
const views = [
	{ name: "arrival" },
	{ name: "threshold", eye: [0.3, 2.05, 23.8], target: [-5.85, 2.35, 18.5] },
	{ name: "well", eye: [-0.2, 2.15, 17.7], target: [1.9, 1.8, 8.6] },
];

export async function captureCottageLane({
	page,
	ready,
	sample,
	output,
	id,
	position,
	canvas,
}) {
	const label = "ThreeRuntimePanel";
	await page.getByRole("button", { name: "Story", exact: true }).click();
	const started = performance.now();
	await page.getByRole("button", { name: /Test Flow$/ }).click();
	const initial = await ready(
		page,
		label,
		id === "green-road" ? "mere-road-stress" : "merewatch",
	);
	const readyMs = performance.now() - started;
	assert.equal(initial.asset.errorFallbackCount, 0);
	assert.equal(initial.raf.activeLoopCount, 1);
	if (id === "green-road") {
		const viewpoints = {
			overlook: {
				eye: [16.5, 13, -33.5],
				target: [-15.5, 1.5, -58.5],
				fov: 53,
			},
			causeway: { eye: [-34.5, 8, -41.5], target: [-8, 1.5, -59], fov: 53 },
		};
		for (const [name, pose] of Object.entries(viewpoints)) {
			await writeFile(
				resolve(output, `${id}-${name}.png`),
				await captureWorldBitmap(page, pose),
			);
		}
		return { readyMs, viewpoints };
	}
	await page.evaluate(() => {
		const renderer = window.hollowWorldRenderer.deref();
		window.laneCamera = window.hollowCamera.deref().clone();
		const draw = renderer.render.bind(renderer);
		// Read the displayed color buffer immediately after a real Play render.
		// Capturing before buffer discard also omits the surrounding editor DOM.
		renderer.render = (scene, camera) => {
			const active = window.laneCamera ?? camera;
			draw(scene, active);
			if (window.captureLaneFrame) {
				window.captureLaneFrame({
					png: renderer.domElement.toDataURL("image/png"),
					eye: active.position.toArray(),
					quaternion: active.quaternion.toArray(),
					fov: active.fov,
					width: renderer.domElement.width,
					height: renderer.domElement.height,
				});
				delete window.captureLaneFrame;
			}
		};
	});
	// Face the beacon with real input. The tripod stays at the canonical
	// spawn camera while the avatar takes the first step into the lane.
	await canvas(page).focus();
	await page.keyboard.down("w");
	try {
		await page.waitForFunction(
			() =>
				JSON.parse(
					document.querySelector(".three-runtime-hud").dataset.traversalTarget,
				).y <= 55,
			undefined,
			{ timeout: 10000, polling: "raf" },
		);
	} finally {
		await page.keyboard.up("w");
	}
	const shots = {};
	for (const view of views) {
		await page.evaluate(({ eye, target }) => {
			if (eye) {
				const camera = window.hollowCamera.deref().clone();
				camera.position.fromArray(eye);
				camera.lookAt(...target);
				camera.updateMatrixWorld(true);
				window.laneCamera = camera;
			}
		}, view);
		await page.waitForTimeout(450);
		const sampled = await sample(page, label);
		assert.ok(sampled.intervals.count >= 30);
		const { png, ...pose } = await page.evaluate(
			() =>
				new Promise((resolveFrame) => {
					window.captureLaneFrame = resolveFrame;
				}),
		);
		await writeFile(
			resolve(output, `${id}-${view.name}.png`),
			Buffer.from(png.split(",")[1], "base64"),
		);
		shots[view.name] = {
			pose,
			intervals: sampled.intervals,
			view: sampled.view,
			gpuMs: sampled.gpuMs,
			renderer: sampled.snapshot.renderer,
			shadowFrames: sampled.shadowFrames,
			shadowDraws: sampled.shadowDraws,
		};
	}
	await page.evaluate(() => {
		delete window.laneCamera;
	});
	const start = await position(page);
	await canvas(page).focus();
	await page.keyboard.down("w");
	try {
		await page.waitForFunction(
			(y) => {
				const { traversalTarget } =
					document.querySelector(".three-runtime-hud").dataset;
				return JSON.parse(traversalTarget).y <= y - 8;
			},
			start.y,
			{ timeout: 12000, polling: "raf" },
		);
	} finally {
		await page.keyboard.up("w");
	}
	const resources = await page.evaluate(() => {
		const renderer = window.hollowWorldRenderer.deref();
		const handles = new Set();
		const sizes = {};
		let baseRgba8Bytes = 0;
		const record = (texture) => {
			if (!texture?.isTexture) return;
			const handle = renderer.properties.get(texture).__webglTexture;
			const width = texture.image?.width;
			const height = texture.image?.height;
			if (!handle || handles.has(handle) || !width || !height) return;
			handles.add(handle);
			const size = `${width}x${height}`;
			sizes[size] = (sizes[size] ?? 0) + 1;
			baseRgba8Bytes += width * height * 4;
		};
		window.hollowScene.deref().traverse((node) => {
			for (const material of [node.material].flat()) {
				if (!material) continue;
				for (const value of Object.values(material)) record(value);
				for (const uniform of Object.values(material.uniforms ?? {}))
					record(uniform.value);
			}
		});
		return {
			batching: JSON.parse(
				renderer.domElement.dataset.sceneryBatching ?? "null",
			),
			materialTextureHandles: handles.size,
			sizes,
			baseRgba8Bytes,
		};
	});
	const end = await position(page);
	let editedPlacement;
	if (id === "merewatch-art") {
		await page
			.getByRole("button", { name: "Back to Edit", exact: true })
			.click();
		await page.getByRole("button", { name: "Map Editor", exact: true }).click();
		await page.getByRole("button", { name: "3D View", exact: true }).click();
		const walls = page.getByRole("option", {
			name: "Dry-stone Dyke object",
			exact: true,
		});
		await expect(walls.nth(1)).toBeVisible();
		await walls.nth(1).click();
		const axis = page.getByLabel("Position X", { exact: true });
		const neighbor = await axis.inputValue();
		await walls.first().click();
		const original = await axis.inputValue();
		const moved = String(Number(original) + 0.25);
		await axis.fill(moved);
		await axis.press("Tab");
		await walls.nth(1).click();
		await expect(axis).toHaveValue(neighbor);
		await walls.first().click();
		await expect(axis).toHaveValue(moved);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await expect(axis).toHaveValue(original);
		editedPlacement = { original, moved, neighbor, undo: true };
	}
	return { readyMs, start, end, shots, resources, editedPlacement };
}
