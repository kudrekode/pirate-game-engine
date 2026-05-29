import { useMemo, useState } from "react";
import { getTilePreset, tilePresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";
import type { EventBlock } from "../../types/game";

type PaintTool = string | "event-block";

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function MapEditor() {
  const project = useProjectStore((state) => state.project);
  const setTile = useProjectStore((state) => state.setTile);
  const addEventBlock = useProjectStore((state) => state.addEventBlock);
  const updateEventBlock = useProjectStore((state) => state.updateEventBlock);
  const deleteEventBlock = useProjectStore((state) => state.deleteEventBlock);

  const [selectedTool, setSelectedTool] = useState<PaintTool>("grass");
  const [selectedEventBlockId, setSelectedEventBlockId] = useState(
    project.map.eventBlocks[0]?.id ?? "",
  );
  const [isPainting, setIsPainting] = useState(false);
  const [zoom, setZoom] = useState(1);

  const tileLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    project.map.tiles.forEach((tile) => lookup.set(cellKey(tile.x, tile.y), tile.tileId));
    return lookup;
  }, [project.map.tiles]);

  const eventLookup = useMemo(() => {
    const lookup = new Map<string, EventBlock>();
    project.map.eventBlocks.forEach((eventBlock) =>
      lookup.set(cellKey(eventBlock.x, eventBlock.y), eventBlock),
    );
    return lookup;
  }, [project.map.eventBlocks]);

  const selectedEventBlock = project.map.eventBlocks.find(
    (eventBlock) => eventBlock.id === selectedEventBlockId,
  );

  const cellSize = Math.round(project.map.tileSize * zoom);

  function handleCellDown(x: number, y: number) {
    const eventBlock = eventLookup.get(cellKey(x, y));
    setIsPainting(true);

    if (selectedTool === "event-block") {
      if (eventBlock) {
        setSelectedEventBlockId(eventBlock.id);
        return;
      }

      const id = addEventBlock(x, y);
      setSelectedEventBlockId(id);
      return;
    }

    if (eventBlock) {
      setSelectedEventBlockId(eventBlock.id);
      return;
    }

    setTile(x, y, selectedTool);
  }

  function handleCellEnter(x: number, y: number) {
    if (!isPainting || selectedTool === "event-block") {
      return;
    }

    if (eventLookup.has(cellKey(x, y))) {
      return;
    }

    setTile(x, y, selectedTool);
  }

  function updateSelectedEventBlock(patch: Partial<EventBlock>) {
    if (!selectedEventBlock) {
      return;
    }

    updateEventBlock(selectedEventBlock.id, patch);
  }

  function deleteSelectedEventBlock() {
    if (!selectedEventBlock) {
      return;
    }

    const nextSelectedId =
      project.map.eventBlocks.find((eventBlock) => eventBlock.id !== selectedEventBlock.id)?.id ??
      "";

    deleteEventBlock(selectedEventBlock.id);
    setSelectedEventBlockId(nextSelectedId);
  }

  return (
    <section className="editor-panel map-editor">
      <aside className="tool-panel">
        <div className="panel-title">Palette</div>
        <div className="palette-list">
          {tilePresets.map((tile) => (
            <button
              className={`palette-item ${selectedTool === tile.id ? "selected" : ""}`}
              key={tile.id}
              onClick={() => setSelectedTool(tile.id)}
              type="button"
            >
              <span className="swatch" style={{ background: tile.color }} />
              {tile.label}
            </button>
          ))}
          <button
            className={`palette-item ${selectedTool === "event-block" ? "selected" : ""}`}
            onClick={() => setSelectedTool("event-block")}
            type="button"
          >
            <span className="swatch event-swatch">E</span>
            Event block
          </button>
        </div>

        <div className="panel-title">Zoom</div>
        <div className="inline-actions">
          <button
            onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(1))))}
            type="button"
          >
            -
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.2).toFixed(1))))}
            type="button"
          >
            +
          </button>
        </div>
        <button className="full-width reset-zoom-button" onClick={() => setZoom(1)} type="button">
          Reset Zoom
        </button>
      </aside>

      <div className="map-stage">
        <div
          className="tile-grid"
          onMouseLeave={() => setIsPainting(false)}
          onMouseUp={() => setIsPainting(false)}
          style={{
            gridTemplateColumns: `repeat(${project.map.width}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: project.map.height }).map((_, y) =>
            Array.from({ length: project.map.width }).map((__, x) => {
              const tileId = tileLookup.get(cellKey(x, y)) ?? "grass";
              const tile = getTilePreset(tileId);
              const eventBlock = eventLookup.get(cellKey(x, y));

              return (
                <button
                  aria-label={`Tile ${x}, ${y}`}
                  className="map-cell"
                  key={cellKey(x, y)}
                  onMouseDown={() => handleCellDown(x, y)}
                  onMouseEnter={() => handleCellEnter(x, y)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: tile.color,
                    color: tile.textColor,
                  }}
                  type="button"
                >
                  <span className={`tile-pattern tile-pattern-${tile.pattern ?? "plain"}`} />
                  {eventBlock ? (
                    <span className={`event-marker ${eventBlock.kind}`}>
                      {eventBlock.kind === "spawn" ? "S" : "T"}
                    </span>
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <aside className="inspector-panel">
        <div className="panel-title">Event block</div>
        {selectedEventBlock ? (
          <div className="form-stack">
            <label>
              Name
              <input
                onChange={(event) => updateSelectedEventBlock({ name: event.target.value })}
                value={selectedEventBlock.name}
              />
            </label>
            <label>
              Tag
              <input
                onChange={(event) => updateSelectedEventBlock({ tag: event.target.value })}
                value={selectedEventBlock.tag}
              />
            </label>
            <label>
              Kind
              <select
                onChange={(event) =>
                  updateSelectedEventBlock({ kind: event.target.value as EventBlock["kind"] })
                }
                value={selectedEventBlock.kind}
              >
                <option value="spawn">Spawn</option>
                <option value="trigger">Trigger</option>
              </select>
            </label>
            <div className="coordinate-readout">
              x {selectedEventBlock.x}, y {selectedEventBlock.y}
            </div>
            <button className="danger-button" onClick={deleteSelectedEventBlock} type="button">
              Delete event block
            </button>
          </div>
        ) : (
          <p className="empty-state">Select or create an event block.</p>
        )}
      </aside>
    </section>
  );
}
