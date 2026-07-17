import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
import { validateProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

const DEFAULT_RECIPE =
	"tools/blender-character/recipes/procedural-mannequin-hair-v0.recipe.json";
const DEFAULT_OUTPUT = "test-results/hairstyle-slot-v1/body-fit-matrix";

const CASES = [
	["default", {}],
	["minimum-height", { height: 1.5 }],
	["maximum-height", { height: 2.1 }],
	[
		"narrow-frame-short-torso-long-legs",
		{ shoulderWidth: 0, hipWidth: 0.15, torsoLength: 0, legLength: 1 },
	],
	[
		"broad-frame-long-torso-short-legs",
		{ shoulderWidth: 1, hipWidth: 0.85, torsoLength: 1, legLength: 0.4 },
	],
	[
		"seed-hair-11",
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
		"seed-hair-22",
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
		"seed-hair-33",
		{
			height: 1.76,
			shoulderWidth: 0.18,
			torsoLength: 0.72,
			armLength: 0.54,
			legLength: 0.41,
			hipWidth: 0.66,
		},
	],
];

function hairstyleFit(manifest) {
	const hair = manifest.components.hair;
	const heightScale = manifest.heightMetres / 1.82;
	const width = hair.bounds.dimensions[0];
	const depth = hair.bounds.dimensions[2];
	const centreX = (hair.bounds.minimum[0] + hair.bounds.maximum[0]) / 2;
	const crownClearance = hair.bounds.maximum[1] - manifest.bounds.maxY;
	const backCoverage = manifest.bounds.maxY - hair.bounds.minimum[1];
	const checks = {
		animationAttachmentValidated: hair.attachmentBone === "Head",
		backCoverage:
			backCoverage >= 0.1 * heightScale && backCoverage <= 0.3 * heightScale,
		centred: Math.abs(centreX) <= 0.005 * heightScale,
		crownClearance:
			crownClearance >= 0.005 * heightScale &&
			crownClearance <= 0.08 * heightScale,
		depth: depth >= 0.12 && depth <= 0.34,
		width: width >= 0.14 && width <= 0.38,
	};
	return {
		backCoverage,
		centreX,
		checks,
		crownClearance,
		depth,
		passed: Object.values(checks).every(Boolean),
		width,
	};
}

export async function runProceduralMannequinHairstyleMatrix({
	outputRoot = DEFAULT_OUTPUT,
	workspaceRoot = process.cwd(),
} = {}) {
	const baseRecipe = JSON.parse(
		await readFile(path.resolve(workspaceRoot, DEFAULT_RECIPE), "utf8"),
	);
	const root = path.resolve(workspaceRoot, outputRoot);
	await mkdir(root, { recursive: true });
	const results = [];
	for (const [name, overrides] of CASES) {
		const parsed = validateProceduralMannequinRecipe({
			...baseRecipe,
			proportions: { ...baseRecipe.proportions, ...overrides },
		});
		if (!parsed.ok) {
			throw new Error(`${name} is invalid: ${JSON.stringify(parsed.issues)}`);
		}
		const caseRoot = path.join(root, name);
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
		const fit = hairstyleFit(compiled.manifest);
		if (!fit.passed) {
			throw new Error(`${name} failed hairstyle fit: ${JSON.stringify(fit)}`);
		}
		results.push({
			bounds: compiled.manifest.components.hair.bounds,
			fit,
			name,
			outputHash: compiled.manifest.outputHash,
			proportions: parsed.value.proportions,
			recipeHash: compiled.manifest.recipeHash,
		});
	}
	const summary = {
		caseCount: results.length,
		cases: results,
		componentId: "quaternius-hair-v0",
		passed: true,
	};
	await writeFile(
		path.join(root, "summary.json"),
		`${JSON.stringify(summary, null, 2)}\n`,
	);
	return summary;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	const outputIndex = process.argv.indexOf("--output-root");
	const outputRoot =
		outputIndex >= 0 ? process.argv[outputIndex + 1] : DEFAULT_OUTPUT;
	console.log(
		JSON.stringify(
			await runProceduralMannequinHairstyleMatrix({ outputRoot }),
			null,
			2,
		),
	);
}
