import { describe, expect, it } from "vitest";
import { createAreaFromTemplate } from "./areaTemplates";
import { cloneProject } from "./migrateProject";
import { blankProject } from "./projectPresets";
import { validateProject } from "./validateProject";

describe("area templates", () => {
	it("creates a blank area with no placed content and clean base terrain", () => {
		const area = createAreaFromTemplate("blank", "blank-area", "Blank Area");

		expect(area.structures).toEqual([]);
		expect(area.objects).toEqual([]);
		expect(area.pickups).toEqual([]);
		expect(area.npcs).toEqual([]);
		expect(area.eventBlocks).toEqual([]);
		expect(area.overlayTiles).toEqual([]);
		expect(new Set(area.terrainTiles.map((tile) => tile.tileId))).toEqual(
			new Set(["grass"]),
		);
	});

	it("keeps a project valid after adding a blank area", () => {
		const project = cloneProject(blankProject);
		project.areas.push(
			createAreaFromTemplate("blank", "blank-area", "Blank Area"),
		);

		expect(validateProject(project)).toEqual([]);
	});
});
