import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Explicit DOM ownership; helper tests (even helpers imported from TSX) use Node.
// Add mounted UI/browser-global tests here. The two sets must stay disjoint.
const domTests = [
	"src/test/**/*.test.tsx",
	"src/editor/sections/CameraEditor.test.tsx",
	"src/editor/sections/ThreeVisualControls.test.tsx",
	"src/editor/sections/ThreeVisualEditorIntegration.test.tsx",
	"src/runtime/three/*.test.tsx",
	"src/runtime/three/threePerformanceDiagnostics.test.ts",
];

export default defineConfig({
	test: {
		fileParallelism: false,
		maxWorkers: 1,
		isolate: true,
		projects: [
			{
				test: {
					name: "root-node",
					include: ["src/**/*.test.{ts,tsx}"],
					exclude: [...configDefaults.exclude, ...domTests],
					environment: "node",
					isolate: true,
				},
			},
			{
				plugins: [react()],
				test: {
					name: "root-dom",
					include: domTests,
					environment: "jsdom",
					setupFiles: ["./src/test/setup.ts"],
					isolate: true,
				},
			},
			"apps/asset-studio/vitest.config.ts",
			"packages/character-contract/vitest.config.ts",
			"packages/asset-compiler-contract/vitest.config.ts",
			"packages/three-asset-preview/vitest.config.ts",
		],
	},
});
