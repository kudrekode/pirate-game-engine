import type {
	DialogueChoice,
	DialogueDefinition,
	DialogueNode,
} from "../../types/game";

export const makeDialogueId = (prefix: string) =>
	`${prefix}_${crypto.randomUUID()}`;
export const nodeTitle = (node: DialogueNode) =>
	`${node.type}: ${(node.text || node.id).slice(0, 34)}`;
export function makeNode(type: DialogueNode["type"]): DialogueNode {
	const id = makeDialogueId("node");
	if (type === "choice")
		return { id, type, text: "Choose a response.", choices: [] };
	return { id, type, text: type === "end" ? "Goodbye." : "New dialogue line." };
}
export const makeChoice = (): DialogueChoice => ({
	id: makeDialogueId("choice"),
	text: "New choice",
	targetNodeId: "",
	conditions: [],
});
export function reorder<T>(values: T[], index: number, offset: number): T[] {
	const result = [...values];
	const target = index + offset;
	if (
		index < 0 ||
		index >= values.length ||
		target < 0 ||
		target >= values.length
	)
		return result;
	[result[index], result[target]] = [result[target], result[index]];
	return result;
}
export type DialogueLink = {
	source: string;
	responseId?: string;
	target: string;
	label: string;
};
export function dialogueLinks(dialogue: DialogueDefinition): DialogueLink[] {
	return dialogue.nodes.flatMap((node): DialogueLink[] =>
		node.type === "text"
			? [{ source: node.id, target: node.nextNodeId ?? "", label: "Next" }]
			: node.type === "choice"
				? node.choices.map((choice) => ({
						source: node.id,
						responseId: choice.id,
						target: choice.targetNodeId,
						label: choice.text,
					}))
				: [],
	);
}
export function connectDialogue(
	dialogue: DialogueDefinition,
	source: string,
	target: string,
	responseId?: string,
): DialogueDefinition {
	if (target && !dialogue.nodes.some((node) => node.id === target))
		return dialogue;
	return {
		...dialogue,
		nodes: dialogue.nodes.map((node) => {
			if (node.id !== source) return node;
			if (node.type === "text" && !responseId)
				return { ...node, nextNodeId: target || undefined };
			if (node.type === "choice" && responseId)
				return {
					...node,
					choices: node.choices.map((choice) =>
						choice.id === responseId
							? { ...choice, targetNodeId: target }
							: choice,
					),
				};
			return node;
		}),
	};
}
export function removeDialogueNode(
	dialogue: DialogueDefinition,
	id: string,
): DialogueDefinition {
	let result = dialogue;
	for (const link of dialogueLinks(dialogue).filter(
		(link) => link.target === id,
	))
		result = connectDialogue(result, link.source, "", link.responseId);
	const positions = { ...dialogue.editorLayout?.nodes };
	delete positions[id];
	return {
		...result,
		nodes: result.nodes.filter((node) => node.id !== id),
		startNodeId: dialogue.startNodeId === id ? "" : dialogue.startNodeId,
		...(dialogue.editorLayout ? { editorLayout: { nodes: positions } } : {}),
	};
}
export function duplicateDialogueNode(node: DialogueNode): DialogueNode {
	const copy = structuredClone(node);
	copy.id = makeDialogueId("node");
	if (copy.type === "choice")
		copy.choices = copy.choices.map((choice) => ({
			...choice,
			id: makeDialogueId("choice"),
			targetNodeId:
				choice.targetNodeId === node.id ? copy.id : choice.targetNodeId,
		}));
	if (copy.type === "text" && copy.nextNodeId === node.id)
		copy.nextNodeId = copy.id;
	return copy;
}
export function duplicateDialogue(
	dialogue: DialogueDefinition,
	id = makeDialogueId("dialogue"),
): DialogueDefinition {
	const ids = new Map(
		dialogue.nodes.map((node) => [node.id, makeDialogueId("node")]),
	);
	return {
		...structuredClone(dialogue),
		id,
		name: `${dialogue.name} copy`,
		startNodeId: ids.get(dialogue.startNodeId) ?? dialogue.startNodeId,
		nodes: dialogue.nodes.map((node) => {
			const copy = duplicateDialogueNode(node);
			copy.id = ids.get(node.id)!;
			if (copy.type === "text" && node.type === "text")
				copy.nextNodeId = ids.get(node.nextNodeId ?? "") ?? node.nextNodeId;
			if (copy.type === "choice" && node.type === "choice")
				copy.choices.forEach((choice, index) => {
					choice.targetNodeId =
						ids.get(node.choices[index].targetNodeId) ??
						node.choices[index].targetNodeId;
				});
			return copy;
		}),
		...(dialogue.editorLayout
			? {
					editorLayout: {
						nodes: Object.fromEntries(
							Object.entries(dialogue.editorLayout.nodes)
								.filter(([key]) => ids.has(key))
								.map(([key, value]) => [ids.get(key)!, { ...value }]),
						),
					},
				}
			: {}),
	};
}
export const GRAPH_WIDTH = 270;
export const graphNodeHeight = (node: DialogueNode) =>
	190 + (node.type === "choice" ? node.choices.length * 68 : 0);
export function autoLayoutDialogue(
	dialogue: DialogueDefinition,
): NonNullable<DialogueDefinition["editorLayout"]> {
	const depth = new Map<string, number>();
	const links = dialogueLinks(dialogue);
	const queue = [dialogue.startNodeId];
	if (dialogue.nodes.some((node) => node.id === dialogue.startNodeId))
		depth.set(dialogue.startNodeId, 0);
	for (let index = 0; index < queue.length; index++) {
		for (const link of links.filter((link) => link.source === queue[index])) {
			if (
				!depth.has(link.target) &&
				dialogue.nodes.some((node) => node.id === link.target)
			) {
				depth.set(link.target, (depth.get(link.source) ?? 0) + 1);
				queue.push(link.target);
			}
		}
	}
	const heights = new Map<number, number>();
	const orphanColumn = Math.max(0, ...depth.values()) + 1;
	return {
		nodes: Object.fromEntries(
			dialogue.nodes.map((node) => {
				const column = depth.get(node.id) ?? orphanColumn;
				const y = heights.get(column) ?? 40;
				heights.set(column, y + graphNodeHeight(node) + 70);
				return [node.id, { x: 40 + column * 410, y }];
			}),
		),
	};
}
