import { getTerrainHeight } from "../../data/terrainHeight";
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

function tileKey(x: number, y: number): string {
	return `${x}:${y}`;
}

function isTileInBounds(area: GameArea, tile: MapTile): boolean {
	return (
		tile.x >= 0 && tile.y >= 0 && tile.x < area.width && tile.y < area.height
	);
}

function getTerrainTilesInBounds(area: GameArea): MapTile[] {
	return area.terrainTiles.filter((tile) => isTileInBounds(area, tile));
}

function getTerrainSurface(area: GameArea, tile: MapTile): TerrainSurface {
	const kind = getTerrainBlockKind(tile.tileId);
	const materialKey = resolveTerrainMaterialKey(tile.tileId);
	const terrainHeight = getTerrainHeight(area, tile.x, tile.y);
	return {
		color: getTerrainBlockColor(tile.tileId),
		kind,
		materialKey,
		surfaceY: terrainHeight + (kind === "water" ? 0.18 : 1),
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

	return getTerrainTilesInBounds(area).map((tile) => {
		const surface = getTerrainSurface(area, tile);
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

function average(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((total, value) => total + value, 0) / values.length;
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

	const tileLookup = new Map(
		tiles.map((tile) => [tileKey(tile.x, tile.y), tile]),
	);
	const surfaceLookup = new Map<string, TerrainSurface>();
	const cornerHeightLookup = new Map<string, number>();
	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	const meshes = new Map<WorldMaterialKey, SmoothMeshBuilder>();

	const getSurfaceAt = (x: number, y: number): TerrainSurface | undefined => {
		const key = tileKey(x, y);
		const tile = tileLookup.get(key);
		if (!tile) {
			return undefined;
		}
		const existing = surfaceLookup.get(key);
		if (existing) {
			return existing;
		}
		const surface = getTerrainSurface(area, tile);
		surfaceLookup.set(key, surface);
		return surface;
	};

	const getCornerHeight = (cornerX: number, cornerY: number): number => {
		const clampedX = Math.min(area.width, Math.max(0, cornerX));
		const clampedY = Math.min(area.height, Math.max(0, cornerY));
		const key = tileKey(clampedX, clampedY);
		const existing = cornerHeightLookup.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const surfaceValues = [
			getSurfaceAt(clampedX - 1, clampedY - 1)?.surfaceY,
			getSurfaceAt(clampedX, clampedY - 1)?.surfaceY,
			getSurfaceAt(clampedX - 1, clampedY)?.surfaceY,
			getSurfaceAt(clampedX, clampedY)?.surfaceY,
		].filter((value): value is number => typeof value === "number");
		const height = average(surfaceValues);
		cornerHeightLookup.set(key, height);
		return height;
	};

	const getCornerNormal = (cornerX: number, cornerY: number) => {
		const clampedX = Math.min(area.width, Math.max(0, cornerX));
		const clampedY = Math.min(area.height, Math.max(0, cornerY));
		const left = getCornerHeight(clampedX - 1, clampedY);
		const right = getCornerHeight(clampedX + 1, clampedY);
		const up = getCornerHeight(clampedX, clampedY - 1);
		const down = getCornerHeight(clampedX, clampedY + 1);
		return normalizeVector({
			x: left - right,
			y: 2,
			z: up - down,
		});
	};

	const getCenterNormal = (
		topLeft: { x: number; y: number; z: number },
		topRight: { x: number; y: number; z: number },
		bottomRight: { x: number; y: number; z: number },
		bottomLeft: { x: number; y: number; z: number },
	) =>
		normalizeVector({
			x: topLeft.x + topRight.x + bottomRight.x + bottomLeft.x,
			y: topLeft.y + topRight.y + bottomRight.y + bottomLeft.y,
			z: topLeft.z + topRight.z + bottomRight.z + bottomLeft.z,
		});

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
		const surface = getSurfaceAt(tile.x, tile.y);
		if (!surface) {
			continue;
		}
		const builder = getMeshBuilder(surface);
		const baseIndex = builder.vertices.length / 3;
		const left = tile.x - centerX - 0.5;
		const right = tile.x - centerX + 0.5;
		const top = tile.y - centerZ - 0.5;
		const bottom = tile.y - centerZ + 0.5;
		const cornerNormals = [
			getCornerNormal(tile.x, tile.y),
			getCornerNormal(tile.x + 1, tile.y),
			getCornerNormal(tile.x + 1, tile.y + 1),
			getCornerNormal(tile.x, tile.y + 1),
		];
		const centerNormal = getCenterNormal(
			cornerNormals[0],
			cornerNormals[1],
			cornerNormals[2],
			cornerNormals[3],
		);
		const vertices = [
			{ x: left, y: getCornerHeight(tile.x, tile.y), z: top },
			{ x: right, y: getCornerHeight(tile.x + 1, tile.y), z: top },
			{ x: right, y: getCornerHeight(tile.x + 1, tile.y + 1), z: bottom },
			{ x: left, y: getCornerHeight(tile.x, tile.y + 1), z: bottom },
			{ x: tile.x - centerX, y: surface.surfaceY, z: tile.y - centerZ },
		];
		const normals = [...cornerNormals, centerNormal];

		vertices.forEach((vertex, index) => {
			const normal = normals[index];
			builder.vertices.push(vertex.x, vertex.y, vertex.z);
			builder.normals.push(normal.x, normal.y, normal.z);
		});
		builder.indices.push(
			baseIndex,
			baseIndex + 4,
			baseIndex + 1,
			baseIndex + 1,
			baseIndex + 4,
			baseIndex + 2,
			baseIndex + 2,
			baseIndex + 4,
			baseIndex + 3,
			baseIndex + 3,
			baseIndex + 4,
			baseIndex,
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
