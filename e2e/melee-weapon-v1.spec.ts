import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.use({ channel: "chrome", viewport: { width: 1280, height: 900 } });
const output = "docs/assets/melee-weapon-v1";
async function snapshot(page: Page) {
	return page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
}
async function weapon(page: Page) {
	return JSON.parse(
		(await page.locator(".three-runtime-host").getAttribute("data-weapon"))!,
	);
}
async function state(page: Page) {
	return (await snapshot(page)).asset.character.animation.playerState;
}
async function go(page: Page, x: number, y: number) {
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	for (const axis of ["x", "y"] as const) {
		let reached = false;
		for (let i = 0; i < 120; i++) {
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
		expect(reached, `real-input route reaches ${axis}: ${x},${y}`).toBe(true);
	}
	await page.waitForTimeout(120);
}
async function follow(page: Page) {
	await page
		.getByRole("button", { name: "Follow Player", exact: true })
		.click();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
}
async function inventory(page: Page) {
	await page.getByRole("button", { name: /^Inventory/ }).click();
}
test("one sword pickup equip move attack defeat and semantic Continue via real controls @melee-weapon-v1", async ({
	page,
}) => {
	test.setTimeout(600000);
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [],
		requests: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("request", (r) => {
		if (/\.glb(?:\?|$)/.test(r.url())) requests.push(r.url());
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("melee-weapon-v1-demo.project.json");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const authored = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await expect
		.poll(
			async () => (await snapshot(page)).asset.character.animation.activeMixers,
		)
		.toBe(3);
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
			{ timeout: 30000 },
		)
		.toBe(0);
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(150);
	await page.keyboard.press("f");
	await expect
		.poll(() => weapon(page).then((w) => w.activeClip))
		.toBe("GoldenCombat_Attack_V1");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard 75/100",
	);
	await expect.poll(() => state(page)).toBe("idle");
	await go(page, 3, 9.2);
	await go(page, 5.2, 9.2);
	await go(page, 5.2, 8);
	await expect(page.locator(".runtime-interaction-prompt")).toContainText(
		"Pick up sword",
	);
	const before = await snapshot(page);
	await page.keyboard.press("e");
	await expect.poll(() => state(page)).toBe("pickup");
	await expect(page.locator(".inventory-notifications")).toContainText("Sword");
	await expect
		.poll(async () =>
			JSON.parse(
				(await page
					.locator(".three-runtime-host")
					.getAttribute("data-interaction-props"))!,
			).visibleIds.includes("sword-pickup"),
		)
		.toBe(false);
	await expect.poll(() => state(page)).toBe("idle");
	expect((await weapon(page)).attached).toBe(false);
	await inventory(page);
	await page.getByRole("button", { name: "Equip", exact: true }).click();
	await expect(page.getByText("Equipped", { exact: true })).toBeVisible();
	const modalCount = (await snapshot(page)).asset.character.animation
		.oneShotActionsTriggered;
	await page.keyboard.press("f");
	expect(
		(await snapshot(page)).asset.character.animation.oneShotActionsTriggered,
	).toBe(modalCount);
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await weapon(page)).attached).toBe(true);
	expect((await weapon(page)).bone).toBe("hand_r");
	const equipped = await snapshot(page),
		instance = (await weapon(page)).instanceId,
		requestCount = requests.length;
	expect(equipped.scene.buildCount).toBe(before.scene.buildCount);
	await follow(page);
	await page.screenshot({ path: `${output}/equipped.png` });
	// Read-only DOM/diagnostics observer. Gameplay state changes only through controls.
	await page.evaluate(() => {
		(
			window as unknown as {
				swordStates: { state: string; attached: boolean; instanceId: string }[];
			}
		).swordStates = [];
		const host = document.querySelector<HTMLElement>(".three-runtime-host")!;
		new MutationObserver(() => {
			const w = JSON.parse(host.dataset.weapon ?? "{}");
			const state =
				window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!
					.asset.character.animation.playerState;
			(window as unknown as { swordStates: unknown[] }).swordStates.push({
				state,
				attached: w.attached,
				instanceId: w.instanceId,
			});
		}).observe(host, { attributes: true, attributeFilter: ["data-weapon"] });
	});
	await go(page, 7, 10);
	await page.keyboard.down("ArrowRight");
	await expect.poll(() => state(page)).toBe("walk");
	await page.keyboard.press("f");
	await expect
		.poll(async () => (await weapon(page)).activeClip)
		.toBe("GoldenSword_Attack_V1");
	await expect.poll(() => state(page)).toBe("walk");
	await page.keyboard.down("Shift");
	await expect.poll(() => state(page)).toBe("run");
	await page.keyboard.press("f");
	await expect.poll(() => state(page)).toBe("attack");
	await expect.poll(() => state(page)).toBe("run");
	await page.keyboard.up("ArrowRight");
	await page.keyboard.up("Shift");
	await expect.poll(() => state(page)).toBe("idle");
	await page.keyboard.press("Space");
	await expect.poll(() => state(page)).toBe("jump");
	const aerial = (await snapshot(page)).asset.character.animation
		.oneShotActionsTriggered;
	await page.keyboard.press("f");
	expect(
		(await snapshot(page)).asset.character.animation.oneShotActionsTriggered,
	).toBe(aerial);
	await expect.poll(() => state(page)).toBe("idle");
	await go(page, 6.2, 8);
	await page.keyboard.press("ArrowLeft");
	await page.waitForTimeout(180);
	await follow(page);
	await page.mouse.click(850, 650);
	await page.mouse.move(710, 650, { steps: 5 });
	await page.keyboard.press("Escape");
	const capture = await page.context().newCDPSession(page),
		attackFrames: string[] = [];
	capture.on("Page.screencastFrame", (frame) => {
		attackFrames.push(frame.data);
		void capture.send("Page.screencastFrameAck", {
			sessionId: frame.sessionId,
		});
	});
	await capture.send("Page.startScreencast", {
		format: "png",
		maxWidth: 1280,
		maxHeight: 900,
		everyNthFrame: 1,
	});
	// Two-cell reach; each accepted sword hit deals 35 through the ordinary transaction.
	await page.keyboard.press("f");
	await page.keyboard.press("f");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard 40/100",
	);
	await expect.poll(() => state(page)).toBe("attack");
	await expect.poll(() => state(page)).toBe("idle");
	await capture.send("Page.stopScreencast");
	await capture.detach();
	await fs.mkdir("test-results/melee-weapon-v1", { recursive: true });
	await fs.writeFile(
		"test-results/melee-weapon-v1/runtime-attack-frames.json",
		JSON.stringify(attackFrames),
	);
	await page.waitForTimeout(800);
	await page.keyboard.press("f");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard 5/100",
	);
	await page.waitForTimeout(800);
	await page.keyboard.press("f");
	await expect(page.locator(".three-runtime-hud")).toContainText(
		"Sparring Guard defeated",
	);
	await expect
		.poll(async () =>
			JSON.parse(
				(await page
					.locator(".three-runtime-host")
					.getAttribute("data-dying-npcs"))!,
			).includes("sparring_guard"),
		)
		.toBe(true);
	await page.screenshot({ path: `${output}/defeat.png` });
	await expect
		.poll(
			async () =>
				JSON.parse(
					(await page
						.locator(".three-runtime-host")
						.getAttribute("data-dying-npcs"))!,
				).length,
		)
		.toBe(0);
	await go(page, 9, 8);
	await page.keyboard.press("e");
	await expect.poll(() => state(page)).toBe("interact");
	await expect.poll(async () => (await weapon(page)).visible).toBe(false);
	await expect.poll(() => state(page)).toBe("idle");
	await expect.poll(async () => (await weapon(page)).visible).toBe(true);
	await go(page, 9, 9.2);
	await go(page, 12.2, 9.2);
	await go(page, 12.2, 8);
	await page.keyboard.press("e");
	await expect.poll(() => state(page)).toBe("pickup");
	await expect.poll(() => state(page)).toBe("idle");
	await go(page, 14.2, 8);
	await page.keyboard.press("e");
	await expect(
		page.getByRole("dialog", { name: "Conversation" }),
	).toBeVisible();
	await page.keyboard.press("e");
	await go(page, 14.2, 9.2);
	await go(page, 16.2, 9.2);
	await go(page, 16.2, 8);
	await page.keyboard.press("e");
	await expect(
		page.getByRole("dialog", { name: "Conversation" }),
	).toBeVisible();
	await page.keyboard.press("e");
	const after = await snapshot(page),
		states = await page.evaluate(
			() =>
				(
					window as unknown as {
						swordStates: {
							state: string;
							attached: boolean;
							instanceId: string;
						}[];
					}
				).swordStates,
		);
	for (const expected of [
		"idle",
		"walk",
		"run",
		"jump",
		"fall",
		"land",
		"attack",
		"interact",
		"pickup",
	])
		expect(
			states.some((s) => s.state === expected),
			expected,
		).toBe(true);
	expect(states.every((s) => s.attached && s.instanceId === instance)).toBe(
		true,
	);
	expect(after.scene.buildCount).toBe(equipped.scene.buildCount);
	expect(after.scene.cleanupCount).toBe(equipped.scene.cleanupCount);
	expect(after.asset.loadStartedCount).toBe(equipped.asset.loadStartedCount);
	expect(after.asset.cloneCount).toBe(equipped.asset.cloneCount);
	expect(after.raf.activeLoopCount).toBe(1);
	expect(after.raf.loopStartCount).toBe(equipped.raf.loopStartCount);
	expect(requests.slice(requestCount)).toEqual([]);
	const actionRequests = requests.slice(requestCount);
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	const save = await page.evaluate(() =>
		JSON.parse(
			Object.entries(localStorage).find(([k]) =>
				k.startsWith("adventure-builder-game-save-v1:"),
			)![1],
		),
	);
	expect(save.player.equippedWeaponId).toBe("sword");
	expect(save.state.inventory.sword).toBe(1);
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await page.getByRole("button", { name: "Continue", exact: true }).click();
	await expect.poll(async () => (await weapon(page)).attached).toBe(true);
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
		)
		.toBe(0);
	expect(
		(await snapshot(page)).asset.character.animation.oneShotActionsTriggered,
	).toBe(0);
	await inventory(page);
	await page.getByRole("button", { name: /Sword ×1/ }).click();
	await page.getByRole("button", { name: "Unequip", exact: true }).click();
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await weapon(page)).attached).toBe(false);
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await page.keyboard.press("f");
	await expect
		.poll(async () => (await weapon(page)).activeClip)
		.toBe("GoldenCombat_Attack_V1");
	await expect.poll(() => state(page)).toBe("idle");
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await page.getByRole("button", { name: "Continue", exact: true }).click();
	await expect
		.poll(
			async () => (await snapshot(page)).asset.character.animation.activeMixers,
		)
		.toBe(2);
	expect((await weapon(page)).attached).toBe(false);
	await inventory(page);
	await page.getByRole("button", { name: /Sword ×1/ }).click();
	await expect(page.getByText("Unequipped", { exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
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
				before,
				equipped,
				after,
				states: [...new Set(states.map((s) => s.state))],
				stableAttachment: true,
				requestsDuringActions: actionRequests,
				projectUnchanged: true,
				save: {
					equippedWeaponId: save.player.equippedWeaponId,
					inventory: save.state.inventory,
				},
				errors,
			},
			null,
			2,
		) + "\n",
	);
});
