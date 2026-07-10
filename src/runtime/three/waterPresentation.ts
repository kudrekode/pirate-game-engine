import * as THREE from "three";
import { getTerrainSurfaceY } from "../../data/terrainHeight";
import type { GameArea } from "../../types/game";
import {
	createWorldMaterial,
	resolveTerrainMaterialKey,
} from "./worldPresentation";

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
	waterMaterial: THREE.MeshStandardMaterial;
};

export type CoastlinePresentation = {
	edges: CoastlineEdge[];
	meshes: THREE.Mesh[];
};

type WaterPresentationArea = GameArea;

const COASTLINE_STRIP_THICKNESS = 0.025;
const COASTLINE_STRIP_WIDTH = 0.14;
const COASTLINE_Y_OFFSET = 0.025;
const WATER_BASE_OPACITY = 0.7;
const WATER_OPACITY_AMPLITUDE = 0.035;
const COASTLINE_BASE_OPACITY = 0.72;
const COASTLINE_OPACITY_AMPLITUDE = 0.06;

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
	return tileId !== undefined && resolveTerrainMaterialKey(tileId) === "water";
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

	return { coastlineMaterial, waterMaterial };
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
	role: "coastline" | "water",
): void {
	mesh.userData.ignoreTerrainPicking = true;
	mesh.userData.presentationOnly = true;
	mesh.userData.waterPresentation = role;
}

export function markWaterPresentationMesh(mesh: THREE.Mesh): void {
	applyPresentationMetadata(mesh, "water");
}

export function createCoastlinePresentation(
	area: WaterPresentationArea | undefined,
	state: WaterPresentationState,
): CoastlinePresentation {
	const edges = deriveCoastlineEdges(area);
	let horizontalGeometry: THREE.BoxGeometry | undefined;
	let verticalGeometry: THREE.BoxGeometry | undefined;
	const meshes = edges.map((edge) => {
		const isHorizontal =
			edge.direction === "north" || edge.direction === "south";
		if (isHorizontal && !horizontalGeometry) {
			horizontalGeometry = new THREE.BoxGeometry(
				1,
				COASTLINE_STRIP_THICKNESS,
				COASTLINE_STRIP_WIDTH,
			);
		}
		if (!isHorizontal && !verticalGeometry) {
			verticalGeometry = new THREE.BoxGeometry(
				COASTLINE_STRIP_WIDTH,
				COASTLINE_STRIP_THICKNESS,
				1,
			);
		}
		const geometry = isHorizontal ? horizontalGeometry : verticalGeometry;
		if (!geometry) {
			throw new Error("Coastline geometry could not be created.");
		}
		const mesh = new THREE.Mesh(geometry, state.coastlineMaterial);
		mesh.position.set(
			edge.worldX,
			edge.worldY + COASTLINE_STRIP_THICKNESS / 2,
			edge.worldZ,
		);
		applyPresentationMetadata(mesh, "coastline");
		return mesh;
	});

	return { edges, meshes };
}
