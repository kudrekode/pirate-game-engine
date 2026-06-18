import { describe, expect, it } from "vitest";
import type { DialogueDefinition } from "../types/game";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
	getDialogueNode,
} from "./dialogueEngine";
import { giveItem } from "./inventory";
import {
	activateQuest,
	createRuntimeQuestState,
	type RuntimeQuestState,
} from "./questEngine";
import { createRuntimeState, type RuleActionContext } from "./ruleEngine";

function makeDialogue(): DialogueDefinition {
	return {
		id: "dialogue",
		name: "Captain Talk",
		startNodeId: "start",
		nodes: [
			{
				id: "start",
				type: "text",
				speaker: "Captain",
				text: "Need work?",
				nextNodeId: "choice",
			},
			{
				id: "choice",
				type: "choice",
				text: "What do you say?",
				choices: [
					{ id: "yes", text: "Yes", targetNodeId: "accepted" },
					{
						id: "rich",
						text: "I have silver",
						targetNodeId: "accepted",
						conditions: [{ type: "has_item", itemId: "silver", quantity: 3 }],
					},
				],
			},
			{
				id: "accepted",
				type: "end",
				text: "Good.",
			},
		],
	};
}

function makeQuestState(): RuntimeQuestState {
	return createRuntimeQuestState([
		{
			id: "quest",
			name: "Quest",
			status: "inactive",
			objectives: [],
		},
	]);
}

describe("dialogueEngine", () => {
	it("navigates text and choice nodes", () => {
		const dialogue = makeDialogue();
		const state = createRuntimeDialogueState(dialogue);

		expect(state.nodeId).toBe("start");
		expect(advanceDialogue(dialogue, state)?.id).toBe("choice");
		expect(advanceDialogue(dialogue, state, "yes")?.id).toBe("accepted");
		expect(advanceDialogue(dialogue, state)).toBeUndefined();
	});

	it("filters conditional choices by runtime inventory", () => {
		const dialogue = makeDialogue();
		const runtimeState = createRuntimeState({
			flags: {},
			variables: {},
			inventory: {},
		});
		const questState = makeQuestState();
		const choiceNode = getDialogueNode(dialogue, "choice");
		expect(choiceNode?.type).toBe("choice");
		if (!choiceNode) {
			throw new Error("Expected choice node");
		}

		expect(
			getAvailableDialogueChoices(choiceNode, runtimeState, questState).map(
				(choice) => choice.id,
			),
		).toEqual(["yes"]);

		giveItem(
			runtimeState.inventory,
			[{ id: "silver", name: "Silver", category: "currency", stackable: true }],
			"silver",
			3,
		);

		expect(
			getAvailableDialogueChoices(choiceNode, runtimeState, questState).map(
				(choice) => choice.id,
			),
		).toEqual(["yes", "rich"]);
	});

	it("runs node actions once when a node is entered", () => {
		const dialogue: DialogueDefinition = {
			id: "dialogue",
			name: "Flag Talk",
			startNodeId: "start",
			nodes: [
				{
					id: "start",
					type: "text",
					text: "Done.",
					actions: [{ type: "set_flag", flag: "talked", value: true }],
				},
			],
		};
		const runtimeState = createRuntimeState({
			flags: { talked: false },
			variables: {},
			inventory: {},
		});
		const questState = makeQuestState();
		const dialogueState = createRuntimeDialogueState(dialogue);
		const context: RuleActionContext = {
			state: runtimeState,
			playCutscene: (_cutsceneId, onDone) => onDone(),
			teleport: () => undefined,
			changeMovementMode: () => undefined,
			endGame: () => undefined,
			stateChanged: () => undefined,
		};
		const node = getDialogueNode(dialogue, "start");
		expect(node).toBeDefined();
		if (!node) {
			throw new Error("Expected start node");
		}

		enterDialogueNode(dialogueState, node, context, () => undefined);
		enterDialogueNode(dialogueState, node, context, () => undefined);

		expect(runtimeState.flags.talked).toBe(true);
		expect(getAvailableDialogueChoices(node, runtimeState, questState)).toEqual(
			[],
		);
	});

	it("can activate a quest from a dialogue node action", () => {
		const dialogue: DialogueDefinition = {
			id: "dialogue",
			name: "Quest Talk",
			startNodeId: "start",
			nodes: [
				{
					id: "start",
					type: "text",
					text: "Take this quest.",
					actions: [{ type: "activate_quest", questId: "quest" }],
				},
			],
		};
		const runtimeState = createRuntimeState({
			flags: {},
			variables: {},
			inventory: {},
		});
		const questState = makeQuestState();
		const context: RuleActionContext = {
			state: runtimeState,
			playCutscene: (_cutsceneId, onDone) => onDone(),
			teleport: () => undefined,
			changeMovementMode: () => undefined,
			endGame: () => undefined,
			activateQuest: (questId) => activateQuest(questState, questId),
		};
		const startNode = getDialogueNode(dialogue, "start");
		expect(startNode).toBeDefined();
		if (!startNode) {
			throw new Error("Expected start node");
		}

		enterDialogueNode(
			createRuntimeDialogueState(dialogue),
			startNode,
			context,
			() => undefined,
		);

		expect(questState.quests[0].status).toBe("active");
	});
});
