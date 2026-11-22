import { migrateFoliageBrushSettings } from "../../data/foliageBrushSettings";
import { isTerrainWaterTileId } from "../../data/terrainHeight";
import {
	createTerrainSurfaceSampler,
	type TerrainSurfaceMode,
	type TerrainSurfacePosition,
	type TerrainSurfaceSampler,
} from "../../data/terrainSurface";
import type {
	FoliageBrushSettings,
	GameArea,
	ObjectDefinition,
	ObjectInstance,
} from "../../types/game";

export { DEFAULT_FOLIAGE_BRUSH_SETTINGS } from "../../data/foliageBrushSettings";
export type { FoliageBrushSettings } from "../../types/game";

export const MAX_FOLIAGE_PER_STROKE = 192;

export type FoliageScatterCandidate = TerrainSurfacePosition & {
	key: string;
	assetId: string;
	surfaceY: number;
	rotation: number;
	scale: number;
};

type FoliageSampleOptions = {
	limit?: number;
	excludedKeys?: ReadonlySet<string>;
};

type FoliageTerrainOptions = {
	terrainMode?: TerrainSurfaceMode;
	objectDefinitions?: readonly ObjectDefinition[];
	pathAssetIds?: readonly string[];
};

type LatticeCandidate = TerrainSurfacePosition & {
	column: number;
	row: number;
	distanceSquared: number;
	key: string;
};

type PathFootprint = TerrainSurfacePosition & {
	halfWidth: number;
	halfDepth: number;
	cosYaw: number;
	sinYaw: number;
};

function seededUnit(seed: number, x: number, y: number, channel: number) {
	let value =
		seed ^
		Math.imul(x, 0x85ebca6b) ^
		Math.imul(y, 0x9e3779b1) ^
		Math.imul(channel, 0x165667b1);
	value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
	value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
	return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function positionOf(object: ObjectInstance): TerrainSurfacePosition {
	return {
		x: object.x + (object.transform?.position.x ?? 0),
		y: object.y + (object.transform?.position.z ?? 0),
	};
}

function isPathTile(id: string | undefined) {
	return /(?:^|[-_\s])(?:road|path|cobbles?|cobblestones?|paving|paved|boardwalk|bridge|walkway)(?:$|[-_\s])/i.test(
		id ?? "",
	);
}

function getPathFootprints(
	area: GameArea,
	{ objectDefinitions, pathAssetIds }: FoliageTerrainOptions,
): PathFootprint[] {
	const definitions = new Map(
		objectDefinitions?.map((item) => [item.id, item]),
	);
	const pathIds = new Set(["mere-cobbles", ...(pathAssetIds ?? [])]);
	const paths: PathFootprint[] = [];
	for (const object of area.objects) {
		const definition = definitions.get(object.objectDefinitionId);
		const visual = object.threeVisual ?? definition?.threeVisual;
		if (visual?.mode === "placeholder") {
			continue;
		}
		const assetId = visual?.assetId ?? object.objectDefinitionId;
		if (!pathIds.has(assetId)) {
			continue;
		}
		const { x, y } = positionOf(object);
		const radians =
			((object.transform?.rotation.y ?? 0) + (visual?.rotationOffset ?? 0)) *
			(Math.PI / 180);
		// Merewatch's authored cobble mesh measures three by four metres.
		const width =
			assetId === "mere-cobbles"
				? 3
				: (object.widthTiles ?? definition?.widthTiles ?? 1);
		const depth =
			assetId === "mere-cobbles"
				? 4
				: (object.heightTiles ?? definition?.heightTiles ?? 1);
		paths.push({
			x,
			y,
			halfWidth:
				(width *
					Math.abs((object.transform?.scale.x ?? 1) * (visual?.scale ?? 1))) /
				2,
			halfDepth:
				(depth *
					Math.abs((object.transform?.scale.z ?? 1) * (visual?.scale ?? 1))) /
				2,
			cosYaw: Math.cos(radians),
			sinYaw: Math.sin(radians),
		});
	}
	return paths;
}

function isOnPath(x: number, y: number, footprint: PathFootprint) {
	const dx = x - footprint.x;
	const dy = y - footprint.y;
	return (
		Math.abs(dx * footprint.cosYaw - dy * footprint.sinYaw) <=
			footprint.halfWidth &&
		Math.abs(dx * footprint.sinYaw + dy * footprint.cosYaw) <=
			footprint.halfDepth
	);
}

function getSlopeDegrees(
	{ sampleSmoothSurfaceY }: TerrainSurfaceSampler,
	{ x, y }: TerrainSurfacePosition,
) {
	const step = 0.35;
	const dx =
		sampleSmoothSurfaceY({ x: x + step, y }) -
		sampleSmoothSurfaceY({ x: x - step, y });
	const dy =
		sampleSmoothSurfaceY({ x, y: y + step }) -
		sampleSmoothSurfaceY({ x, y: y - step });
	return (Math.atan2(Math.hypot(dx, dy), 2 * step) * 180) / Math.PI;
}

function getLatticeCandidates(
	area: GameArea,
	center: TerrainSurfacePosition,
	{ density, radius, seed, spacing }: FoliageBrushSettings,
	excludedKeys?: ReadonlySet<string>,
): LatticeCandidate[] {
	const candidates: LatticeCandidate[] = [];
	const radiusSquared = radius * radius;
	const startColumn = Math.max(-1, Math.floor((center.x - radius) / spacing));
	const endColumn = Math.min(
		Math.ceil((area.width - 0.5) / spacing),
		Math.ceil((center.x + radius) / spacing),
	);
	const startRow = Math.max(-1, Math.floor((center.y - radius) / spacing));
	const endRow = Math.min(
		Math.ceil((area.height - 0.5) / spacing),
		Math.ceil((center.y + radius) / spacing),
	);
	for (let row = startRow; row <= endRow; row += 1) {
		for (let column = startColumn; column <= endColumn; column += 1) {
			if (seededUnit(seed, column, row, 1) >= density) {
				continue;
			}
			const x =
				(column + (seededUnit(seed, column, row, 2) - 0.5) * 0.45) * spacing;
			const y =
				(row + (seededUnit(seed, column, row, 3) - 0.5) * 0.45) * spacing;
			const distanceSquared = (x - center.x) ** 2 + (y - center.y) ** 2;
			if (
				distanceSquared > radiusSquared ||
				x < -0.5 ||
				y < -0.5 ||
				x >= area.width - 0.5 ||
				y >= area.height - 0.5
			) {
				continue;
			}
			const key = `${seed}:${spacing}:${column}:${row}`;
			if (!excludedKeys?.has(key)) {
				candidates.push({ x, y, column, row, distanceSquared, key });
			}
		}
	}
	// Nearby candidates make the preview and the capped stroke begin at the pointer.
	return candidates.sort((a, b) => a.distanceSquared - b.distanceSquared);
}

export function createFoliageScatterSampler(
	area: GameArea,
	options: FoliageTerrainOptions = {},
) {
	const terrain = createTerrainSurfaceSampler(area);
	const paths = getPathFootprints(area, options);
	const roadOverlayCells = new Set(
		area.overlayTiles
			.filter((tile) => isPathTile(tile.overlayId))
			.map((tile) => `${tile.x}:${tile.y}`),
	);
	return (
		center: TerrainSurfacePosition,
		settings: FoliageBrushSettings,
		{ limit, excludedKeys }: FoliageSampleOptions = {},
	): FoliageScatterCandidate[] => {
		const brush = migrateFoliageBrushSettings(settings);
		const maxCandidates = Math.min(
			MAX_FOLIAGE_PER_STROKE,
			Math.floor(limit ?? MAX_FOLIAGE_PER_STROKE),
		);
		if (
			!brush ||
			!Number.isFinite(center.x) ||
			!Number.isFinite(center.y) ||
			!(maxCandidates > 0) ||
			brush.density <= 0
		) {
			return [];
		}
		const palette = brush.palette.filter((entry) => entry.weight > 0);
		const totalWeight = palette.reduce(
			(total, entry) => total + entry.weight,
			0,
		);
		if (palette.length === 0) {
			return [];
		}

		const candidates: FoliageScatterCandidate[] = [];
		for (const candidate of getLatticeCandidates(
			area,
			center,
			brush,
			excludedKeys,
		)) {
			const { x, y, column, row, key } = candidate;
			const cellX = Math.round(x);
			const cellY = Math.round(y);
			const tile = terrain.getTile(cellX, cellY);
			const water = isTerrainWaterTileId(tile?.tileId);
			if (
				!tile ||
				(brush.excludeWater && water) ||
				(brush.excludeRoads &&
					(isPathTile(tile.tileId) ||
						roadOverlayCells.has(`${cellX}:${cellY}`) ||
						paths.some((footprint) => isOnPath(x, y, footprint))))
			) {
				continue;
			}
			const surfaceY = terrain.sampleSurfaceY(candidate, options.terrainMode);
			if (
				surfaceY < brush.minHeight ||
				surfaceY > brush.maxHeight ||
				(!water &&
					brush.maxSlope < 90 &&
					getSlopeDegrees(terrain, candidate) > brush.maxSlope)
			) {
				continue;
			}
			let weight = seededUnit(brush.seed, column, row, 4) * totalWeight;
			const asset = palette.find((entry) => {
				weight -= entry.weight;
				return weight < 0;
			});
			if (!asset) {
				continue;
			}
			candidates.push({
				key,
				assetId: asset.assetId,
				x,
				y,
				surfaceY,
				rotation:
					(seededUnit(brush.seed, column, row, 5) * 2 - 1) *
					brush.rotationVariation,
				scale:
					brush.minScale +
					seededUnit(brush.seed, column, row, 6) *
						(brush.maxScale - brush.minScale),
			});
			if (candidates.length >= maxCandidates) {
				break;
			}
		}
		return candidates;
	};
}

export function getFoliageEraseIds(
	objects: readonly ObjectInstance[],
	center: TerrainSurfacePosition,
	radius: number,
): string[] {
	return objects
		.filter((object) => {
			if (typeof object.state?.foliageGroupId !== "string") {
				return false;
			}
			const { x, y } = positionOf(object);
			return Math.hypot(x - center.x, y - center.y) <= radius;
		})
		.map((object) => object.id);
}
