import type { InteractableTarget } from "./interactionDiscovery";
import { resolveObjectBehaviour } from "./interactionDiscovery";
import type { RuntimeSessionState } from "./runtimeSession";

export function interactionPrompt(
	session: RuntimeSessionState,
	target: InteractableTarget | null,
): string {
	if (!target) return "";
	let label =
		target.type === "pickup"
			? `Pick up ${target.label}`
			: target.type === "npc"
				? "Talk"
				: "Interact";
	if (target.type === "object") {
		const behaviour = resolveObjectBehaviour(session.project, target.object);
		if (behaviour.type === "container") {
			const opened =
				session.openedObjectIds.has(target.id) ||
				!!(
					behaviour.openedFlag &&
					session.runtimeState.flags[behaviour.openedFlag]
				);
			if (opened && behaviour.once) return "E — Empty chest";
			label = "Open chest";
		} else if (behaviour.type === "door") label = "Enter";
		else if (behaviour.type === "sign") label = "Read";
		else if (behaviour.type === "vehicle") label = "Board";
	}
	if ("interaction" in target && target.interaction) {
		if (target.interaction.type === "collect_item")
			label = `Pick up ${session.project.items.find((item) => item.id === target.interaction?.itemId)?.name ?? target.label}`;
		label =
			target.interaction.prompt ||
			(target.interaction.type === "show_message"
				? target.type === "npc"
					? "Talk"
					: "Examine"
				: label);
	}
	// Old authored prompts already included the key hint.
	return /^press\s+(e|enter)\b/i.test(label) ? label : `E — ${label}`;
}
