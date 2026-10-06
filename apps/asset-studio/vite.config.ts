import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { proceduralMannequinCompilePlugin } from "./dev/procedural-mannequin-compile-api.mjs";

export default defineConfig({
	optimizeDeps: { include: ["three/examples/jsm/loaders/GLTFLoader.js"] },
	server: {
		port: 5174,
		strictPort: true,
		watch: { ignored: ["**/public/assets/project-characters/**"] },
	},
	plugins: [react(), proceduralMannequinCompilePlugin()],
	publicDir: "../../public",
});
