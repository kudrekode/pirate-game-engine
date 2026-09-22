import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	compileProceduralMannequin,
	PROCEDURAL_MANNEQUIN_PATHS,
} from "./procedural-mannequin-compiler.mjs";
import { validateProceduralMannequinRecipe } from "./procedural-mannequin-contract.mjs";

const DEFAULT_OUTPUT = "test-results/face-readability-v0/appearance-matrix";
const APPEARANCES = [
	["tone-1-matte", "#f1c7a5", 0.82, "#4b5d67"],
	["tone-3-balanced", "#c98f65", 0.62, "#4b5d67"],
	["tone-5-balanced", "#7d4f38", 0.62, "#4b5d67"],
	["tone-6-smooth", "#503126", 0.36, "#4b5d67"],
	["eye-charcoal", "#c98f65", 0.72, "#30343b"],
	["eye-earth", "#c98f65", 0.72, "#5c4634"],
	["eye-moss", "#c98f65", 0.72, "#53624b"],
	["eye-ocean", "#c98f65", 0.72, "#405c72"],
];

export async function runProceduralMannequinAppearanceMatrix({
	outputRoot = DEFAULT_OUTPUT,
	workspaceRoot = process.cwd(),
} = {}) {
	const baseRecipe = JSON.parse(
		await readFile(
			path.resolve(workspaceRoot, PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe),
			"utf8",
		),
	);
	const root = path.resolve(workspaceRoot, outputRoot);
	await mkdir(root, { recursive: true });
	const cases = [];
	for (const [name, color, roughness, eyeColor] of APPEARANCES) {
		const parsed = validateProceduralMannequinRecipe({
			...baseRecipe,
			appearance: {
				face: { eyeColor },
				skin: { color, colorSpace: "srgb", roughness },
			},
		});
		if (!parsed.ok)
			throw new Error(`${name}: ${JSON.stringify(parsed.issues)}`);
		const caseRoot = path.join(root, name);
		const recipePath = path.join(caseRoot, "input.recipe.json");
		await mkdir(caseRoot, { recursive: true });
		await writeFile(recipePath, `${JSON.stringify(parsed.value, null, 2)}\n`);
		const result = await compileProceduralMannequin({
			clean: true,
			outputDirectory: path.join(caseRoot, "output"),
			recipePath,
			staging: true,
			workspaceRoot,
		});
		const manifest = result.manifest;
		if (
			manifest.appearance.skin.authoredColor !== color ||
			manifest.appearance.skin.authoredRoughness !== roughness ||
			manifest.appearance.skin.exportedMetallic !== 0 ||
			manifest.appearance.skin.materialCount !== 1 ||
			manifest.appearance.face.authoredEyeColor !== eyeColor ||
			manifest.appearance.face.materialCount !== 1 ||
			manifest.face.eyeMeshCount !== 2 ||
			manifest.face.validation.passed !== true
		) {
			throw new Error(`${name} did not preserve its authored material.`);
		}
		cases.push({
			appearance: manifest.appearance,
			faceGeometrySemanticHash: manifest.faceGeometrySemanticHash,
			geometryAndSkinningSemanticHash: manifest.geometryAndSkinningSemanticHash,
			materialSemanticHash: manifest.materialSemanticHash,
			name,
			outputHash: manifest.outputHash,
			recipeHash: manifest.recipeHash,
			skeletonSignature: manifest.skeletonSignature,
		});
	}
	const invariant = (key) =>
		new Set(cases.map((entry) => entry[key])).size === 1;
	const variant = (key) =>
		new Set(cases.map((entry) => entry[key])).size === cases.length;
	const checks = {
		faceGeometryStable: invariant("faceGeometrySemanticHash"),
		geometryAndSkinningStable: invariant("geometryAndSkinningSemanticHash"),
		materialChanges: variant("materialSemanticHash"),
		outputChanges: variant("outputHash"),
		recipeChanges: variant("recipeHash"),
		skeletonStable: invariant("skeletonSignature"),
	};
	if (!Object.values(checks).every(Boolean)) {
		throw new Error(`Appearance isolation failed: ${JSON.stringify(checks)}`);
	}
	const summary = { caseCount: cases.length, cases, checks, passed: true };
	await writeFile(
		path.join(root, "summary.json"),
		`${JSON.stringify(summary, null, 2)}\n`,
	);
	return summary;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	const outputIndex = process.argv.indexOf("--output-root");
	const outputRoot =
		outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
	console.log(
		JSON.stringify(
			await runProceduralMannequinAppearanceMatrix({ outputRoot }),
			null,
			2,
		),
	);
}
