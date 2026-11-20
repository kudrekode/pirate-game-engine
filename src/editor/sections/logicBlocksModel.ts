import {
	resolveEventInteraction,
	resolveObjectBehaviour,
} from "../../runtime/interactionDiscovery";
import type {
	ConditionExpression,
	ConditionGroup,
	GameProject,
	GameRule,
	RuleTrigger,
	SingleCondition,
} from "../../types/game";
import {
	conditionSummary,
	type DialogueEntityRef,
	dialogueEntities,
	type EntityOperation,
	entityCondition,
	entityOperations,
	placedDialogueNpc,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { makeDialogueId } from "./dialogueGraphModel";

export function findLogicExpression(
	root: ConditionExpression | undefined,
	id: string,
): ConditionExpression | undefined {
	if (!root || root.id === id) return root;
	if (root.type === "group")
		for (const child of root.conditions) {
			const found = findLogicExpression(child, id);
			if (found) return found;
		}
}
export function editLogicExpression(
	root: ConditionExpression,
	id: string,
	edit: (value: ConditionExpression) => ConditionExpression,
): ConditionExpression {
	if (root.id === id) return edit(root);
	return root.type === "group"
		? {
				...root,
				conditions: root.conditions.map((c) =>
					editLogicExpression(c, id, edit),
				),
			}
		: root;
}
export function removeLogicExpression(
	root: ConditionExpression | undefined,
	id: string,
): ConditionExpression | undefined {
	if (!root || root.id === id) return;
	return root.type === "group"
		? {
				...root,
				conditions: root.conditions
					.filter((c) => c.id !== id)
					.map((c) => removeLogicExpression(c, id)!),
			}
		: root;
}
export function logicGroup(
	operator: "AND" | "OR",
	conditions: ConditionExpression[] = [],
): ConditionGroup {
	return {
		id: makeDialogueId("condition_group"),
		type: "group",
		operator,
		conditions,
	};
}
export function appendLogicExpression(
	root: ConditionExpression | undefined,
	expression: ConditionExpression,
	groupId?: string,
): ConditionExpression {
	if (!root) return logicGroup("AND", [expression]);
	if (groupId)
		return editLogicExpression(root, groupId, (group) =>
			group.type === "group"
				? { ...group, conditions: [...group.conditions, expression] }
				: group,
		);
	return root.type === "group"
		? { ...root, conditions: [...root.conditions, expression] }
		: logicGroup("AND", [root, expression]);
}
/** Moving retains identity and rejects moving a group inside itself/descendants. */
export function moveLogicExpression(
	root: ConditionExpression,
	id: string,
	groupId: string,
	beforeId?: string,
): ConditionExpression {
	const moving = findLogicExpression(root, id),
		destination = findLogicExpression(root, groupId);
	if (
		!moving ||
		id === root.id ||
		destination?.type !== "group" ||
		findLogicExpression(moving, groupId) ||
		id === beforeId
	)
		return root;
	const removed = removeLogicExpression(root, id)!;
	return editLogicExpression(removed, groupId, (group) => {
		if (group.type !== "group") return group;
		const children = [...group.conditions],
			index = beforeId
				? children.findIndex((c) => c.id === beforeId)
				: children.length;
		children.splice(index < 0 ? children.length : index, 0, moving);
		return { ...group, conditions: children };
	});
}

export function logicConditionOptions(
	project: GameProject,
	ref: DialogueEntityRef,
): EntityOperation[] {
	if (ref.kind === "item" || ref.kind === "flag")
		return entityOperations("condition", ref.kind);
	if (ref.kind === "variable")
		return [{ id: "variable_compare", label: "Compare story value" }];
	if (ref.kind === "quest")
		return [
			{
				id: "unsupported",
				label: "Quest status checks are not supported in Logic yet.",
				disabled: true,
			},
		];
	if (ref.kind === "npc")
		return [
			{ id: "npc_alignment", label: "Character alignment is…" },
			{ id: "npc_health_compare", label: "Compare character health" },
			...(`npc_defeated_${ref.id}` in project.gameState.flags
				? [
						{
							id: "defeated",
							label: "Character is defeated",
							warning: `Reads the existing npc_defeated_${ref.id} flag; this is not a new predicate.`,
						},
					]
				: []),
		];
	return [];
}
export function makeLogicCondition(
	project: GameProject,
	ref: DialogueEntityRef,
	operation: string,
): SingleCondition | undefined {
	if (
		!resolveDialogueEntity(project, ref) ||
		!logicConditionOptions(project, ref).some(
			(o) => o.id === operation && !o.disabled,
		)
	)
		return;
	const id = makeDialogueId("condition");
	if (ref.kind === "npc") {
		if (operation === "defeated")
			return {
				id,
				type: "flag_is",
				flag: `npc_defeated_${ref.id}`,
				value: true,
			};
		if (operation === "npc_health_compare")
			return {
				id,
				type: "npc_health_compare",
				npcId: ref.id,
				operator: "<=",
				value: 0,
			};
		return { id, type: "npc_alignment", npcId: ref.id, alignment: "friendly" };
	}
	const condition = entityCondition(project, ref, operation);
	if (condition && condition.type !== "quest_status")
		return { ...condition, id };
}
export function logicConditionLabel(
	project: GameProject,
	c: SingleCondition,
): string {
	if (c.type === "npc_alignment" || c.type === "npc_health_compare") {
		const npc = dialogueEntities(project).find(
			(e) => e.ref.kind === "npc" && e.ref.id === c.npcId,
		);
		return `${npc?.label ?? `Missing character: ${c.npcId}`} ${c.type === "npc_alignment" ? `is ${c.alignment}` : `health ${c.operator} ${c.value}`}`;
	}
	if (
		c.type === "flag_is" &&
		c.flag.startsWith("npc_defeated_") &&
		c.flag in project.gameState.flags
	) {
		const npc = dialogueEntities(project).find(
			(e) => e.ref.kind === "npc" && `npc_defeated_${e.ref.id}` === c.flag,
		);
		if (npc)
			return `${npc.label} is defeated: ${c.value ? "Yes" : "No"} (existing story state)`;
	}
	return conditionSummary(c, project);
}

export function triggerEntityOptions(
	project: GameProject,
	ref: DialogueEntityRef,
): EntityOperation[] {
	if (ref.kind === "area")
		return [{ id: "on_area_enter", label: "Player enters area" }];
	if (ref.kind === "cutscene")
		return [{ id: "on_cutscene_end", label: "Story moment finishes" }];
	if (ref.kind === "npc")
		return [
			{
				id: "on_interact",
				label: "Player interacts with character",
				warning: placedDialogueNpc(project, ref)?.attributes.canInteract
					? undefined
					: "Enable this character’s interaction on the Map before Play.",
			},
		];
	if (ref.kind === "structure")
		return [{ id: "on_interact", label: "Player interacts with target" }];
	if (ref.kind === "object" || ref.kind === "event") {
		const object =
			ref.kind === "object"
				? project.areas
						.find((a) => a.id === ref.areaId)
						?.objects.find((o) => o.id === ref.id)
				: undefined;
		const blocked =
			object &&
			(object.blocksMovement ??
				project.objects.find((d) => d.id === object.objectDefinitionId)
					?.blocksMovement);
		return [
			{ id: "on_interact", label: "Player interacts with target" },
			...(!blocked ? [{ id: "on_touch", label: "Player touches target" }] : []),
		];
	}
	return [];
}
export function makeEntityTrigger(
	project: GameProject,
	ref: DialogueEntityRef,
	operation: string,
): RuleTrigger | undefined {
	if (
		!resolveDialogueEntity(project, ref) ||
		!triggerEntityOptions(project, ref).some((o) => o.id === operation)
	)
		return;
	if (ref.kind === "area") return { type: "on_area_enter", areaId: ref.id };
	if (ref.kind === "cutscene")
		return { type: "on_cutscene_end", cutsceneId: ref.id };
	return operation === "on_touch"
		? { type: "on_touch", targetId: ref.id }
		: { type: "on_interact", targetId: ref.id };
}
export function triggerReference(
	project: GameProject,
	trigger: RuleTrigger,
): DialogueEntityRef | undefined {
	if ("areaId" in trigger) return { kind: "area", id: trigger.areaId };
	if ("cutsceneId" in trigger)
		return { kind: "cutscene", id: trigger.cutsceneId };
	if ("targetId" in trigger)
		return (
			dialogueEntities(project).find(
				(e) => "areaId" in e.ref && e.ref.id === trigger.targetId,
			)?.ref ?? { kind: "object", areaId: "", id: trigger.targetId }
		);
}
export function triggerLabel(
	project: GameProject,
	trigger: RuleTrigger,
): string {
	const ref = triggerReference(project, trigger),
		name = ref
			? (resolveDialogueEntity(project, ref)?.label ??
				`Missing target: ${ref.id}`)
			: "";
	return trigger.type === "on_game_start"
		? "When a new game starts"
		: trigger.type === "on_interact"
			? `Player interacts with ${name}`
			: trigger.type === "on_touch"
				? `Player touches ${name}`
				: trigger.type === "on_area_enter"
					? `Player enters ${name}`
					: `${name} finishes`;
}
export function directBehaviourWarning(
	project: GameProject,
	trigger: RuleTrigger,
): string | undefined {
	if (trigger.type !== "on_interact" && trigger.type !== "on_touch") return;
	const ref = triggerReference(project, trigger);
	let direct = false;
	if (ref?.kind === "npc")
		direct = Boolean(placedDialogueNpc(project, ref)?.interaction);
	if (ref?.kind === "object") {
		const object = project.areas
			.find((a) => a.id === ref.areaId)
			?.objects.find((o) => o.id === ref.id);
		if (object)
			direct =
				resolveObjectBehaviour(project, object).type !== "none" ||
				Boolean(
					object.interaction ??
						project.objects.find((d) => d.id === object.objectDefinitionId)
							?.defaultInteraction,
				);
	}
	if (ref?.kind === "event") {
		const event = project.areas
			.find((a) => a.id === ref.areaId)
			?.eventBlocks.find((e) => e.id === ref.id);
		direct = Boolean(event && resolveEventInteraction(event));
	}
	if (ref?.kind === "structure")
		direct = Boolean(
			project.areas
				.find((a) => a.id === ref.areaId)
				?.structures.find((s) => s.id === ref.id)?.interaction,
		);
	return direct
		? "This rule runs in addition to the target’s direct interaction. Conditions do not cancel or gate that behavior."
		: undefined;
}

export type LogicRecipeInput = {
	kind: "locked" | "npc";
	target: DialogueEntityRef;
	itemId?: string;
	flag?: string;
	destination?: DialogueEntityRef;
	cutsceneId: string;
};
export function makeLogicRecipe(
	project: GameProject,
	input: LogicRecipeInput,
): GameRule | undefined {
	const trigger = makeEntityTrigger(project, input.target, "on_interact");
	if (!trigger || !project.cutscenes.some((c) => c.id === input.cutsceneId))
		return;
	const name = resolveDialogueEntity(project, input.target)?.name ?? "Target";
	if (input.kind === "locked") {
		const condition = makeLogicCondition(
			project,
			{ kind: "item", id: input.itemId ?? "" },
			"has_item",
		);
		if (
			!condition ||
			input.destination?.kind !== "event" ||
			!resolveDialogueEntity(project, input.destination)
		)
			return;
		return {
			id: makeDialogueId("rule"),
			name: `Locked passage: ${name}`,
			enabled: true,
			runPolicy: "always",
			trigger,
			conditionTree: logicGroup("AND", [condition]),
			actions: [
				{
					type: "teleport",
					areaId: input.destination.areaId,
					eventBlockId: input.destination.id,
				},
			],
			elseActions: [{ type: "play_cutscene", cutsceneId: input.cutsceneId }],
		};
	}
	if (input.target.kind !== "npc") return;
	const condition = makeLogicCondition(
		project,
		{ kind: "flag", id: input.flag ?? "" },
		"false",
	);
	return condition
		? {
				id: makeDialogueId("rule"),
				name: `Conditional interaction: ${name}`,
				enabled: true,
				runPolicy: "always",
				trigger,
				conditionTree: logicGroup("AND", [condition]),
				actions: [{ type: "play_cutscene", cutsceneId: input.cutsceneId }],
				elseActions: [],
			}
		: undefined;
}
