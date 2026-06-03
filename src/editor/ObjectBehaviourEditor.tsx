import { terrainPresets } from "../data/mapVisuals";
import type { GameProject, ObjectBehaviour } from "../types/game";

export function makeDefaultObjectBehaviour(type: ObjectBehaviour["type"]): ObjectBehaviour {
  if (type === "container") {
    return { type, contents: [], once: true };
  }

  if (type === "door") {
    return { type };
  }

  if (type === "sign") {
    return { type, text: "A simple sign." };
  }

  if (type === "vehicle") {
    return {
      type,
      vehicleType: "boat",
      movementMode: "sail",
      allowedTerrainIds: ["water"],
      dismountAllowedTerrainIds: ["grass", "dirt"],
      speedMultiplier: 1,
    };
  }

  return { type: "none" };
}

type ObjectBehaviourEditorProps = {
  behaviour: ObjectBehaviour;
  onChange: (behaviour: ObjectBehaviour) => void;
  project: GameProject;
};

function toggleId(ids: string[], id: string, checked: boolean): string[] {
  return checked ? Array.from(new Set([...ids, id])) : ids.filter((candidate) => candidate !== id);
}

export function ObjectBehaviourEditor({ behaviour, onChange, project }: ObjectBehaviourEditorProps) {
  return (
    <div className="form-stack">
      <label>
        Behaviour
        <select
          onChange={(event) => onChange(makeDefaultObjectBehaviour(event.target.value as ObjectBehaviour["type"]))}
          value={behaviour.type}
        >
          <option value="none">None</option>
          <option value="container">Container</option>
          <option value="door">Door</option>
          <option value="sign">Sign</option>
          <option value="vehicle">Vehicle</option>
        </select>
      </label>

      {behaviour.type === "container" ? (
        <>
          <label className="checkbox-row standalone">
            <input onChange={(event) => onChange({ ...behaviour, once: event.target.checked })} checked={behaviour.once} type="checkbox" />
            Give contents once
          </label>
          <label>
            Opened flag
            <input onChange={(event) => onChange({ ...behaviour, openedFlag: event.target.value || undefined })} placeholder="chest_opened" value={behaviour.openedFlag ?? ""} />
          </label>
          {behaviour.contents.map((content, index) => (
            <div className="quest-reward-row" key={`${content.itemId}_${index}`}>
              <select
                onChange={(event) => {
                  const contents = [...behaviour.contents];
                  contents[index] = { ...content, itemId: event.target.value };
                  onChange({ ...behaviour, contents });
                }}
                value={content.itemId}
              >
                {project.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <input
                min={1}
                onChange={(event) => {
                  const contents = [...behaviour.contents];
                  contents[index] = { ...content, quantity: Math.max(1, Number(event.target.value)) };
                  onChange({ ...behaviour, contents });
                }}
                type="number"
                value={content.quantity}
              />
              <button className="danger-button compact" onClick={() => onChange({ ...behaviour, contents: behaviour.contents.filter((_, contentIndex) => contentIndex !== index) })} type="button">Delete</button>
            </div>
          ))}
          <button onClick={() => onChange({ ...behaviour, contents: [...behaviour.contents, { itemId: project.items[0]?.id ?? "", quantity: 1 }] })} type="button">Add content</button>
        </>
      ) : null}

      {behaviour.type === "door" ? (
        <>
          <label>
            Target area
            <select onChange={(event) => onChange({ ...behaviour, targetAreaId: event.target.value, targetEventBlockId: project.areas.find((area) => area.id === event.target.value)?.eventBlocks[0]?.id })} value={behaviour.targetAreaId ?? ""}>
              <option value="">None</option>
              {project.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </label>
          <label>
            Target spawn/event
            <select onChange={(event) => onChange({ ...behaviour, targetEventBlockId: event.target.value || undefined })} value={behaviour.targetEventBlockId ?? ""}>
              <option value="">None</option>
              {(project.areas.find((area) => area.id === behaviour.targetAreaId)?.eventBlocks ?? []).map((eventBlock) => (
                <option key={eventBlock.id} value={eventBlock.id}>{eventBlock.name}</option>
              ))}
            </select>
          </label>
          <label>
            Required item
            <select onChange={(event) => onChange({ ...behaviour, requiredItemId: event.target.value || undefined })} value={behaviour.requiredItemId ?? ""}>
              <option value="">None</option>
              {project.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Locked cutscene
            <select onChange={(event) => onChange({ ...behaviour, lockedCutsceneId: event.target.value || undefined })} value={behaviour.lockedCutsceneId ?? ""}>
              <option value="">None</option>
              {project.cutscenes.map((cutscene) => <option key={cutscene.id} value={cutscene.id}>{cutscene.name}</option>)}
            </select>
          </label>
        </>
      ) : null}

      {behaviour.type === "sign" ? (
        <label>
          Sign text
          <textarea onChange={(event) => onChange({ ...behaviour, text: event.target.value })} rows={4} value={behaviour.text} />
        </label>
      ) : null}

      {behaviour.type === "vehicle" ? (
        <>
          <div className="form-grid compact">
            <label>
              Vehicle type
              <select onChange={(event) => onChange({ ...behaviour, vehicleType: event.target.value as "boat" | "horse" | "cart" })} value={behaviour.vehicleType}>
                <option value="boat">Boat</option>
                <option value="horse">Horse</option>
                <option value="cart">Cart</option>
              </select>
            </label>
            <label>
              Movement mode
              <select onChange={(event) => onChange({ ...behaviour, movementMode: event.target.value as "sail" | "ride" | "drive" })} value={behaviour.movementMode}>
                <option value="sail">Sail</option>
                <option value="ride">Ride</option>
                <option value="drive">Drive</option>
              </select>
            </label>
            <label>
              Speed multiplier
              <input min={0.1} max={10} step={0.1} onChange={(event) => onChange({ ...behaviour, speedMultiplier: Math.max(0.1, Number(event.target.value)) })} type="number" value={behaviour.speedMultiplier ?? 1} />
            </label>
          </div>
          <div className="panel-title secondary">Allowed Terrain</div>
          <div className="checkbox-grid">
            {terrainPresets.map((terrain) => (
              <label className="checkbox-row" key={terrain.id}>
                <input checked={behaviour.allowedTerrainIds.includes(terrain.id)} onChange={(event) => onChange({ ...behaviour, allowedTerrainIds: toggleId(behaviour.allowedTerrainIds, terrain.id, event.target.checked) })} type="checkbox" />
                {terrain.label}
              </label>
            ))}
          </div>
          <div className="panel-title secondary">Dismount Terrain</div>
          <div className="checkbox-grid">
            {terrainPresets.map((terrain) => (
              <label className="checkbox-row" key={terrain.id}>
                <input checked={behaviour.dismountAllowedTerrainIds.includes(terrain.id)} onChange={(event) => onChange({ ...behaviour, dismountAllowedTerrainIds: toggleId(behaviour.dismountAllowedTerrainIds, terrain.id, event.target.checked) })} type="checkbox" />
                {terrain.label}
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
