import { expect, test } from "@playwright/test";

test("opens Asset Creator and explains an unavailable Studio @integration", async ({
	page,
}) => {
	let available = true;
	await page.route("**/__asset-studio/health", async (route) => {
		if (available)
			await route.fulfill({
				json: { app: "asset-studio" },
				headers: { "Access-Control-Allow-Origin": "*" },
			});
		else await route.abort();
	});
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	const launcher = page.getByRole("button", {
		name: "Asset Creator",
		exact: true,
	});
	await launcher.click();
	const dialog = page.getByRole("dialog", { name: "Asset Creator" });
	await expect(dialog.getByRole("status")).toContainText("ready to open");
	await expect(dialog.getByRole("link")).toHaveAttribute("target", "_blank");
	await expect(dialog.getByRole("link")).toHaveAttribute(
		"href",
		`http://127.0.0.1:5174/?returnTo=${encodeURIComponent(page.url())}`,
	);
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(launcher).toBeFocused();
	available = false;
	await launcher.click();
	await expect(dialog.getByRole("status")).toContainText(
		"could not be reached",
	);
	await dialog.getByText("Local setup and connection help").click();
	await expect(dialog.getByText("npm run dev:asset-studio")).toBeVisible();
	await dialog.getByRole("button", { name: "Close", exact: true }).click();
	await expect(dialog).not.toBeVisible();
});

// Explicit two-server acceptance; start Asset Studio on its configured origin.
test("edits and finalises the canonical human from Game Engine and returns @workflow-navigation @canonical-human", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await page.goto("/");
	await page.getByRole("button", { name: /Blank Project/ }).click();
	await page
		.getByRole("button", { name: "Asset Creator", exact: true })
		.click();
	await expect(page.getByRole("dialog").getByRole("status")).toContainText(
		"ready to open",
	);
	const popup = page.waitForEvent("popup");
	await page.getByRole("link", { name: "Open Asset Creator" }).click();
	const studio = await popup;
	const errors: string[] = [];
	studio.on("pageerror", (error) => errors.push(error.message));
	const host = studio.locator(
		'[data-preview-source="authored-human-canonical-v1"]',
	);
	await expect(studio.getByLabel("Character type")).toHaveValue("authored");
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle", {
		timeout: 30_000,
	});
	const canvas = host.locator("canvas");
	const box = await canvas.boundingBox();
	expect(box?.width).toBeGreaterThan(650);
	expect(box?.height).toBeGreaterThan(400);
	for (const [label, preset] of [
		["Full Body", "full-body"],
		["Upper Body", "upper-body"],
		["Face", "face"],
		["Back", "back"],
	]) {
		await studio.getByRole("button", { name: label, exact: true }).click();
		await expect(host).toHaveAttribute("data-camera-preset", preset);
	}
	await studio.getByRole("button", { name: "Full Body", exact: true }).click();
	const initialCamera = await host.getAttribute("data-camera-position");
	await canvas.hover();
	await studio.mouse.wheel(0, -160);
	await expect
		.poll(() => host.getAttribute("data-camera-position"))
		.not.toBe(initialCamera);
	const zoomed = await host.getAttribute("data-camera-position");
	await studio.mouse.move(
		box!.x + box!.width * 0.5,
		box!.y + box!.height * 0.55,
	);
	await studio.mouse.down();
	await studio.mouse.move(
		box!.x + box!.width * 0.65,
		box!.y + box!.height * 0.6,
		{ steps: 8 },
	);
	await studio.mouse.up();
	await expect
		.poll(() => host.getAttribute("data-camera-position"))
		.not.toBe(zoomed);
	await studio.getByRole("button", { name: "Reset view", exact: true }).click();
	let requests = 0;
	studio.on("request", (request) => {
		if (
			request.method() === "POST" &&
			/\/(preview|compile)$/.test(request.url())
		)
			requests++;
	});
	await studio.getByLabel("Mass / Build", { exact: true }).fill("0.75");
	await studio.getByLabel("Head Width", { exact: true }).fill("0.6");
	await studio.getByLabel("Hair color", { exact: true }).fill("#8b3f27");
	expect(requests).toBe(0);
	const previewResponse = studio.waitForResponse(
		(r) => r.url().endsWith("/preview") && r.request().method() === "POST",
	);
	await studio
		.getByRole("button", { name: "Generate Preview", exact: true })
		.click();
	const preview = await (await previewResponse).json();
	expect(preview.status, JSON.stringify(preview)).toBe("succeeded");
	expect(preview.manifest.geometrySource.values.mass).toBe(0.75);
	expect(preview.manifest.geometrySource.values.headWidth).toBe(0.6);
	expect(preview.manifest.validationLevel).toBe("preview");
	expect(preview.manifest.deterministicBuild).toBe(false);
	await expect(
		studio.getByText("Preview ready", { exact: true }),
	).toBeVisible();
	await expect(host).toHaveAttribute(
		"data-preview-revision",
		preview.requestId,
	);
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
	);
	await studio.screenshot({
		path: "test-results/canonical-creator-full-body.png",
	});
	await studio.getByRole("button", { name: "Face", exact: true }).click();
	await studio.screenshot({ path: "test-results/canonical-creator-face.png" });
	const fullResponse = studio.waitForResponse(
		(r) => r.url().endsWith("/compile") && r.request().method() === "POST",
	);
	await studio
		.getByRole("button", { name: "Finalise Character", exact: true })
		.click();
	const full = await (await fullResponse).json();
	expect(full.status, JSON.stringify(full)).toBe("succeeded");
	expect(full.manifest.deterministicBuild).toBe(true);
	expect(full.manifest.outputHash).toBe(preview.manifest.outputHash);
	await expect(
		studio.getByText("Character finalised", { exact: true }),
	).toBeVisible();
	await expect(
		studio.getByRole("link", { name: "Download character GLB" }),
	).toBeVisible();
	expect(requests).toBe(2);
	expect(errors).toEqual([]);
	const back = studio.getByRole("link", { name: "Back to Game Engine" });
	await expect(back).toHaveAttribute("href", page.url());
	await back.click();
	await expect(studio).toHaveURL(page.url());
	await expect(
		studio.getByRole("button", { name: "Asset Creator", exact: true }),
	).toBeVisible();
});
