import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// A constant planting density and a clear 5-tile road keep traversals comparable.
// Increasing the rectangle adds fully authored terrain, inhabitants and landmarks.
export const worldScales = {
	small: { width: 44, height: 60, npcs: 1 },
	medium: { width: 66, height: 90, npcs: 5 },
	large: { width: 88, height: 120, npcs: 12 },
	stress: { width: 110, height: 150, npcs: 24 },
	frontier: { width: 154, height: 204, npcs: 48 },
};

export async function createWorldFixture(scale) {
	const config = worldScales[scale];
	assert.ok(config, `Unknown world scale: ${scale}`);
	const { width, height } = config;
	const base = JSON.parse(
		await readFile(
			new URL("../hollow-kingdom-chapter-one.project.json", import.meta.url),
			"utf8",
		),
	);
	const areaId = `survey-${scale}`;
	const road = Math.floor(width / 2);
	const terrainTiles = [];
	const terrainHeights = [];
	const objects = [];
	const npcs = [];
	const plantings = ["mere-spruce", "mere-crag", "mere-verge", "mere-spruce"];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const roadOffset = x - road;
			const creek = 3 + Math.round(2 * Math.sin(y / 8));
			const water = Math.abs(x - creek) <= 1;
			const onRoad = Math.abs(roadOffset) <= 2 || y % 28 < 3;
			const tileId = water ? "water" : onRoad ? "dirt" : "grass";
			terrainTiles.push({ x, y, tileId });
			const hill = Math.round(
				1.6 * Math.sin(roadOffset / 7) + 1.3 * Math.cos(y / 9),
			);
			if (!water && !onRoad && hill > 0)
				terrainHeights.push({ x, y, height: hill });
			if (onRoad || water || x % 4 !== 2 || y % 4 !== 2) continue;
			const variant =
				(Math.floor(x / 4) + Math.floor(y / 4)) % plantings.length;
			objects.push({
				id: `plant-${x}-${y}`,
				objectDefinitionId: plantings[variant],
				areaId,
				x,
				y,
			});
		}
	}
	for (let y = 8; y < height - 2; y += 14) {
		objects.push({
			id: `landmark-${y}`,
			areaId,
			x: road - 4,
			y,
			objectDefinitionId: y % 28 === 8 ? "mere-cottage" : "mere-watchtower",
		});
	}
	const spawn = { x: road, y: 4 };
	objects.push({
		id: "bracken",
		objectDefinitionId: "mere-mare",
		areaId,
		x: road,
		y: 13,
		blocksMovement: true,
	});
	for (let i = 0; i < config.npcs; i++) {
		npcs.push({
			...base.areas[0].npcs[0],
			id: `walker-${i}`,
			areaId,
			x: road + (i % 2 === 0 ? 4 : -6),
			y: 7 + Math.floor((i * (height - 14)) / config.npcs),
			blocksMovement: false,
			movementMode: "stationary",
		});
	}
	const area = {
		...base.areas[0],
		id: areaId,
		name: `Survey road (${scale})`,
		width,
		height,
		terrainTiles,
		terrainHeights,
		eventBlocks: [
			{
				...spawn,
				id: "survey-entrance",
				name: "South road",
				kind: "spawn",
				tag: "arrival",
			},
		],
		objects,
		npcs,
		pickups: [],
		overlayTiles: [],
		structures: [],
	};
	const objectIds = new Set(objects.map((object) => object.objectDefinitionId));
	const { defaultInteraction, ...walker } = base.npcs.find(
		(npc) => npc.id === "oswin",
	);
	const project = {
		...base,
		metadata: {
			...base.metadata,
			name: `Hollow Kingdom scale survey (${scale})`,
		},
		activeAreaId: areaId,
		areas: [area],
		npcs: [walker],
		objects: base.objects.filter((o) => objectIds.has(o.id)),
		cutscenes: [],
		dialogues: [],
		rules: [],
		ruleGroups: [],
		quests: [],
		shops: [],
		trackedQuestId: undefined,
		storyGraphs: [
			{
				id: "survey-opening",
				name: "Survey",
				kind: "opening",
				nodes: [
					{ id: "new-game", type: "newGame", x: 0, y: 0, data: {} },
					{ id: "begin", type: "end", x: 280, y: 0, data: {} },
				],
				edges: [{ id: "enter", from: "new-game", to: "begin", port: "next" }],
			},
		],
		progression: [
			{
				id: "enter-survey",
				action: {
					type: "spawn_player",
					areaId,
					eventBlockId: "survey-entrance",
				},
			},
		],
	};
	return {
		project,
		areaId,
		spawn,
		counts: {
			width,
			height,
			tiles: terrainTiles.length,
			raised: terrainHeights.length,
			objects: objects.length,
			npcs: npcs.length,
			actors: npcs.length + 2,
		},
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const [, , scale, output] = process.argv;
	if (!output)
		throw new Error(
			`Usage: node e2e/hollow-world-fixture.mjs ${Object.keys(worldScales).join("|")} <new-project.json>`,
		);
	const { project, counts } = await createWorldFixture(scale);
	await writeFile(output, JSON.stringify(project), { flag: "wx" });
	console.log(counts);
}
