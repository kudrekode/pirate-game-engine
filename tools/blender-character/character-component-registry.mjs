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
	QUATERNIUS_HAIR_V0_COMPONENT_ID,
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
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
				"procedural-mannequin-blender-v5"
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
		for (const axis of ["width", "depth", "height"]) {
			const limits = component.fittingProfile.scaleLimits?.[axis];
			if (
				!Array.isArray(limits) ||
				limits.length !== 2 ||
				!limits.every(Number.isFinite) ||
				limits[0] <= 0 ||
				limits[1] < limits[0]
			) {
				throw new Error(
					`Component "${component.id}" has invalid ${axis} fit limits.`,
				);
			}
		}
		if (
			component.fittingProfile.version !== 2 ||
			component.fittingProfile.mode !== "geometry-aware-scalp" ||
			component.fittingProfile.attachmentBone !==
				component.expectedAttachmentBone ||
			component.fittingProfile.sourceReferenceFrame?.upAxis !== "+Z" ||
			component.fittingProfile.sourceReferenceFrame?.forwardAxis !== "+Y" ||
			!component.fittingProfile.allowNonUniformScaling ||
			!Number.isFinite(component.fittingProfile.frontOffsetMetres) ||
			!Number.isFinite(component.fittingProfile.rearOffsetMetres) ||
			!Number.isFinite(component.fittingProfile.verticalSeatingOffsetMetres) ||
			!Object.values(component.fittingProfile.coverageRatios ?? {}).every(
				(value) => Number.isFinite(value) && value > 0,
			)
		) {
			throw new Error(
				`Component "${component.id}" has an invalid fitting profile.`,
			);
		}
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
