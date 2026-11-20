import type { MapEntityTransform } from "../types/game";

export function defaultMapEntityTransform(): MapEntityTransform {
	return {
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
	};
}

export function migrateMapEntityTransform(
	value: unknown,
): MapEntityTransform | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const result = defaultMapEntityTransform();
	for (const key of ["position", "rotation", "scale"] as const) {
		const vector = (value as Record<string, unknown>)[key];
		if (!vector || typeof vector !== "object") continue;
		for (const axis of ["x", "y", "z"] as const) {
			const number = (vector as Record<string, unknown>)[axis];
			if (typeof number !== "number" || !Number.isFinite(number)) continue;
			result[key][axis] =
				key === "scale"
					? Math.min(20, Math.max(0.05, number))
					: key === "rotation"
						? number % 360
						: Math.min(200, Math.max(-200, number));
		}
	}
	return result;
}
