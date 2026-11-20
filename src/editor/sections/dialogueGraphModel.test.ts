import { describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { migrateProject } from "../../data/migrateProject";
import { validateDialogue } from "../../data/validateDialogue";
import { validateProject } from "../../data/validateProject";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
} from "../../runtime/dialogueEngine";
import {
	createGameSave,
	gameSaveProjectId,
	restoreGameSave,
} from "../../runtime/gameSave";
import { startRuntimeSession } from "../../runtime/runtimeProgression";
import { createRuntimeRuleContext } from "../../runtime/runtimeRuleActionDispatcher";
import { createRuntimeSession } from "../../runtime/runtimeSession";
import { createDialogueGraphDemo } from "../../test/dialogueGraphDemo";
import type { DialogueDefinition, GameAction } from "../../types/game";
import {
	autoLayoutDialogue,
	connectDialogue,
	dialogueLinks,
	duplicateDialogue,
	duplicateDialogueNode,
	makeChoice,
	makeNode,
	removeDialogueNode,
	reorder,
} from "./dialogueGraphModel";

describe("dialogue graph authoring contract", () => {
	it("creates stable IDs and connects/disconnects only legal output shapes", () => {
		const text = makeNode("text"),
			choice = makeNode("choice"),
			end = makeNode("end");
		if (choice.type !== "choice") throw Error();
		choice.choices = [makeChoice(), makeChoice()];
		let d: DialogueDefinition = {
			id: "d",
			name: "D",
			startNodeId: text.id,
			nodes: [text, choice, end],
		};
		d = connectDialogue(d, text.id, choice.id);
		d = connectDialogue(d, choice.id, end.id, choice.choices[0].id);
		expect(dialogueLinks(d).map((link) => link.target)).toEqual([
			choice.id,
			end.id,
			"",
		]);
		expect(connectDialogue(d, end.id, text.id).nodes).toEqual(d.nodes);
		expect(connectDialogue(d, text.id, "missing")).toBe(d);
		d = connectDialogue(d, text.id, "");
		d = connectDialogue(d, choice.id, "", choice.choices[0].id);
		expect(dialogueLinks(d).every((link) => !link.target)).toBe(true);
		expect(
			new Set([text.id, choice.id, end.id, ...choice.choices.map((c) => c.id)])
				.size,
		).toBe(5);
	});
	it("reorders without changing identity and duplicates with fresh IDs and remapped links", () => {
		const d = createDialogueGraphDemo().dialogues[0];
		const choice = d.nodes[1];
		if (choice.type !== "choice") throw Error();
		expect(reorder(choice.choices, 0, 1)[1]).toBe(choice.choices[0]);
		const copy = duplicateDialogueNode(choice);
		expect(copy.id).not.toBe(choice.id);
		if (copy.type !== "choice") throw Error();
		expect(
			copy.choices.some((c) => choice.choices.some((o) => o.id === c.id)),
		).toBe(false);
		const duplicate = duplicateDialogue(d);
		expect(
			duplicate.nodes.some((node) => node.id === duplicate.startNodeId),
		).toBe(true);
		expect(
			dialogueLinks(duplicate).every((link) =>
				duplicate.nodes.some((node) => node.id === link.target),
			),
		).toBe(true);
		expect(Object.keys(duplicate.editorLayout!.nodes)).toEqual(
			duplicate.nodes.map((node) => node.id),
		);
	});
	it("disconnects incoming branches on deletion without choosing a replacement start", () => {
		const result = removeDialogueNode(
			createDialogueGraphDemo().dialogues[0],
			"opening",
		);
		expect(result.startNodeId).toBe("");
		expect(
			dialogueLinks(result).some((link) => link.target === "opening"),
		).toBe(false);
		expect(result.editorLayout!.nodes.opening).toBeUndefined();
	});
	it("round trips content, order and layout, ignores malformed layout and preserves deleted state", () => {
		const p = migrateProject(createDialogueGraphDemo()),
			d = p.dialogues[0];
		d.editorLayout!.nodes.opening = { x: -155.25, y: 82.75 };
		expect(migrateProject(JSON.parse(JSON.stringify(p))).dialogues).toEqual(
			p.dialogues,
		);
		const hash = gameSaveProjectId(p);
		d.editorLayout!.nodes.opening.x = 800;
		expect(gameSaveProjectId(p)).toBe(hash);
		delete d.editorLayout;
		expect(gameSaveProjectId(p)).toBe(hash);
		d.editorLayout = {
			nodes: {
				missing: { x: 1, y: 2 },
				opening: { x: NaN, y: 5 },
				decision: { x: -3, y: 4 },
			},
		};
		expect(migrateProject(p).dialogues[0].editorLayout?.nodes).toEqual({
			decision: { x: -3, y: 4 },
		});
		d.nodes = [];
		d.startNodeId = "";
		expect(migrateProject(p).dialogues[0]).toMatchObject({
			nodes: [],
			startNodeId: "",
		});
	});
	it("lays out 30 nodes with choices and cycles without reordering semantics", () => {
		const d = createDialogueGraphDemo().dialogues[0];
		while (d.nodes.length < 30) {
			const node = makeNode("text");
			if (node.type === "text") node.nextNodeId = "decision";
			d.nodes.push(node);
		}
		const before = JSON.stringify(d.nodes),
			layout = autoLayoutDialogue(d);
		expect(Object.keys(layout.nodes)).toHaveLength(30);
		expect(JSON.stringify(d.nodes)).toBe(before);
		expect(
			new Set(Object.values(layout.nodes).map((p) => `${p.x}:${p.y}`)).size,
		).toBe(30);
	});
	it("runs real ordered entry actions and restores saved branch conditions without mutating defaults", () => {
		const p = migrateProject(createDialogueGraphDemo()),
			d = p.dialogues[0],
			before = JSON.stringify(p);
		const session = createRuntimeSession(p);
		startRuntimeSession(
			session,
			(done) => done(),
			() => {},
		);
		const cursor = createRuntimeDialogueState(d),
			choice = advanceDialogue(d, cursor)!;
		expect(
			getAvailableDialogueChoices(
				choice,
				session.runtimeState,
				session.runtimeQuestState,
			).map((c) => c.id),
		).toEqual(["yes", "no", "repeat"]);
		enterDialogueNode(
			cursor,
			advanceDialogue(d, cursor, "yes")!,
			createRuntimeRuleContext(session, () => {}),
			() => {},
		);
		expect(session.runtimeState.flags.accepted_keeper_job).toBe(true);
		expect(session.runtimeState.inventory.items.harbour_key).toBe(1);
		expect(session.runtimeQuestState.quests[0].status).toBe("active");
		advanceDialogue(d, cursor);
		expect(advanceDialogue(d, cursor)).toBeUndefined();
		const continued = restoreGameSave(p, createGameSave(p, session));
		expect(continued.dialogue).toBeUndefined();
		const reopened = advanceDialogue(d, createRuntimeDialogueState(d))!;
		expect(
			getAvailableDialogueChoices(
				reopened,
				continued.runtimeState,
				continued.runtimeQuestState,
			).map((c) => c.id),
		).toEqual(["no", "progress", "repeat"]);
		const actions: GameAction[] = [
			{ type: "set_variable", variable: "keeper_visits", value: 2 },
			{ type: "change_variable", variable: "keeper_visits", amount: 3 },
		];
		const node = { ...d.nodes[5], actions };
		enterDialogueNode(
			createRuntimeDialogueState(d),
			node,
			createRuntimeRuleContext(continued, () => {}),
			() => {},
		);
		expect(continued.runtimeState.variables.keeper_visits).toBe(5);
		enterDialogueNode(
			createRuntimeDialogueState(d),
			{ ...node, actions: reorder(actions, 0, 1) },
			createRuntimeRuleContext(continued, () => {}),
			() => {},
		);
		expect(continued.runtimeState.variables.keeper_visits).toBe(2);
		expect(JSON.stringify(p)).toBe(before);
	});
});

describe("dialogue diagnostics", () => {
	it("preserves the runtime's legacy sole-currency and sole-shop fallbacks as warnings", () => {
		const p = createDialogueGraphDemo();
		p.items = structuredClone(defaultProject.items)
			.filter((item) => item.category === "currency")
			.slice(0, 1);
		p.shops = structuredClone(defaultProject.shops).slice(0, 1);
		const d: DialogueDefinition = {
			id: "legacy",
			name: "Legacy",
			startNodeId: "end",
			nodes: [
				{
					id: "end",
					type: "end",
					actions: [
						{ type: "give_item", itemId: "", quantity: 1 },
						{ type: "open_shop", shopId: "" },
					],
				},
			],
		};
		expect(validateDialogue(p, d).map((issue) => issue.severity)).toEqual([
			"warning",
			"warning",
		]);
	});
	it("accepts loops, warns for dead ends/unreachable/no fallback and errors on broken links and duplicate IDs", () => {
		const p = createDialogueGraphDemo(),
			d = p.dialogues[0];
		expect(validateDialogue(p, d)).toEqual([]);
		d.nodes.push({ id: "orphan", type: "text", text: "Unreachable" });
		expect(
			validateDialogue(p, d).filter((i) => i.severity === "warning"),
		).toHaveLength(2);
		d.startNodeId = "missing";
		d.nodes.push({
			id: "opening",
			type: "text",
			text: "Duplicate",
			nextNodeId: "gone",
		});
		const choice = d.nodes[1];
		if (choice.type !== "choice") throw Error();
		choice.choices = [
			{
				id: "c",
				text: "Yes",
				targetNodeId: "gone",
				conditions: [
					{ type: "flag_is", flag: "accepted_keeper_job", value: true },
				],
			},
			{
				id: "c",
				text: "No",
				targetNodeId: "",
				conditions: [{ type: "has_item", itemId: "missing" }],
			},
		];
		const messages = validateDialogue(p, d)
			.map((i) => i.message)
			.join("\n");
		for (const part of [
			"missing start",
			"Duplicate",
			"targets missing",
			"unconditional fallback",
			"no structurally valid",
			"missing item",
		])
			expect(messages).toContain(part);
	});
	it("checks condition/action references, scoped destinations and assigned dialogues", () => {
		const p = createDialogueGraphDemo(),
			d = p.dialogues[0];
		d.nodes[0].actions = [
			{ type: "give_item", itemId: "bad", quantity: 0 },
			{ type: "remove_item", itemId: "", quantity: 1 },
			{ type: "activate_quest", questId: "bad" },
			{ type: "complete_quest", questId: "bad" },
			{ type: "fail_quest", questId: "bad" },
			{ type: "teleport", areaId: "bad", eventBlockId: "bad" },
			{ type: "teleport", areaId: p.areas[0].id, eventBlockId: "bad" },
			{ type: "open_shop", shopId: "bad" },
			{ type: "play_cutscene", cutsceneId: "bad" },
			{ type: "set_npc_health", npcId: "bad", value: 10 },
			{ type: "set_npc_alignment", npcId: "bad", alignment: "friendly" },
			{ type: "set_flag", flag: "undeclared", value: true },
			{ type: "set_variable", variable: "undeclared", value: 1 },
		];
		const choice = d.nodes[1];
		if (choice.type !== "choice") throw Error();
		choice.choices[0].conditions = [
			{
				type: "variable_compare",
				variable: "missing",
				value: 1,
				operator: "==",
			},
			{ type: "quest_status", questId: "missing", status: "active" },
			{ type: "not_has_item", itemId: "missing" },
		];
		const issues = validateDialogue(p, d);
		for (const label of [
			"item",
			"quest",
			"area",
			"destination",
			"shop",
			"cutscene",
			"placed NPC",
			"variable",
		])
			expect(issues.some((i) => i.message.includes(`missing ${label}`))).toBe(
				true,
			);
		expect(
			issues.find((i) => i.message.includes("flag default"))?.severity,
		).toBe("warning");
		p.areas[0].npcs[0].interactionOverride = {
			type: "start_dialogue",
			dialogueId: "bad",
			activationMode: "on_interact",
		};
		expect(
			validateProject(p).some((i) =>
				i.message.includes('missing dialogue "bad"'),
			),
		).toBe(true);
	});
});
