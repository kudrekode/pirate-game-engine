import { describe, expect, it } from "vitest";
import { migrateProject } from "../../data/migrateProject";
import { createGameSave, restoreGameSave } from "../../runtime/gameSave";
import { giveItem } from "../../runtime/inventory";
import {
	createRuntimeQuestState,
	recordQuestFact,
	updateQuestProgress,
} from "../../runtime/questEngine";
import { createRuntimeState } from "../../runtime/ruleEngine";
import { createRuntimeSession } from "../../runtime/runtimeSession";
import { createStoryAuthoringDemo } from "../../test/storyAuthoringDemo";
import {
	makeEntityObjective,
	makeFetchObjectives,
	objectiveWarnings,
	questEntityOptions,
} from "./questSequenceModel";
import { moveStoryEntry } from "./StoryActionStack";

describe("Quest Sequence entity mapping", () => {
	it("maps all supported entities, rejects prop lookalikes and validates real capabilities", () => {
		const p = createStoryAuthoringDemo(),
			areaId = p.areas[0].id;
		const character = { kind: "npc" as const, areaId, id: "keeper_placed" };
		const mappings = [
			[character, "interaction_completed"],
			[
				{ kind: "object" as const, areaId, id: "chest_placed" },
				"container_opened",
			],
			[{ kind: "object" as const, areaId, id: "gate_placed" }, "door_used"],
			[{ kind: "event" as const, areaId, id: "beyond_gate" }, "enter_event"],
			[{ kind: "area" as const, id: areaId }, "enter_area"],
			[{ kind: "item" as const, id: "harbour_key" }, "has_item"],
			[{ kind: "flag" as const, id: "guard_permission" }, "false"],
		] as const;
		for (const [ref, operation] of mappings)
			expect(makeEntityObjective(p, ref, operation)?.condition.type).toBe(
				operation === "false" ? "flag" : operation,
			);
		p.areas[0].objects[0].interaction = {
			type: "object_behaviour",
			activationMode: "disabled",
		};
		expect(
			makeEntityObjective(p, mappings[1][0], "container_opened"),
		).toBeUndefined();
		p.areas[0].objects[1].behaviourOverride = { type: "none" };
		expect(questEntityOptions(p, mappings[2][0])).toEqual([]);
		p.areas[0].objects[1].behaviourOverride = { type: "door" };
		expect(questEntityOptions(p, mappings[2][0])[0]).toMatchObject({
			disabled: true,
		});
		p.areas[0].npcs[0].attributesOverride = { canInteract: false };
		expect(
			makeEntityObjective(p, character, "interaction_completed"),
		).toBeUndefined();
	});
	it("preserves IDs through reorder/import and progresses the ordinary Talk → Have → Use sequence", () => {
		const p = createStoryAuthoringDemo(),
			q = p.quests[0],
			areaId = p.areas[0].id;
		q.objectives = [
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
		const ids = q.objectives.map((o) => o.id);
		expect(moveStoryEntry(q.objectives, 1, 2).map((o) => o.id)).toEqual([
			ids[0],
			ids[2],
			ids[1],
		]);
		expect(migrateProject(JSON.parse(JSON.stringify(p))).quests).toEqual(
			p.quests,
		);
		const quests = createRuntimeQuestState([{ ...q, status: "active" }]),
			state = createRuntimeState(p.gameState);
		recordQuestFact(quests, "interaction_completed", areaId, "keeper_placed");
		updateQuestProgress(quests, state, p.items);
		expect(quests.completedObjectiveIds.size).toBe(1);
		giveItem(state.inventory, p.items, "harbour_key", 1);
		updateQuestProgress(quests, state, p.items);
		expect(quests.completedObjectiveIds.size).toBe(2);
		recordQuestFact(quests, "door_used", areaId, "gate_placed");
		updateQuestProgress(quests, state, p.items);
		expect(quests.quests[0].status).toBe("completed");
		const session = createRuntimeSession(p);
		session.runtimeQuestState = quests;
		session.runtimeState.flags = state.flags;
		session.runtimeState.variables = state.variables;
		session.runtimeState.inventory = state.inventory;
		const restored = restoreGameSave(p, createGameSave(p, session));
		expect(restored.runtimeQuestState.completedObjectiveIds).toEqual(
			quests.completedObjectiveIds,
		);
		expect(restored.runtimeQuestState.facts).toEqual(quests.facts);
		expect(restored.runtimeQuestState.quests[0].status).toBe("completed");
		expect(q.status).toBe("inactive");
		q.objectives.push({ ...q.objectives[0], id: "repeat" });
		expect(objectiveWarnings(p, q, q.objectives[3]).join(" ")).toContain(
			"again later",
		);
		const missing = structuredClone(p);
		missing.items = [];
		expect(
			objectiveWarnings(
				missing,
				missing.quests[0],
				missing.quests[0].objectives[1],
			)[0],
		).toContain("Missing item");
	});
});
