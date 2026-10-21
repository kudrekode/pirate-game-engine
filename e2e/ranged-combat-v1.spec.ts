import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.use({
	channel: "chrome",
	viewport: { width: 1280, height: 900 },
	trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
});
const output = "docs/assets/ranged-combat-v1";
async function data(page: Page, name: string) {
	return JSON.parse(
		(await page.locator(".three-runtime-host").getAttribute(`data-${name}`)) ??
			"null",
	);
}
async function snapshot(page: Page) {
	return page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
}
async function go(page: Page, x: number, y: number) {
	if (await page.evaluate(() => !!document.pointerLockElement))
		await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	for (const axis of ["x", "y"] as const) {
		let reached = false;
		for (let i = 0; i < 180; i++) {
			const p = JSON.parse(
				(await page
					.locator(".three-runtime-hud")
					.getAttribute("data-traversal-target"))!,
			);
			const delta = (axis === "x" ? x : y) - p[axis];
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
		expect(reached, `route ${axis} to ${axis === "x" ? x : y}`).toBe(true);
	}
	await page.waitForTimeout(150);
}

test("one Bow pickup, camera-aimed arrows, world impacts, switching and Continue @ranged-combat-v1", async ({
	page,
}) => {
	test.setTimeout(240000);
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [],
		requests: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("request", (r) => {
		if (r.url().endsWith(".glb")) requests.push(r.url());
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("ranged-combat-v1-demo.project.json");
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
	await expect
		.poll(async () => (await data(page, "projectiles"))?.pooled)
		.toBe(3);
	const locked = () => page.evaluate(() => !!document.pointerLockElement);
	const follow = async () => {
		await page
			.getByRole("button", { name: "Follow Player", exact: true })
			.click();
		await canvas.click();
		await expect.poll(locked).toBe(true);
	};
	await canvas.click();
	await expect.poll(locked).toBe(true);
	await page.keyboard.press("e");
	await expect(page.locator(".inventory-notifications")).toContainText("Bow");
	await expect
		.poll(async () => (await data(page, "weapon")).semanticState)
		.toBe("idle");
	const equip = async (name: string) => {
		await page.keyboard.press("i");
		await expect.poll(locked).toBe(false);
		await page.getByRole("button", { name: new RegExp(`^${name} ×`) }).click();
		await page.getByRole("button", { name: "Equip", exact: true }).click();
		await page.keyboard.press("Escape");
		await expect.poll(locked).toBe(true);
	};
	await equip("Bow");
	await expect
		.poll(async () => (await data(page, "weapon")).bone)
		.toBe("hand_l");
	await expect(page.getByLabel("Bow aim reticle")).toBeVisible();
	await page.waitForTimeout(600);
	// Only diagnostic reads. No runtime positions, health or transactions are injected.
	await page.evaluate(() => {
		const samples: unknown[] = [];
		Object.assign(window, { bowSamples: samples });
		const host = document.querySelector<HTMLElement>(".three-runtime-host")!;
		let previous = 0;
		new MutationObserver(() => {
			const now = performance.now();
			if (now - previous < 25) return;
			previous = now;
			if (samples.length < 12000)
				samples.push({
					time: now,
					arrows: JSON.parse(host.dataset.projectiles ?? "null"),
					weapon: JSON.parse(host.dataset.weapon ?? "null"),
					npcs: JSON.parse(host.dataset.npcs ?? "null"),
					dying: JSON.parse(host.dataset.dyingNpcs ?? "[]"),
				});
		}).observe(host, {
			attributes: true,
			attributeFilter: ["data-projectiles"],
		});
	});
	const before = await snapshot(page),
		requestCount = requests.length;
	let mouseX = 640,
		mouseY = 450;
	await page.mouse.move(mouseX, mouseY);
	const aimAt = async (x: number, height: number, z: number) => {
		// Feedback uses the actual visible ray; relative mouse input does all aiming.
		for (let i = 0; i < 12; i++) {
			const c = (await data(page, "camera-feel")).actual;
			const target = { x: x - 23.5, y: height, z: z - 11.5 };
			const current = {
				x: c.lookAt.x - c.position.x,
				y: c.lookAt.y - c.position.y,
				z: c.lookAt.z - c.position.z,
			};
			const desired = {
				x: target.x - c.position.x,
				y: target.y - c.position.y,
				z: target.z - c.position.z,
			};
			let yaw =
				((Math.atan2(-desired.x, -desired.z) -
					Math.atan2(-current.x, -current.z)) *
					180) /
				Math.PI;
			yaw = ((yaw + 540) % 360) - 180;
			const pitch =
				((Math.atan2(-desired.y, Math.hypot(desired.x, desired.z)) -
					Math.atan2(-current.y, Math.hypot(current.x, current.z))) *
					180) /
				Math.PI;
			if (Math.abs(yaw) < 0.12 && Math.abs(pitch) < 0.12) break;
			mouseX += yaw / 0.22;
			mouseY -= pitch / 0.18;
			await page.mouse.move(mouseX, mouseY);
			await page.waitForTimeout(180);
		}
	};
	const health = async (id: string) =>
		(await data(page, "npcs")).find((n: { id: string }) => n.id === id)?.health;
	const shoot = async () => {
		const count = (await data(page, "projectiles")).spawned;
		await page.keyboard.press("f");
		await expect
			.poll(async () => (await data(page, "projectiles")).spawned)
			.toBe(count + 1);
		await expect.poll(locked).toBe(true);
	};
	await aimAt(10, 2.25, 12);
	await page.screenshot({ path: `${output}/equipped.png` });
	await shoot();
	await page.keyboard.press("f");
	await expect.poll(() => health("close-target")).toBe(32);
	await page.waitForTimeout(700);
	await shoot();
	await expect.poll(() => health("close-target")).toBeUndefined();
	await aimAt(20, 2.25, 12);
	await page.waitForTimeout(1100);
	await shoot();
	await page.screenshot({ path: `${output}/arrow-flight.png` });
	await expect.poll(() => health("medium-target")).toBe(32);
	await page.waitForTimeout(1000);
	await shoot();
	await expect.poll(() => health("medium-target")).toBeUndefined();
	await aimAt(35, 2.25, 12);
	await page.waitForTimeout(1100);
	await shoot();
	await expect.poll(() => health("far-target")).toBe(32);
	await aimAt(5, 2.25, 45);
	await page.waitForTimeout(1100);
	await shoot();
	await expect
		.poll(async () => (await data(page, "projectiles")).active)
		.toBe(0);
	expect((await data(page, "projectiles")).lastImpact.kind).toBe("expired");
	await page.keyboard.down("Shift");
	await page.keyboard.down("w");
	await page.waitForTimeout(180);
	await page.keyboard.up("w");
	await page.keyboard.up("Shift");
	await page.keyboard.press("Space");
	await expect
		.poll(async () => (await data(page, "traversal")).motion.phase)
		.not.toBe("grounded");
	const airborneCount = (await data(page, "projectiles")).spawned;
	await page.keyboard.press("f");
	await page.waitForTimeout(350);
	expect((await data(page, "projectiles")).spawned).toBe(airborneCount);
	await expect
		.poll(async () => (await data(page, "traversal")).motion.phase)
		.toBe("grounded");
	await go(page, 12, 8);
	await follow();
	await aimAt(16, 2.25, 8);
	await shoot();
	await expect
		.poll(async () => (await data(page, "projectiles")).lastImpact.id)
		.toBe("wall");
	await go(page, 13.6, 8);
	await follow();
	await aimAt(16, 2.25, 8);
	await page.waitForTimeout(1100);
	await shoot();
	await expect
		.poll(async () => (await data(page, "projectiles")).active)
		.toBe(0);
	expect((await data(page, "projectiles")).lastImpact.id).toBe("wall");
	expect((await data(page, "projectiles")).lastImpact.position.x).toBeLessThan(
		14,
	);
	await page.screenshot({ path: `${output}/near-wall.png` });
	await go(page, 5, 13.2);
	await follow();
	await page.keyboard.press("e");
	await expect(page.locator(".inventory-notifications")).toContainText("Sword");
	await expect
		.poll(async () => (await data(page, "weapon")).semanticState)
		.toBe("idle");
	await equip("Sword");
	await expect
		.poll(async () => (await data(page, "weapon")).bone)
		.toBe("hand_r");
	expect(await page.getByLabel("Bow aim reticle").count()).toBe(0);
	await go(page, 5, 20);
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(100);
	await page.keyboard.press("f");
	await expect.poll(() => health("sword-target")).toBe(29);
	await page.keyboard.press("i");
	await page.getByRole("button", { name: /^Sword ×/ }).click();
	await page.getByRole("button", { name: "Unequip", exact: true }).click();
	await page.keyboard.press("Escape");
	await go(page, 6, 20);
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(800);
	await page.keyboard.press("f");
	await expect.poll(() => health("sword-target")).toBe(4);
	await go(page, 6, 16);
	await page.keyboard.press("e");
	await expect
		.poll(async () => (await data(page, "weapon")).semanticState)
		.toBe("idle");
	await follow();
	await equip("Bow");
	await page.waitForTimeout(600);
	const after = await snapshot(page);
	expect(after.scene.buildCount).toBe(before.scene.buildCount);
	expect(after.scene.cleanupCount).toBe(before.scene.cleanupCount);
	expect(after.raf.activeLoopCount).toBe(1);
	expect(after.raf.loopStartCount).toBe(before.raf.loopStartCount);
	expect(requests.length).toBe(requestCount);
	expect(after.asset.cloneCount).toBe(before.asset.cloneCount + 1); // first held Sword clone
	await aimAt(6, 2.25, 45);
	await shoot();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	const save = await page.evaluate(() => {
		const key = Object.keys(localStorage).find((k) =>
			k.startsWith("adventure-builder-game-save-v1:"),
		);
		return JSON.parse(localStorage.getItem(key!)!);
	});
	expect(save.player.equippedWeaponId).toBe("bow");
	expect(save.state.inventory.bow).toBe(1);
	expect(JSON.stringify(save)).not.toMatch(/projectiles|remainingMs|GoldenBow/);
	const samples = await page.evaluate(
		() =>
			(
				window as unknown as {
					bowSamples: {
						time: number;
						arrows: {
							active: number;
							arrows?: {
								id: number;
								position: { x: number; y: number; z: number };
							}[];
						};
						weapon: { activeClip: string; semanticState: string };
						npcs: { animation: string }[];
						dying: string[];
					}[];
				}
			).bowSamples,
	);
	const clips = [...new Set(samples.map((s) => s.weapon.activeClip))];
	const npcStates = [
		...new Set(samples.flatMap((s) => s.npcs.map((n) => n.animation))),
	];
	const defeated = [...new Set(samples.flatMap((s) => s.dying))];
	const tracks = new Map<number, { x: number; y: number; z: number }[]>();
	for (const sample of samples)
		for (const arrow of sample.arrows.arrows ?? []) {
			const positions = tracks.get(arrow.id) ?? [];
			if (
				!positions.some(
					(p) => JSON.stringify(p) === JSON.stringify(arrow.position),
				)
			) {
				if (positions.length < 8) positions.push(arrow.position);
				else positions[7] = arrow.position;
			}
			tracks.set(arrow.id, positions);
		}
	expect([...tracks.values()].some((positions) => positions.length > 2)).toBe(
		true,
	);
	expect(npcStates).toContain("hit");
	expect(defeated).toEqual(
		expect.arrayContaining(["close-target", "medium-target"]),
	);
	expect(clips).toEqual(
		expect.arrayContaining([
			"GoldenBow_Fire_V1",
			"GoldenSword_Attack_V1",
			"GoldenCombat_Attack_V1",
			"GoldenMovement_Run_V1",
			"GoldenMovement_Jump_V1",
		]),
	);
	const peakArrows = Math.max(...samples.map((s) => s.arrows.active));
	expect(peakArrows).toBeLessThanOrEqual(2);
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await page.getByRole("button", { name: "Continue", exact: true }).click();
	await expect
		.poll(async () => (await data(page, "weapon"))?.bone, { timeout: 30000 })
		.toBe("hand_l");
	expect((await data(page, "projectiles")).spawned).toBe(0);
	expect((await data(page, "projectiles")).active).toBe(0);
	await expect
		.poll(async () => (await data(page, "weapon")).semanticState)
		.toBe("idle");
	expect(errors).toEqual([]);
	await fs.writeFile(
		`${output}/acceptance.json`,
		JSON.stringify(
			{
				before,
				after,
				requests: requests.slice(0, requestCount),
				savedEquipment: save.player.equippedWeaponId,
				savedInventory: save.state.inventory,
				errors,
				sampleCount: samples.length,
				peakArrows,
				clips,
				npcStates,
				defeated,
				arrowTracks: Object.fromEntries(tracks),
			},
			null,
			2,
		) + "\n",
	);
});
