// Explicit, bounded endpoint check. --list never launches Blender.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cloneThreeVisualAssetRoot } from "../../packages/three-asset-preview/src/index.ts";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
import { validateAuthoredHumanArtifact } from "./authored-human-roundtrip.mjs";

const base = JSON.parse(
	await readFile(
		"tools/blender-character/recipes/authored-human-canonical-v1.recipe.json",
		"utf8",
	),
);
const variants = {
	"head-wide": { headWidth: 1 },
	"head-narrow": { headWidth: -1 },
	jaw: { jaw: 1 },
	nose: { nose: 1 },
	fuller: { mass: 1 },
	athletic: { athletic: 1 },
	broad: { broadFrame: 1 },
	combined: {
		headWidth: 1,
		jaw: 1,
		nose: 1,
		mass: 1,
		athletic: 1,
		broadFrame: 1,
	},
};
const requested = process.argv.includes("--case")
	? process.argv[process.argv.indexOf("--case") + 1].split(",")
	: Object.keys(variants);
assert(requested.every((name) => variants[name]));
if (process.argv.includes("--list")) {
	console.log(
		JSON.stringify({ cases: requested, blenderPasses: requested.length }),
	);
} else {
	assert(
		process.argv.includes("--build"),
		"Use --list first, then --build to check endpoints.",
	);
	const directory = "test-results/authored-human-canonical-v1/endpoints";
	await mkdir(directory, { recursive: true });
	const neutral = JSON.parse(
		await readFile(
			"public/assets/derived/authored-humans/canonical-v1/manifest.json",
			"utf8",
		),
	);
	const results = {};
	for (const name of requested) {
		const recipe = structuredClone(base);
		Object.assign(recipe.geometrySource.values, variants[name]);
		const recipePath = `${directory}/${name}.recipe.json`;
		await writeFile(recipePath, JSON.stringify(recipe));
		const result = await compileProceduralMannequin({
			recipePath,
			outputDirectory: `${directory}/${name}`,
			mode: "preview",
			staging: true,
		});
		const validation = await validateAuthoredHumanArtifact({
			artifactPath: `${directory}/${name}/mannequin.glb`,
			recipe,
			cloneRoot: cloneThreeVisualAssetRoot,
		});
		assert.equal(
			validation.topologyFingerprint,
			neutral.topology.fingerprint,
			"Identity changed topology/UV correspondence",
		);
		assert.notEqual(
			result.manifest.geometryAndSkinningSemanticHash,
			neutral.geometryAndSkinningSemanticHash,
			"Identity did not change geometry",
		);
		results[name] = {
			passed: true,
			outputHash: result.manifest.outputHash,
			topologyFingerprint: validation.topologyFingerprint,
			animations: validation.animations,
			values: recipe.geometrySource.values,
		};
		console.log("ENDPOINT_PASS", name);
	}
	await writeFile(
		`${directory}/validation.json`,
		JSON.stringify(results, null, 2) + "\n",
	);
}
