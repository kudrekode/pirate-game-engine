import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type {
  ConditionExpression,
  GameAction,
  GameProject,
  SingleCondition,
} from "../../types/game";

type VariableType = "number" | "string";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

function validateIdentifier(
  name: string,
  flags: Record<string, boolean>,
  variables: Record<string, number | string>,
): string {
  if (!name) {
    return "Enter a name.";
  }

  if (!IDENTIFIER_PATTERN.test(name)) {
    return "Use lowercase letters, numbers, and underscores. Start with a letter.";
  }

  if (name in flags || name in variables) {
    return `"${name}" already exists.`;
  }

  return "";
}

function removeActions(actions: GameAction[] | undefined, shouldRemove: (action: GameAction) => boolean) {
  return actions?.filter((action) => !shouldRemove(action));
}

function removeConditionReferences(
  expression: ConditionExpression | undefined,
  shouldRemove: (condition: SingleCondition) => boolean,
): ConditionExpression | undefined {
  if (!expression) {
    return undefined;
  }

  if (expression.type !== "group") {
    return shouldRemove(expression) ? undefined : expression;
  }

  return {
    ...expression,
    conditions: expression.conditions.flatMap((condition) => {
      const nextCondition = removeConditionReferences(condition, shouldRemove);
      return nextCondition ? [nextCondition] : [];
    }),
  };
}

function removeFlagReferences(project: GameProject, flag: string) {
  project.rules = project.rules.map((rule) => ({
    ...rule,
    conditionTree: removeConditionReferences(
      rule.conditionTree,
      (condition) => condition.type === "flag_is" && condition.flag === flag,
    ),
    actions: removeActions(rule.actions, (action) => action.type === "set_flag" && action.flag === flag) ?? [],
    elseActions: removeActions(rule.elseActions, (action) => action.type === "set_flag" && action.flag === flag),
  }));
  project.areas.forEach((area) => {
    area.eventBlocks.forEach((eventBlock) => {
      if (eventBlock.interaction?.type === "set_flag" && eventBlock.interaction.flag === flag) {
        eventBlock.interaction = undefined;
      }
    });
    area.structures.forEach((structure) => {
      if (structure.interaction?.type === "set_flag" && structure.interaction.flag === flag) {
        structure.interaction = undefined;
      }
    });
    area.objects.forEach((object) => {
      if (object.interaction?.type === "set_flag" && object.interaction.flag === flag) {
        object.interaction = undefined;
      }
    });
  });
}

function removeVariableReferences(project: GameProject, variable: string) {
  project.rules = project.rules.map((rule) => ({
    ...rule,
    conditionTree: removeConditionReferences(
      rule.conditionTree,
      (condition) => condition.type === "variable_compare" && condition.variable === variable,
    ),
    actions:
      removeActions(
        rule.actions,
        (action) =>
          (action.type === "change_variable" || action.type === "set_variable") &&
          action.variable === variable,
      ) ?? [],
    elseActions: removeActions(
      rule.elseActions,
      (action) =>
        (action.type === "change_variable" || action.type === "set_variable") &&
        action.variable === variable,
    ),
  }));
}

export function GameStateEditor() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [newFlagName, setNewFlagName] = useState("");
  const [newFlagValue, setNewFlagValue] = useState(false);
  const [newVariableName, setNewVariableName] = useState("");
  const [newVariableType, setNewVariableType] = useState<VariableType>("number");
  const [errorMessage, setErrorMessage] = useState("");

  function addFlag() {
    const name = newFlagName.trim();
    const error = validateIdentifier(name, project.gameState.flags, project.gameState.variables);
    if (error) {
      setErrorMessage(error);
      return;
    }

    updateProject((draft) => {
      draft.gameState.flags[name] = newFlagValue;
    });
    setNewFlagName("");
    setNewFlagValue(false);
    setErrorMessage("");
  }

  function addVariable() {
    const name = newVariableName.trim();
    const error = validateIdentifier(name, project.gameState.flags, project.gameState.variables);
    if (error) {
      setErrorMessage(error);
      return;
    }

    updateProject((draft) => {
      draft.gameState.variables[name] = newVariableType === "number" ? 0 : "";
    });
    setNewVariableName("");
    setErrorMessage("");
  }

  return (
    <section className="editor-panel game-state-editor">
      <div className="content-panel">
        <div className="panel-title">Game State</div>
        <div className="logic-helper">
          Flags and variables are editor defaults. They are copied into separate runtime memory each time Play starts.
        </div>

        {errorMessage ? <div className="validation-message">{errorMessage}</div> : null}

        <section className="state-section">
          <div className="panel-title secondary">Flags</div>
          <div className="state-list">
            {Object.entries(project.gameState.flags).map(([name, value]) => (
              <div className="state-row" key={name}>
                <code>{name}</code>
                <label className="checkbox-row">
                  <input
                    checked={value}
                    onChange={(event) =>
                      updateProject((draft) => {
                        draft.gameState.flags[name] = event.target.checked;
                      })
                    }
                    type="checkbox"
                  />
                  Default {value ? "true" : "false"}
                </label>
                <button
                  className="danger-button compact"
                  onClick={() =>
                    updateProject((draft) => {
                      delete draft.gameState.flags[name];
                      removeFlagReferences(draft, name);
                    })
                  }
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
            {Object.keys(project.gameState.flags).length === 0 ? <p className="empty-state compact">No flags defined.</p> : null}
          </div>
        </section>

        <section className="state-section">
          <div className="panel-title secondary">Variables</div>
          <div className="state-list">
            {Object.entries(project.gameState.variables).map(([name, value]) => (
              <div className="state-row variable" key={name}>
                <code>{name}</code>
                <select
                  aria-label={`${name} type`}
                  onChange={(event) =>
                    updateProject((draft) => {
                      draft.gameState.variables[name] =
                        event.target.value === "number" ? Number(value) || 0 : String(value);
                    })
                  }
                  value={typeof value}
                >
                  <option value="number">Number</option>
                  <option value="string">Text</option>
                </select>
                <input
                  aria-label={`${name} default value`}
                  onChange={(event) =>
                    updateProject((draft) => {
                      draft.gameState.variables[name] =
                        typeof value === "number" ? Number(event.target.value) : event.target.value;
                    })
                  }
                  type={typeof value === "number" ? "number" : "text"}
                  value={value}
                />
                <button
                  className="danger-button compact"
                  onClick={() =>
                    updateProject((draft) => {
                      delete draft.gameState.variables[name];
                      removeVariableReferences(draft, name);
                    })
                  }
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
            {Object.keys(project.gameState.variables).length === 0 ? <p className="empty-state compact">No variables defined.</p> : null}
          </div>
        </section>
      </div>

      <aside className="inspector-panel">
        <div className="panel-title">Add Flag</div>
        <div className="form-stack">
          <label>
            Name
            <input
              onChange={(event) => setNewFlagName(event.target.value)}
              placeholder="has_boat"
              value={newFlagName}
            />
          </label>
          <label className="checkbox-row standalone">
            <input
              checked={newFlagValue}
              onChange={(event) => setNewFlagValue(event.target.checked)}
              type="checkbox"
            />
            Default true
          </label>
          <button onClick={addFlag} type="button">
            Add flag
          </button>
        </div>

        <div className="panel-title">Add Variable</div>
        <div className="form-stack">
          <label>
            Name
            <input
              onChange={(event) => setNewVariableName(event.target.value)}
              placeholder="gold"
              value={newVariableName}
            />
          </label>
          <label>
            Type
            <select
              onChange={(event) => setNewVariableType(event.target.value as VariableType)}
              value={newVariableType}
            >
              <option value="number">Number</option>
              <option value="string">Text</option>
            </select>
          </label>
          <button onClick={addVariable} type="button">
            Add variable
          </button>
        </div>
      </aside>
    </section>
  );
}
