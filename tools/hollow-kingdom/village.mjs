// Rebuild the ordinary importable project. Positions and profiles use metres.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
const template = JSON.parse(
	readFileSync(new URL("movement-v2-demo.project.json", root)),
);
const id = "merewatch";
// Keep the near-bank composition together when sizing the open-water sightline.
const lakeExtension = 14;
const nearY = (localY) => localY + lakeExtension;
const area = {
	id,
	name: "Merewatch • The Lantern Walk",
	kind: "outdoor",
	width: 44,
	height: nearY(46),
	tileSize: 32,
	theme: { atmosphere: "moonlit" },
	terrainTiles: [],
	terrainHeights: [],
	overlayTiles: [],
	structures: [],
	objects: [],
	pickups: [],
	npcs: [],
	eventBlocks: [
		{
			id: "lane",
			kind: "spawn",
			name: "Cottage lane",
			tag: "arrival",
			x: 20,
			y: nearY(42),
		},
	],
};
const project = {
	metadata: {
		name: "The Hollow Kingdom — Merewatch",
		version: template.metadata.version,
	},
	activeAreaId: id,
	areas: [area],
	camera: structuredClone(template.camera),
	tileStyles: template.tileStyles,
	pixelAssets: template.pixelAssets,
	player: {
		...template.player,
		name: "Wayfarer",
		threeVisual: { mode: "asset", assetId: "mere-wayfarer" },
	},
	objects: [],
	npcs: [],
	items: [],
	shops: [],
	quests: [],
	cutscenes: [],
	dialogues: [],
	progression: [
		{
			id: "arrive",
			action: { type: "spawn_player", areaId: id, eventBlockId: "lane" },
		},
	],
	gameState: { flags: {}, variables: {}, inventory: {} },
	rules: [],
	ruleGroups: [],
};
Object.assign(project.camera.three, {
	distance: 3.7,
	height: 1.65,
	lookAtHeight: 1.41,
	pitchDegrees: 4,
	yawOffsetDegrees: 180,
});
const nearBank = (x) =>
	22 +
	Math.round(
		1.5 * Math.sin((x - 25) * 0.17) +
			15 * Math.min(1, Math.max(0, (x - 24) / 9)),
	);
const farBank = (x) => 7 + Math.round(2 * Math.sin((x - 19) * 0.24));
for (let y = 0; y < area.height; y++) {
	for (let x = 0; x < area.width; x++) {
		const water = y < nearY(nearBank(x)) && y > farBank(x);
		const lane = 19.6 + 0.14 * (nearY(42) - y);
		const earth =
			y >= nearY(nearBank(x)) &&
			Math.abs(x - lane) < 1.95 + 0.35 * Math.sin(y * 0.93);
		area.terrainTiles.push({
			x,
			y,
			tileId: water ? "water" : earth ? "dirt" : "grass",
		});
		if (y <= farBank(x)) {
			const hill = Math.round(
				Math.max(0, 3.25 - Math.hypot((x - 26) * 0.39, (y - 4) * 0.56)),
			);
			if (hill && y > 0)
				area.terrainHeights.push({ x, y, height: Math.min(y, hill) });
		}
	}
}

function place(key, name, x, y, yaw = 0, scale = 1, lift = 0) {
	const assetId = "mere-" + key;
	if (!project.objects.some((o) => o.id === assetId))
		project.objects.push({
			id: assetId,
			name,
			category: "prop",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			threeVisual: { mode: "asset", assetId },
		});
	const gx = Math.round(x),
		gy = Math.round(y);
	area.objects.push({
		id: key + "-" + (area.objects.length + 1),
		objectDefinitionId: assetId,
		areaId: id,
		x: gx,
		y: gy >= 12 ? nearY(gy) : gy, // row 12 lies in open water between the two compositions
		transform: {
			position: { x: x - gx, y: lift, z: y - gy },
			rotation: { x: 0, y: yaw, z: 0 },
			scale: { x: scale, y: scale, z: scale },
		},
	});
}

place("cottage", "Crooked Cottage", 15.55, 33.8, -17);
for (const [x, y, yaw] of [
	[19.65, 41, -2],
	[19.8, 37, -3],
	[20.15, 33, -7],
	[20.82, 29.08, -13],
	[21.86, 25.22, -18],
	[22.91, 21.45, -11],
]) {
	place("cobbles", "Merewatch Cobbles", x, y, yaw, 1, 0.003);
}
place("well", "Winding Well", 24.45, 27.3, 19);
place("lantern", "Horn Lantern", 23.7, 31.32, -28);
place("cottage", "Crooked Cottage", 13.6, 24.35, 47, 0.79);
place("cottage", "Crooked Cottage", 6.4, 28.3, 118, 0.9);
place("dock", "Mooring Deck", 23.45, 20);
place("dock", "Mooring Deck", 23.45, 16);
place("lantern", "Horn Lantern", 24.25, 20.85, 8, 0.9, 0.83);
place("watchtower", "Beacon Tower", 26, 4, 11, 0.88, -0.57);
place("crag", "Schist Outcrop", 25.9, 7.8, -13, 1.05, -0.64);
place("crag", "Schist Outcrop", 22.6, 6.9, 39, 0.94, -0.44);
place("crag", "Schist Outcrop", 29.1, 7.3, -57, 0.86, -0.41);
place("barrel", "Coopered Cask", 17.4, 36.4, 8, 0.91);
place("barrel", "Coopered Cask", 16.64, 36.63, 21);
place("barrel", "Coopered Cask", 22.69, 16.7, -5, 0.78, 0.83);

// Irregular stands on both banks leave a clear view of the beacon from the lane.
let seed = 847;
function random() {
	seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
	return seed / 4294967296;
}
function pine(x, y, scale) {
	if (y > farBank(x) && y < nearBank(x)) return;
	place("spruce", "Merewatch Spruce", x, y, random() * 360 - 180, scale);
}
for (let x = 0; x < 44; x += 1.76) {
	pine(x, random() * 2, 0.75 + random() * 0.75);
	if (Math.abs(x - 26) > 3.6)
		pine(x + 0.5, farBank(x) - 1 - random() * 2.8, 0.61 + random() * 0.58);
}
for (const [x, y, s] of [
	[7, 38, 1.17],
	[10, 35, 0.94],
	[11, 40, 1.38],
	[5, 31, 1.35],
	[4, 22, 1.26],
	[8, 21, 1.32],
	[11, 22, 0.94],
	[16, 21, 1.12],
	[2, 39, 1.44],
	[30, 35, 1.07],
	[33, 31, 1.23],
	[33, 40, 1.5],
	[36, 37, 1.28],
	[30, 25, 1.14],
	[35, 26, 1.11],
	[39, 28, 1.32],
	[40, 42, 1.37],
	[25.8, 38.5, 0.84],
	[4, 43, 1.2],
	[10, 44, 1.1],
])
	pine(x, y, s);
for (const [x, y, s] of [
	[17.7, 37, 0.9],
	[18.1, 35.3, 0.77],
	[16.4, 37.2, 0.82],
	[14.6, 36.8, 1.1],
	[17.9, 32, 0.68],
	[22.1, 37.2, 0.72],
	[21.5, 40, 0.62],
	[22.9, 34.1, 0.81],
	[24, 32, 0.9],
	[25.6, 28.1, 0.75],
	[25.3, 26.4, 0.65],
	[19.3, 27, 0.92],
	[20.2, 24.2, 0.75],
	[25, 22.8, 0.9],
	[16, 22.5, 1.15],
	[11.8, 22.4, 1.2],
	[28.1, 23, 1.2],
	[30.6, 24, 1.05],
	[5.2, 23, 1.32],
	[22.4, 7, 1.8],
	[26.3, 8, 2.3],
	[29, 7.5, 1.53],
	[32.6, 6.9, 1.74],
]) {
	if (y >= nearBank(x) || y <= farBank(x))
		place("verge", "Heath and Loose Stone", x, y, random() * 360 - 180, s);
}
for (let x = 3; x < 43; x += 2.1 + random()) {
	if (Math.abs(x - 23.45) < 2) continue;
	place(
		"verge",
		"Heath and Loose Stone",
		x,
		nearBank(Math.round(x)) + 0.46,
		random() * 115,
		0.72 + random() * 0.45,
	);
}
for (let x = 1; x < 43; x += 2.4 + random() * 1.5) {
	place(
		"crag",
		"Schist Outcrop",
		x,
		farBank(Math.round(x)) + 0.83,
		random() * 74 - 37,
		0.56 + random() * 0.32,
		-0.42,
	);
}
const attributes = {
	maxHealth: 100,
	health: 100,
	faction: "Merewatch",
	alignment: "friendly",
	canInteract: true,
	movementSpeed: 1,
};
project.npcs.push({
	id: "oswin",
	name: "Oswin the Ferryman",
	mapAvatarId: "scout",
	defaultAttributes: attributes,
	defaultMovement: { movementMode: "stationary", movementSpeed: 1 },
	threeVisual: { mode: "asset", assetId: "mere-ferryman" },
	defaultInteraction: {
		type: "show_message",
		activationMode: "on_interact",
		speaker: "Oswin",
		prompt: "Speak to Oswin",
		lines: [
			"See the light across the mere? My daughter keeps the watch now.",
			"I leave this lamp burning till she shutters hers.",
		],
	},
});
area.npcs.push({
	id: "oswin-at-the-well",
	npcDefinitionId: "oswin",
	areaId: id,
	x: 23,
	y: nearY(28),
	facing: "down",
	blocksMovement: true,
	movementMode: "stationary",
	attributes,
});
writeFileSync(
	fileURLToPath(new URL("hollow-kingdom.project.json", root)),
	JSON.stringify(project) + "\n",
);
