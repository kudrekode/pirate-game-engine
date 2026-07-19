import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 90_000,
	use: {
		baseURL: "http://127.0.0.1:4174",
		browserName: "chromium",
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
