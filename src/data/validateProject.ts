import type {
	ConditionExpression,
	GameAction,
	GameProject,
	Interaction,
	ObjectBehaviour,
	ProgressionAction,
} from "../types/game";
import { backgroundPresets, portraitPresets } from "./presets";

export type ValidationIssue = {
	id: string;
	severity: "warning" | "error";
	message: string;
	path?: string;
	entityType?: string;
	entityId?: string;
};

type ValidationContext = {
	itemIds: Set<string>;
	cutsceneIds: Set<string>;
	questIds: Set<string>;
	shopIds: Set<string>;
	areaIds: Set<string>;
	flagNames: Set<string>;
	variableNames: Set<string>;
	npcDefinitionIds: Set<string>;
	objectDefinitionIds: Set<string>;
	npcInstanceIds: Set<string>;
	targetIds: Set<string>;
	eventIdsByArea: Map<string, Set<string>>;
};

function makeContext(project: GameProject): ValidationContext {
	const eventIdsByArea = new Map<string, Set<string>>();
	const targetIds = new Set<string>();
	const npcInstanceIds = new Set<string>();

	project.areas.forEach((area) => {
		const eventIds = new Set(
			area.eventBlocks.map((eventBlock) => eventBlock.id),
		);
		eventIdsByArea.set(area.id, eventIds);
		area.eventBlocks.forEach((eventBlock) => {
			targetIds.add(eventBlock.id);
		});
		area.objects.forEach((object) => {
			targetIds.add(object.id);
		});
		area.npcs.forEach((npc) => {
			targetIds.add(npc.id);
			npcInstanceIds.add(npc.id);
		});
		area.structures.forEach((structure) => {
			targetIds.add(structure.id);
		});
	});

	return {
		itemIds: new Set(project.items.map((item) => item.id)),
		cutsceneIds: new Set(project.cutscenes.map((cutscene) => cutscene.id)),
		questIds: new Set(project.quests.map((quest) => quest.id)),
		shopIds: new Set(project.shops.map((shop) => shop.id)),
		areaIds: new Set(project.areas.map((area) => area.id)),
		flagNames: new Set(Object.keys(project.gameState.flags)),
		variableNames: new Set(Object.keys(project.gameState.variables)),
		npcDefinitionIds: new Set(project.npcs.map((npc) => npc.id)),
		objectDefinitionIds: new Set(project.objects.map((object) => object.id)),
		npcInstanceIds,
		targetIds,
		eventIdsByArea,
	};
}

export function validateProject(project: GameProject): ValidationIssue[] {
	const context = makeContext(project);
	const issues: ValidationIssue[] = [];
	const issueIds = new Set<string>();

	function addIssue(
		id: string,
		message: string,
		path: string,
		entityType: string,
		entityId: string,
		severity: ValidationIssue["severity"] = "warning",
	) {
		if (issueIds.has(id)) {
			return;
		}
		issueIds.add(id);
		issues.push({ id, severity, message, path, entityType, entityId });
	}

	function checkReference(
		ids: Set<string>,
		referenceId: string | undefined,
		label: string,
		path: string,
		entityType: string,
		entityId: string,
	) {
		if (referenceId && !ids.has(referenceId)) {
			addIssue(
				`${entityType}:${entityId}:${path}:${referenceId}`,
				`${entityType} "${entityId}" references missing ${label} "${referenceId}".`,
				path,
				entityType,
				entityId,
			);
		}
	}

	function checkAreaEventReference(
		areaId: string | undefined,
		eventBlockId: string | undefined,
		path: string,
		entityType: string,
		entityId: string,
	) {
		checkReference(
			context.areaIds,
			areaId,
			"area",
			`${path}.areaId`,
			entityType,
			entityId,
		);
		if (
			eventBlockId &&
			(!areaId || !context.eventIdsByArea.get(areaId)?.has(eventBlockId))
		) {
			addIssue(
				`${entityType}:${entityId}:${path}.eventBlockId:${eventBlockId}`,
				`${entityType} "${entityId}" references missing event block "${eventBlockId}" in area "${areaId ?? "unknown"}".`,
				`${path}.eventBlockId`,
				entityType,
				entityId,
			);
		}
	}

	function checkInteraction(
		interaction: Interaction | undefined,
		path: string,
		entityType: string,
		entityId: string,
	) {
		if (!interaction) {
			return;
		}
		if (interaction.type === "play_cutscene") {
			checkReference(
				context.cutsceneIds,
				interaction.cutsceneId,
				"cutscene",
				`${path}.cutsceneId`,
				entityType,
				entityId,
			);
		}
		if (interaction.type === "teleport" || interaction.type === "area_link") {
			checkAreaEventReference(
				interaction.targetAreaId,
				interaction.targetEventBlockId,
				path,
				entityType,
				entityId,
			);
		}
		if (interaction.type === "set_flag") {
			checkReference(
				context.flagNames,
				interaction.flag,
				"flag",
				`${path}.flag`,
				entityType,
				entityId,
			);
		}
	}

	function checkObjectBehaviour(
		behaviour: ObjectBehaviour | undefined,
		path: string,
		entityType: string,
		entityId: string,
	) {
		if (!behaviour) {
			return;
		}
		if (behaviour.type === "container") {
			behaviour.contents.forEach((content, index) => {
				checkReference(
					context.itemIds,
					content.itemId,
					"item",
					`${path}.contents.${index}.itemId`,
					entityType,
					entityId,
				);
			});
		}
		if (behaviour.type === "door") {
			checkReference(
				context.itemIds,
				behaviour.requiredItemId,
				"item",
				`${path}.requiredItemId`,
				entityType,
				entityId,
			);
			checkReference(
				context.cutsceneIds,
				behaviour.lockedCutsceneId,
				"cutscene",
				`${path}.lockedCutsceneId`,
				entityType,
				entityId,
			);
			if (behaviour.targetAreaId || behaviour.targetEventBlockId) {
				checkAreaEventReference(
					behaviour.targetAreaId,
					behaviour.targetEventBlockId,
					path,
					entityType,
					entityId,
				);
			}
		}
	}

	function checkCondition(
		condition: ConditionExpression,
		path: string,
		ruleId: string,
	) {
		if (condition.type === "group") {
			condition.conditions.forEach((child, index) => {
				checkCondition(child, `${path}.conditions.${index}`, ruleId);
			});
			return;
		}
		if (condition.type === "has_item" || condition.type === "not_has_item") {
			checkReference(
				context.itemIds,
				condition.itemId,
				"item",
				`${path}.itemId`,
				"Rule",
				ruleId,
			);
		}
		if (condition.type === "flag_is") {
			checkReference(
				context.flagNames,
				condition.flag,
				"flag",
				`${path}.flag`,
				"Rule",
				ruleId,
			);
		}
		if (condition.type === "variable_compare") {
			checkReference(
				context.variableNames,
				condition.variable,
				"variable",
				`${path}.variable`,
				"Rule",
				ruleId,
			);
		}
		if (
			condition.type === "npc_alignment" ||
			condition.type === "npc_health_compare"
		) {
			checkReference(
				context.npcInstanceIds,
				condition.npcId,
				"NPC target",
				`${path}.npcId`,
				"Rule",
				ruleId,
			);
		}
	}

	function checkAction(action: GameAction, path: string, ruleId: string) {
		if (action.type === "play_cutscene") {
			checkReference(
				context.cutsceneIds,
				action.cutsceneId,
				"cutscene",
				`${path}.cutsceneId`,
				"Rule",
				ruleId,
			);
		} else if (action.type === "give_item" || action.type === "remove_item") {
			checkReference(
				context.itemIds,
				action.itemId,
				"item",
				`${path}.itemId`,
				"Rule",
				ruleId,
			);
		} else if (
			action.type === "activate_quest" ||
			action.type === "complete_quest" ||
			action.type === "fail_quest"
		) {
			checkReference(
				context.questIds,
				action.questId,
				"quest",
				`${path}.questId`,
				"Rule",
				ruleId,
			);
		} else if (action.type === "open_shop") {
			checkReference(
				context.shopIds,
				action.shopId,
				"shop",
				`${path}.shopId`,
				"Rule",
				ruleId,
			);
		} else if (
			action.type === "set_npc_alignment" ||
			action.type === "set_npc_health"
		) {
			checkReference(
				context.npcInstanceIds,
				action.npcId,
				"NPC target",
				`${path}.npcId`,
				"Rule",
				ruleId,
			);
		} else if (action.type === "teleport") {
			checkAreaEventReference(
				action.areaId,
				action.eventBlockId,
				path,
				"Rule",
				ruleId,
			);
		} else if (action.type === "set_flag") {
			checkReference(
				context.flagNames,
				action.flag,
				"flag",
				`${path}.flag`,
				"Rule",
				ruleId,
			);
		} else if (
			action.type === "change_variable" ||
			action.type === "set_variable"
		) {
			checkReference(
				context.variableNames,
				action.variable,
				"variable",
				`${path}.variable`,
				"Rule",
				ruleId,
			);
		}
	}

	function checkProgressionAction(
		action: ProgressionAction,
		path: string,
		stepId: string,
	) {
		if (action.type === "play_cutscene") {
			checkReference(
				context.cutsceneIds,
				action.cutsceneId,
				"cutscene",
				`${path}.cutsceneId`,
				"Progression step",
				stepId,
			);
		} else if (
			action.type === "spawn_player" ||
			action.type === "teleport_player"
		) {
			checkAreaEventReference(
				action.areaId,
				action.eventBlockId,
				path,
				"Progression step",
				stepId,
			);
		} else if (action.type === "wait_for_trigger") {
			if (action.areaId) {
				checkAreaEventReference(
					action.areaId,
					action.eventBlockId,
					path,
					"Progression step",
					stepId,
				);
			} else if (
				!Array.from(context.eventIdsByArea.values()).some((eventIds) =>
					eventIds.has(action.eventBlockId),
				)
			) {
				addIssue(
					`Progression step:${stepId}:${path}.eventBlockId:${action.eventBlockId}`,
					`Progression step "${stepId}" references missing event block "${action.eventBlockId}".`,
					`${path}.eventBlockId`,
					"Progression step",
					stepId,
				);
			}
		}
	}

	project.rules.forEach((rule, ruleIndex) => {
		const path = `rules.${ruleIndex}`;
		if (rule.trigger.type === "on_cutscene_end") {
			checkReference(
				context.cutsceneIds,
				rule.trigger.cutsceneId,
				"cutscene",
				`${path}.trigger.cutsceneId`,
				"Rule",
				rule.id,
			);
		} else if (rule.trigger.type === "on_area_enter") {
			checkReference(
				context.areaIds,
				rule.trigger.areaId,
				"area",
				`${path}.trigger.areaId`,
				"Rule",
				rule.id,
			);
		} else if (
			rule.trigger.type === "on_interact" ||
			rule.trigger.type === "on_touch"
		) {
			checkReference(
				context.targetIds,
				rule.trigger.targetId,
				"NPC/object/event target",
				`${path}.trigger.targetId`,
				"Rule",
				rule.id,
			);
		}

		if (rule.conditionTree) {
			checkCondition(rule.conditionTree, `${path}.conditionTree`, rule.id);
		}
		rule.actions.forEach((action, index) => {
			checkAction(action, `${path}.actions.${index}`, rule.id);
		});
		rule.elseActions?.forEach((action, index) => {
			checkAction(action, `${path}.elseActions.${index}`, rule.id);
		});
	});

	project.progression.forEach((step, index) => {
		checkProgressionAction(step.action, `progression.${index}.action`, step.id);
	});

	project.quests.forEach((quest, questIndex) => {
		quest.objectives.forEach((objective, objectiveIndex) => {
			const condition = objective.condition;
			const path = `quests.${questIndex}.objectives.${objectiveIndex}.condition`;
			if (condition.type === "has_item") {
				checkReference(
					context.itemIds,
					condition.itemId,
					"item",
					`${path}.itemId`,
					"Quest",
					quest.id,
				);
			} else if (condition.type === "flag") {
				checkReference(
					context.flagNames,
					condition.flag,
					"flag",
					`${path}.flag`,
					"Quest",
					quest.id,
				);
			} else if (condition.type === "variable_compare") {
				checkReference(
					context.variableNames,
					condition.variable,
					"variable",
					`${path}.variable`,
					"Quest",
					quest.id,
				);
			} else if (condition.type === "enter_area") {
				checkReference(
					context.areaIds,
					condition.areaId,
					"area",
					`${path}.areaId`,
					"Quest",
					quest.id,
				);
			}
		});
		quest.rewards?.forEach((reward, rewardIndex) => {
			const path = `quests.${questIndex}.rewards.${rewardIndex}`;
			if (reward.type === "item") {
				checkReference(
					context.itemIds,
					reward.itemId,
					"item",
					`${path}.itemId`,
					"Quest",
					quest.id,
				);
			} else if (reward.type === "flag") {
				checkReference(
					context.flagNames,
					reward.flag,
					"flag",
					`${path}.flag`,
					"Quest",
					quest.id,
				);
			} else {
				checkReference(
					context.variableNames,
					reward.variable,
					"variable",
					`${path}.variable`,
					"Quest",
					quest.id,
				);
			}
		});
	});

	project.shops.forEach((shop, shopIndex) => {
		checkReference(
			context.itemIds,
			shop.currencyItemId,
			"currency item",
			`shops.${shopIndex}.currencyItemId`,
			"Shop",
			shop.id,
		);
		shop.entries.forEach((entry, entryIndex) => {
			checkReference(
				context.itemIds,
				entry.itemId,
				"item",
				`shops.${shopIndex}.entries.${entryIndex}.itemId`,
				"Shop",
				shop.id,
			);
		});
	});

	project.objects.forEach((object, index) => {
		checkInteraction(
			object.defaultInteraction,
			`objects.${index}.defaultInteraction`,
			"Object definition",
			object.id,
		);
		checkObjectBehaviour(
			object.defaultBehaviour,
			`objects.${index}.defaultBehaviour`,
			"Object definition",
			object.id,
		);
	});

	project.npcs.forEach((npc, index) => {
		checkInteraction(
			npc.defaultInteraction,
			`npcs.${index}.defaultInteraction`,
			"NPC definition",
			npc.id,
		);
	});

	project.areas.forEach((area, areaIndex) => {
		area.structures.forEach((structure, index) => {
			checkInteraction(
				structure.interaction,
				`areas.${areaIndex}.structures.${index}.interaction`,
				"Structure",
				structure.id,
			);
		});
		area.objects.forEach((object, index) => {
			checkReference(
				context.objectDefinitionIds,
				object.objectDefinitionId,
				"object definition",
				`areas.${areaIndex}.objects.${index}.objectDefinitionId`,
				"Object",
				object.id,
			);
			checkInteraction(
				object.interaction,
				`areas.${areaIndex}.objects.${index}.interaction`,
				"Object",
				object.id,
			);
			checkObjectBehaviour(
				object.behaviourOverride,
				`areas.${areaIndex}.objects.${index}.behaviourOverride`,
				"Object",
				object.id,
			);
		});
		area.npcs.forEach((npc, index) => {
			checkReference(
				context.npcDefinitionIds,
				npc.npcDefinitionId,
				"NPC definition",
				`areas.${areaIndex}.npcs.${index}.npcDefinitionId`,
				"NPC",
				npc.id,
			);
			checkInteraction(
				npc.interactionOverride ?? npc.interaction,
				`areas.${areaIndex}.npcs.${index}.interaction`,
				"NPC",
				npc.id,
			);
		});
		area.pickups.forEach((pickup, index) => {
			checkReference(
				context.itemIds,
				pickup.itemId,
				"item",
				`areas.${areaIndex}.pickups.${index}.itemId`,
				"Pickup",
				pickup.id,
			);
		});
		area.eventBlocks.forEach((eventBlock, index) => {
			if (eventBlock.link) {
				checkAreaEventReference(
					eventBlock.link.targetAreaId,
					eventBlock.link.targetEventBlockId,
					`areas.${areaIndex}.eventBlocks.${index}.link`,
					"Event block",
					eventBlock.id,
				);
			}
			checkInteraction(
				eventBlock.interaction,
				`areas.${areaIndex}.eventBlocks.${index}.interaction`,
				"Event block",
				eventBlock.id,
			);
		});
	});

	const backgroundIds = new Set(backgroundPresets.map((asset) => asset.id));
	const portraitIds = new Set(portraitPresets.map((asset) => asset.id));
	project.cutscenes.forEach((cutscene, index) => {
		checkReference(
			backgroundIds,
			cutscene.backgroundImageId,
			"background asset",
			`cutscenes.${index}.backgroundImageId`,
			"Cutscene",
			cutscene.id,
		);
		checkReference(
			portraitIds,
			cutscene.portraitImageId,
			"portrait asset",
			`cutscenes.${index}.portraitImageId`,
			"Cutscene",
			cutscene.id,
		);
	});

	if (project.trackedQuestId) {
		checkReference(
			context.questIds,
			project.trackedQuestId,
			"tracked quest",
			"trackedQuestId",
			"Project",
			project.metadata.name,
		);
	}

	return issues;
}
