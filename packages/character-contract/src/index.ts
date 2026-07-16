export const CHARACTER_RECIPE_VERSION = 1 as const;
export const HUMANOID_V1_SKELETON_ID = "humanoid-v1" as const;
export const DEFAULT_CHARACTER_BODY_BASE_ID = "humanoid-default";
export const DEFAULT_CHARACTER_ANIMATION_SET_ID = "humanoid-basic-v1";

export type HumanoidSkeletonId = typeof HUMANOID_V1_SKELETON_ID;

export const CHARACTER_COMPONENT_SLOTS = [
	"hair",
	"headwear",
	"torso",
	"legs",
	"feet",
	"mainHand",
] as const;

export type CharacterComponentSlot = (typeof CHARACTER_COMPONENT_SLOTS)[number];

export const CHARACTER_PALETTE_REGIONS = [
	"skin",
	"hair",
	"primary",
	"secondary",
	"metal",
] as const;

export type CharacterPaletteRegion = (typeof CHARACTER_PALETTE_REGIONS)[number];

export const CHARACTER_ANIMATION_STATES = [
	"idle",
	"walk",
	"run",
	"attack",
	"defeated",
] as const;

export type CharacterAnimationState =
	(typeof CHARACTER_ANIMATION_STATES)[number];

export type CharacterBodyParameters = {
	height: number;
	shoulderWidth: number;
	torsoLength: number;
	armLength: number;
	legLength: number;
	hipWidth: number;
};

export type CharacterRecipeV1 = {
	version: typeof CHARACTER_RECIPE_VERSION;
	id: string;
	name: string;
	skeletonId: HumanoidSkeletonId;
	body: {
		baseId: string;
		parameters: CharacterBodyParameters;
	};
	components: Partial<Record<CharacterComponentSlot, string>>;
	palette: Record<CharacterPaletteRegion, string>;
	animationSetId: string;
};

export type CharacterComponentDefinition = {
	id: string;
	name: string;
	slot: CharacterComponentSlot;
	skeletonId: HumanoidSkeletonId;
	compatibleBodyBaseIds: string[];
	materialRegions?: CharacterPaletteRegion[];
	bodyMaskRegions?: string[];
	sourceAsset?: string;
};

export type CharacterAnimationClipReference = {
	assetId?: string;
	clipName: string;
};

export type CharacterAnimationSetDefinition = {
	id: string;
	name: string;
	skeletonId: HumanoidSkeletonId;
	clips: Partial<
		Record<CharacterAnimationState, CharacterAnimationClipReference>
	>;
};

export type HumanoidV1BoneName =
	| "Root"
	| "Hips"
	| "Spine"
	| "Chest"
	| "Neck"
	| "Head"
	| "LeftShoulder"
	| "LeftUpperArm"
	| "LeftLowerArm"
	| "LeftHand"
	| "RightShoulder"
	| "RightUpperArm"
	| "RightLowerArm"
	| "RightHand"
	| "LeftUpperLeg"
	| "LeftLowerLeg"
	| "LeftFoot"
	| "RightUpperLeg"
	| "RightLowerLeg"
	| "RightFoot";

export type HumanoidV1BoneDefinition = {
	name: HumanoidV1BoneName;
	parent?: HumanoidV1BoneName;
};

export const HUMANOID_V1_BONE_HIERARCHY: HumanoidV1BoneDefinition[] = [
	{ name: "Root" },
	{ name: "Hips", parent: "Root" },
	{ name: "Spine", parent: "Hips" },
	{ name: "Chest", parent: "Spine" },
	{ name: "Neck", parent: "Chest" },
	{ name: "Head", parent: "Neck" },
	{ name: "LeftShoulder", parent: "Chest" },
	{ name: "LeftUpperArm", parent: "LeftShoulder" },
	{ name: "LeftLowerArm", parent: "LeftUpperArm" },
	{ name: "LeftHand", parent: "LeftLowerArm" },
	{ name: "RightShoulder", parent: "Chest" },
	{ name: "RightUpperArm", parent: "RightShoulder" },
	{ name: "RightLowerArm", parent: "RightUpperArm" },
	{ name: "RightHand", parent: "RightLowerArm" },
	{ name: "LeftUpperLeg", parent: "Hips" },
	{ name: "LeftLowerLeg", parent: "LeftUpperLeg" },
	{ name: "LeftFoot", parent: "LeftLowerLeg" },
	{ name: "RightUpperLeg", parent: "Hips" },
	{ name: "RightLowerLeg", parent: "RightUpperLeg" },
	{ name: "RightFoot", parent: "RightLowerLeg" },
];

export const HUMANOID_V1_CONTRACT = {
	identifier: HUMANOID_V1_SKELETON_ID,
	units: "metres",
	worldUp: "+Y",
	engineForward: "-Z",
	origin: "ground-centre",
	neutralPose: "A-pose",
	neutralPoseStatus: "provisional-until-golden-kit",
	rootBone: "Root",
	hipsBone: "Hips",
	hipsParent: "Root",
	fingerBones: "deferred",
	bones: HUMANOID_V1_BONE_HIERARCHY,
} as const;

export type ValidationIssue = {
	path: string;
	message: string;
};

export type ValidationResult<T> =
	| { ok: true; value: T; issues: [] }
	| { ok: false; issues: ValidationIssue[] };

export const CHARACTER_BODY_PARAMETER_LIMITS = {
	height: {
		defaultValue: 1.82,
		min: 1.5,
		max: 2.1,
		units: "metres",
		validation: "finite number within the inclusive compiler range",
	},
	shoulderWidth: {
		defaultValue: 0.5,
		min: 0,
		max: 1,
		units: "normalized",
		validation: "finite normalized offset plus anatomical compatibility",
	},
	torsoLength: {
		defaultValue: 0.5,
		min: 0,
		max: 1,
		units: "normalized",
		validation: "finite normalized offset plus anatomical compatibility",
	},
	armLength: {
		defaultValue: 0.5,
		min: 0,
		max: 1,
		units: "normalized",
		validation: "finite normalized offset plus reach compatibility",
	},
	legLength: {
		defaultValue: 0.5,
		min: 0,
		max: 1,
		units: "normalized",
		validation: "finite normalized offset plus torso compatibility",
	},
	hipWidth: {
		defaultValue: 0.5,
		min: 0,
		max: 1,
		units: "normalized",
		validation: "finite normalized offset plus centring compatibility",
	},
} as const satisfies Record<
	keyof CharacterBodyParameters,
	{
		defaultValue: number;
		min: number;
		max: number;
		units: "metres" | "normalized";
		validation: string;
	}
>;

const COMPONENT_SLOT_SET = new Set<string>(CHARACTER_COMPONENT_SLOTS);
const PALETTE_REGION_SET = new Set<string>(CHARACTER_PALETTE_REGIONS);
const ANIMATION_STATE_SET = new Set<string>(CHARACTER_ANIMATION_STATES);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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

function readNumberInRange(
	source: Record<string, unknown>,
	key: keyof CharacterBodyParameters,
	path: string,
	issues: ValidationIssue[],
): number {
	const value = source[key];
	const limits = CHARACTER_BODY_PARAMETER_LIMITS[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		issues.push(issue(path, "Expected a finite number."));
		return limits.defaultValue;
	}
	if (value < limits.min || value > limits.max) {
		issues.push(
			issue(path, `Expected a number between ${limits.min} and ${limits.max}.`),
		);
		return limits.defaultValue;
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
	const seen = new Set<string>();
	const result: string[] = [];
	value.forEach((entry, index) => {
		if (typeof entry !== "string" || entry.trim().length === 0) {
			issues.push(issue(`${path}[${index}]`, "Expected a non-empty string."));
			return;
		}
		if (seen.has(entry)) {
			issues.push(issue(`${path}[${index}]`, `Duplicate value "${entry}".`));
			return;
		}
		seen.add(entry);
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

function readPaletteRegionArray(
	source: Record<string, unknown>,
	key: string,
	path: string,
	issues: ValidationIssue[],
): CharacterPaletteRegion[] | undefined {
	const regions = readOptionalStringArray(source, key, path, issues);
	if (!regions) {
		return undefined;
	}
	const result: CharacterPaletteRegion[] = [];
	for (const region of regions) {
		if (!PALETTE_REGION_SET.has(region)) {
			issues.push(issue(path, `Unknown palette region "${region}".`));
			continue;
		}
		result.push(region as CharacterPaletteRegion);
	}
	return result;
}

function validateSkeletonId(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): HumanoidSkeletonId {
	if (value !== HUMANOID_V1_SKELETON_ID) {
		issues.push(issue(path, `Expected "${HUMANOID_V1_SKELETON_ID}".`));
	}
	return HUMANOID_V1_SKELETON_ID;
}

export function createDefaultCharacterRecipe(
	options: { id?: string; name?: string } = {},
): CharacterRecipeV1 {
	return {
		version: CHARACTER_RECIPE_VERSION,
		id: options.id ?? "character-new",
		name: options.name ?? "New Character",
		skeletonId: HUMANOID_V1_SKELETON_ID,
		body: {
			baseId: DEFAULT_CHARACTER_BODY_BASE_ID,
			parameters: {
				height: CHARACTER_BODY_PARAMETER_LIMITS.height.defaultValue,
				shoulderWidth:
					CHARACTER_BODY_PARAMETER_LIMITS.shoulderWidth.defaultValue,
				torsoLength: CHARACTER_BODY_PARAMETER_LIMITS.torsoLength.defaultValue,
				armLength: CHARACTER_BODY_PARAMETER_LIMITS.armLength.defaultValue,
				legLength: CHARACTER_BODY_PARAMETER_LIMITS.legLength.defaultValue,
				hipWidth: CHARACTER_BODY_PARAMETER_LIMITS.hipWidth.defaultValue,
			},
		},
		components: {},
		palette: {
			skin: "#c98f65",
			hair: "#3b2a1f",
			primary: "#2f6f8f",
			secondary: "#d9a441",
			metal: "#8a949e",
		},
		animationSetId: DEFAULT_CHARACTER_ANIMATION_SET_ID,
	};
}

export function validateCharacterRecipe(
	value: unknown,
): ValidationResult<CharacterRecipeV1> {
	const issues: ValidationIssue[] = [];
	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [issue("$", "Expected a character recipe object.")],
		};
	}

	if (value.version !== CHARACTER_RECIPE_VERSION) {
		issues.push(issue("$.version", "Unsupported character recipe version."));
	}
	const id = readRequiredString(value, "id", "$.id", issues);
	const name = readRequiredString(value, "name", "$.name", issues);
	const skeletonId = validateSkeletonId(
		value.skeletonId,
		"$.skeletonId",
		issues,
	);

	const body = isRecord(value.body) ? value.body : undefined;
	if (!body) {
		issues.push(issue("$.body", "Expected a body object."));
	}
	const parameters =
		body && isRecord(body.parameters) ? body.parameters : undefined;
	if (!parameters) {
		issues.push(issue("$.body.parameters", "Expected body parameters."));
	}

	const components = isRecord(value.components) ? value.components : {};
	if (!isRecord(value.components)) {
		issues.push(issue("$.components", "Expected a components object."));
	}
	const parsedComponents: Partial<Record<CharacterComponentSlot, string>> = {};
	for (const slot of CHARACTER_COMPONENT_SLOTS) {
		const componentId = readOptionalString(
			components,
			slot,
			`$.components.${slot}`,
			issues,
		);
		if (componentId) {
			parsedComponents[slot] = componentId;
		}
	}

	const palette = isRecord(value.palette) ? value.palette : undefined;
	if (!palette) {
		issues.push(issue("$.palette", "Expected a palette object."));
	}
	const parsedPalette = {} as Record<CharacterPaletteRegion, string>;
	for (const region of CHARACTER_PALETTE_REGIONS) {
		const color = palette?.[region];
		if (typeof color !== "string" || !HEX_COLOR_PATTERN.test(color)) {
			issues.push(
				issue(`$.palette.${region}`, "Expected a #RRGGBB color string."),
			);
			parsedPalette[region] = createDefaultCharacterRecipe().palette[region];
		} else {
			parsedPalette[region] = color;
		}
	}

	const recipe: CharacterRecipeV1 = {
		version: CHARACTER_RECIPE_VERSION,
		id,
		name,
		skeletonId,
		body: {
			baseId: body
				? readRequiredString(body, "baseId", "$.body.baseId", issues)
				: DEFAULT_CHARACTER_BODY_BASE_ID,
			parameters: {
				height: parameters
					? readNumberInRange(
							parameters,
							"height",
							"$.body.parameters.height",
							issues,
						)
					: CHARACTER_BODY_PARAMETER_LIMITS.height.defaultValue,
				shoulderWidth: parameters
					? readNumberInRange(
							parameters,
							"shoulderWidth",
							"$.body.parameters.shoulderWidth",
							issues,
						)
					: CHARACTER_BODY_PARAMETER_LIMITS.shoulderWidth.defaultValue,
				torsoLength: parameters
					? readNumberInRange(
							parameters,
							"torsoLength",
							"$.body.parameters.torsoLength",
							issues,
						)
					: CHARACTER_BODY_PARAMETER_LIMITS.torsoLength.defaultValue,
				armLength: parameters
					? readNumberInRange(
							parameters,
							"armLength",
							"$.body.parameters.armLength",
							issues,
						)
					: CHARACTER_BODY_PARAMETER_LIMITS.armLength.defaultValue,
				legLength: parameters
					? readNumberInRange(
							parameters,
							"legLength",
							"$.body.parameters.legLength",
							issues,
						)
					: CHARACTER_BODY_PARAMETER_LIMITS.legLength.defaultValue,
				hipWidth: parameters
					? readNumberInRange(
							parameters,
							"hipWidth",
							"$.body.parameters.hipWidth",
							issues,
						)
					: CHARACTER_BODY_PARAMETER_LIMITS.hipWidth.defaultValue,
			},
		},
		components: parsedComponents,
		palette: parsedPalette,
		animationSetId: readRequiredString(
			value,
			"animationSetId",
			"$.animationSetId",
			issues,
		),
	};

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, value: recipe, issues: [] };
}

export function migrateCharacterRecipe(
	value: unknown,
): ValidationResult<CharacterRecipeV1> {
	if (!isRecord(value) || !isRecord(value.body)) {
		return validateCharacterRecipe(value);
	}
	const parameters = isRecord(value.body.parameters)
		? value.body.parameters
		: {};
	return validateCharacterRecipe({
		...value,
		body: {
			...value.body,
			parameters: {
				...parameters,
				torsoLength:
					parameters.torsoLength ??
					CHARACTER_BODY_PARAMETER_LIMITS.torsoLength.defaultValue,
				armLength:
					parameters.armLength ??
					CHARACTER_BODY_PARAMETER_LIMITS.armLength.defaultValue,
				legLength:
					parameters.legLength ??
					CHARACTER_BODY_PARAMETER_LIMITS.legLength.defaultValue,
				hipWidth:
					parameters.hipWidth ??
					CHARACTER_BODY_PARAMETER_LIMITS.hipWidth.defaultValue,
			},
		},
	});
}

export const parseCharacterRecipe = migrateCharacterRecipe;

export function serializeCharacterRecipe(recipe: CharacterRecipeV1): string {
	const parsed = parseCharacterRecipe(recipe);
	if (!parsed.ok) {
		throw new Error(
			`Cannot serialize invalid CharacterRecipeV1: ${parsed.issues
				.map((entry) => `${entry.path} ${entry.message}`)
				.join("; ")}`,
		);
	}
	return JSON.stringify(parsed.value, null, 2);
}

export function validateCharacterComponentDefinition(
	value: unknown,
): ValidationResult<CharacterComponentDefinition> {
	const issues: ValidationIssue[] = [];
	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [issue("$", "Expected a component definition object.")],
		};
	}

	const slotValue = value.slot;
	if (!COMPONENT_SLOT_SET.has(String(slotValue))) {
		issues.push(issue("$.slot", "Unknown component slot."));
	}

	const compatibleBodyBaseIds = readStringArray(
		value,
		"compatibleBodyBaseIds",
		"$.compatibleBodyBaseIds",
		issues,
	);
	if (compatibleBodyBaseIds.length === 0) {
		issues.push(
			issue(
				"$.compatibleBodyBaseIds",
				"Expected at least one compatible body base id.",
			),
		);
	}

	const component: CharacterComponentDefinition = {
		id: readRequiredString(value, "id", "$.id", issues),
		name: readRequiredString(value, "name", "$.name", issues),
		slot: COMPONENT_SLOT_SET.has(String(slotValue))
			? (slotValue as CharacterComponentSlot)
			: "hair",
		skeletonId: validateSkeletonId(value.skeletonId, "$.skeletonId", issues),
		compatibleBodyBaseIds,
		materialRegions: readPaletteRegionArray(
			value,
			"materialRegions",
			"$.materialRegions",
			issues,
		),
		bodyMaskRegions: readOptionalStringArray(
			value,
			"bodyMaskRegions",
			"$.bodyMaskRegions",
			issues,
		),
		sourceAsset: readOptionalString(
			value,
			"sourceAsset",
			"$.sourceAsset",
			issues,
		),
	};

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, value: component, issues: [] };
}

export function validateCharacterAnimationSetDefinition(
	value: unknown,
): ValidationResult<CharacterAnimationSetDefinition> {
	const issues: ValidationIssue[] = [];
	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [issue("$", "Expected an animation set definition object.")],
		};
	}
	const clips = isRecord(value.clips) ? value.clips : {};
	if (!isRecord(value.clips)) {
		issues.push(issue("$.clips", "Expected a clips object."));
	}
	for (const state of Object.keys(clips)) {
		if (!ANIMATION_STATE_SET.has(state)) {
			issues.push(issue(`$.clips.${state}`, "Unknown animation state."));
		}
	}

	const parsedClips: CharacterAnimationSetDefinition["clips"] = {};
	for (const state of CHARACTER_ANIMATION_STATES) {
		const reference = clips[state];
		if (reference === undefined) {
			continue;
		}
		if (!isRecord(reference)) {
			issues.push(issue(`$.clips.${state}`, "Expected a clip reference."));
			continue;
		}
		parsedClips[state] = {
			assetId: readOptionalString(
				reference,
				"assetId",
				`$.clips.${state}.assetId`,
				issues,
			),
			clipName: readRequiredString(
				reference,
				"clipName",
				`$.clips.${state}.clipName`,
				issues,
			),
		};
	}

	const animationSet: CharacterAnimationSetDefinition = {
		id: readRequiredString(value, "id", "$.id", issues),
		name: readRequiredString(value, "name", "$.name", issues),
		skeletonId: validateSkeletonId(value.skeletonId, "$.skeletonId", issues),
		clips: parsedClips,
	};

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, value: animationSet, issues: [] };
}
