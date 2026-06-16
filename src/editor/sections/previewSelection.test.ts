import { describe, expect, it } from "vitest";
import type { EntityMarker } from "./entityMarkers";
import {
	entityMarkerToSelectionMetadata,
	metadataToEditorSelection,
	selectionMatchesMetadata,
	terrainBlockToSelectionMetadata,
} from "./previewSelection";
import type { TerrainBlock } from "./terrainBlocks";

const terrainBlock: TerrainBlock = {
	color: 0x5aa95a,
	gridX: 2,
	gridY: 3,
	height: 1,
	id: "2_3_grass",
	kind: "grass",
	threeX: 0,
	threeZ: 0,
	tileId: "grass",
	yOffset: 0.5,
};

function makeMarker(marker: Partial<EntityMarker>): EntityMarker {
	return {
		color: 0xffffff,
		depth: 1,
		gridX: 4,
		gridY: 5,
		height: 1,
		id: "entity",
		kind: "object",
		opacity: 1,
		shape: "box",
		threeX: 0,
		threeY: 1,
		threeZ: 0,
		width: 1,
		...marker,
	};
}

describe("preview selection metadata", () => {
	it("maps terrain metadata to editor terrain selection", () => {
		const metadata = terrainBlockToSelectionMetadata(terrainBlock, "area");

		expect(metadata).toEqual({
			areaId: "area",
			entityType: "terrain",
			x: 2,
			y: 3,
		});
		expect(metadataToEditorSelection(metadata)).toEqual({
			areaId: "area",
			type: "terrain",
			x: 2,
			y: 3,
		});
		expect(
			selectionMatchesMetadata(
				{ areaId: "area", type: "terrain", x: 2, y: 3 },
				metadata,
			),
		).toBe(true);
	});

	it("maps entity metadata to existing editor selection types", () => {
		const npcMetadata = entityMarkerToSelectionMetadata(
			makeMarker({ id: "npc-1", kind: "npc" }),
			"area",
		);

		expect(metadataToEditorSelection(npcMetadata)).toEqual({
			areaId: "area",
			id: "npc-1",
			type: "npc",
		});
		expect(
			selectionMatchesMetadata(
				{ areaId: "area", id: "npc-1", type: "npc" },
				npcMetadata,
			),
		).toBe(true);
	});

	it("maps vehicle markers back to object inspector selection", () => {
		const metadata = entityMarkerToSelectionMetadata(
			makeMarker({ id: "boat-1", kind: "vehicle" }),
			"area",
		);

		expect(metadata.entityType).toBe("object");
		expect(metadataToEditorSelection(metadata)).toEqual({
			areaId: "area",
			id: "boat-1",
			type: "object",
		});
	});

	it("maps event markers to event block selection", () => {
		const metadata = entityMarkerToSelectionMetadata(
			makeMarker({ id: "event-1", kind: "event" }),
			"area",
		);

		expect(metadataToEditorSelection(metadata)).toEqual({
			areaId: "area",
			id: "event-1",
			type: "eventBlock",
		});
	});
});
