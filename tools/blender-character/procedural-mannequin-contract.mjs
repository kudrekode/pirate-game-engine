import { createHash } from "node:crypto";

export const PROCEDURAL_MANNEQUIN_RECIPE_VERSION = 2;
export const PROCEDURAL_MANNEQUIN_COMPILER_VERSION =
	"procedural-mannequin-blender-v2";
export const PROCEDURAL_MANNEQUIN_VALIDATION_VERSION =
	"procedural-mannequin-roundtrip-v3";
export const PROCEDURAL_HUMANOID_TOPOLOGY_VERSION = "procedural-humanoid-v1";
export const GOLDEN_HUMANOID_SKELETON_CONTRACT = "golden-humanoid-v0";
export const GOLDEN_HUMANOID_BLENDER_REST_SIGNATURE =
	"38356ace6cdb45ddc8caa325c1989fd3dfe0779d10a03c4f4fd743acf58b22f9";
export const GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE =
	"24264599feb13a49857540c8efab3e46fcfb2a45cec1a03b8bf90bbd4f74b840";
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

export function deriveProceduralMannequinMeasurements(proportions) {
	const anatomy = deriveProceduralMannequinAnatomy(proportions);
	return {
		calfRadius:
			0.068 *
			anatomy.hipWidthMultiplier *
			(0.94 + anatomy.legLengthMultiplier * 0.06),
		chestDepth: 0.13,
		chestHalfWidth: 0.245 * anatomy.shoulderWidthMultiplier,
		elbowRadius: 0.07,
		footDepth: 0.06,
		footHalfWidth: 0.062 * anatomy.hipWidthMultiplier,
		forearmRadius: 0.064,
		handDepth: 0.035,
		handHalfWidth: 0.064,
		headDepth: 0.108,
		headHalfWidth: 0.118,
		hipJointRadius: 0.105 * anatomy.hipWidthMultiplier,
		kneeRadius: 0.068 * anatomy.hipWidthMultiplier,
		neckRadius: 0.064,
		pelvisDepth: 0.13,
		pelvisHalfWidth: 0.195 * anatomy.hipWidthMultiplier,
		shoulderJointRadius: 0.08,
		thighRadius: 0.082 * anatomy.hipWidthMultiplier,
		topologyVersion: PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
		upperArmRadius: 0.076 * (0.96 + anatomy.shoulderWidthMultiplier * 0.04),
		voxelSizeMetres: 0.035,
		waistDepth: 0.112,
		waistHalfWidth:
			0.17 *
			((anatomy.hipWidthMultiplier + anatomy.shoulderWidthMultiplier) * 0.5),
		wristRadius: 0.052,
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
	if (![0, 1, PROCEDURAL_MANNEQUIN_RECIPE_VERSION].includes(value.version)) {
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
	const legacyRecipe = value.version === 0 || value.version === 1;
	if (
		(!legacyRecipe && geometry.profile !== "voxel-union") ||
		(legacyRecipe && geometry.profile !== "ellipsoid")
	) {
		issues.push({
			message: legacyRecipe
				? 'Expected the legacy "ellipsoid" geometry profile.'
				: 'Expected the V1 "voxel-union" geometry profile.',
			path: "$.geometry.profile",
		});
	}
	if (
		!legacyRecipe &&
		geometry.topologyVersion !== PROCEDURAL_HUMANOID_TOPOLOGY_VERSION
	) {
		issues.push({
			message: `Expected ${PROCEDURAL_HUMANOID_TOPOLOGY_VERSION}.`,
			path: "$.geometry.topologyVersion",
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
			profile: "voxel-union",
			radialSegments: readNumber(
				geometry,
				"radialSegments",
				"$.geometry.radialSegments",
				PROCEDURAL_MANNEQUIN_LIMITS.radialSegments,
				issues,
				{ integer: true },
			),
			topologyVersion: PROCEDURAL_HUMANOID_TOPOLOGY_VERSION,
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
			`Invalid ProceduralMannequinRecipeV2: ${parsed.issues
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
