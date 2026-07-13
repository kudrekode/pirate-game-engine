import { describe, expect, it } from "vitest";
import { terrainTilesToSmoothMeshes } from "../../editor/sections/terrainBlocks";
import type { GameArea } from "../../types/game";
import { createSmoothTerrainBufferGeometry } from "./terrainMeshGeometry";

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
		width: 3,
		...overrides,
	};
}

describe("smooth terrain buffer geometry", () => {
	it("preserves shared vertices, normals, indices, and material groups", () => {
		const [mesh] = terrainTilesToSmoothMeshes(
			makeArea({
				terrainTiles: [
					{ tileId: "grass", x: 0, y: 0 },
					{ tileId: "sand", x: 1, y: 0 },
					{ tileId: "grass", x: 2, y: 0 },
				],
			}),
		);
		const geometry = createSmoothTerrainBufferGeometry(mesh);
		const position = geometry.getAttribute("position");
		const normal = geometry.getAttribute("normal");

		expect(position.count).toBe(8);
		expect(normal.count).toBe(position.count);
		expect(geometry.index?.count).toBe(18);
		expect(geometry.groups).toEqual([
			{ count: 12, materialIndex: 0, start: 0 },
			{ count: 6, materialIndex: 1, start: 12 },
		]);
		expect(geometry.boundingSphere).not.toBeNull();

		geometry.dispose();
	});
});
