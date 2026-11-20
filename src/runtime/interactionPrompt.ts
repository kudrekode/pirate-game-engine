import type { InteractableTarget } from "./interactionDiscovery";
import { resolveObjectBehaviour } from "./interactionDiscovery";
import { hasItem } from "./inventory";
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
	let requirementHint = "";
	if (target.type === "object") {
		const behaviour = resolveObjectBehaviour(session.project, target.object);
		if (behaviour.type === "door" && behaviour.requiredItemId) {
			const name =
				session.project.items.find(
					(item) => item.id === behaviour.requiredItemId,
				)?.name || "required item";
			if (!hasItem(session.runtimeState.inventory, behaviour.requiredItemId))
				return `Requires ${name}`;
			requirementHint = ` · ${name} retained`;
		}
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
	return (
		(/^press\s+(e|enter)\b/i.test(label) ? label : `E — ${label}`) +
		requirementHint
	);
}
