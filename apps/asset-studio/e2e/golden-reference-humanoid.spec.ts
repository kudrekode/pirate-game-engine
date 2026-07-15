import { expect, test } from "@playwright/test";

test("plays the retargeted Golden Reference idle and in-place walk while preserving orbit controls", async ({
	page,
}, testInfo) => {
	const consoleErrors: string[] = [];
	const bindingErrors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
		if (
			message.type() === "error" &&
			/track|bind|skeleton|webgl/i.test(message.text())
		)
			bindingErrors.push(message.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));
	await page.goto("/");
	const host = page.locator(
		'[data-preview-source="golden-reference-humanoid-v0"]',
	);
	const canvas = page.locator(
		'canvas[aria-label="Golden Reference Humanoid preview"]',
	);
	await expect(host.getByText(/Golden Reference Humanoid/)).toBeVisible();
	await expect(canvas).toBeVisible();
	await expect(page.locator("img")).toHaveCount(0);
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	const diagnostics = page.getByLabel("Golden Reference Humanoid diagnostics");
	await expect(diagnostics).toContainText("Skinned meshes3");
	await expect(diagnostics).toContainText("Bones65");
	await expect(diagnostics).toContainText("Animation clips2", {
		timeout: 60_000,
	});
	await expect(diagnostics).toContainText("64 mapped");
	await expect(diagnostics).toContainText("Adobe Mixamo");
	await expect(diagnostics).toContainText("freeze target-world pelvis X/Z");
	await page
		.locator(".preview-diagnostics, .preview-status")
		.evaluateAll((elements) => {
			for (const element of elements) {
				(element as HTMLElement).style.visibility = "hidden";
			}
		});
	await expect(host).toHaveAttribute("data-animation-state", "idle");
	const idleTime = Number(await host.getAttribute("data-animation-time"));
	const idlePose = await host.getAttribute("data-pose-snapshot");
	await page.waitForTimeout(350);
	const advancedIdleTime = Number(
		await host.getAttribute("data-animation-time"),
	);
	const advancedIdlePose = await host.getAttribute("data-pose-snapshot");
	expect(advancedIdleTime).toBeGreaterThan(idleTime);
	expect(advancedIdlePose).not.toBe(idlePose);
	await page.getByRole("button", { name: "Pause" }).click();
	const pausedTime = await host.getAttribute("data-animation-time");
	await page.waitForTimeout(250);
	expect(await host.getAttribute("data-animation-time")).toBe(pausedTime);
	await page.getByRole("button", { name: "Play" }).click();
	await expect(host).toHaveAttribute("data-animation-playing", "true");
	const initialCamera = await host.getAttribute("data-camera-position");
	expect(initialCamera).toBeTruthy();
	await canvas.screenshot({
		path: testInfo.outputPath("golden-reference-idle-initial.png"),
	});
	const box = await canvas.boundingBox();
	if (!box) throw new Error("Preview canvas is not measurable.");
	await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.52, {
		steps: 12,
	});
	await page.mouse.up();
	await expect(host).not.toHaveAttribute(
		"data-camera-position",
		initialCamera ?? "",
	);
	const rotatedCamera = await host.getAttribute("data-camera-position");
	expect(rotatedCamera).not.toBe(initialCamera);
	await canvas.screenshot({
		path: testInfo.outputPath("golden-reference-idle-rotated.png"),
	});
	await page.getByRole("button", { name: "Reset view" }).click();
	await expect(host).toHaveAttribute(
		"data-camera-position",
		initialCamera ?? "",
	);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -250);
	await expect(host).not.toHaveAttribute(
		"data-camera-position",
		initialCamera ?? "",
	);
	await page.setViewportSize({ width: 980, height: 760 });
	await expect(canvas).toBeVisible();
	await expect(page.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
	);
	await page.setViewportSize({ width: 1440, height: 1000 });

	await page.getByRole("button", { name: "Walk" }).click();
	await expect(host).toHaveAttribute("data-animation-state", "walk");
	const walkTime = Number(await host.getAttribute("data-animation-time"));
	const walkPose = await host.getAttribute("data-pose-snapshot");
	const walkPelvisHorizontal = await host.getAttribute(
		"data-pelvis-horizontal",
	);
	await page.waitForTimeout(350);
	expect(
		Number(await host.getAttribute("data-animation-time")),
	).toBeGreaterThan(walkTime);
	expect(await host.getAttribute("data-pose-snapshot")).not.toBe(walkPose);
	expect(await host.getAttribute("data-pelvis-horizontal")).toBe(
		walkPelvisHorizontal,
	);
	await canvas.screenshot({
		path: testInfo.outputPath("golden-reference-walk-orbited.png"),
	});
	await page.getByRole("button", { name: "Reset view" }).click();
	await canvas.screenshot({
		path: testInfo.outputPath("golden-reference-walk-reset.png"),
	});

	await page.getByRole("button", { name: "Rest" }).click();
	await expect(host).toHaveAttribute("data-animation-state", "rest");
	const restPose = await host.getAttribute("data-pose-snapshot");
	await page.getByRole("button", { name: "Idle" }).click();
	await page.waitForTimeout(150);
	expect(await host.getAttribute("data-pose-snapshot")).not.toBe(restPose);
	await page.getByRole("button", { name: "Rest" }).click();
	expect(await host.getAttribute("data-pose-snapshot")).toBe(restPose);

	expect(consoleErrors).toEqual([]);
	expect(bindingErrors).toEqual([]);
});
