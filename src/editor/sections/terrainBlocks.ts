import { getTerrainHeight } from "../../data/terrainHeight";
import {
	getWorldMaterialColor,
	resolveTerrainMaterialKey,
	type WorldMaterialKey,
} from "../../runtime/three/worldPresentation";
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
	materialKey: WorldMaterialKey;
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

export function getTerrainBlockColor(tileId: string): number {
	return getWorldMaterialColor(resolveTerrainMaterialKey(tileId));
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
			const materialKey = resolveTerrainMaterialKey(tile.tileId);
			const terrainHeight = getTerrainHeight(area, tile.x, tile.y);
			const surfaceY = terrainHeight + (kind === "water" ? 0.18 : 1);
			const baseY = Math.min(0, terrainHeight);
			const height = Math.max(0.18, surfaceY - baseY);
			return {
				color: getTerrainBlockColor(tile.tileId),
				gridX: tile.x,
				gridY: tile.y,
				height,
				id: `${tile.x}_${tile.y}_${tile.tileId}`,
				kind,
				materialKey,
				surfaceY,
				terrainHeight,
				tileId: tile.tileId,
				threeX: tile.x - centerX,
				threeZ: tile.y - centerZ,
				yOffset: baseY + height / 2,
			};
		});
}
