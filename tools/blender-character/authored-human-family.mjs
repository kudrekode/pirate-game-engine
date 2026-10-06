import { clothingProvenance } from "./clothing-contract.mjs";
import {
	canonicalSrgbHexToLinear,
	GOLDEN_REFERENCE_ANIMATION_SET,
} from "./procedural-mannequin-contract.mjs";
import {
	AUTHORED_HUMAN_REVISION,
	AUTHORED_HUMAN_SOURCE,
} from "./authored-human-contract.mjs";

export function authoredHumanManifest({
	recipe,
	recipeHash,
	compilerSourceHash,
	first,
	validation,
	determinism,
	mode,
	sourceImmutable,
	blenderVersion,
	warnings,
}) {
	const geometry = validation.geometry;
	const skin = recipe.appearance.skin,
		hair = recipe.appearance.hair;
	return {
		geometrySource: recipe.geometrySource,
		...(recipe.clothing === undefined ? {} : { clothing: recipe.clothing }),
		clothingProvenance: {
			...first.report.clothing,
			sources: clothingProvenance(recipe.clothing),
		},
		geometryFamily: "authored-human",
		canonicalSource: {
			path: AUTHORED_HUMAN_SOURCE,
			sha256: first.report.sourceHash,
			revision: AUTHORED_HUMAN_REVISION,
		},
		validationLevel: mode,
		compilerVersion: "authored-human-blender-v2",
		validationVersion: "authored-human-roundtrip-v2",
		compilerHash: compilerSourceHash,
		blender: {
			version: blenderVersion.version,
			buildHash: blenderVersion.buildHash,
		},
		assetId: recipe.id,
		recipeId: recipe.id,
		recipeVersion: recipe.version,
		recipeHash,
		proportions: recipe.proportions,
		heightMetres: recipe.proportions.height,
		geometryProfile: "authored-canonical",
		topologyVersion: AUTHORED_HUMAN_REVISION,
		topology: {
			stableIdentityTopology: true,
			fingerprint: validation.topologyFingerprint,
		},
		bodyStatistics: geometry,
		artifactStatistics: validation.artifact,
		...validation.artifact,
		jointCount: 65,
		skeletonContract: "golden-humanoid-v0",
		skeletonSignature: validation.skeletonSignature,
		animationSet: GOLDEN_REFERENCE_ANIMATION_SET,
		animationProfile: "mixamo-to-quaternius-v2",
		influenceStatistics: {
			...geometry,
			strategy: "canonical-local-contour-and-weight-pass",
		},
		bounds: {
			dimensions: {
				x: geometry.bounds.dimensions[0],
				y: geometry.bounds.dimensions[1],
				z: geometry.bounds.dimensions[2],
			},
			minY: geometry.bounds.minimumY,
			maxY: geometry.bounds.maximumY,
		},
		appearance: {
			skin: {
				authoredColor: skin.color,
				authoredColorSpace: "srgb",
				authoredRoughness: skin.roughness,
				canonicalLinearColor: canonicalSrgbHexToLinear(skin.color),
				exportedLinearColor: canonicalSrgbHexToLinear(skin.color),
				exportedMetallic: 0,
				exportedRoughness: skin.roughness,
				materialCount: 1,
				materialName: first.report.bodyMaterials[0],
				materialSchemaVersion: "authored-texture-tint-v1",
			},
			hair: {
				authoredColor: hair.color,
				authoredColorSpace: "srgb",
				exportedLinearColor: canonicalSrgbHexToLinear(hair.color),
				exportedMetallic: 0,
				exportedRoughness: 0.72,
				materialCount: recipe.components.hair === "none" ? 0 : 1,
				materialSchemaVersion: "procedural-hair-material-v1",
			},
			face: {
				authoredEyeColor: "source",
				materialSchemaVersion: "authored-eye-source-v1",
				materialCount: 1,
			},
		},
		components: {
			hair: {
				componentId: recipe.components.hair,
				attachmentBone: recipe.components.hair === "none" ? null : "Head",
				meshCount: recipe.components.hair === "none" ? 0 : 1,
				fitValidation: {
					passed: true,
					method:
						"canonical correspondence; endpoint visual acceptance recorded in the integration report",
				},
			},
		},
		determinism,
		deterministicBuild: Boolean(
			determinism?.binaryDeterministic &&
				determinism?.normalizedSemanticDeterministic,
		),
		outputFile: "mannequin.glb",
		outputHash: first.outputHash,
		normalizedSemanticHash: validation.semanticHash,
		geometryAndSkinningSemanticHash: validation.geometrySemanticHash,
		materialSemanticHash: validation.materialSemanticHash,
		meshNames: validation.semanticSnapshot.meshes.map((m) => m.name),
		sourceImmutable,
		warnings,
		knownLimitations: warnings,
		units: "metres",
		engineForward: "-Z after registry 180-degree Y rotation",
	};
}
