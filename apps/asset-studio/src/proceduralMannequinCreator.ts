import {
	CHARACTER_BODY_PARAMETER_LIMITS,
	CHARACTER_SKIN_APPEARANCE_LIMITS,
	type CharacterBodyParameters,
	type CharacterRecipeV1,
} from "@adventure-game-builder/character-contract";

export const PROCEDURAL_MANNEQUIN_COMPILE_ENDPOINT =
	"/__asset-studio/procedural-mannequin/compile";
export const PROCEDURAL_HUMANOID_TOPOLOGY_VERSION = "procedural-humanoid-v1";
export const PROCEDURAL_SKIN_MATERIAL_SCHEMA_VERSION =
	"procedural-skin-material-v1";
export const PROCEDURAL_SKIN_APPEARANCE = {
	color: {
		...CHARACTER_SKIN_APPEARANCE_LIMITS.skinColor,
		label: "Skin color",
	},
	roughness: {
		...CHARACTER_SKIN_APPEARANCE_LIMITS.skinRoughness,
		label: "Skin roughness",
		step: 0.01,
	},
} as const;

export const PROCEDURAL_MANNEQUIN_BODY_PARAMETERS = {
	height: {
		...CHARACTER_BODY_PARAMETER_LIMITS.height,
		label: "Height",
		step: 0.01,
	},
	shoulderWidth: {
		...CHARACTER_BODY_PARAMETER_LIMITS.shoulderWidth,
		label: "Shoulders",
		step: 0.01,
	},
	torsoLength: {
		...CHARACTER_BODY_PARAMETER_LIMITS.torsoLength,
		label: "Torso",
		step: 0.01,
	},
	armLength: {
		...CHARACTER_BODY_PARAMETER_LIMITS.armLength,
		label: "Arms",
		step: 0.01,
	},
	legLength: {
		...CHARACTER_BODY_PARAMETER_LIMITS.legLength,
		label: "Legs",
		step: 0.01,
	},
	hipWidth: {
		...CHARACTER_BODY_PARAMETER_LIMITS.hipWidth,
		label: "Hips",
		step: 0.01,
	},
} as const;

export const PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS = Object.keys(
	PROCEDURAL_MANNEQUIN_BODY_PARAMETERS,
) as Array<keyof CharacterBodyParameters>;

export type ProceduralMannequinManifest = {
	appearance: {
		skin: {
			authoredColor: string;
			authoredColorSpace: "srgb";
			authoredRoughness: number;
			canonicalLinearColor: [number, number, number];
			exportedLinearColor: [number, number, number];
			exportedMetallic: number;
			exportedRoughness: number;
			materialCount: number;
			materialName: string;
			materialSchemaVersion: string;
		};
	};
	anatomy: {
		armLengthMultiplier: number;
		armToLegRatio: number;
		armToTorsoRatio: number;
		heightScale: number;
		hipWidthMultiplier: number;
		legLengthMultiplier: number;
		legToTorsoRatio: number;
		shoulderToHipRatio: number;
		shoulderWidthMultiplier: number;
		torsoLengthMultiplier: number;
	};
	animationSet: string;
	assetId: string;
	bounds: {
		dimensions: { x: number; y: number; z: number };
		maxY: number;
		minY: number;
	};
	compilerVersion: string;
	deterministicBuild: boolean;
	geometryProfile?: "ellipsoid" | "voxel-union";
	geometryAndSkinningSemanticHash: string;
	generationDurationMs: number;
	heightMetres: number;
	proportions: CharacterBodyParameters;
	influenceStatistics: {
		maximumInfluences: number;
		maximumWeightSumError: number;
		strategy: string;
		unweightedVertexCount: number;
	};
	jointCount: number;
	knownLimitations: string[];
	materialCount: number;
	materialSemanticHash: string;
	meshCount: number;
	normalizedSemanticHash: string;
	outputHash: string;
	recipeHash: string;
	recipeId: string;
	recipeVersion: number;
	skeletonContract: string;
	skeletonSignature: string;
	topology?: {
		boundaryEdgeCount: number;
		connectedComponentCount: number;
		degenerateFaceCount: number;
		edgeCount: number;
		eulerCharacteristic: number;
		faceCount: number;
		genus: number;
		manifold: boolean;
		nonManifoldEdgeCount: number;
		unreferencedVertexCount: number;
	};
	topologyVersion?: string;
	triangleCount: number;
	validationVersion: string;
	vertexCount: number;
};

export type ProceduralMannequinCompileResult = {
	assetUrl: string;
	compilationDurationMs: number;
	generatedAt: string;
	manifest: ProceduralMannequinManifest;
	manifestUrl: string;
	requestId: string;
	status: "succeeded";
	validation: { passed: true; version: string };
};

export type ProceduralMannequinCompileFailure = {
	error: string;
	issues?: Array<{ message: string; path: string }>;
	status: "failed";
};

function anatomyMultipliers(parameters: CharacterBodyParameters) {
	return {
		arm: 0.86 + parameters.armLength * 0.28,
		hips: 0.84 + parameters.hipWidth * 0.32,
		legs: 0.88 + parameters.legLength * 0.24,
		shoulders: 0.82 + parameters.shoulderWidth * 0.36,
		torso: 0.88 + parameters.torsoLength * 0.24,
	};
}

export function validateProceduralMannequinBody(
	parameters: CharacterBodyParameters,
) {
	const issues: Array<{ message: string; path: string }> = [];
	for (const key of PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS) {
		const value = parameters[key];
		const limits = PROCEDURAL_MANNEQUIN_BODY_PARAMETERS[key];
		if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
			issues.push({
				message: `${limits.label} must be between ${limits.min} and ${limits.max} ${limits.units}.`,
				path: `$.body.parameters.${key}`,
			});
		}
	}
	if (issues.length === 0) {
		const anatomy = anatomyMultipliers(parameters);
		const armToTorso = anatomy.arm / anatomy.torso;
		if (armToTorso < 0.82) {
			issues.push({
				message:
					"Arms are impossibly short for the selected torso; increase Arms or shorten Torso.",
				path: "$.body.parameters.armLength",
			});
		}
		if (armToTorso > 1.28) {
			issues.push({
				message:
					"Arms exceed the supported animation-rig reach; shorten Arms or lengthen Torso.",
				path: "$.body.parameters.armLength",
			});
		}
		const armToLeg = anatomy.arm / anatomy.legs;
		if (armToLeg < 0.84) {
			issues.push({
				message:
					"Arms are too short to maintain the supported thigh reach for these legs.",
				path: "$.body.parameters.armLength",
			});
		}
		if (armToLeg > 1.16) {
			issues.push({
				message:
					"Arms extend below the supported thigh reach for these legs; shorten Arms or lengthen Legs.",
				path: "$.body.parameters.armLength",
			});
		}
		if (anatomy.legs / anatomy.torso < 0.82) {
			issues.push({
				message:
					"Legs would intersect the lower torso; lengthen Legs or shorten Torso.",
				path: "$.body.parameters.legLength",
			});
		}
		if (anatomy.shoulders / anatomy.hips < 0.72) {
			issues.push({
				message:
					"Shoulders are too narrow to keep the selected hips centred within rig tolerances.",
				path: "$.body.parameters.shoulderWidth",
			});
		}
	}
	return issues.length === 0
		? { issues: [], ok: true as const, value: parameters }
		: { issues, ok: false as const };
}

export function validateProceduralMannequinAppearance(
	recipe: Pick<CharacterRecipeV1, "appearance" | "palette">,
) {
	const issues: Array<{ message: string; path: string }> = [];
	if (!/^#[0-9a-fA-F]{6}$/.test(recipe.palette.skin)) {
		issues.push({
			message: "Skin color must be a six-digit sRGB hexadecimal color.",
			path: "$.palette.skin",
		});
	}
	const roughness = recipe.appearance.skin.roughness;
	if (
		!Number.isFinite(roughness) ||
		roughness < PROCEDURAL_SKIN_APPEARANCE.roughness.min ||
		roughness > PROCEDURAL_SKIN_APPEARANCE.roughness.max
	) {
		issues.push({
			message: "Skin roughness must be between 0 and 1.",
			path: "$.appearance.skin.roughness",
		});
	}
	return issues.length === 0
		? { issues: [], ok: true as const }
		: { issues, ok: false as const };
}

function seedHash(seed: string) {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
	}
	return hash >>> 0;
}

function seededRandom(seed: string) {
	let state = seedHash(seed);
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function randomizeProceduralMannequinBody(seed: string) {
	const random = seededRandom(seed);
	for (let attempt = 0; attempt < 1_000; attempt += 1) {
		const candidate = Object.fromEntries(
			PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS.map((key) => {
				const limits = PROCEDURAL_MANNEQUIN_BODY_PARAMETERS[key];
				const steps = Math.round((limits.max - limits.min) / limits.step);
				const value =
					limits.min + Math.floor(random() * (steps + 1)) * limits.step;
				return [key, Number(value.toFixed(key === "height" ? 2 : 2))];
			}),
		) as CharacterBodyParameters;
		if (validateProceduralMannequinBody(candidate).ok) return candidate;
	}
	throw new Error("Seed did not produce a valid body within 1,000 attempts.");
}

export function createProceduralMannequinCompileRequest(
	recipe: Pick<CharacterRecipeV1, "appearance" | "body" | "palette">,
) {
	return {
		appearance: {
			skinColor: recipe.palette.skin.toLowerCase(),
			skinRoughness: recipe.appearance.skin.roughness,
		},
		proportions: { ...recipe.body.parameters },
		version: 3 as const,
	};
}

export async function requestProceduralMannequinCompile(
	recipe: Pick<CharacterRecipeV1, "appearance" | "body" | "palette">,
	request: typeof fetch = fetch,
): Promise<ProceduralMannequinCompileResult> {
	const validation = validateProceduralMannequinBody(recipe.body.parameters);
	if (!validation.ok) throw new Error(validation.issues[0]?.message);
	const appearanceValidation = validateProceduralMannequinAppearance(recipe);
	if (!appearanceValidation.ok)
		throw new Error(appearanceValidation.issues[0]?.message);
	const compileRequest = createProceduralMannequinCompileRequest(recipe);
	const response = await request(PROCEDURAL_MANNEQUIN_COMPILE_ENDPOINT, {
		body: JSON.stringify(compileRequest),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const payload = (await response.json()) as
		| ProceduralMannequinCompileResult
		| ProceduralMannequinCompileFailure;
	if (!response.ok || payload.status !== "succeeded") {
		const details =
			payload.status === "failed" && payload.issues?.length
				? ` ${payload.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`
				: "";
		throw new Error(
			`${payload.status === "failed" ? payload.error : `Compile failed with HTTP ${response.status}.`}${details}`,
		);
	}
	if (
		!PROCEDURAL_MANNEQUIN_BODY_PARAMETER_KEYS.every(
			(key) =>
				payload.manifest.proportions[key] === compileRequest.proportions[key],
		) ||
		payload.manifest.appearance?.skin?.authoredColor !==
			compileRequest.appearance.skinColor ||
		payload.manifest.appearance?.skin?.authoredRoughness !==
			compileRequest.appearance.skinRoughness ||
		payload.manifest.appearance?.skin?.exportedMetallic !== 0 ||
		payload.manifest.appearance?.skin?.materialCount !== 1 ||
		payload.manifest.appearance?.skin?.materialSchemaVersion !==
			PROCEDURAL_SKIN_MATERIAL_SCHEMA_VERSION ||
		payload.manifest.outputHash.length !== 64 ||
		payload.manifest.recipeHash.length !== 64 ||
		payload.manifest.topologyVersion !== PROCEDURAL_HUMANOID_TOPOLOGY_VERSION ||
		payload.manifest.topology?.connectedComponentCount !== 1 ||
		!payload.manifest.topology?.manifold ||
		!payload.validation.passed
	) {
		throw new Error(
			"Compile endpoint returned mismatched validation metadata.",
		);
	}
	return payload;
}
