import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { GameArea } from "../../types/game";
import {
	createCoastlinePresentation,
	createWaterPresentationState,
	deriveCoastlineEdges,
	isWaterTerrainId,
	markWaterPresentationMesh,
	updateWaterPresentation,
} from "./waterPresentation";
import waterPresentationSource from "./waterPresentation.ts?raw";

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
		width: 2,
		...overrides,
	};
}

describe("water presentation helpers", () => {
	it("derives cardinal coastline edges from authored land-water terrain", () => {
		const edges = deriveCoastlineEdges(
			makeArea({
				terrainHeights: [
					{ height: 4, x: 0, y: 0 },
					{ height: -1, x: 1, y: 0 },
				],
				terrainTiles: [
					{ tileId: "grass", x: 0, y: 0 },
					{ tileId: "water", x: 1, y: 0 },
				],
			}),
		);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			adjacentWaterX: 1,
			adjacentWaterY: 0,
			direction: "east",
			gridX: 0,
			gridY: 0,
			landSurfaceY: 5,
		});
		expect(edges[0]?.waterSurfaceY).toBeCloseTo(-0.82);
		expect(edges[0]?.worldY).toBeCloseTo(-0.795);
		expect(edges[0]?.worldY).toBeLessThan(edges[0]?.landSurfaceY ?? 0);
	});

	it("treats material-resolved water terrain as water without changing schema", () => {
		expect(isWaterTerrainId("water")).toBe(true);
		expect(isWaterTerrainId("deep_water")).toBe(true);
		expect(isWaterTerrainId("sea_cave")).toBe(true);
		expect(isWaterTerrainId("grass")).toBe(false);
		expect(isWaterTerrainId(undefined)).toBe(false);
	});

	it("creates coastline and shallow-water gradient meshes as non-pickable presentation", () => {
		const state = createWaterPresentationState();
		const presentation = createCoastlinePresentation(
			makeArea({
				width: 3,
				terrainTiles: [
					{ tileId: "grass", x: 0, y: 0 },
					{ tileId: "water", x: 1, y: 0 },
					{ tileId: "grass", x: 2, y: 0 },
				],
			}),
			state,
		);

		expect(presentation.edges.map((edge) => edge.direction)).toEqual([
			"east",
			"west",
		]);
		expect(presentation.meshes).toHaveLength(4);
		expect(presentation.meshes[0]?.material).toBe(state.coastlineMaterial);
		expect(presentation.meshes[1]?.material).toBe(state.shallowWaterMaterial);
		expect(presentation.meshes[2]?.material).toBe(state.coastlineMaterial);
		expect(presentation.meshes[3]?.material).toBe(state.shallowWaterMaterial);
		expect(presentation.meshes[0]?.userData).toMatchObject({
			ignoreTerrainPicking: true,
			presentationOnly: true,
			waterPresentation: "coastline",
		});
		expect(presentation.meshes[1]?.userData).toMatchObject({
			ignoreTerrainPicking: true,
			presentationOnly: true,
			waterPresentation: "shallowWater",
		});

		presentation.meshes.forEach((mesh) => {
			mesh.geometry.dispose();
		});
		state.coastlineMaterial.dispose();
		state.shallowWaterMaterial.dispose();
		state.waterMaterial.dispose();
	});

	it("slopes coastline geometry from sampled land height toward water height", () => {
		const state = createWaterPresentationState();
		const presentation = createCoastlinePresentation(
			makeArea({
				terrainHeights: [
					{ height: 4, x: 0, y: 0 },
					{ height: -1, x: 1, y: 0 },
				],
				terrainTiles: [
					{ tileId: "grass", x: 0, y: 0 },
					{ tileId: "water", x: 1, y: 0 },
				],
			}),
			state,
		);
		const coastPositions =
			presentation.meshes[0]?.geometry.getAttribute("position");
		const shallowPositions =
			presentation.meshes[1]?.geometry.getAttribute("position");
		const coastY = Array.from({ length: coastPositions?.count ?? 0 }).map(
			(_, index) => coastPositions?.getY(index) ?? 0,
		);
		const shallowY = Array.from({ length: shallowPositions?.count ?? 0 }).map(
			(_, index) => shallowPositions?.getY(index) ?? 0,
		);

		expect(coastY.length).toBe(4);
		expect(Math.max(...coastY)).toBeGreaterThan(Math.min(...coastY));
		expect(Math.min(...coastY)).toBeCloseTo(-0.795);
		expect(new Set(shallowY.map((value) => value.toFixed(3))).size).toBe(1);

		presentation.meshes.forEach((mesh) => {
			mesh.geometry.dispose();
		});
		state.coastlineMaterial.dispose();
		state.shallowWaterMaterial.dispose();
		state.waterMaterial.dispose();
	});

	it("updates one shared water material without rebuilding mesh geometry", () => {
		const state = createWaterPresentationState();
		const geometry = new THREE.BoxGeometry(1, 0.18, 1);
		const mesh = new THREE.Mesh(geometry, state.waterMaterial);
		const initialOpacity = state.waterMaterial.opacity;
		const initialShallowOpacity = state.shallowWaterMaterial.opacity;

		markWaterPresentationMesh(mesh);
		updateWaterPresentation(state, 1200);

		expect(mesh.material).toBe(state.waterMaterial);
		expect(mesh.geometry).toBe(geometry);
		expect(state.waterMaterial.opacity).not.toBe(initialOpacity);
		expect(state.shallowWaterMaterial.opacity).not.toBe(initialShallowOpacity);
		expect(state.waterMaterial.depthWrite).toBe(false);
		expect(mesh.userData).toMatchObject({
			ignoreTerrainPicking: true,
			presentationOnly: true,
			waterPresentation: "water",
		});

		geometry.dispose();
		state.coastlineMaterial.dispose();
		state.shallowWaterMaterial.dispose();
		state.waterMaterial.dispose();
	});

	it("stays independent from runtime gameplay state and helpers", () => {
		expect(waterPresentationSource).not.toMatch(/runtimeSession/);
		expect(waterPresentationSource).not.toMatch(/playerMovementTransaction/);
		expect(waterPresentationSource).not.toMatch(/runtimeNpcTick/);
		expect(waterPresentationSource).not.toMatch(/ruleEngine/);
	});
});
