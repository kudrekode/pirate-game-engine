import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProceduralMannequin } from "./procedural-mannequin-compiler.mjs";
import { validateProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

const DEFAULT_RECIPE =
	"tools/blender-character/recipes/procedural-mannequin-hair-v0.recipe.json";
const DEFAULT_OUTPUT = "test-results/hair-colour-v1/body-hair-matrix";

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
		const pair = [];
		for (const [variant, hair] of [
			["bald", "none"],
			["haired", "quaternius-hair-v0"],
		]) {
			const parsed = validateProceduralMannequinRecipe({
				...baseRecipe,
				components: { hair },
				proportions: { ...baseRecipe.proportions, ...overrides },
			});
			if (!parsed.ok) {
				throw new Error(
					`${name}/${variant} is invalid: ${JSON.stringify(parsed.issues)}`,
				);
			}
			const caseRoot = path.join(root, name, variant);
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
			const facePassed =
				compiled.manifest.face.version === "procedural-face-readability-v0" &&
				compiled.manifest.face.eyeMeshCount === 2 &&
				compiled.manifest.face.validation.passed === true;
			const fit =
				hair === "none" ? { passed: true } : hairstyleFit(compiled.manifest);
			if (!fit.passed || !facePassed) {
				throw new Error(
					`${name}/${variant} failed face or hairstyle fit: ${JSON.stringify({ face: compiled.manifest.face, fit })}`,
				);
			}
			pair.push({
				bounds: compiled.manifest.components.hair.bounds,
				derivedTransform: compiled.manifest.components.hair.derivedTransform,
				face: compiled.manifest.face,
				faceGeometrySemanticHash: compiled.manifest.faceGeometrySemanticHash,
				fit,
				geometryAndSkinningSemanticHash:
					compiled.manifest.geometryAndSkinningSemanticHash,
				head: compiled.manifest.head,
				name,
				outputHash: compiled.manifest.outputHash,
				proportions: parsed.value.proportions,
				recipeHash: compiled.manifest.recipeHash,
				skeletonSignature: compiled.manifest.skeletonSignature,
				variant,
			});
		}
		const [bald, haired] = pair;
		if (
			bald.geometryAndSkinningSemanticHash !==
				haired.geometryAndSkinningSemanticHash ||
			bald.faceGeometrySemanticHash !== haired.faceGeometrySemanticHash ||
			bald.skeletonSignature !== haired.skeletonSignature
		) {
			throw new Error(
				`${name} changed body, face, or skeleton across hair variants.`,
			);
		}
		results.push(...pair);
	}
	const summary = {
		artifactCount: results.length,
		caseCount: CASES.length,
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
