import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		name: "asset-studio",
		include: ["src/**/*.test.{ts,tsx}"],
		environment: "node",
		fileParallelism: false,
		maxWorkers: 1,
		isolate: true,
		// App.test.tsx opts into jsdom and imports testSetup; creator tests are pure.
	},
});
