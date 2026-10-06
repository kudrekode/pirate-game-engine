import {
	type CSSProperties,
	type PointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { type AreaTemplateId, areaTemplates } from "../../data/areaTemplates";
import {
	getOverlayPreset,
	getStructurePreset,
	getTerrainPreset,
	overlayPresets,
	structurePresets,
	terrainPresets,
} from "../../data/mapVisuals";
import { resolveNPCInstance } from "../../runtime/npcResolver";
import { useProjectStore } from "../../store/useProjectStore";
import type {
	EventBlock,
	GameArea,
	GameAreaKind,
	GameProject,
	NPCInstance,
	ObjectInstance,
	PickupObject,
	PixelAsset,
} from "../../types/game";
import { MapInspector } from "./MapInspector";
import { resolveMapEditorSelection } from "./mapEditorSelection";
import {
	GAMEPLAY_OVERLAY_FILTERS,
	HIDE_ALL_OVERLAY_FILTERS,
	OVERLAY_FILTER_OPTIONS,
	readStoredMapOverlayFilters,
	SHOW_ALL_OVERLAY_FILTERS,
	toggleMapOverlayFilter,
	writeStoredMapOverlayFilters,
} from "./overlayFilters";
import { ThreeDPreview } from "./ThreeDPreview";
import {
	resolveTerrainBrushSamples,
	resolveTerrainFloodFill,
	resolveTerrainHeightUpdates,
	resolveTerrainLine,
	resolveTerrainPaintUpdates,
	resolveTerrainRectangle,
	resolveTerrainSlopeCells,
	resolveTerrainSlopeHeightUpdates,
	type TerrainBrushCell,
	type TerrainBrushFalloff,
	type TerrainBrushSample,
	type TerrainBrushShape,
	type TerrainHeightOperation,
	terrainBrushCellKey,
} from "./terrainBrush";
import { cloneCurrentProject, useMapEditHistory } from "./useMapEditHistory";

type MapEditorTool =
	| "select"
	| "paint"
	| "erase"
	| "pan"
	| "raise-height"
	| "lower-height"
	| "flatten-height"
	| "set-height"
	| "smooth-height"
	| "slope-height"
	| "roughen-height";
type DraggableEntityType =
	| "npc"
	| "object"
	| "structure"
	| "pickup"
	| "eventBlock";
type BrushSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type PaintTarget =
	| "terrain"
	| "overlay"
	| "structure"
	| "eventBlock"
	| "pickup"
	| "npc"
	| "object";

type MapWorkspaceView = "2d" | "3d";
type TerrainGesture = "brush" | "line" | "rectangle" | "fill";
type TerrainBrushMode =
	| "paint"
	| "raise-height"
	| "lower-height"
	| "flatten-height"
	| "set-height"
	| "smooth-height"
	| "slope-height"
	| "roughen-height";

type TerrainShapeGestureState = {
	gesture: Extract<TerrainGesture, "line" | "rectangle"> | "slope";
	start: TerrainBrushCell;
	before: GameProject;
};

const AUTO_EXPAND_BUFFER_TILES = 12;
const MAX_MAP_SIZE = 200;
const PALETTE_WIDTH_STORAGE_KEY = "map-editor-palette-width-v3";
const INSPECTOR_WIDTH_STORAGE_KEY = "map-editor-inspector-width-v1";
const MIN_PALETTE_WIDTH = 180;
const MAX_PALETTE_WIDTH = 420;
const MIN_INSPECTOR_WIDTH = 220;
const MAX_INSPECTOR_WIDTH = 520;
const areaKindOptions: GameAreaKind[] = [
	"outdoor",
	"indoor",
	"cave",
	"ship",
	"dungeon",
	"custom",
];
function cellKey(x: number, y: number): string {
	return `${x}:${y}`;
}

function pixelCellKey(assetId: string, x: number, y: number): string {
	return `${assetId}:${x}:${y}`;
}

function getEditorActiveArea(project: {
	areas: GameArea[];
	activeAreaId: string;
}): GameArea {
	const activeArea =
		project.areas.find((area) => area.id === project.activeAreaId) ??
		project.areas[0];
	if (!activeArea) {
		throw new Error("Project has no editable areas.");
	}
	return activeArea;
}

function clampMapSize(value: number): number {
	return Math.min(MAX_MAP_SIZE, Math.max(1, Math.round(value)));
}

function clampPaletteWidth(value: number): number {
	return Math.min(
		MAX_PALETTE_WIDTH,
		Math.max(MIN_PALETTE_WIDTH, Math.round(value)),
	);
}

function readStoredPaletteWidth(): number {
	if (typeof localStorage === "undefined") {
		return 260;
	}

	const storedWidth = Number(localStorage.getItem(PALETTE_WIDTH_STORAGE_KEY));
	return Number.isFinite(storedWidth) ? clampPaletteWidth(storedWidth) : 260;
}

function clampInspectorWidth(value: number): number {
	return Math.min(
		MAX_INSPECTOR_WIDTH,
		Math.max(MIN_INSPECTOR_WIDTH, Math.round(value)),
	);
}

function readStoredInspectorWidth(): number {
	if (typeof localStorage === "undefined") {
		return 260;
	}

	const storedWidth = Number(localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY));
	return Number.isFinite(storedWidth) ? clampInspectorWidth(storedWidth) : 260;
}

function isInBounds(
	x: number,
	y: number,
	width: number,
	height: number,
): boolean {
	return x >= 0 && y >= 0 && x < width && y < height;
}

function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return (
		target.tagName === "INPUT" ||
		target.tagName === "SELECT" ||
		target.tagName === "TEXTAREA" ||
		target.isContentEditable
	);
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

function emptyPixels(
	width: number,
	height: number,
	color = "transparent",
): string[][] {
	return Array.from({ length: height }, () =>
		Array.from({ length: width }, () => color),
	);
}

export function MapEditor() {
	const project = useProjectStore((state) => state.project);
	const setTiles = useProjectStore((state) => state.setTiles);
	const setTerrainHeights = useProjectStore((state) => state.setTerrainHeights);
	const setOverlayTiles = useProjectStore((state) => state.setOverlayTiles);
	const eraseOverlayTiles = useProjectStore((state) => state.eraseOverlayTiles);
	const resizeMap = useProjectStore((state) => state.resizeMap);
	const updateTileStyle = useProjectStore((state) => state.updateTileStyle);
	const setActiveArea = useProjectStore((state) => state.setActiveArea);
	const addArea = useProjectStore((state) => state.addArea);
	const updateActiveArea = useProjectStore((state) => state.updateActiveArea);
	const deleteArea = useProjectStore((state) => state.deleteArea);
	const addStructure = useProjectStore((state) => state.addStructure);
	const updateStructure = useProjectStore((state) => state.updateStructure);
	const deleteStructure = useProjectStore((state) => state.deleteStructure);
	const addObject = useProjectStore((state) => state.addObject);
	const updateObject = useProjectStore((state) => state.updateObject);
	const deleteObject = useProjectStore((state) => state.deleteObject);
	const addPickup = useProjectStore((state) => state.addPickup);
	const updatePickup = useProjectStore((state) => state.updatePickup);
	const deletePickup = useProjectStore((state) => state.deletePickup);
	const addNpc = useProjectStore((state) => state.addNpc);
	const updateNpc = useProjectStore((state) => state.updateNpc);
	const deleteNpc = useProjectStore((state) => state.deleteNpc);
	const updatePixelAsset = useProjectStore((state) => state.updatePixelAsset);
	const resetPixelAsset = useProjectStore((state) => state.resetPixelAsset);
	const addEventBlock = useProjectStore((state) => state.addEventBlock);
	const updateEventBlock = useProjectStore((state) => state.updateEventBlock);
	const deleteEventBlock = useProjectStore((state) => state.deleteEventBlock);
	const selection = useProjectStore((state) => state.editorSelection);
	const setSelection = useProjectStore((state) => state.setEditorSelection);
	const setMapPaletteSelection = useProjectStore(
		(state) => state.setMapPaletteSelection,
	);
	const initialNpcPalette = useRef(
		useProjectStore.getState().mapPaletteSelection,
	).current;
	const incomingNpcId =
		initialNpcPalette.type === "npc" &&
		project.npcs.some((npc) => npc.id === initialNpcPalette.npcDefinitionId)
			? initialNpcPalette.npcDefinitionId
			: undefined;

	const mapStageRef = useRef<HTMLDivElement>(null);
	const paintedCellsRef = useRef<Set<string>>(new Set());
	const paintSessionBeforeRef = useRef<GameProject | null>(null);
	const terrainShapeGestureRef = useRef<TerrainShapeGestureState | null>(null);
	const dragEntityRef = useRef<{
		type: DraggableEntityType;
		id: string;
		before: GameProject;
		moved: boolean;
	} | null>(null);
	const panRef = useRef({ isPanning: false, lastX: 0, lastY: 0 });
	const activeArea = getEditorActiveArea(project);
	const { recordMapEdit, undoMapEdit, redoMapEdit, canUndo, canRedo } =
		useMapEditHistory(activeArea.id);

	const [activeTool, setActiveTool] = useState<MapEditorTool>(
		incomingNpcId ? "paint" : "select",
	);
	const [mapView, setMapView] = useState<MapWorkspaceView>("2d");
	const [paintTarget, setPaintTarget] = useState<PaintTarget>(
		incomingNpcId ? "npc" : "terrain",
	);
	const [selectedTerrainId, setSelectedTerrainId] = useState("grass");
	const [isTerrainPaintArmed, setIsTerrainPaintArmed] = useState(false);
	const [selectedOverlayId, setSelectedOverlayId] = useState("dirt_path");
	const [selectedStructureId, setSelectedStructureId] = useState("small_house");
	const [selectedObjectDefinitionId, setSelectedObjectDefinitionId] = useState(
		project.objects[0]?.id ?? "",
	);
	const [selectedNpcDefinitionId, setSelectedNpcDefinitionId] = useState(
		incomingNpcId ?? project.npcs[0]?.id ?? "",
	);
	const [isPainting, setIsPainting] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [brushSize, setBrushSize] = useState<BrushSize>(1);
	const [brushShape, setBrushShape] = useState<TerrainBrushShape>("square");
	const [terrainGesture, setTerrainGesture] = useState<TerrainGesture>("brush");
	const [brushFalloff, setBrushFalloff] = useState<TerrainBrushFalloff>("hard");
	const [brushStrength, setBrushStrength] = useState(1);
	const [heightToolValue, setHeightToolValue] = useState(0);
	const [terrainPreviewCells, setTerrainPreviewCells] = useState<
		TerrainBrushCell[]
	>([]);
	const [showGrid, setShowGrid] = useState(true);
	const [overlayFilters, setOverlayFilters] = useState(
		readStoredMapOverlayFilters,
	);
	const [paletteWidth, setPaletteWidth] = useState(readStoredPaletteWidth);
	const [isResizingPalette, setIsResizingPalette] = useState(false);
	const [inspectorWidth, setInspectorWidth] = useState(
		readStoredInspectorWidth,
	);
	const [isResizingInspector, setIsResizingInspector] = useState(false);
	const [draftMapSize, setDraftMapSize] = useState({
		width: activeArea.width,
		height: activeArea.height,
	});
	const [resizeMessage, setResizeMessage] = useState("");
	const [newAreaTemplateId, setNewAreaTemplateId] =
		useState<AreaTemplateId>("outdoor");
	const [isPixelEditorOpen, setIsPixelEditorOpen] = useState(false);
	const [pixelAssetId, setPixelAssetId] = useState("grass");
	const [pixelColor, setPixelColor] = useState("#4f9a45");
	const [isPaintingPixel, setIsPaintingPixel] = useState(false);

	useEffect(() => {
		setDraftMapSize({ width: activeArea.width, height: activeArea.height });
		if (!selection || selection.areaId !== activeArea.id) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			selection.type === "eventBlock" &&
			!activeArea.eventBlocks.some(
				(eventBlock) => eventBlock.id === selection.id,
			)
		) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			selection.type === "structure" &&
			!activeArea.structures.some((structure) => structure.id === selection.id)
		) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			selection.type === "object" &&
			!activeArea.objects.some((object) => object.id === selection.id)
		) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			selection.type === "pickup" &&
			!activeArea.pickups.some((pickup) => pickup.id === selection.id)
		) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			selection.type === "npc" &&
			!activeArea.npcs.some((npc) => npc.id === selection.id)
		) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			(selection.type === "overlay" || selection.type === "terrain") &&
			!isInBounds(selection.x, selection.y, activeArea.width, activeArea.height)
		) {
			setSelection({ type: "area", areaId: activeArea.id });
			return;
		}

		if (
			selection.type === "overlay" &&
			!activeArea.overlayTiles.some(
				(tile) => tile.x === selection.x && tile.y === selection.y,
			)
		) {
			setSelection({
				type: "terrain",
				areaId: activeArea.id,
				x: selection.x,
				y: selection.y,
			});
		}
	}, [activeArea, selection, setSelection]);

	useEffect(() => {
		writeStoredMapOverlayFilters(overlayFilters);
	}, [overlayFilters]);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				isTypingTarget(event.target)
			) {
				return;
			}

			if (event.key === "1") {
				setActiveTool("select");
				setIsTerrainPaintArmed(false);
				setMapPaletteSelection({ type: "none" });
				return;
			}

			if (event.key === "2") {
				setActiveTool("paint");
				setIsTerrainPaintArmed(false);
				return;
			}

			if (event.key === "3") {
				setActiveTool("erase");
				setIsTerrainPaintArmed(false);
				setMapPaletteSelection({ type: "none" });
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [setMapPaletteSelection]);

	const terrainLookup = useMemo(() => {
		const lookup = new Map<string, string>();
		activeArea.terrainTiles.forEach((tile) => {
			lookup.set(cellKey(tile.x, tile.y), tile.tileId);
		});
		return lookup;
	}, [activeArea.terrainTiles]);

	const terrainPreviewCellKeys = useMemo(
		() => new Set(terrainPreviewCells.map((cell) => terrainBrushCellKey(cell))),
		[terrainPreviewCells],
	);

	const overlayLookup = useMemo(() => {
		const lookup = new Map<string, string>();
		activeArea.overlayTiles.forEach((tile) => {
			lookup.set(cellKey(tile.x, tile.y), tile.overlayId);
		});
		return lookup;
	}, [activeArea.overlayTiles]);

	const eventLookup = useMemo(() => {
		const lookup = new Map<string, EventBlock>();
		activeArea.eventBlocks.forEach((eventBlock) => {
			lookup.set(cellKey(eventBlock.x, eventBlock.y), eventBlock);
		});
		return lookup;
	}, [activeArea.eventBlocks]);

	const pickupLookup = useMemo(() => {
		const lookup = new Map<string, PickupObject>();
		activeArea.pickups.forEach((pickup) => {
			lookup.set(cellKey(pickup.x, pickup.y), pickup);
		});
		return lookup;
	}, [activeArea.pickups]);

	const npcLookup = useMemo(() => {
		const lookup = new Map<string, NPCInstance>();
		activeArea.npcs.forEach((npc) => {
			lookup.set(cellKey(npc.x, npc.y), npc);
		});
		return lookup;
	}, [activeArea.npcs]);

	const objectLookup = useMemo(() => {
		const lookup = new Map<string, ObjectInstance>();
		activeArea.objects.forEach((object) => {
			lookup.set(cellKey(object.x, object.y), object);
		});
		return lookup;
	}, [activeArea.objects]);

	const pixelAssetUrls = useMemo(() => {
		return Object.fromEntries(
			Object.entries(project.pixelAssets).map(([id, asset]) => [
				id,
				pixelAssetToDataUrl(asset),
			]),
		);
	}, [project.pixelAssets]);

	const selected = resolveMapEditorSelection(
		project,
		activeArea,
		selection,
		terrainLookup,
		overlayLookup,
	);
	const {
		selectedEventBlock,
		selectedMapStructure,
		selectedObject,
		selectedPickup,
		selectedResolvedNpc,
		selectedOverlayTile,
		selectedTerrainTile,
	} = selected;
	const selectedStructure = getStructurePreset(selectedStructureId);
	const selectedObjectDefinition = project.objects.find(
		(object) => object.id === selectedObjectDefinitionId,
	);
	const selectedNpcDefinitionForPalette = project.npcs.find(
		(npc) => npc.id === selectedNpcDefinitionId,
	);
	const mapWorkspaceStatus =
		activeTool === "select"
			? "Tool: Select"
			: activeTool === "erase"
				? "Tool: Erase"
				: activeTool === "pan"
					? "Tool: Pan"
					: activeTool === "raise-height"
						? "Tool: Raise Height"
						: activeTool === "lower-height"
							? "Tool: Lower Height"
							: activeTool === "flatten-height"
								? "Tool: Flatten Height"
								: activeTool === "slope-height"
									? `Tool: Slope Height -> ${heightToolValue}`
									: activeTool === "smooth-height"
										? "Tool: Smooth Height"
										: activeTool === "roughen-height"
											? "Tool: Roughen Height"
											: activeTool === "set-height"
												? `Tool: Set Height = ${heightToolValue}`
												: paintTarget === "structure"
													? `Tool: Place Structure - ${selectedStructure.label}`
													: paintTarget === "object"
														? `Tool: Place Object - ${selectedObjectDefinition?.name ?? "Object"}`
														: paintTarget === "npc"
															? `Tool: Place NPC - ${selectedNpcDefinitionForPalette?.name ?? "NPC"}`
															: paintTarget === "pickup"
																? `Tool: Place Pickup - ${project.items[0]?.name ?? "Item"} x1`
																: paintTarget === "eventBlock"
																	? "Tool: Place Event Block"
																	: paintTarget === "overlay"
																		? `Tool: Paint Overlay - ${selectedOverlayId}`
																		: `Tool: Paint Terrain - ${selectedTerrainId}`;
	const cellSize = Math.round(activeArea.tileSize * zoom);
	const renderWidth = Math.min(
		MAX_MAP_SIZE,
		activeArea.width + AUTO_EXPAND_BUFFER_TILES,
	);
	const renderHeight = Math.min(
		MAX_MAP_SIZE,
		activeArea.height + AUTO_EXPAND_BUFFER_TILES,
	);
	const editablePixelAssetIds = [...terrainPresets, ...overlayPresets].map(
		(item) => item.id,
	);
	const editingPixelAsset =
		project.pixelAssets[pixelAssetId] ?? project.pixelAssets.grass;
	const areaLinks = activeArea.eventBlocks.filter(
		(eventBlock) => eventBlock.kind === "area_link",
	);

	// TODO: Support negative-direction expansion by shifting terrain/overlay/structure/event coordinates safely.

	function getBrushSamples(centerX: number, centerY: number) {
		const operation = getTerrainHeightOperation();
		const bounds = operation
			? { height: activeArea.height, width: activeArea.width }
			: { height: renderHeight, width: renderWidth };
		const falloff =
			operation === "raise" ||
			operation === "lower" ||
			operation === "smooth" ||
			operation === "slope" ||
			operation === "roughen"
				? brushFalloff
				: "hard";
		return resolveTerrainBrushSamples({
			bounds,
			center: { x: centerX, y: centerY },
			falloff,
			shape: brushShape,
			size: brushSize,
		});
	}

	function isHeightTool(tool: MapEditorTool) {
		return (
			tool === "raise-height" ||
			tool === "lower-height" ||
			tool === "flatten-height" ||
			tool === "set-height" ||
			tool === "smooth-height" ||
			tool === "slope-height" ||
			tool === "roughen-height"
		);
	}

	function getTerrainHeightOperation(): TerrainHeightOperation | undefined {
		if (activeTool === "raise-height") {
			return "raise";
		}
		if (activeTool === "lower-height") {
			return "lower";
		}
		if (activeTool === "flatten-height") {
			return "flatten";
		}
		if (activeTool === "set-height") {
			return "set";
		}
		if (activeTool === "smooth-height") {
			return "smooth";
		}
		if (activeTool === "slope-height") {
			return "slope";
		}
		if (activeTool === "roughen-height") {
			return "roughen";
		}
		return undefined;
	}

	function getLatestActiveArea() {
		return getEditorActiveArea(useProjectStore.getState().project);
	}

	function makeTerrainTileReader(area: GameArea) {
		const lookup = new Map(
			area.terrainTiles.map((tile) => [cellKey(tile.x, tile.y), tile.tileId]),
		);
		return (cell: TerrainBrushCell) =>
			lookup.get(cellKey(cell.x, cell.y)) ?? "grass";
	}

	function applyTerrainOperationToCells(
		cells: TerrainBrushCell[],
		selectionPosition: TerrainBrushCell,
		samples: TerrainBrushSample[] = cells.map((cell) => ({
			...cell,
			influence: 1,
		})),
	) {
		if (paintTarget !== "terrain") {
			return false;
		}

		const heightOperation = getTerrainHeightOperation();
		if (heightOperation) {
			const areaSnapshot = getLatestActiveArea();
			const updates = resolveTerrainHeightUpdates({
				area: areaSnapshot,
				operation: heightOperation,
				samples: samples.filter((sample) =>
					isInBounds(
						sample.x,
						sample.y,
						areaSnapshot.width,
						areaSnapshot.height,
					),
				),
				strength: brushStrength,
				targetHeight:
					heightOperation === "flatten" ? 0 : Number(heightToolValue),
			});
			if (updates.length > 0) {
				setTerrainHeights(updates);
			}
			setSelection({
				areaId: activeArea.id,
				type: "terrain",
				x: selectionPosition.x,
				y: selectionPosition.y,
			});
			return true;
		}

		if (activeTool !== "paint") {
			return false;
		}

		const areaSnapshot = getLatestActiveArea();
		const updates = resolveTerrainPaintUpdates({
			cells,
			getTileId: makeTerrainTileReader(areaSnapshot),
			knownBounds: { height: activeArea.height, width: activeArea.width },
			targetTileId: selectedTerrainId,
		});
		if (updates.length > 0) {
			setTiles(updates);
		}
		setSelection({
			areaId: activeArea.id,
			type: "terrain",
			x: selectionPosition.x,
			y: selectionPosition.y,
		});
		return true;
	}

	function applyBrush(centerX: number, centerY: number) {
		if (
			activeTool !== "paint" &&
			activeTool !== "erase" &&
			!isHeightTool(activeTool)
		) {
			return;
		}

		const brushSamples = getBrushSamples(centerX, centerY).filter((cell) => {
			const key = cellKey(cell.x, cell.y);
			if (
				paintedCellsRef.current.has(key) ||
				(activeTool === "paint" &&
					paintTarget !== "terrain" &&
					paintTarget !== "eventBlock" &&
					eventLookup.has(key))
			) {
				return false;
			}

			paintedCellsRef.current.add(key);
			return true;
		});
		const cells = brushSamples.map(
			({ influence: _influence, ...cell }) => cell,
		);

		if (activeTool === "erase") {
			cells.forEach((cell) => {
				eraseCellAt(cell.x, cell.y);
			});
			return;
		}

		if (paintTarget === "overlay") {
			setOverlayTiles(
				cells.map((cell) => ({ ...cell, overlayId: selectedOverlayId })),
			);
			return;
		}

		applyTerrainOperationToCells(
			cells,
			{ x: centerX, y: centerY },
			brushSamples,
		);
	}

	function canUseTerrainGesture() {
		return (
			paintTarget === "terrain" &&
			(activeTool === "paint" || isHeightTool(activeTool))
		);
	}

	function getTerrainShapeCells(
		gesture: Extract<TerrainGesture, "line" | "rectangle"> | "slope",
		start: TerrainBrushCell,
		end: TerrainBrushCell,
	) {
		const bounds = getTerrainHeightOperation()
			? { height: activeArea.height, width: activeArea.width }
			: { height: renderHeight, width: renderWidth };
		if (gesture === "slope") {
			return resolveTerrainSlopeCells({
				bounds,
				end,
				radius: brushSize,
				start,
			});
		}
		return gesture === "line"
			? resolveTerrainLine({ bounds, end, start })
			: resolveTerrainRectangle({ bounds, end, start });
	}

	function applyTerrainSlopeGesture(
		start: TerrainBrushCell,
		end: TerrainBrushCell,
	) {
		if (paintTarget !== "terrain") {
			return false;
		}
		const areaSnapshot = getLatestActiveArea();
		const updates = resolveTerrainSlopeHeightUpdates({
			area: areaSnapshot,
			bounds: { height: areaSnapshot.height, width: areaSnapshot.width },
			end,
			endHeight: Number(heightToolValue),
			falloff: brushFalloff,
			radius: brushSize,
			start,
			strength: brushStrength,
		});
		if (updates.length > 0) {
			setTerrainHeights(updates);
		}
		setSelection({
			areaId: activeArea.id,
			type: "terrain",
			x: end.x,
			y: end.y,
		});
		return true;
	}

	function updateTerrainShapePreview(end: TerrainBrushCell) {
		const gesture = terrainShapeGestureRef.current;
		if (!gesture) {
			return;
		}
		setTerrainPreviewCells(
			getTerrainShapeCells(gesture.gesture, gesture.start, end),
		);
	}

	function commitTerrainShapeGesture(end: TerrainBrushCell) {
		const gesture = terrainShapeGestureRef.current;
		if (!gesture) {
			return;
		}
		const cells = getTerrainShapeCells(gesture.gesture, gesture.start, end);
		if (gesture.gesture === "slope") {
			applyTerrainSlopeGesture(gesture.start, end);
		} else {
			applyTerrainOperationToCells(cells, end);
		}
		recordMapEdit(gesture.before);
		terrainShapeGestureRef.current = null;
		setTerrainPreviewCells([]);
	}

	function cancelTerrainShapeGesture() {
		terrainShapeGestureRef.current = null;
		setTerrainPreviewCells([]);
	}

	function applyTerrainFill(seed: TerrainBrushCell) {
		if (paintTarget !== "terrain" || activeTool !== "paint") {
			return;
		}
		const areaSnapshot = getLatestActiveArea();
		const cells = resolveTerrainFloodFill({
			bounds: { height: areaSnapshot.height, width: areaSnapshot.width },
			getTileId: makeTerrainTileReader(areaSnapshot),
			seed,
			targetTileId: selectedTerrainId,
		});
		if (cells.length === 0) {
			setSelection({
				areaId: activeArea.id,
				type: "terrain",
				x: seed.x,
				y: seed.y,
			});
			return;
		}

		const before = cloneCurrentProject();
		applyTerrainOperationToCells(cells, seed);
		recordMapEdit(before);
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
		setSelection({ type: "structure", areaId: activeArea.id, id });
	}

	function placePickup(x: number, y: number) {
		const id = addPickup(x, y);
		setSelection({ type: "pickup", areaId: activeArea.id, id });
	}

	function placeObject(x: number, y: number) {
		if (!selectedObjectDefinitionId) {
			return;
		}

		const id = addObject(x, y, selectedObjectDefinitionId);
		setSelection({ type: "object", areaId: activeArea.id, id });
	}

	function placeNpc(x: number, y: number) {
		if (!selectedNpcDefinitionId) {
			return;
		}

		const id = addNpc(x, y, selectedNpcDefinitionId);
		setSelection({ type: "npc", areaId: activeArea.id, id });
	}

	function findStructureAt(x: number, y: number) {
		return [...activeArea.structures]
			.reverse()
			.find(
				(structure) =>
					x >= structure.x &&
					y >= structure.y &&
					x < structure.x + structure.widthTiles &&
					y < structure.y + structure.heightTiles,
			);
	}

	function findObjectAt(x: number, y: number) {
		return [...activeArea.objects].reverse().find((object) => {
			const definition = project.objects.find(
				(candidate) => candidate.id === object.objectDefinitionId,
			);
			const widthTiles = object.widthTiles ?? definition?.widthTiles ?? 1;
			const heightTiles = object.heightTiles ?? definition?.heightTiles ?? 1;
			return (
				x >= object.x &&
				y >= object.y &&
				x < object.x + widthTiles &&
				y < object.y + heightTiles
			);
		});
	}

	function selectThingAt(x: number, y: number) {
		const eventBlock = eventLookup.get(cellKey(x, y));
		const object = objectLookup.get(cellKey(x, y)) ?? findObjectAt(x, y);
		const pickup = pickupLookup.get(cellKey(x, y));
		const npc = npcLookup.get(cellKey(x, y));
		const structure = findStructureAt(x, y);

		if (object) {
			setSelection({ type: "object", areaId: activeArea.id, id: object.id });
			return true;
		}

		if (npc) {
			setSelection({ type: "npc", areaId: activeArea.id, id: npc.id });
			return true;
		}

		if (pickup) {
			setSelection({ type: "pickup", areaId: activeArea.id, id: pickup.id });
			return true;
		}

		if (eventBlock) {
			setSelection({
				type: "eventBlock",
				areaId: activeArea.id,
				id: eventBlock.id,
			});
			return true;
		}

		if (structure) {
			setSelection({
				type: "structure",
				areaId: activeArea.id,
				id: structure.id,
			});
			return true;
		}

		if (overlayLookup.has(cellKey(x, y))) {
			setSelection({ type: "overlay", areaId: activeArea.id, x, y });
			return true;
		}

		setSelection({ type: "terrain", areaId: activeArea.id, x, y });
		return true;
	}

	function getDraggableEntityAt(x: number, y: number) {
		const object = objectLookup.get(cellKey(x, y)) ?? findObjectAt(x, y);
		if (object) {
			return { type: "object" as const, id: object.id };
		}
		const npc = npcLookup.get(cellKey(x, y));
		if (npc) {
			return { type: "npc" as const, id: npc.id };
		}
		const pickup = pickupLookup.get(cellKey(x, y));
		if (pickup) {
			return { type: "pickup" as const, id: pickup.id };
		}
		const eventBlock = eventLookup.get(cellKey(x, y));
		if (eventBlock) {
			return { type: "eventBlock" as const, id: eventBlock.id };
		}
		const structure = findStructureAt(x, y);
		return structure
			? { type: "structure" as const, id: structure.id }
			: undefined;
	}

	function moveDraggedEntity(x: number, y: number) {
		const drag = dragEntityRef.current;
		if (!drag) {
			return;
		}
		if (drag.type === "npc") {
			updateNpc(drag.id, { x, y });
		} else if (drag.type === "object") {
			updateObject(drag.id, { x, y });
		} else if (drag.type === "pickup") {
			updatePickup(drag.id, { x, y });
		} else if (drag.type === "eventBlock") {
			updateEventBlock(drag.id, { x, y });
		} else {
			updateStructure(drag.id, { x, y });
		}
		drag.moved = true;
	}

	function selectedEntityAt(x: number, y: number) {
		if (!selection || selection.areaId !== activeArea.id) {
			return undefined;
		}

		if (
			selection.type === "object" &&
			(objectLookup.get(cellKey(x, y)) ?? findObjectAt(x, y))?.id ===
				selection.id
		) {
			return { type: "object" as const, id: selection.id };
		}

		if (
			selection.type === "npc" &&
			npcLookup.get(cellKey(x, y))?.id === selection.id
		) {
			return { type: "npc" as const, id: selection.id };
		}

		if (
			selection.type === "pickup" &&
			pickupLookup.get(cellKey(x, y))?.id === selection.id
		) {
			return { type: "pickup" as const, id: selection.id };
		}

		if (
			selection.type === "eventBlock" &&
			eventLookup.get(cellKey(x, y))?.id === selection.id
		) {
			return { type: "eventBlock" as const, id: selection.id };
		}

		if (
			selection.type === "structure" &&
			findStructureAt(x, y)?.id === selection.id
		) {
			return { type: "structure" as const, id: selection.id };
		}

		return undefined;
	}

	function deleteEntity(
		entity: NonNullable<ReturnType<typeof selectedEntityAt>>,
	) {
		if (entity.type === "object") {
			deleteObject(entity.id);
		} else if (entity.type === "npc") {
			deleteNpc(entity.id);
		} else if (entity.type === "pickup") {
			deletePickup(entity.id);
		} else if (entity.type === "eventBlock") {
			deleteEventBlock(entity.id);
		} else {
			deleteStructure(entity.id);
		}
		setSelection({ type: "area", areaId: activeArea.id });
	}

	function eraseCellAt(x: number, y: number) {
		const selectedEntity = selectedEntityAt(x, y);
		if (selectedEntity) {
			deleteEntity(selectedEntity);
			return;
		}

		const object = objectLookup.get(cellKey(x, y)) ?? findObjectAt(x, y);
		if (object) {
			deleteEntity({ type: "object", id: object.id });
			return;
		}

		const npc = npcLookup.get(cellKey(x, y));
		if (npc) {
			deleteEntity({ type: "npc", id: npc.id });
			return;
		}

		const pickup = pickupLookup.get(cellKey(x, y));
		if (pickup) {
			deleteEntity({ type: "pickup", id: pickup.id });
			return;
		}

		const eventBlock = eventLookup.get(cellKey(x, y));
		if (eventBlock) {
			deleteEntity({ type: "eventBlock", id: eventBlock.id });
			return;
		}

		const structure = findStructureAt(x, y);
		if (structure) {
			deleteEntity({ type: "structure", id: structure.id });
			return;
		}

		if (overlayLookup.has(cellKey(x, y))) {
			eraseOverlayTiles([{ x, y }]);
			setSelection({ type: "terrain", areaId: activeArea.id, x, y });
			return;
		}

		if ((terrainLookup.get(cellKey(x, y)) ?? "grass") !== "grass") {
			setTiles([{ x, y, tileId: "grass" }]);
			setSelection({ type: "terrain", areaId: activeArea.id, x, y });
		}
	}

	function selectPaintedCell(x: number, y: number) {
		if (paintTarget === "overlay" && activeTool === "paint") {
			setSelection({ type: "overlay", areaId: activeArea.id, x, y });
			return;
		}

		setSelection({ type: "terrain", areaId: activeArea.id, x, y });
	}

	function handleCellPointerDown(
		event: PointerEvent<HTMLButtonElement>,
		x: number,
		y: number,
	) {
		if (activeTool === "pan" || event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (activeTool === "select") {
			selectThingAt(x, y);
			const entity = getDraggableEntityAt(x, y);
			dragEntityRef.current = entity
				? { ...entity, before: cloneCurrentProject(), moved: false }
				: null;
			return;
		}

		if (activeTool === "erase") {
			paintedCellsRef.current.clear();
			paintSessionBeforeRef.current = cloneCurrentProject();
			setIsPainting(true);
			applyBrush(x, y);
			return;
		}

		if (
			canUseTerrainGesture() &&
			terrainGesture === "fill" &&
			activeTool === "paint"
		) {
			applyTerrainFill({ x, y });
			return;
		}

		if (
			canUseTerrainGesture() &&
			(activeTool === "slope-height" ||
				terrainGesture === "line" ||
				terrainGesture === "rectangle")
		) {
			const shapeGesture: TerrainShapeGestureState["gesture"] =
				activeTool === "slope-height"
					? "slope"
					: terrainGesture === "rectangle"
						? "rectangle"
						: "line";
			terrainShapeGestureRef.current = {
				before: cloneCurrentProject(),
				gesture: shapeGesture,
				start: { x, y },
			};
			updateTerrainShapePreview({ x, y });
			return;
		}

		if (paintTarget === "eventBlock") {
			const eventBlock = eventLookup.get(cellKey(x, y));
			if (eventBlock) {
				setSelection({
					type: "eventBlock",
					areaId: activeArea.id,
					id: eventBlock.id,
				});
				return;
			}

			const before = cloneCurrentProject();
			const id = addEventBlock(x, y);
			setSelection({ type: "eventBlock", areaId: activeArea.id, id });
			recordMapEdit(before);
			return;
		}

		if (paintTarget === "structure") {
			const before = cloneCurrentProject();
			placeStructure(x, y);
			recordMapEdit(before);
			return;
		}

		if (paintTarget === "pickup") {
			const pickup = pickupLookup.get(cellKey(x, y));
			if (pickup) {
				setSelection({ type: "pickup", areaId: activeArea.id, id: pickup.id });
				return;
			}

			const before = cloneCurrentProject();
			placePickup(x, y);
			recordMapEdit(before);
			return;
		}

		if (paintTarget === "object") {
			const object = objectLookup.get(cellKey(x, y)) ?? findObjectAt(x, y);
			if (object) {
				setSelection({ type: "object", areaId: activeArea.id, id: object.id });
				return;
			}

			const before = cloneCurrentProject();
			placeObject(x, y);
			recordMapEdit(before);
			return;
		}

		if (paintTarget === "npc") {
			const npc = npcLookup.get(cellKey(x, y));
			if (npc) {
				setSelection({ type: "npc", areaId: activeArea.id, id: npc.id });
				return;
			}

			const before = cloneCurrentProject();
			placeNpc(x, y);
			recordMapEdit(before);
			return;
		}

		paintedCellsRef.current.clear();
		paintSessionBeforeRef.current = cloneCurrentProject();
		setIsPainting(true);
		applyBrush(x, y);
		selectPaintedCell(x, y);
	}

	function handleCellPointerUp(
		event: PointerEvent<HTMLButtonElement>,
		x: number,
		y: number,
	) {
		if (event.button !== 0) {
			return;
		}
		commitTerrainShapeGesture({ x, y });
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

		const containerLeft =
			event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
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

	function handleInspectorResizeStart(event: PointerEvent<HTMLDivElement>) {
		event.preventDefault();
		setIsResizingInspector(true);
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleInspectorResizeMove(event: PointerEvent<HTMLDivElement>) {
		if (!isResizingInspector) {
			return;
		}

		const containerRight =
			event.currentTarget.parentElement?.getBoundingClientRect().right ?? 0;
		const nextWidth = clampInspectorWidth(containerRight - event.clientX);
		setInspectorWidth(nextWidth);
		localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(nextWidth));
	}

	function handleInspectorResizeEnd(event: PointerEvent<HTMLDivElement>) {
		if (!isResizingInspector) {
			return;
		}

		setIsResizingInspector(false);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	function handleCellPointerEnter(x: number, y: number) {
		if (terrainShapeGestureRef.current) {
			updateTerrainShapePreview({ x, y });
			return;
		}
		if (
			!isPainting &&
			terrainGesture === "fill" &&
			paintTarget === "terrain" &&
			activeTool === "paint" &&
			isInBounds(x, y, activeArea.width, activeArea.height)
		) {
			const fillCells = resolveTerrainFloodFill({
				bounds: { height: activeArea.height, width: activeArea.width },
				getTileId: (cell) =>
					terrainLookup.get(cellKey(cell.x, cell.y)) ?? "grass",
				seed: { x, y },
				targetTileId: selectedTerrainId,
			});
			setTerrainPreviewCells(fillCells.length > 0 ? fillCells : [{ x, y }]);
			return;
		}
		if (activeTool === "select" && dragEntityRef.current) {
			moveDraggedEntity(x, y);
			return;
		}
		if (
			!isPainting ||
			(activeTool !== "paint" &&
				activeTool !== "erase" &&
				!isHeightTool(activeTool))
		) {
			return;
		}

		applyBrush(x, y);
	}

	function stopPainting() {
		if (isPainting && paintSessionBeforeRef.current) {
			recordMapEdit(paintSessionBeforeRef.current);
		}
		setIsPainting(false);
		paintSessionBeforeRef.current = null;
		paintedCellsRef.current.clear();
		if (dragEntityRef.current?.moved) {
			recordMapEdit(dragEntityRef.current.before);
		}
		dragEntityRef.current = null;
		cancelTerrainShapeGesture();
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
		const nextWidth = clampMapSize(activeArea.width + deltaWidth);
		const nextHeight = clampMapSize(activeArea.height + deltaHeight);
		resizeMap(nextWidth, nextHeight);
		setResizeMessage(`Expanded to ${nextWidth}x${nextHeight}.`);
	}

	function createNewArea() {
		const id = addArea(newAreaTemplateId);
		setActiveArea(id);
		setResizeMessage("");
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

	function getTerrainBrushMode(): TerrainBrushMode {
		if (activeTool === "raise-height") {
			return "raise-height";
		}
		if (activeTool === "lower-height") {
			return "lower-height";
		}
		if (activeTool === "flatten-height") {
			return "flatten-height";
		}
		if (activeTool === "set-height") {
			return "set-height";
		}
		if (activeTool === "smooth-height") {
			return "smooth-height";
		}
		if (activeTool === "slope-height") {
			return "slope-height";
		}
		if (activeTool === "roughen-height") {
			return "roughen-height";
		}
		return "paint";
	}

	function selectTerrainBrushMode(mode: TerrainBrushMode) {
		setPaintTarget("terrain");
		setMapPaletteSelection({ type: "none" });
		if (mode === "paint") {
			setActiveTool("paint");
			setIsTerrainPaintArmed(true);
			return;
		}
		setActiveTool(mode);
		setIsTerrainPaintArmed(false);
	}

	function selectTerrainGesture(gesture: TerrainGesture) {
		cancelTerrainShapeGesture();
		setTerrainGesture(gesture);
		if (gesture === "fill") {
			setActiveTool("paint");
			setPaintTarget("terrain");
			setIsTerrainPaintArmed(true);
			setMapPaletteSelection({ type: "none" });
		}
	}

	function selectTerrain(id: string) {
		setSelectedTerrainId(id);
		setPaintTarget("terrain");
		setActiveTool("paint");
		setIsTerrainPaintArmed(true);
		setMapPaletteSelection({ type: "none" });
	}

	function selectOverlay(id: string) {
		setSelectedOverlayId(id);
		setPaintTarget("overlay");
		setActiveTool("paint");
		setIsTerrainPaintArmed(false);
		setMapPaletteSelection({ type: "none" });
	}

	function selectStructure(id: string) {
		setSelectedStructureId(id);
		setPaintTarget("structure");
		setActiveTool("paint");
		setIsTerrainPaintArmed(false);
		setMapPaletteSelection({ structureId: id, type: "structure" });
	}

	function getToolLabel() {
		return activeTool.charAt(0).toUpperCase() + activeTool.slice(1);
	}

	function getPaletteLabel() {
		if (paintTarget === "eventBlock") {
			return "Event";
		}

		return paintTarget.charAt(0).toUpperCase() + paintTarget.slice(1);
	}

	function getPaintTargetLabel() {
		if (paintTarget === "terrain") {
			const preset = getTerrainPreset(selectedTerrainId);
			const style = project.tileStyles[selectedTerrainId] ?? {
				color: preset.color,
				label: preset.label,
			};
			return `${style.label ?? preset.label} Tile`;
		}

		if (paintTarget === "overlay") {
			return `${getOverlayPreset(selectedOverlayId).label} Overlay`;
		}

		if (paintTarget === "structure") {
			return `${selectedStructure.label} Structure`;
		}

		if (paintTarget === "eventBlock") {
			return "Event Block";
		}

		if (paintTarget === "pickup") {
			return `${project.items[0]?.name ?? "Item"} Pickup`;
		}

		if (paintTarget === "npc") {
			return `${project.npcs.find((npc) => npc.id === selectedNpcDefinitionId)?.name ?? "NPC"} NPC`;
		}

		return `${selectedObjectDefinition?.name ?? "Object"} Object`;
	}

	function getCurrentSelectionLabel() {
		if (selectedEventBlock) {
			return `${selectedEventBlock.name} Event`;
		}

		if (selectedMapStructure) {
			return `${selectedMapStructure.name} Structure`;
		}

		if (selectedObject) {
			const definition = project.objects.find(
				(object) => object.id === selectedObject.objectDefinitionId,
			);
			return `${selectedObject.nameOverride ?? definition?.name ?? "Object"} Object`;
		}

		if (selectedPickup) {
			const item = project.items.find(
				(item) => item.id === selectedPickup.itemId,
			);
			return `${item?.name ?? "Item"} Pickup`;
		}

		if (selectedResolvedNpc) {
			return `${selectedResolvedNpc.name} NPC`;
		}

		if (selectedOverlayTile?.overlayId) {
			return `${getOverlayPreset(selectedOverlayTile.overlayId).label} Overlay`;
		}

		if (selectedTerrainTile) {
			const preset = getTerrainPreset(selectedTerrainTile.tileId);
			const style = project.tileStyles[selectedTerrainTile.tileId] ?? {
				color: preset.color,
				label: preset.label,
			};
			return `${style.label ?? preset.label} Tile`;
		}

		return activeArea.name;
	}

	const statusSelectedLabel =
		activeTool === "select"
			? getCurrentSelectionLabel()
			: getPaintTargetLabel();

	return (
		<section
			className="editor-panel map-editor"
			style={
				{
					"--map-inspector-width": `${inspectorWidth}px`,
					"--map-palette-width": `${paletteWidth}px`,
				} as CSSProperties
			}
		>
			<aside className="tool-panel map-tool-panel">
				<div className="map-tool-panel-content">
					<div className="panel-title">Area</div>
					<div className="form-stack area-panel">
						<label>
							Editing
							<select
								onChange={(event) => setActiveArea(event.target.value)}
								value={activeArea.id}
							>
								{project.areas.map((area) => (
									<option key={area.id} value={area.id}>
										{area.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Name
							<input
								onChange={(event) =>
									updateActiveArea({ name: event.target.value })
								}
								value={activeArea.name}
							/>
						</label>
						<label>
							Kind
							<select
								onChange={(event) =>
									updateActiveArea({ kind: event.target.value as GameAreaKind })
								}
								value={activeArea.kind}
							>
								{areaKindOptions.map((kind) => (
									<option key={kind} value={kind}>
										{kind}
									</option>
								))}
							</select>
						</label>
						<div className="area-create-row">
							<select
								onChange={(event) =>
									setNewAreaTemplateId(event.target.value as AreaTemplateId)
								}
								value={newAreaTemplateId}
							>
								{areaTemplates.map((template) => (
									<option key={template.id} value={template.id}>
										{template.label}
									</option>
								))}
							</select>
							<button onClick={createNewArea} type="button">
								Add
							</button>
						</div>
						<button
							className="danger-button compact"
							disabled={project.areas.length <= 1}
							onClick={() => deleteArea(activeArea.id)}
							type="button"
						>
							Delete area
						</button>
						{areaLinks.length > 0 ? (
							<div className="area-link-list">
								{areaLinks.map((eventBlock) => {
									const targetArea = project.areas.find(
										(area) => area.id === eventBlock.link?.targetAreaId,
									);
									return (
										<div key={eventBlock.id}>
											{eventBlock.name} {"->"} {targetArea?.name ?? "Unlinked"}
										</div>
									);
								})}
							</div>
						) : null}
					</div>
					<div className="panel-title">Map size</div>
					<div className="map-size-readout">
						{activeArea.width} x {activeArea.height} tiles
					</div>
					<div className="form-grid map-size-grid">
						<label>
							Width
							<input
								min={1}
								onChange={(event) =>
									setDraftMapSize((size) => ({
										...size,
										width: Number(event.target.value),
									}))
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
									setDraftMapSize((size) => ({
										...size,
										height: Number(event.target.value),
									}))
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
								const style = project.tileStyles[tile.id] ?? {
									color: tile.color,
									label: tile.label,
								};
								return (
									<button
										className={`palette-item ${
											selectedTerrainId === tile.id && paintTarget === "terrain"
												? "selected"
												: ""
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

					<details className="palette-section">
						<summary>Overlays</summary>
						<div className="palette-list tile-palette">
							{overlayPresets.map((overlay) => (
								<button
									className={`palette-item ${
										selectedOverlayId === overlay.id &&
										paintTarget === "overlay"
											? "selected"
											: ""
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

					<details className="palette-section">
						<summary>Structures</summary>
						<div className="palette-list tile-palette">
							{structurePresets.map((structure) => (
								<button
									className={`palette-item ${
										selectedStructureId === structure.id &&
										paintTarget === "structure"
											? "selected"
											: ""
									}`}
									key={structure.id}
									onClick={() => selectStructure(structure.id)}
									type="button"
								>
									<span
										className="swatch structure-swatch"
										style={{ background: structure.roofColor }}
									/>
									{structure.label}
								</button>
							))}
						</div>
					</details>

					<details className="palette-section">
						<summary>Objects</summary>
						<label>
							Object definition
							<select
								onChange={(event) => {
									setSelectedObjectDefinitionId(event.target.value);
									if (paintTarget === "object") {
										setMapPaletteSelection({
											objectDefinitionId: event.target.value,
											type: "object",
										});
									}
								}}
								value={selectedObjectDefinitionId}
							>
								{project.objects.map((object) => (
									<option key={object.id} value={object.id}>
										{object.name}
									</option>
								))}
							</select>
						</label>
						<button
							className={`palette-item ${paintTarget === "object" ? "selected" : ""}`}
							disabled={!selectedObjectDefinitionId}
							onClick={() => {
								setActiveTool("paint");
								setPaintTarget("object");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({
									objectDefinitionId: selectedObjectDefinitionId,
									type: "object",
								});
							}}
							type="button"
						>
							<span className="swatch object-swatch">O</span>
							{selectedObjectDefinition?.name ?? "Object"}
						</button>
					</details>

					<details className="palette-section">
						<summary>Special</summary>
						<button
							className={`palette-item ${paintTarget === "eventBlock" ? "selected" : ""}`}
							onClick={() => {
								setActiveTool("paint");
								setPaintTarget("eventBlock");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "eventBlock" });
							}}
							type="button"
						>
							<span className="swatch event-swatch">E</span>
							Event block
						</button>
						<button
							className={`palette-item ${paintTarget === "pickup" ? "selected" : ""}`}
							onClick={() => {
								setActiveTool("paint");
								setPaintTarget("pickup");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({
									itemId: project.items[0]?.id,
									type: "pickup",
								});
							}}
							type="button"
						>
							<span className="swatch pickup-swatch">P</span>
							Pickup
						</button>
						<label>
							NPC definition
							<select
								onChange={(event) => {
									setSelectedNpcDefinitionId(event.target.value);
									if (paintTarget === "npc") {
										setMapPaletteSelection({
											npcDefinitionId: event.target.value,
											type: "npc",
										});
									}
								}}
								value={selectedNpcDefinitionId}
							>
								{project.npcs.map((npc) => (
									<option key={npc.id} value={npc.id}>
										{npc.name}
									</option>
								))}
							</select>
						</label>
						<button
							className={`palette-item ${paintTarget === "npc" ? "selected" : ""}`}
							disabled={!selectedNpcDefinitionId}
							onClick={() => {
								setActiveTool("paint");
								setPaintTarget("npc");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({
									npcDefinitionId: selectedNpcDefinitionId,
									type: "npc",
								});
							}}
							type="button"
						>
							<span className="swatch npc-swatch">N</span>
							NPC
						</button>
					</details>

					<div className="panel-title">Tools</div>
					<div className="tool-button-grid">
						<button
							className={activeTool === "select" ? "selected" : ""}
							onClick={() => {
								setActiveTool("select");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Select
						</button>
						<button
							className={activeTool === "paint" ? "selected" : ""}
							onClick={() => {
								setActiveTool("paint");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Paint
						</button>
						<button
							className={activeTool === "erase" ? "selected" : ""}
							onClick={() => {
								setActiveTool("erase");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Erase
						</button>
						<button
							className={activeTool === "pan" ? "selected" : ""}
							onClick={() => {
								setActiveTool("pan");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Pan
						</button>
					</div>
					<div className="panel-title secondary">Height</div>
					<div className="tool-button-grid">
						<button
							className={activeTool === "raise-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("raise-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Raise
						</button>
						<button
							className={activeTool === "lower-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("lower-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Lower
						</button>
						<button
							className={activeTool === "flatten-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("flatten-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Flatten
						</button>
						<button
							className={activeTool === "slope-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("slope-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Slope
						</button>
						<button
							className={activeTool === "set-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("set-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Set Height
						</button>
						<button
							className={activeTool === "smooth-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("smooth-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Smooth
						</button>
						<button
							className={activeTool === "roughen-height" ? "selected" : ""}
							onClick={() => {
								setActiveTool("roughen-height");
								setPaintTarget("terrain");
								setIsTerrainPaintArmed(false);
								setMapPaletteSelection({ type: "none" });
							}}
							type="button"
						>
							Roughen
						</button>
					</div>
					{activeTool === "set-height" || activeTool === "slope-height" ? (
						<label>
							{activeTool === "slope-height"
								? "Slope end height"
								: "Height value"}
							<input
								max="8"
								min="-2"
								onChange={(event) =>
									setHeightToolValue(Number(event.target.value))
								}
								type="number"
								value={heightToolValue}
							/>
						</label>
					) : null}
					<p className="tool-note">
						Hotkeys: 1 Select, 2 Paint, 3 Erase. Erase removes entities, then
						overlays, then resets terrain to grass.
					</p>
					<div className="inline-actions map-history-actions">
						<button disabled={!canUndo} onClick={undoMapEdit} type="button">
							Undo
						</button>
						<button disabled={!canRedo} onClick={redoMapEdit} type="button">
							Redo
						</button>
					</div>

					<div className="panel-title">Brush</div>
					<div className="segmented-control">
						{(["brush", "line", "rectangle", "fill"] as TerrainGesture[]).map(
							(gesture) => (
								<button
									className={terrainGesture === gesture ? "selected" : ""}
									key={gesture}
									onClick={() => selectTerrainGesture(gesture)}
									type="button"
								>
									{gesture === "brush"
										? "Brush"
										: gesture === "line"
											? "Line"
											: gesture === "rectangle"
												? "Rectangle"
												: "Fill"}
								</button>
							),
						)}
					</div>
					{terrainGesture !== "fill" ? (
						<label>
							Mode
							<select
								onChange={(event) =>
									selectTerrainBrushMode(event.target.value as TerrainBrushMode)
								}
								value={getTerrainBrushMode()}
							>
								<option value="paint">Paint terrain</option>
								<option value="raise-height">Raise height</option>
								<option value="lower-height">Lower height</option>
								<option value="flatten-height">Flatten height</option>
								<option value="slope-height">Slope height</option>
								<option value="set-height">Set height</option>
								<option value="smooth-height">Smooth height</option>
								<option value="roughen-height">Roughen height</option>
							</select>
						</label>
					) : null}
					{terrainGesture === "brush" ? (
						<>
							<div className="segmented-control">
								{([1, 2, 3, 4, 5, 6, 7, 8] as BrushSize[]).map((size) => (
									<button
										className={brushSize === size ? "selected" : ""}
										key={size}
										onClick={() => setBrushSize(size)}
										type="button"
									>
										{size}
									</button>
								))}
							</div>
							<div className="segmented-control">
								{(["square", "circle"] as TerrainBrushShape[]).map((shape) => (
									<button
										className={brushShape === shape ? "selected" : ""}
										key={shape}
										onClick={() => setBrushShape(shape)}
										type="button"
									>
										{shape === "square" ? "Square" : "Circle"}
									</button>
								))}
							</div>
						</>
					) : null}
					{terrainGesture !== "fill" && isHeightTool(activeTool) ? (
						<label>
							Strength
							<input
								max="4"
								min="1"
								onChange={(event) =>
									setBrushStrength(Number(event.target.value))
								}
								step="1"
								type="range"
								value={brushStrength}
							/>
							<span>{brushStrength}</span>
						</label>
					) : null}
					{terrainGesture === "brush" &&
					(activeTool === "raise-height" ||
						activeTool === "lower-height" ||
						activeTool === "smooth-height" ||
						activeTool === "slope-height" ||
						activeTool === "roughen-height") ? (
						<label>
							Falloff
							<select
								onChange={(event) =>
									setBrushFalloff(event.target.value as TerrainBrushFalloff)
								}
								value={brushFalloff}
							>
								<option value="hard">Hard</option>
								<option value="linear">Linear</option>
								<option value="smooth">Smooth</option>
							</select>
						</label>
					) : null}

					<div className="panel-title secondary">View</div>
					<div className="inline-actions">
						<button
							onClick={() =>
								setZoom((value) =>
									Math.max(0.4, Number((value - 0.2).toFixed(1))),
								)
							}
							type="button"
						>
							-
						</button>
						<span className="zoom-readout">{Math.round(zoom * 100)}%</span>
						<button
							onClick={() =>
								setZoom((value) =>
									Math.min(2.4, Number((value + 0.2).toFixed(1))),
								)
							}
							type="button"
						>
							+
						</button>
					</div>
					<button
						className="full-width reset-zoom-button"
						onClick={() => setZoom(1)}
						type="button"
					>
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
					<div className="panel-title">Filters</div>
					<div className="filter-button-row">
						<button
							onClick={() => setOverlayFilters(SHOW_ALL_OVERLAY_FILTERS)}
							type="button"
						>
							Show All
						</button>
						<button
							onClick={() => setOverlayFilters(HIDE_ALL_OVERLAY_FILTERS)}
							type="button"
						>
							Hide All
						</button>
						<button
							onClick={() => setOverlayFilters(GAMEPLAY_OVERLAY_FILTERS)}
							type="button"
						>
							Gameplay View
						</button>
					</div>
					<div className="filter-grid">
						{OVERLAY_FILTER_OPTIONS.map((option) => (
							<label className="checkbox-row compact" key={option.key}>
								<input
									checked={overlayFilters[option.key]}
									onChange={() =>
										setOverlayFilters((filters) =>
											toggleMapOverlayFilter(filters, option.key),
										)
									}
									type="checkbox"
								/>
								{option.label}
							</label>
						))}
					</div>

					<button
						className="primary-button full-width"
						onClick={() => setIsPixelEditorOpen(true)}
						type="button"
					>
						Tile Editor
					</button>

					<div className="panel-title secondary">Tile style</div>
					<div className="tile-style-list">
						{terrainPresets.map((tile) => {
							const style = project.tileStyles[tile.id] ?? {
								color: tile.color,
								label: tile.label,
							};
							return (
								<label className="tile-style-row" key={tile.id}>
									<span>{style.label ?? tile.label}</span>
									<input
										aria-label={`${tile.label} color`}
										onChange={(event) =>
											updateTileStyle(tile.id, { color: event.target.value })
										}
										type="color"
										value={style.color}
									/>
								</label>
							);
						})}
					</div>
				</div>
				<div
					aria-hidden="true"
					className={`palette-resize-handle ${isResizingPalette ? "active" : ""}`}
					onPointerDown={handlePaletteResizeStart}
					onPointerMove={handlePaletteResizeMove}
					onPointerUp={handlePaletteResizeEnd}
				/>
			</aside>

			<div className="map-workspace-main">
				<div className="map-workspace-toolbar">
					<div className="segmented-control map-view-toggle">
						<button
							className={mapView === "2d" ? "selected" : ""}
							onClick={() => setMapView("2d")}
							type="button"
						>
							2D View
						</button>
						<button
							className={mapView === "3d" ? "selected" : ""}
							onClick={() => setMapView("3d")}
							type="button"
						>
							3D View
						</button>
					</div>
					<div className="map-workspace-status">
						<span>{mapWorkspaceStatus}</span>
						<span>View: {mapView === "3d" ? "3D" : "2D"}</span>
					</div>
				</div>
				{mapView === "2d" ? (
					<div
						aria-label="Map editing canvas"
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
						role="application"
					>
						<div
							aria-label="Map editor status"
							className="map-status-bar"
							role="status"
						>
							<span>
								Tool: <strong>{getToolLabel()}</strong>
							</span>
							<span>
								Palette: <strong>{getPaletteLabel()}</strong>
							</span>
							<span>
								Selected: <strong>{statusSelectedLabel}</strong>
							</span>
							<span>
								Area: <strong>{activeArea.name}</strong>
							</span>
						</div>
						<div className="active-area-banner">
							Editing: <strong>{activeArea.name}</strong>
							<span>
								{activeArea.width} x {activeArea.height} tiles
							</span>
						</div>
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
									const tileStyle = project.tileStyles[terrainId] ?? {
										color: terrain.color,
										label: terrain.label,
									};
									const overlayId = overlayLookup.get(key);
									const rawEventBlock = eventLookup.get(key);
									const eventBlock =
										rawEventBlock &&
										(rawEventBlock.kind === "spawn"
											? overlayFilters.spawnPoints || overlayFilters.eventBlocks
											: overlayFilters.eventBlocks)
											? rawEventBlock
											: undefined;
									const object = overlayFilters.objects
										? objectLookup.get(key)
										: undefined;
									const pickup = overlayFilters.pickups
										? pickupLookup.get(key)
										: undefined;
									const pickupItem = project.items.find(
										(item) => item.id === pickup?.itemId,
									);
									const npc = overlayFilters.npcs
										? npcLookup.get(key)
										: undefined;
									const npcDefinition = project.npcs.find(
										(definition) => definition.id === npc?.npcDefinitionId,
									);
									const resolvedNpc = npc
										? resolveNPCInstance(npcDefinition, npc)
										: undefined;
									const eventLabel = eventBlock?.tag || eventBlock?.name;
									const isOutsideMap =
										x >= activeArea.width || y >= activeArea.height;
									const isSelectedTerrain =
										selection?.type === "terrain" &&
										selection.areaId === activeArea.id &&
										selection.x === x &&
										selection.y === y;
									const isSelectedOverlay =
										selection?.type === "overlay" &&
										selection.areaId === activeArea.id &&
										selection.x === x &&
										selection.y === y;
									const isTerrainPreview = terrainPreviewCellKeys.has(key);

									return (
										<button
											aria-label={`Tile ${x}, ${y}`}
											className={`map-cell ${isOutsideMap ? "map-cell-outside" : ""} ${
												isSelectedTerrain || isSelectedOverlay
													? "selected-cell"
													: ""
											} ${isSelectedOverlay ? "selected-overlay-cell" : ""} ${
												isTerrainPreview ? "map-cell-preview" : ""
											}`}
											key={key}
											onPointerDown={(event) =>
												handleCellPointerDown(event, x, y)
											}
											onPointerEnter={() => handleCellPointerEnter(x, y)}
											onPointerUp={(event) => handleCellPointerUp(event, x, y)}
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
														selection?.type === "eventBlock" &&
														selection.id === eventBlock.id
															? "selected-event"
															: ""
													}`}
												>
													<span className="event-marker-kind">
														{eventBlock.kind === "spawn"
															? "S"
															: eventBlock.kind === "area_link"
																? "->"
																: "T"}
													</span>
													<span className="event-marker-label">
														{eventLabel}
													</span>
												</span>
											) : null}
											{object ? (
												<span
													className={`object-marker ${
														selection?.type === "object" &&
														selection.id === object.id
															? "selected-object"
															: ""
													}`}
												>
													<span className="object-marker-icon">
														{(
															object.nameOverride ??
															project.objects.find(
																(definition) =>
																	definition.id === object.objectDefinitionId,
															)?.name ??
															"Object"
														)
															.slice(0, 1)
															.toUpperCase()}
													</span>
												</span>
											) : null}
											{pickup ? (
												<span
													className={`pickup-marker ${
														selection?.type === "pickup" &&
														selection.id === pickup.id
															? "selected-pickup"
															: ""
													}`}
												>
													<span className="pickup-marker-icon">
														{pickupItem?.name.slice(0, 1).toUpperCase() ?? "?"}
													</span>
													<span className="pickup-marker-label">
														{pickupItem?.name ?? "Pickup"} x{pickup.quantity}
													</span>
												</span>
											) : null}
											{npc ? (
												<span
													className={`npc-marker alignment-${resolvedNpc?.attributes.alignment ?? "friendly"} ${
														selection?.type === "npc" && selection.id === npc.id
															? "selected-npc"
															: ""
													}`}
												>
													<span className="npc-marker-icon">
														{resolvedNpc?.name.slice(0, 1).toUpperCase() ?? "?"}
													</span>
													<span className="npc-marker-label">
														{resolvedNpc?.name ?? "NPC"}
													</span>
												</span>
											) : null}
										</button>
									);
								}),
							)}
							{overlayFilters.npcPaths &&
							selectedResolvedNpc?.movementMode === "patrol" &&
							selectedResolvedNpc.patrolPath ? (
								<svg
									aria-label="NPC patrol path"
									className="map-npc-path-overlay"
									height={renderHeight * cellSize}
									role="img"
									width={renderWidth * cellSize}
								>
									<title>Selected NPC patrol path</title>
									<polyline
										points={selectedResolvedNpc.patrolPath.points
											.map(
												(point) =>
													`${point.x * cellSize + cellSize / 2},${point.y * cellSize + cellSize / 2}`,
											)
											.join(" ")}
									/>
									{selectedResolvedNpc.patrolPath.points.map((point, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: patrol paths may intentionally revisit the same coordinate, so sequence position is part of identity.
										<g key={`${point.x}_${point.y}_${index}`}>
											<circle
												cx={point.x * cellSize + cellSize / 2}
												cy={point.y * cellSize + cellSize / 2}
												r={Math.max(5, cellSize * 0.18)}
											/>
											<text
												x={point.x * cellSize + cellSize / 2}
												y={point.y * cellSize + cellSize / 2}
											>
												{index + 1}
											</text>
										</g>
									))}
								</svg>
							) : null}
							{overlayFilters.npcPaths &&
							selectedResolvedNpc?.movementMode === "wander" &&
							selectedResolvedNpc.wanderZone ? (
								<div
									className="map-npc-wander-zone"
									style={{
										left: selectedResolvedNpc.wanderZone.x * cellSize,
										top: selectedResolvedNpc.wanderZone.y * cellSize,
										width: selectedResolvedNpc.wanderZone.width * cellSize,
										height: selectedResolvedNpc.wanderZone.height * cellSize,
									}}
								>
									Wander
								</div>
							) : null}
							{overlayFilters.collision &&
							selectedResolvedNpc?.attributes.alignment === "hostile" &&
							selectedResolvedNpc.enemyBehaviour?.enabled ? (
								<>
									<div
										className="map-enemy-range detection"
										style={{
											left:
												(selectedResolvedNpc.x +
													0.5 -
													selectedResolvedNpc.enemyBehaviour
														.detectionRadiusTiles) *
												cellSize,
											top:
												(selectedResolvedNpc.y +
													0.5 -
													selectedResolvedNpc.enemyBehaviour
														.detectionRadiusTiles) *
												cellSize,
											width:
												selectedResolvedNpc.enemyBehaviour
													.detectionRadiusTiles *
												2 *
												cellSize,
											height:
												selectedResolvedNpc.enemyBehaviour
													.detectionRadiusTiles *
												2 *
												cellSize,
										}}
									>
										Detect
									</div>
									<div
										className="map-enemy-range chase"
										style={{
											left:
												(selectedResolvedNpc.x +
													0.5 -
													selectedResolvedNpc.enemyBehaviour.chaseRadiusTiles) *
												cellSize,
											top:
												(selectedResolvedNpc.y +
													0.5 -
													selectedResolvedNpc.enemyBehaviour.chaseRadiusTiles) *
												cellSize,
											width:
												selectedResolvedNpc.enemyBehaviour.chaseRadiusTiles *
												2 *
												cellSize,
											height:
												selectedResolvedNpc.enemyBehaviour.chaseRadiusTiles *
												2 *
												cellSize,
										}}
									>
										Chase
									</div>
								</>
							) : null}
							{overlayFilters.structures
								? activeArea.structures.map((structure) => {
										const preset = getStructurePreset(structure.structureId);
										return (
											<button
												className={`map-structure ${
													selection?.type === "structure" &&
													selection.id === structure.id
														? "selected"
														: ""
												}`}
												key={structure.id}
												onClick={(event) => {
													event.preventDefault();
													setSelection({
														type: "structure",
														areaId: activeArea.id,
														id: structure.id,
													});
												}}
												onPointerDown={(event) => {
													event.stopPropagation();
												}}
												style={
													{
														left: structure.x * cellSize,
														top: structure.y * cellSize,
														width: structure.widthTiles * cellSize,
														height: structure.heightTiles * cellSize,
														"--structure-roof": preset.roofColor,
														"--structure-wall": preset.wallColor,
														"--structure-shadow": preset.shadowColor,
													} as CSSProperties
												}
												type="button"
											>
												<span className="structure-roof" />
												<span className="structure-wall" />
												<span className="structure-label">
													{structure.name}
												</span>
											</button>
										);
									})
								: null}
						</div>
					</div>
				) : (
					<ThreeDPreview
						brushFalloff={brushFalloff}
						brushShape={brushShape}
						brushSize={brushSize}
						brushStrength={brushStrength}
						embedded
						heightToolValue={heightToolValue}
						hideDetails
						onBrushFalloffChange={setBrushFalloff}
						onBrushShapeChange={setBrushShape}
						onBrushSizeChange={setBrushSize}
						onBrushStrengthChange={setBrushStrength}
						onTerrainGestureChange={selectTerrainGesture}
						overlayFilters={overlayFilters}
						terrainGesture={terrainGesture}
						terrainPaintTileId={
							isTerrainPaintArmed &&
							activeTool === "paint" &&
							paintTarget === "terrain"
								? selectedTerrainId
								: undefined
						}
						terrainHeightTool={
							activeTool === "raise-height"
								? "raise"
								: activeTool === "lower-height"
									? "lower"
									: activeTool === "flatten-height"
										? "flatten"
										: activeTool === "slope-height"
											? "slope"
											: activeTool === "set-height"
												? "set"
												: activeTool === "smooth-height"
													? "smooth"
													: activeTool === "roughen-height"
														? "roughen"
														: undefined
						}
					/>
				)}
			</div>

			<aside className="inspector-panel map-inspector-panel">
				<div
					aria-hidden="true"
					className={`inspector-resize-handle ${
						isResizingInspector ? "active" : ""
					}`}
					onPointerDown={handleInspectorResizeStart}
					onPointerMove={handleInspectorResizeMove}
					onPointerUp={handleInspectorResizeEnd}
				/>
				<MapInspector
					project={project}
					activeArea={activeArea}
					selected={selected}
					selectedTerrainId={selectedTerrainId}
					selectedOverlayId={selectedOverlayId}
					recordMapEdit={recordMapEdit}
				/>
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
								<select
									onChange={(event) => setPixelAssetId(event.target.value)}
									value={pixelAssetId}
								>
									{editablePixelAssetIds.map((id) => (
										<option key={id} value={id}>
											{project.pixelAssets[id]?.name ?? id}
										</option>
									))}
								</select>
							</label>
							<label>
								Colour
								<input
									onChange={(event) => setPixelColor(event.target.value)}
									type="color"
									value={pixelColor}
								/>
							</label>
							<button onClick={clearPixelAsset} type="button">
								Clear
							</button>
							<button
								onClick={() => resetPixelAsset(pixelAssetId)}
								type="button"
							>
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
										key={pixelCellKey(editingPixelAsset.id, x, y)}
										onPointerDown={() => {
											setIsPaintingPixel(true);
											paintPixel(x, y);
										}}
										onPointerEnter={() => {
											if (isPaintingPixel) {
												paintPixel(x, y);
											}
										}}
										style={{
											background: color === "transparent" ? "#f8fafc" : color,
										}}
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
