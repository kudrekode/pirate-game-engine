import { describe, expect, it } from "vitest";
import {
	resolveTerrainBrushFootprint,
	terrainBrushCellKey,
} from "./terrainBrush";

const bounds = { height: 8, width: 8 };

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
