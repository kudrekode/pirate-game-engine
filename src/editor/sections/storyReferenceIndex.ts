import {
	resolveEventInteraction,
	resolveObjectBehaviour,
} from "../../runtime/interactionDiscovery";
import type { EditorSource } from "../../store/useProjectStore";
import type {
	ConditionExpression,
	GameAction,
	GameProject,
	Interaction,
} from "../../types/game";
import {
	actionSummary,
	conditionSummary,
	type DialogueEntityRef,
	dialogueEntities,
	entityKey,
	placedDialogueNpc,
	resolveDialogueEntity,
	wiringReference,
} from "./dialogueEntities";
import { entitySource } from "./editorSource";
import {
	directBehaviourWarning,
	logicConditionLabel,
	triggerLabel,
	triggerReference,
} from "./logicBlocksModel";
import {
	objectiveReference,
	objectiveSummary,
	objectiveWarnings,
} from "./questSequenceModel";

export type StoryRelationship = {
	id: string;
	kind: "flow" | "reference" | "dependency";
	from: DialogueEntityRef;
	to: DialogueEntityRef;
	label: string;
	source: EditorSource;
	access?: "read" | "write" | "observe" | "assign";
	fromLabel?: string;
	toLabel?: string;
	missing: boolean;
	warning?: string;
};
export type StoryReferenceIndex = {
	relationships: StoryRelationship[];
	outgoing: Map<string, StoryRelationship[]>;
	incoming: Map<string, StoryRelationship[]>;
};
const cache = new WeakMap<GameProject, StoryReferenceIndex>();

/** Derived navigation only. Every authored edge records its exact owning field. */
export function storyReferenceIndex(project: GameProject): StoryReferenceIndex {
	const cached = cache.get(project);
	if (cached) return cached;
	const relationships: StoryRelationship[] = [];
	const add = (
		edge: Omit<StoryRelationship, "id" | "missing" | "kind"> & {
			kind?: StoryRelationship["kind"];
			missing?: boolean;
		},
	) => {
		relationships.push({
			...edge,
			kind: edge.kind ?? "reference",
			missing: edge.missing ?? !resolveDialogueEntity(project, edge.to),
			id: JSON.stringify([
				entityKey(edge.from),
				edge.source,
				edge.label,
				entityKey(edge.to),
				relationships.length,
			]),
		});
	};
	const actions = (
		from: DialogueEntityRef,
		values: GameAction[] | undefined,
		source: EditorSource,
		field: string,
	) =>
		values?.forEach((action, i) => {
			const to = wiringReference(action, project);
			if (to)
				add({
					from,
					to,
					source: { ...source, field: `${field}:${i}` },
					label: actionSummary(action, project),
					access: "write",
				});
		});
	const interaction = (
		from: DialogueEntityRef,
		value: Interaction | undefined,
		source: EditorSource,
	) => {
		if (!value) return;
		if (value.type === "start_dialogue")
			add({
				from,
				to: { kind: "dialogue", id: value.dialogueId ?? "" },
				source: { ...source, field: "interaction" },
				label: "Assigned conversation",
				access: "assign",
			});
		if (value.type === "play_cutscene")
			add({
				from,
				to: { kind: "cutscene", id: value.cutsceneId ?? "" },
				source,
				label: "Plays story moment",
				access: "write",
			});
		if (value.type === "open_shop")
			add({
				from,
				to: { kind: "shop", id: value.shopId ?? "" },
				source,
				label: "Opens shop",
				access: "write",
			});
		if (value.type === "collect_item")
			add({
				from,
				to: { kind: "item", id: value.itemId ?? "" },
				source,
				label: "Grants item",
				access: "write",
			});
		if (value.type === "set_flag")
			add({
				from,
				to: { kind: "flag", id: value.flag ?? "" },
				source,
				label: "Remembers story state",
				access: "write",
			});
		if (value.type === "teleport" || value.type === "area_link")
			add({
				from,
				to: {
					kind: "event",
					areaId: value.targetAreaId ?? "",
					id: value.targetEventBlockId ?? "",
				},
				source,
				label: "Goes to arrival point",
				access: "write",
			});
		actions(from, value.completionActions, source, "completionActions");
	};
	project.areas.forEach((area) => {
		area.npcs.forEach((npc) => {
			const ref: DialogueEntityRef = {
					kind: "npc",
					areaId: area.id,
					id: npc.id,
				},
				source = entitySource(ref);
			interaction(ref, placedDialogueNpc(project, ref)?.interaction, source);
			const flag = `npc_defeated_${npc.id}`;
			if (flag in project.gameState.flags)
				add({
					kind: "dependency",
					from: ref,
					to: { kind: "flag", id: flag },
					source,
					label: "Combat writes existing defeat state",
					access: "write",
				});
		});
		area.objects.forEach((object) => {
			const ref: DialogueEntityRef = {
					kind: "object",
					areaId: area.id,
					id: object.id,
				},
				source = entitySource(ref);
			interaction(
				ref,
				object.interaction ??
					project.objects.find((d) => d.id === object.objectDefinitionId)
						?.defaultInteraction,
				source,
			);
			const behaviour = resolveObjectBehaviour(project, object);
			if (behaviour.type === "container") {
				behaviour.contents.forEach(
					(item, i) =>
						void add({
							from: ref,
							to: { kind: "item", id: item.itemId },
							source: { ...source, field: `contents:${i}` },
							label: `Container grants ×${item.quantity}`,
							access: "write",
						}),
				);
				if (behaviour.openedFlag)
					add({
						from: ref,
						to: { kind: "flag", id: behaviour.openedFlag },
						source,
						label: "Container opened state",
						access: "write",
					});
			}
			if (behaviour.type === "door") {
				if (behaviour.requiredItemId)
					add({
						from: ref,
						to: { kind: "item", id: behaviour.requiredItemId },
						source: { ...source, field: "behaviour" },
						label: "Door requires item",
						access: "read",
					});
				add({
					from: ref,
					to: {
						kind: "event",
						areaId: behaviour.targetAreaId ?? "",
						id: behaviour.targetEventBlockId ?? "",
					},
					source: { ...source, field: "behaviour" },
					label: "Door destination",
					access: "write",
				});
				if (behaviour.lockedCutsceneId)
					add({
						from: ref,
						to: { kind: "cutscene", id: behaviour.lockedCutsceneId },
						source,
						label: "Locked door story moment",
						access: "write",
					});
			}
		});
		area.pickups.forEach((pickup) => {
			const ref: DialogueEntityRef = {
					kind: "pickup",
					areaId: area.id,
					id: pickup.id,
				},
				source = entitySource(ref);
			add({
				from: ref,
				to: { kind: "item", id: pickup.itemId },
				source,
				label: `Pickup grants ×${pickup.quantity}`,
				access: "write",
			});
			if (pickup.collectedFlag)
				add({
					from: ref,
					to: { kind: "flag", id: pickup.collectedFlag },
					source,
					label: "Pickup remembers collection",
					access: "write",
				});
		});
		area.eventBlocks.forEach((event) => {
			const ref: DialogueEntityRef = {
				kind: "event",
				areaId: area.id,
				id: event.id,
			};
			interaction(ref, resolveEventInteraction(event), entitySource(ref));
		});
		area.structures.forEach((structure) => {
			const ref: DialogueEntityRef = {
				kind: "structure",
				areaId: area.id,
				id: structure.id,
			};
			interaction(ref, structure.interaction, entitySource(ref));
		});
	});
	project.dialogues.forEach((dialogue) => {
		const ref: DialogueEntityRef = { kind: "dialogue", id: dialogue.id };
		const start = dialogue.nodes.find((n) => n.id === dialogue.startNodeId);
		add({
			kind: "flow",
			from: ref,
			to: ref,
			fromLabel: `${dialogue.name} start`,
			toLabel:
				start?.text?.slice(0, 65) ||
				(start ? start.type : `Missing node: ${dialogue.startNodeId}`),
			source: {
				section: "dialogues",
				id: dialogue.id,
				nodeId: start?.id,
				field: "start",
			},
			label: "Start",
			missing: !start,
		});
		dialogue.nodes.forEach((node) => {
			const source: EditorSource = {
				section: "dialogues",
				id: dialogue.id,
				nodeId: node.id,
			};
			actions(ref, node.actions, source, "actions");
			const flow = (targetId: string, label: string, field: string) => {
				const target = dialogue.nodes.find((n) => n.id === targetId);
				add({
					kind: "flow",
					from: ref,
					to: ref,
					fromLabel: node.text?.slice(0, 65) || node.type,
					toLabel:
						target?.text?.slice(0, 65) ||
						(target ? target.type : `Missing node: ${targetId}`),
					label,
					source: { ...source, field },
					missing: !target,
				});
			};
			if (node.type === "text" && node.nextNodeId)
				flow(node.nextNodeId, "Next", "next");
			if (node.type === "choice")
				node.choices.forEach((choice) => {
					flow(
						choice.targetNodeId,
						`Response: ${choice.text}`,
						`choice:${choice.id}`,
					);
					choice.conditions?.forEach((c, i) => {
						const to = wiringReference(c, project);
						if (to)
							add({
								from: ref,
								to,
								source: {
									...source,
									field: `choice:${choice.id}:condition:${i}`,
								},
								label: conditionSummary(c, project),
								access: "read",
								warning:
									"Dialogue conditions change response visibility, not the opening greeting.",
							});
					});
				});
		});
	});
	project.quests.forEach((quest) => {
		const ref: DialogueEntityRef = { kind: "quest", id: quest.id },
			source: EditorSource = { section: "quests", id: quest.id };
		quest.objectives.forEach(
			(objective) =>
				void add({
					from: ref,
					to: objectiveReference(project, objective.condition),
					source: { ...source, field: `objective:${objective.id}` },
					label: objectiveSummary(project, objective.condition),
					access: "observe",
					warning:
						objectiveWarnings(project, quest, objective).join(" ") ||
						(objective.condition.type === "interaction_completed"
							? "Talk facts are remembered; a previous conversation can satisfy this step."
							: undefined),
				}),
		);
		actions(ref, quest.completionActions, source, "Completion");
	});
	project.rules.forEach((rule) => {
		const ref: DialogueEntityRef = { kind: "rule", id: rule.id },
			source: EditorSource = { section: "progression", id: rule.id },
			target = triggerReference(project, rule.trigger);
		if (target)
			add({
				from: ref,
				to: target,
				source: { ...source, field: "trigger" },
				label: triggerLabel(project, rule.trigger),
				access: "observe",
				warning: directBehaviourWarning(project, rule.trigger),
			});
		const condition = (expression: ConditionExpression | undefined) => {
			if (!expression) return;
			if (expression.type === "group") {
				expression.conditions.forEach(condition);
				return;
			}
			const to =
				"npcId" in expression
					? (dialogueEntities(project).find(
							(e) => e.ref.kind === "npc" && e.ref.id === expression.npcId,
						)?.ref ?? {
							kind: "npc" as const,
							id: expression.npcId,
							areaId: "",
						})
					: wiringReference(expression, project);
			if (to)
				add({
					from: ref,
					to,
					source: { ...source, field: `condition:${expression.id}` },
					label: logicConditionLabel(project, expression),
					access: "read",
				});
		};
		condition(rule.conditionTree);
		actions(ref, rule.actions, source, "THEN");
		actions(ref, rule.elseActions, source, "ELSE");
	});
	project.shops.forEach((shop) => {
		const ref: DialogueEntityRef = { kind: "shop", id: shop.id },
			source = entitySource(ref);
		add({
			from: ref,
			to: { kind: "item", id: shop.currencyItemId },
			source,
			label: "Shop uses currency",
			access: "read",
		});
		shop.entries.forEach(
			(entry, i) =>
				void add({
					from: ref,
					to: { kind: "item", id: entry.itemId },
					source: { ...source, field: `entry:${i}` },
					label: `Sells for ${entry.buyPrice}`,
					access: "write",
				}),
		);
	});
	// These joins are explicitly read-only suggestions, never execution edges.
	const supplies = relationships.filter(
		(e) =>
			e.kind === "reference" &&
			e.to.kind === "item" &&
			e.access === "write" &&
			["object", "pickup", "shop"].includes(e.from.kind),
	);
	for (const need of relationships.filter(
		(e) =>
			e.from.kind === "quest" && e.to.kind === "item" && e.access === "observe",
	)) {
		for (const supply of supplies.filter((e) => e.to.id === need.to.id))
			add({
				kind: "dependency",
				from: need.from,
				to: supply.from,
				source: supply.source,
				label: `Possible source of ${resolveDialogueEntity(project, need.to)?.name ?? need.to.id}`,
				warning:
					"Derived from existing item references. This relationship does not execute or enforce an order.",
			});
	}
	const outgoing = new Map<string, StoryRelationship[]>(),
		incoming = new Map<string, StoryRelationship[]>();
	for (const edge of relationships) {
		const from = entityKey(edge.from),
			to = entityKey(edge.to);
		outgoing.set(from, [...(outgoing.get(from) ?? []), edge]);
		incoming.set(to, [...(incoming.get(to) ?? []), edge]);
	}
	const index = { relationships, outgoing, incoming };
	cache.set(project, index);
	return index;
}
