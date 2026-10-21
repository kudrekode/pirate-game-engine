import type { DialogueDefinition, Interaction } from "../types/game";
import type { RuntimeSessionState } from "./runtimeSession";

// Ordered text is translated into existing dialogue nodes, never a second engine.
export function prepareInteractionMessage(
	session: RuntimeSessionState,
	interaction: Interaction,
	targetId: string,
	label: string,
): DialogueDefinition | undefined {
	if (
		interaction.type !== "show_message" ||
		interaction.activationMode === "disabled"
	)
		return;
	const key = `${session.currentAreaId}:${targetId}`;
	if (interaction.once && session.firedInteractionIds.has(key)) return;
	const lines = (interaction.lines ?? []).filter((line) => line.trim());
	if (!lines.length) return;
	if (interaction.once) session.firedInteractionIds.add(key);
	const dialogue: DialogueDefinition = {
		id: `inline:${key}`,
		name: label,
		startNodeId: "line_0",
		nodes: lines.map((text, index) => ({
			id: `line_${index}`,
			type: "text",
			text,
			speaker: interaction.speaker || undefined,
			nextNodeId: index + 1 < lines.length ? `line_${index + 1}` : undefined,
		})),
	};
	session.inlineDialogue = dialogue;
	return dialogue;
}

export function getRuntimeDialogueDefinition(
	session: RuntimeSessionState,
	id = session.dialogue?.dialogueId,
) {
	return session.inlineDialogue?.id === id
		? session.inlineDialogue
		: session.project.dialogues.find((entry) => entry.id === id);
}
