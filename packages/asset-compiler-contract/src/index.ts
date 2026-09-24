import {
	CHARACTER_ANIMATION_STATES,
	type CharacterAnimationClipReference,
	type CharacterAnimationState,
	type CharacterRecipeV1,
	createDefaultCharacterRecipe,
	HUMANOID_V1_SKELETON_ID,
	type HumanoidSkeletonId,
	parseCharacterRecipe,
	type ValidationIssue,
	type ValidationResult,
} from "@adventure-game-builder/character-contract";

export const CHARACTER_COMPILE_CONTRACT_VERSION = 1 as const;
export const ASSET_PACKAGE_FORMAT_VERSION = 1 as const;

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export const CHARACTER_COMPILE_OUTPUT_KINDS = [
	"glb",
	"assetJson",
	"recipeJson",
	"thumbnailPng",
] as const;

export type CharacterCompileOutputKind =
	(typeof CHARACTER_COMPILE_OUTPUT_KINDS)[number];

export type CharacterCompileRequestV1 = {
	version: typeof CHARACTER_COMPILE_CONTRACT_VERSION;
	requestId?: string;
	recipe: CharacterRecipeV1;
	outputName: string;
	requestedOutputs: CharacterCompileOutputKind[];
	compiler: {
		id?: string;
		version?: string;
		options?: Record<string, JsonValue>;
	};
};

export type CharacterCompileArtifactDescriptorV1 = {
	version: typeof ASSET_PACKAGE_FORMAT_VERSION;
	kind: CharacterCompileOutputKind;
	path: string;
	mimeType: string;
	byteSize?: number;
	sha256?: string;
};

export type CharacterCompileStatus = "succeeded" | "failed" | "not_implemented";

export type CharacterCompileValidationLevel = "info" | "warning" | "error";

export type CharacterCompileValidationMessage = {
	level: CharacterCompileValidationLevel;
	path: string;
	message: string;
};

export type CompiledCharacterAssetMetadataV1 = {
	version: typeof ASSET_PACKAGE_FORMAT_VERSION;
	category: "character";
	assetId: string;
	displayName: string;
	sourceRecipeId: string;
	skeletonId: HumanoidSkeletonId;
	transforms: {
		scale: number;
		heightOffset: number;
		rotationOffsetDegrees: number;
	};
	animationMappings: Partial<
		Record<CharacterAnimationState, CharacterAnimationClipReference>
	>;
	budgets?: {
		vertexCount?: number;
		triangleCount?: number;
		boneCount?: number;
		materialCount?: number;
		textureCount?: number;
		warnings?: string[];
	};
	analysis?: {
		bounds?: {
			dimensions: { x: number; y: number; z: number };
			minY: number;
			maxY: number;
		};
	};
};

export type CharacterCompileResultV1 = {
	version: typeof CHARACTER_COMPILE_CONTRACT_VERSION;
	requestId?: string;
	status: CharacterCompileStatus;
	artifacts: CharacterCompileArtifactDescriptorV1[];
	validation: CharacterCompileValidationMessage[];
	warnings: string[];
	errors: string[];
	metadata?: CompiledCharacterAssetMetadataV1;
};

const OUTPUT_KIND_SET = new Set<string>(CHARACTER_COMPILE_OUTPUT_KINDS);
const STATUS_SET = new Set<string>(["succeeded", "failed", "not_implemented"]);
const VALIDATION_LEVEL_SET = new Set<string>(["info", "warning", "error"]);
const ANIMATION_STATE_SET = new Set<string>(CHARACTER_ANIMATION_STATES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(path: string, message: string): ValidationIssue {
	return { path, message };
}

function readRequiredString(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): string {
	const value = source[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		issues.push(issue(path, "Expected a non-empty string."));
		return "";
	}
	return value;
}

function readOptionalString(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): string | undefined {
	const value = source[key];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string" || value.trim().length === 0) {
		issues.push(issue(path, "Expected a non-empty string when present."));
		return undefined;
	}
	return value;
}

function readStringArray(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): string[] {
	const value = source[key];
	if (!Array.isArray(value)) {
		issues.push(issue(path, "Expected an array of strings."));
		return [];
	}
	const result: string[] = [];
	value.forEach((entry, index) => {
		if (typeof entry !== "string" || entry.trim().length === 0) {
			issues.push(issue(`${path}[${index}]`, "Expected a non-empty string."));
			return;
		}
		result.push(entry);
	});
	return result;
}

function readOptionalStringArray(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): string[] | undefined {
	if (source[key] === undefined) {
		return undefined;
	}
	return readStringArray(source, key, path, issues);
}

function readNumber(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): number | undefined {
	const value = source[key];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "number" || !Number.isFinite(value)) {
		issues.push(issue(path, "Expected a finite number."));
		return undefined;
	}
	return value;
}

function readRequiredNumber(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): number {
	const value = readNumber(source, key, path, issues);
	if (value === undefined) {
		issues.push(issue(path, "Expected a finite number."));
		return 0;
	}
	return value;
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
	if (depth > 20) {
		return false;
	}
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every((entry) => isJsonValue(entry, depth + 1));
	}
	if (isRecord(value)) {
		return Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
	}
	return false;
}

function readOutputKinds(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): CharacterCompileOutputKind[] {
	const values = readStringArray(source, key, path, issues);
	const seen = new Set<string>();
	const result: CharacterCompileOutputKind[] = [];
	values.forEach((value, index) => {
		if (!OUTPUT_KIND_SET.has(value)) {
			issues.push(
				issue(`${path}[${index}]`, `Unknown output kind "${value}".`),
			);
			return;
		}
		if (seen.has(value)) {
			issues.push(
				issue(`${path}[${index}]`, `Duplicate output kind "${value}".`),
			);
			return;
		}
		seen.add(value);
		result.push(value as CharacterCompileOutputKind);
	});
	if (result.length === 0) {
		issues.push(issue(path, "Expected at least one requested output."));
	}
	return result;
}

function validateArtifactDescriptor(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): CharacterCompileArtifactDescriptorV1 | undefined {
	if (!isRecord(value)) {
		issues.push(issue(path, "Expected an artifact descriptor object."));
		return undefined;
	}
	if (value.version !== ASSET_PACKAGE_FORMAT_VERSION) {
		issues.push(
			issue(`${path}.version`, "Unsupported artifact descriptor version."),
		);
	}
	const kind =
		typeof value.kind === "string" && OUTPUT_KIND_SET.has(value.kind)
			? (value.kind as CharacterCompileOutputKind)
			: undefined;
	if (!kind) {
		issues.push(issue(`${path}.kind`, "Unknown artifact kind."));
	}
	return {
		version: ASSET_PACKAGE_FORMAT_VERSION,
		kind: kind ?? "assetJson",
		path: readRequiredString(value, "path", `${path}.path`, issues),
		mimeType: readRequiredString(value, "mimeType", `${path}.mimeType`, issues),
		byteSize: readNumber(value, "byteSize", `${path}.byteSize`, issues),
		sha256: readOptionalString(value, "sha256", `${path}.sha256`, issues),
	};
}

function validateValidationMessage(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): CharacterCompileValidationMessage | undefined {
	if (!isRecord(value)) {
		issues.push(issue(path, "Expected a validation message object."));
		return undefined;
	}
	const level =
		typeof value.level === "string" && VALIDATION_LEVEL_SET.has(value.level)
			? (value.level as CharacterCompileValidationLevel)
			: undefined;
	if (!level) {
		issues.push(issue(`${path}.level`, "Unknown validation level."));
	}
	return {
		level: level ?? "error",
		path: readRequiredString(value, "path", `${path}.path`, issues),
		message: readRequiredString(value, "message", `${path}.message`, issues),
	};
}

function validateMetadataBudgets(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): CompiledCharacterAssetMetadataV1["budgets"] {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value)) {
		issues.push(issue(path, "Expected budgets object."));
		return undefined;
	}
	return {
		vertexCount: readNumber(
			value,
			"vertexCount",
			`${path}.vertexCount`,
			issues,
		),
		triangleCount: readNumber(
			value,
			"triangleCount",
			`${path}.triangleCount`,
			issues,
		),
		boneCount: readNumber(value, "boneCount", `${path}.boneCount`, issues),
		materialCount: readNumber(
			value,
			"materialCount",
			`${path}.materialCount`,
			issues,
		),
		textureCount: readNumber(
			value,
			"textureCount",
			`${path}.textureCount`,
			issues,
		),
		warnings: readOptionalStringArray(
			value,
			"warnings",
			`${path}.warnings`,
			issues,
		),
	};
}

function validateMetadataAnalysis(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): CompiledCharacterAssetMetadataV1["analysis"] {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value)) {
		issues.push(issue(path, "Expected analysis object."));
		return undefined;
	}
	if (value.bounds === undefined) {
		return {};
	}
	if (!isRecord(value.bounds)) {
		issues.push(issue(`${path}.bounds`, "Expected bounds object."));
		return {};
	}
	const bounds = value.bounds;
	const dimensions = isRecord(bounds.dimensions) ? bounds.dimensions : {};
	if (!isRecord(bounds.dimensions)) {
		issues.push(
			issue(`${path}.bounds.dimensions`, "Expected dimensions object."),
		);
	}
	return {
		bounds: {
			dimensions: {
				x: readRequiredNumber(
					dimensions,
					"x",
					`${path}.bounds.dimensions.x`,
					issues,
				),
				y: readRequiredNumber(
					dimensions,
					"y",
					`${path}.bounds.dimensions.y`,
					issues,
				),
				z: readRequiredNumber(
					dimensions,
					"z",
					`${path}.bounds.dimensions.z`,
					issues,
				),
			},
			minY: readRequiredNumber(bounds, "minY", `${path}.bounds.minY`, issues),
			maxY: readRequiredNumber(bounds, "maxY", `${path}.bounds.maxY`, issues),
		},
	};
}

function validateMetadata(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): CompiledCharacterAssetMetadataV1 | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value)) {
		issues.push(issue(path, "Expected metadata object."));
		return undefined;
	}
	if (value.version !== ASSET_PACKAGE_FORMAT_VERSION) {
		issues.push(issue(`${path}.version`, "Unsupported metadata version."));
	}
	if (value.category !== "character") {
		issues.push(issue(`${path}.category`, "Expected character category."));
	}
	if (value.skeletonId !== HUMANOID_V1_SKELETON_ID) {
		issues.push(issue(`${path}.skeletonId`, "Expected humanoid-v1 skeleton."));
	}
	const transforms = isRecord(value.transforms) ? value.transforms : {};
	if (!isRecord(value.transforms)) {
		issues.push(issue(`${path}.transforms`, "Expected transforms object."));
	}
	const mappings = isRecord(value.animationMappings)
		? value.animationMappings
		: {};
	if (!isRecord(value.animationMappings)) {
		issues.push(
			issue(`${path}.animationMappings`, "Expected animation mappings object."),
		);
	}
	const animationMappings: CompiledCharacterAssetMetadataV1["animationMappings"] =
		{};
	for (const [state, mapping] of Object.entries(mappings)) {
		if (!ANIMATION_STATE_SET.has(state)) {
			issues.push(
				issue(`${path}.animationMappings.${state}`, "Unknown animation state."),
			);
			continue;
		}
		if (!isRecord(mapping)) {
			issues.push(
				issue(
					`${path}.animationMappings.${state}`,
					"Expected animation mapping object.",
				),
			);
			continue;
		}
		animationMappings[state as CharacterAnimationState] = {
			assetId: readOptionalString(
				mapping,
				"assetId",
				`${path}.animationMappings.${state}.assetId`,
				issues,
			),
			clipName: readRequiredString(
				mapping,
				"clipName",
				`${path}.animationMappings.${state}.clipName`,
				issues,
			),
		};
	}

	return {
		version: ASSET_PACKAGE_FORMAT_VERSION,
		category: "character",
		assetId: readRequiredString(value, "assetId", `${path}.assetId`, issues),
		displayName: readRequiredString(
			value,
			"displayName",
			`${path}.displayName`,
			issues,
		),
		sourceRecipeId: readRequiredString(
			value,
			"sourceRecipeId",
			`${path}.sourceRecipeId`,
			issues,
		),
		skeletonId: HUMANOID_V1_SKELETON_ID,
		transforms: {
			scale:
				readNumber(transforms, "scale", `${path}.transforms.scale`, issues) ??
				1,
			heightOffset:
				readNumber(
					transforms,
					"heightOffset",
					`${path}.transforms.heightOffset`,
					issues,
				) ?? 0,
			rotationOffsetDegrees:
				readNumber(
					transforms,
					"rotationOffsetDegrees",
					`${path}.transforms.rotationOffsetDegrees`,
					issues,
				) ?? 0,
		},
		animationMappings,
		budgets: validateMetadataBudgets(value.budgets, `${path}.budgets`, issues),
		analysis: validateMetadataAnalysis(
			value.analysis,
			`${path}.analysis`,
			issues,
		),
	};
}

export function validateCharacterCompileRequest(
	value: unknown,
): ValidationResult<CharacterCompileRequestV1> {
	const issues: ValidationIssue[] = [];
	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [issue("$", "Expected a compile request object.")],
		};
	}
	if (value.version !== CHARACTER_COMPILE_CONTRACT_VERSION) {
		issues.push(issue("$.version", "Unsupported compile request version."));
	}
	const recipe = parseCharacterRecipe(value.recipe);
	if (!recipe.ok) {
		issues.push(
			...recipe.issues.map((entry) => ({
				...entry,
				path: `$.recipe${entry.path.slice(1)}`,
			})),
		);
	}
	const compiler = isRecord(value.compiler) ? value.compiler : {};
	if (!isRecord(value.compiler)) {
		issues.push(issue("$.compiler", "Expected compiler object."));
	}
	const options = compiler.options;
	if (options !== undefined && !isJsonValue(options)) {
		issues.push(
			issue("$.compiler.options", "Expected JSON-serializable options."),
		);
	}
	const fallbackRecipe = createDefaultCharacterRecipe({
		id: "invalid-recipe",
		name: "Invalid Recipe",
	});

	const request: CharacterCompileRequestV1 = {
		version: CHARACTER_COMPILE_CONTRACT_VERSION,
		requestId: readOptionalString(value, "requestId", "$.requestId", issues),
		recipe: recipe.ok ? recipe.value : fallbackRecipe,
		outputName: readRequiredString(value, "outputName", "$.outputName", issues),
		requestedOutputs: readOutputKinds(
			value,
			"requestedOutputs",
			"$.requestedOutputs",
			issues,
		),
		compiler: {
			id: readOptionalString(compiler, "id", "$.compiler.id", issues),
			version: readOptionalString(
				compiler,
				"version",
				"$.compiler.version",
				issues,
			),
			options: isRecord(options) && isJsonValue(options) ? options : undefined,
		},
	};

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, value: request, issues: [] };
}

export function validateCharacterCompileResult(
	value: unknown,
): ValidationResult<CharacterCompileResultV1> {
	const issues: ValidationIssue[] = [];
	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [issue("$", "Expected a compile result object.")],
		};
	}
	if (value.version !== CHARACTER_COMPILE_CONTRACT_VERSION) {
		issues.push(issue("$.version", "Unsupported compile result version."));
	}
	const status =
		typeof value.status === "string" && STATUS_SET.has(value.status)
			? (value.status as CharacterCompileStatus)
			: undefined;
	if (!status) {
		issues.push(issue("$.status", "Unknown compile status."));
	}
	const artifactsValue = value.artifacts;
	if (!Array.isArray(artifactsValue)) {
		issues.push(issue("$.artifacts", "Expected artifacts array."));
	}
	const artifacts = Array.isArray(artifactsValue)
		? artifactsValue
				.map((entry, index) =>
					validateArtifactDescriptor(entry, `$.artifacts[${index}]`, issues),
				)
				.filter((entry): entry is CharacterCompileArtifactDescriptorV1 =>
					Boolean(entry),
				)
		: [];
	const validationValue = value.validation;
	if (!Array.isArray(validationValue)) {
		issues.push(issue("$.validation", "Expected validation array."));
	}
	const validation = Array.isArray(validationValue)
		? validationValue
				.map((entry, index) =>
					validateValidationMessage(entry, `$.validation[${index}]`, issues),
				)
				.filter((entry): entry is CharacterCompileValidationMessage =>
					Boolean(entry),
				)
		: [];
	const warnings = readStringArray(value, "warnings", "$.warnings", issues);
	const errors = readStringArray(value, "errors", "$.errors", issues);
	if (status === "succeeded" && artifacts.length === 0) {
		issues.push(
			issue("$.artifacts", "Succeeded results must include artifacts."),
		);
	}
	if (
		(status === "failed" || status === "not_implemented") &&
		errors.length === 0
	) {
		issues.push(
			issue("$.errors", "Non-success results must explain the failure."),
		);
	}

	const result: CharacterCompileResultV1 = {
		version: CHARACTER_COMPILE_CONTRACT_VERSION,
		requestId: readOptionalString(value, "requestId", "$.requestId", issues),
		status: status ?? "failed",
		artifacts,
		validation,
		warnings,
		errors,
		metadata: validateMetadata(value.metadata, "$.metadata", issues),
	};

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, value: result, issues: [] };
}

export function createNotImplementedCharacterCompileResult(
	request: Pick<CharacterCompileRequestV1, "requestId"> | undefined,
	message = "Character compiler is not implemented.",
): CharacterCompileResultV1 {
	return {
		version: CHARACTER_COMPILE_CONTRACT_VERSION,
		requestId: request?.requestId,
		status: "not_implemented",
		artifacts: [],
		validation: [
			{
				level: "error",
				path: "$",
				message,
			},
		],
		warnings: [],
		errors: [message],
	};
}
