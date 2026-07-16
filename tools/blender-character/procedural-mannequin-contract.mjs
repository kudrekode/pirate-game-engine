import { createHash } from "node:crypto";

export const PROCEDURAL_MANNEQUIN_RECIPE_VERSION = 0;
export const PROCEDURAL_MANNEQUIN_COMPILER_VERSION =
	"procedural-mannequin-blender-v0";
export const GOLDEN_HUMANOID_SKELETON_CONTRACT = "golden-humanoid-v0";
export const GOLDEN_REFERENCE_ANIMATION_SET = "golden-reference-v0";

export const PROCEDURAL_MANNEQUIN_LIMITS = Object.freeze({
	heightMetres: { min: 1.5, max: 2.1 },
	radialSegments: { min: 6, max: 16 },
	roughness: { min: 0, max: 1 },
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
		return limits.min;
	}
	return value;
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
	if (value.version !== PROCEDURAL_MANNEQUIN_RECIPE_VERSION) {
		issues.push({ message: "Unsupported recipe version.", path: "$.version" });
	}
	const proportions = isRecord(value.proportions) ? value.proportions : {};
	if (!isRecord(value.proportions)) {
		issues.push({ message: "Expected proportions.", path: "$.proportions" });
	}
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
			message: 'Expected the V0 "ellipsoid" geometry profile.',
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
		proportions: {
			heightMetres: readNumber(
				proportions,
				"heightMetres",
				"$.proportions.heightMetres",
				PROCEDURAL_MANNEQUIN_LIMITS.heightMetres,
				issues,
			),
		},
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
			`Invalid ProceduralMannequinRecipeV0: ${parsed.issues
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
