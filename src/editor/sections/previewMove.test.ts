import { describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import type { EditorSelection } from "../../types/game";
import {
	movePreviewSelectionInProject,
	previewGridPositionToThreePoint,
	threePointToPreviewGridPosition,
} from "./previewMove";

describe("3D preview move helpers", () => {
	it("moves an NPC without changing the selected entity identity", () => {
		const project = cloneProject(defaultProject);
		const selection: EditorSelection = {
			areaId: "area_main",
			id: "npc_instance_captain_mira",
			type: "npc",
		};

		const moved = movePreviewSelectionInProject(project, selection, {
			x: 8,
			y: 6,
		});
		const npc = project.areas
			.find((area) => area.id === "area_main")
			?.npcs.find((candidate) => candidate.id === selection.id);

		expect(moved).toBe(true);
		expect(npc).toMatchObject({ id: selection.id, x: 8, y: 6 });
		expect(selection).toEqual({
			areaId: "area_main",
			id: "npc_instance_captain_mira",
			type: "npc",
		});
	});

	it("moves an object and clamps it to the area grid", () => {
		const project = cloneProject(defaultProject);
		const selection: EditorSelection = {
			areaId: "area_main",
			id: "object_coin_chest",
			type: "object",
		};

		const moved = movePreviewSelectionInProject(project, selection, {
			x: 200,
			y: 200,
		});
		const object = project.areas
			.find((area) => area.id === "area_main")
			?.objects.find((candidate) => candidate.id === selection.id);

		expect(moved).toBe(true);
		expect(object).toMatchObject({ x: 19, y: 14 });
	});

	it("round-trips map grid coordinates through 3D coordinates", () => {
		const project = cloneProject(defaultProject);
		const area = project.areas[0];
		const threePoint = previewGridPositionToThreePoint(area, { x: 3, y: 4 });

		expect(threePointToPreviewGridPosition(area, threePoint)).toEqual({
			x: 3,
			y: 4,
		});
	});
});
