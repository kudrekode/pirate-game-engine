import { characterSprites, portraitPresets, tilePresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";

export function CharacterEditor() {
  const player = useProjectStore((state) => state.project.player);
  const updatePlayer = useProjectStore((state) => state.updatePlayer);

  function toggleWalkable(tileId: string) {
    const canWalkOn = player.canWalkOn.includes(tileId)
      ? player.canWalkOn.filter((id) => id !== tileId)
      : [...player.canWalkOn, tileId];

    updatePlayer({ canWalkOn });
  }

  return (
    <section className="editor-panel character-editor">
      <div className="split-layout">
        <div className="tool-panel wide">
          <div className="panel-title">Player</div>
          <div className="form-grid">
            <label>
              Name
              <input
                onChange={(event) => updatePlayer({ name: event.target.value })}
                value={player.name}
              />
            </label>
            <label>
              Speed
              <input
                min={1}
                onChange={(event) => updatePlayer({ speed: Number(event.target.value) })}
                type="number"
                value={player.speed}
              />
            </label>
            <label>
              Health
              <input
                min={1}
                onChange={(event) => updatePlayer({ health: Number(event.target.value) })}
                type="number"
                value={player.health}
              />
            </label>
          </div>

          <div className="panel-title">Sprite</div>
          <div className="preset-grid">
            {characterSprites.map((sprite) => (
              <button
                className={`preset-card ${player.spriteId === sprite.id ? "selected" : ""}`}
                key={sprite.id}
                onClick={() => updatePlayer({ spriteId: sprite.id })}
                type="button"
              >
                <span
                  className="avatar-preview small"
                  style={{ background: sprite.color, color: sprite.accent }}
                >
                  {sprite.label.slice(0, 1)}
                </span>
                {sprite.label}
              </button>
            ))}
          </div>

          <div className="panel-title">Portrait</div>
          <div className="preset-grid">
            {portraitPresets.map((portrait) => (
              <button
                className={`preset-card ${player.portraitId === portrait.id ? "selected" : ""}`}
                key={portrait.id}
                onClick={() => updatePlayer({ portraitId: portrait.id })}
                type="button"
              >
                <span
                  className="avatar-preview small"
                  style={{ background: portrait.color, color: portrait.accent }}
                >
                  {portrait.label.slice(0, 1)}
                </span>
                {portrait.label}
              </button>
            ))}
          </div>
        </div>

        <aside className="inspector-panel wide">
          <div className="panel-title">Walkable tiles</div>
          <div className="checkbox-list">
            {tilePresets.map((tile) => (
              <label className="checkbox-row" key={tile.id}>
                <input
                  checked={player.canWalkOn.includes(tile.id)}
                  onChange={() => toggleWalkable(tile.id)}
                  type="checkbox"
                />
                <span className="swatch" style={{ background: tile.color }} />
                {tile.label}
              </label>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
