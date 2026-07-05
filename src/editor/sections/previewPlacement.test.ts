import { beforeEach, describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import { useProjectStore } from "../../store/useProjectStore";
import {
	getPreviewPlacementInfo,
	placePreviewEntity,
} from "./previewPlacement";

function selectionId(selection: ReturnType<typeof placePreviewEntity>) {
	return selection && "id" in selection ? selection.id : "";
}

function placementActions() {
	const store = useProjectStore.getState();
	return {
		addEventBlock: store.addEventBlock,
		addNpc: store.addNpc,
		addObject: store.addObject,
		addPickup: store.addPickup,
		addStructure: store.addStructure,
		areaId: store.project.activeAreaId,
		updatePickup: store.updatePickup,
	};
}

describe("3D preview placement helpers", () => {
	beforeEach(() => {
		useProjectStore.getState().setProject(cloneProject(defaultProject));
	});

	it("places an NPC instance and returns shared editor selection", () => {
		const selection = placePreviewEntity(
			{ npcDefinitionId: "npc_captain_mira", type: "npc" },
			{ x: 8, y: 6 },
			placementActions(),
		);
		useProjectStore.getState().setEditorSelection(selection);

		const npc = useProjectStore
			.getState()
			.project.areas.find((area) => area.id === "area_main")
			?.npcs.find((candidate) => candidate.id === selectionId(selection));

		expect(selection).toMatchObject({ areaId: "area_main", type: "npc" });
		expect(npc).toMatchObject({
			npcDefinitionId: "npc_captain_mira",
			x: 8,
			y: 6,
		});
		expect(useProjectStore.getState().editorSelection).toEqual(selection);
	});

	it("places an object instance with normal object defaults", () => {
		const selection = placePreviewEntity(
			{ objectDefinitionId: "object_chest", type: "object" },
			{ x: 9, y: 7 },
			placementActions(),
		);

		const object = useProjectStore
			.getState()
			.project.areas.find((area) => area.id === "area_main")
			?.objects.find((candidate) => candidate.id === selectionId(selection));

		expect(selection).toMatchObject({ areaId: "area_main", type: "object" });
		expect(object).toMatchObject({
			blocksMovement: true,
			objectDefinitionId: "object_chest",
			x: 9,
			y: 7,
		});
	});

	it("places a pickup and applies the selected item when provided", () => {
		const selection = placePreviewEntity(
			{ itemId: "rum_bottle", type: "pickup" },
			{ x: 10, y: 8 },
			placementActions(),
		);

		const pickup = useProjectStore
			.getState()
			.project.areas.find((area) => area.id === "area_main")
			?.pickups.find((candidate) => candidate.id === selectionId(selection));

		expect(selection).toMatchObject({ areaId: "area_main", type: "pickup" });
		expect(pickup).toMatchObject({
			itemId: "rum_bottle",
			quantity: 1,
			x: 10,
			y: 8,
		});
	});

	it("places an event block", () => {
		const selection = placePreviewEntity(
			{ type: "eventBlock" },
			{ x: 11, y: 9 },
			placementActions(),
		);

		const eventBlock = useProjectStore
			.getState()
			.project.areas.find((area) => area.id === "area_main")
			?.eventBlocks.find(
				(candidate) => candidate.id === selectionId(selection),
			);

		expect(selection).toMatchObject({
			areaId: "area_main",
			type: "eventBlock",
		});
		expect(eventBlock).toMatchObject({
			kind: "trigger",
			x: 11,
			y: 9,
		});
	});

	it("describes placement status", () => {
		const project = cloneProject(defaultProject);

		expect(
			getPreviewPlacementInfo(project, {
				npcDefinitionId: "npc_captain_mira",
				type: "npc",
			}),
		).toMatchObject({
			active: true,
			label: "Placing NPC: Captain Mira",
		});
		expect(getPreviewPlacementInfo(project, { type: "none" })).toMatchObject({
			active: false,
			label: "No placeable selected",
		});
	});
});
