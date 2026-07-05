import type { GameArea, TerrainHeightTile } from "../types/game";

export const MIN_TERRAIN_HEIGHT = -2;
export const MAX_TERRAIN_HEIGHT = 8;

export type TerrainHeightIssue = {
	id: string;
	severity: "warning";
	message: string;
	path?: string;
};

function keyFor(x: number, y: number): string {
	return `${x}:${y}`;
}

export function clampTerrainHeight(height: number): number {
	return Math.min(
		MAX_TERRAIN_HEIGHT,
		Math.max(MIN_TERRAIN_HEIGHT, Math.round(height)),
	);
}

export function getTerrainHeight(
	area: Pick<GameArea, "terrainHeights">,
	x: number,
	y: number,
): number {
	const height = area.terrainHeights?.find(
		(tile) => tile.x === x && tile.y === y,
	)?.height;
	return typeof height === "number" && Number.isFinite(height)
		? clampTerrainHeight(height)
		: 0;
}

export function getTerrainSurfaceY(
	area: GameArea,
	x: number,
	y: number,
): number {
	// Height is editor/3D-preview presentation data for V1. Runtime movement
	// should stay in movement.ts until step, ramp, and water-depth rules exist.
	const tile = area.terrainTiles.find(
		(candidate) => candidate.x === x && candidate.y === y,
	);
	const height = getTerrainHeight(area, x, y);
	return height + (tile?.tileId === "water" ? 0.18 : 1);
}

export function setTerrainHeight(
	area: GameArea,
	x: number,
	y: number,
	height: number,
): GameArea {
	const nextHeight = clampTerrainHeight(height);
	const heightKey = keyFor(x, y);
	const existingHeights = area.terrainHeights ?? [];
	const nextHeights = new Map(
		existingHeights.map((tile) => [keyFor(tile.x, tile.y), { ...tile }]),
	);

	if (nextHeight === 0) {
		nextHeights.delete(heightKey);
	} else {
		nextHeights.set(heightKey, { x, y, height: nextHeight });
	}

	const terrainHeights = Array.from(nextHeights.values()).sort(
		(a, b) => a.y - b.y || a.x - b.x,
	);

	return {
		...area,
		...(terrainHeights.length > 0
			? { terrainHeights }
			: { terrainHeights: undefined }),
	};
}

export function adjustTerrainHeight(
	area: GameArea,
	x: number,
	y: number,
	delta: number,
): GameArea {
	return setTerrainHeight(area, x, y, getTerrainHeight(area, x, y) + delta);
}

export function migrateTerrainHeights(value: unknown): TerrainHeightTile[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((item): TerrainHeightTile[] => {
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			return [];
		}
		const source = item as Record<string, unknown>;
		if (
			typeof source.x !== "number" ||
			typeof source.y !== "number" ||
			typeof source.height !== "number" ||
			!Number.isFinite(source.x) ||
			!Number.isFinite(source.y) ||
			!Number.isFinite(source.height)
		) {
			return [];
		}
		const height = clampTerrainHeight(source.height);
		return height === 0
			? []
			: [
					{
						height,
						x: Math.max(0, Math.round(source.x)),
						y: Math.max(0, Math.round(source.y)),
					},
				];
	});
}

export function validateTerrainHeights(area: GameArea): TerrainHeightIssue[] {
	return (area.terrainHeights ?? []).flatMap((tile, index) => {
		const issues: TerrainHeightIssue[] = [];
		const path = `areas.${area.id}.terrainHeights.${index}`;
		if (
			typeof tile.height !== "number" ||
			!Number.isFinite(tile.height) ||
			tile.height < MIN_TERRAIN_HEIGHT ||
			tile.height > MAX_TERRAIN_HEIGHT
		) {
			issues.push({
				id: `${area.id}:terrain-height-invalid:${index}`,
				message: `Terrain height at ${tile.x}, ${tile.y} is invalid.`,
				path,
				severity: "warning",
			});
		}
		if (
			tile.x < 0 ||
			tile.y < 0 ||
			tile.x >= area.width ||
			tile.y >= area.height
		) {
			issues.push({
				id: `${area.id}:terrain-height-oob:${index}`,
				message: `Terrain height at ${tile.x}, ${tile.y} is outside the map bounds.`,
				path,
				severity: "warning",
			});
		}
		return issues;
	});
}
