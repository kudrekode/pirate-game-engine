import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const chapter = JSON.parse(
	readFileSync(
		new URL("hollow-kingdom-chapter-one.project.json", root),
		"utf8",
	),
);
const field = JSON.parse(
	readFileSync(new URL("merewatch-field-study.project.json", root), "utf8"),
);
const sword = {
	id: "quay-blade",
	name: "Quayside hanger",
	weapon: "sword",
	category: "weapon",
	stackable: false,
	melee: {
		weaponAssetId: "bell-hanger",
		damage: 22,
		reachTiles: 1.85,
		impactMs: 215,
		activeMs: 70,
		cooldownMs: 660,
		parryMs: 180,
	},
};
const bow = {
	id: "yew-bow",
	name: "Yew bow",
	weapon: "bow",
	category: "weapon",
	stackable: false,
};
const slash = {
	label: "a shoulder cut",
	damage: 14,
	rangeTiles: 1.65,
	arcDegrees: 85,
	windupMs: 700,
	impactMs: 175,
	recoveryMs: 650,
};
const trials = [
	{
		id: "blade",
		name: "Aggressive Swordsman",
		actor: "Rook, quay duellist",
		model: "bell-freeblade",
		health: 84,
		speed: 2.4,
		y: 12,
		weapon: "sword",
		staggerMs: 270,
		swordTactics: { parryAfter: 2, reactionMs: 125, counterWindupMs: 235 },
		briefing:
			"Rook presses close. His long crosscut leaves an opening. Interrupt an early windup, then be ready for his answer.",
		attacks: [
			{ ...slash, windupMs: 410, impactMs: 160, recoveryMs: 380, damage: 20 },
			{
				...slash,
				label: "a long crosscut",
				rangeTiles: 2.05,
				arcDegrees: 45,
				windupMs: 545,
				impactMs: 145,
				recoveryMs: 625,
				damage: 23,
			},
		],
	},
	{
		id: "bow",
		name: "Bow trial",
		actor: "The Yew Warden",
		model: "mere-ferryman",
		health: 72,
		speed: 2,
		y: 16,
		weapon: "bow",
		keepDistanceTiles: 4.2,
		staggerMs: 420,
		loadout: "yew-bow",
		briefing:
			"Move sideways once the bow is drawn. Use the stone pilaster for cover.",
		attacks: [
			{
				...slash,
				label: "an aimed shaft",
				arrowSpeed: 10,
				rangeTiles: 13,
				windupMs: 1150,
				impactMs: 50,
				recoveryMs: 1100,
				damage: 16,
			},
		],
	},
	{
		id: "courser",
		name: "Courser trial",
		actor: "The Riderless Grey",
		model: "mere-courser",
		health: 94,
		speed: 3,
		y: 13,
		body: { radius: 0.65, height: 1.85 },
		briefing: "Watch its near forehoof. Step to the flank as it lifts.",
		attacks: [
			{
				...slash,
				label: "a forehoof strike",
				windupClip: "PawLift",
				strikeClip: "PawStrike",
				rangeTiles: 2.2,
				arcDegrees: 72,
				windupMs: 880,
				impactMs: 185,
				recoveryMs: 1050,
				damage: 19,
			},
		],
	},
	{
		id: "wyrm",
		name: "Wyrm trial",
		actor: "The Bell Wyrm",
		model: "chapter-mere-drake",
		health: 150,
		speed: 1.45,
		y: 14,
		body: { radius: 0.92, height: 1.65 },
		briefing:
			"Parry the narrow bite. Retreat from the tail sweep and close during recovery.",
		attacks: chapter.npcs
			.find((n) => n.id === "mere-wyrm")
			.defaultEnemyBehaviour.attacks.map((a, i) => ({
				...a,
				windupMs: i ? 1250 : 870,
				recoveryMs: i ? 1650 : 840,
				unblockable: !!i,
				damage: i ? 28 : 18,
			})),
	},
];
const variants = JSON.parse(
	readFileSync(new URL("variants.json", import.meta.url), "utf8"),
);
const includeVariants = !process.argv.includes("--base");
if (includeVariants) {
	trials.push(
		{ ...trials[0], ...variants.guard },
		{
			...trials[0],
			id: "falchion",
			name: "Sword duel · Falchion",
			loadout: variants.weapon.id,
			briefing:
				"The falchion hits harder. Commit earlier and leave room for its longer recovery.",
		},
	);
}
const definitions = new Map(
	[...chapter.objects, ...field.objects].map((o) => [o.id, o]),
);
const used = new Set();
function yard(trial) {
	const { id } = trial;
	const width = 23,
		height = 24;
	const terrainTiles = Array.from({ length: width * height }, (_, i) => {
		const x = i % width,
			y = Math.floor(i / width);
		const lane = x >= 5 && x <= 17 && y >= 4 && y <= 19;
		return { x, y, tileId: lane ? "dirt" : "grass" };
	});
	const objects = [];
	function place(asset, x, y, yaw = 0, size = 1, lift = 0) {
		used.add(asset);
		objects.push({
			id: `${id}-${objects.length + 1}`,
			areaId: id,
			objectDefinitionId: asset,
			x,
			y,
			transform: {
				position: { x: 0, y: lift, z: 0 },
				rotation: { x: 0, y: yaw, z: 0 },
				scale: { x: size, y: size, z: size },
			},
		});
	}
	for (const x of [4, 18])
		for (const y of [5, 11, 17])
			place("chapter-chapel-wall", x, y, x === 4 ? 90 : -90);
	for (const y of [2, 20]) {
		place("chapter-chapel-arch", 11, y, 0, 1.05);
		for (const x of [6, 16]) place("chapter-chapel-wall", x, y, 0, 0.85);
	}
	for (const x of [8, 11, 14])
		for (const y of [6, 10, 14, 18])
			place("mere-cobbles", x, y, (x + y) % 2 ? 180 : 0, 1, 0.008);
	place("chapter-vigil-altar", 11, 19, 180, 0.78);
	place("chapter-chapel-wall", 7, 12, 90, 0.55);
	for (const [x, y] of [
		[8, 8],
		[14, 8],
		[6, 17],
		[16, 17],
	])
		place("mere-lantern", x, y, 0, 0.95);
	for (const [x, y, size] of [
		[2, 18, 1],
		[19, 21, 1.2],
		[16, 23, 1.1],
		[6, 22, 0.8],
		[1, 4, 0.75],
		[21, 10, 1],
	])
		place("mere-spruce", x, y, x * 37, size);
	place("mere-lane-ash", 4, 22, 73, 0.95);
	if (trial.swordTactics) {
		place("mere-watchtower", 7, 22, -14, 1.15);
		place("mere-lane-ash", 2, 15, 146, 1.18);
		place("mere-lantern", 14, 11, 170, 0.8);
		place("mere-lantern", 8, 12, -12, 0.8);
		place("chapter-chapel-arch", 6, 16, 90, 0.83);
	}
	for (const [x, y] of [
		[5, 15],
		[16, 19],
		[5, 8],
		[17, 12],
	])
		place("mere-verge", x, y, y * 22, 0.7);
	const attributes = {
		health: trial.health,
		maxHealth: trial.health,
		faction: "Bell court",
		alignment: "hostile",
		movementSpeed: trial.speed,
		canInteract: false,
	};
	const npc = {
		id: `${id}-opponent`,
		name: trial.actor,
		mapAvatarId: "ranger",
		threeVisual: { mode: "asset", assetId: trial.model },
		defaultAttributes: attributes,
		defaultMovement: { movementMode: "stationary", movementSpeed: trial.speed },
		defaultEnemyBehaviour: {
			enabled: true,
			returnToOrigin: true,
			detectionRadiusTiles: 18,
			chaseRadiusTiles: 20,
			weapon: trial.weapon,
			body: trial.body,
			keepDistanceTiles: trial.keepDistanceTiles,
			staggerMs: trial.staggerMs,
			guardWindup: trial.guardWindup,
			swordTactics: trial.swordTactics,
			weaponAssetId: trial.swordTactics ? "bell-hanger" : undefined,
			attacks: trial.attacks,
		},
	};
	const area = {
		id,
		name: trial.name,
		kind: "outdoor",
		width,
		height,
		tileSize: 32,
		encounter: {
			weaponItemId: trial.loadout ?? sword.id,
			briefing: trial.briefing,
		},
		theme: {
			atmosphere: "blue-hour",
			fog: { enabled: true, near: 12, far: 36 },
		},
		terrainTiles,
		overlayTiles: [],
		structures: [],
		objects,
		pickups: [],
		npcs: [
			{
				id: npc.id,
				npcDefinitionId: npc.id,
				areaId: id,
				x: 11,
				y: trial.y,
				facing: "up",
				blocksMovement: true,
				attributes,
				movementMode: "stationary",
			},
		],
		eventBlocks: [
			{ id: `${id}-start`, name: "South arch", kind: "spawn", x: 11, y: 7 },
		],
	};
	return { area, npc };
}
if (includeVariants)
	trials.unshift(
		...trials.splice(
			trials.findIndex((t) => t.id === "guard"),
			1,
		),
	);
const courts = trials.map(yard);
const project = {
	metadata: { name: "The Hollow Kingdom — The Bell Court", version: "1.0.0" },
	activeAreaId: trials[0].id,
	areas: courts.map((c) => c.area),
	camera: {
		...chapter.camera,
		three: {
			...chapter.camera.three,
			yawOffsetDegrees: -46,
			distance: 3.55,
			height: 1.85,
			lookAtHeight: 1.22,
		},
	},
	player: {
		...chapter.player,
		threeVisual: { mode: "asset", assetId: "bell-challenger" },
		health: 112,
		combat: { ...chapter.player.combat, health: 112, maxHealth: 112 },
	},
	npcs: courts.map((c) => c.npc),
	objects: [...used].map((id) => definitions.get(id)),
	items: includeVariants ? [sword, bow, variants.weapon] : [sword, bow],
	shops: [],
	quests: [],
	cutscenes: [],
	dialogues: [],
	rules: [],
	ruleGroups: [],
	storyGraphs: [],
	progression: [],
	gameState: {
		flags: {},
		variables: {},
		inventory: {
			[sword.id]: 1,
			[bow.id]: 1,
			...(includeVariants && { [variants.weapon.id]: 1 }),
		},
	},
};
writeFileSync(
	new URL(
		includeVariants
			? "hollow-kingdom-combat-arena.project.json"
			: "test-results/combat-arena-base.project.json",
		root,
	),
	`${JSON.stringify(project, null, "\t")}\n`,
);
