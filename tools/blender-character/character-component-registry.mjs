import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import registry from "../../packages/character-contract/src/character-component-registry.json" with {
	type: "json",
};

export const CHARACTER_COMPONENT_REGISTRY_VERSION = 1;
export const NO_HAIR_COMPONENT_ID = "none";
export const QUATERNIUS_HAIR_V0_COMPONENT_ID = "quaternius-hair-v0";
export const CHARACTER_COMPONENT_REGISTRY_PATH =
	"packages/character-contract/src/character-component-registry.json";
export const CHARACTER_HAIR_COMPONENT_IDS = Object.freeze([
	NO_HAIR_COMPONENT_ID,
	...registry.components
		.filter((component) => component.slot === "hair")
		.map((component) => component.id),
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const HAIR_FIT_CLASSES = new Set(["short-cap", "long", "updo"]);
const HAIR_VERTICAL_SCALE_MODES = new Set(["head-width", "head-height"]);
const sha256 = (input) => createHash("sha256").update(input).digest("hex");

export function resolveCharacterComponent(componentId, slot = "hair") {
	if (componentId === NO_HAIR_COMPONENT_ID) return undefined;
	const component = registry.components.find(
		(candidate) => candidate.id === componentId && candidate.slot === slot,
	);
	if (!component) {
		throw new Error(`Unknown ${slot} component "${componentId}".`);
	}
	return component;
}

function assertVector(value, label, { positive = false } = {}) {
	if (
		!Array.isArray(value) ||
		value.length !== 3 ||
		value.some(
			(entry) =>
				typeof entry !== "number" ||
				!Number.isFinite(entry) ||
				(positive && entry <= 0),
		)
	) {
		throw new Error(`${label} must contain three finite numbers.`);
	}
}

function assertFiniteNumber(
	value,
	label,
	{
		maximum = Number.POSITIVE_INFINITY,
		minimum = Number.NEGATIVE_INFINITY,
	} = {},
) {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < minimum ||
		value > maximum
	) {
		throw new Error(
			`${label} must be a finite number between ${minimum} and ${maximum}.`,
		);
	}
}

function assertPositiveNumber(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive finite number.`);
	}
}

function assertOrderedInterval(
	value,
	label,
	{ minimum = Number.NEGATIVE_INFINITY, strictlyPositiveMinimum = false } = {},
) {
	if (
		!Array.isArray(value) ||
		value.length !== 2 ||
		!value.every(
			(entry) => typeof entry === "number" && Number.isFinite(entry),
		) ||
		value[0] < minimum ||
		value[1] < value[0] ||
		(strictlyPositiveMinimum && value[0] <= 0)
	) {
		throw new Error(`${label} must be an ordered finite interval.`);
	}
}

function validateHairFittingProfile(component) {
	const profile = component.fittingProfile;
	if (
		profile?.version !== 3 ||
		profile.mode !== "geometry-aware-scalp" ||
		profile.attachmentBone !== component.expectedAttachmentBone ||
		profile.sourceReferenceFrame?.centreMode !== "bounds-centre" ||
		profile.sourceReferenceFrame?.crownMode !== "maximum-z" ||
		profile.sourceReferenceFrame?.upAxis !== "+Z" ||
		profile.sourceReferenceFrame?.forwardAxis !== "-Y" ||
		!profile.allowNonUniformScaling ||
		!HAIR_FIT_CLASSES.has(profile.fitClass) ||
		!HAIR_VERTICAL_SCALE_MODES.has(profile.verticalScaleMode)
	) {
		throw new Error(
			`Component "${component.id}" has an invalid fitting profile.`,
		);
	}

	const expectedVerticalScaleMode =
		profile.fitClass === "short-cap" ? "head-width" : "head-height";
	if (profile.verticalScaleMode !== expectedVerticalScaleMode) {
		throw new Error(
			`Component "${component.id}" has an incompatible fit class and vertical scale mode.`,
		);
	}

	for (const axis of ["width", "depth", "height"]) {
		assertOrderedInterval(
			profile.scaleLimits?.[axis],
			`Component "${component.id}" ${axis} fit limits`,
			{ strictlyPositiveMinimum: true },
		);
	}

	assertPositiveNumber(
		profile.coverageRatios?.width,
		`Component "${component.id}" width coverage ratio`,
	);
	assertPositiveNumber(
		profile.coverageRatios?.depth,
		`Component "${component.id}" depth coverage ratio`,
	);
	if (profile.verticalScaleMode === "head-width") {
		assertPositiveNumber(
			profile.coverageRatios?.heightFromWidth,
			`Component "${component.id}" height-from-width coverage ratio`,
		);
		if (profile.coverageRatios?.heightFromHead !== undefined) {
			throw new Error(
				`Component "${component.id}" has an ambiguous vertical coverage ratio.`,
			);
		}
	} else {
		assertPositiveNumber(
			profile.coverageRatios?.heightFromHead,
			`Component "${component.id}" height-from-head coverage ratio`,
		);
		if (profile.coverageRatios?.heightFromWidth !== undefined) {
			throw new Error(
				`Component "${component.id}" has an ambiguous vertical coverage ratio.`,
			);
		}
	}

	assertFiniteNumber(
		profile.frontOffsetMetres,
		`Component "${component.id}" front fit offset`,
		{ minimum: 0 },
	);
	assertFiniteNumber(
		profile.rearOffsetMetres,
		`Component "${component.id}" rear fit offset`,
		{ minimum: 0 },
	);
	assertFiniteNumber(
		profile.verticalSeatingOffsetMetres,
		`Component "${component.id}" vertical seating offset`,
		{ minimum: 0 },
	);
	assertFiniteNumber(
		profile.scalpOffsetMetres,
		`Component "${component.id}" scalp offset`,
		{ minimum: 0 },
	);

	const validation = profile.validation;
	assertOrderedInterval(
		validation?.crownSeatingMetres,
		`Component "${component.id}" crown seating validation`,
		{ minimum: 0 },
	);
	for (const key of ["depthRatio", "heightRatio", "widthRatio"]) {
		assertOrderedInterval(
			validation?.[key],
			`Component "${component.id}" ${key} validation`,
			{ strictlyPositiveMinimum: true },
		);
	}
	assertFiniteNumber(
		validation?.maximumFrontGapHeadDepthRatio,
		`Component "${component.id}" maximum front gap ratio`,
		{ maximum: 1, minimum: 0 },
	);
	assertFiniteNumber(
		validation?.maximumRearGapHeadDepthRatio,
		`Component "${component.id}" maximum rear gap ratio`,
		{ maximum: 1, minimum: 0 },
	);
	for (const key of [
		"minimumCloseToScalpRatio",
		"minimumScalpVerticalRangeRatio",
		"minimumVerticesAboveNeckRatio",
	]) {
		assertFiniteNumber(
			validation?.[key],
			`Component "${component.id}" ${key} validation`,
			{ maximum: 1, minimum: 0 },
		);
	}
	for (const key of [
		"minimumNeckClearanceMetres",
		"minimumShoulderClearanceMetres",
	]) {
		assertFiniteNumber(
			validation?.[key],
			`Component "${component.id}" ${key} validation`,
			{ minimum: 0 },
		);
	}
	assertOrderedInterval(
		validation?.neckExtensionMetres,
		`Component "${component.id}" neck extension validation`,
		{
			minimum: 0,
			strictlyPositiveMinimum: profile.fitClass === "long",
		},
	);
	if (
		typeof validation?.requireVerticalCentreAtOrAboveHeadCentre !== "boolean"
	) {
		throw new Error(
			`Component "${component.id}" vertical centre validation must be boolean.`,
		);
	}
	if (profile.fitClass === "updo" && validation.widthRatio[0] <= 1) {
		throw new Error(
			`Component "${component.id}" updo width validation must start above one.`,
		);
	}
}

export async function validateCharacterComponentRegistry({
	readFileImpl = readFile,
	registryData = registry,
	workspaceRoot = process.cwd(),
} = {}) {
	if (registryData.version !== CHARACTER_COMPONENT_REGISTRY_VERSION) {
		throw new Error("Unsupported character component registry version.");
	}
	const ids = new Set();
	const sourceHashes = {};
	for (const component of registryData.components) {
		if (ids.has(component.id)) {
			throw new Error(`Duplicate character component id "${component.id}".`);
		}
		ids.add(component.id);
		if (
			component.slot !== "hair" ||
			component.skeletonId !== "humanoid-v1" ||
			component.expectedAttachmentBone !== "Head" ||
			component.attachmentStrategy !== "main-skeleton-head-surface-skinning" ||
			component.compilerCompatibilityVersion !==
				"procedural-mannequin-blender-v8"
		) {
			throw new Error(`Component "${component.id}" has incompatible metadata.`);
		}
		if (!component.sourceMeshName || !component.material?.name) {
			throw new Error(
				`Component "${component.id}" is missing mesh/material identity.`,
			);
		}
		assertVector(
			component.sourceTransform.translationMetres,
			`${component.id} source translation`,
		);
		assertVector(
			component.sourceTransform.rotationDegrees,
			`${component.id} source rotation`,
		);
		assertVector(
			component.sourceTransform.scale,
			`${component.id} source scale`,
			{
				positive: true,
			},
		);
		assertVector(
			component.normalizedTransform.translationMetres,
			`${component.id} normalized translation`,
		);
		assertVector(
			component.normalizedTransform.rotationDegrees,
			`${component.id} normalized rotation`,
		);
		assertVector(
			component.normalizedTransform.scale,
			`${component.id} normalized scale`,
			{ positive: true },
		);
		validateHairFittingProfile(component);
		const recordedPaths = new Set();
		for (const source of component.sourceFiles) {
			if (
				recordedPaths.has(source.path) ||
				!SHA256_PATTERN.test(source.sha256)
			) {
				throw new Error(
					`Component "${component.id}" has invalid source metadata.`,
				);
			}
			recordedPaths.add(source.path);
			const absolutePath = path.resolve(workspaceRoot, source.path);
			const actualHash = sha256(await readFileImpl(absolutePath));
			if (actualHash !== source.sha256) {
				throw new Error(
					`Component source hash mismatch for ${source.path}; expected ${source.sha256}, received ${actualHash}.`,
				);
			}
			sourceHashes[source.path] = actualHash;
		}
		if (
			component.sourceHash !== component.sourceFiles[0]?.sha256 ||
			component.sourceAsset !== component.sourceFiles[0]?.path
		) {
			throw new Error(
				`Component "${component.id}" source identity is inconsistent.`,
			);
		}
		const licenseBuffer = await readFileImpl(
			path.resolve(workspaceRoot, component.license.path),
		);
		const licenseHash = sha256(licenseBuffer);
		if (
			component.license.spdx !== "CC0-1.0" ||
			component.license.sha256 !== licenseHash ||
			!licenseBuffer.toString("utf8").includes("CC0 1.0 Universal")
		) {
			throw new Error(`Component "${component.id}" licence provenance failed.`);
		}
		sourceHashes[component.license.path] = licenseHash;
	}
	resolveCharacterComponent(QUATERNIUS_HAIR_V0_COMPONENT_ID);
	return {
		components: registryData.components,
		passed: true,
		sourceHashes,
		version: registryData.version,
	};
}

export const CHARACTER_COMPONENT_REGISTRY = registry;
