import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { proceduralMannequinCompilePlugin } from "./dev/procedural-mannequin-compile-api.mjs";

export default defineConfig({
	plugins: [react(), proceduralMannequinCompilePlugin()],
	publicDir: "../../public",
});
