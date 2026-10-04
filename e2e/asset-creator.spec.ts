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
test("travels from Game Engine to Asset Creator and back @workflow-navigation", async ({
	page,
}) => {
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
	const back = studio.getByRole("link", { name: "Back to Game Engine" });
	await expect(back).toHaveAttribute("href", page.url());
	await back.click();
	await expect(studio).toHaveURL(page.url());
	await expect(
		studio.getByRole("button", { name: "Asset Creator", exact: true }),
	).toBeVisible();
});
