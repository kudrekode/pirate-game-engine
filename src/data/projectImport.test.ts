import { describe, expect, it } from "vitest";
import { defaultProject } from "./defaultProject";
import { migrateProject } from "./migrateProject";
import { importProjectJson, readProjectJson } from "./projectImport";

const fixtures = import.meta.glob(
	["../../*.project.json", "../../docs/assets/**/*.project.json"],
	{ eager: true, import: "default" },
);

describe("project JSON import", () => {
	it("imports a current project export", () => {
		expect(importProjectJson(JSON.stringify(defaultProject))).toEqual(
			migrateProject(defaultProject),
		);
	});

	it.each(Object.entries(fixtures))("imports %s", (_path, fixture) => {
		const imported = importProjectJson(JSON.stringify(fixture));
		expect(imported).toEqual(migrateProject(fixture));
		expect(migrateProject(imported)).toEqual(imported);
	});

	it("migrates a legacy single map, flat progression and flat conditions", () => {
		const project = importProjectJson(
			JSON.stringify({
				metadata: { name: "Legacy", version: "0.0.1" },
				map: { width: 2, height: 1, tiles: [{ x: 1, y: 0, tileId: "grass" }] },
				progression: [{ id: "end", type: "end_game" }],
				rules: [
					{
						trigger: { type: "on_game_start" },
						conditions: [{ type: "flag_is", flag: "intro_seen" }],
					},
				],
			}),
		);
		expect(project.areas[0].terrainTiles).toEqual([
			{ x: 1, y: 0, tileId: "grass" },
		]);
		expect(project.progression[0].action.type).toBe("end_game");
		expect(project.rules[0].conditionTree?.type).toBe("group");
	});

	it.each([
		["{", /Invalid JSON/],
		["{}", /Expected a project/],
		['{"areas":[]}', /areas: Expected at least one area/],
		['{"areas":[null]}', /areas\.0: Expected an object/],
		[
			'{"map":{},"player":{"health":"strong"}}',
			/player\.health: Expected a finite number/,
		],
		[
			'{"map":{},"cutscenes":[{"id":"intro","name":"Intro","backgroundImageId":"forest"}]}',
			/cutscenes\.0\.text: Expected a string/,
		],
		[
			'{"map":{},"rules":[{"trigger":{"type":"on_game_start"},"actions":[null]}]}',
			/rules\.0\.actions\.0: Expected an object/,
		],
		[
			'{"map":{},"rules":[{"trigger":{"type":"on_game_start"},"conditionTree":{"type":"unknown"}}]}',
			/rules\.0\.conditionTree\.type: Unsupported type/,
		],
	])("rejects malformed or unsupported data in %s", (raw, diagnostic) => {
		expect(() => importProjectJson(raw)).toThrow(diagnostic);
	});

	it("reports authoring errors on import and still allows a saved draft to be repaired", () => {
		const raw = JSON.stringify({
			map: {},
			dialogues: [{ id: "draft", nodes: [] }],
		});
		expect(() => importProjectJson(raw)).toThrow(/startNodeId/);
		expect(readProjectJson(raw).dialogues[0].id).toBe("draft");
	});
});
