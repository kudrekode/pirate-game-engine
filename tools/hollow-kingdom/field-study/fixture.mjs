import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { worldScales } from "../../../e2e/hollow-world-fixture.mjs";
import { dressLandscape } from "./landscape.mjs";
import { addKit } from "./scenery.mjs";
import { dressVillage } from "./village.mjs";

const source = new URL("../../../hollow-kingdom.project.json", import.meta.url);
// Import and Map resize cap each dimension at 200. Frontier and Reach use
// those actual dimensions throughout generation, validation and travel.
export const landscapeScales = {
	small: { ...worldScales.small, npcs: 2 },
	medium: { ...worldScales.medium, npcs: 4 },
	large: { ...worldScales.large, npcs: 6 },
	stress: { ...worldScales.stress, npcs: 8 },
	upland: { width: 132, height: 177, npcs: 10 },
	frontier: { ...worldScales.frontier, height: 200, npcs: 12 },
	reach: { width: 198, height: 200, npcs: 16 },
};

function createRoadProject(project, scale) {
	const config = landscapeScales[scale];
	const areaId = `mere-road-${scale}`;
	const arrival = {
		id: "green-road",
		kind: "spawn",
		name: "The Green Road",
		tag: "arrival",
		x: Math.floor(config.width / 2),
		y: 4,
	};
	const area = {
		id: areaId,
		name: "The Green Road · Merewatch Vale",
		width: config.width,
		height: config.height,
		kind: "outdoor",
		tileSize: 32,
		theme: { atmosphere: "blue-hour" },
		terrainTiles: [],
		terrainHeights: [],
		objects: [],
		npcs: [],
		overlayTiles: [],
		structures: [],
		pickups: [],
		eventBlocks: [arrival],
	};
	dressLandscape(
		area,
		config,
		project.areas[0].npcs.find((n) => n.npcDefinitionId === "oswin"),
	);
	const used = new Set(area.objects.map((o) => o.objectDefinitionId));
	const keeper = project.npcs.find((n) => n.id === "oswin");
	delete keeper.defaultInteraction;
	keeper.name = "Road Keeper";
	delete project.trackedQuestId;
	return {
		...project,
		metadata: {
			...project.metadata,
			name: `Merewatch Vale — The Green Road (${scale})`,
		},
		// The road runs toward +Z from the northern arrival. The initial player
		// faces that way; an unrotated follow boom shows the first crofts.
		camera: {
			...project.camera,
			three: { ...project.camera.three, yawOffsetDegrees: 0 },
		},
		activeAreaId: areaId,
		areas: [area],
		objects: project.objects.filter((o) => used.has(o.id)),
		npcs: [keeper],
		items: [],
		shops: [],
		quests: [],
		cutscenes: [],
		dialogues: [],
		rules: [],
		ruleGroups: [],
		gameState: { flags: {}, variables: {}, inventory: {} },
		storyGraphs: [
			{
				id: "green-road-opening",
				name: "The Green Road",
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
				id: "enter-road",
				action: { type: "spawn_player", areaId, eventBlockId: arrival.id },
			},
		],
	};
}

export async function createLandscapeFixture(scale) {
	if (scale !== "merewatch" && !Object.hasOwn(landscapeScales, scale))
		throw new Error(`Unknown field-study scale: ${scale}`);
	const base = JSON.parse(await readFile(source, "utf8"));
	addKit(base);
	const project =
		scale === "merewatch" ? dressVillage(base) : createRoadProject(base, scale);
	const area = project.areas[0];
	const { x, y } = area.eventBlocks[0];
	const counts = {
		width: area.width,
		height: area.height,
		tiles: area.terrainTiles.length,
		raised: area.terrainHeights.length,
		objects: area.objects.length,
		npcs: area.npcs.length,
		actors: area.npcs.length + 2,
	};
	return { project, areaId: area.id, spawn: { x, y }, counts };
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const [scale, output] = process.argv.slice(2);
	if (!output)
		throw new Error(
			`Usage: node tools/hollow-kingdom/field-study/fixture.mjs merewatch|${Object.keys(landscapeScales).join("|")} <new-project.json>`,
		);
	const { project, counts } = await createLandscapeFixture(scale);
	await writeFile(output, `${JSON.stringify(project, null, "\t")}\n`, {
		flag: "wx",
	});
	console.log(counts);
}
