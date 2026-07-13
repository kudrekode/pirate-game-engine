import type { GameArea, MapTile } from "../types/game";
import { getTerrainSurfaceY, isTerrainWaterTileId } from "./terrainHeight";

export type TerrainSurfaceMode = "blocky" | "smooth";

export type TerrainSurfacePosition = {
	x: number;
	y: number;
};

export type TerrainSurfaceSampler = {
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

function keyFor(x: number, y: number): string {
	return `${x}:${y}`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((total, value) => total + value, 0) / values.length;
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
	const tileLookup = new Map(
		area.terrainTiles
			.filter((tile) => isInBounds(area, tile.x, tile.y))
			.map((tile) => [keyFor(tile.x, tile.y), tile]),
	);
	const cornerHeightLookup = new Map<string, number>();

	const getTile = (x: number, y: number): MapTile | undefined =>
		tileLookup.get(keyFor(x, y));

	const getCellSurfaceY = (x: number, y: number): number =>
		getTile(x, y) ? getTerrainSurfaceY(area, x, y) : 0;

	const getWaterSurfaceY = (x: number, y: number): number => {
		const tile = getTile(x, y);
		return isTerrainWaterTileId(tile?.tileId)
			? getTerrainSurfaceY(area, x, y)
			: 0;
	};

	const getCornerSurfaceY = (cornerX: number, cornerY: number): number => {
		const clampedX = Math.round(clamp(cornerX, 0, area.width));
		const clampedY = Math.round(clamp(cornerY, 0, area.height));
		const key = keyFor(clampedX, clampedY);
		const existing = cornerHeightLookup.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const surfaceValues = [
			{ x: clampedX - 1, y: clampedY - 1 },
			{ x: clampedX, y: clampedY - 1 },
			{ x: clampedX - 1, y: clampedY },
			{ x: clampedX, y: clampedY },
		].flatMap((cell) =>
			getTile(cell.x, cell.y) ? [getTerrainSurfaceY(area, cell.x, cell.y)] : [],
		);
		const height = average(surfaceValues);
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
			return getTerrainSurfaceY(area, nearestX, nearestY);
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
			: getTerrainSurfaceY(area, x, y);
	};

	return {
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
