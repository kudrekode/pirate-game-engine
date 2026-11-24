import { readFileSync, writeFileSync } from "node:fs";
import { writeHorns } from "./horns.mjs";
import { layOutChapter } from "./locations.mjs";
import { authorChapter } from "./story.mjs";

const root = new URL("../../../", import.meta.url);
const project = JSON.parse(
	readFileSync(new URL("hollow-kingdom.project.json", root), "utf8"),
);
const [village] = project.areas;
project.metadata = {
	name: "The Hollow Kingdom — Chapter One: The Wyrm Beneath the Mere",
	version: "1.0.0",
};
project.player.combat = {
	...project.player.combat,
	maxHealth: 160,
	health: 160,
	attackDamage: 12,
};
project.player.health = 160;
project.trackedQuestId = "wyrm-beneath-the-mere";
project.items = project.items.filter(
	({ id }) => id === "watch-sword" || id === "ferry-penny",
);
project.gameState = {
	flags: {},
	variables: {},
	inventory: { "watch-sword": 1, "ferry-penny": 12 },
};
project.npcs = project.npcs.filter(({ id }) => id === "oswin");
project.objects = project.objects.filter(
	({ id }) => id !== "keepers-dispatch" && id !== "poacher-coffer",
);
project.quests = [];
project.dialogues = [];
project.rules = [];
project.storyGraphs = [];
project.cutscenes = [];
village.name = "Merewatch";
village.npcs = village.npcs.filter(
	({ npcDefinitionId }) => npcDefinitionId === "oswin",
);
village.objects = village.objects.filter(({ objectDefinitionId }) =>
	project.objects.some(({ id }) => id === objectDefinitionId),
);
village.eventBlocks = [
	{
		id: "chapter-start",
		kind: "spawn",
		name: "The winding well",
		tag: "arrival",
		x: 22,
		y: 47,
	},
];
project.progression = [
	{
		id: "arrive-at-merewatch",
		action: {
			type: "spawn_player",
			areaId: village.id,
			eventBlockId: "chapter-start",
		},
	},
];

layOutChapter(project);
authorChapter(project);

// Keep the import compact while retaining one line per placed record for reviews.
const compactRecords = new Set([
	"terrainTiles",
	"terrainHeights",
	"overlayTiles",
	"objects",
	"pickups",
	"npcs",
]);
function serialize(value, depth = 0, key = "") {
	if (key === "pixelAssets") return JSON.stringify(value);
	const pad = "\t".repeat(depth);
	if (Array.isArray(value)) {
		if (!value.length) return "[]";
		return `[\n${value.map((entry) => `${pad}\t${compactRecords.has(key) ? JSON.stringify(entry) : serialize(entry, depth + 1)}`).join(",\n")}\n${pad}]`;
	}
	if (typeof value === "object" && value) {
		const fields = Object.entries(value).filter(
			([, entry]) => entry !== undefined,
		);
		if (!fields.length) return "{}";
		return `{\n${fields.map(([field, entry]) => `${pad}\t${JSON.stringify(field)}: ${serialize(entry, depth + 1, field)}`).join(",\n")}\n${pad}}`;
	}
	return JSON.stringify(value);
}

const output = new URL("hollow-kingdom-chapter-one.project.json", root);
writeFileSync(output, `${serialize(project)}\n`);
writeHorns(
	new URL("public/assets/hollow-kingdom/chapter-one/three-horns.wav", root),
);
console.log(
	`Wrote Chapter One with ${project.areas.length} areas, ${project.dialogues.length} dialogues, ${project.quests.length} quests and ${project.cutscenes.length} cinematics.`,
);
