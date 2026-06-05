import type {
	EnemyBehaviour,
	NPCAttributes,
	NPCDefinition,
	NPCInstance,
	NPCMovementConfig,
	ResolvedNPC,
} from "../types/game";

export const defaultNPCAttributes: NPCAttributes = {
	maxHealth: 100,
	health: 100,
	faction: "villagers",
	alignment: "friendly",
	canInteract: true,
	movementSpeed: 1,
};

export const defaultNPCMovement: NPCMovementConfig = {
	movementMode: "stationary",
	movementSpeed: 1,
};

export const defaultEnemyBehaviour: EnemyBehaviour = {
	enabled: false,
	detectionRadiusTiles: 4,
	chaseRadiusTiles: 7,
	returnToOrigin: true,
	contactDamage: 10,
};

function clampAttributes(attributes: NPCAttributes): NPCAttributes {
	const maxHealth = Math.max(1, Math.round(attributes.maxHealth));
	return {
		...attributes,
		maxHealth,
		health: Math.min(maxHealth, Math.max(0, Math.round(attributes.health))),
		movementSpeed: Math.max(0.1, attributes.movementSpeed ?? 1),
	};
}

function mergeMovement(
	definition: NPCDefinition | undefined,
	instance: NPCInstance,
): NPCMovementConfig {
	const legacyMovement = definition
		? {}
		: {
				movementMode: instance.movementMode,
				movementSpeed:
					instance.movementSpeed ?? instance.attributes.movementSpeed,
				patrolPath: instance.patrolPath,
				wanderZone: instance.wanderZone,
			};

	return {
		...defaultNPCMovement,
		...legacyMovement,
		...definition?.defaultMovement,
		...instance.movementOverride,
	};
}

export function resolveNPCInstance(
	definition: NPCDefinition | undefined,
	instance: NPCInstance,
): ResolvedNPC {
	const attributeBase = definition ? {} : instance.attributes;
	const attributes = clampAttributes({
		...defaultNPCAttributes,
		...attributeBase,
		...definition?.defaultAttributes,
		...instance.attributesOverride,
	});
	const movement = mergeMovement(definition, instance);
	const enemyBase = definition
		? definition.defaultEnemyBehaviour
		: instance.enemyBehaviour;
	const enemyBehaviour =
		enemyBase || instance.enemyBehaviourOverride
			? {
					...defaultEnemyBehaviour,
					...enemyBase,
					...instance.enemyBehaviourOverride,
				}
			: undefined;

	return {
		...instance,
		definition,
		name: definition?.name ?? "NPC",
		attributes,
		movementMode: movement.movementMode,
		movementSpeed: Math.max(
			0.1,
			movement.movementSpeed ?? attributes.movementSpeed ?? 1,
		),
		patrolPath: movement.patrolPath,
		wanderZone: movement.wanderZone,
		enemyBehaviour,
		interaction:
			instance.interactionOverride ??
			instance.interaction ??
			definition?.defaultInteraction,
	};
}
