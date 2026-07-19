import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
import { validateProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

const DEFAULT_RECIPE =
	"tools/blender-character/recipes/procedural-mannequin-hair-v0.recipe.json";
const DEFAULT_OUTPUT = "test-results/procedural-head-hair-v1/body-fit-matrix";

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
	[
		"short-broad-long-torso",
		{
			height: 1.55,
			shoulderWidth: 0.9,
			torsoLength: 0.82,
			armLength: 0.62,
			legLength: 0.45,
			hipWidth: 0.7,
		},
	],
	[
		"tall-narrow-long-limbs",
		{
			height: 2.04,
			shoulderWidth: 0.15,
			torsoLength: 0.35,
			armLength: 0.72,
			legLength: 0.78,
			hipWidth: 0.25,
		},
	],
];

function hairstyleFit(manifest) {
	const hair = manifest.components.hair;
	const head = manifest.head;
	const width = hair.bounds.dimensions[0];
	const depth = hair.bounds.dimensions[1];
	const centreX = (hair.bounds.minimum[0] + hair.bounds.maximum[0]) / 2;
	const crownSeating = hair.bounds.maximum[2] - head.scalpTop[2];
	const neckClearance = hair.bounds.minimum[2] - head.neckTop[2];
	const validation = hair.fitValidation;
	const checks = {
		animationAttachmentValidated: hair.attachmentBone === "Head",
		centred: Math.abs(centreX - head.headCentre[0]) <= 0.01,
		compilerFitGate: validation?.passed === true,
		crownSeating: crownSeating >= 0.006 && crownSeating <= 0.02,
		depth: depth / head.headDepth >= 0.82 && depth / head.headDepth <= 1.12,
		neckClearance:
			validation?.metrics.verticesAboveNeckRatio >= 0.9 &&
			neckClearance >= -0.025,
		rearCoverage: validation?.checks.rearCoverage === true,
		scalpRange: validation?.metrics.scalpVerticalRangeRatio >= 0.68,
		shoulderClearance: validation?.metrics.shoulderClearanceMetres >= 0.025,
		width: width / head.headWidth >= 0.86 && width / head.headWidth <= 1.08,
	};
	return {
		centreX,
		checks,
		crownSeating,
		depth,
		fitValidation: validation,
		neckClearance,
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
			derivedTransform: compiled.manifest.components.hair.derivedTransform,
			fit,
			head: compiled.manifest.head,
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
