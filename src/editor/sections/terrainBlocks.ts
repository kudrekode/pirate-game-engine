import { getTerrainHeight } from "../../data/terrainHeight";
import type { GameArea } from "../../types/game";

export type TerrainBlockKind =
	| "grass"
	| "dirt"
	| "sand"
	| "stone"
	| "water"
	| "unknown";

export type TerrainBlock = {
	id: string;
	gridX: number;
	gridY: number;
	kind: TerrainBlockKind;
	tileId: string;
	color: number;
	height: number;
	terrainHeight: number;
	surfaceY: number;
	yOffset: number;
	threeX: number;
	threeZ: number;
};

const TERRAIN_BLOCK_COLORS: Record<TerrainBlockKind, number> = {
	dirt: 0x8a5a2b,
	grass: 0x5aa95a,
	sand: 0xd8c77a,
	stone: 0x8f969f,
	unknown: 0x9aa4af,
	water: 0x4f9fd9,
};

function getTerrainBlockKind(tileId: string): TerrainBlockKind {
	if (tileId === "grass") {
		return "grass";
	}
	if (tileId === "dirt") {
		return "dirt";
	}
	if (tileId === "sand") {
		return "sand";
	}
	if (tileId === "water") {
		return "water";
	}
	if (tileId.includes("stone") || tileId.includes("rock")) {
		return "stone";
	}
	return "unknown";
}

export function terrainTilesToBlocks(
	area: GameArea | undefined,
): TerrainBlock[] {
	if (!area) {
		return [];
	}

	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;

	return area.terrainTiles
		.filter(
			(tile) =>
				tile.x >= 0 &&
				tile.y >= 0 &&
				tile.x < area.width &&
				tile.y < area.height,
		)
		.map((tile) => {
			const kind = getTerrainBlockKind(tile.tileId);
			const terrainHeight = getTerrainHeight(area, tile.x, tile.y);
			const surfaceY = terrainHeight + (kind === "water" ? 0.18 : 1);
			const baseY = Math.min(0, terrainHeight);
			const height = Math.max(0.18, surfaceY - baseY);
			return {
				color: TERRAIN_BLOCK_COLORS[kind],
				gridX: tile.x,
				gridY: tile.y,
				height,
				id: `${tile.x}_${tile.y}_${tile.tileId}`,
				kind,
				surfaceY,
				terrainHeight,
				tileId: tile.tileId,
				threeX: tile.x - centerX,
				threeZ: tile.y - centerZ,
				yOffset: baseY + height / 2,
			};
		});
}
