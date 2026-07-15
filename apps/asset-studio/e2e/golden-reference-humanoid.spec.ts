import { expect, test } from "@playwright/test";

test("renders and orbits the Golden Reference Humanoid fixture", async ({
	page,
}, testInfo) => {
	const consoleErrors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
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
	await expect(diagnostics).toContainText("Animation clips0");
	const initialCamera = await host.getAttribute("data-camera-position");
	expect(initialCamera).toBeTruthy();
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("golden-reference-initial.png"),
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
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("golden-reference-rotated.png"),
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
	expect(consoleErrors).toEqual([]);
});
