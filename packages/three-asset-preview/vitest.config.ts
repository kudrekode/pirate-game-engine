import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "three-asset-preview",
		include: ["src/**/*.test.{ts,tsx}"],
		environment: "node",
		fileParallelism: false,
		maxWorkers: 1,
		isolate: true,
	},
});
