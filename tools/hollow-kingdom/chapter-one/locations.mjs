const visual = (assetId) => ({ mode: "asset", assetId });
export const dialogue = (dialogueId, prompt) => ({
	type: "start_dialogue",
	activationMode: "on_interact",
	dialogueId,
	prompt,
});
export const flag = (flag, value = true) => ({ type: "set_flag", flag, value });
export const say = (line, prompt, completionActions = [], once = false) => ({
	type: "show_message",
	activationMode: "on_interact",
	lines: [line],
	prompt,
	completionActions,
	once,
});

function point(area, id, name, x, y, interaction) {
	area.eventBlocks.push({
		id,
		name,
		x,
		y,
		tag: id,
		kind: interaction ? "trigger" : "spawn",
		...(interaction && { interaction }),
	});
}

function link(area, id, label, x, y, targetAreaId, targetEventBlockId) {
	point(area, id, label, x, y, {
		type: "area_link",
		activationMode: "on_interact",
		prompt: label,
		targetAreaId,
		targetEventBlockId,
	});
}

function makeArea(id, name, width, height, kind, atmosphere, classify, fog) {
	const area = {
		id,
		name,
		width,
		height,
		kind,
		tileSize: 32,
		theme: { atmosphere, ...(fog && { fog: { enabled: true, ...fog } }) },
		terrainTiles: [],
		terrainHeights: [],
		overlayTiles: [],
		structures: [],
		objects: [],
		npcs: [],
		pickups: [],
		eventBlocks: [],
	};
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			area.terrainTiles.push({ x, y, tileId: classify(x, y) });
	return area;
}

function prop(project, area, id, assetId, x, y, options = {}) {
	const {
		name,
		yaw = 0,
		scale = 1,
		lift = 0,
		interaction,
		blocksMovement,
		scene,
	} = options;
	if (!project.objects.some((object) => object.id === assetId))
		project.objects.push({
			id: assetId,
			name: name ?? assetId,
			category: "prop",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			threeVisual: visual(assetId),
		});
	const gx = Math.round(x),
		gy = Math.round(y);
	const { sx, sy, sz } =
		typeof scale === "number" ? { sx: scale, sy: scale, sz: scale } : scale;
	area.objects.push({
		id,
		objectDefinitionId: assetId,
		areaId: area.id,
		x: gx,
		y: gy,
		...(name && { nameOverride: name }),
		...(interaction && { interaction }),
		...(blocksMovement && { blocksMovement }),
		...(scene && { scene }),
		transform: {
			position: { x: x - gx, y: lift, z: y - gy },
			rotation: { x: 0, y: yaw, z: 0 },
			scale: { x: sx, y: sy, z: sz },
		},
	});
}

function npc(project, area, id, name, assetId, x, y, options = {}) {
	const {
		health = 100,
		faction = "Merewatch",
		alignment = "friendly",
		speed = 1,
		facing = "down",
		encounter,
		patrol,
		interaction,
		scale,
	} = options;
	const attributes = {
		maxHealth: health,
		health,
		faction,
		alignment,
		canInteract: !!interaction,
		movementSpeed: speed,
	};
	const movement = {
		movementMode: patrol ? "patrol" : "stationary",
		movementSpeed: speed,
		...(patrol && {
			patrolPath: {
				points: patrol.map(([px, py]) => ({ x: px, y: py })),
				loop: true,
			},
		}),
	};
	project.npcs.push({
		id,
		name,
		mapAvatarId: "ranger",
		defaultAttributes: attributes,
		defaultMovement: movement,
		...(encounter && { defaultEnemyBehaviour: encounter }),
		...(interaction && { defaultInteraction: interaction }),
		threeVisual: { ...visual(assetId), ...(scale && { scale }) },
	});
	area.npcs.push({
		id,
		npcDefinitionId: id,
		areaId: area.id,
		x,
		y,
		facing,
		blocksMovement: true,
		attributes,
		...movement,
	});
}

const hostile = (
	contactDamage,
	detectionRadiusTiles,
	chaseRadiusTiles,
	attacks,
) => ({
	enabled: true,
	returnToOrigin: true,
	contactDamage,
	detectionRadiusTiles,
	chaseRadiusTiles,
	...(attacks && { attacks }),
});
const bite = {
	label: "a root bite",
	damage: 12,
	rangeTiles: 2.15,
	arcDegrees: 66,
	windupMs: 820,
	impactMs: 140,
	recoveryMs: 730,
	windupClip: "BiteWindup",
	strikeClip: "Bite",
};
const sweep = {
	label: "a tail sweep",
	damage: 18,
	rangeTiles: 3.0,
	arcDegrees: 325,
	windupMs: 1120,
	impactMs: 220,
	recoveryMs: 950,
	windupClip: "SweepWindup",
	strikeClip: "Sweep",
};

function villageLayout(project, area) {
	for (const [x, y] of [
		[29, 50],
		[31, 51],
		[34, 52],
		[37, 53],
	]) {
		prop(project, area, `east-trail-${x}`, "mere-cobbles", x, y, {
			yaw: -68,
			scale: 0.58,
		});
	}
	prop(project, area, "east-trail-lantern", "mere-lantern", 37, 54);
	prop(project, area, "vigil-return-arch", "chapter-chapel-arch", 18, 42, {
		name: "Old ferry arch",
		yaw: 90,
		scale: 0.66,
	});
	point(area, "sluice-return", "Old ferry arch", 19, 42);
	point(area, "village-from-wood", "Road from Hollowwood", 36, 53);
	point(
		area,
		"hollowwood-road",
		"Hollowwood road",
		38,
		53,
		dialogue("hollowwood-road", "Take the eastern ridge road"),
	);
	prop(project, area, "mara-cache", "world-chest", 23, 4, {
		name: "Mara's waxed satchel",
		interaction: dialogue("mara-cache", "Search Mara's waxed satchel"),
	});
	project.npcs.find(({ id }) => id === "oswin").defaultInteraction = dialogue(
		"chapter-oswin",
		"Speak to Oswin",
	);
}

function forestLayout(project) {
	const sections = [
		[25, 65, 0, 17],
		[31, 54, 14, 22],
		[25, 42, 22, 31],
		[18, 30, 21, 21],
		[27, 25, 23, 19],
		[36, 11, 20, 20],
	];
	const road = [
		[24, 68],
		[24, 61],
		[27, 58],
		[33, 55],
		[33, 48],
		[29, 44],
		[24, 43],
		[24, 38],
		[22, 34],
		[22, 30],
		[26, 26],
		[31, 24],
		[36, 21],
		[36, 7],
	];
	function distanceFromRoad(x, y) {
		return Math.min(
			...road.slice(1).map(([bx, by], i) => {
				const [ax, ay] = road[i],
					dx = bx - ax,
					dy = by - ay;
				const along = Math.min(
					1,
					Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
				);
				return Math.hypot(x - ax - dx * along, y - ay - dy * along);
			}),
		);
	}
	const area = makeArea(
		"hollowwood",
		"Hollowwood",
		54,
		70,
		"outdoor",
		"moonlit",
		(x, y) => {
			const roadDistance = distanceFromRoad(x, y);
			if (roadDistance <= 1.8) return "dirt";
			if (
				sections.some(
					([cx, cy, w, h]) =>
						Math.hypot((x - cx) / (w || 13), (y - cy) / h) < 1,
				)
			)
				return "grass";
			return "rock";
		},
		{ near: 9, far: 37 },
	);
	let seed = 673;
	const random = () =>
		(seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32;
	const clearings = [
		[24, 64, 4],
		[31, 56, 4],
		[23, 46, 4],
		[19, 39, 4],
		[28, 36, 4],
		[15, 31, 5],
		[25, 25, 4],
		[36, 18, 5],
		[36, 9, 6],
	];
	for (let y = 3; y < 68; y += 3.9)
		for (let x = 4; x < 52; x += 3.8) {
			const px = x + random() * 1.7,
				py = y + random() * 1.7;
			if (
				random() > 0.76 ||
				distanceFromRoad(px, py) < 3 ||
				clearings.some(([cx, cy, r]) => Math.hypot(cx - px, cy - py) < r)
			)
				continue;
			const tile =
				area.terrainTiles[Math.round(py) * area.width + Math.round(px)];
			if (tile.tileId === "rock" && random() > 0.45) continue;
			prop(
				project,
				area,
				`pine-${area.objects.length}`,
				"mere-spruce",
				px,
				py,
				{ scale: 0.82 + random() * 0.73, yaw: random() * 360 },
			);
		}
	for (const [x, y, yaw, size] of [
		[17, 59, 20, 1.4],
		[28, 61, -43, 0.9],
		[37, 51, 25, 0.9],
		[20, 48, -38, 1.25],
		[28, 40, 90, 1.35],
		[14, 35, 23, 1.15],
		[29, 29, 2, 1.1],
		[31, 21, -60, 1.5],
		[41, 16, -31, 1.6],
		[30, 10, -16, 1.4],
	]) {
		prop(project, area, `stone-${x}-${y}`, "mere-crag", x, y, {
			yaw,
			scale: size,
		});
	}
	for (const [x, y] of [
		[22, 64],
		[29, 56],
		[24, 48],
		[21, 39],
		[24, 30],
		[35, 17],
		[39, 9],
	])
		prop(project, area, `trail-light-${x}-${y}`, "mere-lantern", x, y, {
			scale: 0.8,
		});
	point(area, "forest-arrival", "Lantern on the ridge", 24, 64);
	point(area, "forest-from-chapel", "Chapel steps", 36, 11);
	link(
		area,
		"back-to-merewatch",
		"Return to Merewatch",
		24,
		67,
		"merewatch",
		"village-from-wood",
	);
	point(
		area,
		"ashen-chapel-road",
		"Ashen Chapel",
		36,
		7,
		dialogue("ashen-chapel-road", "Enter the Ashen Chapel"),
	);
	prop(project, area, "chapel-forest-arch", "chapter-chapel-arch", 36, 6, {
		name: "Ruined gate",
		scale: 0.86,
	});

	prop(project, area, "split-marker", "mere-verge", 27, 57, {
		name: "Split milestone",
		interaction: dialogue("split-marker", "Examine the split milestone"),
	});
	prop(project, area, "witness-net", "mere-barrel", 20, 46, {
		name: "Cut ferry nets",
		scale: 0.9,
	});
	prop(project, area, "charter-cairn", "chapter-vigil-altar", 20, 28, {
		name: "Charter cairn",
		yaw: 0,
		scale: 0.7,
		interaction: dialogue("charter-cairn", "Read the charter cairn"),
	});
	prop(project, area, "supply-cache", "world-chest", 14, 32, {
		name: "Keeper's supply box",
		interaction: dialogue("supply-cache", "Open the keeper's supply box"),
	});
	prop(project, area, "burnt-cart", "mere-barrel", 38, 38, {
		name: "Oath men's camp",
		yaw: 40,
		interaction: say(
			"The barrel is full of clean linen and splints. Someone meant to dress wounds here. The watch's pitch has burned through the lid.",
			"Search the burnt camp",
		),
	});
	prop(project, area, "grave-counter", "chapter-vigil-altar", 30, 16, {
		name: "Ferryman's grave",
		yaw: 38,
		scale: 0.55,
		interaction: say(
			"A ferryman lies here with no name, only the sketch of an oar. The soil has been turned from below.",
			"Read the ferryman's grave",
		),
	});

	npc(project, area, "iven", "Iven Net-Mender", "mere-ferryman", 22, 46, {
		interaction: dialogue("iven", "Speak to Iven"),
	});
	npc(
		project,
		area,
		"split-roadling",
		"Warrant Runner",
		"mere-poacher",
		33,
		55,
		{
			health: 44,
			faction: "Oathmen",
			alignment: "hostile",
			speed: 1.6,
			encounter: hostile(5, 3, 6),
		},
	);
	npc(project, area, "oath-scout", "Oath Scout", "mere-poacher", 29, 36, {
		health: 58,
		faction: "Oathmen",
		alignment: "hostile",
		encounter: hostile(7, 4, 7),
	});
	npc(project, area, "oath-reader", "Warrant Reader", "mere-poacher", 33, 22, {
		health: 68,
		faction: "Oathmen",
		alignment: "hostile",
		encounter: hostile(8, 4, 7),
	});
	npc(
		project,
		area,
		"ashling",
		"Hollowwood Ashling",
		"chapter-mere-drake",
		34,
		15,
		{
			health: 67,
			faction: "Mere brood",
			alignment: "hostile",
			speed: 1.4,
			scale: 0.56,
			encounter: hostile(0, 7, 10, [
				{
					...bite,
					label: "a snapping rush",
					damage: 6,
					rangeTiles: 1.5,
					arcDegrees: 102,
					windupMs: 420,
					recoveryMs: 520,
				},
			]),
		},
	);
	return area;
}

function chapelLayout(project) {
	const area = makeArea(
		"ashen-chapel",
		"The Ashen Chapel",
		33,
		39,
		"dungeon",
		"overcast",
		(x, y) => {
			if (x >= 6 && x <= 26 && y >= 6 && y <= 28) return "stone_floor";
			if (x >= 12 && x <= 20 && y >= 29 && y <= 36) return "dirt";
			return "rock";
		},
		{ near: 12, far: 34 },
	);
	for (const y of [10, 14, 18, 22, 26, 30]) {
		prop(project, area, `nave-paving-${y}`, "mere-cobbles", 16, y, {
			scale: 0.82,
			lift: 0.008,
		});
	}
	for (const [x, y, yaw] of [
		[8, 28, 0],
		[24, 28, 0],
		[7, 24, 90],
		[7, 18, 90],
		[7, 12, 90],
		[10, 8, 0],
		[22, 8, 0],
		[25, 12, -90],
		[25, 18, -90],
		[25, 24, -90],
	]) {
		prop(project, area, `lancet-${x}-${y}`, "chapter-chapel-wall", x, y, {
			name: "Ruined lancet wall",
			yaw,
		});
	}
	prop(project, area, "nave-door", "chapter-chapel-arch", 16, 28, {
		name: "Ashen Chapel portal",
	});
	prop(project, area, "sanctuary-arch", "chapter-chapel-arch", 16, 14, {
		name: "Sanctuary arch",
		scale: 0.82,
	});
	prop(project, area, "crypt-arch", "chapter-mere-mouth", 16, 5, {
		name: "Sealed descent",
		scale: 0.72,
	});
	for (const [x, y, yaw] of [
		[11, 20, -40],
		[22, 21, 60],
		[10, 12, 30],
		[22, 11, -45],
	])
		prop(project, area, `fallen-masonry-${x}`, "mere-crag", x, y, {
			yaw,
			scale: 0.58,
		});
	for (const [x, y] of [
		[13, 31],
		[19, 27],
		[13, 22],
		[19, 17],
		[13, 11],
	])
		prop(project, area, `chapel-light-${y}`, "mere-lantern", x, y, {
			scale: 0.72,
		});
	point(area, "chapel-arrival", "Front steps", 16, 33);
	point(area, "chapel-from-hollow", "Sanctuary", 16, 9);
	link(
		area,
		"leave-chapel",
		"Cross back into Hollowwood",
		16,
		35,
		"hollowwood",
		"forest-from-chapel",
	);
	point(
		area,
		"crypt-latch",
		"Crypt door",
		16,
		7,
		dialogue("crypt-latch", "Try the crypt door"),
	);
	npc(project, area, "veyr", "Sister Veyr", "mere-wayfarer", 17, 24, {
		interaction: dialogue("veyr", "Speak to Sister Veyr"),
	});
	prop(project, area, "chapel-scroll", "chapter-vigil-altar", 16, 12, {
		name: "The founder's palimpsest",
		scale: 1,
		interaction: dialogue("chapel-scroll", "Read the founder's palimpsest"),
	});
	for (const [id, name, x, y, yaw] of [
		["breath", "Breath stone", 9, 24, 65],
		["name", "Name stone", 22, 24, -35],
		["water", "Water stone", 20, 13, -18],
	])
		prop(project, area, `stone-${id}`, "chapter-vigil-altar", x, y, {
			name,
			yaw,
			scale: 0.55,
			interaction: dialogue(
				`vigil-${id}`,
				`Read and turn the ${name.toLowerCase()}`,
			),
		});
	prop(project, area, "choir-crypt", "world-chest", 9, 16, {
		name: "Unmarked choir chest",
		interaction: dialogue("choir-crypt", "Search the unmarked choir chest"),
	});
	return area;
}

function hollowLayout(project) {
	const chambers = [
		[19, 36, 5, 7],
		[19, 29, 8, 6],
		[17, 21, 9, 8],
		[19, 12, 14, 10],
		[19, 5, 5, 6],
	];
	const area = makeArea(
		"wyrms-hollow",
		"The Wyrm's Hollow",
		39,
		44,
		"cave",
		"moonlit",
		(x, y) => {
			if (x >= 25 && x <= 29 && y >= 9 && y <= 11) return "water";
			return chambers.some(
				([cx, cy, sx, sy]) => Math.hypot((x - cx) / sx, (y - cy) / sy) < 1,
			)
				? "cave_floor"
				: "cave_wall";
		},
		{ near: 8, far: 31 },
	);
	prop(project, area, "cavern-vault", "chapter-cave-vault", 19, 22, {
		name: "Schist cavern vault",
		scene: { collision: "none", locked: true },
	});
	for (const [x, y, yaw, scale] of [
		[19, 23, 0, 1],
		[19, 39, 0, 0.87],
	])
		prop(project, area, `mouth-${y}`, "chapter-mere-mouth", x, y, {
			name: "Schist arch",
			yaw,
			scale,
		});
	for (const [x, y, yaw, scale] of [
		[14, 32, -25, 1],
		[23, 33, 18, 0.93],
		[24, 27, 12, 0.8],
		[11, 23, 48, 1.1],
		[12, 18, -22, 1.3],
		[27, 17, 24, 1.2],
		[10, 13, 68, 1.45],
		[24, 14, 73, 0.85],
		[10, 9, -12, 1.22],
		[28, 7, -45, 1.03],
		[15, 6, 35, 1.4],
		[24, 5, 80, 1.44],
	])
		prop(project, area, `ore-${x}-${y}`, "chapter-cinder-crystal", x, y, {
			name: "Vitrified seam",
			yaw,
			scale,
		});
	for (const [x, y, yaw] of [
		[15, 34, 0],
		[22, 32, 45],
		[13, 27, -16],
		[24, 24, 90],
		[12, 15, 54],
		[27, 14, -32],
		[12, 7, -18],
		[23, 8, 42],
	])
		prop(project, area, `schist-${x}-${y}`, "mere-crag", x, y, {
			yaw,
			scale: { sx: 1.25, sy: 2.35, sz: 1.05 },
		});
	for (const [x, y] of [
		[18, 37],
		[21, 32],
		[17, 27],
		[17, 22],
		[23, 18],
		[15, 18],
		[16, 10],
		[21, 5],
	])
		prop(project, area, `hollow-light-${x}-${y}`, "mere-lantern", x, y, {
			scale: 0.68,
		});
	point(area, "hollow-arrival", "Steps below the chapel", 19, 36);
	link(
		area,
		"hollow-to-chapel",
		"Climb back to the chapel",
		19,
		39,
		"ashen-chapel",
		"chapel-from-hollow",
	);
	point(
		area,
		"sluice-exit",
		"Merewatch sluice",
		19,
		4,
		dialogue("sluice-exit", "Open the spillway to Merewatch"),
	);
	prop(project, area, "descent-lens", "chapter-vigil-altar", 17, 31, {
		name: "Pitch stain",
		scale: 0.46,
		interaction: say(
			"The soot here is lampblack. It leads down from the chapel, ending in the print of a boot and a very small hand.",
			"Examine the lampblack",
		),
	});
	prop(project, area, "confront-wyrm", "chapter-cinder-crystal", 19, 24.6, {
		name: "A crackling seam",
		scale: 0.57,
		interaction: dialogue("confront-wyrm", "Listen at the crackling seam"),
	});
	prop(project, area, "compact-altar", "chapter-vigil-altar", 19, 7.5, {
		name: "The flood chain",
		scale: 0.8,
		interaction: dialogue("flood-chain", "Examine the flood chain"),
	});
	npc(project, area, "sluice-guard", "Last Oathman", "mere-poacher", 20, 28, {
		health: 64,
		faction: "Oathmen",
		alignment: "hostile",
		encounter: hostile(7, 3, 6),
	});
	npc(
		project,
		area,
		"mere-wyrm",
		"The Mere Wyrm",
		"chapter-mere-drake",
		19,
		14,
		{
			health: 210,
			faction: "Mere brood",
			alignment: "neutral",
			speed: 1.1,
			encounter: hostile(0, 8, 13, [bite, sweep]),
		},
	);
	return area;
}

export function layOutChapter(project) {
	villageLayout(project, project.areas[0]);
	project.areas.push(
		forestLayout(project),
		chapelLayout(project),
		hollowLayout(project),
	);
}
