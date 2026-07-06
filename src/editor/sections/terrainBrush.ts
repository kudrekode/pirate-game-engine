import { clampTerrainHeight, getTerrainHeight } from "../../data/terrainHeight";
import type { GameArea } from "../../types/game";

export type TerrainBrushShape = "square" | "circle";
export type TerrainBrushFalloff = "hard" | "linear" | "smooth";
export type TerrainHeightOperation =
	| "raise"
	| "lower"
	| "flatten"
	| "set"
	| "smooth"
	| "roughen";

export type TerrainBrushBounds = {
	width: number;
	height: number;
};

export type TerrainBrushCell = {
	x: number;
	y: number;
};

export type TerrainBrushFootprintOptions = {
	center: TerrainBrushCell;
	size: number;
	shape: TerrainBrushShape;
	bounds: TerrainBrushBounds;
};

export type TerrainBrushSample = TerrainBrushCell & {
	influence: number;
};

export type TerrainHeightUpdate = TerrainBrushCell & {
	height: number;
};

export type TerrainTileUpdate = TerrainBrushCell & {
	tileId: string;
};

export type TerrainPaintUpdateOptions = {
	cells: TerrainBrushCell[];
	targetTileId: string;
	getTileId: (cell: TerrainBrushCell) => string | undefined;
	knownBounds?: TerrainBrushBounds;
};

export type TerrainHeightUpdateOptions = {
	area: Pick<GameArea, "height" | "terrainHeights" | "width">;
	operation: TerrainHeightOperation;
	samples: TerrainBrushSample[];
	strength?: number;
	targetHeight?: number;
	noiseSample?: (cell: TerrainBrushCell) => number;
};

export type TerrainLineOptions = {
	start: TerrainBrushCell;
	end: TerrainBrushCell;
	bounds: TerrainBrushBounds;
};

export type TerrainRectangleOptions = {
	start: TerrainBrushCell;
	end: TerrainBrushCell;
	bounds: TerrainBrushBounds;
};

export type TerrainFloodFillOptions = {
	seed: TerrainBrushCell;
	bounds: TerrainBrushBounds;
	targetTileId: string;
	getTileId: (cell: TerrainBrushCell) => string | undefined;
};

function clampBrushSize(size: number): number {
	return Math.max(1, Math.round(size));
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(1, Math.max(0, value));
}

function isInBounds(
	cell: TerrainBrushCell,
	bounds: TerrainBrushBounds,
): boolean {
	return (
		cell.x >= 0 &&
		cell.y >= 0 &&
		cell.x < bounds.width &&
		cell.y < bounds.height
	);
}

export function terrainBrushCellKey(cell: TerrainBrushCell): string {
	return `${cell.x}:${cell.y}`;
}

function dedupeCells(cells: TerrainBrushCell[]): TerrainBrushCell[] {
	const seen = new Set<string>();
	const uniqueCells: TerrainBrushCell[] = [];
	for (const cell of cells) {
		const key = terrainBrushCellKey(cell);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		uniqueCells.push(cell);
	}
	return uniqueCells;
}

function isInsideKnownBounds(
	cell: TerrainBrushCell,
	bounds: TerrainBrushBounds | undefined,
): boolean {
	return bounds ? isInBounds(cell, bounds) : true;
}

function getBrushGeometry({
	center,
	size,
}: Pick<TerrainBrushFootprintOptions, "center" | "size">) {
	const brushSize = clampBrushSize(size);
	const startX = Math.round(center.x) - Math.floor((brushSize - 1) / 2);
	const startY = Math.round(center.y) - Math.floor((brushSize - 1) / 2);
	const centerX = startX + (brushSize - 1) / 2;
	const centerY = startY + (brushSize - 1) / 2;
	const radius = brushSize <= 2 ? brushSize / 2 : (brushSize - 1) / 2;
	return { brushSize, centerX, centerY, radius, startX, startY };
}

export function getTerrainBrushInfluence({
	cell,
	center,
	falloff,
	shape,
	size,
}: {
	cell: TerrainBrushCell;
	center: TerrainBrushCell;
	falloff: TerrainBrushFalloff;
	shape: TerrainBrushShape;
	size: number;
}): number {
	if (falloff === "hard" || clampBrushSize(size) === 1) {
		return 1;
	}

	const { centerX, centerY, radius } = getBrushGeometry({ center, size });
	const distance =
		shape === "circle"
			? Math.hypot(cell.x - centerX, cell.y - centerY)
			: Math.max(Math.abs(cell.x - centerX), Math.abs(cell.y - centerY));
	const linear = clamp01(1 - distance / (radius + 1));

	if (falloff === "linear") {
		return linear;
	}

	return linear * linear * (3 - 2 * linear);
}

export function resolveTerrainBrushFootprint({
	bounds,
	center,
	shape,
	size,
}: TerrainBrushFootprintOptions): TerrainBrushCell[] {
	const brushSize = clampBrushSize(size);
	if (bounds.width <= 0 || bounds.height <= 0) {
		return [];
	}

	const { centerX, centerY, radius, startX, startY } = getBrushGeometry({
		center,
		size,
	});
	const seen = new Set<string>();
	const cells: TerrainBrushCell[] = [];

	for (let y = startY; y < startY + brushSize; y += 1) {
		for (let x = startX; x < startX + brushSize; x += 1) {
			const cell = { x, y };
			if (!isInBounds(cell, bounds)) {
				continue;
			}
			if (shape === "circle") {
				const distance = Math.hypot(x - centerX, y - centerY);
				if (distance > radius + Number.EPSILON) {
					continue;
				}
			}
			const key = terrainBrushCellKey(cell);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			cells.push(cell);
		}
	}

	return cells;
}

export function resolveTerrainBrushSamples(
	options: TerrainBrushFootprintOptions & { falloff: TerrainBrushFalloff },
): TerrainBrushSample[] {
	return resolveTerrainBrushFootprint(options).map((cell) => ({
		...cell,
		influence: getTerrainBrushInfluence({ ...options, cell }),
	}));
}

export function resolveTerrainLine({
	bounds,
	end,
	start,
}: TerrainLineOptions): TerrainBrushCell[] {
	const startX = Math.round(start.x);
	const startY = Math.round(start.y);
	const endX = Math.round(end.x);
	const endY = Math.round(end.y);
	const cells: TerrainBrushCell[] = [];
	let x = startX;
	let y = startY;
	const dx = Math.abs(endX - startX);
	const dy = Math.abs(endY - startY);
	const stepX = startX < endX ? 1 : -1;
	const stepY = startY < endY ? 1 : -1;
	let error = dx - dy;

	while (true) {
		const cell = { x, y };
		if (isInBounds(cell, bounds)) {
			cells.push(cell);
		}
		if (x === endX && y === endY) {
			break;
		}
		const doubledError = error * 2;
		if (doubledError > -dy) {
			error -= dy;
			x += stepX;
		}
		if (doubledError < dx) {
			error += dx;
			y += stepY;
		}
	}

	return dedupeCells(cells);
}

export function resolveTerrainRectangle({
	bounds,
	end,
	start,
}: TerrainRectangleOptions): TerrainBrushCell[] {
	const minX = Math.min(Math.round(start.x), Math.round(end.x));
	const maxX = Math.max(Math.round(start.x), Math.round(end.x));
	const minY = Math.min(Math.round(start.y), Math.round(end.y));
	const maxY = Math.max(Math.round(start.y), Math.round(end.y));
	const cells: TerrainBrushCell[] = [];

	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const cell = { x, y };
			if (isInBounds(cell, bounds)) {
				cells.push(cell);
			}
		}
	}

	return dedupeCells(cells);
}

export function resolveTerrainFloodFill({
	bounds,
	getTileId,
	seed,
	targetTileId,
}: TerrainFloodFillOptions): TerrainBrushCell[] {
	if (!isInBounds(seed, bounds)) {
		return [];
	}

	const sourceTileId = getTileId(seed);
	if (!sourceTileId || sourceTileId === targetTileId) {
		return [];
	}

	const filled: TerrainBrushCell[] = [];
	const visited = new Set<string>();
	const queue: TerrainBrushCell[] = [
		{ x: Math.round(seed.x), y: Math.round(seed.y) },
	];
	let queueIndex = 0;

	while (queueIndex < queue.length) {
		const cell = queue[queueIndex];
		queueIndex += 1;
		const key = terrainBrushCellKey(cell);
		if (visited.has(key) || !isInBounds(cell, bounds)) {
			continue;
		}
		visited.add(key);
		if (getTileId(cell) !== sourceTileId) {
			continue;
		}
		filled.push(cell);
		queue.push(
			{ x: cell.x + 1, y: cell.y },
			{ x: cell.x - 1, y: cell.y },
			{ x: cell.x, y: cell.y + 1 },
			{ x: cell.x, y: cell.y - 1 },
		);
	}

	return filled;
}

export function resolveTerrainPaintUpdates({
	cells,
	getTileId,
	knownBounds,
	targetTileId,
}: TerrainPaintUpdateOptions): TerrainTileUpdate[] {
	return dedupeCells(cells).flatMap((cell) => {
		const currentTileId = getTileId(cell);
		if (
			isInsideKnownBounds(cell, knownBounds) &&
			currentTileId === targetTileId
		) {
			return [];
		}
		return [{ ...cell, tileId: targetTileId }];
	});
}

function sampleToHeightDelta(
	signedAmount: number,
	influence: number,
	strength: number,
): number {
	const weightedAmount = signedAmount * influence * strength;
	const magnitude = Math.abs(weightedAmount);
	if (magnitude < 0.5) {
		return 0;
	}
	return Math.sign(weightedAmount) * Math.max(1, Math.trunc(magnitude));
}

function defaultNoiseSample(cell: TerrainBrushCell): number {
	const hash =
		Math.sin((cell.x + 17) * 12.9898 + (cell.y - 31) * 78.233) * 43758.5453;
	return (hash - Math.floor(hash)) * 2 - 1 || 0;
}

function getNeighbourAverage(
	area: Pick<GameArea, "height" | "terrainHeights" | "width">,
	cell: TerrainBrushCell,
): number {
	let total = 0;
	let count = 0;

	for (let y = cell.y - 1; y <= cell.y + 1; y += 1) {
		for (let x = cell.x - 1; x <= cell.x + 1; x += 1) {
			if (x === cell.x && y === cell.y) {
				continue;
			}
			if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
				continue;
			}
			total += getTerrainHeight(area, x, y);
			count += 1;
		}
	}

	return count === 0 ? getTerrainHeight(area, cell.x, cell.y) : total / count;
}

function normalizeSamples(samples: TerrainBrushSample[]): TerrainBrushSample[] {
	const seen = new Set<string>();
	const uniqueSamples: TerrainBrushSample[] = [];

	for (const sample of samples) {
		const key = terrainBrushCellKey(sample);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		uniqueSamples.push({ ...sample, influence: clamp01(sample.influence) });
	}

	return uniqueSamples;
}

export function resolveTerrainHeightUpdates({
	area,
	noiseSample = defaultNoiseSample,
	operation,
	samples,
	strength = 1,
	targetHeight = 0,
}: TerrainHeightUpdateOptions): TerrainHeightUpdate[] {
	const clampedStrength = Math.max(0, Math.min(4, Number(strength) || 0));
	const updates: TerrainHeightUpdate[] = [];

	for (const sample of normalizeSamples(samples)) {
		const currentHeight = getTerrainHeight(area, sample.x, sample.y);
		let nextHeight = currentHeight;

		if (operation === "raise") {
			nextHeight =
				currentHeight +
				sampleToHeightDelta(1, sample.influence, clampedStrength);
		} else if (operation === "lower") {
			nextHeight =
				currentHeight +
				sampleToHeightDelta(-1, sample.influence, clampedStrength);
		} else if (operation === "flatten" || operation === "set") {
			nextHeight = targetHeight;
		} else if (operation === "smooth") {
			const averageHeight = getNeighbourAverage(area, sample);
			const blend = clamp01(clampedStrength * 0.35 * sample.influence);
			nextHeight = currentHeight + (averageHeight - currentHeight) * blend;
		} else {
			const noise = Math.max(-1, Math.min(1, noiseSample(sample)));
			nextHeight =
				currentHeight +
				sampleToHeightDelta(noise, sample.influence, clampedStrength);
		}

		const clampedHeight = clampTerrainHeight(nextHeight);
		if (clampedHeight !== currentHeight) {
			updates.push({ height: clampedHeight, x: sample.x, y: sample.y });
		}
	}

	return updates;
}
