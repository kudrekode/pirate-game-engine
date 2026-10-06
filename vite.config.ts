import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { gameCharacterImportPlugin } from "./tools/blender-character/game-character-import.mjs";

export default defineConfig({
	optimizeDeps: { include: ["three/examples/jsm/loaders/GLTFLoader.js"] },
	server: { watch: { ignored: ["**/public/assets/project-characters/**"] } },
	plugins: [react(), gameCharacterImportPlugin()],
});
