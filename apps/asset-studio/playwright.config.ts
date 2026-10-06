import { defineConfig } from "@playwright/test";

export default defineConfig({
	// Playwright combines config and CLI grep; allow explicit purpose selections.
	grep: process.argv.some(
		(arg) => arg === "--grep" || arg === "-g" || arg.startsWith("--grep="),
	)
		? undefined
		: /@integration/,
	testDir: "./e2e",
	forbidOnly: Boolean(process.env.CI),
	timeout: 90_000,
	workers: 1,
	use: {
		baseURL: "http://127.0.0.1:4174",
		browserName: "chromium",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		viewport: { width: 1440, height: 1000 },
	},
	webServer: {
		command:
			"npm --workspace @adventure-game-builder/asset-studio run dev -- --host 127.0.0.1 --port 4174",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: "http://127.0.0.1:4174",
	},
});
