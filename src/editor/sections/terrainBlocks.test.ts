import { describe, expect, it } from "vitest";
import type { GameArea } from "../../types/game";
import { terrainTilesToBlocks } from "./terrainBlocks";

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
		terrainTiles: [],
		tileSize: 32,
		width: 4,
		...overrides,
	};
}

describe("terrainTilesToBlocks", () => {
	it("converts terrain tiles to centered Three.js block descriptors", () => {
		const blocks = terrainTilesToBlocks(
			makeArea({
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 3, y: 2, tileId: "stone_floor" },
				],
			}),
		);

		expect(blocks).toMatchObject([
			{
				color: 0x5aa95a,
				gridX: 0,
				gridY: 0,
				height: 1,
				kind: "grass",
				surfaceY: 1,
				terrainHeight: 0,
				threeX: -1.5,
				threeZ: -1,
				tileId: "grass",
				yOffset: 0.5,
			},
			{
				color: 0x8f969f,
				gridX: 3,
				gridY: 2,
				height: 1,
				kind: "stone",
				surfaceY: 1,
				terrainHeight: 0,
				threeX: 1.5,
				threeZ: 1,
				tileId: "stone_floor",
				yOffset: 0.5,
			},
		]);
	});

	it("renders water as a lower flatter block", () => {
		const [water] = terrainTilesToBlocks(
			makeArea({ terrainTiles: [{ x: 1, y: 1, tileId: "water" }] }),
		);

		expect(water.kind).toBe("water");
		expect(water.height).toBe(0.18);
		expect(water.surfaceY).toBe(0.18);
		expect(water.yOffset).toBe(0.09);
		expect(water.color).toBe(0x4f9fd9);
	});

	it("uses authored terrain height for raised and lowered blocks", () => {
		const blocks = terrainTilesToBlocks(
			makeArea({
				terrainHeights: [
					{ x: 0, y: 0, height: 2 },
					{ x: 1, y: 0, height: -1 },
				],
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "grass" },
				],
			}),
		);

		expect(blocks[0]).toMatchObject({
			height: 3,
			surfaceY: 3,
			terrainHeight: 2,
			yOffset: 1.5,
		});
		expect(blocks[1]).toMatchObject({
			height: 1,
			surfaceY: 0,
			terrainHeight: -1,
			yOffset: -0.5,
		});
	});

	it("uses unknown styling for unrecognised terrain IDs", () => {
		const [unknown] = terrainTilesToBlocks(
			makeArea({ terrainTiles: [{ x: 1, y: 1, tileId: "mystery" }] }),
		);

		expect(unknown.kind).toBe("unknown");
		expect(unknown.color).toBe(0x9aa4af);
	});

	it("ignores out-of-bounds tiles and handles empty areas", () => {
		expect(terrainTilesToBlocks(undefined)).toEqual([]);
		expect(terrainTilesToBlocks(makeArea())).toEqual([]);
		expect(
			terrainTilesToBlocks(
				makeArea({
					terrainTiles: [
						{ x: -1, y: 0, tileId: "grass" },
						{ x: 0, y: 3, tileId: "grass" },
						{ x: 1, y: 1, tileId: "sand" },
					],
				}),
			),
		).toHaveLength(1);
	});
});
