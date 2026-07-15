import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		exclude: [
			...configDefaults.exclude,
			"e2e/**",
			"apps/asset-studio/e2e/**",
			"tools/animation-retargeting/**",
		],
		fileParallelism: false,
		maxWorkers: 1,
		setupFiles: "./src/test/setup.ts",
	},
});
