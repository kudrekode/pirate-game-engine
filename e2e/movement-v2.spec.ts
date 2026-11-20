import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type { ThreePerformanceSnapshot } from "../src/runtime/three/threePerformanceDiagnostics";

test.use({
	channel: "chrome",
	viewport: { width: 1280, height: 900 },
	trace: process.env.CAMERA_REVIEW_LABEL
		? "off"
		: { mode: "retain-on-failure", screenshots: false, snapshots: true },
	video: process.env.CAMERA_REVIEW_LABEL
		? { mode: "on", size: { width: 1280, height: 900 } }
		: "off",
});
const output = process.env.MOVEMENT_REVIEW_OUTPUT ?? "docs/assets/movement-v2";

test("sky-look, recovery, elevated supports and tight walls @camera-v4-orbit", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const directory = "test-results/camera-v4";
	await fs.mkdir(directory, { recursive: true });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("movement-v2-demo.project.json");
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const canvas = page.getByLabel("Three runtime viewport", { exact: true });
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
			{ timeout: 30000 },
		)
		.toBe(0);
	const camera = async () =>
		JSON.parse(
			(await page
				.locator(".three-runtime-host")
				.getAttribute("data-camera-feel"))!,
		);
	const locked = () => page.evaluate(() => !!document.pointerLockElement);
	let mx = 640,
		my = 450;
	const capture = async () => {
		await canvas.click();
		await expect.poll(locked).toBe(true);
		const box = (await canvas.boundingBox())!;
		mx = box.x + box.width / 2;
		my = box.y + box.height / 2;
	};
	const look = async (pitch: number, steps = 30, yaw?: number) => {
		const before = await camera();
		my += (pitch - before.pitch) / 0.18;
		if (yaw !== undefined) mx += (yaw - before.yaw) / 0.22;
		await page.mouse.move(mx, my, { steps });
		await page.waitForTimeout(450);
		expect((await camera()).pitch).toBeCloseTo(pitch, 0);
	};
	const evidence: unknown[] = [];
	const sky = async (name: string) => {
		await look(-82);
		const c = await camera(),
			p = await position(page);
		const ray = {
			x: c.actual.lookAt.x - c.actual.position.x,
			y: c.actual.lookAt.y - c.actual.position.y,
			z: c.actual.lookAt.z - c.actual.position.z,
		};
		expect(
			(Math.atan2(ray.y, Math.hypot(ray.x, ray.z)) * 180) / Math.PI,
		).toBeGreaterThan(80);
		expect(c.actual.position.y).toBeGreaterThan(p.supportHeight + 0.21);
		await page.screenshot({ path: `${directory}/${name}.png` });
		evidence.push({ name, camera: c, player: p });
	};
	const route = async (x: number, y: number) => {
		if (await locked()) await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Inspect", exact: true }).click();
		await go(page, x, y);
	};
	const follow = async () => {
		await page
			.getByRole("button", { name: "Follow Player", exact: true })
			.click();
		await capture();
	};
	const before = await snapshot(page);
	await capture();
	await page.screenshot({ path: `${directory}/normal.png` });
	await look(-35);
	await page.screenshot({ path: `${directory}/upward.png` });
	await sky("flat-sky");
	await look(18, 1);
	await page.screenshot({ path: `${directory}/recovered.png` });
	await sky("flat-sky-again");
	await look(18, 80);
	await sky("moving-start");
	for (const sprint of [false, true]) {
		const from = await target(page);
		if (sprint) await page.keyboard.down("Shift");
		await page.keyboard.down("w");
		await page.waitForTimeout(220);
		await state(page, sprint ? "run" : "walk");
		await page.keyboard.press("Space");
		await expect
			.poll(async () => (await position(page)).motion.phase)
			.not.toBe("grounded");
		await page.keyboard.up("w");
		if (sprint) await page.keyboard.up("Shift");
		await expect
			.poll(async () => (await position(page)).motion.phase)
			.toBe("grounded");
		const to = await target(page);
		expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThan(0.2);
	}
	await route(6.8, 13);
	await route(8, 13);
	await page.keyboard.press("ArrowUp");
	await follow();
	await look(-82, 30, 0);
	await page.keyboard.down("w");
	await page.waitForTimeout(600);
	await page.keyboard.up("w");
	await page.waitForTimeout(200);
	expect((await position(page)).supportHeight).toBeGreaterThan(1.5);
	await sky("stairs-sky");
	await route(8, 13);
	await route(6.8, 14);
	await route(13.6, 8);
	await follow();
	await look(-35, 30, 90);
	await page.screenshot({ path: `${directory}/wall-upward.png` });
	expect((await camera()).clearance).toBeLessThan(0.95);
	await sky("wall-sky");
	await look(18, 30, -90);
	await page.waitForTimeout(800);
	expect((await camera()).clearance).toBeGreaterThan(0.99);
	await route(1.4, 8);
	await follow();
	expect((await position(page)).supportHeight).toBeLessThan(1);
	await sky("slope-sky");
	await route(10.8, 12);
	await page.keyboard.press("Space");
	await page.waitForTimeout(220);
	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(270);
	await page.keyboard.up("ArrowRight");
	await page.waitForTimeout(700);
	expect((await position(page)).supportHeight).toBeGreaterThan(1.6);
	await follow();
	await sky("platform-sky");
	const after = await snapshot(page);
	expect(after.scene.buildCount).toBe(before.scene.buildCount);
	expect(after.raf.activeLoopCount).toBe(1);
	expect(after.raf.loopStartCount).toBe(before.raf.loopStartCount);
	expect(after.asset.cloneCount).toBe(before.asset.cloneCount);
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${directory}/orbit.json`,
		JSON.stringify({ evidence, before, after, errors }, null, 2),
	);
});

// Opt-in comparable real-input motion, separate from the traversal route below.
test.describe("third-person camera feel", () => {
	test("stairs and tight prop navigation with Follow Player controls @camera-v3-obstacles", async ({
		page,
	}) => {
		test.setTimeout(240_000);
		const directory = "test-results/camera-v3/obstacles";
		await fs.mkdir(directory, { recursive: true });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/");
		await page.getByRole("button", { name: /Blank Project/ }).click();
		await page
			.locator('input[type="file"]')
			.setInputFiles("movement-v2-demo.project.json");
		await page.getByRole("button", { name: "3D View", exact: true }).click();
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect
			.poll(
				async () =>
					(await snapshot(page)).asset.character.animation.loadingSourceCount,
				{ timeout: 30_000 },
			)
			.toBe(0);
		const canvas = page.getByLabel("Three runtime viewport", { exact: true });
		const inspect = () =>
			page.getByRole("button", { name: "Inspect", exact: true }).click();
		const follow = async () => {
			await page
				.getByRole("button", { name: "Follow Player", exact: true })
				.click();
			await canvas.focus();
		};
		const held = async (key: string, ms: number) => {
			const from = await target(page);
			await page.keyboard.down(key);
			await page.waitForTimeout(ms);
			await page.keyboard.up(key);
			await page.waitForTimeout(90);
			const to = await target(page);
			expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThan(0.2);
			return to;
		};
		await inspect();
		await go(page, 6.8, 13);
		await go(page, 8, 13);
		await page.keyboard.press("ArrowUp"); // face the stair approach with ordinary input
		await follow();
		await page.getByRole("button", { name: "Recenter", exact: true }).click();
		await page.waitForTimeout(250);
		await canvas.focus();
		await held("KeyW", 600);
		const stairs = await position(page);
		expect(stairs.supportHeight).toBeGreaterThan(1.5);
		expect(stairs.motion.phase).toBe("grounded");
		await page.screenshot({ path: `${directory}/stairs.png` });
		await held("KeyS", 900);
		expect((await position(page)).supportHeight).toBeCloseTo(1, 2);
		await inspect();
		await go(page, 6.8, 14); // pass south of the separate jump-only platform
		await go(page, 18, 8.2);
		await follow(); // camera remains north-facing; WASD now follows that visible basis
		const crate = [];
		for (const [key, ms] of [
			["KeyD", 600],
			["KeyW", 650],
			["KeyA", 600],
			["KeyS", 650],
		] as const)
			crate.push(await held(key, ms));
		await page.screenshot({ path: `${directory}/crate.png` });
		await inspect();
		await go(page, 21, 4.2);
		await go(page, 20, 4.2);
		await follow();
		const rock = [];
		for (const [key, ms] of [
			["KeyD", 240],
			["KeyS", 480],
			["KeyA", 480],
			["KeyW", 480],
			["KeyD", 240],
		] as const)
			rock.push(await held(key, ms));
		await page.screenshot({ path: `${directory}/rock.png` });
		expect(errors).toEqual([]);
		await fs.writeFile(
			`${directory}/acceptance.json`,
			JSON.stringify({ stairs, crate, rock, errors }, null, 2),
		);
	});

	test("orbit, reversal, sprint, jump and wall motion @camera-v3", async ({
		page,
	}, testInfo) => {
		test.setTimeout(240_000);
		const label = process.env.CAMERA_REVIEW_LABEL ?? "after";
		const directory = `test-results/camera-v3/${label}`;
		await fs.mkdir(directory, { recursive: true });
		await page.goto("/");
		await page.getByRole("button", { name: /Blank Project/ }).click();
		await page
			.locator('input[type="file"]')
			.setInputFiles("movement-v2-demo.project.json");
		await page.getByRole("button", { name: "3D View", exact: true }).click();
		await page.getByRole("button", { name: "Play", exact: true }).click();
		const canvas = page.getByLabel("Three runtime viewport", { exact: true });
		await expect
			.poll(
				async () =>
					(await snapshot(page)).asset.character.animation.loadingSourceCount,
				{ timeout: 30_000 },
			)
			.toBe(0);
		await observe(page);
		const before = await snapshot(page);
		const cameraFeel = async () =>
			JSON.parse(
				(await page
					.locator(".three-runtime-host")
					.getAttribute("data-camera-feel"))!,
			);
		const marks: { action: string; time: number; position: Sample }[] = [];
		const mark = async (action: string) =>
			marks.push({
				action,
				time: await page.evaluate(() => performance.now()),
				position: await position(page),
			});
		const orbit = async (dx: number, dy = 0) => {
			const box = (await canvas.boundingBox())!;
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.move(
				box.x + box.width / 2 + dx,
				box.y + box.height / 2 + dy,
				{ steps: 30 },
			);
			await page.keyboard.press("Escape");
		};
		await canvas.focus();
		await mark("walk + orbit");
		await page.keyboard.down("KeyW");
		await page.waitForTimeout(350);
		await orbit(250);
		await page.waitForTimeout(450);
		await page.keyboard.up("KeyW");
		const heldFacing =
			label === "before" ? null : (await cameraFeel()).desiredFacing;
		await mark("release + press W again");
		await page.keyboard.down("KeyW");
		await page.waitForTimeout(300);
		await page.keyboard.up("KeyW");
		if (heldFacing) {
			const fresh = (await cameraFeel()).desiredFacing;
			expect(heldFacing.x * fresh.x + heldFacing.y * fresh.y).toBeGreaterThan(
				0.995,
			);
		}
		await mark("strafe / reversal / diagonals");
		const strafeYaw = label === "before" ? null : (await cameraFeel()).yaw;
		for (const keys of [
			["KeyA"],
			["KeyD"],
			["KeyS"],
			["KeyW", "KeyD"],
			["KeyS", "KeyA"],
		]) {
			for (const key of keys) await page.keyboard.down(key);
			await page.waitForTimeout(280);
			for (const key of keys) await page.keyboard.up(key);
		}
		if (strafeYaw !== null)
			expect((await cameraFeel()).yaw).toBeCloseTo(strafeYaw, 2);
		await mark("sprint turn");
		await page.keyboard.down("ShiftLeft");
		await page.keyboard.down("KeyW");
		await orbit(-250);
		await page.waitForTimeout(450);
		await page.keyboard.up("ShiftLeft");
		await page.waitForTimeout(300);
		await mark("jump + orbit");
		await page.keyboard.press("Space");
		await orbit(180, -90);
		await page.waitForTimeout(900);
		await page.keyboard.up("KeyW");
		await mark("attack + movement recovery");
		await page.keyboard.press("KeyF");
		await page.keyboard.down("KeyD");
		await page.waitForTimeout(850);
		await page.keyboard.up("KeyD");
		await page.getByRole("button", { name: "Inspect", exact: true }).click();
		await go(page, 13.6, 8);
		await page
			.getByRole("button", { name: "Follow Player", exact: true })
			.click();
		await page.getByRole("button", { name: "Recenter", exact: true }).click();
		await canvas.focus();
		await mark("wall obstruction orbit");
		await orbit(600);
		await page.waitForTimeout(600);
		await page.screenshot({ path: `${directory}/wall.png` });
		if (label !== "before") {
			expect((await cameraFeel()).clearance).toBeLessThan(0.9);
			await orbit(-600);
			await page.waitForTimeout(1000);
			expect((await cameraFeel()).clearance).toBeGreaterThan(0.99);
		}
		const after = await snapshot(page);
		expect(after.scene.buildCount).toBe(before.scene.buildCount);
		expect(after.raf.activeLoopCount).toBe(1);
		expect(after.asset.cloneCount).toBe(before.asset.cloneCount);
		await fs.writeFile(
			`${directory}/motion.json`,
			JSON.stringify(
				{
					marks,
					observations: await page.evaluate(() => window.__movementV2),
					before,
					after,
				},
				null,
				2,
			),
		);
		await testInfo.attach(`${label}-motion`, {
			path: `${directory}/motion.json`,
			contentType: "application/json",
		});
	});
});
type Sample = {
	camera?: unknown;
	x: number;
	y: number;
	height: number;
	supportHeight: number;
	moving: boolean;
	motion: {
		phase: string;
		sprinting: boolean;
		speed: number;
		verticalVelocity: number;
	};
};
declare global {
	interface Window {
		__movementV2: {
			samples: (Sample & { state: string; time: number })[];
			states: string[];
		};
	}
}
async function position(page: Page): Promise<Sample> {
	return JSON.parse(
		(await page.locator(".three-runtime-host").getAttribute("data-traversal"))!,
	);
}
async function target(
	page: Page,
): Promise<{ x: number; y: number; height: number }> {
	return JSON.parse(
		(await page
			.locator(".three-runtime-hud")
			.getAttribute("data-traversal-target"))!,
	);
}
async function snapshot(page: Page): Promise<ThreePerformanceSnapshot> {
	return page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
}
async function observe(page: Page) {
	await page.evaluate(() => {
		window.__movementV2 = { samples: [], states: [] };
		const sample = () => {
			const host = document.querySelector<HTMLElement>(".three-runtime-host");
			if (!host) return;
			const p = JSON.parse(host.dataset.traversal ?? "null");
			const state =
				window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel")
					?.asset.character.animation.playerState;
			if (p && state) {
				if (!window.__movementV2.states.includes(state))
					window.__movementV2.states.push(state);
				if (window.__movementV2.samples.length < 12000)
					window.__movementV2.samples.push({
						...p,
						camera: JSON.parse(host?.dataset.cameraFeel ?? "null"),
						state,
						time: performance.now(),
					});
			}
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	});
}
async function state(page: Page, expected: string) {
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-weapon")) ?? "{}",
				).semanticState,
		)
		.toBe(expected);
}
async function go(page: Page, x: number, y: number) {
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	console.log("Movement route", x, y, await target(page));
	for (const axis of ["x", "y"] as const) {
		let reached = false;
		for (let i = 0; i < 150; i++) {
			const before = await target(page),
				delta = (axis === "x" ? x : y) - before[axis];
			if (Math.abs(delta) < 0.12) {
				reached = true;
				break;
			}
			await page.keyboard.press(
				axis === "x"
					? delta > 0
						? "ArrowRight"
						: "ArrowLeft"
					: delta > 0
						? "ArrowDown"
						: "ArrowUp",
			);
			await page.waitForTimeout(85);
		}
		expect(
			reached,
			`real-input route reaches ${axis} ${axis === "x" ? x : y}: ${JSON.stringify(await target(page))}`,
		).toBe(true);
	}
	await page.waitForTimeout(100);
}

test("Walk Run Jump Fall Land collision combat and grounded Continue via real input @movement-v2", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [],
		requests: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("request", (r) => {
		if (r.url().endsWith(".glb")) requests.push(r.url());
	});
	await page.goto("/");
	if (await page.getByRole("button", { name: /Blank Project/ }).isVisible())
		await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("movement-v2-demo.project.json");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const authored = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const canvas = page.getByLabel("Three runtime viewport", { exact: true });
	await canvas.focus();
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
		)
		.toBe(0);
	await expect
		.poll(
			async () => (await snapshot(page)).asset.character.animation.activeMixers,
		)
		.toBe(2);
	await state(page, "idle");
	await observe(page);
	const before = await snapshot(page),
		requestCount = requests.length;
	await page.screenshot({ path: `${output}/gameplay-idle.png` });
	await page.keyboard.down("KeyW");
	await page.waitForTimeout(400);
	await state(page, "walk");
	const walkSpeed = (await position(page)).motion.speed;
	await page.keyboard.down("ShiftLeft");
	await page.waitForTimeout(400);
	await state(page, "run");
	const runSpeed = (await position(page)).motion.speed;
	expect(runSpeed / walkSpeed).toBeCloseTo(1.65, 2);
	// Gameplay Run capture is taken in the separate art review; avoid a GPU readback while holding a key.
	await page.keyboard.up("ShiftLeft");
	await page.waitForTimeout(250);
	await state(page, "walk");
	await page.keyboard.up("KeyW");
	await state(page, "idle");
	await page.keyboard.press("Space");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await expect(
		page.getByText("Land before saving the game.", { exact: true }),
	).toBeVisible();
	await canvas.focus();
	await page.waitForTimeout(1100);
	await state(page, "idle");
	const first = await page.evaluate(() => window.__movementV2);
	for (const s of ["jump", "fall", "land"]) expect(first.states).toContain(s);
	expect(
		Math.max(...first.samples.map((s) => s.height - s.supportHeight)),
	).toBeGreaterThan(0.7);
	// Menu/input boundary: gravity can settle, new movement and aerial attacks cannot start.
	await page.keyboard.press("KeyI");
	await expect(
		page.getByRole("dialog", { name: "Inventory", exact: true }),
	).toBeVisible();
	const modal = await target(page);
	await page.keyboard.press("KeyF");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Space");
	expect(await target(page)).toEqual(modal);
	expect((await position(page)).motion.phase).toBe("grounded");
	if (
		await page
			.getByRole("dialog", { name: "Inventory", exact: true })
			.isVisible()
	)
		await page.keyboard.press("Escape");

	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await go(page, 3, 8);
	await page
		.getByRole("button", { name: "Follow Player", exact: true })
		.click();
	await canvas.focus();
	await page.keyboard.down("KeyW");
	await page.keyboard.press("Space");
	await page.waitForTimeout(1000);
	await page.keyboard.up("KeyW");
	await state(page, "idle");
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	// Leave room for the independent camera's +Z heading at full sprint speed.
	await go(page, 3, 4);
	await page
		.getByRole("button", { name: "Follow Player", exact: true })
		.click();
	await canvas.focus();
	await page.keyboard.down("ShiftLeft");
	await page.keyboard.down("KeyW");
	await page.keyboard.press("Space");
	await page.waitForTimeout(1000);
	await state(page, "run");
	await page.keyboard.press("KeyF");
	await state(page, "attack");
	await page.waitForTimeout(700);
	await state(page, "run");
	await page.keyboard.up("KeyW");
	await page.keyboard.up("ShiftLeft");
	await state(page, "idle");
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await go(page, 10, 8);
	await go(page, 13, 8);
	await page.keyboard.down("ShiftLeft");
	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(800);
	const wall = await target(page);
	expect(wall.x).toBeLessThan(14.8);
	await page.keyboard.press("Space");
	await page.waitForTimeout(1000);
	expect((await target(page)).x).toBeCloseTo(wall.x, 2);
	await page.keyboard.up("ArrowRight");
	await page.keyboard.up("ShiftLeft");
	await go(page, 10.8, 12);
	await page.keyboard.press("Space");
	await page.waitForTimeout(220);
	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(270);
	await page.keyboard.up("ArrowRight");
	await page.waitForTimeout(700);
	const platform = await position(page);
	expect(platform.supportHeight).toBeGreaterThan(wall.height + 0.6);
	expect(platform.motion.phase).toBe("grounded");
	// Complete the performance window before save/reload deliberately constructs a fresh runtime.
	const movementRequests = requests.slice(requestCount);
	const after = await snapshot(page);
	expect(after.scene.buildCount).toBe(before.scene.buildCount);
	expect(after.scene.cleanupCount).toBe(before.scene.cleanupCount);
	expect(after.raf.activeLoopCount).toBe(1);
	expect(after.raf.loopStartCount).toBe(before.raf.loopStartCount);
	expect(after.asset.loadStartedCount).toBe(before.asset.loadStartedCount);
	expect(after.asset.cloneCount).toBe(before.asset.cloneCount);
	expect(requests.length).toBe(requestCount);
	expect(after.asset.character.animation).toMatchObject({
		activeMixers: 2,
		loadingSourceCount: 0,
		missingClipCount: 0,
		incompatibleClipCount: 0,
	});
	const observations = await page.evaluate(() => window.__movementV2);
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	const saved = await page.evaluate(() => {
		const key = Object.keys(localStorage).find((k) =>
			k.startsWith("adventure-builder-game-save-v1:"),
		);
		return key ? JSON.parse(localStorage.getItem(key)!) : null;
	});
	expect(saved.player.traversal.height).toBeCloseTo(platform.supportHeight, 3);
	expect(saved.player.traversal).not.toHaveProperty("motion");
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await page.getByRole("button", { name: "Continue", exact: true }).click();
	await expect
		.poll(async () => (await position(page)).motion.phase)
		.toBe("grounded");
	const restored = await target(page);
	expect(restored).toEqual(
		saved.player.traversal && {
			x: saved.player.traversal.x,
			y: saved.player.traversal.y,
			height: saved.player.traversal.height,
		},
	);
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await go(page, 12, 10);
	await go(page, 12, 3);
	await go(page, 23, 3);
	await go(page, 23, 11);
	await page.keyboard.press("KeyF");
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-npcs"))!,
				).find((n: { id: string }) => n.id === "sparring_guard")?.health,
		)
		.toBe(25);
	await page.waitForTimeout(550);
	await page.keyboard.press("KeyF");
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-npcs"))!,
				).length,
		)
		.toBe(0);
	await page.getByRole("button", { name: "Back to Edit", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("adventure-builder-project-v1"),
		),
	).toBe(authored);
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/acceptance.json`,
		JSON.stringify(
			{
				errors,
				walkSpeed,
				runSpeed,
				wall,
				platform,
				restored,
				states: observations.states,
				sampleCount: observations.samples.length,
				maxApexHeight: Math.max(
					...observations.samples.map((s) => s.height - s.supportHeight),
				),
				transitions: observations.samples.filter(
					(s, i) =>
						i === 0 ||
						s.state !== observations.samples[i - 1].state ||
						s.motion.phase !== observations.samples[i - 1].motion.phase,
				),
				before,
				after,
				projectUnchanged: true,
				glbRequestsDuringMovement: movementRequests,
				combatDefeated: true,
			},
			null,
			2,
		) + "\n",
	);
});

// Uses real browser lock and mouse input; no injected lock or gameplay state.
test("pointer lock sky-look rotations and UI lifecycle @pointer-lock @camera-v4-lifecycle", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("melee-weapon-v1-demo.project.json");
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const canvas = page.getByLabel("Three runtime viewport", { exact: true });
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
			{ timeout: 30000 },
		)
		.toBe(0);
	const locked = () =>
		page.evaluate(
			() => document.pointerLockElement?.getAttribute("aria-label") ?? null,
		);
	const acquire = async () => {
		await canvas.click();
		await expect.poll(locked).toBe("Three runtime viewport");
	};
	const release = async () => {
		await page.keyboard.press("Escape");
		await expect.poll(locked).toBeNull();
	};
	const camera = async () =>
		JSON.parse(
			(await page
				.locator(".three-runtime-host")
				.getAttribute("data-camera-feel"))!,
		);
	await expect.poll(locked).toBeNull();
	await acquire();
	const initial = await snapshot(page);
	let mouseX = 400;
	const mouseY = -2000;
	await page.mouse.move(mouseX, mouseY, { steps: 30 });
	await expect.poll(async () => (await camera()).pitch).toBeLessThan(-81.9);
	for (const sign of [1, -1]) {
		const before = (await camera()).yaw;
		for (let i = 0; i < 60; i++) {
			mouseX += sign * 100;
			await page.mouse.move(mouseX, mouseY);
		}
		await page.waitForTimeout(500);
		expect(sign * ((await camera()).yaw - before)).toBeGreaterThan(1080);
	}
	for (const key of ["w", "s", "a", "d", "w+d", "Shift+w"]) {
		const keys = key.split("+");
		for (const held of keys) await page.keyboard.down(held);
		mouseX += 20;
		await page.mouse.move(mouseX, mouseY);
		await page.waitForTimeout(150);
		for (const held of keys.reverse()) await page.keyboard.up(held);
	}
	await page.keyboard.press("Space");
	await expect
		.poll(async () => (await position(page)).motion.phase)
		.not.toBe("grounded");
	await expect
		.poll(async () => (await position(page)).motion.phase)
		.toBe("grounded");
	await page.keyboard.press("f");
	await expect.poll(locked).toBe("Three runtime viewport");
	await page.keyboard.press("i");
	await expect(page.getByRole("dialog", { name: "Inventory" })).toBeVisible();
	await expect.poll(locked).toBeNull();
	await page
		.getByRole("dialog", { name: "Inventory" })
		.getByRole("button", { name: /Close/ })
		.click();
	await expect.poll(locked).toBe("Three runtime viewport");
	await release();
	await acquire();
	await release();
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await canvas.click();
	await expect.poll(locked).toBeNull();
	await page
		.getByRole("button", { name: "Follow Player", exact: true })
		.click();
	await acquire();
	await release();
	const route = async (x: number, y: number) => {
		await page.getByRole("button", { name: "Inspect", exact: true }).click();
		await go(page, x, y);
	};
	const followAndLock = async () => {
		await page
			.getByRole("button", { name: "Follow Player", exact: true })
			.click();
		await acquire();
	};
	await route(3, 9.2);
	await route(5.2, 9.2);
	await route(5.2, 8);
	await followAndLock();
	await page.keyboard.press("e");
	await expect(page.locator(".inventory-notifications")).toContainText("Sword");
	await state(page, "idle");
	await expect.poll(locked).toBe("Three runtime viewport");
	await page.keyboard.press("i");
	await expect.poll(locked).toBeNull();
	await page.getByRole("button", { name: "Equip", exact: true }).click();
	await page.keyboard.press("Escape");
	await expect.poll(locked).toBe("Three runtime viewport");
	await page.keyboard.press("f");
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-weapon"))!,
				).activeClip,
		)
		.toBe("GoldenSword_Attack_V1");
	await state(page, "idle");
	mouseX += 100;
	await page.mouse.move(mouseX, mouseY);
	await expect.poll(locked).toBe("Three runtime viewport");
	await release();
	await route(5.2, 9.2);
	await route(9, 9.2);
	await route(9, 8);
	await followAndLock();
	await page.keyboard.press("e");
	await state(page, "idle");
	await expect.poll(locked).toBe("Three runtime viewport");
	await release();
	await route(9, 9.2);
	await route(14.2, 9.2);
	await route(14.2, 8);
	await followAndLock();
	await page.keyboard.press("e");
	await expect(
		page.getByRole("dialog", { name: "Conversation" }),
	).toBeVisible();
	await expect.poll(locked).toBeNull();
	await page.keyboard.press("e");
	await expect(page.getByRole("dialog", { name: "Conversation" })).toBeHidden();
	await expect.poll(locked).toBeNull();
	await acquire();

	const final = await snapshot(page);
	expect(final.raf.loopStartCount).toBe(initial.raf.loopStartCount);
	// Back to Edit is keyboard accessible while locked; teardown must release it.
	await page.getByRole("button", { name: "Back to Edit", exact: true }).focus();
	await page.keyboard.press("Enter");
	await expect.poll(locked).toBeNull();
	expect(errors).toEqual([]);
});
