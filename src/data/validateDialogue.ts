import type {
	DialogueCondition,
	DialogueDefinition,
	GameAction,
	GameProject,
} from "../types/game";
import { portraitPresets } from "./presets";
import type { ValidationIssue } from "./validateProject";

export type DialogueIssue = ValidationIssue & { nodeId?: string };

/** Structural authoring diagnostics only; never evaluates game state or rejects cycles. */
export function validateDialogue(
	project: GameProject,
	dialogue: DialogueDefinition,
): DialogueIssue[] {
	const issues: DialogueIssue[] = [];
	const ids = new Set(dialogue.nodes.map((node) => node.id));
	const add = (
		path: string,
		message: string,
		severity: "error" | "warning" = "error",
		nodeId?: string,
	) => {
		issues.push({
			id: `dialogue:${dialogue.id}:${path}`,
			path: `dialogues.${dialogue.id}.${path}`,
			entityType: "Dialogue",
			entityId: dialogue.id,
			nodeId,
			message,
			severity,
		});
	};
	const reference = (
		values: string[],
		value: string | undefined,
		label: string,
		path: string,
		nodeId: string,
		severity: "error" | "warning" = "error",
	) => {
		if (!value || !values.includes(value))
			add(
				path,
				`Node "${nodeId}" references missing ${label} "${value || "(unset)"}".`,
				value ? severity : "error",
				nodeId,
			);
	};
	const items = project.items.map((item) => item.id);
	const quests = project.quests.map((quest) => quest.id);
	const flags = Object.keys(project.gameState.flags);
	const variables = Object.keys(project.gameState.variables);
	const positive = (value: number, path: string, nodeId: string) => {
		if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value))
			add(
				path,
				`Node "${nodeId}" needs a positive whole quantity.`,
				"error",
				nodeId,
			);
	};
	const condition = (c: DialogueCondition, path: string, nodeId: string) => {
		if (c.type === "flag_is")
			reference(flags, c.flag, "flag", path, nodeId, "warning");
		if (c.type === "variable_compare")
			reference(variables, c.variable, "variable", path, nodeId, "warning");
		if (c.type === "quest_status")
			reference(quests, c.questId, "quest", path, nodeId);
		if (c.type === "has_item" || c.type === "not_has_item") {
			reference(items, c.itemId, "item", path, nodeId);
			positive(c.quantity ?? 1, `${path}.quantity`, nodeId);
		}
	};
	const action = (a: GameAction, path: string, nodeId: string) => {
		if (a.type === "set_flag")
			reference(
				flags,
				a.flag,
				"flag default (actions may create flags)",
				path,
				nodeId,
				"warning",
			);
		if (a.type === "set_variable" || a.type === "change_variable")
			reference(
				variables,
				a.variable,
				"variable default (actions may create variables)",
				path,
				nodeId,
				"warning",
			);
		if (a.type === "change_variable" && !Number.isFinite(a.amount))
			add(path, "Variable change must be finite.", "error", nodeId);
		if (a.type === "give_item" || a.type === "remove_item") {
			if (
				a.type === "give_item" &&
				!a.itemId &&
				project.items.filter((item) => item.category === "currency").length ===
					1
			)
				add(
					path,
					"Give item uses the legacy sole-currency fallback; choose an explicit item.",
					"warning",
					nodeId,
				);
			else reference(items, a.itemId, "item", path, nodeId);
			positive(a.quantity, `${path}.quantity`, nodeId);
		}
		if (
			a.type === "activate_quest" ||
			a.type === "complete_quest" ||
			a.type === "fail_quest"
		)
			reference(quests, a.questId, "quest", path, nodeId);
		if (a.type === "play_cutscene")
			reference(
				project.cutscenes.map((c) => c.id),
				a.cutsceneId,
				"cutscene",
				path,
				nodeId,
			);
		if (a.type === "open_shop") {
			if (!a.shopId && project.shops.length === 1)
				add(
					path,
					"Open shop uses the legacy sole-shop fallback; choose an explicit shop.",
					"warning",
					nodeId,
				);
			else
				reference(
					project.shops.map((s) => s.id),
					a.shopId,
					"shop",
					path,
					nodeId,
				);
		}
		if (a.type === "teleport") {
			reference(
				project.areas.map((area) => area.id),
				a.areaId,
				"area",
				`${path}.areaId`,
				nodeId,
			);
			reference(
				project.areas
					.find((area) => area.id === a.areaId)
					?.eventBlocks.map((e) => e.id) ?? [],
				a.eventBlockId,
				"destination event in selected area",
				`${path}.eventBlockId`,
				nodeId,
			);
		}
		if (a.type === "set_npc_alignment" || a.type === "set_npc_health")
			reference(
				project.areas.flatMap((area) => area.npcs.map((npc) => npc.id)),
				a.npcId,
				"placed NPC",
				path,
				nodeId,
			);
		if (
			a.type === "set_npc_health" &&
			(!Number.isFinite(a.value) || a.value < 0)
		)
			add(path, "NPC health must be a nonnegative number.", "error", nodeId);
	};
	if (!dialogue.startNodeId || !ids.has(dialogue.startNodeId))
		add(
			"startNodeId",
			`Dialogue "${dialogue.name}" has a missing start node "${dialogue.startNodeId || "(unset)"}".`,
		);
	const seen = new Set<string>();
	for (const [index, node] of dialogue.nodes.entries()) {
		const path = `nodes.${index}`;
		if (!node.id || seen.has(node.id))
			add(
				`${path}.id`,
				`Duplicate or empty node ID "${node.id}".`,
				"error",
				node.id,
			);
		seen.add(node.id);
		if (node.portraitId)
			reference(
				[
					...portraitPresets.map((p) => p.id),
					...Object.values(project.pixelAssets)
						.filter((p) => p.kind === "portrait")
						.map((p) => p.id),
				],
				node.portraitId,
				"portrait",
				`${path}.portraitId`,
				node.id,
				"warning",
			);
		if (node.type === "text") {
			if (!node.nextNodeId)
				add(
					`${path}.nextNodeId`,
					`Text node "${node.id}" has no next node; conversation will close. Use End for an explicit terminal.`,
					"warning",
					node.id,
				);
			else if (!ids.has(node.nextNodeId))
				add(
					`${path}.nextNodeId`,
					`Text node "${node.id}" targets missing node "${node.nextNodeId}".`,
					"error",
					node.id,
				);
		}
		if (node.type === "choice") {
			const responses = new Set<string>();
			node.choices.forEach((choice, i) => {
				const cp = `${path}.choices.${i}`;
				if (!choice.id || responses.has(choice.id))
					add(
						`${cp}.id`,
						`Duplicate or empty response ID "${choice.id}" in node "${node.id}".`,
						"error",
						node.id,
					);
				responses.add(choice.id);
				if (!choice.targetNodeId || !ids.has(choice.targetNodeId))
					add(
						`${cp}.targetNodeId`,
						`Response "${choice.text}" targets missing node "${choice.targetNodeId || "(unset)"}".`,
						"error",
						node.id,
					);
				choice.conditions?.forEach(
					(c, j) => void condition(c, `${cp}.conditions.${j}`, node.id),
				);
			});
			if (!node.choices.some((c) => ids.has(c.targetNodeId)))
				add(
					`${path}.choices`,
					`Choice "${node.id}" has no structurally valid responses.`,
					"error",
					node.id,
				);
			if (
				node.choices.length &&
				node.choices.every(
					(c) => (c.conditions?.length ?? 0) > 0 || !ids.has(c.targetNodeId),
				)
			)
				add(
					`${path}.fallback`,
					`Choice "${node.id}" may have no available responses for some game states; add an unconditional fallback.`,
					"warning",
					node.id,
				);
		}
		node.actions?.forEach(
			(a, i) => void action(a, `${path}.actions.${i}`, node.id),
		);
	}
	const reached = new Set<string>();
	const pending = [dialogue.startNodeId];
	while (pending.length) {
		const id = pending.pop()!;
		if (reached.has(id)) continue;
		reached.add(id);
		const node = dialogue.nodes.find((n) => n.id === id);
		if (node?.type === "text" && node.nextNodeId) pending.push(node.nextNodeId);
		if (node?.type === "choice")
			pending.push(...node.choices.map((c) => c.targetNodeId));
	}
	dialogue.nodes.forEach((node, i) => {
		if (!reached.has(node.id))
			add(
				`nodes.${i}.reachable`,
				`Node "${node.id}" is unreachable from Start.`,
				"warning",
				node.id,
			);
	});
	return issues;
}
