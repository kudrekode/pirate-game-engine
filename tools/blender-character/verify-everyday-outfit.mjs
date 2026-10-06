import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
const cases = {
	athletic: {},
	fuller: { mass: 1, broadFrame: 0.15 },
	broad: { athletic: 0.25, broadFrame: 1 },
	custom: { mass: 0.5, athletic: 0.4, broadFrame: 0.4 },
	unclothed: {},
};
const args = process.argv.slice(2);
const selected = (args[args.indexOf("--case") + 1] ?? "").split(",");
assert(
	args.includes("--case") && selected.every((c) => c in cases),
	"Use --case athletic,fuller,broad,custom,unclothed",
);
if (args.includes("--list")) {
	console.log(
		JSON.stringify({
			cases: selected,
			builds: selected.length,
			blenderPasses: selected.length,
			mode: "preview",
		}),
	);
	process.exit(0);
}
assert(args.includes("--build"), "Use --list or --build");
const root = "test-results/first-outfit/compiled";
const base = JSON.parse(
	await readFile(
		"tools/blender-character/recipes/authored-human-everyday-v1.recipe.json",
		"utf8",
	),
);
const summary = {};
for (const c of selected) {
	const recipe = structuredClone(base);
	Object.assign(recipe.geometrySource.values, cases[c]);
	if (c === "unclothed") delete recipe.clothing;
	await mkdir(`${root}/${c}`, { recursive: true });
	const recipePath = `${root}/${c}/input.recipe.json`;
	await writeFile(recipePath, JSON.stringify(recipe, null, 2));
	const result = await compileProceduralMannequin({
		recipePath,
		outputDirectory: `${root}/${c}`,
		mode: "preview",
		staging: true,
	});
	summary[c] = {
		triangles: result.manifest.triangleCount,
		materials: result.manifest.materialCount,
		bytes: (await stat(`${root}/${c}/mannequin.glb`)).size,
		milliseconds: result.manifest.generationDurationMs,
		outputHash: result.manifest.outputHash,
		roundTrip: result.diagnostics.roundTrip.passed,
	};
	console.log(c, JSON.stringify(summary[c]));
}
await writeFile(
	`${root}/summary-${selected.join("-")}.json`,
	JSON.stringify(summary, null, 2),
);
