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
	CHARACTER_COMPONENT_REGISTRY_PATH,
	NO_HAIR_COMPONENT_ID,
	resolveCharacterComponent,
	validateCharacterComponentRegistry,
} from "./character-component-registry.mjs";
import {
	canonicalizeProceduralMannequinRecipe,
	canonicalSrgbHexToLinear,
	deriveProceduralMannequinAnatomy,
	deriveProceduralMannequinMeasurements,
	GOLDEN_HUMANOID_BLENDER_REST_SIGNATURE,
	GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
	GOLDEN_HUMANOID_SKELETON_CONTRACT,
	GOLDEN_REFERENCE_ANIMATION_SET,
	hashProceduralMannequinRecipe,
	PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
	PROCEDURAL_MANNEQUIN_COMPILER_VERSION,
	PROCEDURAL_MANNEQUIN_VALIDATION_VERSION,
	PROCEDURAL_SKIN_COLOR_SPACE,
	PROCEDURAL_SKIN_MATERIAL_NAME,
	PROCEDURAL_SKIN_MATERIAL_SCHEMA_VERSION,
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
	componentRegistry: CHARACTER_COMPONENT_REGISTRY_PATH,
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
	"tools/blender-character/character-component-registry.mjs",
	CHARACTER_COMPONENT_REGISTRY_PATH,
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

function expectedSkinMaterial(recipe) {
	return {
		linearColor: canonicalSrgbHexToLinear(recipe.appearance.skin.color),
		name: PROCEDURAL_SKIN_MATERIAL_NAME,
		roughness: recipe.appearance.skin.roughness,
	};
}

function expectedHairComponent(recipe) {
	const componentId = recipe.components.hair;
	return {
		componentId,
		definition:
			componentId === NO_HAIR_COMPONENT_ID
				? undefined
				: resolveCharacterComponent(componentId),
	};
}

async function hashFile(filePath) {
	return sha256(await readFile(filePath));
}

export function buildProceduralMannequinScriptArguments({
	componentRegistryPath = PROCEDURAL_MANNEQUIN_PATHS.componentRegistry,
	compilerVersion = PROCEDURAL_MANNEQUIN_COMPILER_VERSION,
	outputPath,
	recipePath,
	reportPath,
	templatePath = PROCEDURAL_MANNEQUIN_PATHS.template,
	workspaceRoot = process.cwd(),
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
		"--component-registry",
		path.resolve(workspaceRoot, componentRegistryPath),
		"--workspace-root",
		path.resolve(workspaceRoot),
	];
}

async function compilerHash(workspaceRoot = process.cwd()) {
	const sources = await Promise.all(
		COMPILER_SOURCE_PATHS.map(async (filePath) => ({
			filePath: portable(filePath),
			hash: await hashFile(path.resolve(workspaceRoot, filePath)),
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
	workspaceRoot = process.cwd(),
}) {
	const outputPath = path.join(directory, OUTPUT_NAMES.glb);
	const reportPath = path.join(directory, "blender-report.json");
	const scriptArguments = buildProceduralMannequinScriptArguments({
		componentRegistryPath: PROCEDURAL_MANNEQUIN_PATHS.componentRegistry,
		outputPath,
		recipePath,
		reportPath,
		templatePath,
		workspaceRoot,
	});
	const blenderArguments = buildHeadlessBlenderArguments(
		path.resolve(workspaceRoot, PROCEDURAL_MANNEQUIN_PATHS.script),
		scriptArguments,
	);
	const { stderr, stdout } = await execFileImpl(blender, blenderArguments, {
		cwd: workspaceRoot,
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
	workspaceRoot = process.cwd(),
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
			expectedHeightMetres: parsed.value.proportions.height,
			expectedHairComponent: expectedHairComponent(parsed.value),
			expectedSkinMaterial: expectedSkinMaterial(parsed.value),
			templatePath,
			workspaceRoot,
		}),
		readFile(path.join(outputDirectory, OUTPUT_NAMES.manifest), "utf8").then(
			JSON.parse,
		),
		hashFile(artifactPath),
	]);
	const checks = {
		manifestAppearance:
			manifest.appearance?.skin?.authoredColor ===
				parsed.value.appearance.skin.color &&
			manifest.appearance?.skin?.authoredRoughness ===
				parsed.value.appearance.skin.roughness &&
			manifest.appearance?.skin?.exportedMetallic === 0 &&
			manifest.appearance?.skin?.materialCount === 1,
		manifestGeometryAndSkinningHash:
			manifest.geometryAndSkinningSemanticHash ===
			validation.geometrySemanticHash,
		manifestGenerationDuration:
			Number.isFinite(manifest.generationDurationMs) &&
			manifest.generationDurationMs > 0,
		manifestHeight: manifest.heightMetres === parsed.value.proportions.height,
		manifestHair:
			manifest.components?.hair?.componentId === parsed.value.components.hair &&
			manifest.components?.hair?.meshCount === validation.hair.meshCount &&
			manifest.components?.hair?.triangleCount ===
				validation.hair.triangleCount &&
			manifest.components?.hair?.attachmentBone ===
				validation.hair.attachmentBone &&
			(parsed.value.components.hair === NO_HAIR_COMPONENT_ID ||
				manifest.components?.hair?.fitValidation?.passed === true),
		manifestArtifactStatistics:
			manifest.meshCount === validation.artifact.meshCount &&
			manifest.materialCount === validation.artifact.materialCount &&
			manifest.vertexCount === validation.artifact.vertexCount &&
			manifest.triangleCount === validation.artifact.triangleCount,
		manifestProportions:
			JSON.stringify(manifest.proportions) ===
			JSON.stringify(parsed.value.proportions),
		manifestOutputHash: manifest.outputHash === outputHash,
		manifestMaterialHash:
			manifest.materialSemanticHash === validation.materialSemanticHash,
		manifestRecipeHash:
			manifest.recipeHash === hashProceduralMannequinRecipe(parsed.value),
		manifestSemanticHash:
			manifest.normalizedSemanticHash === validation.semanticHash,
		manifestValidationVersion:
			manifest.validationVersion === PROCEDURAL_MANNEQUIN_VALIDATION_VERSION,
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
	workspaceRoot = process.cwd(),
} = {}) {
	const compilationStartedAt = performance.now();
	const rawRecipe = JSON.parse(await readFile(recipePath, "utf8"));
	const parsed = validateProceduralMannequinRecipe(rawRecipe);
	if (!parsed.ok) {
		throw new Error(
			`Recipe validation failed: ${parsed.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
		);
	}
	const recipe = parsed.value;
	const registryValidation = await validateCharacterComponentRegistry({
		workspaceRoot,
	});
	const hairComponent = expectedHairComponent(recipe);
	const anatomy = deriveProceduralMannequinAnatomy(recipe.proportions);
	const measurements = deriveProceduralMannequinMeasurements(
		recipe.proportions,
	);
	const recipeHash = hashProceduralMannequinRecipe(recipe);
	const blender = requestedBlender ?? (await discoverBlender());
	const blenderVersion = await readBlenderVersion(blender, { execFileImpl });
	const templateBufferPath = path.join(
		path.dirname(templatePath),
		path.basename(PROCEDURAL_MANNEQUIN_PATHS.templateBuffer),
	);
	const immutablePaths = [
		recipePath,
		templatePath,
		templateBufferPath,
		path.resolve(workspaceRoot, PROCEDURAL_MANNEQUIN_PATHS.componentRegistry),
		...(hairComponent.definition
			? [
					hairComponent.definition.license.path,
					...hairComponent.definition.sourceFiles.map((source) => source.path),
				].map((filePath) => path.resolve(workspaceRoot, filePath))
			: []),
	];
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
		const canonicalRecipePath = path.join(stagingRoot, "canonical.recipe.json");
		await Promise.all([
			mkdir(firstDirectory, { recursive: true }),
			mkdir(secondDirectory, { recursive: true }),
			writeFile(
				canonicalRecipePath,
				canonicalizeProceduralMannequinRecipe(recipe),
			),
		]);
		const first = await runPass({
			blender,
			directory: firstDirectory,
			execFileImpl,
			recipePath: canonicalRecipePath,
			templatePath,
			workspaceRoot,
		});
		const second = await runPass({
			blender,
			directory: secondDirectory,
			execFileImpl,
			recipePath: canonicalRecipePath,
			templatePath,
			workspaceRoot,
		});
		const [firstValidation, secondValidation] = await Promise.all([
			validateProceduralMannequinArtifact({
				artifactPath: first.outputPath,
				expectedHeightMetres: recipe.proportions.height,
				expectedHairComponent: hairComponent,
				expectedSkinMaterial: expectedSkinMaterial(recipe),
				templatePath,
				workspaceRoot,
			}),
			validateProceduralMannequinArtifact({
				artifactPath: second.outputPath,
				expectedHeightMetres: recipe.proportions.height,
				expectedHairComponent: hairComponent,
				expectedSkinMaterial: expectedSkinMaterial(recipe),
				templatePath,
				workspaceRoot,
			}),
		]);
		if (!firstValidation.passed || !secondValidation.passed) {
			throw new Error(
				`Procedural mannequin round trip failed: ${JSON.stringify({ first: firstValidation.checks, firstHair: firstValidation.hair, second: secondValidation.checks, secondHair: secondValidation.hair })}`,
			);
		}
		if (
			firstValidation.skeletonSignature !==
				GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE ||
			secondValidation.skeletonSignature !==
				GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE
		) {
			throw new Error(
				"Generated GLB changed the Golden exported rest signature.",
			);
		}
		for (const pass of [first, second]) {
			const expectedMaterial = expectedSkinMaterial(recipe);
			if (
				pass.report.material?.name !== expectedMaterial.name ||
				pass.report.material?.schemaVersion !==
					PROCEDURAL_SKIN_MATERIAL_SCHEMA_VERSION ||
				pass.report.material?.metallic !== 0 ||
				Math.abs(pass.report.material?.roughness - expectedMaterial.roughness) >
					0.000001 ||
				pass.report.material?.canonicalLinearColor?.some(
					(value, index) =>
						Math.abs(value - expectedMaterial.linearColor[index]) > 0.000001,
				)
			) {
				throw new Error("Blender skin material did not match the recipe.");
			}
			for (const [key, expected] of Object.entries(anatomy)) {
				if (Math.abs(pass.report.anatomy?.[key] - expected) > 0.000001) {
					throw new Error(
						`Blender anatomy mismatch for ${key}; expected ${expected}.`,
					);
				}
			}
			for (const [key, expected] of Object.entries(measurements)) {
				if (
					typeof expected === "number" &&
					Math.abs(pass.report.measurements?.[key] - expected) > 0.000001
				) {
					throw new Error(
						`Blender measurement mismatch for ${key}; expected ${expected}.`,
					);
				}
			}
			if (
				pass.report.geometry.topologyVersion !==
					PROCEDURAL_HUMANOID_TOPOLOGY_VERSION ||
				pass.report.geometry.topology.connectedComponentCount !== 1 ||
				!pass.report.geometry.topology.manifold ||
				pass.report.geometry.topology.boundaryEdgeCount !== 0 ||
				pass.report.geometry.topology.degenerateFaceCount !== 0 ||
				pass.report.geometry.topology.genus !== 0 ||
				pass.report.geometry.topology.nonManifoldEdgeCount !== 0
			) {
				throw new Error(
					`Generated topology failed the V2 connectivity gate: ${JSON.stringify(pass.report.geometry.topology)}`,
				);
			}
			if (
				hairComponent.definition &&
				(pass.report.components?.hair?.fittingProfile?.version !== 2 ||
					pass.report.components?.hair?.fitValidation?.passed !== true)
			) {
				throw new Error(
					"Generated hairstyle failed its geometry-aware fit gate.",
				);
			}
			if (
				pass.report.skeleton.restSignature !==
				GOLDEN_HUMANOID_BLENDER_REST_SIGNATURE
			) {
				throw new Error(
					"Generated skeleton changed the Golden Blender rest signature.",
				);
			}
			if (
				pass.report.anatomy.maximumBoneRelativeAnchorOffset > 0.45 ||
				pass.report.anatomy.lateralCentreError > 0.000001
			) {
				throw new Error(
					"Generated bone-relative anchors are outside compiler tolerances.",
				);
			}
		}
		const determinism = {
			binaryDeterministic: first.outputHash === second.outputHash,
			firstOutputHash: first.outputHash,
			geometryAndSkinningDeterministic:
				firstValidation.geometrySemanticHash ===
				secondValidation.geometrySemanticHash,
			materialDeterministic:
				firstValidation.materialSemanticHash ===
				secondValidation.materialSemanticHash,
			nodeHierarchyDeterministic:
				JSON.stringify(firstValidation.semanticSnapshot.hierarchy) ===
				JSON.stringify(secondValidation.semanticSnapshot.hierarchy),
			normalizedSemanticDeterministic:
				firstValidation.semanticHash === secondValidation.semanticHash,
			secondOutputHash: second.outputHash,
			headContractDeterministic:
				JSON.stringify(first.report.head) ===
				JSON.stringify(second.report.head),
			hairstyleFitDeterministic:
				JSON.stringify(first.report.components?.hair?.derivedTransform) ===
					JSON.stringify(second.report.components?.hair?.derivedTransform) &&
				JSON.stringify(first.report.components?.hair?.fitValidation) ===
					JSON.stringify(second.report.components?.hair?.fitValidation),
			skeletonDeterministic:
				firstValidation.skeletonSignature ===
				secondValidation.skeletonSignature,
			topologyAndWeightsDeterministic:
				JSON.stringify(firstValidation.semanticSnapshot.meshes) ===
				JSON.stringify(secondValidation.semanticSnapshot.meshes),
		};
		if (
			!determinism.nodeHierarchyDeterministic ||
			!determinism.headContractDeterministic ||
			!determinism.hairstyleFitDeterministic ||
			!determinism.geometryAndSkinningDeterministic ||
			!determinism.materialDeterministic ||
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
		const compilerSourceHash = await compilerHash(workspaceRoot);
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
			anatomy,
			animationProfile: "mixamo-to-quaternius-v2",
			animationSet: GOLDEN_REFERENCE_ANIMATION_SET,
			assetId: recipe.id,
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
			head: first.report.head,
			compilerHash: compilerSourceHash,
			compilerVersion: PROCEDURAL_MANNEQUIN_COMPILER_VERSION,
			components: {
				hair: hairComponent.definition
					? {
							attachmentBone: hairComponent.definition.expectedAttachmentBone,
							attachmentStrategy: hairComponent.definition.attachmentStrategy,
							compilerCompatibilityVersion:
								hairComponent.definition.compilerCompatibilityVersion,
							componentId: hairComponent.componentId,
							fittingProfile: hairComponent.definition.fittingProfile,
							license: hairComponent.definition.license,
							knownLimitations: hairComponent.definition.knownLimitations,
							bounds: first.report.components.hair.bounds,
							derivedTransform: first.report.components.hair.derivedTransform,
							exportedBounds: firstValidation.hair.bounds,
							fitValidation: first.report.components.hair.fitValidation,
							materialCount: firstValidation.hair.materialCount,
							materialNames: firstValidation.hair.materialNames,
							meshCount: firstValidation.hair.meshCount,
							objectName: firstValidation.hair.objectName,
							normalizedTransform: hairComponent.definition.normalizedTransform,
							provider: hairComponent.definition.provider,
							packName: hairComponent.definition.packName,
							sourceAsset: hairComponent.definition.sourceAsset,
							sourceBounds: first.report.components.hair.sourceBounds,
							sourceFiles: hairComponent.definition.sourceFiles,
							sourceTransform: hairComponent.definition.sourceTransform,
							textureCount: firstValidation.hair.textureCount,
							textureNames: firstValidation.hair.textureNames,
							triangleCount: firstValidation.hair.triangleCount,
							vertexCount: firstValidation.hair.vertexCount,
						}
					: {
							attachmentBone: null,
							componentId: NO_HAIR_COMPONENT_ID,
							materialCount: 0,
							meshCount: 0,
							textureCount: 0,
							triangleCount: 0,
							vertexCount: 0,
						},
			},
			determinism,
			deterministicBuild:
				determinism.binaryDeterministic &&
				determinism.normalizedSemanticDeterministic,
			engineForward: "-Z after registry 180-degree Y rotation",
			geometryProfile: recipe.geometry.profile,
			measurements,
			heightMetres: recipe.proportions.height,
			influenceStatistics: {
				maximumInfluences: geometry.maximumInfluences,
				maximumWeightSumError: geometry.maximumWeightSumError,
				outOfRangeJointCount: geometry.outOfRangeJointCount,
				strategy: first.report.skinning.strategy,
				unweightedVertexCount: geometry.unweightedVertexCount,
			},
			jointCount: firstValidation.inspection.jointCount,
			knownLimitations: warnings,
			appearance: {
				skin: {
					authoredColor: recipe.appearance.skin.color,
					authoredColorSpace: PROCEDURAL_SKIN_COLOR_SPACE,
					authoredRoughness: recipe.appearance.skin.roughness,
					canonicalLinearColor: expectedSkinMaterial(recipe).linearColor,
					exportedLinearColor: firstValidation.material.exportedLinearColor,
					exportedMetallic: firstValidation.material.exportedMetallic,
					exportedRoughness: firstValidation.material.exportedRoughness,
					materialCount: firstValidation.material.materialCount,
					materialName: firstValidation.material.materialName,
					materialSchemaVersion: PROCEDURAL_SKIN_MATERIAL_SCHEMA_VERSION,
				},
			},
			artifactStatistics: firstValidation.artifact,
			bodyStatistics: {
				materialCount: geometry.materialCount,
				meshCount: geometry.meshCount,
				triangleCount: geometry.triangleCount,
				vertexCount: geometry.vertexCount,
			},
			materialCount: firstValidation.artifact.materialCount,
			meshCount: firstValidation.artifact.meshCount,
			meshNames: firstValidation.semanticSnapshot.meshes.map(
				(mesh) => mesh.name,
			),
			normalizedSemanticHash: firstValidation.semanticHash,
			geometryAndSkinningSemanticHash: firstValidation.geometrySemanticHash,
			materialSemanticHash: firstValidation.materialSemanticHash,
			outputFile: OUTPUT_NAMES.glb,
			outputHash: await hashFile(outputPath),
			proportions: recipe.proportions,
			recipeHash,
			recipeId: recipe.id,
			recipeVersion: recipe.version,
			skeletonContract: GOLDEN_HUMANOID_SKELETON_CONTRACT,
			skeletonSignature: firstValidation.skeletonSignature,
			sourceImmutable,
			componentRegistry: {
				path: PROCEDURAL_MANNEQUIN_PATHS.componentRegistry,
				validated: registryValidation.passed,
				version: registryValidation.version,
			},
			templateHashes: {
				buffer: immutableBefore[portable(templateBufferPath)],
				gltf: immutableBefore[portable(templatePath)],
			},
			triangleCount: firstValidation.artifact.triangleCount,
			topology: geometry.topology,
			topologyVersion: PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
			units: "metres",
			validationVersion: PROCEDURAL_MANNEQUIN_VALIDATION_VERSION,
			vertexCount: firstValidation.artifact.vertexCount,
			warnings,
		};
		manifest.generationDurationMs = Math.round(
			performance.now() - compilationStartedAt,
		);
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
			`heightMetres=${recipe.proportions.height}`,
			`proportions=${JSON.stringify(recipe.proportions)}`,
			`firstOutputHash=${first.outputHash}`,
			`secondOutputHash=${second.outputHash}`,
			`binaryDeterministic=${determinism.binaryDeterministic}`,
			`semanticHash=${firstValidation.semanticHash}`,
			`semanticDeterministic=${determinism.normalizedSemanticDeterministic}`,
			`roundTripPassed=${firstValidation.passed}`,
			`validationVersion=${PROCEDURAL_MANNEQUIN_VALIDATION_VERSION}`,
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
