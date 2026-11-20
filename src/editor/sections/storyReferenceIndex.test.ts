import { describe, expect, it } from "vitest";
import { migrateProject } from "../../data/migrateProject";
import { createStoryAuthoringDemo } from "../../test/storyAuthoringDemo";
import { entityKey } from "./dialogueEntities";
import { makeEntityObjective, makeFetchObjectives } from "./questSequenceModel";
import {
	commitStoryFetch,
	configureKeyedPassage,
	previewStoryFetch,
} from "./storyRecipes";
import { storyReferenceIndex } from "./storyReferenceIndex";

describe("derived Story reference index", () => {
	it("finds placed NPC, item, quest, dialogue and rule uses with exact owning sources", () => {
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
		p.rules.push({
			id: "gate_rule",
			name: "Gate permission",
			enabled: true,
			trigger: { type: "on_interact", targetId: "gate_placed" },
			conditionTree: {
				id: "permission",
				type: "flag_is",
				flag: "guard_permission",
				value: true,
			},
			actions: [{ type: "give_item", itemId: "harbour_key", quantity: 1 }],
		});
		const before = JSON.stringify(p),
			index = storyReferenceIndex(p);
		expect(storyReferenceIndex(p)).toBe(index);
		expect(JSON.stringify(p)).toBe(before);
		const guard = entityKey({ kind: "npc", areaId, id: "keeper_placed" });
		expect(
			index.outgoing
				.get(guard)
				?.some((e) => e.to.kind === "dialogue" && e.access === "assign"),
		).toBe(true);
		expect(
			index.incoming.get(guard)?.some((e) => e.from.kind === "quest"),
		).toBe(true);
		const itemUses = index.incoming.get(
			entityKey({ kind: "item", id: "harbour_key" }),
		)!;
		expect(itemUses.map((e) => e.from.kind)).toEqual(
			expect.arrayContaining(["object", "quest", "rule"]),
		);
		const start = index.incoming
			.get(entityKey({ kind: "quest", id: "keeper_job" }))!
			.find((e) => e.from.kind === "dialogue" && e.access === "write")!;
		expect(start.source).toEqual({
			section: "dialogues",
			id: "keeper_dialogue",
			nodeId: "accepted",
			field: "actions:1",
		});
		expect(
			index.relationships.some(
				(e) =>
					e.kind === "dependency" &&
					e.from.kind === "quest" &&
					e.to.id === "chest_placed",
			),
		).toBe(true);
		expect(
			index.relationships.some(
				(e) => e.kind === "flow" && e.label === "Response: Yes.",
			),
		).toBe(true);
		expect(
			index.relationships.find(
				(e) => e.from.kind === "rule" && e.to.id === "gate_placed",
			)?.warning,
		).toContain("in addition");
	});
	it("keeps broken targets and dialogue links at their owning fields without retargeting", () => {
		const p = createStoryAuthoringDemo();
		p.items = [{ ...p.items[0], id: "same_name_other_id" }];
		const node = p.dialogues[0].nodes.find((n) => n.id === "decision")!;
		if (node.type !== "choice") throw Error();
		node.choices[0].targetNodeId = "deleted_node";
		const index = storyReferenceIndex(p);
		expect(
			index.relationships.find((e) => e.to.id === "harbour_key")?.missing,
		).toBe(true);
		expect(
			index.relationships.find((e) => e.source.field === "choice:yes"),
		).toMatchObject({
			missing: true,
			toLabel: "Missing node: deleted_node",
			kind: "flow",
		});
		expect(p.dialogues[0].nodes.find((n) => n.id === "decision")).toEqual(node);
	});
	it("previews and commits the shared Fetch and native Door recipes as ordinary data", () => {
		const p = createStoryAuthoringDemo(),
			before = structuredClone(p),
			areaId = p.areas[0].id;
		const preview = previewStoryFetch(
			p,
			{ kind: "npc", areaId, id: "keeper_placed" },
			{ kind: "item", id: "harbour_key" },
			"Fetch the key",
		)!;
		expect(p).toEqual(before);
		expect(commitStoryFetch(p, preview)).toBe(true);
		expect(p.quests[1].objectives.map((o) => o.condition.type)).toEqual([
			"interaction_completed",
			"has_item",
		]);
		expect(p.areas[0].npcs[0].interactionOverride?.dialogueId).toBe(
			preview.dialogue.id,
		);
		expect(p.dialogues[0]).toEqual(before.dialogues[0]);
		p.areas[0].objects[1].interaction = {
			type: "object_behaviour",
			activationMode: "disabled",
		};
		expect(
			configureKeyedPassage(p, {
				door: { kind: "object", areaId, id: "gate_placed" },
				itemId: "harbour_key",
				destination: { kind: "event", areaId, id: "beyond_gate" },
				questId: preview.quest.id,
			}),
		).toBe(true);
		expect(p.quests[1].objectives[2].condition.type).toBe("door_used");
		expect(p.areas[0].objects[1].interaction.activationMode).toBe(
			"on_interact",
		);
		expect(migrateProject(JSON.parse(JSON.stringify(p))).dialogues).toEqual(
			p.dialogues,
		);
		expect(Object.keys(p).sort()).toEqual(Object.keys(before).sort());
	});
});
