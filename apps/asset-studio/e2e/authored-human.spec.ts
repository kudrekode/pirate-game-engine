import { expect, test } from "@playwright/test";

// Appearance-only follow-up to the two-app compile workflow; no Blender work.
test("frames the canonical authored human in the creator @canonical-preview", async ({
	page,
}) => {
	await page.goto("/");
	const host = page.locator(
		'[data-preview-source="authored-human-canonical-v1"]',
	);
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60_000 },
	);
	await expect(host).toHaveAttribute("data-animation-state", "idle");
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await page.getByLabel("Animation sample time").fill("0.25");
	for (const [name, file] of [
		["Full Body", "full-body"],
		["Upper Body", "upper-body"],
		["Face", "face"],
	]) {
		await page.getByRole("button", { name, exact: true }).click();
		await page.screenshot({
			path: `test-results/canonical-creator-${file}.png`,
		});
	}
	for (const state of ["Idle", "Walk"]) {
		await page.getByRole("button", { name: state, exact: true }).click();
		await page.getByLabel("Animation sample time").fill("0.25");
		const before = await host.getAttribute("data-pose-snapshot");
		await page.getByLabel("Animation sample time").fill("0.75");
		expect(await host.getAttribute("data-pose-snapshot")).not.toBe(before);
		await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
	}
});

test("inspects Golden combat one-shots without compiling a character @golden-combat-preview", async ({
	page,
}) => {
	test.setTimeout(120000);
	const requests: string[] = [];
	page.on("request", (r) => {
		if (r.url().includes("golden-combat-v3/actions.glb"))
			requests.push(r.url());
	});
	await page.goto("/", { waitUntil: "domcontentloaded" });
	const host = page.locator(
		'[data-preview-source="authored-human-canonical-v1"]',
	);
	await expect(host.locator(".preview-status")).toHaveAttribute(
		"data-status",
		"loaded",
		{ timeout: 60000 },
	);
	await expect(
		page.getByRole("button", { name: "Attack", exact: true }),
	).toBeEnabled({ timeout: 60000 });
	for (const state of ["Idle", "Walk", "Attack", "Hit", "Death"]) {
		await page.getByRole("button", { name: state, exact: true }).click();
		await expect(host).toHaveAttribute(
			"data-animation-state",
			state.toLowerCase(),
		);
		const before = await host.getAttribute("data-pose-snapshot");
		await expect
			.poll(() => host.getAttribute("data-pose-snapshot"))
			.not.toBe(before);
		await expect(host).toHaveAttribute("data-mesh-invariant-passed", "true");
	}
	await page.getByRole("button", { name: "Full Body", exact: true }).click();
	await page.getByRole("button", { name: "Death", exact: true }).click();
	await expect
		.poll(async () => Number(await host.getAttribute("data-animation-time")))
		.toBeGreaterThan(1.64);
	await page.waitForTimeout(300);
	expect(Number(await host.getAttribute("data-animation-time"))).toBeCloseTo(
		1.65,
		2,
	);
	await page.screenshot({
		path: "docs/assets/golden-combat-polish/studio-actions.png",
	});
	await page.getByRole("button", { name: "Rest", exact: true }).click();
	await expect(host).toHaveAttribute("data-animation-state", "rest");
	expect(requests).toHaveLength(1);
});
