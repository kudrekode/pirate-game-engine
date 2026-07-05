export type TerrainBrushShape = "square" | "circle";

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

function clampBrushSize(size: number): number {
	return Math.max(1, Math.round(size));
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

	const startX = Math.round(center.x) - Math.floor((brushSize - 1) / 2);
	const startY = Math.round(center.y) - Math.floor((brushSize - 1) / 2);
	const circleCenterX = startX + (brushSize - 1) / 2;
	const circleCenterY = startY + (brushSize - 1) / 2;
	const circleRadius = brushSize <= 2 ? brushSize / 2 : (brushSize - 1) / 2;
	const seen = new Set<string>();
	const cells: TerrainBrushCell[] = [];

	for (let y = startY; y < startY + brushSize; y += 1) {
		for (let x = startX; x < startX + brushSize; x += 1) {
			const cell = { x, y };
			if (!isInBounds(cell, bounds)) {
				continue;
			}
			if (shape === "circle") {
				const distance = Math.hypot(x - circleCenterX, y - circleCenterY);
				if (distance > circleRadius + Number.EPSILON) {
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
