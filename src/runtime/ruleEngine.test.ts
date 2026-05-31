import { describe, expect, it, vi } from "vitest";
import type { ConditionExpression, GameRule } from "../types/game";
import {
  createRuntimeState,
  evaluateCondition,
  evaluateConditionExpression,
  fireTrigger,
  type RuleActionContext,
} from "./ruleEngine";

function makeContext() {
  const state = createRuntimeState({
    flags: { has_key: true, admin_override: false },
    variables: { gold: 5, lockpick_count: 0, title: "guest" },
  });
  const teleport = vi.fn();
  const context: RuleActionContext = {
    state,
    playCutscene: vi.fn(),
    teleport,
    changeMovementMode: vi.fn(),
    endGame: vi.fn(),
  };

  return { context, state, teleport };
}

describe("rule engine conditions", () => {
  it("evaluates flag conditions", () => {
    const { state } = makeContext();

    expect(evaluateCondition({ id: "has-key", type: "flag_is", flag: "has_key", value: true }, state)).toBe(true);
    expect(evaluateCondition({ id: "override", type: "flag_is", flag: "admin_override", value: true }, state)).toBe(false);
  });

  it("evaluates numeric and text variable conditions", () => {
    const { state } = makeContext();

    expect(evaluateCondition({ id: "gold", type: "variable_compare", variable: "gold", operator: ">=", value: 5 }, state)).toBe(true);
    expect(evaluateCondition({ id: "title", type: "variable_compare", variable: "title", operator: "==", value: "guest" }, state)).toBe(true);
  });

  it("evaluates AND, OR, and nested condition groups", () => {
    const { state } = makeContext();
    const expression: ConditionExpression = {
      id: "root",
      type: "group",
      operator: "OR",
      conditions: [
        {
          id: "requirements",
          type: "group",
          operator: "AND",
          conditions: [
            { id: "has-key", type: "flag_is", flag: "has_key", value: true },
            { id: "gold", type: "variable_compare", variable: "gold", operator: ">=", value: 5 },
          ],
        },
        { id: "override", type: "flag_is", flag: "admin_override", value: true },
      ],
    };

    expect(evaluateConditionExpression(expression, state)).toBe(true);

    state.flags.has_key = false;
    expect(evaluateConditionExpression(expression, state)).toBe(false);

    state.flags.admin_override = true;
    expect(evaluateConditionExpression(expression, state)).toBe(true);
  });

  it("treats missing and empty conditions as always true", () => {
    const { state } = makeContext();

    expect(evaluateConditionExpression(undefined, state)).toBe(true);
    expect(evaluateConditionExpression({ id: "empty", type: "group", operator: "OR", conditions: [] }, state)).toBe(true);
  });
});

describe("rule engine triggers and actions", () => {
  it("runs matching triggers and applies state and teleport actions", () => {
    const { context, state, teleport } = makeContext();
    const rule: GameRule = {
      id: "enter-tavern",
      name: "Enter Tavern",
      enabled: true,
      trigger: { type: "on_interact", targetId: "tavern-door" },
      conditionTree: {
        id: "requirements",
        type: "group",
        operator: "AND",
        conditions: [
          { id: "gold", type: "variable_compare", variable: "gold", operator: ">=", value: 5 },
        ],
      },
      actions: [
        { type: "set_flag", flag: "has_key", value: false },
        { type: "change_variable", variable: "gold", amount: -5 },
        { type: "teleport", areaId: "tavern", eventBlockId: "entry" },
      ],
    };

    fireTrigger({ type: "on_interact", targetId: "tavern-door" }, [rule], context);

    expect(state.flags.has_key).toBe(false);
    expect(state.variables.gold).toBe(0);
    expect(teleport).toHaveBeenCalledWith("tavern", "entry");
  });

  it("does not run disabled or non-matching rules", () => {
    const { context, teleport } = makeContext();
    const rule: GameRule = {
      id: "disabled",
      name: "Disabled",
      enabled: false,
      trigger: { type: "on_touch", targetId: "gate" },
      actions: [{ type: "teleport", areaId: "cave", eventBlockId: "entry" }],
    };

    fireTrigger({ type: "on_touch", targetId: "gate" }, [rule], context);

    expect(teleport).not.toHaveBeenCalled();
  });
});

