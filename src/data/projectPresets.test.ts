import { describe, expect, it } from "vitest";
import {
	blankProject,
	createProjectFromPreset,
	demoProject,
} from "./projectPresets";
import { validateProject } from "./validateProject";

describe("project presets", () => {
	it("provides a clean blank project with only required starter content", () => {
		expect(validateProject(blankProject)).toEqual([]);
		expect(blankProject.areas).toHaveLength(1);
		expect(blankProject.items).toEqual([]);
		expect(blankProject.quests).toEqual([]);
		expect(blankProject.rules).toEqual([]);
		expect(blankProject.npcs).toEqual([]);
		expect(blankProject.objects).toEqual([]);
		expect(blankProject.areas[0].overlayTiles).toEqual([]);
		expect(blankProject.areas[0].structures).toEqual([]);
		expect(blankProject.areas[0].objects).toEqual([]);
		expect(blankProject.areas[0].pickups).toEqual([]);
		expect(blankProject.areas[0].npcs).toEqual([]);
		expect(
			blankProject.progression.every(
				(step) => step.action.type === "spawn_player",
			),
		).toBe(true);
	});

	it("keeps the demo project valid and opens on a clean area", () => {
		expect(validateProject(demoProject)).toEqual([]);
		expect(demoProject.activeAreaId).toBe("area_demo_blank");
		expect(demoProject.areas[0].name).toBe("Blank Demo Area");
		expect(demoProject.areas[0].objects).toEqual([]);
		expect(demoProject.areas[0].npcs).toEqual([]);
		expect(demoProject.items.length).toBeGreaterThan(0);
	});

	it("creates independent project copies", () => {
		const project = createProjectFromPreset("blank");
		project.metadata.name = "Changed";

		expect(blankProject.metadata.name).toBe("Blank Project");
	});
});
