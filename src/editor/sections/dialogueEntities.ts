import { backgroundPresets } from "../../data/presets";
import { resolveObjectBehaviour } from "../../runtime/interactionDiscovery";
import { itemIcon } from "../../runtime/itemPresentation";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import type {
	DialogueCondition,
	GameAction,
	GameProject,
	ItemDefinition,
	NPCInstance,
} from "../../types/game";
import { makeDialogueId } from "./dialogueGraphModel";

// References for authoring only. Deliberately distinct from asset-placement drags.
export const DIALOGUE_ENTITY_MIME = "application/x-adventure-dialogue-entity";
export type DialogueEntityRef =
	| {
			kind: "npc" | "object" | "event" | "pickup" | "structure";
			id: string;
			areaId: string;
	  }
	| {
			kind:
				| "item"
				| "quest"
				| "flag"
				| "variable"
				| "area"
				| "cutscene"
				| "shop"
				| "dialogue"
				| "rule";
			id: string;
	  };
export type DialogueEntity = {
	ref: DialogueEntityRef;
	name: string;
	label: string;
	icon: string;
	detail: string;
};
export type EntitySlot =
	| "condition"
	| "action"
	| "speaker"
	| "assignment"
	| "objective"
	| "logic-condition"
	| "logic-action"
	| "trigger";
export const entityKey = (ref: DialogueEntityRef) =>
	JSON.stringify(
		"areaId" in ref ? [ref.kind, ref.areaId, ref.id] : [ref.kind, ref.id],
	);
export const storyName = (key: string) =>
	key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function buildDialogueEntities(project: GameProject): DialogueEntity[] {
	return [
		...project.areas.flatMap((area): DialogueEntity[] => [
			{
				ref: { kind: "area", id: area.id },
				name: area.name,
				label: area.name,
				icon: "◇",
				detail: "Area",
			},
			...area.objects.map((object): DialogueEntity => {
				const definition = project.objects.find(
					(d) => d.id === object.objectDefinitionId,
				);
				const name =
					object.nameOverride ||
					definition?.name ||
					"Missing object definition";
				const behaviour = resolveObjectBehaviour(project, object);
				return {
					ref: { kind: "object", id: object.id, areaId: area.id },
					name,
					label: `${name} — ${area.name} (${object.x}, ${object.y})`,
					icon: behaviour.type === "door" ? "▯" : "▣",
					detail: `World object · ${behaviour.type}`,
				};
			}),
			...area.eventBlocks.map(
				(event): DialogueEntity => ({
					ref: { kind: "event", id: event.id, areaId: area.id },
					name: event.name,
					label: `${event.name} — ${area.name} (${event.x}, ${event.y})`,
					icon: "◎",
					detail: "Arrival / event point",
				}),
			),
			...area.structures.map(
				(structure): DialogueEntity => ({
					ref: { kind: "structure", id: structure.id, areaId: area.id },
					name: structure.name,
					label: `${structure.name} — ${area.name} (${structure.x}, ${structure.y})`,
					icon: "▥",
					detail: "Placed structure",
				}),
			),
			...area.pickups.map((pickup): DialogueEntity => {
				const name =
					project.items.find((i) => i.id === pickup.itemId)?.name ??
					`Missing item: ${pickup.itemId}`;
				return {
					ref: { kind: "pickup", id: pickup.id, areaId: area.id },
					name,
					label: `${name} pickup — ${area.name} (${pickup.x}, ${pickup.y})`,
					icon: "◆",
					detail: `Physical pickup · ×${pickup.quantity}`,
				};
			}),
		]),
		...project.dialogues.map(
			(d): DialogueEntity => ({
				ref: { kind: "dialogue", id: d.id },
				name: d.name,
				label: d.name,
				icon: "☏",
				detail: `Conversation · ${d.nodes.length} nodes`,
			}),
		),
		...project.rules.map(
			(r): DialogueEntity => ({
				ref: { kind: "rule", id: r.id },
				name: r.name,
				label: r.name,
				icon: "⚙",
				detail: `Logic rule · ${r.enabled ? "Enabled" : "Disabled"}`,
			}),
		),
		...project.cutscenes.map(
			(c): DialogueEntity => ({
				ref: { kind: "cutscene", id: c.id },
				name: c.name,
				label: c.name,
				icon: "▶",
				detail: "Story moment",
			}),
		),
		...project.shops.map(
			(s): DialogueEntity => ({
				ref: { kind: "shop", id: s.id },
				name: s.name,
				label: s.name,
				icon: "¤",
				detail: "Shop",
			}),
		),
		...project.areas.flatMap((area) =>
			area.npcs.map((npc): DialogueEntity => {
				const resolved = resolveNPCInstance(
					project.npcs.find((n) => n.id === npc.npcDefinitionId),
					npc,
				);
				return {
					ref: { kind: "npc", id: npc.id, areaId: area.id },
					name: resolved.name,
					label: `${resolved.name} — ${area.name} (${npc.x}, ${npc.y})`,
					icon: "♙",
					detail: "Placed character",
				};
			}),
		),
		...project.items.map(
			(item): DialogueEntity => ({
				ref: { kind: "item", id: item.id },
				name: item.name,
				label: item.name,
				icon: itemIcon(item),
				detail: `Item · ${item.category}`,
			}),
		),
		...project.quests.map(
			(quest): DialogueEntity => ({
				ref: { kind: "quest", id: quest.id },
				name: quest.name,
				label: quest.name,
				icon: "▤",
				detail: `Quest · Initially ${quest.status} · ${quest.objectives.length ? `${quest.objectives.length} objectives: ${quest.objectives[0].description}` : "Unfinished: no objectives"}`,
			}),
		),
		...Object.entries(project.gameState.flags).map(
			([id, value]): DialogueEntity => ({
				ref: { kind: "flag", id },
				name: storyName(id),
				label: storyName(id),
				icon: "⚑",
				detail: `Story state · Initially ${value ? "Yes" : "No"}`,
			}),
		),
		...Object.entries(project.gameState.variables).map(
			([id, value]): DialogueEntity => ({
				ref: { kind: "variable", id },
				name: storyName(id),
				label: storyName(id),
				icon: "#",
				detail: `Story value · ${typeof value === "number" ? "Number" : "Text"}`,
			}),
		),
	];
}

// Store projects are immutable snapshots. Draft mutation helpers invalidate before
// adding records; graph pointer movement and local searches reuse this index.
const catalogs = new WeakMap<
	GameProject,
	{ entities: DialogueEntity[]; byKey: Map<string, DialogueEntity> }
>();
export function dialogueEntities(project: GameProject): DialogueEntity[] {
	let catalog = catalogs.get(project);
	if (!catalog) {
		const entities = buildDialogueEntities(project);
		catalog = {
			entities,
			byKey: new Map(entities.map((e) => [entityKey(e.ref), e])),
		};
		catalogs.set(project, catalog);
	}
	return catalog.entities;
}

export function resolveDialogueEntity(
	project: GameProject,
	ref: DialogueEntityRef,
) {
	dialogueEntities(project);
	return catalogs.get(project)!.byKey.get(entityKey(ref));
}

export function readDialogueEntity(raw: string): DialogueEntityRef | undefined {
	try {
		const value: unknown = JSON.parse(raw);
		if (
			!value ||
			typeof value !== "object" ||
			!("kind" in value) ||
			!("id" in value) ||
			typeof value.id !== "string" ||
			!value.id
		)
			return;
		if (
			(value.kind === "npc" ||
				value.kind === "object" ||
				value.kind === "event" ||
				value.kind === "pickup" ||
				value.kind === "structure") &&
			"areaId" in value &&
			typeof value.areaId === "string" &&
			value.areaId
		)
			return { kind: value.kind, id: value.id, areaId: value.areaId };
		if (
			value.kind === "item" ||
			value.kind === "quest" ||
			value.kind === "flag" ||
			value.kind === "variable" ||
			value.kind === "area" ||
			value.kind === "cutscene" ||
			value.kind === "shop" ||
			value.kind === "dialogue" ||
			value.kind === "rule"
		)
			return { kind: value.kind, id: value.id };
	} catch {
		/* External/asset-placement drags are not entity references. */
	}
}

export function acceptsEntity(slot: EntitySlot, ref: DialogueEntityRef) {
	if (slot === "speaker" || slot === "assignment") return ref.kind === "npc";
	if (slot === "objective")
		return ["npc", "object", "event", "area", "item", "flag"].includes(
			ref.kind,
		);
	if (slot === "logic-condition")
		return ["item", "flag", "variable", "npc"].includes(ref.kind);
	if (slot === "logic-action")
		return [
			"item",
			"quest",
			"flag",
			"variable",
			"npc",
			"event",
			"cutscene",
			"shop",
		].includes(ref.kind);
	if (slot === "trigger")
		return ["npc", "object", "event", "structure", "area", "cutscene"].includes(
			ref.kind,
		);
	return ref.kind === "item" || ref.kind === "quest" || ref.kind === "flag";
}

export type EntityOperation = {
	id: string;
	label: string;
	warning?: string;
	disabled?: boolean;
};
export function entityOperations(
	slot: EntitySlot,
	kind: DialogueEntityRef["kind"],
	variableValue?: string | number,
): EntityOperation[] {
	const condition = slot === "condition";
	if (kind === "item")
		return condition
			? [
					{ id: "has_item", label: "Have item" },
					{ id: "not_has_item", label: "Do not have item" },
				]
			: [
					{ id: "give_item", label: "Give item" },
					{ id: "remove_item", label: "Remove item" },
				];
	if (kind === "quest")
		return condition
			? ["inactive", "active", "completed", "failed"].map((id) => ({
					id,
					label: `Quest is ${id}`,
				}))
			: [
					{ id: "activate_quest", label: "Start quest" },
					{ id: "complete_quest", label: "Complete quest" },
					{ id: "fail_quest", label: "Fail quest" },
				];
	if (kind === "flag")
		return [true, false].map((value) => ({
			id: String(value),
			label: `${condition ? "Story state is" : "Remember"} ${value ? "Yes" : "No"}`,
		}));
	if (slot === "logic-action") {
		if (kind === "variable")
			return [
				{ id: "set_variable", label: "Set story value" },
				{
					id: "change_variable",
					label: "Change number",
					disabled: typeof variableValue === "string",
					warning:
						typeof variableValue === "string"
							? "This story value contains text. Use Set story value."
							: undefined,
				},
			];
		if (kind === "npc")
			return [
				{ id: "set_npc_alignment", label: "Change alignment" },
				{ id: "set_npc_health", label: "Set health" },
			];
		if (kind === "event")
			return [{ id: "teleport", label: "Go to arrival point" }];
		if (kind === "cutscene")
			return [{ id: "play_cutscene", label: "Play story moment" }];
		if (kind === "shop") return [{ id: "open_shop", label: "Open shop" }];
	}
	return [];
}

export function entityCondition(
	project: GameProject,
	ref: DialogueEntityRef,
	operation?: string,
): DialogueCondition | undefined {
	if (!resolveDialogueEntity(project, ref)) return;
	switch (ref.kind) {
		case "item":
			return {
				type: operation === "not_has_item" ? "not_has_item" : "has_item",
				itemId: ref.id,
				quantity: 1,
			};
		case "quest":
			return {
				type: "quest_status",
				questId: ref.id,
				status:
					operation === "inactive" ||
					operation === "completed" ||
					operation === "failed"
						? operation
						: "active",
			};
		case "flag":
			return { type: "flag_is", flag: ref.id, value: operation !== "false" };
		case "variable":
			return {
				type: "variable_compare",
				variable: ref.id,
				operator: "==",
				value: project.gameState.variables[ref.id],
			};
	}
}
export function entityAction(
	project: GameProject,
	ref: DialogueEntityRef,
	operation?: string,
): GameAction | undefined {
	if (!resolveDialogueEntity(project, ref)) return;
	switch (ref.kind) {
		case "item":
			return {
				type: operation === "remove_item" ? "remove_item" : "give_item",
				itemId: ref.id,
				quantity: 1,
			};
		case "quest":
			return {
				type:
					operation === "complete_quest" || operation === "fail_quest"
						? operation
						: "activate_quest",
				questId: ref.id,
			};
		case "flag":
			return { type: "set_flag", flag: ref.id, value: operation !== "false" };
		case "variable":
			if (operation === "change_variable")
				return typeof project.gameState.variables[ref.id] === "number"
					? { type: "change_variable", variable: ref.id, amount: 1 }
					: undefined;
			return {
				type: "set_variable",
				variable: ref.id,
				value: project.gameState.variables[ref.id],
			};
		case "npc":
			if (operation === "set_npc_health")
				return { type: "set_npc_health", npcId: ref.id, value: 100 };
			return {
				type: "set_npc_alignment",
				npcId: ref.id,
				alignment: "friendly",
			};
		case "event":
			return { type: "teleport", areaId: ref.areaId, eventBlockId: ref.id };
		case "cutscene":
			return { type: "play_cutscene", cutsceneId: ref.id };
		case "shop":
			return { type: "open_shop", shopId: ref.id };
	}
}

export type DialogueWiringTarget = {
	dialogueId: string;
	nodeId: string;
	slot: "condition" | "action" | "speaker";
	choiceId?: string;
};
export function hasWiringTarget(
	project: GameProject,
	target: DialogueWiringTarget,
) {
	const node = project.dialogues
		.find((d) => d.id === target.dialogueId)
		?.nodes.find((n) => n.id === target.nodeId);
	return Boolean(
		node &&
			(target.slot !== "condition" ||
				(node.type === "choice" &&
					node.choices.some((c) => c.id === target.choiceId))),
	);
}
export function insertDialogueEntity(
	project: GameProject,
	target: DialogueWiringTarget,
	ref: DialogueEntityRef,
	operation?: string,
) {
	const node = project.dialogues
		.find((d) => d.id === target.dialogueId)
		?.nodes.find((n) => n.id === target.nodeId);
	if (!node || !acceptsEntity(target.slot, ref)) return;
	const entity = resolveDialogueEntity(project, ref);
	if (!entity) return;
	if (target.slot === "speaker") node.speaker = entity.name;
	if (target.slot === "action") {
		const action = entityAction(project, ref, operation);
		if (action) node.actions = [...(node.actions ?? []), action];
	}
	if (target.slot === "condition" && node.type === "choice") {
		const choice = node.choices.find((c) => c.id === target.choiceId);
		const condition = entityCondition(project, ref, operation);
		if (choice && condition)
			choice.conditions = [...(choice.conditions ?? []), condition];
	}
}

export function wiringReference(
	value: DialogueCondition | GameAction,
	project: GameProject,
): DialogueEntityRef | undefined {
	if ("cutsceneId" in value) return { kind: "cutscene", id: value.cutsceneId };
	if ("shopId" in value) return { kind: "shop", id: value.shopId };
	if (value.type === "teleport")
		return { kind: "event", id: value.eventBlockId, areaId: value.areaId };
	if ("itemId" in value) return { kind: "item", id: value.itemId };
	if ("questId" in value) return { kind: "quest", id: value.questId };
	if ("flag" in value) return { kind: "flag", id: value.flag };
	if ("variable" in value) return { kind: "variable", id: value.variable };
	if ("npcId" in value)
		return {
			kind: "npc",
			id: value.npcId,
			areaId:
				project.areas.find((a) => a.npcs.some((n) => n.id === value.npcId))
					?.id ?? "",
		};
}

export function conditionSummary(
	c: DialogueCondition,
	project: GameProject,
): string {
	const ref = wiringReference(c, project)!;
	const name =
		resolveDialogueEntity(project, ref)?.label ??
		`Missing ${ref.kind}: ${ref.id || "(unset)"}`;
	if (c.type === "flag_is") return `${name}: ${c.value ? "Yes" : "No"}`;
	if (c.type === "variable_compare")
		return `${name} ${c.operator} ${JSON.stringify(c.value)}`;
	if (c.type === "quest_status") return `${name}: ${c.status}`;
	return `${c.type === "has_item" ? "Have" : "Do not have"} ${name} ×${c.quantity ?? 1}`;
}
export function dialogueLegacyFallback(
	a: GameAction,
	project: GameProject,
): string | undefined {
	if (a.type === "give_item" && !a.itemId) {
		const currencies = project.items.filter((i) => i.category === "currency");
		if (currencies.length === 1) return currencies[0].name;
	}
	if (a.type === "open_shop" && !a.shopId && project.shops.length === 1)
		return project.shops[0].name;
}

export function actionSummary(a: GameAction, project: GameProject): string {
	const fallback = dialogueLegacyFallback(a, project);
	if (fallback && a.type === "give_item")
		return `Give ${fallback} ×${a.quantity} (legacy fallback)`;
	if (fallback && a.type === "open_shop")
		return `Open ${fallback} (legacy fallback)`;
	const ref = wiringReference(a, project);
	const name = ref
		? (resolveDialogueEntity(project, ref)?.label ??
			`Missing ${ref.kind}: ${ref.id || "(unset)"}`)
		: "";
	if (a.type === "set_flag")
		return `Remember ${name}: ${a.value ? "Yes" : "No"}`;
	if (a.type === "set_variable")
		return `Set ${name} = ${JSON.stringify(a.value)}`;
	if (a.type === "change_variable") return `Change ${name} by ${a.amount}`;
	if (a.type === "give_item" || a.type === "remove_item")
		return `${a.type === "give_item" ? "Give" : "Remove"} ${name} ×${a.quantity}`;
	if ("questId" in a)
		return `${a.type === "activate_quest" ? "Start" : a.type === "complete_quest" ? "Complete" : "Fail"} ${name}`;
	if (a.type === "set_npc_alignment") return `Set ${name}: ${a.alignment}`;
	if (a.type === "set_npc_health") return `Set ${name} health: ${a.value}`;
	if (a.type === "teleport")
		return `Teleport: ${project.areas.find((area) => area.id === a.areaId)?.name ?? a.areaId} / ${project.areas.find((area) => area.id === a.areaId)?.eventBlocks.find((e) => e.id === a.eventBlockId)?.name ?? a.eventBlockId}`;
	if (a.type === "play_cutscene")
		return `Play ${project.cutscenes.find((c) => c.id === a.cutsceneId)?.name ?? `Missing cutscene: ${a.cutsceneId}`}`;
	if (a.type === "open_shop")
		return `Open ${project.shops.find((s) => s.id === a.shopId)?.name ?? `Missing shop: ${a.shopId}`}`;
	if (a.type === "change_movement_mode") return `Movement: ${a.mode}`;
	return "End game";
}

export function storyKey(name: string, project: GameProject) {
	let base =
		name
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || "story_state";
	if (!/^[a-z]/.test(base)) base = `story_${base}`;
	let key = base;
	for (
		let n = 2;
		key in project.gameState.flags || key in project.gameState.variables;
		n++
	)
		key = `${base}_${n}`;
	return key;
}
export type NewDialogueEntity = {
	kind: "item" | "quest" | "flag" | "variable" | "cutscene";
	name: string;
	category: ItemDefinition["category"];
	value: boolean | string | number;
	description: string;
};

/** Mutates only a store draft; callers combine creation and insertion in one update. */
export function createDialogueEntity(
	project: GameProject,
	draft: NewDialogueEntity,
): DialogueEntityRef {
	const name = draft.name.trim();
	if (!name) throw new Error("Enter an entity name.");
	catalogs.delete(project);
	if (draft.kind === "flag" || draft.kind === "variable") {
		const id = storyKey(name, project);
		if (draft.kind === "flag")
			project.gameState.flags[id] = draft.value === true;
		else
			project.gameState.variables[id] =
				typeof draft.value === "boolean" ? 0 : draft.value;
		return { kind: draft.kind, id };
	}
	const id = makeDialogueId(draft.kind);
	if (draft.kind === "cutscene") {
		project.cutscenes.push({
			id,
			name,
			text: draft.description,
			backgroundImageId: backgroundPresets[0]?.id ?? "",
		});
		return { kind: "cutscene", id };
	}
	if (draft.kind === "item")
		project.items.push({
			id,
			name,
			description: draft.description,
			category: draft.category,
			stackable: false,
		});
	else
		project.quests.push({
			id,
			name,
			description: draft.description,
			status: "inactive",
			objectiveMode: "sequence",
			objectives: [],
			completionActions: [],
			rewards: [],
		});
	return { kind: draft.kind, id };
}

export function placedDialogueNpc(
	project: GameProject,
	ref: DialogueEntityRef,
) {
	if (ref.kind !== "npc") return;
	const npc = project.areas
		.find((a) => a.id === ref.areaId)
		?.npcs.find((n) => n.id === ref.id);
	return npc
		? resolveNPCInstance(
				project.npcs.find((n) => n.id === npc.npcDefinitionId),
				npc,
			)
		: undefined;
}

export function dialogueAssignmentPatch(
	project: GameProject,
	ref: DialogueEntityRef,
	dialogueId: string,
): Partial<NPCInstance> | undefined {
	const npc = placedDialogueNpc(project, ref);
	if (!npc || !project.dialogues.some((d) => d.id === dialogueId)) return;
	const interaction = {
		...(npc.interaction?.type === "start_dialogue" ? npc.interaction : {}),
		type: "start_dialogue" as const,
		dialogueId,
		activationMode: "on_interact" as const,
		prompt: npc.interaction?.prompt || "Talk",
	};
	return {
		interaction,
		interactionOverride: interaction,
		attributesOverride: { ...npc.attributesOverride, canInteract: true },
	};
}
