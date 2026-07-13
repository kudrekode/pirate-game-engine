import { describe, expect, it } from "vitest";
import type { GameArea } from "../types/game";
import {
	createTerrainSurfaceSampler,
	getTerrainPresentationSurfaceY,
	sampleSmoothTerrainSurfaceY,
} from "./terrainSurface";

function makeArea(overrides: Partial<GameArea> = {}): GameArea {
	return {
		eventBlocks: [],
		height: 1,
		id: "area",
		kind: "outdoor",
		name: "Area",
		npcs: [],
		objects: [],
		overlayTiles: [],
		pickups: [],
		structures: [],
		terrainTiles: [],
		tileSize: 32,
		width: 2,
		...overrides,
	};
}

describe("terrain surface sampling", () => {
	it("keeps blocky sampling on authored cell surfaces", () => {
		const area = makeArea({
			terrainHeights: [{ height: 2, x: 0, y: 0 }],
			terrainTiles: [
				{ tileId: "grass", x: 0, y: 0 },
				{ tileId: "water", x: 1, y: 0 },
			],
		});

		expect(getTerrainPresentationSurfaceY(area, { x: 0, y: 0 })).toBe(3);
		expect(getTerrainPresentationSurfaceY(area, { x: 1, y: 0 })).toBe(0.18);
	});

	it("samples smooth terrain from derived corner heights", () => {
		const area = makeArea({
			height: 3,
			terrainHeights: [{ height: 4, x: 1, y: 1 }],
			terrainTiles: Array.from({ length: 3 }).flatMap((_, y) =>
				Array.from({ length: 3 }).map((__, x) => ({
					tileId: "grass",
					x,
					y,
				})),
			),
			width: 3,
		});
		const sampler = createTerrainSurfaceSampler(area);

		expect(sampler.getCornerSurfaceY(1, 1)).toBe(2);
		expect(sampleSmoothTerrainSurfaceY(area, { x: 1, y: 1 })).toBe(2);
		expect(getTerrainPresentationSurfaceY(area, { x: 1, y: 1 }, "blocky")).toBe(
			5,
		);
		expect(getTerrainPresentationSurfaceY(area, { x: 1, y: 1 }, "smooth")).toBe(
			2,
		);
	});

	it("keeps water-cell sampling flat while adjacent land blends toward water", () => {
		const area = makeArea({
			terrainHeights: [{ height: -1, x: 1, y: 0 }],
			terrainTiles: [
				{ tileId: "grass", x: 0, y: 0 },
				{ tileId: "water", x: 1, y: 0 },
			],
		});

		expect(sampleSmoothTerrainSurfaceY(area, { x: 1, y: 0 })).toBeCloseTo(
			-0.82,
		);
		expect(sampleSmoothTerrainSurfaceY(area, { x: 0, y: 0 })).toBeLessThan(1);
		expect(sampleSmoothTerrainSurfaceY(area, { x: 0, y: 0 })).toBeGreaterThan(
			-0.82,
		);
	});
});
