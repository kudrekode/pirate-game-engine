import { describe, expect, it } from "vitest";
import {
	getTerrainBrushInfluence,
	resolveTerrainBrushFootprint,
	resolveTerrainBrushSamples,
	resolveTerrainBrushStrokeSamples,
	resolveTerrainFloodFill,
	resolveTerrainHeightUpdates,
	resolveTerrainLine,
	resolveTerrainPaintUpdates,
	resolveTerrainRectangle,
	resolveTerrainSlopeCells,
	resolveTerrainSlopeHeightUpdates,
	type TerrainBrushCell,
	terrainBrushCellKey,
} from "./terrainBrush";

const bounds = { height: 8, width: 8 };

function makeHeightArea(
	width: number,
	height: number,
	heights: { x: number; y: number; height: number }[] = [],
) {
	return { height, terrainHeights: heights, width };
}

function tileReader(
	width: number,
	height: number,
	tiles: Record<string, string>,
	defaultTileId = "grass",
) {
	return (cell: TerrainBrushCell) => {
		if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) {
			return undefined;
		}
		return tiles[terrainBrushCellKey(cell)] ?? defaultTileId;
	};
}

describe("resolveTerrainBrushFootprint", () => {
	it("keeps size 1 square brush equivalent to one tile", () => {
		expect(
			resolveTerrainBrushFootprint({
				bounds,
				center: { x: 3, y: 4 },
				shape: "square",
				size: 1,
			}),
		).toEqual([{ x: 3, y: 4 }]);
	});

	it("resolves predictable square footprints for sizes 2 and 3", () => {
		expect(
			resolveTerrainBrushFootprint({
				bounds,
				center: { x: 3, y: 3 },
				shape: "square",
				size: 2,
			}),
		).toEqual([
			{ x: 3, y: 3 },
			{ x: 4, y: 3 },
			{ x: 3, y: 4 },
			{ x: 4, y: 4 },
		]);

		expect(
			resolveTerrainBrushFootprint({
				bounds,
				center: { x: 3, y: 3 },
				shape: "square",
				size: 3,
			}),
		).toEqual([
			{ x: 2, y: 2 },
			{ x: 3, y: 2 },
			{ x: 4, y: 2 },
			{ x: 2, y: 3 },
			{ x: 3, y: 3 },
			{ x: 4, y: 3 },
			{ x: 2, y: 4 },
			{ x: 3, y: 4 },
			{ x: 4, y: 4 },
		]);
	});

	it("resolves deterministic circle footprints", () => {
		expect(
			resolveTerrainBrushFootprint({
				bounds,
				center: { x: 3, y: 3 },
				shape: "circle",
				size: 3,
			}),
		).toEqual([
			{ x: 3, y: 2 },
			{ x: 2, y: 3 },
			{ x: 3, y: 3 },
			{ x: 4, y: 3 },
			{ x: 3, y: 4 },
		]);
	});

	it("clips footprints to map bounds", () => {
		expect(
			resolveTerrainBrushFootprint({
				bounds: { height: 3, width: 3 },
				center: { x: 0, y: 0 },
				shape: "square",
				size: 3,
			}),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		]);
	});

	it("returns no duplicate tile coordinates", () => {
		const cells = resolveTerrainBrushFootprint({
			bounds,
			center: { x: 4, y: 4 },
			shape: "circle",
			size: 5,
		});
		const keys = cells.map(terrainBrushCellKey);

		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe("terrain brush falloff", () => {
	it("keeps hard falloff at full influence", () => {
		expect(
			getTerrainBrushInfluence({
				cell: { x: 1, y: 1 },
				center: { x: 2, y: 2 },
				falloff: "hard",
				shape: "circle",
				size: 5,
			}),
		).toBe(1);
	});

	it("decreases linear influence toward the edge", () => {
		const centerInfluence = getTerrainBrushInfluence({
			cell: { x: 4, y: 4 },
			center: { x: 4, y: 4 },
			falloff: "linear",
			shape: "circle",
			size: 5,
		});
		const edgeInfluence = getTerrainBrushInfluence({
			cell: { x: 4, y: 2 },
			center: { x: 4, y: 4 },
			falloff: "linear",
			shape: "circle",
			size: 5,
		});

		expect(centerInfluence).toBe(1);
		expect(edgeInfluence).toBeGreaterThan(0);
		expect(edgeInfluence).toBeLessThan(centerInfluence);
	});

	it("keeps smooth falloff bounded and deterministic", () => {
		const options = {
			cell: { x: 2, y: 2 },
			center: { x: 4, y: 4 },
			falloff: "smooth" as const,
			shape: "square" as const,
			size: 5,
		};
		const influence = getTerrainBrushInfluence(options);

		expect(influence).toBe(getTerrainBrushInfluence(options));
		expect(influence).toBeGreaterThanOrEqual(0);
		expect(influence).toBeLessThanOrEqual(1);
		expect(influence).toBeLessThan(
			getTerrainBrushInfluence({
				...options,
				cell: { x: 4, y: 4 },
			}),
		);
	});

	it("keeps size 1 falloff valid", () => {
		expect(
			resolveTerrainBrushSamples({
				bounds,
				center: { x: 2, y: 2 },
				falloff: "linear",
				shape: "circle",
				size: 1,
			}),
		).toEqual([{ influence: 1, x: 2, y: 2 }]);
	});
});

describe("resolveTerrainHeightUpdates", () => {
	it("moves an isolated height spike toward the eight-neighbour average", () => {
		const area = makeHeightArea(3, 3, [{ height: 4, x: 1, y: 1 }]);

		expect(
			resolveTerrainHeightUpdates({
				area,
				operation: "smooth",
				samples: [{ influence: 1, x: 1, y: 1 }],
				strength: 1,
			}),
		).toEqual([{ height: 3, x: 1, y: 1 }]);
	});

	it("leaves flat terrain unchanged", () => {
		expect(
			resolveTerrainHeightUpdates({
				area: makeHeightArea(3, 3),
				operation: "smooth",
				samples: [{ influence: 1, x: 1, y: 1 }],
				strength: 1,
			}),
		).toEqual([]);
	});

	it("handles map edges safely", () => {
		expect(
			resolveTerrainHeightUpdates({
				area: makeHeightArea(2, 2, [{ height: 4, x: 0, y: 0 }]),
				operation: "smooth",
				samples: [{ influence: 1, x: 0, y: 0 }],
				strength: 1,
			}),
		).toEqual([{ height: 3, x: 0, y: 0 }]);
	});

	it("calculates smoothing from a stable source snapshot", () => {
		const area = makeHeightArea(3, 3, [
			{ height: 8, x: 1, y: 1 },
			{ height: 0, x: 2, y: 1 },
		]);
		const samples = [
			{ influence: 1, x: 1, y: 1 },
			{ influence: 1, x: 2, y: 1 },
		];

		expect(
			resolveTerrainHeightUpdates({
				area,
				operation: "smooth",
				samples,
				strength: 1,
			}),
		).toEqual(
			resolveTerrainHeightUpdates({
				area,
				operation: "smooth",
				samples: [...samples].reverse(),
				strength: 1,
			}).reverse(),
		);
	});

	it("respects strength and falloff influence", () => {
		const area = makeHeightArea(3, 3, [{ height: 8, x: 1, y: 1 }]);

		expect(
			resolveTerrainHeightUpdates({
				area,
				operation: "smooth",
				samples: [{ influence: 1, x: 1, y: 1 }],
				strength: 1,
			}),
		).toEqual([{ height: 5, x: 1, y: 1 }]);
		expect(
			resolveTerrainHeightUpdates({
				area,
				operation: "smooth",
				samples: [{ influence: 0.5, x: 1, y: 1 }],
				strength: 1,
			}),
		).toEqual([{ height: 7, x: 1, y: 1 }]);
	});

	it("applies deterministic injected roughen samples", () => {
		const area = makeHeightArea(2, 1);
		const sample = (cell: TerrainBrushCell) => (cell.x === 0 ? 1 : -1);

		expect(
			resolveTerrainHeightUpdates({
				area,
				noiseSample: sample,
				operation: "roughen",
				samples: [
					{ influence: 1, x: 0, y: 0 },
					{ influence: 1, x: 1, y: 0 },
				],
				strength: 1,
			}),
		).toEqual([
			{ height: 1, x: 0, y: 0 },
			{ height: -1, x: 1, y: 0 },
		]);
	});

	it("keeps roughen variation bounded and falloff-aware", () => {
		const area = makeHeightArea(2, 1);

		expect(
			resolveTerrainHeightUpdates({
				area,
				noiseSample: () => 1,
				operation: "roughen",
				samples: [
					{ influence: 1, x: 0, y: 0 },
					{ influence: 0.2, x: 1, y: 0 },
				],
				strength: 4,
			}),
		).toEqual([
			{ height: 4, x: 0, y: 0 },
			{ height: 1, x: 1, y: 0 },
		]);
	});
});

describe("resolveTerrainBrushStrokeSamples", () => {
	it("fills skipped cells between fast drag samples", () => {
		expect(
			resolveTerrainBrushStrokeSamples({
				bounds: { height: 1, width: 6 },
				end: { x: 5, y: 0 },
				falloff: "hard",
				shape: "square",
				size: 1,
				start: { x: 0, y: 0 },
			}),
		).toEqual([
			{ influence: 1, x: 0, y: 0 },
			{ influence: 1, x: 1, y: 0 },
			{ influence: 1, x: 2, y: 0 },
			{ influence: 1, x: 3, y: 0 },
			{ influence: 1, x: 4, y: 0 },
			{ influence: 1, x: 5, y: 0 },
		]);
	});
});

describe("terrain slope helpers", () => {
	it("expands slope cells by radius around the ramp line", () => {
		expect(
			resolveTerrainSlopeCells({
				bounds: { height: 3, width: 5 },
				end: { x: 4, y: 1 },
				radius: 1,
				start: { x: 0, y: 1 },
			}),
		).toHaveLength(15);
	});

	it("creates a ramp from the start height to the requested end height", () => {
		expect(
			resolveTerrainSlopeHeightUpdates({
				area: makeHeightArea(5, 1),
				bounds: { height: 1, width: 5 },
				end: { x: 4, y: 0 },
				endHeight: 4,
				radius: 0,
				start: { x: 0, y: 0 },
				strength: 1,
			}),
		).toEqual([
			{ height: 1, x: 1, y: 0 },
			{ height: 2, x: 2, y: 0 },
			{ height: 3, x: 3, y: 0 },
			{ height: 4, x: 4, y: 0 },
		]);
	});

	it("applies falloff across the ramp width", () => {
		expect(
			resolveTerrainSlopeHeightUpdates({
				area: makeHeightArea(5, 3),
				bounds: { height: 3, width: 5 },
				end: { x: 4, y: 1 },
				endHeight: 4,
				falloff: "linear",
				radius: 1,
				start: { x: 0, y: 1 },
				strength: 1,
			}),
		).toContainEqual({ height: 1, x: 2, y: 0 });
		expect(
			resolveTerrainSlopeHeightUpdates({
				area: makeHeightArea(5, 3),
				bounds: { height: 3, width: 5 },
				end: { x: 4, y: 1 },
				endHeight: 4,
				falloff: "linear",
				radius: 1,
				start: { x: 0, y: 1 },
				strength: 1,
			}),
		).toContainEqual({ height: 2, x: 2, y: 1 });
	});
});

describe("resolveTerrainLine", () => {
	it("resolves horizontal lines", () => {
		expect(
			resolveTerrainLine({
				bounds: { height: 5, width: 5 },
				end: { x: 3, y: 1 },
				start: { x: 0, y: 1 },
			}),
		).toEqual([
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 3, y: 1 },
		]);
	});

	it("resolves vertical lines", () => {
		expect(
			resolveTerrainLine({
				bounds: { height: 5, width: 5 },
				end: { x: 2, y: 4 },
				start: { x: 2, y: 1 },
			}),
		).toEqual([
			{ x: 2, y: 1 },
			{ x: 2, y: 2 },
			{ x: 2, y: 3 },
			{ x: 2, y: 4 },
		]);
	});

	it("resolves diagonal-ish lines without holes", () => {
		expect(
			resolveTerrainLine({
				bounds: { height: 5, width: 5 },
				end: { x: 4, y: 2 },
				start: { x: 0, y: 0 },
			}),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 1 },
			{ x: 3, y: 1 },
			{ x: 4, y: 2 },
		]);
	});

	it("resolves reverse direction deterministically", () => {
		expect(
			resolveTerrainLine({
				bounds: { height: 5, width: 5 },
				end: { x: 0, y: 0 },
				start: { x: 4, y: 2 },
			}),
		).toEqual([
			{ x: 4, y: 2 },
			{ x: 3, y: 2 },
			{ x: 2, y: 1 },
			{ x: 1, y: 1 },
			{ x: 0, y: 0 },
		]);
	});

	it("clips to map bounds and returns no duplicates", () => {
		const cells = resolveTerrainLine({
			bounds: { height: 3, width: 3 },
			end: { x: 4, y: 4 },
			start: { x: -2, y: -2 },
		});

		expect(cells).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
			{ x: 2, y: 2 },
		]);
		expect(new Set(cells.map(terrainBrushCellKey)).size).toBe(cells.length);
	});
});

describe("resolveTerrainRectangle", () => {
	it("resolves filled rectangles", () => {
		expect(
			resolveTerrainRectangle({
				bounds: { height: 4, width: 4 },
				end: { x: 2, y: 2 },
				start: { x: 1, y: 1 },
			}),
		).toEqual([
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 1, y: 2 },
			{ x: 2, y: 2 },
		]);
	});

	it("handles reversed corners", () => {
		expect(
			resolveTerrainRectangle({
				bounds: { height: 4, width: 4 },
				end: { x: 0, y: 0 },
				start: { x: 2, y: 1 },
			}),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
		]);
	});

	it("clips and returns no duplicate cells", () => {
		const cells = resolveTerrainRectangle({
			bounds: { height: 2, width: 2 },
			end: { x: 1, y: 1 },
			start: { x: -1, y: -1 },
		});

		expect(cells).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		]);
		expect(new Set(cells.map(terrainBrushCellKey)).size).toBe(cells.length);
	});
});

describe("resolveTerrainFloodFill", () => {
	it("fills connected matching terrain without crossing different tiles", () => {
		const getTileId = tileReader(3, 3, {
			"1:0": "water",
			"1:1": "water",
			"2:1": "sand",
		});

		expect(
			resolveTerrainFloodFill({
				bounds: { height: 3, width: 3 },
				getTileId,
				seed: { x: 0, y: 0 },
				targetTileId: "sand",
			}),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
			{ x: 0, y: 2 },
			{ x: 1, y: 2 },
			{ x: 2, y: 2 },
		]);
	});

	it("uses four-way connectivity", () => {
		const getTileId = tileReader(2, 2, {
			"1:0": "water",
			"0:1": "water",
		});

		expect(
			resolveTerrainFloodFill({
				bounds: { height: 2, width: 2 },
				getTileId,
				seed: { x: 0, y: 0 },
				targetTileId: "sand",
			}),
		).toEqual([{ x: 0, y: 0 }]);
	});

	it("handles large regions iteratively", () => {
		const cells = resolveTerrainFloodFill({
			bounds: { height: 40, width: 40 },
			getTileId: tileReader(40, 40, {}),
			seed: { x: 0, y: 0 },
			targetTileId: "sand",
		});

		expect(cells).toHaveLength(1600);
	});

	it("no-ops when source already matches target", () => {
		expect(
			resolveTerrainFloodFill({
				bounds: { height: 3, width: 3 },
				getTileId: tileReader(3, 3, {}),
				seed: { x: 1, y: 1 },
				targetTileId: "grass",
			}),
		).toEqual([]);
	});
});

describe("terrain paint updates", () => {
	it("matches resolved brush coordinates for application", () => {
		const cells = resolveTerrainBrushFootprint({
			bounds: { height: 3, width: 3 },
			center: { x: 1, y: 1 },
			shape: "circle",
			size: 3,
		});

		expect(
			resolveTerrainPaintUpdates({
				cells,
				getTileId: tileReader(3, 3, {}),
				targetTileId: "sand",
			}),
		).toEqual(cells.map((cell) => ({ ...cell, tileId: "sand" })));
	});
});
