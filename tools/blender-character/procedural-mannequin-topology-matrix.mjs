import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
import {
	GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
	PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	PROCEDURAL_MANNEQUIN_LIMITS,
	PROCEDURAL_MANNEQUIN_PARAMETER_KEYS,
	validateProceduralMannequinRecipe,
} from "./procedural-mannequin-contract.mjs";

const DEFAULT_RECIPE =
	"tools/blender-character/recipes/procedural-mannequin-v0.recipe.json";
const DEFAULT_OUTPUT = "test-results/generated-body-topology-v1/matrix";

const randomBodies = [
	[
		"seed-topology-11",
		{
			height: 1.57,
			shoulderWidth: 0.37,
			torsoLength: 0.29,
			armLength: 0.45,
			legLength: 0.62,
			hipWidth: 0.55,
		},
	],
	[
		"seed-topology-22",
		{
			height: 1.94,
			shoulderWidth: 0.71,
			torsoLength: 0.61,
			armLength: 0.68,
			legLength: 0.52,
			hipWidth: 0.34,
		},
	],
	[
		"seed-topology-33",
		{
			height: 1.76,
			shoulderWidth: 0.18,
			torsoLength: 0.72,
			armLength: 0.54,
			legLength: 0.41,
			hipWidth: 0.66,
		},
	],
	[
		"seed-topology-44",
		{
			height: 2.03,
			shoulderWidth: 0.84,
			torsoLength: 0.22,
			armLength: 0.57,
			legLength: 0.79,
			hipWidth: 0.28,
		},
	],
	[
		"seed-topology-55",
		{
			height: 1.63,
			shoulderWidth: 0.43,
			torsoLength: 0.83,
			armLength: 0.63,
			legLength: 0.36,
			hipWidth: 0.77,
		},
	],
];

const challengingBodies = [
	[
		"long-torso-short-arms",
		{
			height: 1.82,
			shoulderWidth: 0.5,
			torsoLength: 1,
			armLength: 0.25,
			legLength: 0.4,
			hipWidth: 0.5,
		},
	],
	[
		"narrow-shoulders-wide-hips",
		{
			height: 1.82,
			shoulderWidth: 0.05,
			torsoLength: 0.5,
			armLength: 0.5,
			legLength: 0.5,
			hipWidth: 1,
		},
	],
	[
		"long-legs-compact-torso",
		{
			height: 2.1,
			shoulderWidth: 0.62,
			torsoLength: 0,
			armLength: 0.45,
			legLength: 1,
			hipWidth: 0.4,
		},
	],
];

export function proceduralMannequinTopologyMatrixCases(defaults) {
	const cases = [["default", defaults]];
	for (const key of PROCEDURAL_MANNEQUIN_PARAMETER_KEYS) {
		for (const extreme of ["min", "max"]) {
			cases.push([
				`${key}-${extreme}`,
				{ ...defaults, [key]: PROCEDURAL_MANNEQUIN_LIMITS[key][extreme] },
			]);
		}
	}
	return [...cases, ...randomBodies, ...challengingBodies];
}

export async function runProceduralMannequinTopologyMatrix({
	outputRoot = DEFAULT_OUTPUT,
	workspaceRoot = process.cwd(),
} = {}) {
	const baseRecipe = JSON.parse(
		await readFile(path.resolve(workspaceRoot, DEFAULT_RECIPE), "utf8"),
	);
	const cases = proceduralMannequinTopologyMatrixCases(baseRecipe.proportions);
	await mkdir(path.resolve(workspaceRoot, outputRoot), { recursive: true });
	const results = [];
	for (const [name, proportions] of cases) {
		const recipe = { ...baseRecipe, proportions };
		const parsed = validateProceduralMannequinRecipe(recipe);
		if (!parsed.ok) {
			throw new Error(`${name} is invalid: ${JSON.stringify(parsed.issues)}`);
		}
		const caseRoot = path.resolve(workspaceRoot, outputRoot, name);
		const recipePath = path.join(caseRoot, "input.recipe.json");
		await mkdir(caseRoot, { recursive: true });
		await writeFile(recipePath, `${JSON.stringify(parsed.value, null, 2)}\n`);
		const compiled = await compileProceduralMannequin({
			clean: true,
			outputDirectory: path.join(caseRoot, "output"),
			recipePath,
			staging: true,
			workspaceRoot,
		});
		const manifest = compiled.manifest;
		if (
			manifest.topologyVersion !== PROCEDURAL_HUMANOID_TOPOLOGY_VERSION ||
			manifest.topology.connectedComponentCount !== 1 ||
			!manifest.topology.manifold ||
			manifest.topology.genus !== 0 ||
			manifest.skeletonSignature !== GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE
		) {
			throw new Error(`${name} failed the topology matrix contract.`);
		}
		results.push({
			bounds: manifest.bounds,
			generationDurationMs: manifest.generationDurationMs,
			name,
			outputHash: manifest.outputHash,
			proportions,
			recipeHash: manifest.recipeHash,
			skeletonSignature: manifest.skeletonSignature,
			triangleCount: manifest.triangleCount,
			vertexCount: manifest.vertexCount,
		});
	}
	const summary = {
		caseCount: results.length,
		cases: results,
		passed: true,
		topologyVersion: PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	};
	await writeFile(
		path.resolve(workspaceRoot, outputRoot, "summary.json"),
		`${JSON.stringify(summary, null, 2)}\n`,
	);
	return summary;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	const outputIndex = process.argv.indexOf("--output-root");
	const outputRoot =
		outputIndex >= 0 ? process.argv[outputIndex + 1] : DEFAULT_OUTPUT;
	const summary = await runProceduralMannequinTopologyMatrix({ outputRoot });
	console.log(JSON.stringify(summary, null, 2));
}
