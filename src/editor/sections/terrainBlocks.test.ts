import { describe, expect, it } from "vitest";
import type { GameArea } from "../../types/game";
import {
	terrainTilesToBlocks,
	terrainTilesToSmoothMeshes,
} from "./terrainBlocks";

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
				color: 0x4f8f45,
				gridX: 0,
				gridY: 0,
				height: 1,
				kind: "grass",
				materialKey: "grass",
				surfaceY: 1,
				terrainHeight: 0,
				threeX: -1.5,
				threeZ: -1,
				tileId: "grass",
				yOffset: 0.5,
			},
			{
				color: 0x7d8791,
				gridX: 3,
				gridY: 2,
				height: 1,
				kind: "stone",
				materialKey: "stone",
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
		expect(water.color).toBe(0x2f9fd8);
		expect(water.materialKey).toBe("water");
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
		expect(unknown.color).toBe(0x94a3b8);
		expect(unknown.materialKey).toBe("default");
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

describe("terrainTilesToSmoothMeshes", () => {
	function everyNumberIsFinite(values: number[]): boolean {
		return values.every((value) => Number.isFinite(value));
	}

	function getVertexHeights(vertices: number[]): number[] {
		const heights: number[] = [];
		for (let index = 1; index < vertices.length; index += 3) {
			heights.push(vertices[index]);
		}
		return heights;
	}

	function getTriangleNormalY(vertices: number[], triangle: number[]): number {
		const [aIndex, bIndex, cIndex] = triangle.map((index) => index * 3);
		const ax = vertices[aIndex] ?? 0;
		const ay = vertices[aIndex + 1] ?? 0;
		const az = vertices[aIndex + 2] ?? 0;
		const abx = (vertices[bIndex] ?? 0) - ax;
		const aby = (vertices[bIndex + 1] ?? 0) - ay;
		const abz = (vertices[bIndex + 2] ?? 0) - az;
		const acx = (vertices[cIndex] ?? 0) - ax;
		const acy = (vertices[cIndex + 1] ?? 0) - ay;
		const acz = (vertices[cIndex + 2] ?? 0) - az;
		return abz * acx - abx * acz;
	}

	it("generates a flat smooth mesh from flat terrain", () => {
		const [mesh] = terrainTilesToSmoothMeshes(
			makeArea({
				height: 2,
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "grass" },
					{ x: 0, y: 1, tileId: "grass" },
					{ x: 1, y: 1, tileId: "grass" },
				],
				width: 2,
			}),
		);

		expect(mesh).toMatchObject({
			materialKey: "grass",
			tileCount: 4,
		});
		expect(mesh.vertices).toHaveLength(48);
		expect(mesh.normals).toHaveLength(48);
		expect(mesh.indices).toHaveLength(24);
		expect(new Set(getVertexHeights(mesh.vertices))).toEqual(new Set([1]));
		expect(everyNumberIsFinite(mesh.vertices)).toBe(true);
		expect(everyNumberIsFinite(mesh.normals)).toBe(true);
		expect(everyNumberIsFinite(mesh.indices)).toBe(true);
	});

	it("orders smooth terrain triangles to face upward for front-side materials", () => {
		const [mesh] = terrainTilesToSmoothMeshes(
			makeArea({
				height: 1,
				terrainTiles: [{ x: 0, y: 0, tileId: "grass" }],
				width: 1,
			}),
		);

		const triangleNormalYValues: number[] = [];
		for (let index = 0; index < mesh.indices.length; index += 3) {
			triangleNormalYValues.push(
				getTriangleNormalY(mesh.vertices, mesh.indices.slice(index, index + 3)),
			);
		}

		expect(triangleNormalYValues).toHaveLength(2);
		expect(triangleNormalYValues.every((normalY) => normalY > 0)).toBe(true);
	});

	it("derives varied smooth mesh corner heights from neighboring cells", () => {
		const [mesh] = terrainTilesToSmoothMeshes(
			makeArea({
				height: 3,
				terrainHeights: [{ x: 1, y: 1, height: 4 }],
				terrainTiles: Array.from({ length: 3 }).flatMap((_, y) =>
					Array.from({ length: 3 }).map((__, x) => ({
						tileId: "grass",
						x,
						y,
					})),
				),
				width: 3,
			}),
		);
		const heights = getVertexHeights(mesh.vertices);

		expect(Math.max(...heights)).toBe(2);
		expect(heights).toContain(2);
		expect(heights).toContain(1);
		expect(heights).not.toContain(5);
		expect(
			mesh.normals.some((value, index) => index % 3 !== 1 && value !== 0),
		).toBe(true);
		expect(everyNumberIsFinite(mesh.vertices)).toBe(true);
		expect(everyNumberIsFinite(mesh.normals)).toBe(true);
	});

	it("handles map edges, missing tile data, and invalid heights safely", () => {
		const [mesh] = terrainTilesToSmoothMeshes(
			makeArea({
				height: 2,
				terrainHeights: [{ x: 1, y: 1, height: Number.NaN }],
				terrainTiles: [
					{ x: -1, y: 0, tileId: "grass" },
					{ x: 1, y: 1, tileId: "sand" },
				],
				width: 2,
			}),
		);

		expect(mesh.materialKey).toBe("sand");
		expect(mesh.tileCount).toBe(1);
		expect(new Set(getVertexHeights(mesh.vertices))).toEqual(new Set([1]));
		expect(everyNumberIsFinite(mesh.vertices)).toBe(true);
		expect(everyNumberIsFinite(mesh.normals)).toBe(true);
		expect(everyNumberIsFinite(mesh.indices)).toBe(true);
	});

	it("groups smooth terrain by readable material category", () => {
		const meshes = terrainTilesToSmoothMeshes(
			makeArea({
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "sand" },
					{ x: 2, y: 0, tileId: "water" },
					{ x: 3, y: 0, tileId: "mystery" },
				],
			}),
		);

		expect(meshes.map((mesh) => mesh.materialKey)).toEqual([
			"grass",
			"sand",
			"water",
			"default",
		]);
		expect(
			meshes.find((mesh) => mesh.materialKey === "water")?.vertices,
		).toContain(0.18);
	});

	it("keeps smooth water tiles flat while neighboring land can slope toward water", () => {
		const meshes = terrainTilesToSmoothMeshes(
			makeArea({
				height: 1,
				terrainHeights: [{ height: 4, x: 0, y: 0 }],
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "water" },
				],
				width: 2,
			}),
		);
		const grassHeights = getVertexHeights(
			meshes.find((mesh) => mesh.materialKey === "grass")?.vertices ?? [],
		);
		const waterHeights = getVertexHeights(
			meshes.find((mesh) => mesh.materialKey === "water")?.vertices ?? [],
		);

		expect(Math.max(...grassHeights)).toBeGreaterThan(
			Math.min(...grassHeights),
		);
		expect(new Set(waterHeights)).toEqual(new Set([0.18]));
	});

	it("returns no smooth meshes for empty or missing terrain", () => {
		expect(terrainTilesToSmoothMeshes(undefined)).toEqual([]);
		expect(terrainTilesToSmoothMeshes(makeArea())).toEqual([]);
	});
});
