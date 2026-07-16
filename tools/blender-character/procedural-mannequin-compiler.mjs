import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
	buildHeadlessBlenderArguments,
	discoverBlender,
	readBlenderVersion,
} from "./blender-discovery.mjs";
import {
	canonicalizeProceduralMannequinRecipe,
	GOLDEN_HUMANOID_SKELETON_CONTRACT,
	GOLDEN_REFERENCE_ANIMATION_SET,
	hashProceduralMannequinRecipe,
	PROCEDURAL_MANNEQUIN_COMPILER_VERSION,
	validateProceduralMannequinRecipe,
} from "./procedural-mannequin-contract.mjs";
import { validateProceduralMannequinArtifact } from "./procedural-mannequin-roundtrip.mjs";

const execFileAsync = promisify(execFile);
export const PROCEDURAL_MANNEQUIN_PATHS = Object.freeze({
	animationProfile:
		"tools/blender-character/profiles/mixamo-to-quaternius-v2.json",
	defaultOutput: "public/assets/derived/procedural-humanoids/mannequin-v0",
	defaultRecipe:
		"tools/blender-character/recipes/procedural-mannequin-v0.recipe.json",
	script: "tools/blender-character/generate_procedural_mannequin.py",
	template:
		"public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf",
	templateBuffer:
		"public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.bin",
});
const COMPILER_SOURCE_PATHS = [
	"tools/blender-character/generate_procedural_mannequin.py",
	"tools/blender-character/procedural-mannequin-compiler.mjs",
	"tools/blender-character/procedural-mannequin-contract.mjs",
	"tools/blender-character/procedural-mannequin-roundtrip.mjs",
];
const OUTPUT_NAMES = Object.freeze({
	buildLog: "build.log",
	diagnostics: "diagnostics.json",
	glb: "mannequin.glb",
	manifest: "manifest.json",
	recipe: "recipe.snapshot.json",
});

const sha256 = (input) => createHash("sha256").update(input).digest("hex");
const portable = (filePath) => filePath.replaceAll(path.sep, "/");

async function hashFile(filePath) {
	return sha256(await readFile(filePath));
}

export function buildProceduralMannequinScriptArguments({
	compilerVersion = PROCEDURAL_MANNEQUIN_COMPILER_VERSION,
	outputPath,
	recipePath,
	reportPath,
	templatePath = PROCEDURAL_MANNEQUIN_PATHS.template,
}) {
	return [
		"--recipe",
		path.resolve(recipePath),
		"--template",
		path.resolve(templatePath),
		"--output",
		path.resolve(outputPath),
		"--report",
		path.resolve(reportPath),
		"--compiler-version",
		compilerVersion,
	];
}

async function compilerHash() {
	const sources = await Promise.all(
		COMPILER_SOURCE_PATHS.map(async (filePath) => ({
			filePath: portable(filePath),
			hash: await hashFile(filePath),
		})),
	);
	return sha256(JSON.stringify(sources));
}

async function runPass({
	blender,
	directory,
	execFileImpl = execFileAsync,
	recipePath,
	templatePath,
}) {
	const outputPath = path.join(directory, OUTPUT_NAMES.glb);
	const reportPath = path.join(directory, "blender-report.json");
	const scriptArguments = buildProceduralMannequinScriptArguments({
		outputPath,
		recipePath,
		reportPath,
		templatePath,
	});
	const blenderArguments = buildHeadlessBlenderArguments(
		path.resolve(PROCEDURAL_MANNEQUIN_PATHS.script),
		scriptArguments,
	);
	const { stderr, stdout } = await execFileImpl(blender, blenderArguments, {
		cwd: process.cwd(),
		maxBuffer: 32 * 1024 * 1024,
		timeout: 10 * 60 * 1000,
		windowsHide: true,
	});
	return {
		blenderArguments,
		outputHash: await hashFile(outputPath),
		outputPath,
		report: JSON.parse(await readFile(reportPath, "utf8")),
		reportPath,
		stderr,
		stdout,
	};
}

function stripSemanticSnapshot(validation) {
	const { semanticSnapshot, ...portableValidation } = validation;
	return {
		...portableValidation,
		semanticStructure: semanticSnapshot,
	};
}

export async function validateInstalledProceduralMannequin({
	outputDirectory = PROCEDURAL_MANNEQUIN_PATHS.defaultOutput,
	recipePath = PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe,
	templatePath = PROCEDURAL_MANNEQUIN_PATHS.template,
} = {}) {
	const rawRecipe = JSON.parse(await readFile(recipePath, "utf8"));
	const parsed = validateProceduralMannequinRecipe(rawRecipe);
	if (!parsed.ok) {
		throw new Error(
			`Recipe validation failed: ${parsed.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
		);
	}
	const artifactPath = path.join(outputDirectory, OUTPUT_NAMES.glb);
	const [validation, manifest, outputHash] = await Promise.all([
		validateProceduralMannequinArtifact({
			artifactPath,
			expectedHeightMetres: parsed.value.proportions.heightMetres,
			templatePath,
		}),
		readFile(path.join(outputDirectory, OUTPUT_NAMES.manifest), "utf8").then(
			JSON.parse,
		),
		hashFile(artifactPath),
	]);
	const checks = {
		manifestOutputHash: manifest.outputHash === outputHash,
		manifestRecipeHash:
			manifest.recipeHash === hashProceduralMannequinRecipe(parsed.value),
		manifestSemanticHash:
			manifest.normalizedSemanticHash === validation.semanticHash,
		roundTrip: validation.passed,
	};
	return {
		checks,
		manifest,
		outputHash,
		passed: Object.values(checks).every(Boolean),
		validation: stripSemanticSnapshot(validation),
	};
}

export async function compileProceduralMannequin({
	blender: requestedBlender,
	clean = false,
	execFileImpl = execFileAsync,
	outputDirectory = PROCEDURAL_MANNEQUIN_PATHS.defaultOutput,
	recipePath = PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe,
	staging = false,
	templatePath = PROCEDURAL_MANNEQUIN_PATHS.template,
} = {}) {
	const rawRecipe = JSON.parse(await readFile(recipePath, "utf8"));
	const parsed = validateProceduralMannequinRecipe(rawRecipe);
	if (!parsed.ok) {
		throw new Error(
			`Recipe validation failed: ${parsed.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
		);
	}
	const recipe = parsed.value;
	const recipeHash = hashProceduralMannequinRecipe(recipe);
	const blender = requestedBlender ?? (await discoverBlender());
	const blenderVersion = await readBlenderVersion(blender, { execFileImpl });
	const templateBufferPath = path.join(
		path.dirname(templatePath),
		path.basename(PROCEDURAL_MANNEQUIN_PATHS.templateBuffer),
	);
	const immutablePaths = [recipePath, templatePath, templateBufferPath];
	const immutableBefore = Object.fromEntries(
		await Promise.all(
			immutablePaths.map(async (filePath) => [
				portable(filePath),
				await hashFile(filePath),
			]),
		),
	);
	const stagingRoot = await mkdtemp(
		path.join(os.tmpdir(), "procedural-mannequin-v0-"),
	);
	try {
		const firstDirectory = path.join(stagingRoot, "first");
		const secondDirectory = path.join(stagingRoot, "second");
		await Promise.all([
			mkdir(firstDirectory, { recursive: true }),
			mkdir(secondDirectory, { recursive: true }),
		]);
		const first = await runPass({
			blender,
			directory: firstDirectory,
			execFileImpl,
			recipePath,
			templatePath,
		});
		const second = await runPass({
			blender,
			directory: secondDirectory,
			execFileImpl,
			recipePath,
			templatePath,
		});
		const [firstValidation, secondValidation] = await Promise.all([
			validateProceduralMannequinArtifact({
				artifactPath: first.outputPath,
				expectedHeightMetres: recipe.proportions.heightMetres,
				templatePath,
			}),
			validateProceduralMannequinArtifact({
				artifactPath: second.outputPath,
				expectedHeightMetres: recipe.proportions.heightMetres,
				templatePath,
			}),
		]);
		if (!firstValidation.passed || !secondValidation.passed) {
			throw new Error(
				`Procedural mannequin round trip failed: ${JSON.stringify({ first: firstValidation.checks, second: secondValidation.checks })}`,
			);
		}
		const determinism = {
			binaryDeterministic: first.outputHash === second.outputHash,
			firstOutputHash: first.outputHash,
			nodeHierarchyDeterministic:
				JSON.stringify(firstValidation.semanticSnapshot.hierarchy) ===
				JSON.stringify(secondValidation.semanticSnapshot.hierarchy),
			normalizedSemanticDeterministic:
				firstValidation.semanticHash === secondValidation.semanticHash,
			secondOutputHash: second.outputHash,
			skeletonDeterministic:
				firstValidation.skeletonSignature ===
				secondValidation.skeletonSignature,
			topologyAndWeightsDeterministic:
				JSON.stringify(firstValidation.semanticSnapshot.meshes) ===
				JSON.stringify(secondValidation.semanticSnapshot.meshes),
		};
		if (
			!determinism.nodeHierarchyDeterministic ||
			!determinism.normalizedSemanticDeterministic ||
			!determinism.skeletonDeterministic ||
			!determinism.topologyAndWeightsDeterministic
		) {
			throw new Error(
				`Repeated builds were not semantically deterministic: ${JSON.stringify(determinism)}`,
			);
		}
		const immutableAfter = Object.fromEntries(
			await Promise.all(
				immutablePaths.map(async (filePath) => [
					portable(filePath),
					await hashFile(filePath),
				]),
			),
		);
		const sourceImmutable =
			JSON.stringify(immutableBefore) === JSON.stringify(immutableAfter);
		if (!sourceImmutable) {
			throw new Error(
				"Recipe or Golden skeleton template changed during compile.",
			);
		}
		if (clean) await rm(outputDirectory, { force: true, recursive: true });
		await mkdir(outputDirectory, { recursive: true });
		const outputPath = path.join(outputDirectory, OUTPUT_NAMES.glb);
		await copyFile(first.outputPath, outputPath);
		const compilerSourceHash = await compilerHash();
		const warnings = [
			...first.report.warnings,
			...(determinism.binaryDeterministic
				? []
				: [
						"Blender GLB bytes differed between builds; normalized scene, topology, weights, skeleton, and material data matched.",
					]),
		];
		const geometry = firstValidation.geometry;
		const manifest = {
			animationProfile: "mixamo-to-quaternius-v2",
			animationSet: GOLDEN_REFERENCE_ANIMATION_SET,
			assetId: "procedural-mannequin-v0",
			blender: {
				buildHash: blenderVersion.buildHash,
				version: blenderVersion.version,
			},
			bounds: {
				dimensions: {
					x: geometry.bounds.dimensions[0],
					y: geometry.bounds.dimensions[1],
					z: geometry.bounds.dimensions[2],
				},
				maxY: geometry.bounds.maximumY,
				minY: geometry.bounds.minimumY,
			},
			compilerHash: compilerSourceHash,
			compilerVersion: PROCEDURAL_MANNEQUIN_COMPILER_VERSION,
			determinism,
			deterministicBuild:
				determinism.binaryDeterministic &&
				determinism.normalizedSemanticDeterministic,
			engineForward: "-Z after registry 180-degree Y rotation",
			geometryProfile: recipe.geometry.profile,
			influenceStatistics: {
				maximumInfluences: geometry.maximumInfluences,
				maximumWeightSumError: geometry.maximumWeightSumError,
				outOfRangeJointCount: geometry.outOfRangeJointCount,
				strategy: first.report.skinning.strategy,
				unweightedVertexCount: geometry.unweightedVertexCount,
			},
			jointCount: firstValidation.inspection.jointCount,
			knownLimitations: warnings,
			materialCount: geometry.materialCount,
			meshCount: geometry.meshCount,
			meshNames: firstValidation.semanticSnapshot.meshes.map(
				(mesh) => mesh.name,
			),
			normalizedSemanticHash: firstValidation.semanticHash,
			outputFile: OUTPUT_NAMES.glb,
			outputHash: await hashFile(outputPath),
			recipeHash,
			recipeId: recipe.id,
			recipeVersion: recipe.version,
			skeletonContract: GOLDEN_HUMANOID_SKELETON_CONTRACT,
			skeletonSignature: firstValidation.skeletonSignature,
			sourceImmutable,
			templateHashes: {
				buffer: immutableBefore[portable(templateBufferPath)],
				gltf: immutableBefore[portable(templatePath)],
			},
			triangleCount: geometry.triangleCount,
			units: "metres",
			vertexCount: geometry.vertexCount,
			warnings,
		};
		const diagnostics = {
			artifactStatus: "procedural-compiled-validated",
			blenderReport: first.report,
			buildMode: staging ? "staging" : "derived-artifact",
			determinism,
			roundTrip: stripSemanticSnapshot(firstValidation),
			secondRoundTrip: {
				checks: secondValidation.checks,
				passed: secondValidation.passed,
				semanticHash: secondValidation.semanticHash,
				skeletonSignature: secondValidation.skeletonSignature,
			},
			sourceHashesAfter: immutableAfter,
			sourceHashesBefore: immutableBefore,
			sourceImmutable,
		};
		const buildLog = [
			`compiler=${PROCEDURAL_MANNEQUIN_COMPILER_VERSION}`,
			`blender=${blenderVersion.version}`,
			`blenderBuild=${blenderVersion.buildHash}`,
			`recipeHash=${recipeHash}`,
			`firstOutputHash=${first.outputHash}`,
			`secondOutputHash=${second.outputHash}`,
			`binaryDeterministic=${determinism.binaryDeterministic}`,
			`semanticHash=${firstValidation.semanticHash}`,
			`semanticDeterministic=${determinism.normalizedSemanticDeterministic}`,
			`roundTripPassed=${firstValidation.passed}`,
			`sourceImmutable=${sourceImmutable}`,
		].join("\n");
		await Promise.all([
			writeFile(
				path.join(outputDirectory, OUTPUT_NAMES.manifest),
				`${JSON.stringify(manifest, null, 2)}\n`,
			),
			writeFile(
				path.join(outputDirectory, OUTPUT_NAMES.diagnostics),
				`${JSON.stringify(diagnostics, null, 2)}\n`,
			),
			writeFile(
				path.join(outputDirectory, OUTPUT_NAMES.recipe),
				canonicalizeProceduralMannequinRecipe(recipe),
			),
			writeFile(
				path.join(outputDirectory, OUTPUT_NAMES.buildLog),
				`${buildLog}\n`,
			),
		]);
		return {
			blender: blenderVersion,
			diagnostics,
			manifest,
			outputDirectory,
		};
	} finally {
		await rm(stagingRoot, { force: true, recursive: true });
	}
}

export function parseCliArguments(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith("--")) continue;
		const key = argument.slice(2);
		if (["clean", "staging", "validate-only"].includes(key)) {
			result[key] = true;
			continue;
		}
		if (argv[index + 1] === undefined || argv[index + 1].startsWith("--")) {
			throw new Error(`Missing value for ${argument}.`);
		}
		result[key] = argv[index + 1];
		index += 1;
	}
	return result;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const options = parseCliArguments(process.argv.slice(2));
	const common = {
		outputDirectory:
			options["output-dir"] ?? PROCEDURAL_MANNEQUIN_PATHS.defaultOutput,
		recipePath: options.recipe ?? PROCEDURAL_MANNEQUIN_PATHS.defaultRecipe,
		templatePath: options.template ?? PROCEDURAL_MANNEQUIN_PATHS.template,
	};
	const result = options["validate-only"]
		? await validateInstalledProceduralMannequin(common)
		: await compileProceduralMannequin({
				...common,
				blender: options.blender,
				clean: Boolean(options.clean),
				staging: Boolean(options.staging),
			});
	console.log(JSON.stringify(result, null, 2));
}
