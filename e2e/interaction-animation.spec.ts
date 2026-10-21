import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.use({ channel: "chrome", viewport: { width: 1280, height: 900 } });
const output = "docs/assets/interaction-animation";
async function snapshot(page: Page) {
	return page.evaluate(
		() => window.__THREE_PERF_DIAGNOSTICS__!.getSnapshot("ThreeRuntimePanel")!,
	);
}
async function props(page: Page) {
	return JSON.parse(
		(await page
			.locator(".three-runtime-host")
			.getAttribute("data-interaction-props"))!,
	);
}
async function state(page: Page) {
	return (await snapshot(page)).asset.character.animation.playerState;
}
async function go(page: Page, x: number, y: number) {
	await page.getByRole("button", { name: "Inspect", exact: true }).click();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	for (const axis of ["x", "y"] as const)
		for (let i = 0; i < 150; i++) {
			const before = JSON.parse(
				(await page
					.locator(".three-runtime-hud")
					.getAttribute("data-traversal-target"))!,
			);
			const delta = (axis === "x" ? x : y) - before[axis];
			if (Math.abs(delta) < 0.12) break;
			await page.keyboard.press(
				axis === "x"
					? delta > 0
						? "ArrowRight"
						: "ArrowLeft"
					: delta > 0
						? "ArrowDown"
						: "ArrowUp",
			);
			await page.waitForTimeout(90);
			if (i === 149) throw Error(`Route blocked: ${JSON.stringify(before)}`);
		}
	await page
		.getByRole("button", { name: "Follow Player", exact: true })
		.click();
	await page.getByLabel("Three runtime viewport", { exact: true }).focus();
	await expect.poll(() => state(page)).toBe("idle");
}
test("physical interactions animate locally and Continue restores semantic poses @interaction-animation", async ({
	page,
}) => {
	test.setTimeout(240000);
	await fs.mkdir(output, { recursive: true });
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/\.glb(?:\?|$)/.test(r.url())) requests.push(r.url());
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles("interaction-animation-demo.project.json");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const authored = await page.evaluate(() =>
		localStorage.getItem("adventure-builder-project-v1"),
	);
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
		)
		.toBe(0);
	await expect.poll(async () => (await props(page)).props.length).toBe(1);
	await expect.poll(() => state(page)).toBe("idle");
	await go(page, 4, 8);
	const before = await snapshot(page),
		requestCount = requests.length;
	const prompt = page.locator(".runtime-interaction-prompt");
	await expect(prompt).toContainText("Open chest");
	await page.keyboard.press("e");
	await expect.poll(() => state(page)).toBe("interact");
	await expect
		.poll(async () => Math.abs((await props(page)).playerYaw - Math.PI / 2))
		.toBeLessThan(0.15);
	await page.screenshot({ path: `${output}/chest-reach.png` });
	await expect(page.locator(".inventory-notifications")).toContainText(
		"Harbour Key",
	);
	await expect
		.poll(async () => (await props(page)).props[0].time)
		.toBeGreaterThan(0.29);
	await expect.poll(() => state(page)).toBe("idle");
	expect((await props(page)).props[0]).toMatchObject({
		opened: true,
		playCount: 1,
	});
	await page.keyboard.press("e");
	await expect(prompt).toContainText("Empty chest");
	expect((await props(page)).props[0].playCount).toBe(1);
	await go(page, 4, 9.2);
	await go(page, 7, 9.2);
	await go(page, 7.2, 8);
	await expect(prompt).toContainText("Open static chest");
	await page.keyboard.press("e");
	await expect.poll(() => state(page)).toBe("interact");
	await expect.poll(() => state(page)).toBe("idle");
	await go(page, 7.2, 9.2);
	await go(page, 10.2, 9.2);
	await go(page, 10.2, 8);
	await expect(prompt).toContainText("Pick up rope");
	await page.keyboard.press("e");
	await expect.poll(() => state(page)).toBe("pickup");
	expect((await props(page)).visibleIds).not.toContain("physical-pickup");
	await page.waitForTimeout(180);
	await page.screenshot({ path: `${output}/pickup-bend.png` });
	await expect(page.locator(".inventory-notifications")).toContainText("Rope");
	await expect.poll(() => state(page)).toBe("idle");
	await page.keyboard.press("e");
	expect((await props(page)).visibleIds).not.toContain("physical-pickup");
	await go(page, 13.2, 8);
	await expect(prompt).toContainText("Examine sign");
	const neutralCount = (await snapshot(page)).asset.character.animation
		.oneShotActionsTriggered;
	await page.keyboard.press("e");
	await expect(
		page.getByRole("dialog", { name: "Conversation" }),
	).toBeVisible();
	expect(await state(page)).toBe("idle");
	await page.keyboard.press("e");
	await go(page, 13.2, 9.2);
	await go(page, 16.2, 9.2);
	await go(page, 16.2, 8);
	await expect(prompt).toContainText("Talk");
	await page.keyboard.press("e");
	await expect(
		page.getByRole("dialog", { name: "Conversation" }),
	).toBeVisible();
	expect(await state(page)).toBe("idle");
	await page.keyboard.press("e");
	expect(
		(await snapshot(page)).asset.character.animation.oneShotActionsTriggered,
	).toBe(neutralCount);
	const after = await snapshot(page),
		interactionRequests = requests.slice(requestCount);
	expect(after.scene.buildCount).toBe(before.scene.buildCount);
	expect(after.scene.cleanupCount).toBe(before.scene.cleanupCount);
	expect(after.raf.activeLoopCount).toBe(1);
	expect(after.raf.loopStartCount).toBe(before.raf.loopStartCount);
	expect(after.asset.loadStartedCount).toBe(before.asset.loadStartedCount);
	expect(after.asset.cloneCount).toBe(before.asset.cloneCount);
	expect(interactionRequests).toEqual([]);
	await page.getByRole("button", { name: "Save Game", exact: true }).click();
	await page.reload();
	await page.getByRole("button", { name: "3D View", exact: true }).click();
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await page.getByRole("button", { name: "Continue", exact: true }).click();
	await expect
		.poll(async () => (await props(page)).props[0]?.opened)
		.toBe(true);
	expect((await props(page)).props[0]).toMatchObject({ playCount: 0 });
	expect((await props(page)).props[0].time).toBeGreaterThan(0.29);
	expect((await props(page)).visibleIds).not.toContain("physical-pickup");
	await expect
		.poll(
			async () =>
				(await snapshot(page)).asset.character.animation.loadingSourceCount,
		)
		.toBe(0);
	expect(
		(await snapshot(page)).asset.character.animation.oneShotActionsTriggered,
	).toBe(0);
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
				after,
				requestsDuringInteractions: interactionRequests,
				projectUnchanged: true,
				errors,
			},
			null,
			2,
		) + "\n",
	);
});
