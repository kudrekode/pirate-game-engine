import type {
  ConditionExpression,
  GameAction,
  GameRule,
  GameStateConfig,
  GameStateValue,
  InventoryState,
  ItemDefinition,
  MovementMode,
  NPCAttributes,
  NPCInstance,
  RuleTrigger,
  SingleCondition,
} from "../types/game";
import { createInventory, giveItem, hasItem, removeItem } from "./inventory";

export type RuntimeGameState = {
  flags: Record<string, boolean>;
  variables: Record<string, GameStateValue>;
  inventory: InventoryState;
  npcs: Record<string, NPCAttributes>;
};

export type RuleActionContext = {
  state: RuntimeGameState;
  playCutscene: (cutsceneId: string, onDone: () => void) => void;
  teleport: (areaId: string, eventBlockId: string) => void;
  changeMovementMode: (mode: Exclude<MovementMode, "swim">) => void;
  endGame: () => void;
  activateQuest?: (questId: string) => void;
  completeQuest?: (questId: string) => void;
  failQuest?: (questId: string) => void;
  openShop?: (shopId: string) => void;
  itemDefinitions?: ItemDefinition[];
  stateChanged?: () => void;
};

export function createRuntimeNpcState(npcs: NPCInstance[]): Record<string, NPCAttributes> {
  return Object.fromEntries(
    npcs.map((npc) => [npc.id, { ...npc.attributes }]),
  );
}

export function createRuntimeState(config: GameStateConfig, npcs: NPCInstance[] = []): RuntimeGameState {
  return {
    flags: { ...config.flags },
    variables: { ...config.variables },
    inventory: createInventory(config.inventory),
    npcs: createRuntimeNpcState(npcs),
  };
}

function compareValues(left: GameStateValue, right: GameStateValue, operator: string): boolean {
  if (operator === "==") {
    return left === right;
  }

  if (operator === "!=") {
    return left !== right;
  }

  if (typeof left !== "number" || typeof right !== "number") {
    return false;
  }

  if (operator === ">") {
    return left > right;
  }

  if (operator === "<") {
    return left < right;
  }

  if (operator === ">=") {
    return left >= right;
  }

  return left <= right;
}

export function evaluateCondition(condition: SingleCondition, runtimeState: RuntimeGameState): boolean {
  if (condition.type === "flag_is") {
    return (runtimeState.flags[condition.flag] ?? false) === condition.value;
  }

  if (condition.type === "has_item") {
    return hasItem(runtimeState.inventory, condition.itemId, condition.quantity);
  }

  if (condition.type === "not_has_item") {
    return !hasItem(runtimeState.inventory, condition.itemId, condition.quantity);
  }

  if (condition.type === "npc_alignment") {
    return runtimeState.npcs[condition.npcId]?.alignment === condition.alignment;
  }

  if (condition.type === "npc_health_compare") {
    const health = runtimeState.npcs[condition.npcId]?.health;
    return health !== undefined && compareValues(health, condition.value, condition.operator);
  }

  const currentValue = runtimeState.variables[condition.variable];
  if (currentValue === undefined) {
    return false;
  }

  return compareValues(currentValue, condition.value, condition.operator);
}

export function evaluateConditionExpression(
  expression: ConditionExpression | undefined,
  runtimeState: RuntimeGameState,
): boolean {
  if (!expression) {
    return true;
  }

  if (expression.type !== "group") {
    return evaluateCondition(expression, runtimeState);
  }

  if (expression.conditions.length === 0) {
    return true;
  }

  if (expression.operator === "OR") {
    return expression.conditions.some((condition) =>
      evaluateConditionExpression(condition, runtimeState),
    );
  }

  return expression.conditions.every((condition) =>
    evaluateConditionExpression(condition, runtimeState),
  );
}

export function runAction(
  action: GameAction,
  context: RuleActionContext,
  onDone: () => void,
): void {
  if (action.type === "set_flag") {
    context.state.flags[action.flag] = action.value;
    context.stateChanged?.();
    onDone();
    return;
  }

  if (action.type === "change_variable") {
    const currentValue = context.state.variables[action.variable];
    context.state.variables[action.variable] =
      (typeof currentValue === "number" ? currentValue : 0) + action.amount;
    context.stateChanged?.();
    onDone();
    return;
  }

  if (action.type === "set_variable") {
    context.state.variables[action.variable] = action.value;
    context.stateChanged?.();
    onDone();
    return;
  }

  if (action.type === "play_cutscene") {
    context.playCutscene(action.cutsceneId, onDone);
    return;
  }

  if (action.type === "give_item") {
    giveItem(context.state.inventory, context.itemDefinitions ?? [], action.itemId, action.quantity);
    context.stateChanged?.();
    onDone();
    return;
  }

  if (action.type === "remove_item") {
    removeItem(context.state.inventory, action.itemId, action.quantity);
    context.stateChanged?.();
    onDone();
    return;
  }

  if (action.type === "activate_quest") {
    context.activateQuest?.(action.questId);
    onDone();
    return;
  }

  if (action.type === "complete_quest") {
    context.completeQuest?.(action.questId);
    onDone();
    return;
  }

  if (action.type === "fail_quest") {
    context.failQuest?.(action.questId);
    onDone();
    return;
  }

  if (action.type === "set_npc_alignment") {
    const npc = context.state.npcs[action.npcId];
    if (npc) {
      npc.alignment = action.alignment;
      context.stateChanged?.();
    }
    onDone();
    return;
  }

  if (action.type === "set_npc_health") {
    const npc = context.state.npcs[action.npcId];
    if (npc) {
      npc.health = Math.min(npc.maxHealth, Math.max(0, action.value));
      context.stateChanged?.();
    }
    onDone();
    return;
  }

  if (action.type === "open_shop") {
    context.openShop?.(action.shopId);
    onDone();
    return;
  }

  if (action.type === "teleport") {
    context.teleport(action.areaId, action.eventBlockId);
    onDone();
    return;
  }

  if (action.type === "change_movement_mode") {
    context.changeMovementMode(action.mode);
    onDone();
    return;
  }

  context.endGame();
  onDone();
}

function runActions(actions: GameAction[], context: RuleActionContext, onDone: () => void): void {
  const [action, ...remainingActions] = actions;
  if (!action) {
    onDone();
    return;
  }

  runAction(action, context, () => runActions(remainingActions, context, onDone));
}

export function runRule(rule: GameRule, context: RuleActionContext, onDone: () => void): void {
  const actions = evaluateConditionExpression(rule.conditionTree, context.state)
    ? rule.actions
    : rule.elseActions ?? [];
  runActions(actions, context, onDone);
}

function triggersMatch(expected: RuleTrigger, actual: RuleTrigger): boolean {
  if (expected.type !== actual.type) {
    return false;
  }

  if (expected.type === "on_interact" && actual.type === "on_interact") {
    return expected.targetId === actual.targetId;
  }

  if (expected.type === "on_touch" && actual.type === "on_touch") {
    return expected.targetId === actual.targetId;
  }

  if (expected.type === "on_area_enter" && actual.type === "on_area_enter") {
    return expected.areaId === actual.areaId;
  }

  if (expected.type === "on_cutscene_end" && actual.type === "on_cutscene_end") {
    return expected.cutsceneId === actual.cutsceneId;
  }

  return expected.type === "on_game_start" && actual.type === "on_game_start";
}

export function fireTrigger(
  triggerEvent: RuleTrigger,
  rules: GameRule[],
  context: RuleActionContext,
  onDone: () => void = () => undefined,
): void {
  const matchingRules = rules.filter(
    (rule) => rule.enabled && triggersMatch(rule.trigger, triggerEvent),
  );

  const runNext = ([rule, ...remainingRules]: GameRule[]) => {
    if (!rule) {
      onDone();
      return;
    }

    runRule(rule, context, () => runNext(remainingRules));
  };

  runNext(matchingRules);
}
