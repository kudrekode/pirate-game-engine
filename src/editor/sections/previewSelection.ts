import type { EditorSelection } from "../../types/game";
import type { EntityMarker } from "./entityMarkers";
import type { TerrainBlock } from "./terrainBlocks";

export type PreviewSelectionMetadata = {
	entityType:
		| "terrain"
		| "object"
		| "structure"
		| "npc"
		| "pickup"
		| "eventBlock";
	entityId?: string;
	areaId: string;
	x?: number;
	y?: number;
};

export function terrainBlockToSelectionMetadata(
	block: TerrainBlock,
	areaId: string,
): PreviewSelectionMetadata {
	return {
		areaId,
		entityType: "terrain",
		x: block.gridX,
		y: block.gridY,
	};
}

export function entityMarkerToSelectionMetadata(
	marker: EntityMarker,
	areaId: string,
): PreviewSelectionMetadata {
	return {
		areaId,
		entityId: marker.id,
		entityType:
			marker.kind === "event"
				? "eventBlock"
				: marker.kind === "vehicle"
					? "object"
					: marker.kind,
		x: marker.gridX,
		y: marker.gridY,
	};
}

export function metadataToEditorSelection(
	metadata: PreviewSelectionMetadata,
): EditorSelection {
	if (metadata.entityType === "terrain") {
		return {
			areaId: metadata.areaId,
			type: "terrain",
			x: metadata.x ?? 0,
			y: metadata.y ?? 0,
		};
	}

	if (metadata.entityType === "eventBlock") {
		return {
			areaId: metadata.areaId,
			id: metadata.entityId ?? "",
			type: "eventBlock",
		};
	}

	return {
		areaId: metadata.areaId,
		id: metadata.entityId ?? "",
		type: metadata.entityType,
	};
}

export function selectionMatchesMetadata(
	selection: EditorSelection,
	metadata: PreviewSelectionMetadata,
): boolean {
	if (!selection || selection.areaId !== metadata.areaId) {
		return false;
	}

	if (metadata.entityType === "terrain") {
		return (
			selection.type === "terrain" &&
			selection.x === metadata.x &&
			selection.y === metadata.y
		);
	}

	if (metadata.entityType === "eventBlock") {
		return (
			selection.type === "eventBlock" && selection.id === metadata.entityId
		);
	}

	return (
		selection.type === metadata.entityType && selection.id === metadata.entityId
	);
}
