import { describe, expect, it } from "vitest";
import { migrateProject } from "../../data/migrateProject";
import {
	createRuntimeDialogueState,
	enterDialogueNode,
} from "../../runtime/dialogueEngine";
import {
	activateQuest,
	createRuntimeQuestState,
} from "../../runtime/questEngine";
import {
	createRuntimeState,
	type RuleActionContext,
} from "../../runtime/ruleEngine";
import { createDialogueGraphDemo } from "../../test/dialogueGraphDemo";
import { commitQuestGiver, makeQuestGiver } from "./questGiverRecipe";

describe("Quest Giver recipe", () => {
	it("can prepend to an existing conversation while No ends without entering old actions", () => {
		const project = migrateProject(createDialogueGraphDemo());
		const original = structuredClone(project.dialogues[0]);
		const input = {
			character: {
				kind: "npc" as const,
				id: "keeper_placed",
				areaId: project.areas[0].id,
			},
			questId: "keeper_job",
			conversationId: original.id,
			conversationSnapshot: JSON.stringify(original),
		};
		const preview = makeQuestGiver(project, input)!;
		expect(commitQuestGiver(project, input, preview)).toBe(true);
		expect(project.dialogues).toHaveLength(1);
		expect(project.dialogues[0].nodes.slice(4)).toEqual(original.nodes);
		const no = preview.nodes[2];
		expect(
			no.type === "text" &&
				preview.nodes.find((n) => n.id === no.nextNodeId)?.type,
		).toBe("end");
		expect(commitQuestGiver(project, input, preview)).toBe(false);
	});
	it.each([
		"Yes",
		"No",
		"close",
	])("keeps %s effects branch-specific through the unchanged runtime", (route) => {
		const project = migrateProject(createDialogueGraphDemo());
		const ref = {
			kind: "npc" as const,
			areaId: project.areas[0].id,
			id: "keeper_placed",
		};
		project.areas[0].npcs[0].interactionOverride = {
			type: "start_dialogue",
			activationMode: "on_interact",
			dialogueId: "keeper_dialogue",
			completionActions: [{ type: "activate_quest", questId: "keeper_job" }],
		};
		const input = {
			character: ref,
			questId: "keeper_job",
			acceptanceFlag: "accepted_keeper_job",
			refusalFlag: "refused_keeper_job",
		};
		const before = structuredClone(project);
		const dialogue = makeQuestGiver(project, input)!;
		expect(project).toEqual(before);
		expect(commitQuestGiver(project, input, dialogue)).toBe(true);
		expect(project.dialogues[0]).toEqual(before.dialogues[0]);
		expect(
			project.areas[0].npcs[0].interactionOverride?.completionActions,
		).toEqual([]);
		const imported = migrateProject(JSON.parse(JSON.stringify(project)));
		expect(imported.dialogues).toEqual(project.dialogues);
		const state = createRuntimeState(project.gameState);
		const quests = createRuntimeQuestState(project.quests);
		const context: RuleActionContext = {
			state,
			activateQuest: (id) => activateQuest(quests, id),
			playCutscene: (_, done) => done(),
			teleport: () => {},
			changeMovementMode: () => {},
			endGame: () => {},
			stateChanged: () => {},
		};
		const runtime = createRuntimeDialogueState(dialogue);
		const choice = dialogue.nodes[0];
		enterDialogueNode(runtime, choice, context, () => {});
		if (route !== "close" && choice.type === "choice")
			enterDialogueNode(
				runtime,
				dialogue.nodes.find(
					(n) =>
						n.id === choice.choices.find((c) => c.text === route)!.targetNodeId,
				)!,
				context,
				() => {},
			);
		expect(quests.quests[0].status).toBe(
			route === "Yes" ? "active" : "inactive",
		);
		expect(state.flags.accepted_keeper_job).toBe(route === "Yes");
		expect(state.flags.refused_keeper_job).toBe(route === "No");
		expect(project.gameState).toEqual(before.gameState);
		expect(new Set(dialogue.nodes.map((n) => n.id)).size).toBe(4);
		expect(makeQuestGiver(project, input)?.id).not.toBe(dialogue.id);
	});
});
