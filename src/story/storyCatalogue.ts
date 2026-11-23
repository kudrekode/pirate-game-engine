import { resolveNPCInstance } from "../runtime/npcResolver";
import type {
	GameArea,
	GameProject,
	StoryEdge,
	StoryGraph,
	StoryNode,
	StoryNodeData,
} from "../types/game";

export const storyNodeCategories = [
	"Entries and triggers",
	"Wait for Events",
	"Actions",
	"Conditions",
	"Flow control",
] as const;

type NodeType = StoryNode["type"];
type Port = StoryEdge["port"];
type Category = (typeof storyNodeCategories)[number];

export type StoryField = {
	key: string;
	label: string;
	kind:
		| "area"
		| "npc"
		| "event"
		| "dialogue"
		| "dialogue-node"
		| "dialogue-choice"
		| "item"
		| "quest"
		| "objective"
		| "cinematic"
		| "flag"
		| "variable"
		| "coordinate"
		| "number"
		| "text"
		| "boolean"
		| "value"
		| "quest-status"
		| "operator";
	min?: number;
	max?: number;
	step?: number;
};

type StoryNodeDefinition<K extends NodeType = NodeType> = {
	label: string;
	category: Category;
	description: string;
	input: boolean;
	outputs: readonly Port[];
	fields: readonly StoryField[];
	defaults: StoryNodeData[K];
	/** A fresh gameplay event, cinematic outcome, or time step is required. */
	suspends?: boolean;
	/** The session remembers this node after its first successful execution. */
	once?: boolean;
};

function fieldsFor<K extends NodeType>(
	...fields: (StoryField & {
		key: Extract<keyof StoryNodeData[K], string>;
	})[]
): StoryField[] {
	return fields;
}

function definition<T>(
	category: Category,
	label: string,
	description: string,
	defaults: T,
	fields: readonly StoryField[] = [],
) {
	return { label, category, description, fields, defaults };
}

function entry<T>(
	label: string,
	description: string,
	defaults: T,
	fields?: readonly StoryField[],
) {
	return {
		...definition("Entries and triggers", label, description, defaults, fields),
		input: false,
		outputs: ["next"] as const,
	};
}

function linear<T>(
	category: Category,
	label: string,
	description: string,
	defaults: T,
	fields?: readonly StoryField[],
) {
	return {
		...definition(category, label, description, defaults, fields),
		input: true,
		outputs: ["next"] as const,
	};
}

function action<T>(
	label: string,
	description: string,
	defaults: T,
	fields: readonly StoryField[],
) {
	return linear("Actions", label, description, defaults, fields);
}

function wait<T>(
	label: string,
	description: string,
	defaults: T,
	fields: readonly StoryField[],
) {
	return {
		...linear("Wait for Events", label, description, defaults, fields),
		suspends: true,
	};
}

function condition<T>(
	label: string,
	description: string,
	defaults: T,
	fields: readonly StoryField[],
) {
	return {
		...definition("Conditions", label, description, defaults, fields),
		input: true,
		outputs: ["true", "false"] as const,
	};
}

const areaField = { key: "areaId", label: "Map", kind: "area" } as const;
const questField = { key: "questId", label: "Quest", kind: "quest" } as const;
const npcField = { key: "npcId", label: "Placed NPC", kind: "npc" } as const;
const itemField = { key: "itemId", label: "Item", kind: "item" } as const;
const flagField = { key: "flagId", label: "Flag", kind: "flag" } as const;
const variableField = {
	key: "variableId",
	label: "Variable",
	kind: "variable",
} as const;
const cinematicField = {
	key: "cinematicId",
	label: "Cinematic",
	kind: "cinematic",
} as const;
const valueField = { key: "value", label: "Value", kind: "value" } as const;
const quantityField = {
	key: "quantity",
	label: "Quantity",
	kind: "number",
	min: 1,
	step: 1,
} as const;
const positionFields = [
	areaField,
	{ key: "x", label: "Tile X", kind: "coordinate", min: 0, step: 1 },
	{ key: "y", label: "Tile Y", kind: "coordinate", min: 0, step: 1 },
] as const;

export const storyNodeCatalogue: { [K in NodeType]: StoryNodeDefinition<K> } = {
	newGame: entry(
		"On New Game",
		"Starts when a new play session is created.",
		{},
	),
	areaEnter: entry(
		"On Area Enter",
		"Starts when the player enters this map.",
		{ areaId: "" },
		[areaField],
	),
	questStart: entry(
		"On Quest Start",
		"Starts when this quest becomes active.",
		{ questId: "" },
		[questField],
	),
	questComplete: entry(
		"On Quest Complete",
		"Starts when this quest is completed.",
		{ questId: "" },
		[questField],
	),
	flagChanged: entry(
		"On Flag Changed",
		"Starts when this flag changes value.",
		{ flagId: "" },
		[flagField],
	),
	mapEvent: entry(
		"On Map Event",
		"Starts when this map event is activated.",
		{ areaId: "", eventBlockId: "" },
		fieldsFor<"mapEvent">(areaField, {
			key: "eventBlockId",
			label: "Map event",
			kind: "event",
		}),
	),
	waitNpc: wait(
		"Wait for NPC Interaction",
		"Continues after the player interacts with this placed character.",
		{ areaId: "", npcId: "" },
		[areaField, npcField],
	),
	waitLocation: wait(
		"Wait for Location",
		"Continues when the player reaches a position on the selected map.",
		{ areaId: "", x: 0, y: 0, radius: 0 },
		fieldsFor<"waitLocation">(...positionFields, {
			key: "radius",
			label: "Radius in tiles",
			kind: "number",
			min: 0,
			step: 0.25,
		}),
	),
	waitItem: wait(
		"Wait for Item Collection",
		"Continues when the player acquires this item through a pickup, dialogue, purchase or reward.",
		{ itemId: "" },
		[itemField],
	),
	waitEnemy: wait(
		"Wait for Enemy Defeat",
		"Continues when this placed character is defeated.",
		{ areaId: "", npcId: "" },
		[areaField, npcField],
	),
	waitDialogueChoice: wait(
		"Wait for Dialogue Choice",
		"Continues when the player selects this response.",
		{ dialogueId: "", nodeId: "", choiceId: "" },
		fieldsFor<"waitDialogueChoice">(
			{ key: "dialogueId", label: "Dialogue", kind: "dialogue" },
			{ key: "nodeId", label: "Dialogue node", kind: "dialogue-node" },
			{ key: "choiceId", label: "Response", kind: "dialogue-choice" },
		),
	),
	waitCinematic: wait(
		"Wait for Cinematic",
		"Continues when this cinematic finishes or is skipped.",
		{ cinematicId: "" },
		[cinematicField],
	),
	delay: wait(
		"Wait Timer",
		"Continues after the selected amount of play time.",
		{ seconds: 1 },
		fieldsFor<"delay">({
			key: "seconds",
			label: "Seconds",
			kind: "number",
			min: 0.1,
			step: 0.1,
		}),
	),
	spawn: {
		...action(
			"Spawn Player",
			"Places the player at a map marker or tile.",
			{ areaId: "", x: 0, y: 0 },
			positionFields,
		),
		once: true,
	},
	cinematic: {
		...action(
			"Play Cinematic",
			"Plays a cinematic and continues when it finishes or is skipped.",
			{ cinematicId: "" },
			[cinematicField],
		),
		suspends: true,
	},
	startQuest: action(
		"Start Quest",
		"Activates the selected quest.",
		{ questId: "" },
		[questField],
	),
	completeQuest: action(
		"Complete Quest",
		"Completes the selected quest through its existing reward rules.",
		{ questId: "" },
		[questField],
	),
	objective: {
		...action(
			"Complete Objective",
			"Completes the selected objective and advances the existing quest sequence.",
			{ questId: "", objectiveId: "" },
			fieldsFor<"objective">(questField, {
				key: "objectiveId",
				label: "Objective",
				kind: "objective",
			}),
		),
		once: true,
	},
	notify: action(
		"Show Notification",
		"Displays a short gameplay message.",
		{ message: "" },
		fieldsFor<"notify">({ key: "message", label: "Message", kind: "text" }),
	),
	setFlag: action(
		"Set Flag",
		"Sets or clears an existing story flag.",
		{ flagId: "", value: true },
		fieldsFor<"setFlag">(flagField, {
			key: "value",
			label: "Value",
			kind: "boolean",
		}),
	),
	setVariable: action(
		"Set Variable",
		"Writes an existing number or text variable.",
		{ variableId: "", value: 0 },
		[variableField, valueField],
	),
	giveItem: {
		...action(
			"Give Item",
			"Adds an item to the player inventory once per play session.",
			{ itemId: "", quantity: 1 },
			[itemField, quantityField],
		),
		once: true,
	},
	teleport: action(
		"Teleport Player",
		"Moves the player to a map marker or tile.",
		{ areaId: "", x: 0, y: 0 },
		positionFields,
	),
	hasItem: condition(
		"Has Item",
		"Branches on the quantity in the player inventory.",
		{ itemId: "", quantity: 1 },
		[itemField, quantityField],
	),
	questState: condition(
		"Quest State",
		"Branches on the quest's current status.",
		{ questId: "", status: "active" as const },
		fieldsFor<"questState">(questField, {
			key: "status",
			label: "Status",
			kind: "quest-status",
		}),
	),
	flagSet: condition(
		"Flag Set",
		"Branches on whether the selected flag is true.",
		{ flagId: "" },
		[flagField],
	),
	compareVariable: condition(
		"Compare Variable",
		"Branches on an existing story variable and comparison value.",
		{ variableId: "", operator: "==" as const, value: 0 },
		fieldsFor<"compareVariable">(
			variableField,
			{ key: "operator", label: "Operator", kind: "operator" },
			valueField,
		),
	),
	inArea: condition(
		"Player in Area",
		"Branches on the player's current map.",
		{ areaId: "" },
		[areaField],
	),
	once: {
		...linear(
			"Flow control",
			"Once",
			"Continues the first time it is reached and ends later visits.",
			{},
		),
		once: true,
	},
	end: {
		...definition("Flow control", "End", "Completes the active graph run.", {}),
		input: true,
		outputs: [],
	},
};

export function createStoryNode(
	type: NodeType,
	id: string,
	x: number,
	y: number,
): StoryNode {
	return {
		type,
		id,
		x,
		y,
		data: { ...storyNodeCatalogue[type].defaults },
	} as StoryNode;
}

export function storyOutputLabel(port: Port) {
	return port === "true" ? "True" : port === "false" ? "False" : "Next";
}

type StoryPosition = StoryNodeData["spawn"];
type StoryPositionTarget = NonNullable<StoryPosition["target"]>;

export type StoryFieldOption = {
	value: string;
	label: string;
	areaId?: string;
	assetId?: string;
};

function positionArea(project: GameProject, node: StoryNode) {
	if (!("areaId" in node.data)) return;
	const { areaId } = node.data;
	return project.areas.find((area) => area.id === areaId);
}

function npcDetails(project: GameProject, npc: GameArea["npcs"][number]) {
	return resolveNPCInstance(
		project.npcs.find((definition) => definition.id === npc.npcDefinitionId),
		npc,
	);
}

function labelOption(value: string): StoryFieldOption {
	return {
		value,
		label: value
			.replace(/_/g, " ")
			.replace(/^./, (letter) => letter.toUpperCase()),
	};
}

export function storyFieldOptions(
	project: GameProject,
	node: StoryNode,
	field: StoryField,
): StoryFieldOption[] {
	const area = positionArea(project, node);
	switch (field.kind) {
		case "area":
			return project.areas.map(({ id, name }) => ({
				value: id,
				label: name,
				areaId: id,
			}));
		case "npc":
			return (
				area?.npcs.map((npc) => {
					const resolved = npcDetails(project, npc);
					return {
						value: npc.id,
						label: `${resolved.name} (${npc.x}, ${npc.y})`,
						areaId: area.id,
						assetId: resolved.threeVisual?.assetId,
					};
				}) ?? []
			);
		case "event":
			return (
				area?.eventBlocks
					.filter((event) => event.kind !== "spawn")
					.map(({ id, name, x, y }) => ({
						value: id,
						label: `${name} (${x}, ${y})`,
						areaId: area.id,
					})) ?? []
			);
		case "dialogue":
			return project.dialogues.map(({ id, name }) => ({
				value: id,
				label: name,
			}));
		case "dialogue-node": {
			if (node.type !== "waitDialogueChoice") return [];
			const { dialogueId } = node.data;
			return (
				project.dialogues
					.find(({ id }) => id === dialogueId)
					?.nodes.filter((entry) => entry.type === "choice")
					.map(({ id, text }) => ({ value: id, label: text?.trim() || id })) ??
				[]
			);
		}
		case "dialogue-choice": {
			if (node.type !== "waitDialogueChoice") return [];
			const { dialogueId, nodeId } = node.data;
			const entry = project.dialogues
				.find(({ id }) => id === dialogueId)
				?.nodes.find(({ id }) => id === nodeId);
			return entry?.type === "choice"
				? entry.choices.map(({ id, text }) => ({ value: id, label: text }))
				: [];
		}
		case "quest":
			return project.quests.map(({ id, name }) => ({ value: id, label: name }));
		case "objective": {
			const questId = "questId" in node.data ? node.data.questId : undefined;
			return (
				project.quests
					.find(({ id }) => id === questId)
					?.objectives.map(({ id, description }) => ({
						value: id,
						label: description,
					})) ?? []
			);
		}
		case "item":
			return project.items.map(({ id, name }) => ({ value: id, label: name }));
		case "cinematic":
			return project.cutscenes
				.filter(({ cinematic }) => cinematic)
				.map(({ id, name }) => ({ value: id, label: name }));
		case "flag":
			return Object.keys(project.gameState.flags).map(labelOption);
		case "variable":
			return Object.keys(project.gameState.variables).map(labelOption);
		case "quest-status":
			return ["inactive", "active", "completed", "failed"].map(labelOption);
		case "operator": {
			const variableId = "variableId" in node.data ? node.data.variableId : "";
			return (
				typeof project.gameState.variables[variableId] === "string"
					? ["==", "!="]
					: ["==", "!=", ">", "<", ">=", "<="]
			).map(labelOption);
		}
		default:
			return [];
	}
}

export type StoryMapPosition = StoryFieldOption & {
	x: number;
	y: number;
	areaId: string;
	entityId: string;
	entityType: StoryPositionTarget["type"];
};

export function storyMapPositions(
	project: GameProject,
	node: StoryNode,
): StoryMapPosition[] {
	const area = positionArea(project, node);
	if (!area) return [];
	const position = (
		entityType: StoryMapPosition["entityType"],
		entity: { id: string; x: number; y: number },
		name: string,
		assetId?: string,
	): StoryMapPosition => ({
		value: JSON.stringify([entityType, entity.id]),
		label: `${name} (${entity.x}, ${entity.y})`,
		x: entity.x,
		y: entity.y,
		areaId: area.id,
		entityId: entity.id,
		entityType,
		assetId,
	});
	return [
		...area.eventBlocks.map((event) =>
			position("eventBlock", event, event.name),
		),
		...area.objects.map((object) => {
			const definition = project.objects.find(
				({ id }) => id === object.objectDefinitionId,
			);
			return position(
				"object",
				object,
				object.nameOverride || definition?.name || object.id,
				object.threeVisual?.assetId ?? definition?.threeVisual?.assetId,
			);
		}),
		...area.structures.map((structure) =>
			position("structure", structure, structure.name),
		),
		...area.pickups.map((pickup) =>
			position(
				"pickup",
				pickup,
				project.items.find(({ id }) => id === pickup.itemId)?.name ?? pickup.id,
			),
		),
		...area.npcs.map((npc) => {
			const resolved = npcDetails(project, npc);
			return position("npc", npc, resolved.name, resolved.threeVisual?.assetId);
		}),
	];
}

function positionEntity(area: GameArea, target: StoryPositionTarget) {
	const matches = (entity: { id: string }) => entity.id === target.id;
	switch (target.type) {
		case "eventBlock":
			return area.eventBlocks.find(matches);
		case "object":
			return area.objects.find(matches);
		case "structure":
			return area.structures.find(matches);
		case "pickup":
			return area.pickups.find(matches);
		case "npc":
			return area.npcs.find(matches);
	}
}

export function resolveStoryMapPosition(
	project: GameProject,
	data: StoryPosition,
): { x: number; y: number } | undefined {
	const area = project.areas.find(({ id }) => id === data.areaId);
	if (!area) return;
	const point = data.target ? positionEntity(area, data.target) : data;
	if (!point) return;
	const { x, y } = point;
	if (
		!Number.isInteger(x) ||
		!Number.isInteger(y) ||
		x < 0 ||
		x >= area.width ||
		y < 0 ||
		y >= area.height
	)
		return;
	return { x, y };
}

export type StoryDiagnostic = {
	severity: "error" | "warning";
	message: string;
	nodeId?: string;
	edgeId?: string;
};

function isMapPositionNode(
	node: StoryNode,
): node is Extract<StoryNode, { type: "spawn" | "teleport" | "waitLocation" }> {
	return (
		node.type === "spawn" ||
		node.type === "teleport" ||
		node.type === "waitLocation"
	);
}

export function storyFieldValue(node: StoryNode, field: StoryField): unknown {
	return (node.data as Record<string, unknown>)[field.key];
}

function fieldProblem(
	project: GameProject,
	node: StoryNode,
	field: StoryField,
): string | undefined {
	const value = storyFieldValue(node, field);
	switch (field.kind) {
		case "boolean":
			return typeof value !== "boolean"
				? `${field.label} must be true or false.`
				: undefined;
		case "text":
			return typeof value !== "string" || !value.trim()
				? `Enter a ${field.label.toLowerCase()}.`
				: undefined;
		case "value": {
			const variableId = "variableId" in node.data ? node.data.variableId : "";
			const configured = project.gameState.variables[variableId];
			if (
				typeof configured === "number" &&
				(typeof value !== "number" || !Number.isFinite(value))
			)
				return `${field.label} must be a finite number for ${variableId}.`;
			if (typeof configured === "string" && typeof value !== "string")
				return `${field.label} must be text for ${variableId}.`;
			return;
		}
		case "coordinate":
			if (isMapPositionNode(node) && node.data.target) return;
			return typeof value !== "number" || !Number.isInteger(value) || value < 0
				? `${field.label} must be a non-negative whole number.`
				: undefined;
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value))
				return `${field.label} must be a finite number.`;
			if (field.step === 1 && !Number.isInteger(value))
				return `${field.label} must be a whole number.`;
			if (field.min !== undefined && value < field.min)
				return `${field.label} must be at least ${field.min}.`;
			if (field.max !== undefined && value > field.max)
				return `${field.label} must be at most ${field.max}.`;
			return;
		default:
			if (typeof value !== "string" || !value.trim())
				return `Choose ${field.label.toLowerCase()}.`;
			if (
				!storyFieldOptions(project, node, field).some(
					(option) => option.value === value,
				)
			)
				return `${field.label} "${value}" is unavailable for this node.`;
	}
}

function effectKey(node: StoryNode) {
	switch (node.type) {
		case "giveItem":
			return node.data.itemId
				? JSON.stringify([node.type, node.data.itemId, node.data.quantity])
				: undefined;
		case "objective":
			return node.data.questId && node.data.objectiveId
				? JSON.stringify([node.type, node.data.questId, node.data.objectiveId])
				: undefined;
		case "completeQuest":
			return node.data.questId
				? JSON.stringify([node.type, node.data.questId])
				: undefined;
	}
}

export function isKnownStoryNode(type: unknown): type is NodeType {
	return (
		typeof type === "string" &&
		Object.getOwnPropertyDescriptor(storyNodeCatalogue, type) !== undefined
	);
}

function synchronousCycle(
	nodes: Map<string, StoryNode>,
	outgoing: Map<string, StoryEdge[]>,
): StoryEdge | undefined {
	const finished = new Set<string>();
	for (const start of nodes.keys()) {
		if (finished.has(start)) continue;
		const active = new Set<string>([start]);
		const stack = [{ nodeId: start, nextEdge: 0 }];
		while (stack.length) {
			const frame = stack[stack.length - 1];
			const current = nodes.get(frame.nodeId);
			const suspends =
				current &&
				(storyNodeCatalogue[current.type].suspends || current.type === "once");
			const edge = suspends
				? undefined
				: outgoing.get(frame.nodeId)?.[frame.nextEdge];
			if (!edge) {
				finished.add(frame.nodeId);
				active.delete(frame.nodeId);
				stack.pop();
				continue;
			}
			frame.nextEdge += 1;
			if (active.has(edge.to)) return edge;
			if (!finished.has(edge.to)) {
				active.add(edge.to);
				stack.push({ nodeId: edge.to, nextEdge: 0 });
			}
		}
	}
}

export function validateStoryGraph(
	project: GameProject,
	graph: StoryGraph,
): StoryDiagnostic[] {
	const diagnostics: StoryDiagnostic[] = [];
	const nodes = new Map<string, StoryNode>();
	const entries: StoryNode[] = [];
	const entryTriggers = new Set<string>();
	const effects = new Set<string>();
	const report = (
		severity: StoryDiagnostic["severity"],
		message: string,
		location?: Pick<StoryDiagnostic, "nodeId" | "edgeId">,
	) => {
		diagnostics.push({ severity, message, ...location });
	};

	if (
		!graph.id ||
		(project.storyGraphs?.filter(({ id }) => id === graph.id).length ?? 0) > 1
	)
		report("error", "Graph ID must be present and unique.");

	for (const node of graph.nodes) {
		const location = { nodeId: node.id };
		if (!node.id || nodes.has(node.id)) {
			report(
				"error",
				node.id ? `Duplicate node ID "${node.id}".` : "The node has no ID.",
				location,
			);
			continue;
		}
		if (!isKnownStoryNode(node.type)) {
			report("error", `Unsupported node type "${node.type}".`, location);
			continue;
		}
		nodes.set(node.id, node);
		const definition = storyNodeCatalogue[node.type];
		if (node.data === null || typeof node.data !== "object") {
			report("error", `${definition.label} has invalid settings.`, location);
			continue;
		}
		for (const field of definition.fields) {
			const message = fieldProblem(project, node, field);
			if (message) report("error", message, location);
		}
		if (!definition.input) {
			entries.push(node);
			const key = JSON.stringify([
				node.type,
				...definition.fields.map((field) => storyFieldValue(node, field)),
			]);
			if (entryTriggers.has(key))
				report(
					"error",
					"This trigger is already used by another entry in this graph.",
					location,
				);
			entryTriggers.add(key);
		}
		if (
			isMapPositionNode(node) &&
			positionArea(project, node) &&
			!resolveStoryMapPosition(project, node.data)
		) {
			const message = node.data.target
				? `Position target "${node.data.target.id}" is unavailable on the selected map.`
				: "The tile position must be inside the selected map.";
			report("error", message, location);
		}
		const effect = effectKey(node);
		if (effect) {
			if (effects.has(effect))
				report(
					"warning",
					`Duplicate one-time action: ${definition.label} targets the same record.`,
					location,
				);
			effects.add(effect);
		}
	}
	if (entries.length === 0)
		report("error", "Add an entry or trigger to start the graph.");

	const outgoing = new Map<string, StoryEdge[]>();
	const edgeIds = new Set<string>();
	for (const edge of graph.edges) {
		const location = { edgeId: edge.id };
		if (!edge.id || edgeIds.has(edge.id)) {
			report(
				"error",
				edge.id
					? `Duplicate connection ID "${edge.id}".`
					: "The connection has no ID.",
				location,
			);
			continue;
		}
		edgeIds.add(edge.id);
		const source = nodes.get(edge.from);
		const target = nodes.get(edge.to);
		if (!source || !target) {
			report("error", "Connection points to a missing node.", location);
			continue;
		}
		if (
			!storyNodeCatalogue[source.type].outputs.includes(edge.port) ||
			!storyNodeCatalogue[target.type].input
		) {
			report(
				"error",
				"Connection must link an available output port to a node input.",
				location,
			);
			continue;
		}
		const connections = outgoing.get(edge.from) ?? [];
		if (connections.some(({ port }) => port === edge.port)) {
			report(
				"error",
				`The ${storyOutputLabel(edge.port)} output already has a connection.`,
				location,
			);
			continue;
		}
		connections.push(edge);
		outgoing.set(edge.from, connections);
	}

	const reachable = new Set<string>();
	const pending = entries.map(({ id }) => id);
	while (pending.length) {
		const nodeId = pending.pop();
		if (nodeId === undefined || reachable.has(nodeId)) continue;
		reachable.add(nodeId);
		for (const edge of outgoing.get(nodeId) ?? []) pending.push(edge.to);
	}
	for (const [nodeId, node] of nodes) {
		if (!reachable.has(nodeId)) {
			report("warning", "Node cannot be reached from an entry.", { nodeId });
			continue;
		}
		for (const port of storyNodeCatalogue[node.type].outputs) {
			if (!outgoing.get(nodeId)?.some((edge) => edge.port === port)) {
				report(
					"warning",
					`The ${storyOutputLabel(port)} output is unconnected and ends this path.`,
					{ nodeId },
				);
			}
		}
	}
	const loop = synchronousCycle(nodes, outgoing);
	if (loop)
		report(
			"error",
			"This loop can run continuously. Add an event wait, timer, cinematic, or Once node to this path.",
			{ nodeId: loop.from, edgeId: loop.id },
		);
	return diagnostics;
}
