import * as THREE from "three";
import { isTerrainWaterTileId } from "../../data/terrainHeight";
import { createTerrainSurfaceSampler } from "../../data/terrainSurface";
import type { AreaThemeConfig, GameArea } from "../../types/game";
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
	time: { value: number };
	coastlineMaterial: THREE.MeshStandardMaterial;
	shallowWaterMaterial: THREE.MeshStandardMaterial;
	waterMaterial: THREE.MeshStandardMaterial;
};

export type CoastlinePresentation = {
	edges: CoastlineEdge[];
	meshes: THREE.Mesh[];
};

type WaterPresentationArea = GameArea;

const COASTLINE_STRIP_WIDTH = 0.28;
const SHALLOW_WATER_STRIP_WIDTH = 0.85;
const COASTLINE_Y_OFFSET = 0.025;
const SHALLOW_WATER_Y_OFFSET = 0.014;
const WATER_BASE_OPACITY = 0.94;
const WATER_OPACITY_AMPLITUDE = 0.008;
const COASTLINE_BASE_OPACITY = 1;
const SHALLOW_WATER_BASE_OPACITY = 0.38;
const SHALLOW_WATER_OPACITY_AMPLITUDE = 0.015;

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

export function createWaterPresentationState(
	atmosphere?: AreaThemeConfig["atmosphere"],
): WaterPresentationState {
	const time = { value: 0 };
	const waterMaterial = createWorldMaterial("water", {
		opacity: WATER_BASE_OPACITY,
	});
	waterMaterial.depthWrite = false;
	waterMaterial.transparent = true;
	const moonlit = atmosphere === "moonlit";
	if (moonlit) {
		waterMaterial.color.setHex(0x283755);
		waterMaterial.roughness = 0.27;
	}
	// Small world-space ripples in the existing Standard material: lighting,
	// shadows, fog and colour management remain Three's normal rendering path.
	waterMaterial.onBeforeCompile = (shader) => {
		shader.uniforms.coastalTime = time;
		shader.vertexShader =
			`varying vec3 vCoastalPosition;\n${shader.vertexShader}`.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\nvCoastalPosition = (modelMatrix * vec4(position, 1.0)).xyz;",
			);
		shader.fragmentShader =
			`uniform float coastalTime;\nvarying vec3 vCoastalPosition;\n${shader.fragmentShader}`
				.replace(
					"#include <color_fragment>",
					`
				#include <color_fragment>
				float swell = sin(vCoastalPosition.x * 1.7 + vCoastalPosition.z * 2.3 + coastalTime * 0.65);
				float ripple = sin(vCoastalPosition.x * 5.1 - vCoastalPosition.z * 3.8 + coastalTime * 0.9);
				diffuseColor.rgb *= 1.0 + swell * 0.16 + ripple * 0.045;
				${
					moonlit
						? `
				vec3 viewRay = normalize(vCoastalPosition - cameraPosition);
				float angle = viewRay.x - 0.28 * -viewRay.z;
				float path = exp(-angle * angle * 31.0) * max(0.0, -viewRay.z);
				vec2 p = vCoastalPosition.xz;
				float gust = sin(p.x * 3.3 + p.y * .7 + coastalTime * .3) * cos(p.x * 1.9 - p.y * 1.2);
				float crest = sin(p.y * 21.0 + 3.2 * swell + 2.3 * ripple + gust + coastalTime);
				float glint = smoothstep(.66, 1.0, crest) * smoothstep(-.25, .79, gust);
				diffuseColor.rgb += vec3(.16, .12, .21) * path * glint;
				diffuseColor.rgb += vec3(.023,.016,.035) * pow(1.0 - abs(viewRay.y), 4.0);
				`
						: ""
				}
			`,
				)
				.replace(
					"#include <normal_fragment_maps>",
					`
				#include <normal_fragment_maps>
				vec3 rippleNormal = vec3(
					0.045 * cos(vCoastalPosition.x * 1.7 + vCoastalPosition.z * 2.3 + coastalTime * 0.65),
					0.0,
					0.035 * cos(vCoastalPosition.x * 5.1 - vCoastalPosition.z * 3.8 + coastalTime * 0.9));
				normal = normalize(normal + mat3(viewMatrix) * rippleNormal);
			`,
				);
	};
	waterMaterial.customProgramCacheKey = () =>
		moonlit ? "moonlit-water-v1" : "coastal-water-v1";

	const coastlineMaterial = new THREE.MeshStandardMaterial({
		color: moonlit ? 0x626173 : 0xffffff,
		depthWrite: true,
		metalness: 0,
		opacity: COASTLINE_BASE_OPACITY,
		roughness: 0.94,
		transparent: false,
		vertexColors: true,
	});

	const shallowWaterMaterial = createWorldMaterial("waterAccent", {
		opacity: SHALLOW_WATER_BASE_OPACITY,
	});
	shallowWaterMaterial.depthWrite = false;
	if (moonlit) shallowWaterMaterial.color.setHex(0x444264);
	shallowWaterMaterial.transparent = true;
	shallowWaterMaterial.vertexColors = true;

	return { coastlineMaterial, shallowWaterMaterial, waterMaterial, time };
}

export function updateWaterPresentation(
	state: WaterPresentationState,
	elapsedMs: number,
): void {
	const seconds = elapsedMs / 1000;
	state.time.value = seconds;
	state.waterMaterial.opacity =
		WATER_BASE_OPACITY + Math.sin(seconds * 1.35) * WATER_OPACITY_AMPLITUDE;
	state.waterMaterial.roughness = 0.3 + Math.sin(seconds * 0.85 + 0.7) * 0.015;
	state.shallowWaterMaterial.opacity =
		SHALLOW_WATER_BASE_OPACITY +
		Math.sin(seconds * 1.25 + 1.2) * SHALLOW_WATER_OPACITY_AMPLITUDE;
}

export function deriveCoastlineEdges(
	area: WaterPresentationArea | undefined,
	sampler = area && createTerrainSurfaceSampler(area),
): CoastlineEdge[] {
	if (!area || !sampler) {
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

			const waterSurfaceY = sampler.getCellSurfaceY(
				adjacentWaterX,
				adjacentWaterY,
			);
			const landSurfaceY = sampler.getCellSurfaceY(tile.x, tile.y);
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
	alpha: [number, number, number, number],
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
	geometry.setAttribute(
		"color",
		new THREE.Float32BufferAttribute(
			alpha.flatMap((a) => [1, 1, 1, a]),
			4,
		),
	);
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

function getCoastlineVertices(
	area: WaterPresentationArea,
	edge: CoastlineEdge,
	sampler: ReturnType<typeof createTerrainSurfaceSampler>,
): ShoreVertex[] {
	const landInset = 0.01;
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
	return [
		{
			x: landStartWorld.x,
			y:
				sampler.getCornerSurfaceY(
					Math.round(landStart.x + 0.5),
					Math.round(landStart.y + 0.5),
				) + COASTLINE_Y_OFFSET,
			z: landStartWorld.z,
		},
		{
			x: landEndWorld.x,
			y:
				sampler.getCornerSurfaceY(
					Math.round(landEnd.x + 0.5),
					Math.round(landEnd.y + 0.5),
				) + COASTLINE_Y_OFFSET,
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
	];
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
	return createQuadGeometry(
		[
			{ x: innerStartWorld.x, y, z: innerStartWorld.z },
			{ x: innerEndWorld.x, y, z: innerEndWorld.z },
			{ x: outerEndWorld.x, y, z: outerEndWorld.z },
			{ x: outerStartWorld.x, y, z: outerStartWorld.z },
		],
		[1, 1, 0, 0],
	);
}

export function createCoastlinePresentation(
	area: WaterPresentationArea | undefined,
	state: WaterPresentationState,
): CoastlinePresentation {
	if (!area) return { edges: [], meshes: [] };
	const sampler = createTerrainSurfaceSampler(area);
	const edges = deriveCoastlineEdges(area, sampler);
	if (!edges.length) return { edges, meshes: [] };

	// Opaque bank strips share one material. Keep translucent shallows separate
	// so Three can still depth-sort them with water and other transparent meshes.
	const positions: number[] = [];
	const colors: number[] = [];
	const indices: number[] = [];
	const sand = new THREE.Color(0xc7b791);
	const wet = new THREE.Color(0x77998c);
	const shallows = edges.map((edge) => {
		const base = positions.length / 3;
		getCoastlineVertices(area, edge, sampler).forEach((vertex, i) => {
			positions.push(vertex.x, vertex.y, vertex.z);
			const color = i < 2 ? sand : wet;
			colors.push(color.r, color.g, color.b, 1);
		});
		indices.push(base, base + 1, base + 2, base + 2, base + 3, base);
		const mesh = new THREE.Mesh(
			getShallowWaterGeometry(area, edge),
			state.shallowWaterMaterial,
		);
		applyPresentationMetadata(mesh, "shallowWater");
		return mesh;
	});
	const bank = new THREE.BufferGeometry();
	bank.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	bank.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
	bank.setIndex(indices);
	bank.computeVertexNormals?.();
	bank.computeBoundingSphere();
	const coast = new THREE.Mesh(bank, state.coastlineMaterial);
	applyPresentationMetadata(coast, "coastline");
	return { edges, meshes: [coast, ...shallows] };
}
