import { describe, expect, it } from "vitest";
import type { ItemDefinition, Quest } from "../types/game";
import { createRuntimeState } from "./ruleEngine";
import {
  activateQuest,
  completeQuest,
  createRuntimeQuestState,
  evaluateObjectiveCondition,
  failQuest,
  grantQuestReward,
  markAreaEntered,
  updateQuestProgress,
} from "./questEngine";

const items: ItemDefinition[] = [
  { id: "gold_coin", name: "Gold Coin", category: "currency", stackable: true, maxStack: 99 },
  { id: "boat_pass", name: "Boat Pass", category: "quest", stackable: false },
];

function makeRuntimeState() {
  return createRuntimeState({
    flags: { cave_open: true },
    variables: { gold: 10 },
    inventory: { gold_coin: 5 },
  });
}

function makeQuest(): Quest {
  return {
    id: "tavern-access",
    name: "Get Tavern Access",
    status: "active",
    objectives: [
      { id: "coins", description: "Have coins", condition: { type: "has_item", itemId: "gold_coin", quantity: 5 } },
      { id: "flag", description: "Open cave", condition: { type: "flag", flag: "cave_open", value: true } },
      { id: "gold", description: "Save gold", condition: { type: "variable_compare", variable: "gold", operator: ">=", value: 10 } },
      { id: "enter", description: "Enter tavern", condition: { type: "enter_area", areaId: "tavern" } },
    ],
    rewards: [{ type: "item", itemId: "boat_pass", quantity: 1 }],
  };
}

describe("quest objective evaluation", () => {
  it("evaluates item, flag, variable, and entered-area objectives", () => {
    const runtimeState = makeRuntimeState();
    const enteredAreaIds = new Set(["tavern"]);

    expect(evaluateObjectiveCondition({ type: "has_item", itemId: "gold_coin", quantity: 5 }, runtimeState, enteredAreaIds)).toBe(true);
    expect(evaluateObjectiveCondition({ type: "flag", flag: "cave_open", value: true }, runtimeState, enteredAreaIds)).toBe(true);
    expect(evaluateObjectiveCondition({ type: "variable_compare", variable: "gold", operator: ">=", value: 10 }, runtimeState, enteredAreaIds)).toBe(true);
    expect(evaluateObjectiveCondition({ type: "enter_area", areaId: "tavern" }, runtimeState, enteredAreaIds)).toBe(true);
  });
});

describe("quest progress", () => {
  it("completes a quest automatically and grants rewards once", () => {
    const runtimeState = makeRuntimeState();
    const questState = createRuntimeQuestState([makeQuest()]);
    markAreaEntered(questState, "tavern");

    expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
    expect(questState.quests[0].status).toBe("completed");
    expect(runtimeState.inventory.items.boat_pass).toBe(1);

    expect(updateQuestProgress(questState, runtimeState, items)).toBe(false);
    expect(completeQuest(questState, "tavern-access", runtimeState, items)).toBe(false);
    expect(runtimeState.inventory.items.boat_pass).toBe(1);
  });

  it("activates, completes, and fails quests explicitly", () => {
    const runtimeState = makeRuntimeState();
    const quest = makeQuest();
    quest.status = "inactive";
    const questState = createRuntimeQuestState([quest]);

    expect(activateQuest(questState, quest.id)).toBe(true);
    expect(questState.quests[0].status).toBe("active");
    expect(failQuest(questState, quest.id)).toBe(true);
    expect(questState.quests[0].status).toBe("failed");
    expect(completeQuest(questState, quest.id, runtimeState, items)).toBe(true);
    expect(questState.quests[0].status).toBe("completed");
    expect(runtimeState.inventory.items.boat_pass).toBe(1);
  });

  it("keeps achieved objectives complete after their source value changes", () => {
    const runtimeState = makeRuntimeState();
    const quest = makeQuest();
    quest.objectives = [quest.objectives[0], quest.objectives[3]];
    const questState = createRuntimeQuestState([quest]);

    expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
    runtimeState.inventory.items.gold_coin = 0;
    markAreaEntered(questState, "tavern");

    expect(updateQuestProgress(questState, runtimeState, items)).toBe(true);
    expect(questState.quests[0].status).toBe("completed");
  });

  it("grants flag and variable rewards through existing game state", () => {
    const runtimeState = makeRuntimeState();

    grantQuestReward({ type: "flag", flag: "reward_claimed", value: true }, runtimeState, items);
    grantQuestReward({ type: "variable", variable: "gold", amount: 4 }, runtimeState, items);

    expect(runtimeState.flags.reward_claimed).toBe(true);
    expect(runtimeState.variables.gold).toBe(14);
  });
});
