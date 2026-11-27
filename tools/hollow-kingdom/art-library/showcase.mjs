import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Stage the library in the playable blue-hour village. Existing IDs continue to
// own the well interaction, Bracken's mount point and the ferryman's dialogue.
const project = JSON.parse(
	await readFile("merewatch-field-study.project.json", "utf8"),
);
const village = project.areas.find((area) => area.id === "merewatch");
project.metadata.name = "The Hollow Kingdom — The Heron's Well";
village.name = "Merewatch — The Heron's Well";
const editions = new Map([
	["mere-well", "mere-heron-well"],
	["mere-lantern", "mere-tide-lantern"],
	["mere-ferryman", "mere-oswin-ferryman"],
	["mere-horse", "mere-road-mare"],
]);
for (const definition of [...project.objects, ...project.npcs]) {
	const visual = definition.threeVisual;
	if (visual && editions.has(visual.assetId))
		visual.assetId = editions.get(visual.assetId);
}
const spawn = village.eventBlocks.find((block) => block.id === "lane");
Object.assign(spawn, { name: "The well approach", x: 21, y: 47 });
Object.assign(
	village.objects.find((placed) => placed.id === "bracken"),
	{ x: 28, y: 52 },
);
project.gameState.inventory["watch-sword"] = 1;
project.items.find((item) => item.id === "watch-sword").melee = {
	weaponAssetId: "mere-heron-hanger",
};
const wyrm = {
	id: "shore-wyrm",
	name: "Blackwater Wyrm",
	mapAvatarId: "scout",
	defaultAttributes: {
		maxHealth: 100,
		health: 100,
		faction: "Merewatch",
		alignment: "neutral",
		canInteract: false,
		movementSpeed: 1,
	},
	defaultMovement: { movementMode: "stationary", movementSpeed: 1 },
	threeVisual: { mode: "asset", assetId: "chapter-blackwater-wyrm" },
};
project.npcs.push(wyrm);
village.npcs.push({
	id: "wyrm-on-the-bank",
	npcDefinitionId: wyrm.id,
	areaId: village.id,
	x: 28,
	y: 46,
	facing: "left",
	blocksMovement: true,
	movementMode: "stationary",
	attributes: { ...wyrm.defaultAttributes },
});
const keeper = {
	...wyrm,
	id: "court-keeper",
	name: "Edric, Keeper of the Court",
	mapAvatarId: "ranger",
	threeVisual: { mode: "asset", assetId: "bell-tide-keeper" },
};
project.npcs.push(keeper);
village.npcs.push({
	id: "keeper-by-the-cottage",
	npcDefinitionId: keeper.id,
	areaId: village.id,
	x: 19,
	y: 48,
	facing: "down",
	blocksMovement: true,
	movementMode: "stationary",
	attributes: { ...keeper.defaultAttributes },
});
await writeFile(
	resolve("merewatch-art-study.project.json"),
	`${JSON.stringify(project)}\n`,
);
