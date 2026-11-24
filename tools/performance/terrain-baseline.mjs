import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

// Run from the repository root. No browser, network or asset compiler required.
const vite = await createServer({
	root: resolve(process.env.HOLLOW_SOURCE_ROOT ?? "."),
	configFile: false,
	optimizeDeps: { noDiscovery: true },
	server: { middlewareMode: true, hmr: false },
});
try {
	const { terrainTilesToSmoothMeshes } = await vite.ssrLoadModule(
		"/src/editor/sections/terrainBlocks.ts",
	);
	const { createCoastlinePresentation, createWaterPresentationState } =
		await vite.ssrLoadModule("/src/runtime/three/waterPresentation.ts");
	const { createGroundPresentation } = await vite.ssrLoadModule(
		"/src/runtime/three/groundPresentation.ts",
	);
	const { gameSaveProjectId } = await vite.ssrLoadModule(
		"/src/runtime/gameSave.ts",
	);
	const { migrateProject } = await vite.ssrLoadModule(
		"/src/data/migrateProject.ts",
	);
	for (const file of ["hollow-kingdom", "hollow-kingdom-chapter-one"]) {
		const project = JSON.parse(await readFile(`${file}.project.json`, "utf8"));
		const migrated = migrateProject(project);
		const hashes = [];
		let projectId;
		for (let run = 0; run < 9; run++) {
			const start = performance.now();
			projectId = gameSaveProjectId(migrated);
			if (run >= 2) hashes.push(performance.now() - start);
		}
		hashes.sort((a, b) => a - b);
		console.log(
			JSON.stringify({
				file,
				projectId,
				fingerprintMedianMs: Number(hashes[3].toFixed(2)),
			}),
		);
		for (const area of project.areas) {
			const state = createWaterPresentationState(area.theme?.atmosphere);
			const samples = [];
			let edges = 0;
			let shoreMeshes = 0;
			let triangles = 0;
			for (let run = 0; run < 9; run++) {
				const start = performance.now();
				const terrain = terrainTilesToSmoothMeshes(area);
				const shore = createCoastlinePresentation(area, state);
				const elapsed = performance.now() - start;
				if (run >= 2) samples.push(elapsed);
				edges = shore.edges.length;
				shoreMeshes = shore.meshes.length;
				triangles = terrain.reduce((n, mesh) => n + mesh.indices.length / 3, 0);
				for (const mesh of shore.meshes) {
					triangles += mesh.geometry.index.count / 3;
					mesh.geometry.dispose();
				}
			}
			samples.sort((a, b) => a - b);
			const groundMs = [];
			let pixelHash;
			for (let attempt = 0; attempt < 2; attempt++) {
				const start = performance.now();
				const ground = createGroundPresentation(area);
				await ground.ready;
				groundMs.push(Number((performance.now() - start).toFixed(2)));
				pixelHash = createHash("sha256")
					.update(ground.texture.image.data)
					.digest("hex")
					.slice(0, 16);
				ground.dispose();
			}
			console.log(
				JSON.stringify({
					file,
					area: area.name,
					edges,
					shoreMeshes,
					triangles,
					groundMs,
					pixelHash,
					buildMedianMs: Number(samples[3].toFixed(2)),
				}),
			);
			state.coastlineMaterial.dispose();
			state.shallowWaterMaterial.dispose();
			state.waterMaterial.dispose();
		}
	}
} finally {
	await vite.close();
}
