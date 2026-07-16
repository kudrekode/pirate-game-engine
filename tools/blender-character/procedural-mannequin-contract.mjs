import { createHash } from "node:crypto";

export const PROCEDURAL_MANNEQUIN_RECIPE_VERSION = 1;
export const PROCEDURAL_MANNEQUIN_COMPILER_VERSION =
	"procedural-mannequin-blender-v1";
export const PROCEDURAL_MANNEQUIN_VALIDATION_VERSION =
	"procedural-mannequin-roundtrip-v2";
export const GOLDEN_HUMANOID_SKELETON_CONTRACT = "golden-humanoid-v0";
export const GOLDEN_REFERENCE_ANIMATION_SET = "golden-reference-v0";

export const PROCEDURAL_MANNEQUIN_PARAMETER_KEYS = Object.freeze([
	"height",
	"shoulderWidth",
	"torsoLength",
	"armLength",
	"legLength",
	"hipWidth",
]);

export const PROCEDURAL_MANNEQUIN_LIMITS = Object.freeze({
	height: {
		defaultValue: 1.82,
		max: 2.1,
		min: 1.5,
		step: 0.01,
		units: "metres",
		validation: "finite number within the inclusive compiler range",
	},
	shoulderWidth: {
		defaultValue: 0.5,
		max: 1,
		min: 0,
		step: 0.01,
		units: "normalized",
		validation: "finite normalized offset compatible with hip width",
	},
	torsoLength: {
		defaultValue: 0.5,
		max: 1,
		min: 0,
		step: 0.01,
		units: "normalized",
		validation: "finite normalized offset compatible with limb reach",
	},
	armLength: {
		defaultValue: 0.5,
		max: 1,
		min: 0,
		step: 0.01,
		units: "normalized",
		validation: "finite normalized offset that reaches the upper thigh",
	},
	legLength: {
		defaultValue: 0.5,
		max: 1,
		min: 0,
		step: 0.01,
		units: "normalized",
		validation: "finite normalized offset compatible with the torso",
	},
	hipWidth: {
		defaultValue: 0.5,
		max: 1,
		min: 0,
		step: 0.01,
		units: "normalized",
		validation: "finite normalized offset centred under the shoulders",
	},
	radialSegments: { max: 16, min: 6 },
	roughness: { max: 1, min: 0 },
});

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source, key, path, issues) {
	const value = source[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		issues.push({ message: "Expected a non-empty string.", path });
		return "";
	}
	return value;
}

function readNumber(
	source,
	key,
	path,
	limits,
	issues,
	{ integer = false } = {},
) {
	const value = source[key];
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < limits.min ||
		value > limits.max ||
		(integer && !Number.isInteger(value))
	) {
		issues.push({
			message: `Expected ${integer ? "an integer" : "a number"} between ${limits.min} and ${limits.max}.`,
			path,
		});
		return limits.defaultValue ?? limits.min;
	}
	return value;
}

function multiplier(value, minimum, maximum) {
	return minimum + (maximum - minimum) * value;
}

export function deriveProceduralMannequinAnatomy(proportions) {
	const anatomy = {
		armLengthMultiplier: multiplier(proportions.armLength, 0.86, 1.14),
		heightScale:
			proportions.height / PROCEDURAL_MANNEQUIN_LIMITS.height.defaultValue,
		hipWidthMultiplier: multiplier(proportions.hipWidth, 0.84, 1.16),
		legLengthMultiplier: multiplier(proportions.legLength, 0.88, 1.12),
		shoulderWidthMultiplier: multiplier(proportions.shoulderWidth, 0.82, 1.18),
		torsoLengthMultiplier: multiplier(proportions.torsoLength, 0.88, 1.12),
	};
	return {
		...anatomy,
		armToLegRatio: anatomy.armLengthMultiplier / anatomy.legLengthMultiplier,
		armToTorsoRatio:
			anatomy.armLengthMultiplier / anatomy.torsoLengthMultiplier,
		legToTorsoRatio:
			anatomy.legLengthMultiplier / anatomy.torsoLengthMultiplier,
		shoulderToHipRatio:
			anatomy.shoulderWidthMultiplier / anatomy.hipWidthMultiplier,
	};
}

export function validateProceduralMannequinAnatomy(proportions) {
	const anatomy = deriveProceduralMannequinAnatomy(proportions);
	const issues = [];
	if (anatomy.armToTorsoRatio < 0.82) {
		issues.push({
			message:
				"Arms are impossibly short for the selected torso; increase Arms or shorten Torso.",
			path: "$.proportions.armLength",
		});
	}
	if (anatomy.armToTorsoRatio > 1.28) {
		issues.push({
			message:
				"Arms exceed the supported animation-rig reach; shorten Arms or lengthen Torso.",
			path: "$.proportions.armLength",
		});
	}
	if (anatomy.armToLegRatio < 0.84) {
		issues.push({
			message:
				"Arms are too short to maintain the supported thigh reach for these legs.",
			path: "$.proportions.armLength",
		});
	}
	if (anatomy.armToLegRatio > 1.16) {
		issues.push({
			message:
				"Arms extend below the supported thigh reach for these legs; shorten Arms or lengthen Legs.",
			path: "$.proportions.armLength",
		});
	}
	if (anatomy.legToTorsoRatio < 0.82) {
		issues.push({
			message:
				"Legs would intersect the lower torso; lengthen Legs or shorten Torso.",
			path: "$.proportions.legLength",
		});
	}
	if (anatomy.shoulderToHipRatio < 0.72) {
		issues.push({
			message:
				"Shoulders are too narrow to keep the selected hips centred within rig tolerances.",
			path: "$.proportions.shoulderWidth",
		});
	}
	return issues.length > 0
		? { issues, ok: false }
		: { issues: [], ok: true, value: anatomy };
}

function migrateProportions(value, version) {
	const source = isRecord(value) ? value : {};
	return Object.fromEntries(
		PROCEDURAL_MANNEQUIN_PARAMETER_KEYS.map((key) => {
			if (key === "height") {
				return [
					key,
					source.height ??
						source.heightMetres ??
						PROCEDURAL_MANNEQUIN_LIMITS.height.defaultValue,
				];
			}
			return [
				key,
				source[key] ??
					(version === 0
						? PROCEDURAL_MANNEQUIN_LIMITS[key].defaultValue
						: undefined),
			];
		}),
	);
}

export function validateProceduralMannequinRecipe(value) {
	const issues = [];
	if (!isRecord(value)) {
		return {
			issues: [
				{
					message: "Expected a procedural mannequin recipe object.",
					path: "$",
				},
			],
			ok: false,
		};
	}
	if (![0, PROCEDURAL_MANNEQUIN_RECIPE_VERSION].includes(value.version)) {
		issues.push({ message: "Unsupported recipe version.", path: "$.version" });
	}
	const proportionsSource = isRecord(value.proportions)
		? value.proportions
		: {};
	if (!isRecord(value.proportions)) {
		issues.push({ message: "Expected proportions.", path: "$.proportions" });
	}
	const migratedProportions = migrateProportions(
		proportionsSource,
		value.version,
	);
	const geometry = isRecord(value.geometry) ? value.geometry : {};
	if (!isRecord(value.geometry)) {
		issues.push({ message: "Expected geometry settings.", path: "$.geometry" });
	}
	const material = isRecord(value.material) ? value.material : {};
	if (!isRecord(value.material)) {
		issues.push({ message: "Expected material settings.", path: "$.material" });
	}
	const skeleton = isRecord(value.skeleton) ? value.skeleton : {};
	if (!isRecord(value.skeleton)) {
		issues.push({ message: "Expected skeleton settings.", path: "$.skeleton" });
	}
	const animations = isRecord(value.animations) ? value.animations : {};
	if (!isRecord(value.animations)) {
		issues.push({
			message: "Expected animation settings.",
			path: "$.animations",
		});
	}
	if (geometry.profile !== "ellipsoid") {
		issues.push({
			message: 'Expected the V1 "ellipsoid" geometry profile.',
			path: "$.geometry.profile",
		});
	}
	if (
		typeof material.baseColor !== "string" ||
		!HEX_COLOR_PATTERN.test(material.baseColor)
	) {
		issues.push({
			message: "Expected a #RRGGBB color string.",
			path: "$.material.baseColor",
		});
	}
	if (skeleton.contract !== GOLDEN_HUMANOID_SKELETON_CONTRACT) {
		issues.push({
			message: `Expected ${GOLDEN_HUMANOID_SKELETON_CONTRACT}.`,
			path: "$.skeleton.contract",
		});
	}
	if (animations.set !== GOLDEN_REFERENCE_ANIMATION_SET) {
		issues.push({
			message: `Expected ${GOLDEN_REFERENCE_ANIMATION_SET}.`,
			path: "$.animations.set",
		});
	}
	const parsedProportions = Object.fromEntries(
		PROCEDURAL_MANNEQUIN_PARAMETER_KEYS.map((key) => [
			key,
			readNumber(
				migratedProportions,
				key,
				`$.proportions.${key}`,
				PROCEDURAL_MANNEQUIN_LIMITS[key],
				issues,
			),
		]),
	);
	if (issues.length === 0) {
		const anatomy = validateProceduralMannequinAnatomy(parsedProportions);
		if (!anatomy.ok) issues.push(...anatomy.issues);
	}
	const recipe = {
		animations: { set: GOLDEN_REFERENCE_ANIMATION_SET },
		geometry: {
			profile: "ellipsoid",
			radialSegments: readNumber(
				geometry,
				"radialSegments",
				"$.geometry.radialSegments",
				PROCEDURAL_MANNEQUIN_LIMITS.radialSegments,
				issues,
				{ integer: true },
			),
		},
		id: readString(value, "id", "$.id", issues),
		material: {
			baseColor:
				typeof material.baseColor === "string" &&
				HEX_COLOR_PATTERN.test(material.baseColor)
					? material.baseColor.toLowerCase()
					: "#c98f65",
			roughness: readNumber(
				material,
				"roughness",
				"$.material.roughness",
				PROCEDURAL_MANNEQUIN_LIMITS.roughness,
				issues,
			),
		},
		name: readString(value, "name", "$.name", issues),
		proportions: parsedProportions,
		skeleton: { contract: GOLDEN_HUMANOID_SKELETON_CONTRACT },
		version: PROCEDURAL_MANNEQUIN_RECIPE_VERSION,
	};
	return issues.length > 0
		? { issues, ok: false }
		: { issues: [], ok: true, value: recipe };
}

function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortJson(value[key])]),
	);
}

export function canonicalizeProceduralMannequinRecipe(recipe) {
	const parsed = validateProceduralMannequinRecipe(recipe);
	if (!parsed.ok) {
		throw new Error(
			`Invalid ProceduralMannequinRecipeV1: ${parsed.issues
				.map((entry) => `${entry.path} ${entry.message}`)
				.join("; ")}`,
		);
	}
	return `${JSON.stringify(sortJson(parsed.value), null, 2)}\n`;
}

export function hashProceduralMannequinRecipe(recipe) {
	return createHash("sha256")
		.update(canonicalizeProceduralMannequinRecipe(recipe))
		.digest("hex");
}
