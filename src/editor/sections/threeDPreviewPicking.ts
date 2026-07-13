import type * as THREE from "three";
import type { GameArea } from "../../types/game";
import {
	clampPreviewGridPosition,
	type PreviewGridPosition,
	threePointToPreviewGridPosition,
} from "./previewMove";
import type { PreviewSelectionMetadata } from "./previewSelection";

export type CanvasClientPoint = {
	clientX: number;
	clientY: number;
};

export type CanvasPointerBounds = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type CanvasPointerNdc = {
	localX: number;
	localY: number;
	x: number;
	y: number;
};

export type PreviewSelectableObject = {
	parent?: PreviewSelectableObject | null;
	userData?: Record<string, unknown>;
};

type PreviewIntersection = {
	object: PreviewSelectableObject;
	point?: { x: number; z: number };
};

export function getCanvasPointerNdc(
	point: CanvasClientPoint,
	bounds: CanvasPointerBounds,
): CanvasPointerNdc | undefined {
	if (bounds.width <= 0 || bounds.height <= 0) {
		return undefined;
	}

	const localX = point.clientX - bounds.left;
	const localY = point.clientY - bounds.top;
	return {
		localX,
		localY,
		x: (localX / bounds.width) * 2 - 1,
		y: -((localY / bounds.height) * 2 - 1),
	};
}

function isPreviewSelectionMetadata(
	value: unknown,
): value is PreviewSelectionMetadata {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Partial<PreviewSelectionMetadata>;
	return (
		typeof candidate.areaId === "string" &&
		typeof candidate.entityType === "string"
	);
}

export function resolveSelectionMetadataFromObject(
	object: PreviewSelectableObject | undefined,
): PreviewSelectionMetadata | undefined {
	let current = object;
	while (current) {
		const metadata = current.userData?.selectionMetadata;
		if (isPreviewSelectionMetadata(metadata)) {
			return metadata;
		}
		current = current.parent ?? undefined;
	}
	return undefined;
}

export function resolveSelectionMetadataFromIntersection(
	intersection: Pick<THREE.Intersection, "object"> | undefined,
): PreviewSelectionMetadata | undefined {
	return resolveSelectionMetadataFromObject(
		intersection?.object as PreviewSelectableObject | undefined,
	);
}

export function terrainIntersectionToPreviewGridPosition(
	area: GameArea,
	intersection: PreviewIntersection,
	footprint: { width: number; height: number } = { height: 1, width: 1 },
): PreviewGridPosition | undefined {
	if (intersection.point) {
		return threePointToPreviewGridPosition(
			area,
			{ x: intersection.point.x, z: intersection.point.z },
			footprint,
		);
	}

	const metadata = resolveSelectionMetadataFromObject(intersection.object);
	if (
		metadata?.entityType === "terrain" &&
		typeof metadata.x === "number" &&
		typeof metadata.y === "number"
	) {
		return clampPreviewGridPosition(
			area,
			{ x: metadata.x, y: metadata.y },
			footprint,
		);
	}

	return undefined;
}
