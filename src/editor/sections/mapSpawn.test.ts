import { describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import { processRuntimeProgression } from "../../runtime/runtimeProgression";
import { createRuntimeSession } from "../../runtime/runtimeSession";
import { resolveMapSpawn, setMapSpawnAsProjectStart } from "./mapSpawn";

describe("Map Workspace spawn settings", () => {
	it("edits the real authored spawn marker and plays from its moved position", () => {
		const project = cloneProject(defaultProject);
		const area = project.areas[0];
		project.progression = project.progression.filter(
			(step) => step.action.type !== "play_cutscene",
		);
		const resolved = resolveMapSpawn(project, area);
		expect(resolved.isProjectStart).toBe(true);
		if (!resolved.marker) throw new Error("Expected an existing spawn marker");
		const id = resolved.marker.id;
		resolved.marker.x = 3;
		resolved.marker.y = 2;

		const session = createRuntimeSession(project);
		processRuntimeProgression(session, () => {});
		expect(session.playerPosition).toEqual({ x: 3, y: 2 });
		expect(resolveMapSpawn(project, area).marker?.id).toBe(id);
	});

	it("keeps later story movements intact when creating a project start", () => {
		const project = cloneProject(defaultProject);
		const area = project.areas[0];
		const target = area.eventBlocks[0];
		project.progression = [
			{
				id: "opening",
				action: {
					type: "wait_for_trigger",
					areaId: area.id,
					eventBlockId: target.id,
				},
			},
			{
				id: "later",
				action: {
					type: "spawn_player",
					areaId: area.id,
					eventBlockId: target.id,
				},
			},
		];
		const laterSteps = structuredClone(project.progression);
		setMapSpawnAsProjectStart(project, area.id, target.id);
		expect(project.progression.slice(1)).toEqual(laterSteps);
		expect(project.progression[0].action).toEqual({
			type: "spawn_player",
			areaId: area.id,
			eventBlockId: target.id,
		});
		expect(resolveMapSpawn(project, area).isProjectStart).toBe(true);
	});
});
