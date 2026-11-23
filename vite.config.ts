import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { gameCharacterImportPlugin } from "./tools/blender-character/game-character-import.mjs";

export default defineConfig({
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	optimizeDeps: { include: ["three/examples/jsm/loaders/GLTFLoader.js"] },
	server: { watch: { ignored: ["**/public/assets/project-characters/**"] } },
	plugins: [react(), tailwindcss(), gameCharacterImportPlugin()],
});
