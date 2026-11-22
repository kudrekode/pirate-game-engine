import type { GameProject } from "../types/game";
import { migrateProject } from "./migrateProject";
import { validateProject } from "./validateProject";

type Check = (value: unknown, path: string) => void;

function expectType(condition: boolean, path: string, expected: string) {
	if (!condition) throw new Error(`${path}: Expected ${expected}.`);
}

function object(value: unknown, path: string): Record<string, unknown> {
	expectType(
		value !== null && typeof value === "object" && !Array.isArray(value),
		path,
		"an object",
	);
	return value as Record<string, unknown>;
}

const string: Check = (value, path) =>
	expectType(typeof value === "string", path, "a string");
const number: Check = (value, path) =>
	expectType(Number.isFinite(value), path, "a finite number");
const boolean: Check = (value, path) =>
	expectType(typeof value === "boolean", path, "a boolean");
const stateValue: Check = (value, path) => {
	if (typeof value !== "string") number(value, path);
};
const scalar: Check = (value, path) => {
	if (typeof value !== "boolean") stateValue(value, path);
};

const list =
	(check: Check): Check =>
	(value, path) => {
		if (!Array.isArray(value)) throw new Error(`${path}: Expected an array.`);
		for (let index = 0; index < value.length; index += 1) {
			check(value[index], `${path}.${index}`);
		}
	};
const dictionary =
	(check: Check): Check =>
	(value, path) => {
		for (const [key, entry] of Object.entries(object(value, path))) {
			if (key === "__proto__")
				throw new Error(`${path}.${key}: Unsupported key.`);
			check(entry, `${path}.${key}`);
		}
	};

// Missing fields may be supplied by legacy migration. A field that is present
// must have the right shape before migration can default or discard anything.
function fields({
	strings = "",
	numbers = "",
	booleans = "",
	nested = {},
	required = [],
}: {
	strings?: string;
	numbers?: string;
	booleans?: string;
	nested?: Record<string, Check>;
	required?: string[];
}): Check {
	const checks = new Map<string, Check>(Object.entries(nested));
	for (const [names, check] of [
		[strings, string],
		[numbers, number],
		[booleans, boolean],
	] as const) {
		for (const name of names.split(" ").filter(Boolean))
			checks.set(name, check);
	}
	return (value, path) => {
		const source = object(value, path);
		for (const key of required) {
			if (!(key in source))
				throw new Error(`${path}.${key}: Required field is missing.`);
		}
		for (const [key, entry] of Object.entries(source)) {
			const fieldPath = path ? `${path}.${key}` : key;
			const check = checks.get(key);
			if (!check)
				throw new Error(
					`${fieldPath}: Unknown project field. Check the spelling or export from a supported editor.`,
				);
			check(entry, fieldPath);
		}
	};
}

function tagged(check: Check, types: string): Check {
	const supported = new Set(types.split(" "));
	return (value, path) => {
		const { type } = object(value, path);
		if (typeof type !== "string" || !supported.has(type))
			throw new Error(
				`${path}.type: Unsupported type ${JSON.stringify(type) ?? "(missing)"}.`,
			);
		check(value, path);
	};
}

const point = fields({ numbers: "x y z" });
const cinematicPoint = fields({ numbers: "x y z", required: ["x", "y", "z"] });
const cinematicCamera = fields({
	nested: { position: cinematicPoint, lookAt: cinematicPoint },
	required: ["position", "lookAt"],
});
const cinematicCue: Check = (value, path) => {
	const type = object(value, path).type;
	const timing = "startMs durationMs";
	const required = ["type", "startMs", "durationMs"];
	switch (type) {
		case "subtitle":
			return fields({
				strings: "type speaker text",
				numbers: timing,
				required: [...required, "text"],
			})(value, path);
		case "actor":
			return fields({
				strings: "type actorId animation",
				numbers: timing,
				nested: { face: fields({ numbers: "x z", required: ["x", "z"] }) },
				required: [...required, "actorId"],
			})(value, path);
		case "audio":
			return fields({
				strings: "type url",
				numbers: `${timing} offsetMs volume`,
				required: [...required, "url"],
			})(value, path);
		default:
			throw new Error(`${path}.type: Expected subtitle, actor or audio.`);
	}
};
const transform = fields({
	nested: { position: point, rotation: point, scale: point },
});
const threeVisual = fields({
	strings: "mode placeholderType assetId",
	numbers: "scale heightOffset rotationOffset",
});
const target = fields({ strings: "targetAreaId targetEventBlockId" });
const amount = fields({ strings: "itemId", numbers: "quantity" });
const conditionFields = fields({
	strings:
		"id type operator itemId flag variable npcId alignment areaId targetId questId status",
	numbers: "quantity",
	nested: {
		value: scalar,
		conditions: list((value, path) => ruleCondition(value, path)),
	},
});
const ruleCondition = tagged(
	conditionFields,
	"group flag_is variable_compare has_item not_has_item npc_alignment npc_health_compare",
);
const dialogueCondition = tagged(
	conditionFields,
	"flag_is variable_compare has_item not_has_item quest_status",
);
const objectiveCondition = tagged(
	conditionFields,
	"interaction_completed container_opened enter_event door_used flag has_item variable_compare enter_area",
);
const action = tagged(
	fields({
		strings:
			"type flag variable cutsceneId areaId eventBlockId mode itemId questId npcId alignment shopId",
		numbers: "amount quantity",
		nested: {
			value: scalar,
		},
	}),
	"set_flag change_variable set_variable play_cutscene teleport change_movement_mode give_item remove_item activate_quest complete_quest fail_quest set_npc_alignment set_npc_health open_shop end_game",
);
const actions = list(action);
const interaction = tagged(
	fields({
		strings:
			"type itemId speaker activationMode prompt targetAreaId targetEventBlockId cutsceneId dialogueId shopId flag mode",
		numbers: "quantity",
		booleans: "once value",
		nested: { lines: list(string), completionActions: actions },
	}),
	"show_message object_behaviour collect_item area_link teleport play_cutscene start_dialogue open_shop set_flag change_movement_mode",
);
const behaviour = tagged(
	fields({
		strings:
			"type openedFlag targetAreaId targetEventBlockId requiredItemId lockedCutsceneId text vehicleType movementMode",
		numbers: "speedMultiplier",
		booleans: "once",
		nested: {
			contents: list(amount),
			allowedTerrainIds: list(string),
			allowedOverlayIds: list(string),
			dismountAllowedTerrainIds: list(string),
			dismountAllowedOverlayIds: list(string),
		},
	}),
	"none container door sign vehicle",
);
const attributes = fields({
	strings: "faction alignment",
	numbers: "maxHealth health movementSpeed",
	booleans: "canInteract",
});
const patrolPath = fields({
	booleans: "loop",
	nested: { points: list(point) },
});
const wanderZone = fields({ numbers: "x y width height" });
const movement = fields({
	strings: "movementMode",
	numbers: "movementSpeed",
	nested: { patrolPath, wanderZone },
});
const enemy = fields({
	numbers: "detectionRadiusTiles chaseRadiusTiles contactDamage",
	booleans: "enabled returnToOrigin",
});
const terrain = list(fields({ strings: "tileId", numbers: "x y" }));
const area = fields({
	strings: "id name kind",
	numbers: "width height tileSize",
	nested: {
		terrainTiles: terrain,
		tiles: terrain,
		terrainHeights: list(
			fields({ numbers: "x y height", required: ["x", "y", "height"] }),
		),
		overlayTiles: list(fields({ strings: "overlayId", numbers: "x y" })),
		structures: list(
			fields({
				strings: "id structureId name",
				numbers: "x y widthTiles heightTiles",
				booleans: "blocksMovement",
				nested: {
					transform,
					interaction,
					movementRule: fields({
						strings: "movementMode",
						numbers: "speedMultiplier",
						booleans: "walkable",
					}),
				},
			}),
		),
		objects: list(
			fields({
				strings: "id objectDefinitionId objectId areaId nameOverride",
				numbers: "x y widthTiles heightTiles",
				booleans: "blocksMovement",
				nested: {
					transform,
					threeVisual,
					interaction,
					behaviourOverride: behaviour,
					state: dictionary(scalar),
				},
			}),
		),
		pickups: list(
			fields({
				strings: "id itemId areaId pickupMode collectedFlag",
				numbers: "x y quantity",
				booleans: "once",
				nested: { transform },
			}),
		),
		npcs: list(
			fields({
				strings: "id npcDefinitionId areaId nameOverride facing movementMode",
				numbers: "x y movementSpeed",
				booleans: "blocksMovement",
				nested: {
					transform,
					threeVisual,
					attributes,
					patrolPath,
					wanderZone,
					enemyBehaviour: enemy,
					interaction,
					attributesOverride: attributes,
					movementOverride: movement,
					enemyBehaviourOverride: enemy,
					interactionOverride: interaction,
				},
			}),
		),
		eventBlocks: list(
			fields({
				strings: "id name tag kind",
				numbers: "x y",
				nested: { transform, link: target, interaction },
			}),
		),
		theme: fields({
			strings: "primaryTerrainId accentTerrainId overlayId atmosphere",
		}),
	},
});
const progressionAction = tagged(
	fields({ strings: "id label type cutsceneId areaId eventBlockId" }),
	"play_cutscene spawn_player wait_for_trigger teleport_player end_game",
);
const progressionStep = fields({
	strings: "id label",
	nested: { action: progressionAction },
});

const projectFields: Record<keyof GameProject | "map", Check> = {
	metadata: fields({ strings: "name version" }),
	areas: list(area),
	map: area,
	activeAreaId: string,
	assetCreator: fields({
		nested: {
			variants: list(
				fields({
					strings:
						"id name baseAssetId forkedFromId category description constraint tint effectId",
					numbers: "scale",
					nested: {
						referenceImages: list(string),
						pose: dictionary(point),
						attachment: fields({
							strings: "assetId socket",
							numbers: "scale",
							nested: { position: point, rotation: point },
						}),
					},
					required: ["id", "baseAssetId"],
				}),
			),
			clips: list(
				fields({
					strings: "id name sourceAssetId sourceClipName",
					booleans: "loop",
					nested: {
						keys: list(
							fields({
								strings: "bone",
								numbers: "time",
								nested: { rotation: point },
							}),
						),
					},
					required: ["id", "sourceAssetId", "sourceClipName"],
				}),
			),
			effects: list(
				tagged(
					fields({
						strings: "id name type color socket",
						numbers: "intensity duration",
						booleans: "loop",
						required: ["id"],
					}),
					"glow fog embers",
				),
			),
		},
	}),
	characterAssets: list(
		fields({
			strings:
				"id name kind state geometryFamily glbUrl artifactHash recipeHash manifestUrl recipeUrl rigProfile animationSet",
			required: ["id"],
		}),
	),
	camera: fields({
		numbers:
			"viewportWidthTiles viewportHeightTiles followSmoothing deadzoneWidthTiles deadzoneHeightTiles",
		booleans: "followPlayer",
		nested: {
			three: fields({
				strings: "style",
				numbers:
					"distance height pitchDegrees yawOffsetDegrees lookAtHeight followSmoothing lookSmoothing",
				booleans: "allowRuntimeOrbit",
			}),
		},
	}),
	tileStyles: dictionary(fields({ strings: "color label" })),
	pixelAssets: dictionary(
		fields({
			strings: "id name kind",
			numbers: "width height",
			nested: { pixels: list(list(string)) },
			required: ["pixels"],
		}),
	),
	player: fields({
		strings: "name mapAvatarId cutscenePortraitId spriteId portraitId",
		numbers: "speed health",
		nested: {
			threeVisual,
			canWalkOn: list(string),
			combat: fields({
				numbers:
					"maxHealth health attackDamage attackRangeTiles attackCooldownMs",
			}),
		},
	}),
	cutscenes: list(
		fields({
			strings: "id name backgroundImageId portraitImageId speakerName text",
			nested: {
				cinematic: fields({
					strings: "areaId",
					nested: {
						cues: list(cinematicCue),
						shots: list(
							fields({
								numbers: "durationMs",
								nested: { from: cinematicCamera, to: cinematicCamera },
								required: ["durationMs", "from"],
							}),
						),
					},
					required: ["areaId", "shots"],
				}),
			},
		}),
	),
	dialogues: list(
		fields({
			strings: "id name startNodeId",
			nested: {
				nodes: list(
					tagged(
						fields({
							strings: "id type speaker portraitId text nextNodeId",
							nested: {
								actions,
								choices: list(
									fields({
										strings: "id text targetNodeId",
										nested: { conditions: list(dialogueCondition) },
									}),
								),
							},
						}),
						"text choice end",
					),
				),
				editorLayout: fields({ nested: { nodes: dictionary(point) } }),
			},
		}),
	),
	progression: list((value, path) => {
		const step = object(value, path);
		if ("action" in step) progressionStep(step, path);
		else progressionAction(step, path);
	}),
	gameState: fields({
		nested: {
			flags: dictionary(boolean),
			variables: dictionary(stateValue),
			inventory: dictionary(number),
		},
	}),
	items: list(
		fields({
			strings: "id name description category weapon iconId",
			numbers: "maxStack",
			booleans: "stackable",
		}),
	),
	shops: list(
		fields({
			strings: "id name currencyItemId",
			nested: {
				entries: list(
					fields({ strings: "id itemId", numbers: "buyPrice stock" }),
				),
			},
		}),
	),
	quests: list(
		fields({
			strings: "id name description status objectiveMode completionMessage",
			nested: {
				objectives: list(
					fields({
						strings: "id description",
						nested: { condition: objectiveCondition },
						required: ["condition"],
					}),
				),
				completionActions: actions,
				rewards: list(
					tagged(
						fields({
							strings: "type itemId flag variable",
							numbers: "quantity amount",
							booleans: "value",
						}),
						"item flag variable",
					),
				),
			},
		}),
	),
	trackedQuestId: string,
	npcs: list(
		fields({
			strings: "id name description mapAvatarId portraitId",
			nested: {
				threeVisual,
				defaultAttributes: attributes,
				defaultMovement: movement,
				defaultEnemyBehaviour: enemy,
				defaultInteraction: interaction,
			},
		}),
	),
	objects: list(
		fields({
			strings: "id name description category iconId",
			numbers: "widthTiles heightTiles",
			booleans: "blocksMovement",
			nested: {
				threeVisual,
				defaultInteraction: interaction,
				defaultBehaviour: behaviour,
			},
		}),
	),
	ruleGroups: list(
		fields({
			strings: "id name description parentGroupId",
			booleans: "collapsed",
		}),
	),
	rules: list(
		fields({
			strings: "id name runPolicy groupId",
			booleans: "enabled",
			nested: {
				trigger: fields({ strings: "type targetId areaId cutsceneId" }),
				conditions: list(ruleCondition),
				conditionTree: ruleCondition,
				actions,
				elseActions: actions,
			},
		}),
	),
};
const checkProjectFields = fields({ nested: projectFields });

export function readProjectJson(raw: string): GameProject {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`$: Invalid JSON. ${error instanceof Error ? error.message : "Check the file syntax."}`,
		);
	}
	const source = object(value, "$");
	checkProjectFields(source, "");
	if ("areas" in source) {
		if ("map" in source)
			throw new Error(
				"map: The file also contains areas. Keep only one map format.",
			);
		if (Array.isArray(source.areas) && source.areas.length === 0)
			throw new Error("areas: Expected at least one area.");
	} else if (!("map" in source)) {
		throw new Error("$: Expected a project with areas or a legacy map.");
	}
	return migrateProject(source);
}

export function importProjectJson(raw: string): GameProject {
	const project = readProjectJson(raw);
	const errors = validateProject(project).filter(
		(issue) => issue.severity === "error",
	);
	if (errors.length > 0)
		throw new Error(
			errors.map((issue) => `${issue.path ?? "$"}: ${issue.message}`).join(" "),
		);
	return project;
}
