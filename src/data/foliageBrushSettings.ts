import type { FoliageBrushSettings } from "../types/game";

export const FOLIAGE_PALETTE_LIMIT = 16;

export const FOLIAGE_BRUSH_LIMITS = {
	radius: [0.5, 16],
	density: [0, 1],
	spacing: [0.5, 8],
	seed: [-2147483648, 2147483647],
	scale: [0.05, 8],
	rotationVariation: [0, 180],
	height: [-10, 20],
	maxSlope: [0, 90],
	weight: [0, 100],
} as const;

export const DEFAULT_FOLIAGE_BRUSH_SETTINGS: FoliageBrushSettings = {
	palette: [
		{ assetId: "mere-spruce", weight: 4 },
		{ assetId: "mere-verge", weight: 1 },
	],
	radius: 4,
	density: 0.8,
	spacing: 1.65,
	seed: 847,
	minScale: 0.65,
	maxScale: 1.3,
	rotationVariation: 180,
	minHeight: -2,
	maxHeight: 9,
	maxSlope: 40,
	excludeWater: true,
	excludeRoads: true,
};

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function clampNumber(
	value: unknown,
	defaultValue: number,
	[min, max]: readonly [number, number],
): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: defaultValue;
}

function migratePalette(value: unknown): FoliageBrushSettings["palette"] {
	if (!Array.isArray(value)) {
		return DEFAULT_FOLIAGE_BRUSH_SETTINGS.palette.map((entry) => ({
			...entry,
		}));
	}
	const palette: FoliageBrushSettings["palette"] = [];
	const seen = new Set<string>();
	for (const rawEntry of value) {
		const entry = record(rawEntry);
		const id = typeof entry?.assetId === "string" ? entry.assetId.trim() : "";
		if (!id || seen.has(id)) {
			continue;
		}
		seen.add(id);
		palette.push({
			assetId: id,
			weight: clampNumber(entry?.weight, 1, FOLIAGE_BRUSH_LIMITS.weight),
		});
		if (palette.length >= FOLIAGE_PALETTE_LIMIT) {
			break;
		}
	}
	return palette;
}

export function migrateFoliageBrushSettings(
	value: unknown,
): FoliageBrushSettings | undefined {
	const source = record(value);
	if (!source) {
		return undefined;
	}
	const defaults = DEFAULT_FOLIAGE_BRUSH_SETTINGS;
	const limits = FOLIAGE_BRUSH_LIMITS;
	const minScale = clampNumber(
		source.minScale,
		defaults.minScale,
		limits.scale,
	);
	const maxScale = clampNumber(
		source.maxScale,
		defaults.maxScale,
		limits.scale,
	);
	const minHeight = clampNumber(
		source.minHeight,
		defaults.minHeight,
		limits.height,
	);
	const maxHeight = clampNumber(
		source.maxHeight,
		defaults.maxHeight,
		limits.height,
	);
	return {
		palette: migratePalette(source.palette),
		radius: clampNumber(source.radius, defaults.radius, limits.radius),
		density: clampNumber(source.density, defaults.density, limits.density),
		spacing: clampNumber(source.spacing, defaults.spacing, limits.spacing),
		seed: Math.round(clampNumber(source.seed, defaults.seed, limits.seed)),
		minScale: Math.min(minScale, maxScale),
		maxScale: Math.max(minScale, maxScale),
		rotationVariation: clampNumber(
			source.rotationVariation,
			defaults.rotationVariation,
			limits.rotationVariation,
		),
		minHeight: Math.min(minHeight, maxHeight),
		maxHeight: Math.max(minHeight, maxHeight),
		maxSlope: clampNumber(source.maxSlope, defaults.maxSlope, limits.maxSlope),
		excludeWater:
			typeof source.excludeWater === "boolean"
				? source.excludeWater
				: defaults.excludeWater,
		excludeRoads:
			typeof source.excludeRoads === "boolean"
				? source.excludeRoads
				: defaults.excludeRoads,
	};
}
