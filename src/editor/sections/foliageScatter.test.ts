import { describe, expect, it } from "vitest";
import merewatch from "../../../hollow-kingdom.project.json";
import { migrateFoliageBrushSettings } from "../../data/foliageBrushSettings";
import { importProjectJson } from "../../data/projectImport";
import { listThreeVisualAssets } from "../../runtime/three/threeVisualAssetRegistry";
import type { GameArea, ObjectInstance } from "../../types/game";
import {
	createFoliageScatterSampler,
	DEFAULT_FOLIAGE_BRUSH_SETTINGS,
	getFoliageEraseIds,
	MAX_FOLIAGE_PER_STROKE,
} from "./foliageScatter";

function fieldArea(width = 26, height = 26): GameArea {
	return {
		id: "field",
		name: "Field",
		kind: "outdoor",
		width,
		height,
		tileSize: 32,
		terrainTiles: Array.from({ length: width * height }, (_, index) => ({
			x: index % width,
			y: Math.floor(index / width),
			tileId: "grass",
		})),
		overlayTiles: [],
		structures: [],
		objects: [],
		pickups: [],
		npcs: [],
		eventBlocks: [],
	};
}

const center = { x: 12, y: 12 };

describe("foliage scatter", () => {
	it("uses registered Merewatch vegetation and preserves an authored stroke through import", () => {
		const project = importProjectJson(JSON.stringify(merewatch));
		const area = project.areas[0];
		const registry = listThreeVisualAssets();
		const settings = DEFAULT_FOLIAGE_BRUSH_SETTINGS;
		for (const { assetId } of settings.palette) {
			const asset = registry.find((entry) => entry.id === assetId);
			expect(asset?.tags).toContain("foliage");
			expect(asset?.hiddenFromBrowser).toBeFalsy();
		}
		const sample = createFoliageScatterSampler(area, {
			terrainMode: "smooth",
			objectDefinitions: project.objects,
		});
		const grove = { x: 13, y: 52 };
		const plants = sample(grove, settings);
		expect(plants.length).toBeGreaterThan(2);
		expect(sample({ x: 19, y: 21 }, settings)).toEqual([]);
		const instances: ObjectInstance[] = plants.map((candidate, index) => {
			const x = Math.round(candidate.x);
			const y = Math.round(candidate.y);
			return {
				id: `grove-${index}`,
				areaId: area.id,
				objectDefinitionId: candidate.assetId,
				x,
				y,
				state: { foliageGroupId: "grove", foliageScatterKey: candidate.key },
				transform: {
					position: { x: candidate.x - x, y: 0, z: candidate.y - y },
					rotation: { x: 0, y: candidate.rotation, z: 0 },
					scale: { x: candidate.scale, y: candidate.scale, z: candidate.scale },
				},
			};
		});
		area.objects.push(...instances);
		project.foliageBrush = settings;
		const reloaded = importProjectJson(JSON.stringify(project));
		expect(reloaded.foliageBrush).toEqual(settings);
		const reloadedInstances = reloaded.areas[0].objects.slice(
			-instances.length,
		);
		for (const [index, instance] of reloadedInstances.entries()) {
			expect(instance).toMatchObject(instances[index]);
		}
		expect(
			getFoliageEraseIds(reloadedInstances, grove, settings.radius),
		).toEqual(instances.map(({ id }) => id));
	});

	it("reuses a weighted asset mixture and rolls repeatable transforms across overlapping stamps", () => {
		const sample = createFoliageScatterSampler(fieldArea());
		const brush = {
			...DEFAULT_FOLIAGE_BRUSH_SETTINGS,
			density: 1,
			radius: 5,
			spacing: 0.85,
			rotationVariation: 35,
			palette: [
				{ assetId: "pine", weight: 4 },
				{ assetId: "dead-pine", weight: 1 },
				{ assetId: "disabled", weight: 0 },
			],
		};
		const first = sample(center, brush);
		const second = sample({ x: 13, y: 12 }, brush);
		expect(sample(center, brush)).toEqual(first);
		expect(sample(center, { ...brush, seed: 848 })).not.toEqual(first);
		const pines = first.filter((candidate) => candidate.assetId === "pine");
		const deadPines = first.filter(
			(candidate) => candidate.assetId === "dead-pine",
		);
		expect(pines.length).toBeGreaterThan(deadPines.length);
		expect(deadPines.length).toBeGreaterThan(0);
		expect(pines.length + deadPines.length).toBe(first.length);
		const firstByKey = new Map(
			first.map((candidate) => [candidate.key, candidate]),
		);
		const shared = second.filter((candidate) => firstByKey.has(candidate.key));
		expect(shared.length).toBeGreaterThan(5);
		for (const candidate of shared) {
			expect(candidate).toEqual(firstByKey.get(candidate.key));
			expect(Math.abs(candidate.rotation)).toBeLessThanOrEqual(35);
			expect(candidate.scale).toBeGreaterThanOrEqual(brush.minScale);
			expect(candidate.scale).toBeLessThanOrEqual(brush.maxScale);
		}
		const unoccupied = sample(center, brush, {
			excludedKeys: new Set(firstByKey.keys()),
		});
		expect(unoccupied).toEqual([]);
		expect(sample(center, { ...brush, density: 0.5 }).length).toBeLessThan(
			first.length,
		);
		expect(sample(center, { ...brush, spacing: 3 }).length).toBeLessThan(
			first.length,
		);
	});

	it("honours the map edge and both the stamp budget and the hard limit", () => {
		const sample = createFoliageScatterSampler(fieldArea());
		const brush = {
			...DEFAULT_FOLIAGE_BRUSH_SETTINGS,
			radius: 16,
			density: 1,
			spacing: 0.5,
		};
		const corner = { x: 0, y: 0 };
		const preview = sample(corner, brush, { limit: 4 });
		expect(preview).toHaveLength(4);
		expect(preview.every(({ x, y }) => x >= -0.5 && y >= -0.5)).toBe(true);
		expect(sample(corner, brush, { limit: 10000 })).toHaveLength(
			MAX_FOLIAGE_PER_STROKE,
		);
		expect(sample(corner, { ...brush, density: 0 })).toEqual([]);
		expect(sample(corner, { ...brush, palette: [] })).toEqual([]);
	});

	it("masks water, road tiles, overlays and the footprint of a rotated cobble instance", () => {
		const area = fieldArea();
		for (const tile of area.terrainTiles) {
			if (tile.x <= 8) tile.tileId = "water";
			if (tile.x === 10) tile.tileId = "stone-path";
		}
		area.overlayTiles = [{ x: 12, y: 10, overlayId: "road" }];
		area.objects = [
			{
				id: "cobbles-1",
				areaId: area.id,
				objectDefinitionId: "placed-map-asset",
				threeVisual: { mode: "asset", assetId: "mere-cobbles" },
				x: 14,
				y: 12,
				transform: {
					position: { x: 0.4, y: 0, z: 0 },
					rotation: { x: 0, y: 90, z: 0 },
					scale: { x: 1, y: 1, z: 1 },
				},
			},
		];
		const sample = createFoliageScatterSampler(area);
		const brush = {
			...DEFAULT_FOLIAGE_BRUSH_SETTINGS,
			radius: 6,
			density: 1,
			spacing: 0.8,
			maxSlope: 90,
		};
		const allowed = sample(center, {
			...brush,
			excludeWater: false,
			excludeRoads: false,
		});
		const filtered = sample(center, brush);
		const water = ({ x }: { x: number }) => Math.round(x) <= 8;
		const path = ({ x }: { x: number }) => Math.round(x) === 10;
		const overlay = ({ x, y }: { x: number; y: number }) =>
			Math.round(x) === 12 && Math.round(y) === 10;
		const cobbles = ({ x, y }: { x: number; y: number }) =>
			Math.abs(x - 14.4) < 2 && Math.abs(y - 12) < 1.5;
		for (const test of [water, path, overlay, cobbles]) {
			expect(allowed.some(test)).toBe(true);
			expect(filtered.some(test)).toBe(false);
		}
	});

	it("uses the existing surface sampler for elevation and steep terrain", () => {
		const area = fieldArea();
		area.terrainHeights = area.terrainTiles
			.filter(({ x }) => x >= 12)
			.map(({ x, y }) => ({ x, y, height: 4 }));
		const sample = createFoliageScatterSampler(area, { terrainMode: "smooth" });
		const brush = {
			...DEFAULT_FOLIAGE_BRUSH_SETTINGS,
			density: 1,
			radius: 4,
			spacing: 0.5,
		};
		const unrestricted = sample(center, { ...brush, maxSlope: 90 });
		const slopeLimited = sample(center, { ...brush, maxSlope: 15 });
		const elevated = sample(center, { ...brush, maxSlope: 90, minHeight: 4.5 });
		expect(
			unrestricted.some(({ surfaceY }) => surfaceY > 1.5 && surfaceY < 4.5),
		).toBe(true);
		expect(
			slopeLimited.every(({ surfaceY }) => surfaceY === 1 || surfaceY === 5),
		).toBe(true);
		expect(elevated.length).toBeGreaterThan(0);
		expect(elevated.every(({ surfaceY }) => surfaceY >= 4.5)).toBe(true);
	});

	it("erases only scattered instances inside the radius at their transformed positions", () => {
		const tree: ObjectInstance = {
			id: "tree",
			objectDefinitionId: "mere-spruce",
			areaId: "field",
			x: 13,
			y: 12,
			transform: {
				position: { x: -0.4, y: 0, z: 0 },
				rotation: { x: 0, y: 40, z: 0 },
				scale: { x: 1, y: 1, z: 1 },
			},
		};
		expect(
			getFoliageEraseIds(
				[
					tree,
					{ ...tree, id: "scatter-a", state: { foliageGroupId: "stroke" } },
					{
						...tree,
						id: "scatter-b",
						x: 14,
						state: { foliageGroupId: "stroke" },
					},
				],
				center,
				0.75,
			),
		).toEqual(["scatter-a"]);
	});
});

describe("foliage brush settings migration", () => {
	it("round trips the palette and respects intentionally empty settings", () => {
		expect(migrateFoliageBrushSettings(undefined)).toBeUndefined();
		const authored = {
			...DEFAULT_FOLIAGE_BRUSH_SETTINGS,
			palette: [],
			excludeRoads: false,
			seed: -99,
		};
		expect(
			migrateFoliageBrushSettings(JSON.parse(JSON.stringify(authored))),
		).toEqual(authored);
	});

	it("bounds malformed values while preserving known references and zero weights", () => {
		const migrated = migrateFoliageBrushSettings({
			density: Infinity,
			spacing: -7,
			minScale: 5,
			maxScale: 1,
			palette: [
				{ assetId: "variant-pine-1", weight: 0 },
				{ assetId: "variant-pine-1", weight: 5 },
				{ assetId: "   ", weight: 4 },
			],
		});
		expect(migrated).toMatchObject({
			density: DEFAULT_FOLIAGE_BRUSH_SETTINGS.density,
			spacing: 0.5,
			minScale: 1,
			maxScale: 5,
			palette: [{ assetId: "variant-pine-1", weight: 0 }],
		});
	});
});
