import { resolveObjectBehaviour } from "../../runtime/interactionDiscovery";
import type { EditorSource } from "../../store/useProjectStore";
import type {
	GameAction,
	GameProject,
	Objective,
	ObjectiveCondition,
	Quest,
} from "../../types/game";
import {
	type DialogueEntityRef,
	dialogueEntities,
	type EntityOperation,
	placedDialogueNpc,
	resolveDialogueEntity,
} from "./dialogueEntities";
import { makeDialogueId } from "./dialogueGraphModel";

export function objectiveReference(
	project: GameProject,
	condition: ObjectiveCondition,
): DialogueEntityRef {
	if ("targetId" in condition)
		return (
			dialogueEntities(project).find(
				(e) =>
					"areaId" in e.ref &&
					e.ref.areaId === condition.areaId &&
					e.ref.id === condition.targetId,
			)?.ref ?? {
				kind:
					condition.type === "interaction_completed"
						? "npc"
						: condition.type === "enter_event"
							? "event"
							: "object",
				id: condition.targetId,
				areaId: condition.areaId,
			}
		);
	if (condition.type === "has_item")
		return { kind: "item", id: condition.itemId };
	if (condition.type === "flag") return { kind: "flag", id: condition.flag };
	if (condition.type === "variable_compare")
		return { kind: "variable", id: condition.variable };
	return { kind: "area", id: condition.areaId };
}

export function questEntityOptions(
	project: GameProject,
	ref: DialogueEntityRef,
): EntityOperation[] {
	if (ref.kind === "item") return [{ id: "has_item", label: "Have item" }];
	if (ref.kind === "flag")
		return [true, false].map((value) => ({
			id: String(value),
			label: `Story state is ${value ? "Yes" : "No"}`,
		}));
	if (ref.kind === "event")
		return [{ id: "enter_event", label: "Reach event point" }];
	if (ref.kind === "area") return [{ id: "enter_area", label: "Enter area" }];
	if (ref.kind === "npc") {
		const npc = placedDialogueNpc(project, ref);
		const interaction = npc?.interaction;
		const canTalk =
			npc?.attributes.canInteract &&
			interaction?.activationMode !== "disabled" &&
			(interaction?.type === "show_message" ||
				(interaction?.type === "start_dialogue" &&
					project.dialogues.some((d) => d.id === interaction.dialogueId)));
		return [
			{
				id: "interaction_completed",
				label: "Finish talking",
				disabled: !canTalk,
				warning: canTalk
					? undefined
					: "This character needs an enabled conversation or message interaction to finish talking. Open its assignment on the Map.",
			},
		];
	}
	if (ref.kind === "object") {
		const object = project.areas
			.find((a) => a.id === ref.areaId)
			?.objects.find((o) => o.id === ref.id);
		if (!object) return [];
		const behaviour = resolveObjectBehaviour(project, object);
		const interaction =
			object.interaction ??
			project.objects.find((d) => d.id === object.objectDefinitionId)
				?.defaultInteraction;
		const disabledBehaviour =
			interaction?.type === "object_behaviour" &&
			interaction.activationMode === "disabled";
		if (behaviour.type === "container")
			return [
				{
					id: "container_opened",
					label: "Open container",
					disabled: disabledBehaviour,
					warning: disabledBehaviour
						? "This container's interaction is disabled. Enable it on the Map."
						: undefined,
				},
			];
		if (behaviour.type === "door") {
			const valid = project.areas
				.find((a) => a.id === behaviour.targetAreaId)
				?.eventBlocks.some((e) => e.id === behaviour.targetEventBlockId);
			return [
				{
					id: "door_used",
					label: "Successfully use door",
					disabled: !valid || disabledBehaviour,
					warning: disabledBehaviour
						? "This Door's interaction is disabled. Enable it on the Map."
						: valid
							? undefined
							: "This Door has no valid arrival point. Configure its destination on the Map.",
				},
			];
		}
		if (
			interaction?.type === "show_message" ||
			interaction?.type === "start_dialogue"
		) {
			const valid =
				interaction.activationMode !== "disabled" &&
				(interaction.type === "show_message" ||
					project.dialogues.some((d) => d.id === interaction.dialogueId));
			return [
				{
					id: "interaction_completed",
					label: "Finish interaction",
					disabled: !valid,
					warning: valid
						? undefined
						: "This object needs an enabled message or valid conversation. Configure it on the Map.",
				},
			];
		}
	}
	return [];
}

export function makeEntityObjective(
	project: GameProject,
	ref: DialogueEntityRef,
	operation: string,
): Objective | undefined {
	if (
		!resolveDialogueEntity(project, ref) ||
		!questEntityOptions(project, ref).some(
			(o) => o.id === operation && !o.disabled,
		)
	)
		return;
	let condition: ObjectiveCondition;
	if (ref.kind === "item")
		condition = { type: "has_item", itemId: ref.id, quantity: 1 };
	else if (ref.kind === "flag")
		condition = { type: "flag", flag: ref.id, value: operation !== "false" };
	else if (ref.kind === "area")
		condition = { type: "enter_area", areaId: ref.id };
	else if (
		"areaId" in ref &&
		[
			"interaction_completed",
			"container_opened",
			"door_used",
			"enter_event",
		].includes(operation)
	)
		condition = {
			type: operation as "interaction_completed",
			areaId: ref.areaId,
			targetId: ref.id,
		};
	else return;
	return {
		id: makeDialogueId("objective"),
		description: objectiveSummary(project, condition),
		condition,
	};
}

export function objectiveSummary(
	project: GameProject,
	c: ObjectiveCondition,
): string {
	const ref = objectiveReference(project, c),
		entity = resolveDialogueEntity(project, ref);
	const name = entity?.label ?? `Missing ${ref.kind}: ${ref.id}`;
	switch (c.type) {
		case "interaction_completed":
			return `Finish talking to ${name}`;
		case "container_opened":
			return `Open ${name}`;
		case "door_used":
			return `Successfully use ${name}`;
		case "enter_event":
			return `Reach ${name}`;
		case "enter_area":
			return `Enter ${name}`;
		case "has_item":
			return `Have ${name} ×${c.quantity ?? 1}`;
		case "flag":
			return `${name} is ${c.value ? "Yes" : "No"}`;
		case "variable_compare":
			return `${name} ${c.operator} ${JSON.stringify(c.value)}`;
	}
}

export const objectiveHints: Record<ObjectiveCondition["type"], string> = {
	interaction_completed:
		"Completes when this conversation/message is closed. Earlier conversations are remembered, including early close.",
	has_item: "Checks current inventory until completed; then stays complete.",
	container_opened:
		"Requires a successful real container opening. Earlier openings are remembered.",
	door_used:
		"Requires a successful native door transition. Rule teleport does not produce this fact.",
	enter_event:
		"Reaching this point is remembered, even before this step becomes active.",
	enter_area:
		"Entering this area is remembered, even before this quest starts.",
	flag: "Checks the current Yes/No state, then latches on completion.",
	variable_compare: "Checks the current value, then latches on completion.",
};

export function objectiveWarnings(
	project: GameProject,
	quest: Quest,
	objective: Objective,
): string[] {
	const ref = objectiveReference(project, objective.condition);
	if (!resolveDialogueEntity(project, ref))
		return [
			`Missing ${ref.kind}: ${ref.id}. Replace the reference in Advanced.`,
		];
	const warnings: string[] = [];
	if ("targetId" in objective.condition) {
		const operation = questEntityOptions(project, ref).find(
			(o) => o.id === objective.condition.type,
		);
		if (!operation || operation.disabled)
			warnings.push(
				operation?.warning ??
					"The target no longer supports this objective. Open its source to configure its real behavior.",
			);
		if (
			quest.objectiveMode === "sequence" &&
			quest.objectives
				.slice(0, quest.objectives.indexOf(objective))
				.some(
					(o) =>
						JSON.stringify(o.condition) === JSON.stringify(objective.condition),
				)
		)
			warnings.push(
				"This target may already have been used before this step becomes active. A repeated historical fact does not mean ‘again later’.",
			);
	}
	return warnings;
}

export function makeFetchObjectives(
	project: GameProject,
	character: DialogueEntityRef,
	item: DialogueEntityRef,
): Objective[] | undefined {
	const talk = makeEntityObjective(project, character, "interaction_completed"),
		have = makeEntityObjective(project, item, "has_item");
	return talk && have ? [talk, have] : undefined;
}

export function questStartSources(
	project: GameProject,
	questId: string,
): { label: string; source: EditorSource }[] {
	const sources: { label: string; source: EditorSource }[] = [];
	const inspect = (
		actions: GameAction[] | undefined,
		label: string,
		source: EditorSource,
	) =>
		actions?.forEach((action, index) => {
			if (action.type === "activate_quest" && action.questId === questId)
				sources.push({
					label,
					source: { ...source, field: `${source.field ?? "actions"}:${index}` },
				});
		});
	project.dialogues.forEach(
		(d) =>
			void d.nodes.forEach(
				(n) =>
					void inspect(
						n.actions,
						`${d.name} → ${n.text?.slice(0, 60) || n.type}`,
						{
							section: "dialogues",
							id: d.id,
							nodeId: n.id,
							field: "actions",
						},
					),
			),
	);
	project.rules.forEach((r) => {
		inspect(r.actions, `${r.name} → THEN`, {
			section: "progression",
			id: r.id,
			field: "THEN",
		});
		inspect(r.elseActions, `${r.name} → ELSE`, {
			section: "progression",
			id: r.id,
			field: "ELSE",
		});
	});
	project.quests.forEach(
		(q) =>
			void inspect(q.completionActions, `${q.name} → Completion`, {
				section: "quests",
				id: q.id,
				field: "Completion",
			}),
	);
	project.areas.forEach((a) => {
		a.npcs.forEach(
			(n) =>
				void inspect(
					placedDialogueNpc(project, { kind: "npc", id: n.id, areaId: a.id })
						?.interaction?.completionActions,
					`${resolveDialogueEntity(project, { kind: "npc", id: n.id, areaId: a.id })?.label} → Interaction completion`,
					{ section: "map", id: n.id, areaId: a.id },
				),
		);
		a.objects.forEach(
			(o) =>
				void inspect(
					(
						o.interaction ??
						project.objects.find((d) => d.id === o.objectDefinitionId)
							?.defaultInteraction
					)?.completionActions,
					`${o.nameOverride ?? "Object"} — ${a.name} → Interaction completion`,
					{ section: "map", id: o.id, areaId: a.id },
				),
		);
		[...a.eventBlocks, ...a.structures].forEach(
			(e) =>
				void inspect(
					e.interaction?.completionActions,
					`${e.name} — ${a.name} → Interaction completion`,
					{ section: "map", id: e.id, areaId: a.id },
				),
		);
	});
	return sources;
}
