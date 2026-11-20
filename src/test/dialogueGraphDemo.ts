import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { blankProject } from "../data/projectPresets";
import { autoLayoutDialogue } from "../editor/sections/dialogueGraphModel";
import type { DialogueDefinition } from "../types/game";

export function createDialogueGraphDemo() {
	const project = cloneProject(blankProject);
	project.metadata.name = "Dialogue Graph V1 Demo";
	project.gameState.flags = {
		accepted_keeper_job: false,
		refused_keeper_job: false,
		keeper_job_done: false,
	};
	project.gameState.variables = { keeper_visits: 0 };
	project.items = [
		{
			...cloneProject(defaultProject).items[0],
			id: "harbour_key",
			name: "Harbour Key",
			category: "key",
			stackable: false,
			maxStack: 1,
		},
	];
	project.quests = [
		{
			id: "keeper_job",
			name: "Harbour Trouble",
			status: "inactive",
			objectives: [
				{
					id: "help",
					description: "Help the Keeper at the harbour",
					condition: { type: "flag", flag: "keeper_job_done", value: true },
				},
			],
		},
	];
	const dialogue: DialogueDefinition = {
		id: "keeper_dialogue",
		name: "Keeper's request",
		startNodeId: "opening",
		nodes: [
			{
				id: "opening",
				type: "text",
				speaker: "Keeper",
				text: "Are you willing to help?",
				nextNodeId: "decision",
			},
			{
				id: "decision",
				type: "choice",
				speaker: "Keeper",
				text: "What do you say?",
				choices: [
					{
						id: "yes",
						text: "Yes.",
						targetNodeId: "accepted",
						conditions: [
							{ type: "flag_is", flag: "accepted_keeper_job", value: false },
						],
					},
					{ id: "no", text: "No.", targetNodeId: "refused" },
					{
						id: "progress",
						text: "I am already helping.",
						targetNodeId: "progress",
						conditions: [
							{ type: "flag_is", flag: "accepted_keeper_job", value: true },
							{ type: "quest_status", questId: "keeper_job", status: "active" },
						],
					},
					{ id: "repeat", text: "Ask me again.", targetNodeId: "opening" },
				],
			},
			{
				id: "accepted",
				type: "text",
				speaker: "Keeper",
				text: "Thank you. Take the Harbour Key.",
				actions: [
					{ type: "set_flag", flag: "accepted_keeper_job", value: true },
					{ type: "activate_quest", questId: "keeper_job" },
					{ type: "give_item", itemId: "harbour_key", quantity: 1 },
				],
				nextNodeId: "end",
			},
			{
				id: "refused",
				type: "text",
				speaker: "Keeper",
				text: "Perhaps another time.",
				actions: [
					{ type: "set_flag", flag: "refused_keeper_job", value: true },
				],
				nextNodeId: "end",
			},
			{
				id: "progress",
				type: "text",
				speaker: "Keeper",
				text: "I remember. Good luck out there.",
				nextNodeId: "end",
			},
			{ id: "end", type: "end", text: "Farewell." },
		],
	};
	dialogue.editorLayout = autoLayoutDialogue(dialogue);
	project.dialogues = [dialogue];
	const area = project.areas[0];
	area.eventBlocks[0].x = 4;
	area.eventBlocks[0].y = 4;
	const keeper = structuredClone(defaultProject.npcs[0]);
	keeper.id = "keeper";
	keeper.name = "Keeper";
	keeper.defaultInteraction = {
		type: "start_dialogue",
		dialogueId: dialogue.id,
		activationMode: "on_interact",
	};
	project.npcs = [keeper];
	area.npcs = [
		{
			id: "keeper_placed",
			npcDefinitionId: keeper.id,
			areaId: area.id,
			x: 4,
			y: 5,
			blocksMovement: true,
			movementMode: "stationary",
			attributes: {
				maxHealth: 100,
				health: 100,
				faction: "keepers",
				alignment: "friendly",
				canInteract: true,
			},
			movementOverride: { movementMode: "stationary" },
			interactionOverride: keeper.defaultInteraction,
		},
	];
	return project;
}
