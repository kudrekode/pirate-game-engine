import type {
	EventBlock,
	GameArea,
	GameProject,
	Interaction,
	MapStructure,
	NPCInstance,
	ObjectBehaviour,
	ObjectDefinition,
	ObjectInstance,
	PickupObject,
	RuleTrigger,
} from "../types/game";
import { resolveNPCInstance } from "./npcResolver";
import type { RuntimeGameState } from "./ruleEngine";

export type RuntimePosition = { x: number; y: number };

export type InteractableTarget =
	| {
			type: "eventBlock";
			id: string;
			areaId: string;
			x: number;
			y: number;
			label: string;
			interaction?: Interaction;
			interactionKind?: Interaction["type"];
			distance: number;
			eventBlock: EventBlock;
	  }
	| {
			type: "structure";
			id: string;
			areaId: string;
			x: number;
			y: number;
			label: string;
			interaction?: Interaction;
			interactionKind?: Interaction["type"];
			distance: number;
			structure: MapStructure;
	  }
	| {
			type: "object";
			id: string;
			areaId: string;
			x: number;
			y: number;
			label: string;
			interaction?: Interaction;
			interactionKind?: Interaction["type"];
			distance: number;
			object: ObjectInstance;
	  }
	| {
			type: "pickup";
			id: string;
			areaId: string;
			x: number;
			y: number;
			label: string;
			distance: number;
			pickup: PickupObject;
	  }
	| {
			type: "npc";
			id: string;
			areaId: string;
			x: number;
			y: number;
			label: string;
			interaction?: Interaction;
			interactionKind?: Interaction["type"];
			distance: number;
			npc: NPCInstance;
	  };

export type TouchInteractableTarget = Extract<
	InteractableTarget,
	{ type: "eventBlock" | "object" | "pickup" }
>;

export type InteractionDiscoveryContext = {
	project: Pick<GameProject, "items" | "npcs" | "objects" | "rules">;
	area: GameArea;
	playerPosition: RuntimePosition;
	runtimeState: RuntimeGameState;
	collectedPickupIds?: Set<string>;
	defeatedNpcIds?: Set<string>;
	range?: number;
};

export function canTouchActivate(interaction: Interaction): boolean {
	return (
		interaction.activationMode === "on_touch" ||
		interaction.activationMode === "both"
	);
}

export function canInteractActivate(interaction: Interaction): boolean {
	return (
		interaction.activationMode === "on_interact" ||
		interaction.activationMode === "both"
	);
}

export function resolveEventInteraction(
	eventBlock: EventBlock,
): Interaction | undefined {
	if (eventBlock.interaction) {
		return eventBlock.interaction;
	}

	if (eventBlock.kind === "area_link" && eventBlock.link) {
		return {
			type: "area_link",
			activationMode: "on_touch",
			...eventBlock.link,
		};
	}

	return undefined;
}

export function findObjectDefinition(
	project: Pick<GameProject, "objects">,
	object: ObjectInstance,
): ObjectDefinition | undefined {
	return project.objects.find(
		(definition) => definition.id === object.objectDefinitionId,
	);
}

export function resolveObjectBehaviour(
	project: Pick<GameProject, "objects">,
	object: ObjectInstance,
): ObjectBehaviour {
	return (
		object.behaviourOverride ??
		findObjectDefinition(project, object)?.defaultBehaviour ?? {
			type: "none" as const,
		}
	);
}

export function hasRuleTrigger(
	rules: GameProject["rules"],
	trigger: RuleTrigger,
): boolean {
	return rules.some((rule) => {
		if (!rule.enabled || rule.trigger.type !== trigger.type) {
			return false;
		}

		if (rule.trigger.type === "on_interact" && trigger.type === "on_interact") {
			return rule.trigger.targetId === trigger.targetId;
		}

		if (rule.trigger.type === "on_touch" && trigger.type === "on_touch") {
			return rule.trigger.targetId === trigger.targetId;
		}

		if (
			rule.trigger.type === "on_area_enter" &&
			trigger.type === "on_area_enter"
		) {
			return rule.trigger.areaId === trigger.areaId;
		}

		if (
			rule.trigger.type === "on_cutscene_end" &&
			trigger.type === "on_cutscene_end"
		) {
			return rule.trigger.cutsceneId === trigger.cutsceneId;
		}

		return (
			rule.trigger.type === "on_game_start" && trigger.type === "on_game_start"
		);
	});
}

export function isPickupCollected(
	pickup: PickupObject,
	runtimeState: RuntimeGameState,
	collectedPickupIds: Set<string> = new Set<string>(),
): boolean {
	return Boolean(
		pickup.once &&
			(collectedPickupIds.has(pickup.id) ||
				(pickup.collectedFlag && runtimeState.flags[pickup.collectedFlag])),
	);
}

function distanceToPoint(a: RuntimePosition, b: RuntimePosition): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function distanceToStructure(
	structure: MapStructure,
	position: RuntimePosition,
): number {
	const minX = structure.x;
	const maxX = structure.x + structure.widthTiles - 1;
	const minY = structure.y;
	const maxY = structure.y + structure.heightTiles - 1;
	const deltaX =
		position.x < minX
			? minX - position.x
			: position.x > maxX
				? position.x - maxX
				: 0;
	const deltaY =
		position.y < minY
			? minY - position.y
			: position.y > maxY
				? position.y - maxY
				: 0;

	return deltaX + deltaY;
}

function distanceToObject(
	project: Pick<GameProject, "objects">,
	object: ObjectInstance,
	position: RuntimePosition,
): number {
	const definition = findObjectDefinition(project, object);
	const minX = object.x;
	const maxX =
		object.x + (object.widthTiles ?? definition?.widthTiles ?? 1) - 1;
	const minY = object.y;
	const maxY =
		object.y + (object.heightTiles ?? definition?.heightTiles ?? 1) - 1;
	const deltaX =
		position.x < minX
			? minX - position.x
			: position.x > maxX
				? position.x - maxX
				: 0;
	const deltaY =
		position.y < minY
			? minY - position.y
			: position.y > maxY
				? position.y - maxY
				: 0;

	return deltaX + deltaY;
}

function withInteractionKind<T extends { interaction?: Interaction }>(
	target: T,
): T & { interactionKind?: Interaction["type"] } {
	return {
		...target,
		...(target.interaction ? { interactionKind: target.interaction.type } : {}),
	};
}

export function findNearestInteractableTarget(
	context: InteractionDiscoveryContext,
): InteractableTarget | null {
	const range = context.range ?? 1;
	const candidates: InteractableTarget[] = [];

	context.area.eventBlocks.forEach((eventBlock) => {
		const interaction = resolveEventInteraction(eventBlock);
		const targetHasRule = hasRuleTrigger(context.project.rules, {
			type: "on_interact",
			targetId: eventBlock.id,
		});

		if ((!interaction || !canInteractActivate(interaction)) && !targetHasRule) {
			return;
		}

		const distance = distanceToPoint(eventBlock, context.playerPosition);
		if (distance <= range) {
			candidates.push(
				withInteractionKind({
					type: "eventBlock" as const,
					id: eventBlock.id,
					areaId: context.area.id,
					x: eventBlock.x,
					y: eventBlock.y,
					label: eventBlock.name,
					interaction,
					distance,
					eventBlock,
				}),
			);
		}
	});

	context.area.structures.forEach((structure) => {
		const targetHasRule = hasRuleTrigger(context.project.rules, {
			type: "on_interact",
			targetId: structure.id,
		});
		if (
			(!structure.interaction || !canInteractActivate(structure.interaction)) &&
			!targetHasRule
		) {
			return;
		}

		const distance = distanceToStructure(structure, context.playerPosition);
		if (distance <= range) {
			candidates.push(
				withInteractionKind({
					type: "structure" as const,
					id: structure.id,
					areaId: context.area.id,
					x: structure.x,
					y: structure.y,
					label: structure.name,
					interaction: structure.interaction,
					distance,
					structure,
				}),
			);
		}
	});

	context.area.objects.forEach((object) => {
		const definition = findObjectDefinition(context.project, object);
		const interaction = object.interaction ?? definition?.defaultInteraction;
		const targetHasRule = hasRuleTrigger(context.project.rules, {
			type: "on_interact",
			targetId: object.id,
		});
		const behaviour = resolveObjectBehaviour(context.project, object);
		const hasBehaviour = behaviour.type !== "none";
		if (
			(!interaction || !canInteractActivate(interaction)) &&
			!targetHasRule &&
			!hasBehaviour
		) {
			return;
		}

		const distance = distanceToObject(
			context.project,
			object,
			context.playerPosition,
		);
		if (distance <= range) {
			candidates.push(
				withInteractionKind({
					type: "object" as const,
					id: object.id,
					areaId: context.area.id,
					x: object.x,
					y: object.y,
					label: object.nameOverride ?? definition?.name ?? "Object",
					interaction,
					distance,
					object,
				}),
			);
		}
	});

	context.area.pickups.forEach((pickup) => {
		if (
			pickup.pickupMode !== "on_interact" ||
			isPickupCollected(
				pickup,
				context.runtimeState,
				context.collectedPickupIds,
			)
		) {
			return;
		}

		const distance = distanceToPoint(pickup, context.playerPosition);
		if (distance <= range) {
			const item = context.project.items.find(
				(candidate) => candidate.id === pickup.itemId,
			);
			candidates.push({
				type: "pickup",
				id: pickup.id,
				areaId: context.area.id,
				x: pickup.x,
				y: pickup.y,
				label: item?.name ?? "item",
				distance,
				pickup,
			});
		}
	});

	context.area.npcs.forEach((npc) => {
		if (context.defeatedNpcIds?.has(npc.id)) {
			return;
		}

		const resolved = resolveNPCInstance(
			context.project.npcs.find(
				(definition) => definition.id === npc.npcDefinitionId,
			),
			npc,
		);
		const attributes = context.runtimeState.npcs[npc.id] ?? resolved.attributes;
		if (!attributes.canInteract) {
			return;
		}

		const targetHasRule = hasRuleTrigger(context.project.rules, {
			type: "on_interact",
			targetId: npc.id,
		});
		if (
			(!resolved.interaction || !canInteractActivate(resolved.interaction)) &&
			!targetHasRule
		) {
			return;
		}

		const distance = distanceToPoint(npc, context.playerPosition);
		if (distance <= range) {
			candidates.push(
				withInteractionKind({
					type: "npc" as const,
					id: npc.id,
					areaId: context.area.id,
					x: npc.x,
					y: npc.y,
					label: resolved.name,
					interaction: resolved.interaction,
					distance,
					npc,
				}),
			);
		}
	});

	return (
		candidates.sort((a, b) => {
			if (a.distance !== b.distance) {
				return a.distance - b.distance;
			}

			return a.type === "eventBlock" ? -1 : 1;
		})[0] ?? null
	);
}

export function findTouchInteractableTarget(
	context: InteractionDiscoveryContext,
): TouchInteractableTarget | null {
	const pickup = context.area.pickups.find(
		(candidate) =>
			candidate.pickupMode === "on_touch" &&
			candidate.x === context.playerPosition.x &&
			candidate.y === context.playerPosition.y &&
			!isPickupCollected(
				candidate,
				context.runtimeState,
				context.collectedPickupIds,
			),
	);
	if (pickup) {
		const item = context.project.items.find(
			(candidate) => candidate.id === pickup.itemId,
		);
		return {
			type: "pickup",
			id: pickup.id,
			areaId: context.area.id,
			x: pickup.x,
			y: pickup.y,
			label: item?.name ?? "item",
			distance: 0,
			pickup,
		};
	}

	const object = context.area.objects.find(
		(candidate) =>
			candidate.x === context.playerPosition.x &&
			candidate.y === context.playerPosition.y,
	);
	const objectInteraction = object
		? (object.interaction ??
			findObjectDefinition(context.project, object)?.defaultInteraction)
		: undefined;
	const objectBehaviour = object
		? resolveObjectBehaviour(context.project, object)
		: { type: "none" as const };
	const objectHasRule = object
		? hasRuleTrigger(context.project.rules, {
				type: "on_touch",
				targetId: object.id,
			})
		: false;
	const objectBehaviourCanTouch =
		objectBehaviour.type !== "none" && objectBehaviour.type !== "vehicle";
	if (
		object &&
		((objectInteraction && canTouchActivate(objectInteraction)) ||
			objectHasRule ||
			objectBehaviourCanTouch)
	) {
		const definition = findObjectDefinition(context.project, object);
		return withInteractionKind({
			type: "object" as const,
			id: object.id,
			areaId: context.area.id,
			x: object.x,
			y: object.y,
			label: object.nameOverride ?? definition?.name ?? "Object",
			interaction: objectInteraction,
			distance: 0,
			object,
		});
	}

	const eventBlock = context.area.eventBlocks.find(
		(candidate) =>
			candidate.x === context.playerPosition.x &&
			candidate.y === context.playerPosition.y,
	);
	const interaction = eventBlock
		? resolveEventInteraction(eventBlock)
		: undefined;
	const targetHasRule = eventBlock
		? hasRuleTrigger(context.project.rules, {
				type: "on_touch",
				targetId: eventBlock.id,
			})
		: false;

	if (
		!eventBlock ||
		((!interaction || !canTouchActivate(interaction)) && !targetHasRule)
	) {
		return null;
	}

	return withInteractionKind({
		type: "eventBlock" as const,
		id: eventBlock.id,
		areaId: context.area.id,
		x: eventBlock.x,
		y: eventBlock.y,
		label: eventBlock.name,
		interaction,
		distance: 0,
		eventBlock,
	});
}
