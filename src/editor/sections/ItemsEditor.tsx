import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import type { ConditionExpression, GameAction, ItemDefinition } from "../../types/game";

const categories: ItemDefinition["category"][] = ["key", "currency", "consumable", "quest", "misc"];

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Date.now().toString(36)}`;
}

function conditionReferencesItem(expression: ConditionExpression | undefined, itemId: string): boolean {
  if (!expression) {
    return false;
  }

  if (expression.type === "group") {
    return expression.conditions.some((condition) => conditionReferencesItem(condition, itemId));
  }

  return (
    (expression.type === "has_item" || expression.type === "not_has_item") &&
    expression.itemId === itemId
  );
}

function actionReferencesItem(action: GameAction, itemId: string): boolean {
  return (
    (action.type === "give_item" || action.type === "remove_item") &&
    action.itemId === itemId
  );
}

export function ItemsEditor() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [selectedItemId, setSelectedItemId] = useState(project.items[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selectedItem = project.items.find((item) => item.id === selectedItemId);

  useEffect(() => {
    if (!selectedItem) {
      setSelectedItemId(project.items[0]?.id ?? "");
    }
  }, [project.items, selectedItem]);

  function updateItem(patch: Partial<ItemDefinition>) {
    if (!selectedItem) {
      return;
    }

    updateProject((draft) => {
      draft.items = draft.items.map((item) =>
        item.id === selectedItem.id ? { ...item, ...patch } : item,
      );
    });
  }

  function addItem() {
    const id = makeId("item");
    updateProject((draft) => {
      draft.items.push({
        id,
        name: `Item ${draft.items.length + 1}`,
        category: "misc",
        stackable: false,
      });
    });
    setSelectedItemId(id);
    setMessage("");
  }

  function deleteItem() {
    if (!selectedItem) {
      return;
    }

    const pickupReference = project.areas.some((area) =>
      area.pickups.some((pickup) => pickup.itemId === selectedItem.id),
    );
    const ruleReference = project.rules.some(
      (rule) =>
        conditionReferencesItem(rule.conditionTree, selectedItem.id) ||
        [...rule.actions, ...(rule.elseActions ?? [])].some((action) =>
          actionReferencesItem(action, selectedItem.id),
        ),
    );

    if (pickupReference || ruleReference) {
      setMessage(
        `${selectedItem.name} is still referenced by ${pickupReference ? "a pickup" : "a rule"}. Remove those references first.`,
      );
      return;
    }

    updateProject((draft) => {
      draft.items = draft.items.filter((item) => item.id !== selectedItem.id);
      if (draft.gameState.inventory) {
        delete draft.gameState.inventory[selectedItem.id];
      }
    });
    setMessage("");
  }

  return (
    <section className="editor-panel items-editor">
      <aside className="tool-panel">
        <div className="panel-title">Items</div>
        <button className="primary-button full-width" onClick={addItem} type="button">
          Add item
        </button>
        <div className="list-stack item-list">
          {project.items.map((item) => (
            <button
              className={`list-item ${item.id === selectedItemId ? "selected" : ""}`}
              key={item.id}
              onClick={() => {
                setSelectedItemId(item.id);
                setMessage("");
              }}
              type="button"
            >
              <span className="item-icon">{item.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{item.name}</strong>
                <small>{item.category}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="content-panel">
        {selectedItem ? (
          <>
            <div className="panel-title">Item Definition</div>
            <p className="helper-text">
              Items are project definitions. Inventory quantities are copied into runtime state when play starts.
            </p>
            {message ? <div className="validation-message">{message}</div> : null}
            <div className="form-grid">
              <label>
                ID
                <input disabled value={selectedItem.id} />
              </label>
              <label>
                Name
                <input onChange={(event) => updateItem({ name: event.target.value })} value={selectedItem.name} />
              </label>
              <label>
                Category
                <select
                  onChange={(event) =>
                    updateItem({ category: event.target.value as ItemDefinition["category"] })
                  }
                  value={selectedItem.category}
                >
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                onChange={(event) => updateItem({ description: event.target.value })}
                rows={4}
                value={selectedItem.description ?? ""}
              />
            </label>
            <label className="checkbox-row standalone">
              <input
                checked={selectedItem.stackable}
                onChange={(event) =>
                  updateItem({
                    stackable: event.target.checked,
                    maxStack: event.target.checked ? selectedItem.maxStack : undefined,
                  })
                }
                type="checkbox"
              />
              Stackable
            </label>
            {selectedItem.stackable ? (
              <label>
                Maximum stack
                <input
                  min={1}
                  onChange={(event) =>
                    updateItem({ maxStack: Math.max(1, Number(event.target.value)) })
                  }
                  placeholder="Unlimited"
                  type="number"
                  value={selectedItem.maxStack ?? ""}
                />
              </label>
            ) : null}
            <button className="danger-button" onClick={deleteItem} type="button">
              Delete item
            </button>
          </>
        ) : (
          <p className="empty-state">Add an item definition to use inventory rules and pickups.</p>
        )}
      </div>
    </section>
  );
}

