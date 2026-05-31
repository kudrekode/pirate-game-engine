import { useEffect, useState } from "react";
import { characterSprites, portraitPresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";
import type { NPCDefinition } from "../../types/game";

export function isNpcDefinitionPlaced(
  areas: { npcs: { npcDefinitionId: string }[] }[],
  npcDefinitionId: string,
): boolean {
  return areas.some((area) => area.npcs.some((npc) => npc.npcDefinitionId === npcDefinitionId));
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Date.now().toString(36)}`;
}

export function NpcsEditor() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [selectedNpcId, setSelectedNpcId] = useState(project.npcs[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selectedNpc = project.npcs.find((npc) => npc.id === selectedNpcId);

  useEffect(() => {
    if (!selectedNpc) {
      setSelectedNpcId(project.npcs[0]?.id ?? "");
    }
  }, [project.npcs, selectedNpc]);

  function updateNpc(patch: Partial<NPCDefinition>) {
    if (!selectedNpc) {
      return;
    }

    updateProject((draft) => {
      draft.npcs = draft.npcs.map((npc) => npc.id === selectedNpc.id ? { ...npc, ...patch } : npc);
    });
  }

  function addNpc() {
    const id = makeId("npc");
    updateProject((draft) => {
      draft.npcs.push({
        id,
        name: `NPC ${draft.npcs.length + 1}`,
        mapAvatarId: characterSprites[0]?.id ?? "scout",
        portraitId: portraitPresets[0]?.id,
      });
    });
    setSelectedNpcId(id);
    setMessage("");
  }

  function deleteNpc() {
    if (!selectedNpc) {
      return;
    }

    const isPlaced = isNpcDefinitionPlaced(project.areas, selectedNpc.id);
    if (isPlaced) {
      setMessage(`${selectedNpc.name} is placed in a map. Delete those instances first.`);
      return;
    }

    if (!window.confirm(`Delete NPC definition "${selectedNpc.name}"?`)) {
      return;
    }

    updateProject((draft) => {
      draft.npcs = draft.npcs.filter((npc) => npc.id !== selectedNpc.id);
    });
    setMessage("");
  }

  return (
    <section className="editor-panel npcs-editor">
      <aside className="tool-panel">
        <div className="panel-title">NPCs</div>
        <p className="helper-text">Reusable character definitions. Place instances from the Map tab.</p>
        <button className="primary-button full-width" onClick={addNpc} type="button">Add NPC</button>
        <div className="list-stack npc-list">
          {project.npcs.map((npc) => (
            <button className={`list-item ${npc.id === selectedNpcId ? "selected" : ""}`} key={npc.id} onClick={() => setSelectedNpcId(npc.id)} type="button">
              {npc.name}
            </button>
          ))}
          {project.npcs.length === 0 ? <p className="empty-state compact">No NPC definitions.</p> : null}
        </div>
      </aside>

      <div className="content-panel">
        {selectedNpc ? (
          <>
            <div className="panel-title">NPC Definition</div>
            {message ? <div className="validation-message">{message}</div> : null}
            <div className="form-grid compact">
              <label>
                Name
                <input onChange={(event) => updateNpc({ name: event.target.value })} value={selectedNpc.name} />
              </label>
            </div>
            <label>
              Description
              <textarea onChange={(event) => updateNpc({ description: event.target.value })} rows={3} value={selectedNpc.description ?? ""} />
            </label>
            <div className="panel-title secondary">Map Avatar</div>
            <div className="preset-grid">
              {characterSprites.map((sprite) => (
                <button className={`preset-card ${selectedNpc.mapAvatarId === sprite.id ? "selected" : ""}`} key={sprite.id} onClick={() => updateNpc({ mapAvatarId: sprite.id })} type="button">
                  <span className="avatar-preview small" style={{ background: sprite.color, color: sprite.accent }}>{sprite.label.slice(0, 1)}</span>
                  {sprite.label}
                </button>
              ))}
            </div>
            <div className="panel-title">Portrait</div>
            <div className="preset-grid">
              {portraitPresets.map((portrait) => (
                <button className={`preset-card ${selectedNpc.portraitId === portrait.id ? "selected" : ""}`} key={portrait.id} onClick={() => updateNpc({ portraitId: portrait.id })} type="button">
                  <span className="avatar-preview small" style={{ background: portrait.color, color: portrait.accent }}>{portrait.label.slice(0, 1)}</span>
                  {portrait.label}
                </button>
              ))}
            </div>
            <button className="danger-button" onClick={deleteNpc} type="button">Delete NPC</button>
          </>
        ) : (
          <p className="empty-state">Add an NPC definition to place friendly characters in maps.</p>
        )}
      </div>

      <aside className="inspector-panel">
        <div className="panel-title">Placed NPC Overview</div>
        {project.areas.flatMap((area) =>
          area.npcs.map((npc) => {
            const definition = project.npcs.find((candidate) => candidate.id === npc.npcDefinitionId);
            return (
              <div className="npc-overview-item" key={npc.id}>
                <strong>{definition?.name ?? "NPC"}</strong>
                <div className="npc-overview-meta">{npc.attributes.alignment}</div>
                <div className="npc-overview-meta">{npc.attributes.faction}</div>
                <div className="npc-overview-meta">Health {npc.attributes.health}/{npc.attributes.maxHealth}</div>
                <div className="npc-overview-meta">{area.name}</div>
              </div>
            );
          }),
        )}
        {project.areas.every((area) => area.npcs.length === 0) ? <p className="empty-state compact">No NPCs placed in any area.</p> : null}
      </aside>
    </section>
  );
}
