// The ferry, its two berths and the dispatch waiting at the beacon belong to
// the same area. The skiff's position is owned by the ordinary vehicle session.
export function authorLake(project) {
	const area = project.areas.find((entry) => entry.id === "merewatch");
	project.objects.push(
		{
			id: "oswins-skiff",
			name: "Oswin’s lake skiff",
			category: "vehicle",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: false,
			threeVisual: { mode: "asset", assetId: "mere-skiff" },
			defaultInteraction: {
				type: "object_behaviour",
				activationMode: "on_interact",
				prompt: "Board Oswin’s skiff",
			},
			defaultBehaviour: {
				type: "vehicle",
				vehicleType: "boat",
				movementMode: "sail",
				allowedTerrainIds: ["water"],
				dismountAllowedTerrainIds: ["grass", "dirt", "sand"],
				speedMultiplier: 1.32,
			},
		},
		{
			id: "keepers-dispatch",
			name: "Keeper’s dispatch box",
			category: "container",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: true,
			threeVisual: { mode: "asset", assetId: "world-chest", scale: 1.35 },
			defaultInteraction: {
				type: "start_dialogue",
				activationMode: "on_interact",
				dialogueId: "keepers-dispatch",
				prompt: "Examine the dispatch box",
			},
		},
	);

	function place(id, objectDefinitionId, x, y, yaw = 0, scale = 1, lift = 0) {
		const gx = Math.round(x);
		const gy = Math.round(y);
		area.objects.push({
			id,
			objectDefinitionId,
			areaId: area.id,
			x: gx,
			y: gy,
			transform: {
				position: { x: x - gx, y: lift, z: y - gy },
				rotation: { x: 0, y: yaw, z: 0 },
				scale: { x: scale, y: scale, z: scale },
			},
		});
	}

	// Cut a landing through the original rocky bank. Retain the tower, trees
	// and rock silhouettes either side of the narrow keeper's path.
	area.objects = area.objects.filter(
		(object) =>
			!(
				object.y >= 5 &&
				object.y <= 10 &&
				object.x >= 21 &&
				object.x <= 23 &&
				["mere-crag", "mere-spruce", "mere-verge"].includes(
					object.objectDefinitionId,
				)
			),
	);
	for (const tile of area.terrainTiles) {
		if (tile.y >= 9 && tile.y <= 10 && tile.x >= 22 && tile.x <= 24) {
			tile.tileId = "sand";
		} else if (
			tile.y >= 3 &&
			tile.y <= 8 &&
			Math.abs(tile.x - (tile.y > 6 ? 23 : 22)) <= 1 &&
			tile.tileId !== "water"
		) {
			tile.tileId = "dirt";
		}
	}
	place("oswins-ferry", "oswins-skiff", 25, 30);
	place("keepers-jetty", "mere-dock", 23.45, 12);
	place("keepers-landing-lamp", "mere-lantern", 22.35, 9, 35, 0.83);
	place("keepers-salt-cask", "mere-barrel", 21, 8, -19, 0.81);
	place("keepers-cask", "mere-barrel", 20.34, 7.62, 23, 0.66);
	place("keepers-heath", "mere-verge", 20.2, 6.6, -27, 0.86);
	place("dispatch-lamp", "mere-lantern", 21.4, 3.7, 19, 0.8);
	place("tower-dispatch-box", "keepers-dispatch", 23, 4, 12);

	// The waxed letter is a one-off even after it has been delivered. The
	// opened seal and the reward use ordinary dialogue actions saved with Play.
	project.dialogues.push({
		id: "keepers-dispatch",
		name: "The keeper’s dispatch box",
		startNodeId: "seal",
		nodes: [
			{
				id: "seal",
				type: "choice",
				speaker: "Keeper’s dispatch box",
				text: "A little iron lock holds the lid against the wind. Someone has cut a lamp into the wood.",
				choices: [
					{
						id: "open",
						text: "Turn the beacon key.",
						targetNodeId: "letter",
						conditions: [
							{ type: "has_item", itemId: "beacon-key" },
							{ type: "flag_is", flag: "dispatch-collected", value: false },
						],
					},
					{
						id: "rattle",
						text: "Try the lock.",
						targetNodeId: "locked",
						conditions: [
							{ type: "not_has_item", itemId: "beacon-key" },
							{ type: "flag_is", flag: "dispatch-collected", value: false },
						],
					},
					{
						id: "search",
						text: "Look inside.",
						targetNodeId: "empty",
						conditions: [
							{ type: "flag_is", flag: "dispatch-collected", value: true },
						],
					},
					{ id: "leave", text: "Leave the box.", targetNodeId: "leave" },
				],
			},
			{
				id: "letter",
				type: "end",
				speaker: "Mara’s letter",
				text: "Father — three horns in the dark, but no boats. I’ve barred the stair and lit the second wick. Keep your lamp in the window. — M.",
				actions: [
					{ type: "give_item", itemId: "watch-letter", quantity: 1 },
					{ type: "set_flag", flag: "dispatch-collected", value: true },
				],
			},
			{
				id: "locked",
				type: "end",
				text: "It holds fast. You need the beacon key.",
			},
			{
				id: "empty",
				type: "end",
				text: "Only grit and a broken stick of red sealing wax remain.",
			},
			{ id: "leave", type: "end" },
		],
	});
}
