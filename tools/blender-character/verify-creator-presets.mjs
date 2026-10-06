// Explicit product acceptance: --list first; --build compiles only named cases.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	AUTHORED_BODY_PRESETS,
	AUTHORED_FACE_PRESETS,
} from "../../packages/character-contract/src/authoredHumanPresets.ts";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
import { validateAuthoredHumanArtifact } from "./authored-human-roundtrip.mjs";
import { cloneThreeVisualAssetRoot } from "../../packages/three-asset-preview/src/index.ts";

const cases = Object.fromEntries([
	...AUTHORED_BODY_PRESETS.map((p) => [`body-${p.id}`, { values: p.values }]),
	...AUTHORED_FACE_PRESETS.map((p) => [`face-${p.id}`, { values: p.values }]),
	["hair-none", { values: {}, hair: "none" }],
	[
		"combined-broad",
		{
			values: {
				...AUTHORED_BODY_PRESETS[1].values,
				...AUTHORED_FACE_PRESETS[2].values,
			},
		},
	],
	[
		"combined-fuller",
		{
			values: {
				...AUTHORED_BODY_PRESETS[2].values,
				...AUTHORED_FACE_PRESETS[3].values,
			},
		},
	],
]);
const selected = process.argv.includes("--case")
	? process.argv[process.argv.indexOf("--case") + 1].split(",")
	: Object.keys(cases);
assert(
	selected.every((name) => cases[name]),
	"Unknown preset case",
);
if (process.argv.includes("--list")) {
	console.log(
		JSON.stringify({ cases: selected, blenderPasses: selected.length }),
	);
} else {
	assert(process.argv.includes("--build"), "Review --list before --build");
	const base = JSON.parse(
		await readFile(
			"tools/blender-character/recipes/authored-human-canonical-v1.recipe.json",
			"utf8",
		),
	);
	const neutral = JSON.parse(
		await readFile(
			"public/assets/derived/authored-humans/canonical-v1/manifest.json",
			"utf8",
		),
	);
	const root = "test-results/creator-product";
	await mkdir(root, { recursive: true });
	const results = {};
	for (const name of selected) {
		const recipe = structuredClone(base);
		Object.assign(recipe.geometrySource.values, cases[name].values);
		if (cases[name].hair) recipe.components.hair = cases[name].hair;
		const recipePath = `${root}/${name}.recipe.json`;
		await writeFile(recipePath, JSON.stringify(recipe, null, 2));
		const start = performance.now();
		const result = await compileProceduralMannequin({
			recipePath,
			outputDirectory: `${root}/${name}`,
			mode: "preview",
			staging: true,
		});
		const validation = await validateAuthoredHumanArtifact({
			artifactPath: `${root}/${name}/mannequin.glb`,
			recipe,
			cloneRoot: cloneThreeVisualAssetRoot,
		});
		if (!cases[name].hair)
			assert.equal(
				validation.topologyFingerprint,
				neutral.topology.fingerprint,
			);
		results[name] = {
			passed: true,
			values: recipe.geometrySource.values,
			durationMs: Math.round(performance.now() - start),
			outputHash: result.manifest.outputHash,
			animations: validation.animations,
		};
		console.log("PRESET_PASS", name, results[name].durationMs);
	}
	await writeFile(`${root}/validation.json`, JSON.stringify(results, null, 2));
}
