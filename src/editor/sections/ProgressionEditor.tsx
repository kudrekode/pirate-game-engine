import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type {
  Condition,
  GameAction,
  GameRule,
  GameStateValue,
  RuleTrigger,
  VariableComparisonOperator,
} from "../../types/game";

const triggerTypes: { label: string; value: RuleTrigger["type"] }[] = [
  { label: "Game starts", value: "on_game_start" },
  { label: "Player interacts with", value: "on_interact" },
  { label: "Player touches", value: "on_touch" },
  { label: "Player enters area", value: "on_area_enter" },
  { label: "Cutscene ends", value: "on_cutscene_end" },
];

const actionTypes: { label: string; value: GameAction["type"] }[] = [
  { label: "Set flag", value: "set_flag" },
  { label: "Change variable by", value: "change_variable" },
  { label: "Set variable", value: "set_variable" },
  { label: "Play cutscene", value: "play_cutscene" },
  { label: "Teleport player", value: "teleport" },
  { label: "Change movement mode", value: "change_movement_mode" },
  { label: "End game", value: "end_game" },
];

const comparisonOperators: VariableComparisonOperator[] = ["==", "!=", ">", "<", ">=", "<="];

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Date.now().toString(36)}`;
}

function readValue(rawValue: string, referenceValue: GameStateValue): GameStateValue {
  return typeof referenceValue === "number" ? Number(rawValue) : rawValue;
}

function triggerSummary(trigger: RuleTrigger, labels: Record<string, string>): string {
  if (trigger.type === "on_game_start") {
    return "WHEN game starts";
  }

  if (trigger.type === "on_interact") {
    return `WHEN player interacts with ${labels[trigger.targetId] ?? (trigger.targetId || "a target")}`;
  }

  if (trigger.type === "on_touch") {
    return `WHEN player touches ${labels[trigger.targetId] ?? (trigger.targetId || "an event")}`;
  }

  if (trigger.type === "on_area_enter") {
    return `WHEN player enters ${labels[trigger.areaId] ?? (trigger.areaId || "an area")}`;
  }

  return `WHEN cutscene ends: ${labels[trigger.cutsceneId] ?? (trigger.cutsceneId || "a cutscene")}`;
}

export function ProgressionEditor() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [selectedRuleId, setSelectedRuleId] = useState(project.rules[0]?.id ?? "");

  const selectedRule = project.rules.find((rule) => rule.id === selectedRuleId);
  const flagNames = Object.keys(project.gameState.flags);
  const variableNames = Object.keys(project.gameState.variables);
  const firstArea = project.areas[0];
  const firstEventBlock = firstArea?.eventBlocks[0];
  const firstCutscene = project.cutscenes[0];

  const interactTargets = useMemo(
    () =>
      project.areas.flatMap((area) => [
        ...area.structures.map((structure) => ({
          id: structure.id,
          label: `${area.name}: ${structure.name} (structure)`,
        })),
        ...area.eventBlocks.map((eventBlock) => ({
          id: eventBlock.id,
          label: `${area.name}: ${eventBlock.name} (event)`,
        })),
      ]),
    [project.areas],
  );
  const touchTargets = useMemo(
    () =>
      project.areas.flatMap((area) =>
        area.eventBlocks.map((eventBlock) => ({
          id: eventBlock.id,
          label: `${area.name}: ${eventBlock.name}`,
        })),
      ),
    [project.areas],
  );
  const labels = useMemo(
    () =>
      Object.fromEntries([
        ...interactTargets.map((target) => [target.id, target.label]),
        ...touchTargets.map((target) => [target.id, target.label]),
        ...project.areas.map((area) => [area.id, area.name]),
        ...project.cutscenes.map((cutscene) => [cutscene.id, cutscene.name]),
      ]),
    [interactTargets, project.areas, project.cutscenes, touchTargets],
  );

  useEffect(() => {
    if (!selectedRule || !project.rules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(project.rules[0]?.id ?? "");
    }
  }, [project.rules, selectedRule, selectedRuleId]);

  function updateRule(rule: GameRule) {
    updateProject((draft) => {
      draft.rules = draft.rules.map((candidate) => (candidate.id === rule.id ? rule : candidate));
    });
  }

  function createRule() {
    const rule: GameRule = {
      id: makeId("rule"),
      name: `Rule ${project.rules.length + 1}`,
      enabled: true,
      trigger: { type: "on_game_start" },
      conditions: [],
      actions: [],
    };
    updateProject((draft) => {
      draft.rules.push(rule);
    });
    setSelectedRuleId(rule.id);
  }

  function deleteRule(id: string) {
    updateProject((draft) => {
      draft.rules = draft.rules.filter((rule) => rule.id !== id);
    });
  }

  function duplicateRule(rule: GameRule) {
    const duplicate = {
      ...JSON.parse(JSON.stringify(rule)),
      id: makeId("rule"),
      name: `${rule.name} Copy`,
    } as GameRule;
    updateProject((draft) => {
      draft.rules.push(duplicate);
    });
    setSelectedRuleId(duplicate.id);
  }

  function makeTrigger(type: RuleTrigger["type"]): RuleTrigger {
    if (type === "on_interact") {
      return { type, targetId: interactTargets[0]?.id ?? "" };
    }

    if (type === "on_touch") {
      return { type, targetId: touchTargets[0]?.id ?? "" };
    }

    if (type === "on_area_enter") {
      return { type, areaId: firstArea?.id ?? "" };
    }

    if (type === "on_cutscene_end") {
      return { type, cutsceneId: firstCutscene?.id ?? "" };
    }

    return { type: "on_game_start" };
  }

  function makeCondition(type: Condition["type"]): Condition {
    if (type === "flag_is") {
      return { type, flag: flagNames[0] ?? "", value: true };
    }

    const variable = variableNames[0] ?? "";
    return {
      type,
      variable,
      operator: "==",
      value: project.gameState.variables[variable] ?? 0,
    };
  }

  function makeAction(type: GameAction["type"]): GameAction {
    if (type === "set_flag") {
      return { type, flag: flagNames[0] ?? "", value: true };
    }

    if (type === "change_variable") {
      return { type, variable: variableNames[0] ?? "", amount: 1 };
    }

    if (type === "set_variable") {
      const variable = variableNames[0] ?? "";
      return { type, variable, value: project.gameState.variables[variable] ?? 0 };
    }

    if (type === "play_cutscene") {
      return { type, cutsceneId: firstCutscene?.id ?? "" };
    }

    if (type === "teleport") {
      return {
        type,
        areaId: firstArea?.id ?? "",
        eventBlockId: firstEventBlock?.id ?? "",
      };
    }

    if (type === "change_movement_mode") {
      return { type, mode: "walk" };
    }

    return { type: "end_game" };
  }

  function renderTrigger(rule: GameRule) {
    return (
      <div className="logic-sentence">
        <strong>WHEN</strong>
        <select
          onChange={(event) => updateRule({ ...rule, trigger: makeTrigger(event.target.value as RuleTrigger["type"]) })}
          value={rule.trigger.type}
        >
          {triggerTypes.map((trigger) => (
            <option key={trigger.value} value={trigger.value}>
              {trigger.label}
            </option>
          ))}
        </select>
        {rule.trigger.type === "on_interact" ? (
          <select
            onChange={(event) => updateRule({ ...rule, trigger: { type: "on_interact", targetId: event.target.value } })}
            value={rule.trigger.targetId}
          >
            {interactTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        ) : null}
        {rule.trigger.type === "on_touch" ? (
          <select
            onChange={(event) => updateRule({ ...rule, trigger: { type: "on_touch", targetId: event.target.value } })}
            value={rule.trigger.targetId}
          >
            {touchTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        ) : null}
        {rule.trigger.type === "on_area_enter" ? (
          <select
            onChange={(event) => updateRule({ ...rule, trigger: { type: "on_area_enter", areaId: event.target.value } })}
            value={rule.trigger.areaId}
          >
            {project.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
        ) : null}
        {rule.trigger.type === "on_cutscene_end" ? (
          <select
            onChange={(event) => updateRule({ ...rule, trigger: { type: "on_cutscene_end", cutsceneId: event.target.value } })}
            value={rule.trigger.cutsceneId}
          >
            {project.cutscenes.map((cutscene) => <option key={cutscene.id} value={cutscene.id}>{cutscene.name}</option>)}
          </select>
        ) : null}
      </div>
    );
  }

  function renderCondition(rule: GameRule, condition: Condition, index: number) {
    return (
      <div className="logic-row" key={`${rule.id}_condition_${index}`}>
        <select
          onChange={(event) => {
            const conditions = [...rule.conditions];
            conditions[index] = makeCondition(event.target.value as Condition["type"]);
            updateRule({ ...rule, conditions });
          }}
          value={condition.type}
        >
          <option value="flag_is">Flag is</option>
          <option value="variable_compare">Variable comparison</option>
        </select>
        {condition.type === "flag_is" ? (
          <>
            <select
              onChange={(event) => {
                const conditions = [...rule.conditions];
                conditions[index] = { ...condition, flag: event.target.value };
                updateRule({ ...rule, conditions });
              }}
              value={condition.flag}
            >
              {flagNames.map((flag) => <option key={flag} value={flag}>{flag}</option>)}
            </select>
            <span>is</span>
            <select
              onChange={(event) => {
                const conditions = [...rule.conditions];
                conditions[index] = { ...condition, value: event.target.value === "true" };
                updateRule({ ...rule, conditions });
              }}
              value={String(condition.value)}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </>
        ) : (
          <>
            <select
              onChange={(event) => {
                const variable = event.target.value;
                const conditions = [...rule.conditions];
                conditions[index] = {
                  ...condition,
                  variable,
                  value: project.gameState.variables[variable] ?? 0,
                };
                updateRule({ ...rule, conditions });
              }}
              value={condition.variable}
            >
              {variableNames.map((variable) => <option key={variable} value={variable}>{variable}</option>)}
            </select>
            <select
              onChange={(event) => {
                const conditions = [...rule.conditions];
                conditions[index] = { ...condition, operator: event.target.value as VariableComparisonOperator };
                updateRule({ ...rule, conditions });
              }}
              value={condition.operator}
            >
              {comparisonOperators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
            </select>
            <input
              onChange={(event) => {
                const conditions = [...rule.conditions];
                conditions[index] = { ...condition, value: readValue(event.target.value, condition.value) };
                updateRule({ ...rule, conditions });
              }}
              type={typeof condition.value === "number" ? "number" : "text"}
              value={condition.value}
            />
          </>
        )}
        <button
          className="danger-button compact"
          onClick={() => updateRule({ ...rule, conditions: rule.conditions.filter((_, conditionIndex) => conditionIndex !== index) })}
          type="button"
        >
          Delete
        </button>
      </div>
    );
  }

  function updateActions(rule: GameRule, branch: "actions" | "elseActions", actions: GameAction[]) {
    updateRule({ ...rule, [branch]: actions });
  }

  function renderAction(rule: GameRule, action: GameAction, index: number, branch: "actions" | "elseActions") {
    const actions = branch === "actions" ? rule.actions : rule.elseActions ?? [];
    const setAction = (nextAction: GameAction) => {
      const nextActions = [...actions];
      nextActions[index] = nextAction;
      updateActions(rule, branch, nextActions);
    };

    return (
      <div className="logic-row" key={`${rule.id}_${branch}_${index}`}>
        <select onChange={(event) => setAction(makeAction(event.target.value as GameAction["type"]))} value={action.type}>
          {actionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        {action.type === "set_flag" ? (
          <>
            <select onChange={(event) => setAction({ ...action, flag: event.target.value })} value={action.flag}>
              {flagNames.map((flag) => <option key={flag} value={flag}>{flag}</option>)}
            </select>
            <select onChange={(event) => setAction({ ...action, value: event.target.value === "true" })} value={String(action.value)}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </>
        ) : null}
        {action.type === "change_variable" ? (
          <>
            <select onChange={(event) => setAction({ ...action, variable: event.target.value })} value={action.variable}>
              {variableNames.map((variable) => <option key={variable} value={variable}>{variable}</option>)}
            </select>
            <input onChange={(event) => setAction({ ...action, amount: Number(event.target.value) })} type="number" value={action.amount} />
          </>
        ) : null}
        {action.type === "set_variable" ? (
          <>
            <select
              onChange={(event) => {
                const variable = event.target.value;
                setAction({ ...action, variable, value: project.gameState.variables[variable] ?? 0 });
              }}
              value={action.variable}
            >
              {variableNames.map((variable) => <option key={variable} value={variable}>{variable}</option>)}
            </select>
            <input
              onChange={(event) => setAction({ ...action, value: readValue(event.target.value, action.value) })}
              type={typeof action.value === "number" ? "number" : "text"}
              value={action.value}
            />
          </>
        ) : null}
        {action.type === "play_cutscene" ? (
          <select onChange={(event) => setAction({ ...action, cutsceneId: event.target.value })} value={action.cutsceneId}>
            {project.cutscenes.map((cutscene) => <option key={cutscene.id} value={cutscene.id}>{cutscene.name}</option>)}
          </select>
        ) : null}
        {action.type === "teleport" ? (
          <>
            <select
              onChange={(event) => {
                const area = project.areas.find((candidate) => candidate.id === event.target.value);
                setAction({ ...action, areaId: event.target.value, eventBlockId: area?.eventBlocks[0]?.id ?? "" });
              }}
              value={action.areaId}
            >
              {project.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <select onChange={(event) => setAction({ ...action, eventBlockId: event.target.value })} value={action.eventBlockId}>
              {(project.areas.find((area) => area.id === action.areaId)?.eventBlocks ?? []).map((eventBlock) => (
                <option key={eventBlock.id} value={eventBlock.id}>{eventBlock.name}</option>
              ))}
            </select>
          </>
        ) : null}
        {action.type === "change_movement_mode" ? (
          <select onChange={(event) => setAction({ ...action, mode: event.target.value as "walk" | "sail" | "ride" })} value={action.mode}>
            <option value="walk">walk</option>
            <option value="sail">sail</option>
            <option value="ride">ride</option>
          </select>
        ) : null}
        <button
          className="danger-button compact"
          onClick={() => updateActions(rule, branch, actions.filter((_, actionIndex) => actionIndex !== index))}
          type="button"
        >
          Delete
        </button>
      </div>
    );
  }

  function renderActions(rule: GameRule, branch: "actions" | "elseActions", heading: string) {
    const actions = branch === "actions" ? rule.actions : rule.elseActions ?? [];
    return (
      <section className="logic-block">
        <div className="logic-block-heading">{heading}</div>
        {actions.map((action, index) => renderAction(rule, action, index, branch))}
        <button onClick={() => updateActions(rule, branch, [...actions, makeAction("set_flag")])} type="button">
          Add action
        </button>
      </section>
    );
  }

  return (
    <section className="editor-panel progression-editor">
      <aside className="tool-panel logic-rule-list">
        <div className="panel-title">Rules</div>
        <button className="primary-button full-width" onClick={createRule} type="button">Add rule</button>
        {project.rules.map((rule) => (
          <button
            className={`logic-rule-item ${selectedRuleId === rule.id ? "selected" : ""}`}
            key={rule.id}
            onClick={() => setSelectedRuleId(rule.id)}
            type="button"
          >
            <strong>{rule.name}</strong>
            <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
            <small>{triggerSummary(rule.trigger, labels)}</small>
          </button>
        ))}
      </aside>

      <div className="content-panel logic-editor">
        {selectedRule ? (
          <>
            <div className="rule-editor-heading">
              <div className="panel-title">Friendly Logic Builder</div>
              <label className="checkbox-row">
                <input
                  checked={selectedRule.enabled}
                  onChange={(event) => updateRule({ ...selectedRule, enabled: event.target.checked })}
                  type="checkbox"
                />
                Enabled
              </label>
            </div>
            <label>
              Rule name
              <input onChange={(event) => updateRule({ ...selectedRule, name: event.target.value })} value={selectedRule.name} />
            </label>
            <section className="logic-block">{renderTrigger(selectedRule)}</section>
            <section className="logic-block">
              <div className="logic-block-heading">IF</div>
              {selectedRule.conditions.length === 0 ? <div className="logic-helper">Always run</div> : null}
              {selectedRule.conditions.map((condition, index) => renderCondition(selectedRule, condition, index))}
              <button onClick={() => updateRule({ ...selectedRule, conditions: [...selectedRule.conditions, makeCondition("flag_is")] })} type="button">
                Add condition
              </button>
            </section>
            {renderActions(selectedRule, "actions", "THEN")}
            {renderActions(selectedRule, "elseActions", "ELSE")}
            <div className="inline-actions">
              <button onClick={() => duplicateRule(selectedRule)} type="button">Duplicate rule</button>
              <button className="danger-button" onClick={() => deleteRule(selectedRule.id)} type="button">Delete rule</button>
            </div>
            <details className="legacy-progression">
              <summary>Legacy linear progression ({project.progression.length} steps)</summary>
              <p>Preserved for existing projects while friendly rules are introduced.</p>
            </details>
          </>
        ) : (
          <p className="empty-state">Add a rule to define game logic.</p>
        )}
      </div>
    </section>
  );
}
