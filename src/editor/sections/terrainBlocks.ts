import {
	getTerrainHeight,
	isTerrainWaterTileId,
} from "../../data/terrainHeight";
import {
	createTerrainSurfaceSampler,
	type TerrainSurfaceSampler,
} from "../../data/terrainSurface";
import {
	getWorldMaterialColor,
	resolveTerrainMaterialKey,
	type WorldMaterialKey,
} from "../../runtime/three/worldPresentation";
import type { GameArea, MapTile } from "../../types/game";

export type TerrainRenderMode = "blocky" | "smooth";

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

export type SmoothTerrainMesh = {
	id: string;
	color: number;
	indices: number[];
	kind: TerrainBlockKind;
	materialKey: WorldMaterialKey;
	normals: number[];
	tileCount: number;
	vertices: number[];
};

type TerrainSurface = {
	color: number;
	kind: TerrainBlockKind;
	materialKey: WorldMaterialKey;
	surfaceY: number;
	terrainHeight: number;
	tileId: string;
};

type SmoothMeshBuilder = {
	color: number;
	indices: number[];
	kind: TerrainBlockKind;
	materialKey: WorldMaterialKey;
	normals: number[];
	tileCount: number;
	vertices: number[];
};

function getTerrainBlockKind(tileId: string): TerrainBlockKind {
	if (isTerrainWaterTileId(tileId)) {
		return "water";
	}
	if (tileId === "grass") {
		return "grass";
	}
	if (tileId === "dirt") {
		return "dirt";
	}
	if (tileId === "sand") {
		return "sand";
	}
	if (tileId.includes("stone") || tileId.includes("rock")) {
		return "stone";
	}
	return "unknown";
}

export function getTerrainBlockColor(tileId: string): number {
	return getWorldMaterialColor(resolveTerrainMaterialKey(tileId));
}

function isTileInBounds(area: GameArea, tile: MapTile): boolean {
	return (
		tile.x >= 0 && tile.y >= 0 && tile.x < area.width && tile.y < area.height
	);
}

function getTerrainTilesInBounds(area: GameArea): MapTile[] {
	return area.terrainTiles.filter((tile) => isTileInBounds(area, tile));
}

function getTerrainSurface(
	area: GameArea,
	tile: MapTile,
	sampler: TerrainSurfaceSampler,
): TerrainSurface {
	const kind = getTerrainBlockKind(tile.tileId);
	const materialKey = resolveTerrainMaterialKey(tile.tileId);
	const terrainHeight = getTerrainHeight(area, tile.x, tile.y);
	return {
		color: getTerrainBlockColor(tile.tileId),
		kind,
		materialKey,
		surfaceY: sampler.getCellSurfaceY(tile.x, tile.y),
		terrainHeight,
		tileId: tile.tileId,
	};
}

export function terrainTilesToBlocks(
	area: GameArea | undefined,
): TerrainBlock[] {
	if (!area) {
		return [];
	}

	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	const sampler = createTerrainSurfaceSampler(area);

	return getTerrainTilesInBounds(area).map((tile) => {
		const surface = getTerrainSurface(area, tile, sampler);
		const baseY = Math.min(0, surface.terrainHeight);
		const height = Math.max(0.18, surface.surfaceY - baseY);
		return {
			color: surface.color,
			gridX: tile.x,
			gridY: tile.y,
			height,
			id: `${tile.x}_${tile.y}_${tile.tileId}`,
			kind: surface.kind,
			materialKey: surface.materialKey,
			surfaceY: surface.surfaceY,
			terrainHeight: surface.terrainHeight,
			tileId: surface.tileId,
			threeX: tile.x - centerX,
			threeZ: tile.y - centerZ,
			yOffset: baseY + height / 2,
		};
	});
}

function normalizeVector(vector: { x: number; y: number; z: number }): {
	x: number;
	y: number;
	z: number;
} {
	const length = Math.hypot(vector.x, vector.y, vector.z);
	if (!Number.isFinite(length) || length <= 0) {
		return { x: 0, y: 1, z: 0 };
	}
	return {
		x: vector.x / length,
		y: vector.y / length,
		z: vector.z / length,
	};
}

export function terrainTilesToSmoothMeshes(
	area: GameArea | undefined,
): SmoothTerrainMesh[] {
	if (!area || area.width <= 0 || area.height <= 0) {
		return [];
	}

	const tiles = getTerrainTilesInBounds(area);
	if (tiles.length === 0) {
		return [];
	}

	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	const meshes = new Map<WorldMaterialKey, SmoothMeshBuilder>();
	const sampler = createTerrainSurfaceSampler(area);

	const getCornerHeight = (
		surface: TerrainSurface,
		cornerX: number,
		cornerY: number,
	): number => {
		return surface.kind === "water"
			? surface.surfaceY
			: sampler.getCornerSurfaceY(cornerX, cornerY);
	};

	const getCornerNormal = (
		surface: TerrainSurface,
		cornerX: number,
		cornerY: number,
	) => {
		if (surface.kind === "water") {
			return { x: 0, y: 1, z: 0 };
		}
		const clampedX = Math.min(area.width, Math.max(0, cornerX));
		const clampedY = Math.min(area.height, Math.max(0, cornerY));
		const left = sampler.getCornerSurfaceY(clampedX - 1, clampedY);
		const right = sampler.getCornerSurfaceY(clampedX + 1, clampedY);
		const up = sampler.getCornerSurfaceY(clampedX, clampedY - 1);
		const down = sampler.getCornerSurfaceY(clampedX, clampedY + 1);
		return normalizeVector({
			x: left - right,
			y: 2,
			z: up - down,
		});
	};

	const getMeshBuilder = (surface: TerrainSurface): SmoothMeshBuilder => {
		const existing = meshes.get(surface.materialKey);
		if (existing) {
			return existing;
		}
		const builder: SmoothMeshBuilder = {
			color: surface.color,
			indices: [],
			kind: surface.kind,
			materialKey: surface.materialKey,
			normals: [],
			tileCount: 0,
			vertices: [],
		};
		meshes.set(surface.materialKey, builder);
		return builder;
	};

	for (const tile of tiles) {
		const surface = getTerrainSurface(area, tile, sampler);
		const builder = getMeshBuilder(surface);
		const baseIndex = builder.vertices.length / 3;
		const left = tile.x - centerX - 0.5;
		const right = tile.x - centerX + 0.5;
		const top = tile.y - centerZ - 0.5;
		const bottom = tile.y - centerZ + 0.5;
		const cornerNormals = [
			getCornerNormal(surface, tile.x, tile.y),
			getCornerNormal(surface, tile.x + 1, tile.y),
			getCornerNormal(surface, tile.x + 1, tile.y + 1),
			getCornerNormal(surface, tile.x, tile.y + 1),
		];
		const vertices = [
			{ x: left, y: getCornerHeight(surface, tile.x, tile.y), z: top },
			{ x: right, y: getCornerHeight(surface, tile.x + 1, tile.y), z: top },
			{
				x: right,
				y: getCornerHeight(surface, tile.x + 1, tile.y + 1),
				z: bottom,
			},
			{ x: left, y: getCornerHeight(surface, tile.x, tile.y + 1), z: bottom },
		];

		vertices.forEach((vertex, index) => {
			const normal = cornerNormals[index];
			builder.vertices.push(vertex.x, vertex.y, vertex.z);
			builder.normals.push(normal.x, normal.y, normal.z);
		});
		builder.indices.push(
			baseIndex,
			baseIndex + 2,
			baseIndex + 1,
			baseIndex + 2,
			baseIndex,
			baseIndex + 3,
		);
		builder.tileCount += 1;
	}

	return Array.from(meshes.values()).map((mesh) => ({
		color: mesh.color,
		id: `smooth_${mesh.materialKey}`,
		indices: mesh.indices,
		kind: mesh.kind,
		materialKey: mesh.materialKey,
		normals: mesh.normals,
		tileCount: mesh.tileCount,
		vertices: mesh.vertices,
	}));
}
