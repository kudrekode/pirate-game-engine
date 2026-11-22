import { useMemo, useRef } from "react";
import { listThreeVisualAssets } from "../../runtime/three/threeVisualAssetRegistry";
import { useProjectStore } from "../../store/useProjectStore";
import type { GameArea, GameProject, ObjectInstance } from "../../types/game";
import {
	createFoliageScatterSampler,
	DEFAULT_FOLIAGE_BRUSH_SETTINGS,
	type FoliageScatterCandidate,
	getFoliageEraseIds,
	MAX_FOLIAGE_PER_STROKE,
} from "./foliageScatter";
import type { PreviewGridPosition } from "./previewMove";
import { resolveTerrainLine } from "./terrainBrush";

type FoliageMode = "paint" | "erase";
type BrushPoint = PreviewGridPosition & { surfaceY?: number };

export type MapViewportBrush = {
	label: string;
	preview: (position: PreviewGridPosition) => BrushPoint[];
	apply: (position: PreviewGridPosition) => void;
	finish: (commit: boolean) => void;
};

type Stroke = {
	areaId: string;
	lastPosition?: PreviewGridPosition;
	planted: Map<string, FoliageScatterCandidate>;
	erased: Set<string>;
};

function foliageInstance(
	point: FoliageScatterCandidate,
	areaId: string,
	definitionId: string,
	groupId: string,
): ObjectInstance {
	const x = Math.round(point.x);
	const y = Math.round(point.y);
	return {
		id: `foliage_${crypto.randomUUID()}`,
		areaId,
		objectDefinitionId: definitionId,
		x: x || 0,
		y: y || 0,
		transform: {
			position: { x: point.x - x, y: 0, z: point.y - y },
			rotation: { x: 0, y: point.rotation, z: 0 },
			scale: { x: point.scale, y: point.scale, z: point.scale },
		},
		scene: { group: `Foliage ${groupId.slice(-6)}` },
		state: { foliageGroupId: groupId, foliageScatterKey: point.key },
	};
}

export function useMapFoliageBrush(
	project: GameProject,
	area: GameArea,
	mode: FoliageMode,
) {
	const strokeRef = useRef<Stroke | undefined>(undefined);
	const assets = useMemo(
		() =>
			listThreeVisualAssets(
				project.characterAssets,
				project.assetCreator?.variants,
			).filter(
				(asset) =>
					!asset.animationOnly &&
					!asset.hiddenFromBrowser &&
					(asset.variant?.category === "Foliage" ||
						asset.tags?.some((tag) =>
							/^(foliage|tree|plant|grass|shrub|forest|pine)$/.test(tag),
						)),
			),
		[project.characterAssets, project.assetCreator?.variants],
	);
	const assetById = useMemo(
		() => new Map(assets.map((asset) => [asset.id, asset])),
		[assets],
	);
	const settings = project.foliageBrush ?? DEFAULT_FOLIAGE_BRUSH_SETTINGS;
	const liveSettings = useMemo(
		() => ({
			...settings,
			palette: settings.palette.filter((entry) => assetById.has(entry.assetId)),
		}),
		[settings, assetById],
	);
	const sampler = useMemo(
		() =>
			createFoliageScatterSampler(area, {
				terrainMode: "smooth",
				objectDefinitions: project.objects,
			}),
		[area, project.objects],
	);
	const plantedKeys = useMemo(
		() =>
			new Set(
				area.objects.flatMap((object) => {
					const key = object.state?.foliageScatterKey;
					return typeof key === "string" ? [key] : [];
				}),
			),
		[area.objects],
	);
	const objectsById = useMemo(
		() => new Map(area.objects.map((object) => [object.id, object])),
		[area.objects],
	);

	function eraseIds(position: PreviewGridPosition) {
		return getFoliageEraseIds(area.objects, position, settings.radius);
	}

	function preview(position: PreviewGridPosition): BrushPoint[] {
		const stroke = strokeRef.current;
		if (mode === "paint") {
			const points = sampler(position, liveSettings, {
				excludedKeys: plantedKeys,
			});
			return stroke
				? Array.from(
						new Map([
							...stroke.planted,
							...points.map((point) => [point.key, point] as const),
						]).values(),
					).slice(0, MAX_FOLIAGE_PER_STROKE)
				: points;
		}
		return [...new Set([...(stroke?.erased ?? []), ...eraseIds(position)])]
			.flatMap((id) => {
				const object = objectsById.get(id);
				return object && !object.scene?.locked
					? [
							{
								x: object.x + (object.transform?.position.x ?? 0),
								y: object.y + (object.transform?.position.z ?? 0),
							},
						]
					: [];
			})
			.slice(0, MAX_FOLIAGE_PER_STROKE);
	}

	function apply(position: PreviewGridPosition) {
		strokeRef.current ??= {
			areaId: area.id,
			planted: new Map(),
			erased: new Set(),
		};
		const stroke = strokeRef.current;
		if (
			stroke.areaId !== area.id ||
			(stroke.lastPosition?.x === position.x &&
				stroke.lastPosition.y === position.y)
		)
			return;
		const stamps = stroke.lastPosition
			? resolveTerrainLine({
					start: stroke.lastPosition,
					end: position,
					bounds: area,
				})
			: [position];
		stroke.lastPosition = position;
		if (mode === "erase") {
			for (const stamp of stamps) {
				for (const id of eraseIds(stamp)) stroke.erased.add(id);
			}
			return;
		}
		const excludedKeys = new Set([...plantedKeys, ...stroke.planted.keys()]);
		for (const stamp of stamps) {
			const limit = MAX_FOLIAGE_PER_STROKE - stroke.planted.size;
			if (!limit) break;
			for (const point of sampler(stamp, liveSettings, {
				limit,
				excludedKeys,
			})) {
				stroke.planted.set(point.key, point);
				excludedKeys.add(point.key);
			}
		}
	}

	function finish(commit: boolean) {
		const stroke = strokeRef.current;
		strokeRef.current = undefined;
		if (!commit || !stroke || (!stroke.planted.size && !stroke.erased.size))
			return;
		const groupId = `foliage_group_${crypto.randomUUID()}`;
		useProjectStore.getState().updateProject((draft) => {
			const target = draft.areas.find((entry) => entry.id === stroke.areaId);
			if (!target) return;
			if (stroke.erased.size) {
				target.objects = target.objects.filter(
					(object) => object.scene?.locked || !stroke.erased.has(object.id),
				);
			}
			const definitions = new Set(
				draft.objects.map((definition) => definition.id),
			);
			for (const point of stroke.planted.values()) {
				const asset = assetById.get(point.assetId);
				if (!asset) continue;
				const definitionId = `foliage-${asset.id}`;
				if (!definitions.has(definitionId)) {
					draft.objects.push({
						id: definitionId,
						name: asset.name,
						category: "prop",
						widthTiles: 1,
						heightTiles: 1,
						blocksMovement: false,
						threeVisual: { mode: "asset", assetId: asset.id },
					});
					definitions.add(definitionId);
				}
				target.objects.push(
					foliageInstance(point, target.id, definitionId, groupId),
				);
			}
		});
	}

	const brush: MapViewportBrush = {
		label: mode === "paint" ? "Scatter foliage" : "Erase foliage",
		preview,
		apply,
		finish,
	};
	return { assets, settings, brush };
}
