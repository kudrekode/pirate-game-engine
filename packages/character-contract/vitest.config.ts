import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "character-contract",
		include: ["src/**/*.test.{ts,tsx}"],
		environment: "node",
		fileParallelism: false,
		maxWorkers: 1,
		isolate: true,
	},
});
