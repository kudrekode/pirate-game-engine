import type {
  Condition,
  GameAction,
  GameRule,
  GameStateConfig,
  GameStateValue,
  RuleTrigger,
} from "../types/game";

export type RuntimeGameState = {
  flags: Record<string, boolean>;
  variables: Record<string, GameStateValue>;
};

export type RuleActionContext = {
  state: RuntimeGameState;
  playCutscene: (cutsceneId: string, onDone: () => void) => void;
  teleport: (areaId: string, eventBlockId: string) => void;
  changeMovementMode: (mode: "walk" | "sail" | "ride") => void;
  endGame: () => void;
  stateChanged?: () => void;
};

export function createRuntimeState(config: GameStateConfig): RuntimeGameState {
  return {
    flags: { ...config.flags },
    variables: { ...config.variables },
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

export function evaluateCondition(condition: Condition, runtimeState: RuntimeGameState): boolean {
  if (condition.type === "flag_is") {
    return (runtimeState.flags[condition.flag] ?? false) === condition.value;
  }

  const currentValue = runtimeState.variables[condition.variable];
  if (currentValue === undefined) {
    return false;
  }

  return compareValues(currentValue, condition.value, condition.operator);
}

export function evaluateConditions(
  conditions: Condition[],
  runtimeState: RuntimeGameState,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, runtimeState));
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
  const actions = evaluateConditions(rule.conditions, context.state)
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

