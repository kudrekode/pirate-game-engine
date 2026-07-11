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
	groups: SmoothTerrainMaterialGroup[];
	materialKey: WorldMaterialKey;
	normals: number[];
	surfaceKind: "land" | "water";
	tileCount: number;
	id: string;
	indices: number[];
	vertices: number[];
};

export type SmoothTerrainMaterialGroup = {
	color: number;
	count: number;
	kind: TerrainBlockKind;
	materialKey: WorldMaterialKey;
	start: number;
	tileCount: number;
};

type TerrainSurface = {
	color: number;
	gridX: number;
	gridY: number;
	kind: TerrainBlockKind;
	materialKey: WorldMaterialKey;
	surfaceY: number;
	terrainHeight: number;
	tileId: string;
};

type SmoothMeshBuilder = {
	groupOrder: WorldMaterialKey[];
	groups: Map<
		WorldMaterialKey,
		SmoothTerrainMaterialGroup & { indices: number[] }
	>;
};

type SmoothSurfaceMeshInput = {
	centerX: number;
	centerZ: number;
	getCornerHeight: (cornerX: number, cornerY: number) => number;
	id: string;
	surfaceKind: "land" | "water";
	surfaces: TerrainSurface[];
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

function average(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((total, value) => total + value, 0) / values.length;
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
		gridX: tile.x,
		gridY: tile.y,
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

function getCornerKey(cornerX: number, cornerY: number): string {
	return `${cornerX}:${cornerY}`;
}

function computeSharedVertexNormals(
	vertices: number[],
	indices: number[],
): number[] {
	const normals = Array.from({ length: vertices.length }, () => 0);
	for (let index = 0; index < indices.length; index += 3) {
		const a = (indices[index] ?? 0) * 3;
		const b = (indices[index + 1] ?? 0) * 3;
		const c = (indices[index + 2] ?? 0) * 3;
		const ab = {
			x: (vertices[b] ?? 0) - (vertices[a] ?? 0),
			y: (vertices[b + 1] ?? 0) - (vertices[a + 1] ?? 0),
			z: (vertices[b + 2] ?? 0) - (vertices[a + 2] ?? 0),
		};
		const ac = {
			x: (vertices[c] ?? 0) - (vertices[a] ?? 0),
			y: (vertices[c + 1] ?? 0) - (vertices[a + 1] ?? 0),
			z: (vertices[c + 2] ?? 0) - (vertices[a + 2] ?? 0),
		};
		const normal = {
			x: ab.y * ac.z - ab.z * ac.y,
			y: ab.z * ac.x - ab.x * ac.z,
			z: ab.x * ac.y - ab.y * ac.x,
		};
		for (const vertexIndex of [a, b, c]) {
			normals[vertexIndex] += normal.x;
			normals[vertexIndex + 1] += normal.y;
			normals[vertexIndex + 2] += normal.z;
		}
	}

	for (let index = 0; index < normals.length; index += 3) {
		const normal = normalizeVector({
			x: normals[index],
			y: normals[index + 1],
			z: normals[index + 2],
		});
		normals[index] = normal.x;
		normals[index + 1] = normal.y;
		normals[index + 2] = normal.z;
	}
	return normals;
}

function createSmoothMeshBuilder(): SmoothMeshBuilder {
	return {
		groupOrder: [],
		groups: new Map(),
	};
}

function getSmoothMaterialGroup(
	builder: SmoothMeshBuilder,
	surface: TerrainSurface,
): SmoothTerrainMaterialGroup & { indices: number[] } {
	const existing = builder.groups.get(surface.materialKey);
	if (existing) {
		return existing;
	}
	const group = {
		color: surface.color,
		count: 0,
		indices: [],
		kind: surface.kind,
		materialKey: surface.materialKey,
		start: 0,
		tileCount: 0,
	};
	builder.groupOrder.push(surface.materialKey);
	builder.groups.set(surface.materialKey, group);
	return group;
}

function createSharedSmoothTerrainMesh({
	centerX,
	centerZ,
	getCornerHeight,
	id,
	surfaceKind,
	surfaces,
}: SmoothSurfaceMeshInput): SmoothTerrainMesh | undefined {
	if (surfaces.length === 0) {
		return undefined;
	}

	const builder = createSmoothMeshBuilder();
	const cornerIndices = new Map<string, number>();
	const vertices: number[] = [];
	const getVertexIndex = (cornerX: number, cornerY: number): number => {
		const key = getCornerKey(cornerX, cornerY);
		const existing = cornerIndices.get(key);
		if (existing !== undefined) {
			return existing;
		}
		const vertexIndex = vertices.length / 3;
		vertices.push(
			cornerX - centerX - 0.5,
			getCornerHeight(cornerX, cornerY),
			cornerY - centerZ - 0.5,
		);
		cornerIndices.set(key, vertexIndex);
		return vertexIndex;
	};

	for (const surface of surfaces) {
		const group = getSmoothMaterialGroup(builder, surface);
		const topLeft = getVertexIndex(surface.gridX, surface.gridY);
		const topRight = getVertexIndex(surface.gridX + 1, surface.gridY);
		const bottomRight = getVertexIndex(surface.gridX + 1, surface.gridY + 1);
		const bottomLeft = getVertexIndex(surface.gridX, surface.gridY + 1);
		group.indices.push(
			topLeft,
			bottomRight,
			topRight,
			bottomRight,
			topLeft,
			bottomLeft,
		);
		group.tileCount += 1;
	}

	const indices: number[] = [];
	const groups = builder.groupOrder.flatMap((materialKey) => {
		const group = builder.groups.get(materialKey);
		if (!group || group.indices.length === 0) {
			return [];
		}
		const start = indices.length;
		indices.push(...group.indices);
		return [
			{
				color: group.color,
				count: group.indices.length,
				kind: group.kind,
				materialKey: group.materialKey,
				start,
				tileCount: group.tileCount,
			},
		];
	});

	if (indices.length === 0 || groups.length === 0) {
		return undefined;
	}

	return {
		groups,
		id,
		indices,
		materialKey: groups[0]?.materialKey ?? "default",
		normals: computeSharedVertexNormals(vertices, indices),
		surfaceKind,
		tileCount: groups.reduce((total, group) => total + group.tileCount, 0),
		vertices,
	};
}

function getWaterCornerSurfaceY(
	sampler: TerrainSurfaceSampler,
	cornerX: number,
	cornerY: number,
): number {
	const values = [
		{ x: cornerX - 1, y: cornerY - 1 },
		{ x: cornerX, y: cornerY - 1 },
		{ x: cornerX - 1, y: cornerY },
		{ x: cornerX, y: cornerY },
	].flatMap((cell) => {
		const tile = sampler.getTile(cell.x, cell.y);
		return isTerrainWaterTileId(tile?.tileId)
			? [sampler.getWaterSurfaceY(cell.x, cell.y)]
			: [];
	});
	return average(values);
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
	const sampler = createTerrainSurfaceSampler(area);
	const surfaces = tiles.map((tile) => getTerrainSurface(area, tile, sampler));
	const landSurfaces = surfaces.filter((surface) => surface.kind !== "water");
	const waterSurfaces = surfaces.filter((surface) => surface.kind === "water");
	const landMesh = createSharedSmoothTerrainMesh({
		centerX,
		centerZ,
		getCornerHeight: (cornerX, cornerY) =>
			sampler.getCornerSurfaceY(cornerX, cornerY),
		id: "smooth_land",
		surfaceKind: "land",
		surfaces: landSurfaces,
	});
	const waterMesh = createSharedSmoothTerrainMesh({
		centerX,
		centerZ,
		getCornerHeight: (cornerX, cornerY) =>
			getWaterCornerSurfaceY(sampler, cornerX, cornerY),
		id: "smooth_water",
		surfaceKind: "water",
		surfaces: waterSurfaces,
	});

	return [landMesh, waterMesh].filter((mesh): mesh is SmoothTerrainMesh =>
		Boolean(mesh),
	);
}
