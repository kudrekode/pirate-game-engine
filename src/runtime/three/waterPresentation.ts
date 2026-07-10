import * as THREE from "three";
import {
	getTerrainSurfaceY,
	isTerrainWaterTileId,
} from "../../data/terrainHeight";
import { createTerrainSurfaceSampler } from "../../data/terrainSurface";
import type { GameArea } from "../../types/game";
import { createWorldMaterial } from "./worldPresentation";

export type CoastlineDirection = "east" | "north" | "south" | "west";

export type CoastlineEdge = {
	adjacentWaterX: number;
	adjacentWaterY: number;
	direction: CoastlineDirection;
	gridX: number;
	gridY: number;
	landSurfaceY: number;
	waterSurfaceY: number;
	worldX: number;
	worldY: number;
	worldZ: number;
};

export type WaterPresentationState = {
	coastlineMaterial: THREE.MeshStandardMaterial;
	shallowWaterMaterial: THREE.MeshStandardMaterial;
	waterMaterial: THREE.MeshStandardMaterial;
};

export type CoastlinePresentation = {
	edges: CoastlineEdge[];
	meshes: THREE.Mesh[];
};

type WaterPresentationArea = GameArea;

const COASTLINE_STRIP_WIDTH = 0.18;
const SHALLOW_WATER_STRIP_WIDTH = 0.36;
const COASTLINE_Y_OFFSET = 0.025;
const SHALLOW_WATER_Y_OFFSET = 0.014;
const WATER_BASE_OPACITY = 0.7;
const WATER_OPACITY_AMPLITUDE = 0.035;
const COASTLINE_BASE_OPACITY = 0.72;
const COASTLINE_OPACITY_AMPLITUDE = 0.06;
const SHALLOW_WATER_BASE_OPACITY = 0.32;
const SHALLOW_WATER_OPACITY_AMPLITUDE = 0.035;

function terrainTileKey(x: number, y: number): string {
	return `${x}:${y}`;
}

function isInBounds(
	area: WaterPresentationArea,
	x: number,
	y: number,
): boolean {
	return x >= 0 && y >= 0 && x < area.width && y < area.height;
}

export function isWaterTerrainId(tileId: string | undefined): boolean {
	return isTerrainWaterTileId(tileId);
}

export function createWaterPresentationState(): WaterPresentationState {
	const waterMaterial = createWorldMaterial("water", {
		opacity: WATER_BASE_OPACITY,
	});
	waterMaterial.depthWrite = false;
	waterMaterial.transparent = true;

	const coastlineMaterial = new THREE.MeshStandardMaterial({
		color: 0xe7fbf6,
		depthWrite: false,
		metalness: 0,
		opacity: COASTLINE_BASE_OPACITY,
		roughness: 0.38,
		transparent: true,
	});

	const shallowWaterMaterial = createWorldMaterial("waterAccent", {
		opacity: SHALLOW_WATER_BASE_OPACITY,
	});
	shallowWaterMaterial.depthWrite = false;
	shallowWaterMaterial.transparent = true;

	return { coastlineMaterial, shallowWaterMaterial, waterMaterial };
}

export function updateWaterPresentation(
	state: WaterPresentationState,
	elapsedMs: number,
): void {
	const seconds = elapsedMs / 1000;
	state.waterMaterial.opacity =
		WATER_BASE_OPACITY + Math.sin(seconds * 1.35) * WATER_OPACITY_AMPLITUDE;
	state.waterMaterial.roughness = 0.19 + Math.sin(seconds * 0.85 + 0.7) * 0.035;
	state.coastlineMaterial.opacity =
		COASTLINE_BASE_OPACITY +
		Math.sin(seconds * 1.75 + 0.4) * COASTLINE_OPACITY_AMPLITUDE;
	state.shallowWaterMaterial.opacity =
		SHALLOW_WATER_BASE_OPACITY +
		Math.sin(seconds * 1.25 + 1.2) * SHALLOW_WATER_OPACITY_AMPLITUDE;
}

export function deriveCoastlineEdges(
	area: WaterPresentationArea | undefined,
): CoastlineEdge[] {
	if (!area) {
		return [];
	}

	const tileByPosition = new Map(
		area.terrainTiles
			.filter((tile) => isInBounds(area, tile.x, tile.y))
			.map((tile) => [terrainTileKey(tile.x, tile.y), tile]),
	);
	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	const edges: CoastlineEdge[] = [];
	const directions: Array<{
		direction: CoastlineDirection;
		dx: number;
		dy: number;
	}> = [
		{ direction: "north", dx: 0, dy: -1 },
		{ direction: "south", dx: 0, dy: 1 },
		{ direction: "west", dx: -1, dy: 0 },
		{ direction: "east", dx: 1, dy: 0 },
	];

	for (const tile of tileByPosition.values()) {
		if (isWaterTerrainId(tile.tileId)) {
			continue;
		}

		for (const { direction, dx, dy } of directions) {
			const adjacentWaterX = tile.x + dx;
			const adjacentWaterY = tile.y + dy;
			const adjacentTile = tileByPosition.get(
				terrainTileKey(adjacentWaterX, adjacentWaterY),
			);
			if (!isWaterTerrainId(adjacentTile?.tileId)) {
				continue;
			}

			const waterSurfaceY = getTerrainSurfaceY(
				area,
				adjacentWaterX,
				adjacentWaterY,
			);
			const landSurfaceY = getTerrainSurfaceY(area, tile.x, tile.y);
			let worldX = tile.x - centerX;
			let worldZ = tile.y - centerZ;
			if (direction === "north") {
				worldZ -= 0.5 + COASTLINE_STRIP_WIDTH / 2;
			} else if (direction === "south") {
				worldZ += 0.5 + COASTLINE_STRIP_WIDTH / 2;
			} else if (direction === "west") {
				worldX -= 0.5 + COASTLINE_STRIP_WIDTH / 2;
			} else {
				worldX += 0.5 + COASTLINE_STRIP_WIDTH / 2;
			}

			edges.push({
				adjacentWaterX,
				adjacentWaterY,
				direction,
				gridX: tile.x,
				gridY: tile.y,
				landSurfaceY,
				waterSurfaceY,
				worldX,
				worldY: waterSurfaceY + COASTLINE_Y_OFFSET,
				worldZ,
			});
		}
	}

	return edges;
}

function applyPresentationMetadata(
	mesh: THREE.Mesh,
	role: "coastline" | "shallowWater" | "water",
): void {
	mesh.userData.ignoreTerrainPicking = true;
	mesh.userData.presentationOnly = true;
	mesh.userData.waterPresentation = role;
}

export function markWaterPresentationMesh(mesh: THREE.Mesh): void {
	applyPresentationMetadata(mesh, "water");
}

type ShoreVertex = {
	x: number;
	y: number;
	z: number;
};

function createQuadGeometry(
	vertices: [ShoreVertex, ShoreVertex, ShoreVertex, ShoreVertex],
): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(
			vertices.flatMap((vertex) => [vertex.x, vertex.y, vertex.z]),
			3,
		),
	);
	geometry.setIndex([0, 1, 2, 2, 3, 0]);
	geometry.computeVertexNormals?.();
	geometry.computeBoundingSphere();
	return geometry;
}

function gridToWorld(area: WaterPresentationArea, x: number, y: number) {
	const centerX = (area.width - 1) / 2;
	const centerZ = (area.height - 1) / 2;
	return {
		x: x - centerX,
		z: y - centerZ,
	};
}

function getCoastlineGeometry(
	area: WaterPresentationArea,
	edge: CoastlineEdge,
): THREE.BufferGeometry {
	const sampler = createTerrainSurfaceSampler(area);
	const landInset = COASTLINE_STRIP_WIDTH;
	const waterInset = COASTLINE_STRIP_WIDTH;
	const x0 = edge.gridX - 0.5;
	const x1 = edge.gridX + 0.5;
	const y0 = edge.gridY - 0.5;
	const y1 = edge.gridY + 0.5;

	let landStart = { x: edge.gridX, y: edge.gridY };
	let landEnd = { x: edge.gridX, y: edge.gridY };
	let waterStart = { x: edge.adjacentWaterX, y: edge.adjacentWaterY };
	let waterEnd = { x: edge.adjacentWaterX, y: edge.adjacentWaterY };

	if (edge.direction === "east") {
		landStart = { x: edge.gridX + 0.5 - landInset, y: y0 };
		landEnd = { x: edge.gridX + 0.5 - landInset, y: y1 };
		waterStart = { x: edge.gridX + 0.5 + waterInset, y: y0 };
		waterEnd = { x: edge.gridX + 0.5 + waterInset, y: y1 };
	} else if (edge.direction === "west") {
		landStart = { x: edge.gridX - 0.5 + landInset, y: y1 };
		landEnd = { x: edge.gridX - 0.5 + landInset, y: y0 };
		waterStart = { x: edge.gridX - 0.5 - waterInset, y: y1 };
		waterEnd = { x: edge.gridX - 0.5 - waterInset, y: y0 };
	} else if (edge.direction === "north") {
		landStart = { x: x0, y: edge.gridY - 0.5 + landInset };
		landEnd = { x: x1, y: edge.gridY - 0.5 + landInset };
		waterStart = { x: x0, y: edge.gridY - 0.5 - waterInset };
		waterEnd = { x: x1, y: edge.gridY - 0.5 - waterInset };
	} else {
		landStart = { x: x1, y: edge.gridY + 0.5 - landInset };
		landEnd = { x: x0, y: edge.gridY + 0.5 - landInset };
		waterStart = { x: x1, y: edge.gridY + 0.5 + waterInset };
		waterEnd = { x: x0, y: edge.gridY + 0.5 + waterInset };
	}

	const landStartWorld = gridToWorld(area, landStart.x, landStart.y);
	const landEndWorld = gridToWorld(area, landEnd.x, landEnd.y);
	const waterEndWorld = gridToWorld(area, waterEnd.x, waterEnd.y);
	const waterStartWorld = gridToWorld(area, waterStart.x, waterStart.y);
	return createQuadGeometry([
		{
			x: landStartWorld.x,
			y: sampler.sampleSmoothSurfaceY(landStart) + COASTLINE_Y_OFFSET,
			z: landStartWorld.z,
		},
		{
			x: landEndWorld.x,
			y: sampler.sampleSmoothSurfaceY(landEnd) + COASTLINE_Y_OFFSET,
			z: landEndWorld.z,
		},
		{
			x: waterEndWorld.x,
			y: edge.waterSurfaceY + COASTLINE_Y_OFFSET,
			z: waterEndWorld.z,
		},
		{
			x: waterStartWorld.x,
			y: edge.waterSurfaceY + COASTLINE_Y_OFFSET,
			z: waterStartWorld.z,
		},
	]);
}

function getShallowWaterGeometry(
	area: WaterPresentationArea,
	edge: CoastlineEdge,
): THREE.BufferGeometry {
	const inner = COASTLINE_STRIP_WIDTH;
	const outer = SHALLOW_WATER_STRIP_WIDTH;
	const x0 = edge.gridX - 0.5;
	const x1 = edge.gridX + 0.5;
	const y0 = edge.gridY - 0.5;
	const y1 = edge.gridY + 0.5;

	let innerStart = { x: edge.adjacentWaterX, y: edge.adjacentWaterY };
	let innerEnd = { x: edge.adjacentWaterX, y: edge.adjacentWaterY };
	let outerStart = { x: edge.adjacentWaterX, y: edge.adjacentWaterY };
	let outerEnd = { x: edge.adjacentWaterX, y: edge.adjacentWaterY };

	if (edge.direction === "east") {
		innerStart = { x: edge.gridX + 0.5 + inner, y: y0 };
		innerEnd = { x: edge.gridX + 0.5 + inner, y: y1 };
		outerStart = { x: edge.gridX + 0.5 + outer, y: y0 };
		outerEnd = { x: edge.gridX + 0.5 + outer, y: y1 };
	} else if (edge.direction === "west") {
		innerStart = { x: edge.gridX - 0.5 - inner, y: y1 };
		innerEnd = { x: edge.gridX - 0.5 - inner, y: y0 };
		outerStart = { x: edge.gridX - 0.5 - outer, y: y1 };
		outerEnd = { x: edge.gridX - 0.5 - outer, y: y0 };
	} else if (edge.direction === "north") {
		innerStart = { x: x0, y: edge.gridY - 0.5 - inner };
		innerEnd = { x: x1, y: edge.gridY - 0.5 - inner };
		outerStart = { x: x0, y: edge.gridY - 0.5 - outer };
		outerEnd = { x: x1, y: edge.gridY - 0.5 - outer };
	} else {
		innerStart = { x: x1, y: edge.gridY + 0.5 + inner };
		innerEnd = { x: x0, y: edge.gridY + 0.5 + inner };
		outerStart = { x: x1, y: edge.gridY + 0.5 + outer };
		outerEnd = { x: x0, y: edge.gridY + 0.5 + outer };
	}

	const innerStartWorld = gridToWorld(area, innerStart.x, innerStart.y);
	const innerEndWorld = gridToWorld(area, innerEnd.x, innerEnd.y);
	const outerEndWorld = gridToWorld(area, outerEnd.x, outerEnd.y);
	const outerStartWorld = gridToWorld(area, outerStart.x, outerStart.y);
	const y = edge.waterSurfaceY + SHALLOW_WATER_Y_OFFSET;
	return createQuadGeometry([
		{ x: innerStartWorld.x, y, z: innerStartWorld.z },
		{ x: innerEndWorld.x, y, z: innerEndWorld.z },
		{ x: outerEndWorld.x, y, z: outerEndWorld.z },
		{ x: outerStartWorld.x, y, z: outerStartWorld.z },
	]);
}

export function createCoastlinePresentation(
	area: WaterPresentationArea | undefined,
	state: WaterPresentationState,
): CoastlinePresentation {
	const edges = deriveCoastlineEdges(area);
	if (!area) {
		return { edges, meshes: [] };
	}
	const meshes = edges.flatMap((edge) => {
		const coastlineMesh = new THREE.Mesh(
			getCoastlineGeometry(area, edge),
			state.coastlineMaterial,
		);
		applyPresentationMetadata(coastlineMesh, "coastline");

		const shallowWaterMesh = new THREE.Mesh(
			getShallowWaterGeometry(area, edge),
			state.shallowWaterMaterial,
		);
		applyPresentationMetadata(shallowWaterMesh, "shallowWater");
		return [coastlineMesh, shallowWaterMesh];
	});

	return { edges, meshes };
}
