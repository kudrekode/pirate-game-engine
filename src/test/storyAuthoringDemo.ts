import { migrateProject } from "../data/migrateProject";
import { makeLogicRecipe } from "../editor/sections/logicBlocksModel";
import {
	makeEntityObjective,
	makeFetchObjectives,
} from "../editor/sections/questSequenceModel";
import { createDialogueGraphDemo } from "./dialogueGraphDemo";

/** Compact ordinary project shared by authoring and runtime acceptance tests. */
export function createStoryAuthoringDemo() {
	const p = createDialogueGraphDemo(),
		area = p.areas[0];
	p.metadata.name = "Village Passage Story";
	area.name = "Village";
	p.npcs[0].name = "Guard";
	p.dialogues[0].name = "Guard Conversation";
	p.dialogues[0].nodes.forEach((n) => {
		if (n.speaker) n.speaker = "Guard";
	});
	const accepted = p.dialogues[0].nodes.find((n) => n.id === "accepted")!;
	accepted.text = "Thank you. Find the Harbour Key in the Old Chest.";
	accepted.actions = accepted.actions?.filter((a) => a.type !== "give_item");
	p.quests[0].name = "Village Passage";
	p.quests[0].objectiveMode = "sequence";
	p.quests[0].objectives = [];
	p.gameState.flags.guard_permission = false;
	p.objects.push(
		{
			id: "old_chest",
			name: "Old Chest",
			category: "container",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: true,
			defaultBehaviour: {
				type: "container",
				once: true,
				contents: [{ itemId: "harbour_key", quantity: 1 }],
			},
		},
		{
			id: "harbour_gate",
			name: "Harbour Gate",
			category: "door",
			widthTiles: 1,
			heightTiles: 1,
			blocksMovement: true,
			defaultBehaviour: {
				type: "door",
				targetAreaId: area.id,
				targetEventBlockId: "beyond_gate",
				requiredItemId: "harbour_key",
			},
		},
	);
	area.objects.push(
		{
			id: "chest_placed",
			objectDefinitionId: "old_chest",
			areaId: area.id,
			x: 6,
			y: 4,
		},
		{
			id: "gate_placed",
			objectDefinitionId: "harbour_gate",
			areaId: area.id,
			x: 7,
			y: 6,
		},
	);
	area.eventBlocks.push({
		id: "beyond_gate",
		name: "Beyond Gate",
		x: 8,
		y: 5,
		tag: "arrival",
		kind: "spawn",
	});
	return migrateProject(p);
}

export function createCompleteStoryDemo() {
	const p = createStoryAuthoringDemo(),
		areaId = p.areas[0].id;
	p.quests[0].objectives = [
		...makeFetchObjectives(
			p,
			{ kind: "npc", areaId, id: "keeper_placed" },
			{ kind: "item", id: "harbour_key" },
		)!,
		makeEntityObjective(
			p,
			{ kind: "object", areaId, id: "gate_placed" },
			"door_used",
		)!,
	];
	p.quests[0].completionActions = [
		{ type: "set_flag", flag: "keeper_job_done", value: true },
	];
	p.quests[0].completionMessage = "Village Passage complete.";
	p.cutscenes.push({
		id: "gate_locked",
		name: "Gate locked",
		backgroundImageId: "stone_gate",
		text: "Find the Harbour Key in the Old Chest.",
	});
	const rule = makeLogicRecipe(p, {
		kind: "locked",
		target: { kind: "object", areaId, id: "gate_placed" },
		itemId: "harbour_key",
		destination: { kind: "event", areaId, id: "beyond_gate" },
		cutsceneId: "gate_locked",
	})!;
	rule.id = "gate_rule";
	rule.name = "Gate reminder";
	// Keep native Door responsible for travel; this rule only adds locked feedback.
	rule.actions = [];
	p.rules.push(rule);
	return migrateProject(p);
}
