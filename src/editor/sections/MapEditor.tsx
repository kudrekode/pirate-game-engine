import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { getTilePreset, tilePresets } from "../../data/presets";
import { useProjectStore } from "../../store/useProjectStore";
import type { EventBlock } from "../../types/game";

type MapTool = "paint" | "eraser" | "fill" | "event-block" | "pan";
type BrushSize = 1 | 3 | 5;

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function clampMapSize(value: number): number {
  return Math.min(200, Math.max(1, Math.round(value)));
}

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function MapEditor() {
  const project = useProjectStore((state) => state.project);
  const setTiles = useProjectStore((state) => state.setTiles);
  const resizeMap = useProjectStore((state) => state.resizeMap);
  const addEventBlock = useProjectStore((state) => state.addEventBlock);
  const updateEventBlock = useProjectStore((state) => state.updateEventBlock);
  const deleteEventBlock = useProjectStore((state) => state.deleteEventBlock);

  const mapStageRef = useRef<HTMLDivElement>(null);
  const paintedCellsRef = useRef<Set<string>>(new Set());
  const panRef = useRef({ isPanning: false, lastX: 0, lastY: 0 });

  const [activeTool, setActiveTool] = useState<MapTool>("paint");
  const [selectedTileId, setSelectedTileId] = useState("grass");
  const [selectedEventBlockId, setSelectedEventBlockId] = useState(
    project.map.eventBlocks[0]?.id ?? "",
  );
  const [isPainting, setIsPainting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [showGrid, setShowGrid] = useState(true);
  const [draftMapSize, setDraftMapSize] = useState({
    width: project.map.width,
    height: project.map.height,
  });
  const [resizeMessage, setResizeMessage] = useState("");

  useEffect(() => {
    setDraftMapSize({ width: project.map.width, height: project.map.height });
  }, [project.map.height, project.map.width]);

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
  const selectedTile = getTilePreset(selectedTileId);
  const cellSize = Math.round(project.map.tileSize * zoom);

  function getBrushCells(centerX: number, centerY: number) {
    const radius = Math.floor(brushSize / 2);
    const cells: { x: number; y: number }[] = [];

    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (isInBounds(x, y, project.map.width, project.map.height)) {
          cells.push({ x, y });
        }
      }
    }

    return cells;
  }

  function applyBrush(centerX: number, centerY: number) {
    if (activeTool !== "paint" && activeTool !== "eraser") {
      return;
    }

    const targetTileId = activeTool === "eraser" ? "grass" : selectedTileId;
    const updates = getBrushCells(centerX, centerY).flatMap((cell) => {
      const key = cellKey(cell.x, cell.y);

      if (paintedCellsRef.current.has(key) || eventLookup.has(key)) {
        return [];
      }

      paintedCellsRef.current.add(key);
      const currentTileId = tileLookup.get(key) ?? "grass";
      return currentTileId === targetTileId ? [] : [{ ...cell, tileId: targetTileId }];
    });

    if (updates.length > 0) {
      setTiles(updates);
    }
  }

  function floodFillFrom(startX: number, startY: number) {
    const startKey = cellKey(startX, startY);
    const sourceTileId = tileLookup.get(startKey) ?? "grass";
    const targetTileId = selectedTileId;

    if (sourceTileId === targetTileId || eventLookup.has(startKey)) {
      return;
    }

    const visited = new Set<string>();
    const queue = [{ x: startX, y: startY }];
    const updates: { x: number; y: number; tileId: string }[] = [];

    while (queue.length > 0) {
      const cell = queue.shift();
      if (!cell || !isInBounds(cell.x, cell.y, project.map.width, project.map.height)) {
        continue;
      }

      const key = cellKey(cell.x, cell.y);
      if (visited.has(key) || eventLookup.has(key)) {
        continue;
      }

      visited.add(key);
      if ((tileLookup.get(key) ?? "grass") !== sourceTileId) {
        continue;
      }

      updates.push({ ...cell, tileId: targetTileId });
      queue.push(
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 },
      );
    }

    setTiles(updates);
  }

  function handleCellPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    x: number,
    y: number,
  ) {
    if (activeTool === "pan") {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const eventBlock = eventLookup.get(cellKey(x, y));

    if (activeTool === "event-block") {
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

    if (activeTool === "fill") {
      floodFillFrom(x, y);
      return;
    }

    paintedCellsRef.current.clear();
    setIsPainting(true);
    applyBrush(x, y);
  }

  function handleCellPointerEnter(x: number, y: number) {
    if (!isPainting || (activeTool !== "paint" && activeTool !== "eraser")) {
      return;
    }

    applyBrush(x, y);
  }

  function stopPainting() {
    setIsPainting(false);
    paintedCellsRef.current.clear();
  }

  function startPanning(event: PointerEvent<HTMLDivElement>) {
    if (activeTool !== "pan" && event.button !== 1 && event.button !== 2) {
      return;
    }

    const stage = mapStageRef.current;
    if (!stage) {
      return;
    }

    event.preventDefault();
    panRef.current = {
      isPanning: true,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    stage.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }

  function panStage(event: PointerEvent<HTMLDivElement>) {
    const stage = mapStageRef.current;
    if (!stage || !panRef.current.isPanning) {
      return;
    }

    const deltaX = event.clientX - panRef.current.lastX;
    const deltaY = event.clientY - panRef.current.lastY;
    stage.scrollLeft -= deltaX;
    stage.scrollTop -= deltaY;
    panRef.current.lastX = event.clientX;
    panRef.current.lastY = event.clientY;
  }

  function stopPanning(event: PointerEvent<HTMLDivElement>) {
    if (!panRef.current.isPanning) {
      return;
    }

    panRef.current.isPanning = false;
    if (mapStageRef.current?.hasPointerCapture(event.pointerId)) {
      mapStageRef.current.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
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

  function applyMapResize() {
    const nextWidth = clampMapSize(draftMapSize.width);
    const nextHeight = clampMapSize(draftMapSize.height);
    const nextSelectedId =
      project.map.eventBlocks.find(
        (eventBlock) =>
          eventBlock.id === selectedEventBlockId &&
          isInBounds(eventBlock.x, eventBlock.y, nextWidth, nextHeight),
      )?.id ??
      project.map.eventBlocks.find((eventBlock) =>
        isInBounds(eventBlock.x, eventBlock.y, nextWidth, nextHeight),
      )?.id ??
      "";
    const removedEventBlockCount = resizeMap(nextWidth, nextHeight);

    setSelectedEventBlockId(nextSelectedId);
    setResizeMessage(
      removedEventBlockCount > 0
        ? `Resized to ${nextWidth}x${nextHeight}. Removed ${removedEventBlockCount} out-of-bounds event block${
            removedEventBlockCount === 1 ? "" : "s"
          }.`
        : `Resized to ${nextWidth}x${nextHeight}.`,
    );
  }

  return (
    <section className="editor-panel map-editor">
      <aside className="tool-panel">
        <div className="panel-title">Map size</div>
        <div className="form-grid map-size-grid">
          <label>
            Width
            <input
              min={1}
              onChange={(event) =>
                setDraftMapSize((size) => ({ ...size, width: Number(event.target.value) }))
              }
              type="number"
              value={draftMapSize.width}
            />
          </label>
          <label>
            Height
            <input
              min={1}
              onChange={(event) =>
                setDraftMapSize((size) => ({ ...size, height: Number(event.target.value) }))
              }
              type="number"
              value={draftMapSize.height}
            />
          </label>
        </div>
        <button className="full-width" onClick={applyMapResize} type="button">
          Apply Resize
        </button>
        {resizeMessage ? <p className="tool-note">{resizeMessage}</p> : null}

        <div className="panel-title secondary">Tiles</div>
        <div className="palette-list tile-palette">
          {tilePresets.map((tile) => (
            <button
              className={`palette-item ${
                selectedTileId === tile.id && activeTool === "paint" ? "selected" : ""
              }`}
              key={tile.id}
              onClick={() => {
                setSelectedTileId(tile.id);
                setActiveTool("paint");
              }}
              type="button"
            >
              <span className="swatch" style={{ background: tile.color }} />
              {tile.label}
            </button>
          ))}
        </div>

        <div className="panel-title">Tools</div>
        <div className="tool-button-grid">
          <button
            className={activeTool === "paint" ? "selected" : ""}
            onClick={() => setActiveTool("paint")}
            type="button"
          >
            Paint
          </button>
          <button
            className={activeTool === "eraser" ? "selected" : ""}
            onClick={() => setActiveTool("eraser")}
            type="button"
          >
            Eraser
          </button>
          <button
            className={activeTool === "fill" ? "selected" : ""}
            onClick={() => setActiveTool("fill")}
            type="button"
          >
            Fill
          </button>
          <button
            className={activeTool === "event-block" ? "selected" : ""}
            onClick={() => setActiveTool("event-block")}
            type="button"
          >
            Event
          </button>
          <button
            className={activeTool === "pan" ? "selected" : ""}
            onClick={() => setActiveTool("pan")}
            type="button"
          >
            Pan
          </button>
        </div>
        <p className="tool-note">
          Selected tile: <strong>{selectedTile.label}</strong>. Eraser resets tiles to grass.
        </p>

        <div className="panel-title">Brush</div>
        <div className="segmented-control">
          {([1, 3, 5] as BrushSize[]).map((size) => (
            <button
              className={brushSize === size ? "selected" : ""}
              key={size}
              onClick={() => setBrushSize(size)}
              type="button"
            >
              {size}x{size}
            </button>
          ))}
        </div>

        <div className="panel-title secondary">View</div>
        <div className="inline-actions">
          <button
            onClick={() => setZoom((value) => Math.max(0.4, Number((value - 0.2).toFixed(1))))}
            type="button"
          >
            -
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((value) => Math.min(2.4, Number((value + 0.2).toFixed(1))))}
            type="button"
          >
            +
          </button>
        </div>
        <button className="full-width reset-zoom-button" onClick={() => setZoom(1)} type="button">
          Reset Zoom
        </button>
        <label className="checkbox-row standalone">
          <input
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
            type="checkbox"
          />
          Show grid
        </label>
      </aside>

      <div
        className={`map-stage ${activeTool === "pan" || isPanning ? "pan-ready" : ""}`}
        onContextMenu={(event) => {
          if (activeTool === "pan" || isPanning) {
            event.preventDefault();
          }
        }}
        onPointerDown={startPanning}
        onPointerMove={panStage}
        onPointerUp={(event) => {
          stopPainting();
          stopPanning(event);
        }}
        ref={mapStageRef}
      >
        <div
          className={`tile-grid ${showGrid ? "show-grid" : "hide-grid"}`}
          onPointerLeave={stopPainting}
          onPointerUp={stopPainting}
          style={{
            gridTemplateColumns: `repeat(${project.map.width}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: project.map.height }).map((_, y) =>
            Array.from({ length: project.map.width }).map((__, x) => {
              const key = cellKey(x, y);
              const tileId = tileLookup.get(key) ?? "grass";
              const tile = getTilePreset(tileId);
              const eventBlock = eventLookup.get(key);
              const eventLabel = eventBlock?.tag || eventBlock?.name;

              return (
                <button
                  aria-label={`Tile ${x}, ${y}`}
                  className="map-cell"
                  key={key}
                  onPointerDown={(event) => handleCellPointerDown(event, x, y)}
                  onPointerEnter={() => handleCellPointerEnter(x, y)}
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
                    <span
                      className={`event-marker ${eventBlock.kind} ${
                        selectedEventBlockId === eventBlock.id ? "selected-event" : ""
                      }`}
                    >
                      <span className="event-marker-kind">
                        {eventBlock.kind === "spawn" ? "S" : "T"}
                      </span>
                      <span className="event-marker-label">{eventLabel}</span>
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
