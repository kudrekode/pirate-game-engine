import { flag } from "./locations.mjs";

const is = (flag, value = true) => ({ type: "flag_is", flag, value });
const variable = (variable, value) => ({
	type: "variable_compare",
	variable,
	operator: "==",
	value,
});
const set = (variable, value) => ({ type: "set_variable", variable, value });
const give = (itemId, quantity = 1) => ({
	type: "give_item",
	itemId,
	quantity,
});
const has = (itemId) => ({ type: "has_item", itemId });
const align = (npcId, alignment) => ({
	type: "set_npc_alignment",
	npcId,
	alignment,
});
const scene = (cutsceneId) => ({ type: "play_cutscene", cutsceneId });
const move = (areaId, eventBlockId) => ({
	type: "teleport",
	areaId,
	eventBlockId,
});
const to = (targetNodeId, text, ...conditions) => ({
	id: targetNodeId,
	text,
	targetNodeId,
	...(conditions.length && { conditions }),
});
const choose = (id, speaker, text, ...choices) => ({
	id,
	type: "choice",
	speaker,
	text,
	choices,
});
const line = (id, speaker, text, nextNodeId, ...actions) => ({
	id,
	type: "text",
	speaker,
	text,
	nextNodeId,
	...(actions.length && { actions }),
});
const end = (id, speaker, text, ...actions) => ({
	id,
	type: "end",
	speaker,
	text,
	...(actions.length && { actions }),
});
const exit = end("leave");
const leave = to("leave", "Step away.");
const objective = (id, description, flag) => ({
	id,
	description,
	condition: { type: "flag", flag, value: true },
});
const arrived = (id, description, areaId) => ({
	id,
	description,
	condition: { type: "enter_area", areaId },
});

function conversation(project, id, name, ...nodes) {
	project.dialogues.push({ id, name, startNodeId: nodes[0].id, nodes });
}

function merewatch(project) {
	conversation(
		project,
		"chapter-oswin",
		"Oswin at the well",
		choose(
			"well",
			"Oswin",
			"The letter you brought said three horns, no boats. Tonight the well answered them. Listen to the bucket. It knocks from inside.",
			to(
				"what",
				"Tell me what happened after I brought you Mara's letter.",
				is("chapter-briefed", false),
			),
			to(
				"ridge",
				"Which way to Hollowwood?",
				is("chapter-briefed"),
				variable("verdict", "unsettled"),
			),
			to(
				"saved-wyrm",
				"Mara was buying time. I opened the flood chain.",
				variable("verdict", "released"),
				is("chapter-closed", false),
			),
			to(
				"slain-wyrm",
				"The wyrm is dead. The well is quiet now.",
				variable("verdict", "slain"),
				is("chapter-closed", false),
			),
			to(
				"names",
				"I found the names they tried to bury.",
				is("chapter-closed"),
				has("vigil-roll"),
				is("names-delivered", false),
			),
			to("after", "What will you do now?", is("chapter-closed")),
			leave,
		),
		line(
			"what",
			"Oswin",
			"After I read it, I rowed over. Her beacon was burning and her bed was cold. On the stair I found a warrant from the Ashen Chapel. Someone signed her name under the word ‘tithe’. Mara left the tower by the ridge, where they couldn't follow by boat.",
			"accept",
		),
		end(
			"accept",
			"Oswin",
			"The ridge road begins at the lamp east of Bracken's pasture. Equip the hanger I gave you with I, then look for the split milestone. If you take my skiff back to the tower first, check for Mara's satchel on the far jetty path. She always kept a spare wick there.",
			flag("chapter-briefed"),
			scene("three-horns-under-stone"),
		),
		end(
			"ridge",
			"Oswin",
			"East from the pasture, along the cobbles to the ridge light. Bracken can take you up the slope. Keep the lamp on your right.",
		),
		line(
			"saved-wyrm",
			"Oswin",
			"I spent three nights looking up at that tower. She was looking down into the water all along. You let the thing go? Then the ferries will have to learn the old tides again. I'll make sure they do.",
			"release-end",
		),
		end(
			"release-end",
			"Oswin",
			"Leave her wick burning. It's a signal now, in case there's anyone still out there who remembers how to answer. We owe them that much.",
			flag("chapter-closed"),
			give("opened-chain-token"),
		),
		line(
			"slain-wyrm",
			"Oswin",
			"A quiet well is what I asked for. I wish the bucket didn't sound so much like a bell now. They're already asking me for a tooth to hang over the ferry.",
			"slay-end",
		),
		end(
			"slay-end",
			"Oswin",
			"I'll put the warrant up in the ferry house. Let them read what was done before they tell each other what a monster it was.",
			flag("chapter-closed"),
			give("broken-spur"),
		),
		end(
			"names",
			"Oswin",
			"Those are village names. Half of them hung lamps in their windows when Mara was born. I'll read the roll from the slip at first light, while there are still people who can tell me who they were.",
			flag("names-delivered"),
			give("ferry-penny", 7),
		),
		end(
			"after",
			"Oswin",
			"I've put a new wick in the window. If Mara can see the shore from where she is, she'll know we've read her letter.",
		),
		exit,
	);

	conversation(
		project,
		"hollowwood-road",
		"The ridge road",
		choose(
			"road",
			"Wayfarer",
			"The old ferry stones turn east here, up from the pasture and out of the village.",
			to("cross", "Follow the ridge into Hollowwood.", is("chapter-briefed")),
			to(
				"wait",
				"I should hear Oswin out first.",
				is("chapter-briefed", false),
			),
			leave,
		),
		end("cross", undefined, undefined, move("hollowwood", "forest-arrival")),
		end("wait", "Wayfarer", "Oswin is keeping watch by the winding well."),
		exit,
	);

	conversation(
		project,
		"mara-cache",
		"Mara's satchel",
		choose(
			"satchel",
			"Wayfarer",
			"There's a spare wick, a little rubbing sealed in wax, and a note in Mara's cramped hand. ‘A name, even in charcoal, is harder to drown than a body.’",
			to(
				"rubbing",
				"Take the charcoal rubbing.",
				is("mara-rubbing-found", false),
			),
			leave,
		),
		end(
			"rubbing",
			"Wayfarer",
			"Three scratched figures survive on the rubbing. A mouth. A knotted cord. A cup. The back has the mark of the Ashen Chapel.",
			flag("mara-rubbing-found"),
			give("mara-rubbing"),
		),
		exit,
	);
}

function hollowwood(project) {
	conversation(
		project,
		"split-marker",
		"Split milestone",
		choose(
			"mark",
			"Wayfarer",
			"The post split from the inside. A strip of ferryman's net is caught in it. There are fresh boot marks off the road, heading downhill west of the bend where the lamp burns twice as bright.",
			to("study", "Follow the marks with your eye."),
			leave,
		),
		end(
			"study",
			"Wayfarer",
			"They lead to the old netter's clearing on the left. A second trail heads north past a cairn with candles on it.",
			flag("milestone-read"),
		),
		exit,
	);

	conversation(
		project,
		"iven",
		"Iven's net",
		choose(
			"net",
			"Iven",
			"Keep the lamp low. That's my net around my leg. They said they'd trade the warrant for someone to read it. Then they drove iron through my boot so I'd be here when they came back.",
			to("ask", "Who did this?", variable("witness", "undecided")),
			to("freed-after", "Can you walk now?", variable("witness", "freed")),
			to("seal-after", "Does that knot hold?", variable("witness", "bound")),
			leave,
		),
		line(
			"ask",
			"Iven",
			"The men who carry the Warrant of Ash. They're waiting above the cairn with lamp pitch. Some were ferrymen before they took pay. Show them my net and they'll remember which side pulled them out when they couldn't swim.",
			"offer",
		),
		choose(
			"offer",
			"Iven",
			"The iron seal is in my coat. Take it and the keeper's box opens. Cut the net and I'll show you which names Veyr hid. I can't get away without it drawing their eyes.",
			to("free", "Cut Iven free. Leave him the seal to bargain his way home."),
			to(
				"seal",
				"Take the seal. Keep Iven hidden while I draw their attention.",
			),
			leave,
		),
		end(
			"free",
			"Iven",
			"I'll whistle twice when I've moved. My old crew know that call. As for the names, follow the ash in the choir. The loose chest isn't buried deep.",
			set("witness", "freed"),
			flag("witness-dealt"),
			flag("choir-tip"),
			align("oath-scout", "neutral"),
			align("oath-reader", "neutral"),
			give("iven-net"),
		),
		end(
			"seal",
			"Iven",
			"Then take the west path near the cairn. The box is under a fallen stone. The oath men won't stand down for a stranger in the road, seal or no seal.",
			set("witness", "bound"),
			flag("witness-dealt"),
			give("ash-seal"),
		),
		end(
			"freed-after",
			"Iven",
			"The blood's stopped. I sent the whistle up the hill. If they choose to keep their warrant, that's their choice now.",
		),
		end(
			"seal-after",
			"Iven",
			"It'll hold until they come home. I can keep quiet for that long if I have to.",
		),
		exit,
	);

	conversation(
		project,
		"charter-cairn",
		"The charter stone",
		choose(
			"cairn",
			"Wayfarer",
			"One side shows a long-backed animal letting a boat pass between its claws. On the other, someone has carefully scratched a knife through the ferryman's hand.",
			to("read", "Read beneath the fresh cuts."),
			leave,
		),
		end(
			"read",
			"Charter stone",
			"For every boat we set upon her water, give breath to the lamp, name the drowned, return water to the mere. No clause here demands blood.",
			flag("charter-read"),
		),
		exit,
	);

	conversation(
		project,
		"supply-cache",
		"The keeper's box",
		choose(
			"box",
			"Wayfarer",
			"The little lock takes a flat iron seal. Someone has put clean cloth under the lid to keep the bow dry.",
			to(
				"open",
				"Open it with Iven's seal.",
				has("ash-seal"),
				is("keeper-cache-opened", false),
			),
			leave,
		),
		end(
			"open",
			"Wayfarer",
			"The keeper's bow has a sound string. Hold F to draw, release F to shoot. Equip it from Inventory with I.",
			flag("keeper-cache-opened"),
			give("keeper-bow"),
		),
		exit,
	);

	conversation(
		project,
		"ashen-chapel-road",
		"The Ashen Chapel gate",
		choose(
			"gate",
			"Wayfarer",
			"The ridge has opened onto the chapel steps. Wind drives grey leaves under the arch, then sucks them back the way they came.",
			to(
				"enter",
				"Cross the chapel threshold.",
				is("witness-dealt"),
				is("milestone-read"),
				is("charter-read"),
			),
			to(
				"net",
				"I should find the man in the woods first.",
				is("witness-dealt", false),
			),
			to(
				"marker",
				"I haven't followed the cut-net trail.",
				is("milestone-read", false),
			),
			to(
				"charter",
				"The charter cairn is still unread.",
				is("charter-read", false),
			),
			leave,
		),
		end("enter", undefined, undefined, move("ashen-chapel", "chapel-arrival")),
		end(
			"net",
			"Wayfarer",
			"Look for cut ferry nets on the west side of the lamplit bend.",
		),
		end(
			"marker",
			"Wayfarer",
			"The split milestone stands beside the first turn in the ridge road.",
		),
		end(
			"charter",
			"Wayfarer",
			"The candlelit cairn stands left of the trail below the chapel steps.",
		),
		exit,
	);
}

function chapel(project) {
	conversation(
		project,
		"veyr",
		"Sister Veyr's vigil",
		choose(
			"nave",
			"Sister Veyr",
			"If your feet are dry, you came by the road. Tell me which story they're telling out there. The one where it eats children, or the one where the children volunteered?",
			to(
				"terms",
				"I read the stone. It says we remembered the drowned.",
				is("veyr-heard", false),
			),
			to(
				"rubbing",
				"Mara left this rubbing on the far shore.",
				has("mara-rubbing"),
			),
			to("roll", "Iven mentioned a chest in the choir.", is("choir-tip")),
			to("vigil", "Remind me which stones to turn.", is("veyr-heard")),
			leave,
		),
		line(
			"terms",
			"Sister Veyr",
			"We did. Then the roads came and the tithe men said a living name held better than a dead one. The chapel began sending down people instead of lamps. They painted a beast over every door so no one would ask who wrote the warrant.",
			"mara",
		),
		end(
			"mara",
			"Sister Veyr",
			"Mara saw the older writing. She went down to hold the sluice so the mere wouldn't flood in while I set the vigil. I can't cross these stones with my bad leg. Read the palimpsest under the inner arch. The small candle altars turn from east or west. If you make a mistake, let the stones settle and begin again.",
			flag("veyr-heard"),
		),
		end(
			"rubbing",
			"Sister Veyr",
			"She made that when the watch captain forbade her to copy the names. She said 'If he searches me, tell him that even a ferryman can own a piece of paper.' The order on the rubbing matches the old vigil.",
		),
		end(
			"roll",
			"Sister Veyr",
			"The west choir, by the fallen wall stones. I hid the original roll there. It deserves to get back to Oswin, whatever else comes out of the crypt.",
		),
		end(
			"vigil",
			"Sister Veyr",
			"The palimpsest is straight ahead in the sanctuary. Turn the Breath altar in the west aisle, the Name altar in the east aisle, and Water farther up beside the apse, when you know their order.",
		),
		exit,
	);

	conversation(
		project,
		"chapel-scroll",
		"The founder's palimpsest",
		choose(
			"script",
			"Wayfarer",
			"The new paint flakes off like scales. Under it, three lines of the old vigil run around an engraving of a ferryman and a sleeping wyrm.",
			to("read", "Read the lines aloud."),
			leave,
		),
		end(
			"read",
			"Old vigil",
			"A name is no good to the drowned until it is spoken. Open the mouth first. Speak the name next. Let the water take the sound last. Nothing warm, nothing living, is owed to the chain.",
			flag("scroll-read"),
		),
		exit,
	);

	const stones = [
		[
			"breath",
			"A mouth is carved into the stone. Old candle soot marks its lips.",
			0,
			"Air catches in the turning stone. For a moment it sounds like an intake of breath.",
		],
		[
			"name",
			"Names spiral on this stone. Some have been marked out, but the letters are legible under the whitewash.",
			1,
			"The stone fits its notch. The names you can see are common ones. There are hundreds of them.",
		],
		[
			"water",
			"Rainwater fills a little dish in the wheel. The drain through its centre is dry.",
			2,
			"Water runs out of the dish even after it should be empty. The crypt latch gives way. Veyr points to a panel beneath the sanctuary arch.",
		],
	];
	for (const [id, inscription, stage, response] of stones) {
		conversation(
			project,
			`vigil-${id}`,
			`The ${id} stone`,
			choose(
				"wheel",
				"Wayfarer",
				inscription,
				to(
					"step",
					"Turn the stone.",
					variable("vigil", stage),
					is("veyr-heard"),
					is("scroll-read"),
				),
				...[0, 1, 2]
					.filter((other) => other !== stage)
					.map((other) =>
						to(
							`reset-${other}`,
							"Turn the stone.",
							variable("vigil", other),
							is("veyr-heard"),
							is("scroll-read"),
						),
					),
				to("held", "Leave the turning stone in place.", variable("vigil", 3)),
				leave,
			),
			end(
				"step",
				"Wayfarer",
				response,
				set("vigil", stage + 1),
				...(stage === 2
					? [flag("vigil-lit"), scene("what-the-ash-covered")]
					: []),
			),
			...[0, 1, 2]
				.filter((other) => other !== stage)
				.map((other) =>
					end(
						`reset-${other}`,
						"Wayfarer",
						"Stone grates against stone. Down at the far wall, the first wheel returns to its starting notch. Read the vigil again.",
						set("vigil", 0),
					),
				),
			end("held", "Wayfarer", "The channels are running freely now."),
			exit,
		);
	}

	conversation(
		project,
		"choir-crypt",
		"The unmarked choir chest",
		choose(
			"chest",
			"Wayfarer",
			"The chest looks empty, except for an inch of undisturbed ash along its hinges.",
			to(
				"roll",
				"Lift the loose board under the ash.",
				is("choir-tip"),
				is("roll-found", false),
			),
			to(
				"roll-from-rubbing",
				"Use Mara's rubbing to find the hidden latch.",
				has("mara-rubbing"),
				is("roll-found", false),
			),
			leave,
		),
		end(
			"roll",
			"Wayfarer",
			"The paper opens from the middle. Iven was right. These names were scraped off the public ledger before anyone could ask where their neighbours had gone.",
			flag("roll-found"),
			give("vigil-roll"),
		),
		end(
			"roll-from-rubbing",
			"Wayfarer",
			"Mara's mark lines up with a concealed latch. Behind it is a wrapped roll of names, numbered in the chapel's hand.",
			flag("roll-found"),
			give("vigil-roll"),
		),
		exit,
	);

	conversation(
		project,
		"crypt-latch",
		"The sealed descent",
		choose(
			"latch",
			"Wayfarer",
			"Cold candlelight moves beyond the grating. Steps drop away into the rock.",
			to("down", "Descend into the Wyrm's Hollow.", is("vigil-lit")),
			to("hold", "Test the latch.", is("vigil-lit", false)),
			leave,
		),
		end("down", undefined, undefined, move("wyrms-hollow", "hollow-arrival")),
		end(
			"hold",
			"Wayfarer",
			"The iron bolt feels counterweighted. The three turning stones must be set at the vigil to draw it back.",
		),
		exit,
	);
}

function hollow(project) {
	conversation(
		project,
		"confront-wyrm",
		"At the cracked seam",
		choose(
			"seam",
			"Wayfarer",
			"The ridge under the wall heaves. Following the sound, you find copper wire hammered into the rock and a torn watchkeeper's coat tied to it. It keeps the wire from cutting something that moves.",
			to(
				"approach",
				"Step out and see what Mara was holding.",
				is("confronted", false),
			),
			leave,
		),
		end(
			"approach",
			"Wayfarer",
			"Mara's coat is still warm. Follow the flood chain to the far altar to release the sluice, or put the wyrm down. Watch it pull back before the bite. Get clear when the tail begins to coil.",
			flag("confronted"),
			scene("the-chain-in-the-silt"),
			align("mere-wyrm", "hostile"),
		),
		exit,
	);

	conversation(
		project,
		"flood-chain",
		"The flood chain",
		choose(
			"chain",
			"Wayfarer",
			"Copper wire plays out into a tunnel lower than the village foundations. The little bones caught in it are from fish. The larger bones in the wall are padlocked from this side.",
			to(
				"release",
				"Speak the vigil. Open the chain and let the wyrm go.",
				is("confronted"),
				is("npc_defeated_mere-wyrm", false),
				variable("verdict", "unsettled"),
			),
			to(
				"cut",
				"Cut out the tithe lock. The wyrm is dead.",
				is("npc_defeated_mere-wyrm"),
				variable("verdict", "unsettled"),
			),
			to("return", "Read the run of the water.", is("hollow-resolved")),
			leave,
		),
		end(
			"release",
			"Wayfarer",
			"The lock opens on a name, as Veyr said it would. The wyrm lowers its head beneath the slack wire. Behind it, a second set of footmarks follows a stream into the black. Mara may have found a way out before us.",
			align("mere-wyrm", "neutral"),
			set("verdict", "released"),
			flag("hollow-resolved"),
		),
		end(
			"cut",
			"Wayfarer",
			"The flood stops at the weight of the dead wyrm. Beyond the wire, Mara's boot prints turn toward a fissure no one could have followed in the dark. You pocket the cut lock so nobody can close it again.",
			set("verdict", "slain"),
			flag("hollow-resolved"),
		),
		end(
			"return",
			"Wayfarer",
			"The spillway comes up at the old ferry arch, just west of Oswin's well.",
		),
		exit,
	);

	conversation(
		project,
		"sluice-exit",
		"The Merewatch spillway",
		choose(
			"iron",
			"Wayfarer",
			"A narrow stair climbs toward the smell of lake water. The spillway wheel won't move while the tithe lock is still under tension.",
			to(
				"out",
				"Follow the spillway back to Merewatch.",
				is("hollow-resolved"),
			),
			leave,
		),
		end("out", undefined, undefined, move("merewatch", "sluice-return")),
		exit,
	);
}

const camera = (x, y, z, tx, ty, tz) => ({
	position: { x, y, z },
	lookAt: { x: tx, y: ty, z: tz },
});
const shot = (durationMs, preset, from, to) => ({
	durationMs,
	preset: preset === "wide" ? "establishing" : preset,
	from,
	...(to && { to }),
});
const subtitle = (startMs, durationMs, speaker, text) => ({
	type: "subtitle",
	startMs,
	durationMs,
	speaker,
	text,
});

function cinematics(project) {
	const sequence = (id, name, areaId, shots, cues) =>
		project.cutscenes.push({
			id,
			name,
			backgroundImageId: "river_crossing",
			speakerName: cues[0].speaker,
			text: cues
				.map((cue) => cue.text)
				.filter(Boolean)
				.join(" "),
			cinematic: { areaId, shots, cues },
		});
	sequence(
		"three-horns-under-stone",
		"Three Horns Under Stone",
		"merewatch",
		[
			shot(
				3500,
				"wide",
				camera(21.0, 3.2, 46.1, 23.65, 2.05, 41.95),
				camera(21.55, 3.1, 45.65, 23.65, 2.1, 41.95),
			),
			shot(
				4000,
				"close-up",
				camera(24.15, 2.5, 44.45, 23, 2.42, 42),
				camera(24.05, 2.48, 44.05, 23, 2.42, 42),
			),
			shot(
				3600,
				"wide",
				camera(24, 4.6, 36, 26, 5.9, 4),
				camera(24.4, 4.7, 34.6, 26, 5.9, 4),
			),
		],
		[
			subtitle(
				500,
				2700,
				"Oswin",
				"Hold the rope. Feel that? The bucket is pulling down without us.",
			),
			subtitle(
				3650,
				3550,
				"Oswin",
				"Three horns. Now the well makes a sound like a throat.",
			),
			subtitle(
				7630,
				3220,
				"Oswin",
				"Mara heard it first. If she found what's making it, she went to put it right.",
			),
			{
				type: "actor",
				startMs: 3500,
				durationMs: 1800,
				actorId: "oswin-at-the-well",
				animation: "interact",
				face: { x: 24.15, z: 44 },
			},
			{
				type: "audio",
				startMs: 2360,
				durationMs: 3950,
				url: "/assets/hollow-kingdom/chapter-one/three-horns.wav",
				sourceName: "Three horns beneath the well",
				volume: 0.7,
			},
		],
	);
	sequence(
		"what-the-ash-covered",
		"What the Ash Covered",
		"ashen-chapel",
		[
			shot(
				3900,
				"wide",
				camera(15.5, 3.2, 21, 16, 2, 12.5),
				camera(15.6, 2.65, 19.3, 16, 1.85, 12.5),
			),
			shot(
				4300,
				"close-up",
				camera(16.58, 2.4, 16.8, 16, 2.05, 12),
				camera(16.48, 2.35, 15.9, 16, 2.0, 12),
			),
			shot(
				4000,
				"wide",
				camera(15.5, 3.1, 11, 16, 1.7, 5),
				camera(15.7, 2.8, 10.5, 16, 1.7, 5),
			),
		],
		[
			subtitle(
				400,
				3300,
				"Sister Veyr",
				"The paint was still soft the first time I helped them write a name in it.",
			),
			subtitle(
				4140,
				3840,
				"Sister Veyr",
				"Under every warrant, the same old promise. ‘We remember. You hold the mere in its banks.’",
			),
			subtitle(
				8440,
				3530,
				"Sister Veyr",
				"The lock was ours. The creature was keeping its end.",
			),
		],
	);
	sequence(
		"the-chain-in-the-silt",
		"The Chain in the Silt",
		"wyrms-hollow",
		[
			shot(
				3800,
				"wide",
				camera(14.8, 3.0, 20.8, 19.15, 2.05, 14.2),
				camera(15.45, 2.74, 20.0, 19.15, 2.04, 14.2),
			),
			shot(
				3800,
				"close-up",
				camera(16.2, 2.45, 18.35, 19, 2.15, 14.5),
				camera(16.7, 2.4, 17.9, 19, 2.1, 14.5),
			),
		],
		[
			subtitle(
				650,
				2800,
				"Wayfarer",
				"There's a trough here. All those teeth, and they fed it lamp oil.",
			),
			subtitle(
				3980,
				3300,
				"Wayfarer",
				"Easy. I'll find the other end of that wire.",
			),
			{
				type: "actor",
				actorId: "mere-wyrm",
				animation: "idle",
				startMs: 0,
				durationMs: 7600,
				face: { x: 18, z: 18 },
			},
		],
	);
}

export function authorChapter(project) {
	project.gameState.variables = {
		vigil: 0,
		witness: "undecided",
		verdict: "unsettled",
	};
	project.gameState.flags = Object.fromEntries(
		[
			"chapter-briefed",
			"milestone-read",
			"witness-dealt",
			"choir-tip",
			"charter-read",
			"veyr-heard",
			"scroll-read",
			"vigil-lit",
			"confronted",
			"hollow-resolved",
			"chapter-closed",
			"names-delivered",
			"roll-found",
			"keeper-cache-opened",
			"mara-rubbing-found",
		].map((id) => [id, false]),
	);
	for (const [id, name, description, weapon] of [
		[
			"mara-rubbing",
			"Mara's charcoal rubbing",
			"Three marks copied from the original vigil stone.",
		],
		[
			"iven-net",
			"Iven's cork float",
			"A cut net, worn smooth around the cork by years in water.",
		],
		["ash-seal", "Flat iron ash seal", "A keeper's lock recognises its shape."],
		[
			"keeper-bow",
			"Keeper's yew bow",
			"A ferryman's hunting bow, wrapped against damp.",
			"bow",
		],
		[
			"vigil-roll",
			"Roll of the drowned",
			"The original record of those named by the chapel before the tithe.",
		],
		[
			"opened-chain-token",
			"Open link of the old compact",
			"Oswin prised the copper link open on the ferry step. It will not close again.",
		],
		[
			"broken-spur",
			"Broken iron tithe lock",
			"Oswin drove a chisel through the warrant's seal so nobody can use it again.",
		],
	])
		project.items.push({
			id,
			name,
			description,
			category: weapon ? "weapon" : "quest",
			stackable: false,
			...(weapon && { weapon }),
		});

	project.quests.push({
		id: "wyrm-beneath-the-mere",
		name: "The Wyrm Beneath the Mere",
		description:
			"Mara left her beacon burning for Merewatch. The well has begun to answer it.",
		status: "inactive",
		objectiveMode: "sequence",
		completionMessage: "Chapter One complete. Oswin is keeping the light.",
		objectives: [
			objective(
				"well",
				"Speak to Oswin at the winding well.",
				"chapter-briefed",
			),
			arrived(
				"road",
				"Follow the cobbles past Bracken's pasture to the eastern ridge lamp.",
				"hollowwood",
			),
			objective(
				"turn",
				"Examine the split milestone at the first bend.",
				"milestone-read",
			),
			objective(
				"netter",
				"Find the cut nets west of the lamp at the wooded bend.",
				"witness-dealt",
			),
			objective(
				"charter",
				"Read the candlelit charter cairn on the north trail.",
				"charter-read",
			),
			arrived(
				"chapel",
				"Continue uphill and enter the chapel at its pointed gate.",
				"ashen-chapel",
			),
			objective(
				"veyr",
				"Find Sister Veyr inside the Ashen Chapel.",
				"veyr-heard",
			),
			objective(
				"script",
				"Read the palimpsest beneath the sanctuary arch.",
				"scroll-read",
			),
			objective(
				"vigil",
				"Turn the three stones in the order of the old vigil.",
				"vigil-lit",
			),
			arrived(
				"crypt",
				"Use the crypt latch beyond the sanctuary and go below.",
				"wyrms-hollow",
			),
			objective(
				"seam",
				"Follow the lampblack to the glowing seam by the inner cavern.",
				"confronted",
			),
			objective(
				"chain",
				"Reach the flood chain at the far altar. Release the wyrm or defeat it.",
				"hollow-resolved",
			),
			objective(
				"return",
				"Take the spillway stairs behind the altar and report to Oswin.",
				"chapter-closed",
			),
		],
	});
	project.quests.push({
		id: "names-in-the-ash",
		name: "Names in the Ash",
		status: "inactive",
		description: "Keep a record of the people the tithe took.",
		objectiveMode: "sequence",
		completionMessage:
			"Oswin will read the names of the drowned at first light.",
		objectives: [
			objective(
				"recover",
				"Find the roll in the unmarked chest in the chapel's west choir.",
				"roll-found",
			),
			objective(
				"speak",
				"Return to Oswin with the roll after settling the wyrm's fate.",
				"names-delivered",
			),
		],
	});
	const start = (questId) => ({ type: "activate_quest", questId });
	project.rules.push({
		id: "the-choir-roll",
		name: "Begin the search for the chapel roll on inspecting the chest",
		enabled: true,
		runPolicy: "once",
		trigger: { type: "on_interact", targetId: "choir-crypt" },
		actions: [start("names-in-the-ash")],
	});
	project.storyGraphs.push({
		id: "first-watch-after",
		name: "The First Watch After",
		kind: "opening",
		nodes: [
			{ id: "new-game", x: 0, y: 0, type: "newGame", data: {} },
			{
				id: "chapter-quest",
				x: 280,
				y: 0,
				type: "startQuest",
				data: { questId: "wyrm-beneath-the-mere" },
			},
			{ id: "begin", x: 560, y: 0, type: "end", data: {} },
		],
		edges: [
			{
				id: "opening-quest",
				from: "new-game",
				to: "chapter-quest",
				port: "next",
			},
			{ id: "opening-end", from: "chapter-quest", to: "begin", port: "next" },
		],
	});
	merewatch(project);
	hollowwood(project);
	chapel(project);
	hollow(project);
	cinematics(project);
}
