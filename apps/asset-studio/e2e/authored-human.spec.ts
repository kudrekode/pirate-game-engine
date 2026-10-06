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
