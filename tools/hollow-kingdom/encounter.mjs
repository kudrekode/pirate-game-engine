// The watchkeeper's story is ordinary project data. Combat, dialogue choices,
// one-shot rewards and save/continue all use the shared runtime.
const questId = "last-watch";
const flag = (name, value = true) => ({ type: "flag_is", flag: name, value });
const has = (itemId) => ({ type: "has_item", itemId, quantity: 1 });
const lacks = (itemId) => ({ type: "not_has_item", itemId, quantity: 1 });
const status = (status) => ({ type: "quest_status", questId, status });
const give = (itemId, quantity = 1) => ({
	type: "give_item",
	itemId,
	quantity,
});
const choice = (targetNodeId, text, ...conditions) => ({
	id: targetNodeId,
	targetNodeId,
	text,
	conditions,
});
const ended = (id, speaker, text, actions = []) => ({
	id,
	type: "end",
	speaker,
	text,
	actions,
});
const talk = (dialogueId, prompt) => ({
	type: "start_dialogue",
	activationMode: "on_interact",
	dialogueId,
	prompt,
});

export function authorEncounter(project) {
	const area = project.areas.find((area) => area.id === "merewatch");
	const oswin = project.npcs.find((npc) => npc.id === "oswin");
	const sword = "watch-sword";
	const key = "beacon-key";
	const letter = "watch-letter";
	const coin = "ferry-penny";
	const lootFlag = "poachers-coffer-emptied";
	const deliveryFlag = "oswin-read-letter";
	const cinematicId = "the-light-across-the-mere";
	const camera = (x, y, z, targetX, targetY, targetZ) => ({
		position: { x, y, z },
		lookAt: { x: targetX, y: targetY, z: targetZ },
	});
	project.cutscenes.push({
		id: cinematicId,
		name: "The Light Across the Mere",
		backgroundImageId: "river_crossing",
		speakerName: "Oswin",
		text: "That's her light, up there. Three nights now and she hasn't shuttered it.",
		cinematic: {
			areaId: area.id,
			shots: [
				{
					durationMs: 2400,
					from: camera(21.2, 3.5, 46.1, 23.1, 2.35, 42),
					to: camera(22, 3.4, 45.2, 23.1, 2.35, 42),
				},
				{
					durationMs: 3400,
					from: camera(21.65, 2.65, 43.5, 23.04, 2.48, 42),
					to: camera(21.85, 2.63, 43.3, 23.03, 2.51, 42),
				},
				{
					durationMs: 3200,
					from: camera(25.5, 5.2, 38, 26, 5.2, 4),
					to: camera(24, 6, 34.9, 26, 6.7, 4),
				},
			],
			cues: [
				{
					type: "subtitle",
					startMs: 250,
					durationMs: 2000,
					speaker: "Wayfarer",
					text: "How will I find her?",
				},
				{
					type: "subtitle",
					startMs: 2480,
					durationMs: 3050,
					speaker: "Oswin",
					text: "Look for the light across the mere. Mara tends it.",
				},
				{
					type: "actor",
					startMs: 2400,
					durationMs: 1700,
					actorId: "oswin-at-the-well",
					animation: "interact",
					face: { x: 21.65, z: 43.5 },
				},
				{
					type: "actor",
					startMs: 4100,
					durationMs: 1700,
					actorId: "oswin-at-the-well",
					animation: "idle",
					face: { x: 21.65, z: 43.5 },
				},
				{
					type: "subtitle",
					startMs: 5880,
					durationMs: 3000,
					speaker: "Oswin",
					text: "Follow the jetty lantern. She leaves word at the foot of the tower.",
				},
			],
		},
	});
	const poachers = [
		{
			id: "pine-lookout",
			name: "Pine Lookout",
			x: 32,
			y: 56,
			health: 48,
			damage: 5,
			radius: 5,
		},
		{
			id: "ash-coat",
			name: "Ash Coat",
			x: 36,
			y: 55,
			health: 78,
			damage: 8,
			radius: 3,
		},
	];
	project.items.push(
		{
			id: sword,
			name: "Ferryman's Hanger",
			category: "weapon",
			weapon: "sword",
			stackable: false,
			description:
				"A short blade with a worn leather grip. Oswin used to cut fouled ferry ropes with it.",
		},
		{
			id: key,
			name: "Beacon Key",
			category: "key",
			stackable: false,
			iconId: "key",
			description:
				"Salt has turned the bronze green. A little beacon is stamped on the bow.",
		},
		{
			id: letter,
			name: "Watchkeeper's Letter",
			category: "quest",
			stackable: false,
			description:
				"For my father, at the winding well. The wax carries the watchtower seal.",
		},
		{
			id: coin,
			name: "Ferry Penny",
			category: "currency",
			stackable: true,
			maxStack: 99,
			description:
				"The old Merewatch fare. A lantern on one face, an oar on the other.",
		},
	);
	project.player.combat.attackDamage = 9;
	project.trackedQuestId = questId;
	project.quests.push({
		id: questId,
		name: "The Last Watch",
		status: "inactive",
		objectiveMode: "sequence",
		description: "Oswin's daughter keeps the beacon. Her signal is overdue.",
		objectives: [
			{
				id: "blade",
				description: "Take Oswin's hanger. Equip it in Inventory (I).",
				condition: has(sword),
			},
			...poachers.map(({ id, name }) => ({
				id,
				description: `Defeat ${name} at the lamplit camp east of the cottage lane.`,
				condition: { type: "flag", flag: `npc_defeated_${id}`, value: true },
			})),
			{
				id: "coffer",
				description: "Search the poachers' coffer for the Beacon Key.",
				condition: has(key),
			},
			{
				id: "crossing",
				description:
					"Sail from the village dock and find the letter by the watchtower.",
				condition: has(letter),
			},
			{
				id: "return",
				description: "Return to Oswin at the well and hand him the letter.",
				condition: { type: "flag", flag: deliveryFlag, value: true },
			},
		],
		completionActions: [give(coin, 12)],
		completionMessage:
			"The Last Watch complete. Oswin pays you twelve ferry pennies.",
	});
	oswin.defaultInteraction = talk("oswins-watch", "Speak to Oswin");
	project.dialogues.push({
		id: "oswins-watch",
		name: "Oswin's watch",
		startNodeId: "well",
		nodes: [
			{
				id: "well",
				type: "choice",
				speaker: "Oswin",
				text: "See the light across the mere? My daughter keeps the watch now. I leave this lamp burning till she shutters hers.",
				choices: [
					choice(
						"offer",
						"She hasn't shuttered it tonight?",
						status("inactive"),
					),
					choice(
						"camp",
						"Where did they take the key?",
						status("active"),
						lacks(key),
						lacks(letter),
					),
					choice(
						"cross",
						"I have the key. Where do I land?",
						status("active"),
						has(key),
						lacks(letter),
					),
					choice(
						"deliver",
						"She left this for you.",
						status("active"),
						has(letter),
					),
					choice("after", "Any word from the tower?", status("completed")),
					choice("farewell", "Leave him by the well."),
				],
			},
			{
				id: "offer",
				type: "choice",
				speaker: "Oswin",
				text: "Three nights burning. She leaves word at the tower, but two poachers took my beacon key. I can lend you my boat if you'll go.",
				choices: [
					choice("accept", "Lend me a blade. I'll bring back word."),
					choice("farewell", "Another time."),
				],
			},
			ended(
				"accept",
				"Oswin",
				"Take my hanger. Open Inventory (I) and equip it. Turn back down the cottage lane and take the dirt track east to their lamp. Face them and press F to strike.",
				[
					{ type: "play_cutscene", cutsceneId: cinematicId },
					{ type: "activate_quest", questId },
					give(sword),
				],
			),
			ended(
				"camp",
				"Oswin",
				"Their coffer is under a lamp in the southeast pines. Take the dirt fork at the cottage end of the lane. My mare grazes east of the well if you'd sooner ride.",
			),
			ended(
				"cross",
				"Oswin",
				"My boat's at the end of our dock. Make for the lantern on the jetty left of the tower. Mara keeps the dispatch box uphill, at the foot of the beacon.",
			),
			ended(
				"deliver",
				"Oswin",
				"‘Keep your lamp in the window.’ Oh, Mara. As if I'd ever let it go out. Keep the hanger, friend, and take these twelve pennies for the crossing.",
				[
					{ type: "set_flag", flag: deliveryFlag, value: true },
					{ type: "remove_item", itemId: letter, quantity: 1 },
				],
			),
			ended(
				"after",
				"Oswin",
				"I've read it so many times the crease is wearing through. Still a good bright light up there.",
			),
			ended("farewell", "Oswin", "Mind your footing after dark."),
		],
	});

	for (const [index, poacher] of poachers.entries()) {
		const attributes = {
			maxHealth: poacher.health,
			health: poacher.health,
			alignment: "hostile",
			faction: "Pine poachers",
			canInteract: false,
			movementSpeed: index === 0 ? 1.35 : 1,
		};
		project.npcs.push({
			id: poacher.id,
			name: poacher.name,
			mapAvatarId: "ranger",
			defaultAttributes: attributes,
			defaultMovement: {
				movementMode: "stationary",
				movementSpeed: attributes.movementSpeed,
			},
			defaultEnemyBehaviour: {
				enabled: true,
				detectionRadiusTiles: poacher.radius,
				chaseRadiusTiles: poacher.radius + 3,
				returnToOrigin: true,
				contactDamage: poacher.damage,
			},
			threeVisual: { mode: "asset", assetId: "mere-poacher" },
		});
		area.npcs.push({
			id: poacher.id,
			npcDefinitionId: poacher.id,
			areaId: area.id,
			x: poacher.x,
			y: poacher.y,
			facing: "left",
			blocksMovement: true,
			movementMode: "stationary",
			attributes,
		});
	}

	// A visible track branches from the cottage end of the old cobbled lane.
	// Both poachers stand off the lane so an unarmed visitor may reach Oswin.
	for (const tile of area.terrainTiles) {
		if (tile.x < 21 || tile.x > 37 || tile.tileId !== "grass") continue;
		const trail = 55.2 + Math.sin((tile.x - 21) / 5) * 1.15;
		if (Math.abs(tile.y - trail) < 0.85) tile.tileId = "dirt";
	}
	area.objects.push(
		{
			id: "camp-lamp",
			objectDefinitionId: "mere-lantern",
			areaId: area.id,
			x: 38,
			y: 55,
		},
		{
			id: "cutters-coffer",
			objectDefinitionId: "poacher-coffer",
			areaId: area.id,
			x: 37,
			y: 56,
		},
	);
	project.objects.push({
		id: "poacher-coffer",
		name: "Poachers' Coffer",
		category: "container",
		blocksMovement: true,
		widthTiles: 1,
		heightTiles: 1,
		threeVisual: { mode: "asset", assetId: "world-chest" },
		defaultInteraction: talk("search-coffer", "Search the poachers' coffer"),
	});
	project.dialogues.push({
		id: "search-coffer",
		name: "The poachers' coffer",
		startNodeId: "coffer",
		nodes: [
			{
				id: "coffer",
				type: "choice",
				text: "A heavy oak coffer sits in the lamplight. You need both poachers out of the way to search it.",
				choices: [
					choice(
						"loot",
						"Lift the lid and take the key.",
						...poachers.map(({ id }) => flag(`npc_defeated_${id}`)),
						flag(lootFlag, false),
					),
					choice("empty", "Check the empty coffer.", flag(lootFlag)),
					choice("leave", "Step away."),
				],
			},
			ended(
				"loot",
				"Poachers' Coffer",
				"A bronze key and three ferry pennies lie under the loose cloth. Time to take Oswin's boat across the mere.",
				[
					give(key),
					give(coin, 3),
					{ type: "set_flag", flag: lootFlag, value: true },
				],
			),
			ended("empty", "Poachers' Coffer", "Only the loose cloth remains."),
			ended("leave", "Poachers' Coffer", "You leave the coffer where it lies."),
		],
	});
}
