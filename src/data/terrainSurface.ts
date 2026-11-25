import type { GameArea, MapTile } from "../types/game";
import {
	clampTerrainHeight,
	isTerrainWaterTileId,
	TERRAIN_LAND_SURFACE_OFFSET,
	TERRAIN_WATER_SURFACE_OFFSET,
} from "./terrainHeight";

export type TerrainSurfaceMode = "blocky" | "smooth";

export type TerrainSurfacePosition = {
	x: number;
	y: number;
};

export type TerrainSurfaceSampler = {
	getHeight: (x: number, y: number) => number;
	getCellSurfaceY: (x: number, y: number) => number;
	getCornerSurfaceY: (cornerX: number, cornerY: number) => number;
	getTile: (x: number, y: number) => MapTile | undefined;
	getWaterSurfaceY: (x: number, y: number) => number;
	sampleSmoothSurfaceY: (position: TerrainSurfacePosition) => number;
	sampleSurfaceY: (
		position: TerrainSurfacePosition,
		mode?: TerrainSurfaceMode,
	) => number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function isInBounds(area: GameArea, x: number, y: number): boolean {
	return x >= 0 && y >= 0 && x < area.width && y < area.height;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function createTerrainSurfaceSampler(
	area: GameArea,
): TerrainSurfaceSampler {
	// One index per sampler lifetime. Geometry and camera probes repeatedly query
	// these cells. Preserve the first authored surface for legacy duplicate cells.
	type Cell = { tile?: MapTile; height?: number; offset?: number };
	const rows = new Map<number, Map<number, Cell>>();
	function ensureCell(x: number, y: number) {
		let row = rows.get(y);
		if (!row) {
			row = new Map();
			rows.set(y, row);
		}
		let cell = row.get(x);
		if (!cell) {
			cell = {};
			row.set(x, cell);
		}
		return cell;
	}
	for (const tile of area.terrainTiles) {
		if (!isInBounds(area, tile.x, tile.y)) continue;
		const cell = ensureCell(tile.x, tile.y);
		cell.tile = tile;
		cell.offset ??= isTerrainWaterTileId(tile.tileId)
			? TERRAIN_WATER_SURFACE_OFFSET
			: TERRAIN_LAND_SURFACE_OFFSET;
	}
	for (const tile of area.terrainHeights ?? []) {
		const cell = ensureCell(tile.x, tile.y);
		cell.height ??= Number.isFinite(tile.height)
			? clampTerrainHeight(tile.height)
			: 0;
	}
	const cellAt = (x: number, y: number) => rows.get(y)?.get(x);
	const getHeight = (x: number, y: number) => cellAt(x, y)?.height ?? 0;
	const surfaceY = (cell: Cell | undefined) =>
		(cell?.height ?? 0) + (cell?.offset ?? TERRAIN_LAND_SURFACE_OFFSET);
	const cornerHeightLookup = new Map<string, number>();

	const getTile = (x: number, y: number): MapTile | undefined =>
		cellAt(x, y)?.tile;

	const getCellSurfaceY = (x: number, y: number): number => {
		const cell = cellAt(x, y);
		return cell?.tile ? surfaceY(cell) : 0;
	};

	const getWaterSurfaceY = (x: number, y: number): number => {
		const cell = cellAt(x, y);
		return isTerrainWaterTileId(cell?.tile?.tileId) ? surfaceY(cell) : 0;
	};

	const getCornerSurfaceY = (cornerX: number, cornerY: number): number => {
		const clampedX = Math.round(clamp(cornerX, 0, area.width));
		const clampedY = Math.round(clamp(cornerY, 0, area.height));
		const key = `${clampedX}:${clampedY}`;
		const existing = cornerHeightLookup.get(key);
		if (existing !== undefined) {
			return existing;
		}

		let total = 0;
		let count = 0;
		for (let dy = -1; dy <= 0; dy++) {
			const row = rows.get(clampedY + dy);
			for (let dx = -1; dx <= 0; dx++) {
				const cell = row?.get(clampedX + dx);
				if (cell?.tile) {
					total += surfaceY(cell);
					count++;
				}
			}
		}
		const height = count ? total / count : 0;
		cornerHeightLookup.set(key, height);
		return height;
	};

	const sampleSmoothSurfaceY = (position: TerrainSurfacePosition): number => {
		if (area.width <= 0 || area.height <= 0) {
			return 0;
		}

		const nearestX = Math.round(clamp(position.x, 0, area.width - 1));
		const nearestY = Math.round(clamp(position.y, 0, area.height - 1));
		const nearestTile = getTile(nearestX, nearestY);
		if (isTerrainWaterTileId(nearestTile?.tileId)) {
			return surfaceY(cellAt(nearestX, nearestY));
		}

		const sampleX = clamp(position.x + 0.5, 0, area.width);
		const sampleY = clamp(position.y + 0.5, 0, area.height);
		const left = Math.floor(sampleX);
		const top = Math.floor(sampleY);
		const right = Math.min(area.width, left + 1);
		const bottom = Math.min(area.height, top + 1);
		const localX = sampleX - left;
		const localY = sampleY - top;
		const topY = lerp(
			getCornerSurfaceY(left, top),
			getCornerSurfaceY(right, top),
			localX,
		);
		const bottomY = lerp(
			getCornerSurfaceY(left, bottom),
			getCornerSurfaceY(right, bottom),
			localX,
		);
		return lerp(topY, bottomY, localY);
	};

	const sampleSurfaceY = (
		position: TerrainSurfacePosition,
		mode: TerrainSurfaceMode = "blocky",
	): number => {
		const x = Math.round(clamp(position.x, 0, Math.max(0, area.width - 1)));
		const y = Math.round(clamp(position.y, 0, Math.max(0, area.height - 1)));
		return mode === "smooth"
			? sampleSmoothSurfaceY(position)
			: surfaceY(cellAt(x, y));
	};

	return {
		getHeight,
		getCellSurfaceY,
		getCornerSurfaceY,
		getTile,
		getWaterSurfaceY,
		sampleSmoothSurfaceY,
		sampleSurfaceY,
	};
}

export function getTerrainCornerSurfaceY(
	area: GameArea,
	cornerX: number,
	cornerY: number,
): number {
	return createTerrainSurfaceSampler(area).getCornerSurfaceY(cornerX, cornerY);
}

export function sampleSmoothTerrainSurfaceY(
	area: GameArea,
	position: TerrainSurfacePosition,
): number {
	return createTerrainSurfaceSampler(area).sampleSmoothSurfaceY(position);
}

export function getTerrainPresentationSurfaceY(
	area: GameArea,
	position: TerrainSurfacePosition,
	mode: TerrainSurfaceMode = "blocky",
): number {
	return createTerrainSurfaceSampler(area).sampleSurfaceY(position, mode);
}
