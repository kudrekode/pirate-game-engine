import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTER_HAIR_COMPONENT_IDS } from "./character-component-registry.mjs";
import {
	matrixSelectionArgument,
	selectMatrixCases,
} from "./matrix-selection.mjs";
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
	const profile = hair.fittingProfile;
	const thresholds = profile.validation;
	const width = hair.bounds.dimensions[0];
	const depth = hair.bounds.dimensions[1];
	const height = hair.bounds.dimensions[2];
	const centreX = (hair.bounds.minimum[0] + hair.bounds.maximum[0]) / 2;
	const centreZ = (hair.bounds.minimum[2] + hair.bounds.maximum[2]) / 2;
	const crownSeating = hair.bounds.maximum[2] - head.scalpTop[2];
	const neckExtension = Math.max(0, head.neckTop[2] - hair.bounds.minimum[2]);
	const validation = hair.fitValidation;
	const checks = {
		animationAttachmentValidated: hair.attachmentBone === "Head",
		aboveNeck:
			validation?.metrics.verticesAboveNeckRatio >=
			thresholds.minimumVerticesAboveNeckRatio,
		centred: Math.abs(centreX - head.headCentre[0]) <= 0.01,
		closeToScalp:
			validation?.metrics.closeToScalpRatio >=
			thresholds.minimumCloseToScalpRatio,
		compilerFitGate: validation?.passed === true,
		crownSeating:
			crownSeating >= thresholds.crownSeatingMetres[0] &&
			crownSeating <= thresholds.crownSeatingMetres[1],
		depth:
			depth / head.headDepth >= thresholds.depthRatio[0] &&
			depth / head.headDepth <= thresholds.depthRatio[1],
		height:
			height / head.headHeight >= thresholds.heightRatio[0] &&
			height / head.headHeight <= thresholds.heightRatio[1],
		neckClearance:
			validation?.metrics.neckClearanceMetres >=
			thresholds.minimumNeckClearanceMetres,
		neckExtension:
			neckExtension >= thresholds.neckExtensionMetres[0] &&
			neckExtension <= thresholds.neckExtensionMetres[1],
		profileClass:
			(profile.fitClass === "short-cap" &&
				profile.verticalScaleMode === "head-width") ||
			(["long", "updo"].includes(profile.fitClass) &&
				profile.verticalScaleMode === "head-height"),
		rearCoverage: validation?.checks.rearCoverage === true,
		scalpRange:
			validation?.metrics.scalpVerticalRangeRatio >=
			thresholds.minimumScalpVerticalRangeRatio,
		shoulderClearance:
			validation?.metrics.shoulderClearanceMetres >=
			thresholds.minimumShoulderClearanceMetres,
		thresholdsRecorded:
			JSON.stringify(validation?.thresholds) === JSON.stringify(thresholds),
		verticalCentre:
			!thresholds.requireVerticalCentreAtOrAboveHeadCentre ||
			centreZ >= head.headCentre[2],
		width:
			width / head.headWidth >= thresholds.widthRatio[0] &&
			width / head.headWidth <= thresholds.widthRatio[1],
	};
	return {
		centreX,
		checks,
		crownSeating,
		depth,
		fitValidation: validation,
		height,
		neckClearance: validation?.metrics.neckClearanceMetres,
		neckExtension,
		passed: Object.values(checks).every(Boolean),
		profileId: profile.id,
		width,
	};
}

export async function runProceduralMannequinHairstyleMatrix({
	outputRoot,
	library = false,
	caseNames,
	styleIds,
	listOnly = false,
	workspaceRoot = process.cwd(),
} = {}) {
	const baseRecipe = JSON.parse(
		await readFile(path.resolve(workspaceRoot, DEFAULT_RECIPE), "utf8"),
	);
	const root = path.resolve(
		workspaceRoot,
		outputRoot ??
			(library
				? "test-results/length-aware-hairstyle-fitting-v1/body-matrix"
				: DEFAULT_OUTPUT),
	);
	const cases = selectMatrixCases(CASES, caseNames);
	// Always retain a bald control so targeted fits still prove body/rig isolation.
	const variants = styleIds
		? [
				["none", "none"],
				...selectMatrixCases(
					CHARACTER_HAIR_COMPONENT_IDS.filter((id) => id !== "none").map(
						(id) => [id, id],
					),
					styleIds,
					"style",
				),
			]
		: library
			? CHARACTER_HAIR_COMPONENT_IDS.map((id) => [id, id])
			: [
					["bald", "none"],
					["haired", "quaternius-hair-v0"],
				];
	if (listOnly)
		return {
			caseNames: cases.map(([name]) => name),
			componentIds: variants.map(([, id]) => id),
			artifactCount: cases.length * variants.length,
			blenderPasses: cases.length * variants.length * 2,
		};
	await mkdir(root, { recursive: true });
	const results = [];
	for (const [name, overrides] of cases) {
		const pair = [];
		for (const [variant, hair] of variants) {
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
				compiled.manifest.face.validation.passed === true &&
				compiled.manifest.face.orientation.passed === true;
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
		const [bald, ...hairstyles] = pair;
		for (const haired of hairstyles) {
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
		}
		results.push(...pair);
	}
	const summary = {
		artifactCount: results.length,
		caseCount: cases.length,
		cases: results,
		componentIds: variants.map(([, id]) => id),
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
			await runProceduralMannequinHairstyleMatrix({
				outputRoot: outputIndex >= 0 ? outputRoot : undefined,
				library: process.argv.includes("--library"),
				caseNames: matrixSelectionArgument(process.argv, "--case"),
				styleIds: matrixSelectionArgument(process.argv, "--style"),
				listOnly: process.argv.includes("--list"),
			}),
			null,
			2,
		),
	);
}
