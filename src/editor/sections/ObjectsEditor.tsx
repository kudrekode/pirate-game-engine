import { useEffect, useState } from "react";
import { makeDefaultObjectBehaviour, ObjectBehaviourEditor } from "../ObjectBehaviourEditor";
import { useProjectStore } from "../../store/useProjectStore";
import type { ObjectDefinition } from "../../types/game";

const categories: ObjectDefinition["category"][] = ["prop", "container", "vehicle", "door", "switch", "sign", "misc"];

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Date.now().toString(36)}`;
}

export function isObjectDefinitionPlaced(
  areas: { objects: { objectDefinitionId: string }[] }[],
  objectDefinitionId: string,
): boolean {
  return areas.some((area) => area.objects.some((object) => object.objectDefinitionId === objectDefinitionId));
}

export function ObjectsEditor() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [selectedObjectId, setSelectedObjectId] = useState(project.objects[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selectedObject = project.objects.find((object) => object.id === selectedObjectId);

  useEffect(() => {
    if (!selectedObject) {
      setSelectedObjectId(project.objects[0]?.id ?? "");
    }
  }, [project.objects, selectedObject]);

  function updateObject(patch: Partial<ObjectDefinition>) {
    if (!selectedObject) {
      return;
    }

    updateProject((draft) => {
      draft.objects = draft.objects.map((object) =>
        object.id === selectedObject.id ? { ...object, ...patch } : object,
      );
    });
  }

  function addObject() {
    const id = makeId("object");
    updateProject((draft) => {
      draft.objects.push({
        id,
        name: `Object ${draft.objects.length + 1}`,
        category: "prop",
        widthTiles: 1,
        heightTiles: 1,
        blocksMovement: false,
      });
    });
    setSelectedObjectId(id);
    setMessage("");
  }

  function deleteObject() {
    if (!selectedObject) {
      return;
    }

    if (isObjectDefinitionPlaced(project.areas, selectedObject.id)) {
      setMessage(`${selectedObject.name} is placed in a map. Delete those instances first.`);
      return;
    }

    if (!window.confirm(`Delete object definition "${selectedObject.name}"?`)) {
      return;
    }

    updateProject((draft) => {
      draft.objects = draft.objects.filter((object) => object.id !== selectedObject.id);
    });
    setMessage("");
  }

  return (
    <section className="editor-panel items-editor">
      <aside className="tool-panel">
        <div className="panel-title">Objects</div>
        <p className="helper-text">Reusable props placed as map object instances.</p>
        <button className="primary-button full-width" onClick={addObject} type="button">Add object</button>
        <div className="list-stack item-list">
          {project.objects.map((object) => (
            <button
              className={`list-item ${object.id === selectedObjectId ? "selected" : ""}`}
              key={object.id}
              onClick={() => {
                setSelectedObjectId(object.id);
                setMessage("");
              }}
              type="button"
            >
              <span className="item-icon">{object.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{object.name}</strong>
                <small>{object.category}</small>
              </span>
            </button>
          ))}
          {project.objects.length === 0 ? <p className="empty-state compact">No object definitions.</p> : null}
        </div>
      </aside>

      <div className="content-panel">
        {selectedObject ? (
          <>
            <div className="panel-title">Object Definition</div>
            <p className="helper-text">Objects are generic map entities between structures and NPCs.</p>
            {message ? <div className="validation-message">{message}</div> : null}
            <div className="form-grid">
              <label>
                ID
                <input disabled value={selectedObject.id} />
              </label>
              <label>
                Name
                <input onChange={(event) => updateObject({ name: event.target.value })} value={selectedObject.name} />
              </label>
              <label>
                Category
                <select onChange={(event) => updateObject({ category: event.target.value as ObjectDefinition["category"] })} value={selectedObject.category}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea onChange={(event) => updateObject({ description: event.target.value })} rows={4} value={selectedObject.description ?? ""} />
            </label>
            <div className="form-grid compact">
              <label>
                Width tiles
                <input min={1} onChange={(event) => updateObject({ widthTiles: Math.max(1, Number(event.target.value)) })} type="number" value={selectedObject.widthTiles} />
              </label>
              <label>
                Height tiles
                <input min={1} onChange={(event) => updateObject({ heightTiles: Math.max(1, Number(event.target.value)) })} type="number" value={selectedObject.heightTiles} />
              </label>
            </div>
            <label className="checkbox-row standalone">
              <input checked={selectedObject.blocksMovement} onChange={(event) => updateObject({ blocksMovement: event.target.checked })} type="checkbox" />
              Blocks movement by default
            </label>
            <div className="panel-title secondary">Default Behaviour</div>
            <ObjectBehaviourEditor
              behaviour={selectedObject.defaultBehaviour ?? makeDefaultObjectBehaviour("none")}
              onChange={(behaviour) => updateObject({ defaultBehaviour: behaviour })}
              project={project}
            />
            <div className="panel-title secondary">Default Interaction</div>
            <label>
              Type
              <select
                onChange={(event) =>
                  updateObject({
                    defaultInteraction: event.target.value === "none"
                      ? undefined
                      : {
                          type: "play_cutscene",
                          activationMode: "on_interact",
                          prompt: "Press E to inspect",
                          cutsceneId: project.cutscenes[0]?.id ?? "",
                        },
                  })
                }
                value={selectedObject.defaultInteraction?.type === "play_cutscene" ? "play_cutscene" : "none"}
              >
                <option value="none">None</option>
                <option value="play_cutscene">Play cutscene</option>
              </select>
            </label>
            {selectedObject.defaultInteraction?.type === "play_cutscene" ? (
              <label>
                Cutscene
                <select
                  onChange={(event) =>
                    updateObject({
                      defaultInteraction: {
                        ...selectedObject.defaultInteraction!,
                        cutsceneId: event.target.value,
                      },
                    })
                  }
                  value={selectedObject.defaultInteraction.cutsceneId ?? ""}
                >
                  {project.cutscenes.map((cutscene) => <option key={cutscene.id} value={cutscene.id}>{cutscene.name}</option>)}
                </select>
              </label>
            ) : null}
            <button className="danger-button" onClick={deleteObject} type="button">Delete object</button>
          </>
        ) : (
          <p className="empty-state">Add an object definition to place generic props in maps.</p>
        )}
      </div>
    </section>
  );
}
