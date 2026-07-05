import { describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import { getPreviewSelectionDetails } from "./previewSelectionDetails";

describe("preview selection details", () => {
	it("describes selected terrain", () => {
		const project = cloneProject(defaultProject);
		const details = getPreviewSelectionDetails(project, {
			areaId: "area_main",
			type: "terrain",
			x: 0,
			y: 0,
		});

		expect(details?.title).toBe("Terrain 0, 0");
		expect(details?.rows).toContainEqual({ label: "Tile ID", value: "grass" });
		expect(details?.rows).toContainEqual({
			label: "Movement",
			value: "Player can walk on this tile",
		});
	});

	it("describes selected NPCs", () => {
		const project = cloneProject(defaultProject);
		const details = getPreviewSelectionDetails(project, {
			areaId: "area_main",
			id: "npc_instance_captain_mira",
			type: "npc",
		});

		expect(details?.title).toBe("Captain Mira");
		expect(details?.rows).toContainEqual({
			label: "Alignment",
			value: "friendly",
		});
		expect(details?.rows).toContainEqual({
			label: "Health",
			value: "100/100",
		});
	});

	it("describes selected objects", () => {
		const project = cloneProject(defaultProject);
		const details = getPreviewSelectionDetails(project, {
			areaId: "area_main",
			id: "object_coin_chest",
			type: "object",
		});

		expect(details?.title).toBe("Chest");
		expect(details?.rows).toContainEqual({
			label: "Category",
			value: "container",
		});
		expect(details?.rows).toContainEqual({
			label: "Behaviour",
			value: "container",
		});
	});
});
