import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createWorldFixture } from "../e2e/hollow-world-fixture.mjs";

// From each checkout: npx esbuild src/editor/sections/terrainBlocks.ts --bundle
// --platform=node --format=esm --outfile=<revision>.mjs
// Then: node tools/profile-hollow-terrain.mjs <before.mjs> <after.mjs>
const paths = process.argv.slice(2);
assert.ok(
	paths.length > 0 && paths.length <= 2,
	"Pass one or two compiled terrain modules.",
);
const builders = [];
for (const path of paths) {
	const module = await import(pathToFileURL(path));
	builders.push(module.terrainTilesToSmoothMeshes);
}
const project = JSON.parse(
	await readFile("hollow-kingdom-chapter-one.project.json", "utf8"),
);
const fixture = await createWorldFixture("stress");
for (const area of [
	project.areas.find((entry) => entry.id === "hollowwood"),
	fixture.project.areas[0],
]) {
	// Warm both implementations, including group/normal/index parity, before
	// interleaving runs on the identical area object in a single JS process.
	const reference = builders[0](area);
	for (const build of builders.slice(1))
		assert.deepEqual(build(area), reference);
	const elapsed = builders.map(() => []);
	for (let sample = 0; sample < 7; sample++) {
		for (let slot = 0; slot < builders.length; slot++) {
			const index = (slot + sample + 1) % builders.length;
			const start = performance.now();
			builders[index](area);
			elapsed[index].push(Math.round((performance.now() - start) * 100) / 100);
		}
	}
	console.log(
		JSON.stringify({
			area: area.id,
			tiles: area.terrainTiles.length,
			meshSha256: createHash("sha256")
				.update(JSON.stringify(reference))
				.digest("hex"),
			measurements: elapsed.map((ms, i) => ({
				module: paths[i],
				ms,
				medianMs: ms.toSorted((a, b) => a - b)[3],
			})),
		}),
	);
}
