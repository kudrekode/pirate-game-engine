import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  getStructurePreset,
  getTerrainPreset,
  overlayPresets,
  structurePresets,
  terrainPresets,
} from "../../data/mapVisuals";
import { useProjectStore } from "../../store/useProjectStore";
import type { EventBlock, PixelAsset } from "../../types/game";

type MapTool = "paint" | "eraser" | "fill" | "event-block" | "structure" | "pan";
type BrushSize = 1 | 3 | 5;
type PaintLayer = "terrain" | "overlay" | "structure" | "event";

const AUTO_EXPAND_BUFFER_TILES = 12;
const MAX_MAP_SIZE = 200;
const PALETTE_WIDTH_STORAGE_KEY = "map-editor-palette-width-v3";
const MIN_PALETTE_WIDTH = 180;
const MAX_PALETTE_WIDTH = 420;

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function clampMapSize(value: number): number {
  return Math.min(MAX_MAP_SIZE, Math.max(1, Math.round(value)));
}

function clampPaletteWidth(value: number): number {
  return Math.min(MAX_PALETTE_WIDTH, Math.max(MIN_PALETTE_WIDTH, Math.round(value)));
}

function readStoredPaletteWidth(): number {
  if (typeof localStorage === "undefined") {
    return 260;
  }

  const storedWidth = Number(localStorage.getItem(PALETTE_WIDTH_STORAGE_KEY));
  return Number.isFinite(storedWidth) ? clampPaletteWidth(storedWidth) : 260;
}

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function pixelAssetToDataUrl(asset?: PixelAsset): string | undefined {
  if (!asset) {
    return undefined;
  }

  const rects = asset.pixels
    .flatMap((row, y) =>
      row.flatMap((color, x) =>
        !color || color === "transparent"
          ? []
          : [`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`],
      ),
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function emptyPixels(width: number, height: number, color = "transparent"): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => color));
}

export function MapEditor() {
  const project = useProjectStore((state) => state.project);
  const setTiles = useProjectStore((state) => state.setTiles);
  const setOverlayTiles = useProjectStore((state) => state.setOverlayTiles);
  const eraseOverlayTiles = useProjectStore((state) => state.eraseOverlayTiles);
  const resizeMap = useProjectStore((state) => state.resizeMap);
  const updateTileStyle = useProjectStore((state) => state.updateTileStyle);
  const addStructure = useProjectStore((state) => state.addStructure);
  const deleteStructure = useProjectStore((state) => state.deleteStructure);
  const updatePixelAsset = useProjectStore((state) => state.updatePixelAsset);
  const resetPixelAsset = useProjectStore((state) => state.resetPixelAsset);
  const addEventBlock = useProjectStore((state) => state.addEventBlock);
  const updateEventBlock = useProjectStore((state) => state.updateEventBlock);
  const deleteEventBlock = useProjectStore((state) => state.deleteEventBlock);

  const mapStageRef = useRef<HTMLDivElement>(null);
  const paintedCellsRef = useRef<Set<string>>(new Set());
  const panRef = useRef({ isPanning: false, lastX: 0, lastY: 0 });

  const [activeTool, setActiveTool] = useState<MapTool>("paint");
  const [paintLayer, setPaintLayer] = useState<PaintLayer>("terrain");
  const [selectedTerrainId, setSelectedTerrainId] = useState("grass");
  const [selectedOverlayId, setSelectedOverlayId] = useState("dirt_path");
  const [selectedStructureId, setSelectedStructureId] = useState("small_house");
  const [selectedMapStructureId, setSelectedMapStructureId] = useState("");
  const [selectedEventBlockId, setSelectedEventBlockId] = useState(project.map.eventBlocks[0]?.id ?? "");
  const [isPainting, setIsPainting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [showGrid, setShowGrid] = useState(true);
  const [paletteWidth, setPaletteWidth] = useState(readStoredPaletteWidth);
  const [isResizingPalette, setIsResizingPalette] = useState(false);
  const [draftMapSize, setDraftMapSize] = useState({
    width: project.map.width,
    height: project.map.height,
  });
  const [resizeMessage, setResizeMessage] = useState("");
  const [isPixelEditorOpen, setIsPixelEditorOpen] = useState(false);
  const [pixelAssetId, setPixelAssetId] = useState("grass");
  const [pixelColor, setPixelColor] = useState("#4f9a45");
  const [isPaintingPixel, setIsPaintingPixel] = useState(false);

  useEffect(() => {
    setDraftMapSize({ width: project.map.width, height: project.map.height });
  }, [project.map.height, project.map.width]);

  const terrainLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    const terrainTiles = project.map.terrainTiles ?? project.map.tiles;
    terrainTiles.forEach((tile) => lookup.set(cellKey(tile.x, tile.y), tile.tileId));
    return lookup;
  }, [project.map.terrainTiles, project.map.tiles]);

  const overlayLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    project.map.overlayTiles.forEach((tile) => lookup.set(cellKey(tile.x, tile.y), tile.overlayId));
    return lookup;
  }, [project.map.overlayTiles]);

  const eventLookup = useMemo(() => {
    const lookup = new Map<string, EventBlock>();
    project.map.eventBlocks.forEach((eventBlock) =>
      lookup.set(cellKey(eventBlock.x, eventBlock.y), eventBlock),
    );
    return lookup;
  }, [project.map.eventBlocks]);

  const pixelAssetUrls = useMemo(() => {
    return Object.fromEntries(
      Object.entries(project.pixelAssets).map(([id, asset]) => [id, pixelAssetToDataUrl(asset)]),
    );
  }, [project.pixelAssets]);

  const selectedEventBlock = project.map.eventBlocks.find(
    (eventBlock) => eventBlock.id === selectedEventBlockId,
  );
  const selectedMapStructure = project.map.structures.find(
    (structure) => structure.id === selectedMapStructureId,
  );
  const selectedStructure = getStructurePreset(selectedStructureId);
  const cellSize = Math.round(project.map.tileSize * zoom);
  const renderWidth = Math.min(MAX_MAP_SIZE, project.map.width + AUTO_EXPAND_BUFFER_TILES);
  const renderHeight = Math.min(MAX_MAP_SIZE, project.map.height + AUTO_EXPAND_BUFFER_TILES);
  const editablePixelAssetIds = [...terrainPresets, ...overlayPresets].map((item) => item.id);
  const editingPixelAsset = project.pixelAssets[pixelAssetId] ?? project.pixelAssets.grass;

  // TODO: Support negative-direction expansion by shifting terrain/overlay/structure/event coordinates safely.

  function getBrushCells(centerX: number, centerY: number) {
    const radius = Math.floor(brushSize / 2);
    const cells: { x: number; y: number }[] = [];

    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (isInBounds(x, y, renderWidth, renderHeight)) {
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

    const cells = getBrushCells(centerX, centerY).filter((cell) => {
      const key = cellKey(cell.x, cell.y);
      if (paintedCellsRef.current.has(key) || eventLookup.has(key)) {
        return false;
      }

      paintedCellsRef.current.add(key);
      return true;
    });

    if (paintLayer === "overlay") {
      if (activeTool === "eraser") {
        eraseOverlayTiles(cells);
        return;
      }

      setOverlayTiles(cells.map((cell) => ({ ...cell, overlayId: selectedOverlayId })));
      return;
    }

    if (paintLayer !== "terrain") {
      return;
    }

    const targetTileId = activeTool === "eraser" ? "grass" : selectedTerrainId;
    const updates = cells.flatMap((cell) => {
      const key = cellKey(cell.x, cell.y);
      const currentTileId = terrainLookup.get(key) ?? "grass";
      const isOutsideCurrentMap = cell.x >= project.map.width || cell.y >= project.map.height;
      return currentTileId === targetTileId && !isOutsideCurrentMap
        ? []
        : [{ ...cell, tileId: targetTileId }];
    });

    if (updates.length > 0) {
      setTiles(updates);
    }
  }

  function floodFillFrom(startX: number, startY: number) {
    if (paintLayer !== "terrain") {
      setOverlayTiles([{ x: startX, y: startY, overlayId: selectedOverlayId }]);
      return;
    }

    const startKey = cellKey(startX, startY);
    if (!isInBounds(startX, startY, project.map.width, project.map.height)) {
      setTiles([{ x: startX, y: startY, tileId: selectedTerrainId }]);
      return;
    }

    const sourceTileId = terrainLookup.get(startKey) ?? "grass";
    const targetTileId = selectedTerrainId;
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
      if ((terrainLookup.get(key) ?? "grass") !== sourceTileId) {
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

  function placeStructure(x: number, y: number) {
    const id = addStructure({
      structureId: selectedStructure.id,
      name: selectedStructure.label,
      x,
      y,
      widthTiles: selectedStructure.widthTiles,
      heightTiles: selectedStructure.heightTiles,
      blocksMovement: selectedStructure.blocksMovement,
    });
    setSelectedMapStructureId(id);
    setSelectedEventBlockId("");
  }

  function handleCellPointerDown(event: PointerEvent<HTMLButtonElement>, x: number, y: number) {
    if (activeTool === "pan" || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const eventBlock = eventLookup.get(cellKey(x, y));

    if (activeTool === "event-block") {
      if (eventBlock) {
        setSelectedEventBlockId(eventBlock.id);
        setSelectedMapStructureId("");
        return;
      }

      const id = addEventBlock(x, y);
      setSelectedEventBlockId(id);
      setSelectedMapStructureId("");
      return;
    }

    if (activeTool === "structure") {
      placeStructure(x, y);
      return;
    }

    if (eventBlock) {
      setSelectedEventBlockId(eventBlock.id);
      setSelectedMapStructureId("");
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

  function handlePaletteResizeStart(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsResizingPalette(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePaletteResizeMove(event: PointerEvent<HTMLDivElement>) {
    if (!isResizingPalette) {
      return;
    }

    const containerLeft = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    const nextWidth = clampPaletteWidth(event.clientX - containerLeft);
    setPaletteWidth(nextWidth);
    localStorage.setItem(PALETTE_WIDTH_STORAGE_KEY, String(nextWidth));
  }

  function handlePaletteResizeEnd(event: PointerEvent<HTMLDivElement>) {
    if (!isResizingPalette) {
      return;
    }

    setIsResizingPalette(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
    if (selectedEventBlock) {
      updateEventBlock(selectedEventBlock.id, patch);
    }
  }

  function deleteSelectedEventBlock() {
    if (!selectedEventBlock) {
      return;
    }

    const nextSelectedId =
      project.map.eventBlocks.find((eventBlock) => eventBlock.id !== selectedEventBlock.id)?.id ?? "";
    deleteEventBlock(selectedEventBlock.id);
    setSelectedEventBlockId(nextSelectedId);
  }

  function applyMapResize() {
    const nextWidth = clampMapSize(draftMapSize.width);
    const nextHeight = clampMapSize(draftMapSize.height);
    const removedEventBlockCount = resizeMap(nextWidth, nextHeight);
    setResizeMessage(
      removedEventBlockCount > 0
        ? `Resized to ${nextWidth}x${nextHeight}. Removed ${removedEventBlockCount} out-of-bounds event block${
            removedEventBlockCount === 1 ? "" : "s"
          }.`
        : `Resized to ${nextWidth}x${nextHeight}.`,
    );
  }

  function growMap(deltaWidth: number, deltaHeight: number) {
    const nextWidth = clampMapSize(project.map.width + deltaWidth);
    const nextHeight = clampMapSize(project.map.height + deltaHeight);
    resizeMap(nextWidth, nextHeight);
    setResizeMessage(`Expanded to ${nextWidth}x${nextHeight}.`);
  }

  function paintPixel(x: number, y: number) {
    if (!editingPixelAsset) {
      return;
    }

    const pixels = editingPixelAsset.pixels.map((row) => [...row]);
    pixels[y][x] = pixelColor;
    updatePixelAsset({ ...editingPixelAsset, pixels });
  }

  function clearPixelAsset() {
    if (!editingPixelAsset) {
      return;
    }

    updatePixelAsset({
      ...editingPixelAsset,
      pixels: emptyPixels(editingPixelAsset.width, editingPixelAsset.height),
    });
  }

  function selectTerrain(id: string) {
    setSelectedTerrainId(id);
    setPaintLayer("terrain");
    setActiveTool("paint");
  }

  function selectOverlay(id: string) {
    setSelectedOverlayId(id);
    setPaintLayer("overlay");
    setActiveTool("paint");
  }

  function selectStructure(id: string) {
    setSelectedStructureId(id);
    setPaintLayer("structure");
    setActiveTool("structure");
  }

  return (
    <section
      className="editor-panel map-editor"
      style={{ "--map-palette-width": `${paletteWidth}px` } as CSSProperties}
    >
      <aside className="tool-panel map-tool-panel">
        <div
          aria-hidden="true"
          className={`palette-resize-handle ${isResizingPalette ? "active" : ""}`}
          onPointerDown={handlePaletteResizeStart}
          onPointerMove={handlePaletteResizeMove}
          onPointerUp={handlePaletteResizeEnd}
        />
        <div className="panel-title">Map size</div>
        <div className="map-size-readout">
          {project.map.width} x {project.map.height} tiles
        </div>
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
        <div className="quick-grow-actions">
          <button onClick={() => growMap(10, 0)} type="button">
            Add 10 Right
          </button>
          <button onClick={() => growMap(0, 10)} type="button">
            Add 10 Down
          </button>
        </div>
        {resizeMessage ? <p className="tool-note">{resizeMessage}</p> : null}

        <details open className="palette-section">
          <summary>Terrain</summary>
          <div className="palette-list tile-palette">
            {terrainPresets.map((tile) => {
              const style = project.tileStyles[tile.id] ?? { color: tile.color, label: tile.label };
              return (
                <button
                  className={`palette-item ${
                    selectedTerrainId === tile.id && paintLayer === "terrain" ? "selected" : ""
                  }`}
                  key={tile.id}
                  onClick={() => selectTerrain(tile.id)}
                  type="button"
                >
                  <span
                    className="swatch pixel-swatch"
                    style={{
                      background: style.color,
                      backgroundImage: pixelAssetUrls[tile.id],
                    }}
                  />
                  {style.label ?? tile.label}
                </button>
              );
            })}
          </div>
        </details>

        <details open className="palette-section">
          <summary>Overlays</summary>
          <div className="palette-list tile-palette">
            {overlayPresets.map((overlay) => (
              <button
                className={`palette-item ${
                  selectedOverlayId === overlay.id && paintLayer === "overlay" ? "selected" : ""
                }`}
                key={overlay.id}
                onClick={() => selectOverlay(overlay.id)}
                type="button"
              >
                <span
                  className="swatch pixel-swatch"
                  style={{
                    background: overlay.color,
                    backgroundImage: pixelAssetUrls[overlay.id],
                  }}
                />
                {overlay.label}
              </button>
            ))}
          </div>
        </details>

        <details open className="palette-section">
          <summary>Structures</summary>
          <div className="palette-list tile-palette">
            {structurePresets.map((structure) => (
              <button
                className={`palette-item ${
                  selectedStructureId === structure.id && activeTool === "structure" ? "selected" : ""
                }`}
                key={structure.id}
                onClick={() => selectStructure(structure.id)}
                type="button"
              >
                <span className="swatch structure-swatch" style={{ background: structure.roofColor }} />
                {structure.label}
              </button>
            ))}
          </div>
        </details>

        <details open className="palette-section">
          <summary>Special</summary>
          <button
            className={`palette-item ${activeTool === "event-block" ? "selected" : ""}`}
            onClick={() => {
              setActiveTool("event-block");
              setPaintLayer("event");
            }}
            type="button"
          >
            <span className="swatch event-swatch">E</span>
            Event block
          </button>
        </details>

        <div className="panel-title">Tools</div>
        <div className="tool-button-grid">
          <button className={activeTool === "paint" ? "selected" : ""} onClick={() => setActiveTool("paint")} type="button">
            Paint
          </button>
          <button className={activeTool === "eraser" ? "selected" : ""} onClick={() => setActiveTool("eraser")} type="button">
            Eraser
          </button>
          <button className={activeTool === "fill" ? "selected" : ""} onClick={() => setActiveTool("fill")} type="button">
            Fill
          </button>
          <button className={activeTool === "pan" ? "selected" : ""} onClick={() => setActiveTool("pan")} type="button">
            Pan
          </button>
        </div>
        <p className="tool-note">
          Layer: <strong>{paintLayer}</strong>. Terrain eraser resets to grass; overlay eraser clears
          paths.
        </p>

        <div className="panel-title">Brush</div>
        <div className="segmented-control">
          {([1, 3, 5] as BrushSize[]).map((size) => (
            <button className={brushSize === size ? "selected" : ""} key={size} onClick={() => setBrushSize(size)} type="button">
              {size}x{size}
            </button>
          ))}
        </div>

        <div className="panel-title secondary">View</div>
        <div className="inline-actions">
          <button onClick={() => setZoom((value) => Math.max(0.4, Number((value - 0.2).toFixed(1))))} type="button">
            -
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(2.4, Number((value + 0.2).toFixed(1))))} type="button">
            +
          </button>
        </div>
        <button className="full-width reset-zoom-button" onClick={() => setZoom(1)} type="button">
          Reset Zoom
        </button>
        <label className="checkbox-row standalone">
          <input checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} type="checkbox" />
          Show grid
        </label>

        <button className="primary-button full-width" onClick={() => setIsPixelEditorOpen(true)} type="button">
          Tile Editor
        </button>

        <div className="panel-title secondary">Tile style</div>
        <div className="tile-style-list">
          {terrainPresets.map((tile) => {
            const style = project.tileStyles[tile.id] ?? { color: tile.color, label: tile.label };
            return (
              <label className="tile-style-row" key={tile.id}>
                <span>{style.label ?? tile.label}</span>
                <input
                  aria-label={`${tile.label} color`}
                  onChange={(event) => updateTileStyle(tile.id, { color: event.target.value })}
                  type="color"
                  value={style.color}
                />
              </label>
            );
          })}
        </div>
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
            gridTemplateColumns: `repeat(${renderWidth}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: renderHeight }).map((_, y) =>
            Array.from({ length: renderWidth }).map((__, x) => {
              const key = cellKey(x, y);
              const terrainId = terrainLookup.get(key) ?? "grass";
              const terrain = getTerrainPreset(terrainId);
              const tileStyle = project.tileStyles[terrainId] ?? { color: terrain.color, label: terrain.label };
              const overlayId = overlayLookup.get(key);
              const eventBlock = eventLookup.get(key);
              const eventLabel = eventBlock?.tag || eventBlock?.name;
              const isOutsideMap = x >= project.map.width || y >= project.map.height;

              return (
                <button
                  aria-label={`Tile ${x}, ${y}`}
                  className={`map-cell ${isOutsideMap ? "map-cell-outside" : ""}`}
                  key={key}
                  onPointerDown={(event) => handleCellPointerDown(event, x, y)}
                  onPointerEnter={() => handleCellPointerEnter(x, y)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: tileStyle.color,
                    color: terrain.textColor,
                  }}
                  type="button"
                >
                  <span
                    className="tile-pixel-layer"
                    style={{ backgroundImage: pixelAssetUrls[terrainId] }}
                  />
                  {overlayId ? (
                    <span
                      className="overlay-pixel-layer"
                      style={{ backgroundImage: pixelAssetUrls[overlayId] }}
                    />
                  ) : null}
                  {eventBlock ? (
                    <span
                      className={`event-marker ${eventBlock.kind} ${
                        selectedEventBlockId === eventBlock.id ? "selected-event" : ""
                      }`}
                    >
                      <span className="event-marker-kind">{eventBlock.kind === "spawn" ? "S" : "T"}</span>
                      <span className="event-marker-label">{eventLabel}</span>
                    </span>
                  ) : null}
                </button>
              );
            }),
          )}
          {project.map.structures.map((structure) => {
            const preset = getStructurePreset(structure.structureId);
            return (
              <button
                className={`map-structure ${selectedMapStructureId === structure.id ? "selected" : ""}`}
                key={structure.id}
                onClick={() => {
                  setSelectedMapStructureId(structure.id);
                  setSelectedEventBlockId("");
                }}
                style={{
                  left: structure.x * cellSize,
                  top: structure.y * cellSize,
                  width: structure.widthTiles * cellSize,
                  height: structure.heightTiles * cellSize,
                  "--structure-roof": preset.roofColor,
                  "--structure-wall": preset.wallColor,
                  "--structure-shadow": preset.shadowColor,
                } as CSSProperties}
                type="button"
              >
                <span className="structure-roof" />
                <span className="structure-wall" />
                <span className="structure-label">{structure.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="inspector-panel">
        {selectedMapStructure ? (
          <>
            <div className="panel-title">Structure</div>
            <div className="form-stack">
              <div className="coordinate-readout">
                {selectedMapStructure.name}: x {selectedMapStructure.x}, y {selectedMapStructure.y},{" "}
                {selectedMapStructure.widthTiles}x{selectedMapStructure.heightTiles}
              </div>
              <div className="coordinate-readout">
                Blocks movement: {selectedMapStructure.blocksMovement ? "yes" : "no"}
              </div>
              <button className="danger-button" onClick={() => deleteStructure(selectedMapStructure.id)} type="button">
                Delete structure
              </button>
            </div>
          </>
        ) : (
          <>
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
              <p className="empty-state">Select an event block or structure.</p>
            )}
          </>
        )}
      </aside>

      {isPixelEditorOpen && editingPixelAsset ? (
        <div className="pixel-editor-backdrop">
          <section className="pixel-editor-panel">
            <div className="pixel-editor-header">
              <strong>Tile Editor</strong>
              <button onClick={() => setIsPixelEditorOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="pixel-editor-controls">
              <label>
                Asset
                <select onChange={(event) => setPixelAssetId(event.target.value)} value={pixelAssetId}>
                  {editablePixelAssetIds.map((id) => (
                    <option key={id} value={id}>
                      {project.pixelAssets[id]?.name ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Colour
                <input onChange={(event) => setPixelColor(event.target.value)} type="color" value={pixelColor} />
              </label>
              <button onClick={clearPixelAsset} type="button">
                Clear
              </button>
              <button onClick={() => resetPixelAsset(pixelAssetId)} type="button">
                Reset
              </button>
            </div>
            <div
              className="pixel-grid"
              onPointerLeave={() => setIsPaintingPixel(false)}
              onPointerUp={() => setIsPaintingPixel(false)}
              style={{
                gridTemplateColumns: `repeat(${editingPixelAsset.width}, 18px)`,
              }}
            >
              {editingPixelAsset.pixels.map((row, y) =>
                row.map((color, x) => (
                  <button
                    aria-label={`Pixel ${x}, ${y}`}
                    className="pixel-cell"
                    key={`${x}:${y}`}
                    onPointerDown={() => {
                      setIsPaintingPixel(true);
                      paintPixel(x, y);
                    }}
                    onPointerEnter={() => {
                      if (isPaintingPixel) {
                        paintPixel(x, y);
                      }
                    }}
                    style={{ background: color === "transparent" ? "#f8fafc" : color }}
                    type="button"
                  />
                )),
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
