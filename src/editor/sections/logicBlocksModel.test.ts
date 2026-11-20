import { describe, expect, it } from "vitest";
import { migrateProject } from "../../data/migrateProject";
import { giveItem } from "../../runtime/inventory";
import {
	createRuntimeState,
	evaluateConditionExpression,
	fireTrigger,
	type RuleActionContext,
} from "../../runtime/ruleEngine";
import { createStoryAuthoringDemo } from "../../test/storyAuthoringDemo";
import { entityAction } from "./dialogueEntities";
import {
	directBehaviourWarning,
	findLogicExpression,
	logicConditionOptions,
	logicGroup,
	makeEntityTrigger,
	makeLogicCondition,
	makeLogicRecipe,
	moveLogicExpression,
	triggerEntityOptions,
} from "./logicBlocksModel";

describe("Logic Blocks mapping", () => {
	it("maps only real triggers and conditions, including exact generated defeat state", () => {
		const p = createStoryAuthoringDemo(),
			areaId = p.areas[0].id;
		const npc = { kind: "npc" as const, areaId, id: "keeper_placed" };
		expect(triggerEntityOptions(p, npc).map((o) => o.id)).toEqual([
			"on_interact",
		]);
		expect(makeEntityTrigger(p, npc, "on_touch")).toBeUndefined();
		expect(
			makeEntityTrigger(
				p,
				{ kind: "event", areaId, id: "beyond_gate" },
				"on_touch",
			),
		).toEqual({ type: "on_touch", targetId: "beyond_gate" });
		expect(
			makeEntityTrigger(p, { kind: "area", id: areaId }, "on_area_enter"),
		).toEqual({ type: "on_area_enter", areaId });
		expect(
			logicConditionOptions(p, { kind: "quest", id: "keeper_job" })[0],
		).toMatchObject({ disabled: true });
		expect(
			makeLogicCondition(p, { kind: "quest", id: "keeper_job" }, "active"),
		).toBeUndefined();
		expect(makeLogicCondition(p, npc, "defeated")).toBeUndefined();
		p.gameState.flags.npc_defeated_keeper_placed = false;
		expect(makeLogicCondition(p, npc, "defeated")).toMatchObject({
			type: "flag_is",
			flag: "npc_defeated_keeper_placed",
			value: true,
		});
		expect(
			directBehaviourWarning(p, { type: "on_interact", targetId: npc.id }),
		).toContain("in addition");
	});
	it("moves nested leaves and groups without regenerating IDs or creating cycles", () => {
		const p = createStoryAuthoringDemo();
		const key = makeLogicCondition(
			p,
			{ kind: "item", id: "harbour_key" },
			"has_item",
		)!;
		const flag = makeLogicCondition(
			p,
			{ kind: "flag", id: "guard_permission" },
			"true",
		)!;
		const any = logicGroup("OR", [flag]),
			root = logicGroup("AND", [key, any]);
		const moved = moveLogicExpression(root, key.id, any.id, flag.id);
		expect(findLogicExpression(moved, any.id)).toMatchObject({
			conditions: [key, flag],
		});
		expect(moveLogicExpression(root, any.id, any.id)).toBe(root);
		expect(moveLogicExpression(root, root.id, any.id)).toBe(root);
		const state = createRuntimeState(p.gameState);
		expect(evaluateConditionExpression(moved, state)).toBe(false);
		state.flags.guard_permission = true;
		expect(evaluateConditionExpression(moved, state)).toBe(true);
		expect(evaluateConditionExpression(root, state)).toBe(false);
		expect(evaluateConditionExpression(logicGroup("OR"), state)).toBe(true);
	});
	it("runs the ordinary recipe with ordered THEN/ELSE and existing once behavior", () => {
		const p = createStoryAuthoringDemo(),
			areaId = p.areas[0].id;
		p.cutscenes.push({
			id: "locked",
			name: "Gate locked",
			backgroundImageId: "stone_gate",
			text: "Bring the key.",
		});
		const rule = makeLogicRecipe(p, {
			kind: "locked",
			target: { kind: "object", areaId, id: "gate_placed" },
			itemId: "harbour_key",
			destination: { kind: "event", areaId, id: "beyond_gate" },
			cutsceneId: "locked",
		})!;
		rule.runPolicy = "once";
		rule.actions.push(
			entityAction(p, { kind: "flag", id: "guard_permission" }, "true")!,
		);
		p.rules.push(rule);
		expect(migrateProject(JSON.parse(JSON.stringify(p))).rules).toEqual(
			p.rules,
		);
		const state = createRuntimeState(p.gameState),
			calls: string[] = [];
		const context: RuleActionContext = {
			state,
			playCutscene: (id, done) => {
				calls.push(id);
				done();
			},
			teleport: () => {
				calls.push(`go:${state.flags.guard_permission}`);
			},
			changeMovementMode: () => {},
			endGame: () => {},
		};
		fireTrigger(rule.trigger, [rule], context);
		expect(calls).toEqual(["locked"]);
		expect(state.completedRuleIds.has(rule.id)).toBe(false);
		giveItem(state.inventory, p.items, "harbour_key", 1);
		fireTrigger(rule.trigger, [rule], context);
		expect(calls).toEqual(["locked", "go:false"]);
		expect(state.flags.guard_permission).toBe(true);
		fireTrigger(rule.trigger, [rule], context);
		expect(calls).toHaveLength(2);
		expect(state.completedRuleIds.has(rule.id)).toBe(true);
	});
});
