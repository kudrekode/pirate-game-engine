import { defineConfig } from "@playwright/test";

export default defineConfig({
	forbidOnly: Boolean(process.env.CI),
	fullyParallel: false,
	outputDir: "test-results/playwright",
	reporter: [["list"]],
	testDir: "./e2e",
	timeout: 90_000,
	use: {
		baseURL: "http://127.0.0.1:5173",
		browserName: "chromium",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		viewport: { height: 1000, width: 1440 },
	},
	webServer: {
		command: "npm run dev -- --host 127.0.0.1",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: "http://127.0.0.1:5173",
	},
});
