import { describe, expect, it } from "vitest";
import { migrateProject } from "../../data/migrateProject";
import { validateDialogue } from "../../data/validateDialogue";
import { createDialogueGraphDemo } from "../../test/dialogueGraphDemo";
import { makeDialogueAction } from "./DialogueActionFields";
import {
	acceptsEntity,
	actionSummary,
	conditionSummary,
	createDialogueEntity,
	type DialogueEntityRef,
	dialogueAssignmentPatch,
	dialogueEntities,
	entityAction,
	entityCondition,
	entityOperations,
	insertDialogueEntity,
	type NewDialogueEntity,
	readDialogueEntity,
	resolveDialogueEntity,
	storyKey,
} from "./dialogueEntities";

describe("dialogue entity references", () => {
	it("offers arithmetic only for numeric story values", () => {
		const p = createDialogueGraphDemo();
		p.gameState.variables.access_code = "001";
		p.gameState.variables.visits = 0;
		expect(
			entityOperations("logic-action", "variable", "001").find(
				(o) => o.id === "change_variable",
			)?.disabled,
		).toBe(true);
		expect(
			entityAction(
				p,
				{ kind: "variable", id: "access_code" },
				"change_variable",
			),
		).toBeUndefined();
		expect(
			entityAction(p, { kind: "variable", id: "visits" }, "change_variable"),
		).toEqual({ type: "change_variable", variable: "visits", amount: 1 });
	});
	it("identifies placements by area and ID, respecting overrides and duplicate names", () => {
		const p = createDialogueGraphDemo();
		const area = p.areas[0];
		area.npcs[0].nameOverride = "Guard";
		p.areas.push({
			...structuredClone(area),
			id: "other",
			name: "Village",
			npcs: [
				{
					...structuredClone(area.npcs[0]),
					id: "second",
					areaId: "other",
					x: 9,
				},
			],
		});
		const entities = dialogueEntities(p).filter((e) => e.ref.kind === "npc");
		expect(entities).toHaveLength(2);
		expect(entities[0].label).toContain("Guard");
		expect(entities[1].label).toBe("Guard — Village (9, 5)");
		expect(
			resolveDialogueEntity(p, { kind: "npc", id: "second", areaId: area.id }),
		).toBeUndefined();
		expect(
			resolveDialogueEntity(p, { kind: "npc", id: "keeper", areaId: area.id }),
		).toBeUndefined();
	});

	it("validates lightweight reference payloads and excludes character conditions", () => {
		expect(readDialogueEntity("not JSON")).toBeUndefined();
		expect(
			readDialogueEntity(JSON.stringify({ kind: "npc", id: "keeper" })),
		).toBeUndefined();
		expect(
			readDialogueEntity(JSON.stringify({ kind: "object", id: "box" })),
		).toBeUndefined();
		expect(
			readDialogueEntity(
				JSON.stringify({
					kind: "item",
					id: "harbour_key",
					snapshot: { name: "Stale" },
				}),
			),
		).toEqual({ kind: "item", id: "harbour_key" });
		expect(
			acceptsEntity("condition", {
				kind: "npc",
				id: "placed",
				areaId: "village",
			}),
		).toBe(false);
		expect(
			acceptsEntity("assignment", { kind: "item", id: "harbour_key" }),
		).toBe(false);
	});

	it("uses existing union fields, current labels, explicit types and stable IDs", () => {
		let p = createDialogueGraphDemo();
		p.gameState.variables.code = "001";
		const item: DialogueEntityRef = { kind: "item", id: "harbour_key" };
		const condition = entityCondition(p, item)!;
		expect(condition).toEqual({
			type: "has_item",
			itemId: "harbour_key",
			quantity: 1,
		});
		expect(entityAction(p, { kind: "quest", id: "keeper_job" })).toEqual({
			type: "activate_quest",
			questId: "keeper_job",
		});
		expect(entityCondition(p, { kind: "variable", id: "code" })).toEqual({
			type: "variable_compare",
			variable: "code",
			operator: "==",
			value: "001",
		});
		p = structuredClone(p);
		p.items[0].name = "Village Key";
		expect(conditionSummary(condition, p)).toBe("Have Village Key ×1");
		p = { ...p, items: [{ ...p.items[0], id: "replacement" }] };
		expect(conditionSummary(condition, p)).toContain(
			"Missing item: harbour_key",
		);
		expect(entityAction(p, item)).toBeUndefined();
		expect(condition).toEqual({
			type: "has_item",
			itemId: "harbour_key",
			quantity: 1,
		});
	});

	it("inserts only at the intended response/node and survives export/import", () => {
		const p = migrateProject(createDialogueGraphDemo());
		const before = structuredClone(p);
		insertDialogueEntity(
			p,
			{
				dialogueId: "keeper_dialogue",
				nodeId: "decision",
				choiceId: "no",
				slot: "condition",
			},
			{ kind: "item", id: "harbour_key" },
		);
		insertDialogueEntity(
			p,
			{ dialogueId: "keeper_dialogue", nodeId: "refused", slot: "action" },
			{ kind: "flag", id: "refused_keeper_job" },
		);
		const choice = p.dialogues[0].nodes[1];
		if (choice.type !== "choice") throw Error();
		expect(choice.choices[1].conditions).toEqual([
			{ type: "has_item", itemId: "harbour_key", quantity: 1 },
		]);
		expect(choice.choices[0]).toEqual(
			(before.dialogues[0].nodes[1] as typeof choice).choices[0],
		);
		expect(p.dialogues[0].nodes[2]).toEqual(before.dialogues[0].nodes[2]);
		expect(p.gameState).toEqual(before.gameState);
		const imported = migrateProject(JSON.parse(JSON.stringify(p)));
		expect(imported.dialogues).toEqual(p.dialogues);
		expect(
			validateDialogue(imported, imported.dialogues[0]).filter(
				(i) => i.severity === "error",
			),
		).toEqual([]);
	});

	it("generates collision-safe state keys and creates minimal ordinary entities", () => {
		const p = createDialogueGraphDemo();
		p.gameState.variables.guard_permission = "001";
		expect(storyKey("Guard permission", p)).toBe("guard_permission_2");
		expect(storyKey("123!", p)).toBe("story_123");
		const draft: NewDialogueEntity = {
			kind: "flag",
			name: "Guard permission",
			category: "key",
			value: false,
			description: "",
		};
		expect(createDialogueEntity(p, draft)).toEqual({
			kind: "flag",
			id: "guard_permission_2",
		});
		const item = createDialogueEntity(p, {
			...draft,
			kind: "item",
			name: "Harbour Key",
		});
		expect(item.id).not.toBe("harbour_key");
		expect(p.items.slice(-1)[0]).toMatchObject({
			id: item.id,
			category: "key",
			stackable: false,
		});
		const quest = createDialogueEntity(p, {
			...draft,
			kind: "quest",
			name: "Village Passage",
		});
		expect(p.quests.slice(-1)[0]).toMatchObject({
			id: quest.id,
			status: "inactive",
			objectiveMode: "sequence",
			objectives: [],
		});
		const value = createDialogueEntity(p, {
			...draft,
			kind: "variable",
			name: "Access code",
			value: "001",
		});
		expect(p.gameState.variables[value.id]).toBe("001");
	});

	it("preserves an entity when switching verbs in Advanced", () => {
		const p = createDialogueGraphDemo();
		expect(
			makeDialogueAction("remove_item", p, {
				type: "give_item",
				itemId: "second_item",
				quantity: 3,
			}),
		).toEqual({ type: "remove_item", itemId: "second_item", quantity: 3 });
		expect(
			makeDialogueAction("fail_quest", p, {
				type: "activate_quest",
				questId: "second_quest",
			}),
		).toEqual({ type: "fail_quest", questId: "second_quest" });
	});

	it("builds a placement override, preserving existing dialogue completion effects and attributes", () => {
		const p = createDialogueGraphDemo();
		const npc = p.areas[0].npcs[0];
		npc.attributesOverride = { canInteract: false, health: 42 };
		npc.interactionOverride = {
			type: "start_dialogue",
			dialogueId: "old",
			activationMode: "disabled",
			prompt: "Ask",
			completionActions: [{ type: "set_flag", flag: "legacy", value: true }],
		};
		const ref: DialogueEntityRef = {
			kind: "npc",
			id: npc.id,
			areaId: p.areas[0].id,
		};
		const before = structuredClone(p);
		const patch = dialogueAssignmentPatch(p, ref, "keeper_dialogue")!;
		expect(p).toEqual(before);
		expect(patch.attributesOverride).toEqual({ canInteract: true, health: 42 });
		expect(patch.interactionOverride).toEqual({
			...npc.interactionOverride,
			dialogueId: "keeper_dialogue",
			activationMode: "on_interact",
		});
		expect(patch.interaction).toEqual(patch.interactionOverride);
		npc.interactionOverride = {
			...npc.interactionOverride,
			type: "collect_item",
			itemId: "harbour_key",
		};
		expect(
			dialogueAssignmentPatch(p, ref, "keeper_dialogue")?.interactionOverride
				?.completionActions,
		).toBeUndefined();
		expect(dialogueAssignmentPatch(p, ref, "deleted_dialogue")).toBeUndefined();
		expect(
			actionSummary({ type: "set_npc_health", npcId: npc.id, value: 50 }, p),
		).toContain("Keeper —");
	});
});
