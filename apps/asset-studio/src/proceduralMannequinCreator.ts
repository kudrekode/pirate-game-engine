import type { CharacterRecipeV1 } from "@adventure-game-builder/character-contract";

export const PROCEDURAL_MANNEQUIN_COMPILE_ENDPOINT =
	"/__asset-studio/procedural-mannequin/compile";
export const PROCEDURAL_MANNEQUIN_HEIGHT = {
	defaultValue: 1.82,
	max: 2.1,
	min: 1.5,
	step: 0.01,
	units: "metres",
} as const;

export type ProceduralMannequinManifest = {
	animationSet: string;
	assetId: string;
	bounds: {
		dimensions: { x: number; y: number; z: number };
		maxY: number;
		minY: number;
	};
	compilerVersion: string;
	deterministicBuild: boolean;
	generationDurationMs: number;
	heightMetres: number;
	influenceStatistics: {
		maximumInfluences: number;
		unweightedVertexCount: number;
	};
	jointCount: number;
	knownLimitations: string[];
	materialCount: number;
	meshCount: number;
	normalizedSemanticHash: string;
	outputHash: string;
	recipeHash: string;
	recipeId: string;
	recipeVersion: number;
	skeletonContract: string;
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

export function validateProceduralMannequinHeight(heightMetres: number) {
	return Number.isFinite(heightMetres) &&
		heightMetres >= PROCEDURAL_MANNEQUIN_HEIGHT.min &&
		heightMetres <= PROCEDURAL_MANNEQUIN_HEIGHT.max
		? { ok: true as const, value: heightMetres }
		: {
				message: `Height must be between ${PROCEDURAL_MANNEQUIN_HEIGHT.min.toFixed(2)} and ${PROCEDURAL_MANNEQUIN_HEIGHT.max.toFixed(2)} metres.`,
				ok: false as const,
			};
}

export function createProceduralMannequinCompileRequest(
	recipe: Pick<CharacterRecipeV1, "body">,
) {
	return {
		heightMetres: recipe.body.parameters.height,
		version: 1 as const,
	};
}

export async function requestProceduralMannequinCompile(
	recipe: Pick<CharacterRecipeV1, "body">,
	request: typeof fetch = fetch,
): Promise<ProceduralMannequinCompileResult> {
	const compileRequest = createProceduralMannequinCompileRequest(recipe);
	const heightValidation = validateProceduralMannequinHeight(
		compileRequest.heightMetres,
	);
	if (!heightValidation.ok) throw new Error(heightValidation.message);
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
		payload.manifest.heightMetres !== compileRequest.heightMetres ||
		payload.manifest.outputHash.length !== 64 ||
		payload.manifest.recipeHash.length !== 64 ||
		!payload.validation.passed
	) {
		throw new Error(
			"Compile endpoint returned mismatched validation metadata.",
		);
	}
	return payload;
}
