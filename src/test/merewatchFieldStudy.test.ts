import { expect, it } from "vitest";
import originalJson from "../../hollow-kingdom.project.json?raw";
import referenceJson from "../../merewatch-field-study.project.json?raw";
import {
	createLandscapeFixture,
	landscapeScales,
} from "../../tools/hollow-kingdom/field-study/fixture.mjs";
import { importProjectJson } from "../data/projectImport";
import {
	createTraversalWorld,
	isTraversalBodyBlocked,
} from "../runtime/traversal";

it("rebuilds the importable village and preserves the playable story, actors, boats and arrival", async () => {
	const { project: generated } = await createLandscapeFixture("merewatch");
	expect(generated).toEqual(JSON.parse(referenceJson));
	const project = importProjectJson(JSON.stringify(generated));
	const original = importProjectJson(originalJson);
	const area = project.areas[0];
	expect(project.storyGraphs).toEqual(original.storyGraphs);
	expect(project.quests).toEqual(original.quests);
	expect(project.dialogues).toEqual(original.dialogues);
	expect(project.cutscenes).toEqual(original.cutscenes);
	expect(area.eventBlocks).toEqual(original.areas[0].eventBlocks);
	// A raised boundary disables the extended shoreline in the 3D runtime.
	expect(
		area.terrainHeights?.some(
			(t) =>
				t.x === 0 ||
				t.y === 0 ||
				t.x === area.width - 1 ||
				t.y === area.height - 1,
		),
	).toBe(false);
	expect(area.npcs).toEqual(original.areas[0].npcs);
	for (const id of [
		"bracken",
		"oswins-ferry",
		"tower-dispatch-box",
		"cutters-coffer",
	])
		expect(area.objects.find((o) => o.id === id)).toEqual(
			original.areas[0].objects.find((o) => o.id === id),
		);
	expect(area.theme?.atmosphere).toBe("blue-hour");
	const world = createTraversalWorld(project, area);
	for (let i = 0; i <= 52; i++) {
		const y = 56 - i / 4;
		const x = 20 + Math.max(0, 49 - y) / 6;
		expect(isTraversalBodyBlocked(world, { x, y, height: 1 })).toBe(false);
	}
});

it.each(
	Object.keys(landscapeScales) as (keyof typeof landscapeScales)[],
)("imports the complete %s world with an open, level coach road", async (scale) => {
	const { project: generated } = await createLandscapeFixture(scale);
	const raw = JSON.stringify(generated);
	const project = importProjectJson(raw);
	const area = project.areas[0];
	const road = Math.floor(area.width / 2);
	const cells = area.terrainTiles;
	expect(project.camera.three.yawOffsetDegrees).toBe(0);
	expect(
		area.terrainHeights?.some(
			(t) =>
				t.x === 0 ||
				t.y === 0 ||
				t.x === area.width - 1 ||
				t.y === area.height - 1,
		),
	).toBe(false);
	expect(area.theme?.atmosphere).toBe("blue-hour");
	expect(cells.length).toBe(area.width * area.height);
	expect(area.eventBlocks[0]).toMatchObject({ x: road, y: 4 });
	expect(area.objects.find((o) => o.id === "bracken")).toMatchObject({
		x: road,
		y: 13,
		objectDefinitionId: "mere-mare",
	});
	expect(
		project.objects.find((o) => o.id === "mere-mare")?.defaultBehaviour,
	).toMatchObject({ type: "vehicle", movementMode: "ride" });
	expect(area.terrainHeights?.some((t) => Math.abs(t.x - road) <= 2)).toBe(
		false,
	);
	expect(
		area.objects
			.filter((o) => Math.abs(o.x - road) <= 2)
			.every(
				(o) => o.id === "bracken" || o.objectDefinitionId === "mere-cobbles",
			),
	).toBe(true);
	expect(area.npcs.every((n) => Math.abs(n.x - road) > 2)).toBe(true);
	expect(new Set(area.objects.map((o) => o.id)).size).toBe(area.objects.length);
	expect(cells.some((t) => t.tileId === "water")).toBe(true);
	expect(area.objects.some((o) => o.id === "west-bank-keep")).toBe(true);
	const world = createTraversalWorld(project, area);
	for (let y = 0; y < area.height; y++) {
		for (let x = road - 2; x <= road + 2; x++)
			expect(cells[y * area.width + x]).toEqual({ x, y, tileId: "dirt" });
		expect(isTraversalBodyBlocked(world, { x: road, y, height: 1 })).toBe(
			false,
		);
	}
	if (scale === "medium")
		expect(JSON.stringify((await createLandscapeFixture(scale)).project)).toBe(
			raw,
		);
});
