import type { MapSceneAppearance } from "../types/game";

export function migrateMapSceneAppearance(
	value: unknown,
): MapSceneAppearance | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const { hidden, locked, group, collision } = value as Record<string, unknown>;
	const appearance: MapSceneAppearance = {};
	if (hidden === true) appearance.hidden = true;
	if (locked === true) appearance.locked = true;
	if (typeof group === "string" && group.trim())
		appearance.group = group.trim().slice(0, 80);
	if (
		collision === "none" ||
		collision === "solid" ||
		collision === "walkable-floor" ||
		collision === "trigger"
	) {
		appearance.collision = collision;
	}
	return Object.keys(appearance).length ? appearance : undefined;
}
