import { describe, expect, it } from "vitest";
import type { GameArea } from "../types/game";
import {
	adjustTerrainHeight,
	getTerrainHeight,
	migrateTerrainHeights,
	setTerrainHeight,
	validateTerrainHeights,
} from "./terrainHeight";

function makeArea(overrides: Partial<GameArea> = {}): GameArea {
	return {
		eventBlocks: [],
		height: 3,
		id: "area",
		kind: "outdoor",
		name: "Area",
		npcs: [],
		objects: [],
		overlayTiles: [],
		pickups: [],
		structures: [],
		terrainTiles: [{ x: 1, y: 1, tileId: "grass" }],
		tileSize: 32,
		width: 4,
		...overrides,
	};
}

describe("terrain height helpers", () => {
	it("returns 0 for missing terrain height", () => {
		expect(getTerrainHeight(makeArea(), 1, 1)).toBe(0);
	});

	it("sets and removes terrain heights", () => {
		const raised = setTerrainHeight(makeArea(), 1, 1, 3);
		expect(getTerrainHeight(raised, 1, 1)).toBe(3);

		const reset = setTerrainHeight(raised, 1, 1, 0);
		expect(getTerrainHeight(reset, 1, 1)).toBe(0);
		expect(reset.terrainHeights).toBeUndefined();
	});

	it("adjusts and clamps terrain heights", () => {
		const raised = adjustTerrainHeight(makeArea(), 1, 1, 20);
		expect(getTerrainHeight(raised, 1, 1)).toBe(8);

		const lowered = adjustTerrainHeight(raised, 1, 1, -20);
		expect(getTerrainHeight(lowered, 1, 1)).toBe(-2);
	});

	it("migrates invalid or missing terrain heights safely", () => {
		expect(migrateTerrainHeights(undefined)).toEqual([]);
		expect(
			migrateTerrainHeights([
				{ x: 1, y: 2, height: 2 },
				{ x: 2, y: 2, height: 99 },
				{ x: 3, y: 2, height: 0 },
				{ x: 4, y: 2, height: Number.NaN },
			]),
		).toEqual([
			{ x: 1, y: 2, height: 2 },
			{ x: 2, y: 2, height: 8 },
		]);
	});

	it("validates out-of-bounds and invalid terrain heights", () => {
		const issues = validateTerrainHeights(
			makeArea({
				terrainHeights: [
					{ x: 9, y: 1, height: 1 },
					{ x: 1, y: 1, height: Number.NaN },
				],
			}),
		);

		expect(issues.map((issue) => issue.id)).toEqual([
			"area:terrain-height-oob:0",
			"area:terrain-height-invalid:1",
		]);
	});
});
