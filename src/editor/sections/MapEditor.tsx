import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent,
} from "react";
import { areaTemplates, type AreaTemplateId } from "../../data/areaTemplates";
import {
	getOverlayPreset,
	getStructurePreset,
	getTerrainPreset,
	overlayPresets,
	structurePresets,
	terrainPresets,
} from "../../data/mapVisuals";
import { useProjectStore } from "../../store/useProjectStore";
import {
	makeDefaultObjectBehaviour,
	ObjectBehaviourEditor,
} from "../ObjectBehaviourEditor";
import {
	defaultEnemyBehaviour,
	resolveNPCInstance,
} from "../../runtime/npcResolver";
import type {
	EnemyBehaviour,
	EditorSelection,
	EventBlock,
	GameAreaKind,
	Interaction,
	InteractionActivationMode,
	MapOverlayFilter,
	MovementRule,
	NPCAttributes,
	NPCInstance,
	NPCMovementConfig,
	ObjectInstance,
	ObjectBehaviour,
	PixelAsset,
	PickupObject,
} from "../../types/game";

type MapTool =
	| "paint"
	| "eraser"
	| "fill"
	| "event-block"
	| "pickup"
	| "npc"
	| "object"
	| "structure"
	| "pan";
type BrushSize = 1 | 3 | 5;
type PaintLayer = "terrain" | "overlay" | "structure" | "event";

const AUTO_EXPAND_BUFFER_TILES = 12;
const MAX_MAP_SIZE = 200;
const PALETTE_WIDTH_STORAGE_KEY = "map-editor-palette-width-v3";
const MIN_PALETTE_WIDTH = 180;
const MAX_PALETTE_WIDTH = 420;
const areaKindOptions: GameAreaKind[] = [
	"outdoor",
	"indoor",
	"cave",
	"ship",
	"dungeon",
	"custom",
];
const interactionTypes = [
	"none",
	"area_link",
	"teleport",
	"play_cutscene",
	"set_flag",
	"change_movement_mode",
] as const;

type InteractionTypeOption = (typeof interactionTypes)[number];
const activationModes: InteractionActivationMode[] = [
	"on_touch",
	"on_interact",
	"both",
	"disabled",
];

function cellKey(x: number, y: number): string {
	return `${x}:${y}`;
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

function isInBounds(
	x: number,
	y: number,
	width: number,
	height: number,
): boolean {
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

	const mapStageRef = useRef<HTMLDivElement>(null);
	const paintedCellsRef = useRef<Set<string>>(new Set());
	const panRef = useRef({ isPanning: false, lastX: 0, lastY: 0 });
	const activeArea = (project.areas.find(
		(area) => area.id === project.activeAreaId,
	) ?? project.areas[0])!;

	const [activeTool, setActiveTool] = useState<MapTool>("paint");
	const [paintLayer, setPaintLayer] = useState<PaintLayer>("terrain");
	const [selectedTerrainId, setSelectedTerrainId] = useState("grass");
	const [selectedOverlayId, setSelectedOverlayId] = useState("dirt_path");
	const [selectedStructureId, setSelectedStructureId] = useState("small_house");
	const [selectedObjectDefinitionId, setSelectedObjectDefinitionId] = useState(
		project.objects[0]?.id ?? "",
	);
	const [selectedNpcDefinitionId, setSelectedNpcDefinitionId] = useState(
		project.npcs[0]?.id ?? "",
	);
	const [selection, setSelection] = useState<EditorSelection>({
		type: "area",
		areaId: activeArea.id,
	});
	const [isPainting, setIsPainting] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [brushSize, setBrushSize] = useState<BrushSize>(1);
	const [showGrid, setShowGrid] = useState(true);
	const [overlayFilter, setOverlayFilter] =
		useState<MapOverlayFilter>("npc_paths");
	const [paletteWidth, setPaletteWidth] = useState(readStoredPaletteWidth);
	const [isResizingPalette, setIsResizingPalette] = useState(false);
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
		setSelection((currentSelection) => {
			if (!currentSelection || currentSelection.areaId !== activeArea.id) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				currentSelection.type === "eventBlock" &&
				!activeArea.eventBlocks.some(
					(eventBlock) => eventBlock.id === currentSelection.id,
				)
			) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				currentSelection.type === "structure" &&
				!activeArea.structures.some(
					(structure) => structure.id === currentSelection.id,
				)
			) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				currentSelection.type === "object" &&
				!activeArea.objects.some((object) => object.id === currentSelection.id)
			) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				currentSelection.type === "pickup" &&
				!activeArea.pickups.some((pickup) => pickup.id === currentSelection.id)
			) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				currentSelection.type === "npc" &&
				!activeArea.npcs.some((npc) => npc.id === currentSelection.id)
			) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				(currentSelection.type === "overlay" ||
					currentSelection.type === "terrain") &&
				!isInBounds(
					currentSelection.x,
					currentSelection.y,
					activeArea.width,
					activeArea.height,
				)
			) {
				return { type: "area", areaId: activeArea.id };
			}

			if (
				currentSelection.type === "overlay" &&
				!activeArea.overlayTiles.some(
					(tile) =>
						tile.x === currentSelection.x && tile.y === currentSelection.y,
				)
			) {
				return {
					type: "terrain",
					areaId: activeArea.id,
					x: currentSelection.x,
					y: currentSelection.y,
				};
			}

			return currentSelection;
		});
	}, [activeArea]);

	const terrainLookup = useMemo(() => {
		const lookup = new Map<string, string>();
		activeArea.terrainTiles.forEach((tile) =>
			lookup.set(cellKey(tile.x, tile.y), tile.tileId),
		);
		return lookup;
	}, [activeArea.terrainTiles]);

	const overlayLookup = useMemo(() => {
		const lookup = new Map<string, string>();
		activeArea.overlayTiles.forEach((tile) =>
			lookup.set(cellKey(tile.x, tile.y), tile.overlayId),
		);
		return lookup;
	}, [activeArea.overlayTiles]);

	const eventLookup = useMemo(() => {
		const lookup = new Map<string, EventBlock>();
		activeArea.eventBlocks.forEach((eventBlock) =>
			lookup.set(cellKey(eventBlock.x, eventBlock.y), eventBlock),
		);
		return lookup;
	}, [activeArea.eventBlocks]);

	const pickupLookup = useMemo(() => {
		const lookup = new Map<string, PickupObject>();
		activeArea.pickups.forEach((pickup) =>
			lookup.set(cellKey(pickup.x, pickup.y), pickup),
		);
		return lookup;
	}, [activeArea.pickups]);

	const npcLookup = useMemo(() => {
		const lookup = new Map<string, NPCInstance>();
		activeArea.npcs.forEach((npc) => lookup.set(cellKey(npc.x, npc.y), npc));
		return lookup;
	}, [activeArea.npcs]);

	const objectLookup = useMemo(() => {
		const lookup = new Map<string, ObjectInstance>();
		activeArea.objects.forEach((object) =>
			lookup.set(cellKey(object.x, object.y), object),
		);
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

	const selectedEventBlock =
		selection?.type === "eventBlock" && selection.areaId === activeArea.id
			? activeArea.eventBlocks.find(
					(eventBlock) => eventBlock.id === selection.id,
				)
			: undefined;
	const selectedMapStructure =
		selection?.type === "structure" && selection.areaId === activeArea.id
			? activeArea.structures.find((structure) => structure.id === selection.id)
			: undefined;
	const selectedObject =
		selection?.type === "object" && selection.areaId === activeArea.id
			? activeArea.objects.find((object) => object.id === selection.id)
			: undefined;
	const selectedPickup =
		selection?.type === "pickup" && selection.areaId === activeArea.id
			? activeArea.pickups.find((pickup) => pickup.id === selection.id)
			: undefined;
	const selectedNpc =
		selection?.type === "npc" && selection.areaId === activeArea.id
			? activeArea.npcs.find((npc) => npc.id === selection.id)
			: undefined;
	const selectedNpcDefinition = selectedNpc
		? project.npcs.find((npc) => npc.id === selectedNpc.npcDefinitionId)
		: undefined;
	const selectedResolvedNpc = selectedNpc
		? resolveNPCInstance(selectedNpcDefinition, selectedNpc)
		: undefined;
	const selectedOverlayTile =
		selection?.type === "overlay" && selection.areaId === activeArea.id
			? {
					x: selection.x,
					y: selection.y,
					overlayId: overlayLookup.get(cellKey(selection.x, selection.y)) ?? "",
				}
			: undefined;
	const selectedTerrainTile =
		selection?.type === "terrain" && selection.areaId === activeArea.id
			? {
					x: selection.x,
					y: selection.y,
					tileId:
						terrainLookup.get(cellKey(selection.x, selection.y)) ?? "grass",
				}
			: undefined;
	const selectedStructure = getStructurePreset(selectedStructureId);
	const selectedObjectDefinition = project.objects.find(
		(object) => object.id === selectedObjectDefinitionId,
	);
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
	const linkTargetArea = selectedEventBlock?.link?.targetAreaId
		? project.areas.find(
				(area) => area.id === selectedEventBlock.link?.targetAreaId,
			)
		: undefined;
	const defaultLinkTargetArea =
		linkTargetArea ??
		project.areas.find((area) => area.id !== activeArea.id) ??
		project.areas[0];
	const linkTargetEventBlocks = defaultLinkTargetArea?.eventBlocks ?? [];
	const selectedLinkTargetEventBlockId =
		selectedEventBlock?.link?.targetEventBlockId ??
		linkTargetEventBlocks[0]?.id ??
		"";
	const areaLinks = activeArea.eventBlocks.filter(
		(eventBlock) => eventBlock.kind === "area_link",
	);

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

			setOverlayTiles(
				cells.map((cell) => ({ ...cell, overlayId: selectedOverlayId })),
			);
			return;
		}

		if (paintLayer !== "terrain") {
			return;
		}

		const targetTileId = activeTool === "eraser" ? "grass" : selectedTerrainId;
		const updates = cells.flatMap((cell) => {
			const key = cellKey(cell.x, cell.y);
			const currentTileId = terrainLookup.get(key) ?? "grass";
			const isOutsideCurrentMap =
				cell.x >= activeArea.width || cell.y >= activeArea.height;
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
		if (!isInBounds(startX, startY, activeArea.width, activeArea.height)) {
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
			if (
				!cell ||
				!isInBounds(cell.x, cell.y, activeArea.width, activeArea.height)
			) {
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

	function selectPaintedCell(x: number, y: number) {
		if (paintLayer === "overlay" && activeTool === "paint") {
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

		const eventBlock = eventLookup.get(cellKey(x, y));
		const object = objectLookup.get(cellKey(x, y)) ?? findObjectAt(x, y);
		const pickup = pickupLookup.get(cellKey(x, y));
		const npc = npcLookup.get(cellKey(x, y));

		if (activeTool === "event-block") {
			if (eventBlock) {
				setSelection({
					type: "eventBlock",
					areaId: activeArea.id,
					id: eventBlock.id,
				});
				return;
			}

			const id = addEventBlock(x, y);
			setSelection({ type: "eventBlock", areaId: activeArea.id, id });
			return;
		}

		if (activeTool === "structure") {
			placeStructure(x, y);
			return;
		}

		if (activeTool === "pickup") {
			if (pickup) {
				setSelection({ type: "pickup", areaId: activeArea.id, id: pickup.id });
				return;
			}

			placePickup(x, y);
			return;
		}

		if (activeTool === "object") {
			if (object) {
				setSelection({ type: "object", areaId: activeArea.id, id: object.id });
				return;
			}

			placeObject(x, y);
			return;
		}

		if (activeTool === "npc") {
			if (npc) {
				setSelection({ type: "npc", areaId: activeArea.id, id: npc.id });
				return;
			}

			placeNpc(x, y);
			return;
		}

		if (eventBlock) {
			setSelection({
				type: "eventBlock",
				areaId: activeArea.id,
				id: eventBlock.id,
			});
			return;
		}

		if (object) {
			setSelection({ type: "object", areaId: activeArea.id, id: object.id });
			return;
		}

		if (pickup) {
			setSelection({ type: "pickup", areaId: activeArea.id, id: pickup.id });
			return;
		}

		if (npc) {
			setSelection({ type: "npc", areaId: activeArea.id, id: npc.id });
			return;
		}

		const structure = findStructureAt(x, y);
		if (structure) {
			setSelection({
				type: "structure",
				areaId: activeArea.id,
				id: structure.id,
			});
			return;
		}

		if (
			overlayLookup.has(cellKey(x, y)) &&
			activeTool !== "eraser" &&
			paintLayer !== "overlay"
		) {
			setSelection({ type: "overlay", areaId: activeArea.id, x, y });
			return;
		}

		if (activeTool === "fill") {
			floodFillFrom(x, y);
			selectPaintedCell(x, y);
			return;
		}

		paintedCellsRef.current.clear();
		setIsPainting(true);
		applyBrush(x, y);
		selectPaintedCell(x, y);
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

	function updateSelectedStructure(
		patch: Parameters<typeof updateStructure>[1],
	) {
		if (selectedMapStructure) {
			updateStructure(selectedMapStructure.id, patch);
		}
	}

	function updateSelectedPickup(patch: Partial<PickupObject>) {
		if (selectedPickup) {
			updatePickup(selectedPickup.id, patch);
		}
	}

	function updateSelectedObject(patch: Partial<ObjectInstance>) {
		if (selectedObject) {
			updateObject(selectedObject.id, patch);
		}
	}

	function updateSelectedNpc(patch: Partial<NPCInstance>) {
		if (selectedNpc) {
			updateNpc(selectedNpc.id, patch);
		}
	}

	function updateSelectedNpcAttributes(patch: Partial<NPCAttributes>) {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		const next = {
			...selectedResolvedNpc.attributes,
			...selectedNpc.attributesOverride,
			...patch,
		};
		next.maxHealth = Math.max(1, Number(next.maxHealth));
		next.health = Math.min(next.maxHealth, Math.max(0, Number(next.health)));
		next.movementSpeed = Math.max(0.1, Number(next.movementSpeed ?? 1));
		updateSelectedNpc({ attributes: next, attributesOverride: next });
	}

	function updateSelectedNpcMovement(patch: Partial<NPCMovementConfig>) {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		const next = {
			movementMode: selectedResolvedNpc.movementMode,
			movementSpeed: selectedResolvedNpc.movementSpeed,
			patrolPath: selectedResolvedNpc.patrolPath,
			wanderZone: selectedResolvedNpc.wanderZone,
			...selectedNpc.movementOverride,
			...patch,
		};
		updateSelectedNpc({
			movementMode: next.movementMode,
			movementSpeed: next.movementSpeed,
			patrolPath: next.patrolPath,
			wanderZone: next.wanderZone,
			movementOverride: next,
		});
	}

	function updateSelectedNpcEnemyBehaviour(patch: Partial<EnemyBehaviour>) {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		const next = {
			...defaultEnemyBehaviour,
			...selectedResolvedNpc.enemyBehaviour,
			...selectedNpc.enemyBehaviourOverride,
			...patch,
		};
		updateSelectedNpc({ enemyBehaviour: next, enemyBehaviourOverride: next });
	}

	function resetSelectedNpcSection(
		section: "attributes" | "movement" | "enemy" | "interaction",
	) {
		if (!selectedNpc) {
			return;
		}

		if (section === "attributes") {
			const next = resolveNPCInstance(selectedNpcDefinition, {
				...selectedNpc,
				attributesOverride: undefined,
			});
			updateSelectedNpc({
				attributes: next.attributes,
				attributesOverride: undefined,
			});
			return;
		}

		if (section === "movement") {
			const next = resolveNPCInstance(selectedNpcDefinition, {
				...selectedNpc,
				movementOverride: undefined,
			});
			updateSelectedNpc({
				movementMode: next.movementMode,
				movementSpeed: next.movementSpeed,
				patrolPath: next.patrolPath,
				wanderZone: next.wanderZone,
				movementOverride: undefined,
			});
			return;
		}

		if (section === "enemy") {
			const next = resolveNPCInstance(selectedNpcDefinition, {
				...selectedNpc,
				enemyBehaviourOverride: undefined,
			});
			updateSelectedNpc({
				enemyBehaviour: next.enemyBehaviour,
				enemyBehaviourOverride: undefined,
			});
			return;
		}

		const next = resolveNPCInstance(selectedNpcDefinition, {
			...selectedNpc,
			interactionOverride: undefined,
		});
		updateSelectedNpc({
			interaction: next.interaction,
			interactionOverride: undefined,
		});
	}

	function addPatrolPoint() {
		if (!selectedNpc || !selectedResolvedNpc) {
			return;
		}

		updateSelectedNpcMovement({
			patrolPath: {
				loop: selectedResolvedNpc.patrolPath?.loop ?? true,
				points: [
					...(selectedResolvedNpc.patrolPath?.points ?? []),
					{ x: selectedNpc.x, y: selectedNpc.y },
				],
			},
		});
	}

	function updatePatrolPoint(
		index: number,
		patch: Partial<{ x: number; y: number }>,
	) {
		if (!selectedResolvedNpc?.patrolPath) {
			return;
		}

		updateSelectedNpcMovement({
			patrolPath: {
				...selectedResolvedNpc.patrolPath,
				points: selectedResolvedNpc.patrolPath.points.map(
					(point, pointIndex) =>
						pointIndex === index ? { ...point, ...patch } : point,
				),
			},
		});
	}

	function deletePatrolPoint(index: number) {
		if (!selectedResolvedNpc?.patrolPath) {
			return;
		}

		updateSelectedNpcMovement({
			patrolPath: {
				...selectedResolvedNpc.patrolPath,
				points: selectedResolvedNpc.patrolPath.points.filter(
					(_, pointIndex) => pointIndex !== index,
				),
			},
		});
	}

	function updateSelectedNpcMovementMode(
		movementMode: NPCInstance["movementMode"],
	) {
		if (!selectedNpc) {
			return;
		}

		updateSelectedNpcMovement({
			movementMode,
			...(movementMode === "patrol" && !selectedResolvedNpc?.patrolPath
				? {
						patrolPath: {
							points: [{ x: selectedNpc.x, y: selectedNpc.y }],
							loop: true,
						},
					}
				: {}),
			...(movementMode === "wander" && !selectedResolvedNpc?.wanderZone
				? {
						wanderZone: {
							x: selectedNpc.x,
							y: selectedNpc.y,
							width: 3,
							height: 3,
						},
					}
				: {}),
		});
	}

	function makeDefaultAreaLink(targetAreaId = defaultLinkTargetArea?.id ?? "") {
		const targetArea =
			project.areas.find((area) => area.id === targetAreaId) ??
			defaultLinkTargetArea;
		return {
			targetAreaId: targetArea?.id ?? "",
			targetEventBlockId: targetArea?.eventBlocks[0]?.id ?? "",
		};
	}

	function updateSelectedEventKind(kind: EventBlock["kind"]) {
		if (kind === "area_link") {
			const link = makeDefaultAreaLink();
			updateSelectedEventBlock({
				kind,
				link,
				interaction: {
					type: "area_link",
					activationMode: "on_touch",
					...link,
				},
			});
			return;
		}

		updateSelectedEventBlock({
			kind,
			link: undefined,
			...(selectedEventBlock?.interaction?.type === "area_link"
				? { interaction: undefined }
				: {}),
		});
	}

	function updateSelectedAreaLink(
		link: ReturnType<typeof makeDefaultAreaLink>,
	) {
		updateSelectedEventBlock({
			link,
			interaction:
				selectedEventBlock?.interaction?.type === "area_link"
					? {
							...selectedEventBlock.interaction,
							targetAreaId: link.targetAreaId,
							targetEventBlockId: link.targetEventBlockId,
						}
					: {
							type: "area_link",
							activationMode: "on_touch",
							targetAreaId: link.targetAreaId,
							targetEventBlockId: link.targetEventBlockId,
						},
		});
	}

	function updateSelectedAreaLinkTargetArea(targetAreaId: string) {
		updateSelectedAreaLink(makeDefaultAreaLink(targetAreaId));
	}

	function updateSelectedAreaLinkTargetEvent(targetEventBlockId: string) {
		if (!defaultLinkTargetArea) {
			return;
		}

		updateSelectedAreaLink({
			targetAreaId: defaultLinkTargetArea.id,
			targetEventBlockId,
		});
	}

	function getInteractionTargetArea(interaction?: Interaction) {
		if (interaction?.type !== "area_link" && interaction?.type !== "teleport") {
			return (
				project.areas.find((area) => area.id !== activeArea.id) ??
				project.areas[0]
			);
		}

		return (
			project.areas.find((area) => area.id === interaction.targetAreaId) ??
			project.areas[0]
		);
	}

	function getDefaultActivationMode(
		type: Exclude<InteractionTypeOption, "none">,
	): InteractionActivationMode {
		if (selectedMapStructure || selectedObject) {
			return "on_interact";
		}

		if (!selectedEventBlock) {
			return "on_interact";
		}

		if (
			selectedEventBlock.kind === "trigger" ||
			selectedEventBlock.kind === "area_link"
		) {
			return "on_touch";
		}

		return type === "area_link" || type === "teleport"
			? "on_touch"
			: "on_interact";
	}

	function getDefaultPrompt(
		type: Exclude<InteractionTypeOption, "none">,
		mode: Interaction["mode"] = "walk",
	) {
		if (type === "area_link" || type === "teleport") {
			return "Press E to enter";
		}

		if (type === "change_movement_mode") {
			return mode === "sail" ? "Press E to board" : "Press E to ride";
		}

		return "Press E to inspect";
	}

	function makeDefaultInteraction(
		type: Exclude<InteractionTypeOption, "none">,
	): Interaction {
		const activationMode = getDefaultActivationMode(type);

		if (type === "play_cutscene") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type),
				cutsceneId: project.cutscenes[0]?.id ?? "",
			};
		}

		if (type === "set_flag") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type),
				flag: "flag_1",
				value: true,
			};
		}

		if (type === "change_movement_mode") {
			return {
				type,
				activationMode,
				prompt: getDefaultPrompt(type, "walk"),
				mode: "walk",
			};
		}

		const targetArea =
			project.areas.find((area) => area.id !== activeArea.id) ??
			project.areas[0];
		return {
			type,
			activationMode,
			prompt: getDefaultPrompt(type),
			targetAreaId: targetArea?.id ?? "",
			targetEventBlockId: targetArea?.eventBlocks[0]?.id ?? "",
		};
	}

	function updateSelectedInteraction(interaction?: Interaction) {
		if (selectedMapStructure) {
			updateSelectedStructure({ interaction });
			return;
		}

		if (selectedObject) {
			updateSelectedObject({ interaction });
			return;
		}

		if (selectedNpc) {
			updateSelectedNpc({ interaction, interactionOverride: interaction });
			return;
		}

		if (selectedEventBlock) {
			updateSelectedEventBlock({
				interaction,
				...(selectedEventBlock.kind === "area_link"
					? interaction?.type === "area_link" &&
						interaction.targetAreaId &&
						interaction.targetEventBlockId
						? {
								link: {
									targetAreaId: interaction.targetAreaId,
									targetEventBlockId: interaction.targetEventBlockId,
								},
							}
						: { link: undefined }
					: {}),
			});
		}
	}

	function renderInteractionEditor(interaction?: Interaction) {
		const interactionType = interaction?.type ?? "none";
		const targetArea = getInteractionTargetArea(interaction);
		const targetEventBlocks = targetArea?.eventBlocks ?? [];

		return (
			<div className="interaction-editor">
				<div className="panel-title secondary">Interaction</div>
				<label>
					Type
					<select
						onChange={(event) => {
							const nextType = event.target.value as InteractionTypeOption;
							updateSelectedInteraction(
								nextType === "none"
									? undefined
									: makeDefaultInteraction(nextType),
							);
						}}
						value={interactionType}
					>
						<option value="none">None</option>
						<option value="area_link">Area link</option>
						<option value="teleport">Teleport</option>
						<option value="play_cutscene">Play cutscene</option>
						<option value="set_flag">Set flag</option>
						<option value="change_movement_mode">Change movement mode</option>
					</select>
				</label>

				{interaction ? (
					<>
						<label>
							Activation
							<select
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										activationMode: event.target
											.value as InteractionActivationMode,
									})
								}
								value={interaction.activationMode}
							>
								{activationModes.map((mode) => (
									<option key={mode} value={mode}>
										{mode === "on_touch"
											? "On touch"
											: mode === "on_interact"
												? "On interact"
												: mode === "both"
													? "Both"
													: "Disabled"}
									</option>
								))}
							</select>
						</label>
						<label>
							Prompt
							<input
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										prompt: event.target.value,
									})
								}
								placeholder={getDefaultPrompt(
									interaction.type,
									interaction.mode,
								)}
								value={interaction.prompt ?? ""}
							/>
						</label>
					</>
				) : null}

				{interaction?.type === "area_link" ||
				interaction?.type === "teleport" ? (
					<>
						<label>
							Target area
							<select
								onChange={(event) => {
									const nextArea = project.areas.find(
										(area) => area.id === event.target.value,
									);
									updateSelectedInteraction({
										...interaction,
										targetAreaId: event.target.value,
										targetEventBlockId: nextArea?.eventBlocks[0]?.id ?? "",
									});
								}}
								value={targetArea?.id ?? ""}
							>
								{project.areas.map((area) => (
									<option key={area.id} value={area.id}>
										{area.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Target spawn/event
							<select
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										targetAreaId:
											targetArea?.id ?? interaction.targetAreaId ?? "",
										targetEventBlockId: event.target.value,
									})
								}
								value={interaction.targetEventBlockId ?? ""}
							>
								{targetEventBlocks.map((eventBlock) => (
									<option key={eventBlock.id} value={eventBlock.id}>
										{eventBlock.name} ({eventBlock.kind})
									</option>
								))}
							</select>
						</label>
					</>
				) : null}

				{interaction?.type === "play_cutscene" ? (
					<label>
						Cutscene
						<select
							onChange={(event) =>
								updateSelectedInteraction({
									...interaction,
									cutsceneId: event.target.value,
								})
							}
							value={interaction.cutsceneId ?? ""}
						>
							{project.cutscenes.map((cutscene) => (
								<option key={cutscene.id} value={cutscene.id}>
									{cutscene.name}
								</option>
							))}
						</select>
					</label>
				) : null}

				{interaction?.type === "set_flag" ? (
					<>
						<label>
							Flag
							<input
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										flag: event.target.value,
									})
								}
								value={interaction.flag ?? ""}
							/>
						</label>
						<label className="checkbox-row standalone">
							<input
								checked={interaction.value ?? true}
								onChange={(event) =>
									updateSelectedInteraction({
										...interaction,
										value: event.target.checked,
									})
								}
								type="checkbox"
							/>
							Value true
						</label>
					</>
				) : null}

				{interaction?.type === "change_movement_mode" ? (
					<label>
						Mode
						<select
							onChange={(event) =>
								updateSelectedInteraction({
									...interaction,
									mode: event.target.value as NonNullable<Interaction["mode"]>,
								})
							}
							value={interaction.mode ?? "walk"}
						>
							<option value="walk">Walk</option>
							<option value="sail">Sail</option>
							<option value="ride">Ride</option>
						</select>
					</label>
				) : null}
			</div>
		);
	}

	function deleteSelectedEventBlock() {
		if (!selectedEventBlock) {
			return;
		}

		deleteEventBlock(selectedEventBlock.id);
		setSelection({ type: "area", areaId: activeArea.id });
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

	function movementRuleSummary(
		rule?: MovementRule,
		fallback = "No explicit rule",
	) {
		if (!rule || Object.keys(rule).length === 0) {
			return fallback;
		}

		const walkable =
			rule.walkable === undefined
				? "inherits walkability"
				: rule.walkable
					? "walkable"
					: "blocked";
		const mode = rule.movementMode
			? `mode ${rule.movementMode}`
			: "default mode";
		const speed = rule.speedMultiplier
			? `speed x${rule.speedMultiplier}`
			: "speed x1";
		return `${walkable}, ${mode}, ${speed}`;
	}

	function deleteSelectedStructure() {
		if (!selectedMapStructure) {
			return;
		}

		deleteStructure(selectedMapStructure.id);
		setSelection({ type: "area", areaId: activeArea.id });
	}

	function deleteSelectedObject() {
		if (!selectedObject) {
			return;
		}

		deleteObject(selectedObject.id);
		setSelection({ type: "area", areaId: activeArea.id });
	}

	function deleteSelectedPickup() {
		if (!selectedPickup) {
			return;
		}

		deletePickup(selectedPickup.id);
		setSelection({ type: "area", areaId: activeArea.id });
	}

	function deleteSelectedNpc() {
		if (!selectedNpc) {
			return;
		}

		deleteNpc(selectedNpc.id);
		setSelection({ type: "area", areaId: activeArea.id });
	}

	function renderAreaInspector() {
		return (
			<>
				<div className="panel-title">Area Summary</div>
				<div className="form-stack">
					<div className="coordinate-readout">
						{activeArea.name} ({activeArea.kind})
					</div>
					<div className="coordinate-readout">
						{activeArea.width} x {activeArea.height} tiles,{" "}
						{activeArea.tileSize}px tiles
					</div>
					<div className="coordinate-readout">
						{activeArea.terrainTiles.length} terrain tiles,{" "}
						{activeArea.overlayTiles.length} overlays,{" "}
						{activeArea.structures.length} structures,{" "}
						{activeArea.objects.length} objects, {activeArea.pickups.length}{" "}
						pickups, {activeArea.npcs.length} NPCs,{" "}
						{activeArea.eventBlocks.length} events
					</div>
					<button
						className="full-width"
						onClick={() =>
							setSelection({ type: "area", areaId: activeArea.id })
						}
						type="button"
					>
						Select area
					</button>
				</div>
			</>
		);
	}

	function renderTerrainInspector() {
		if (!selectedTerrainTile) {
			return renderAreaInspector();
		}

		const terrain = getTerrainPreset(selectedTerrainTile.tileId);

		return (
			<>
				<div className="panel-title">Terrain</div>
				<div className="form-stack">
					<div className="coordinate-readout">
						{terrain.label} ({selectedTerrainTile.tileId}) at x{" "}
						{selectedTerrainTile.x}, y {selectedTerrainTile.y}
					</div>
					<div className="coordinate-readout">
						{movementRuleSummary(terrain.movementRule)}
					</div>
					<button
						onClick={() =>
							setTiles([
								{
									x: selectedTerrainTile.x,
									y: selectedTerrainTile.y,
									tileId: selectedTerrainId,
								},
							])
						}
						type="button"
					>
						Replace with selected terrain
					</button>
					<button
						onClick={() =>
							setTiles([
								{
									x: selectedTerrainTile.x,
									y: selectedTerrainTile.y,
									tileId: "grass",
								},
							])
						}
						type="button"
					>
						Reset to grass
					</button>
				</div>
			</>
		);
	}

	function renderOverlayInspector() {
		if (!selectedOverlayTile?.overlayId) {
			return renderTerrainInspector();
		}

		const overlay = getOverlayPreset(selectedOverlayTile.overlayId);

		return (
			<>
				<div className="panel-title">Overlay</div>
				<div className="form-stack">
					<div className="coordinate-readout">
						{overlay.label} ({selectedOverlayTile.overlayId}) at x{" "}
						{selectedOverlayTile.x}, y {selectedOverlayTile.y}
					</div>
					<div className="coordinate-readout">
						{movementRuleSummary(overlay.movementRule, "Uses terrain movement")}
					</div>
					<button
						onClick={() =>
							setOverlayTiles([
								{
									x: selectedOverlayTile.x,
									y: selectedOverlayTile.y,
									overlayId: selectedOverlayId,
								},
							])
						}
						type="button"
					>
						Replace with selected overlay
					</button>
					<button
						className="danger-button"
						onClick={() => {
							eraseOverlayTiles([
								{ x: selectedOverlayTile.x, y: selectedOverlayTile.y },
							]);
							setSelection({
								type: "terrain",
								areaId: activeArea.id,
								x: selectedOverlayTile.x,
								y: selectedOverlayTile.y,
							});
						}}
						type="button"
					>
						Delete overlay
					</button>
				</div>
			</>
		);
	}

	function renderStructureInspector() {
		if (!selectedMapStructure) {
			return renderAreaInspector();
		}

		const preset = getStructurePreset(selectedMapStructure.structureId);

		return (
			<>
				<div className="panel-title">Structure</div>
				<div className="form-stack">
					<label>
						Name
						<input
							onChange={(event) =>
								updateSelectedStructure({ name: event.target.value })
							}
							value={selectedMapStructure.name}
						/>
					</label>
					<label>
						Type
						<select
							onChange={(event) => {
								const nextPreset = getStructurePreset(event.target.value);
								updateSelectedStructure({
									structureId: nextPreset.id,
									widthTiles: nextPreset.widthTiles,
									heightTiles: nextPreset.heightTiles,
									blocksMovement: nextPreset.blocksMovement,
								});
							}}
							value={selectedMapStructure.structureId}
						>
							{structurePresets.map((structure) => (
								<option key={structure.id} value={structure.id}>
									{structure.label}
								</option>
							))}
						</select>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedStructure({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedMapStructure.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedStructure({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedMapStructure.y}
							/>
						</label>
						<label>
							Width
							<input
								min={1}
								onChange={(event) =>
									updateSelectedStructure({
										widthTiles: Math.max(1, Number(event.target.value)),
									})
								}
								type="number"
								value={selectedMapStructure.widthTiles}
							/>
						</label>
						<label>
							Height
							<input
								min={1}
								onChange={(event) =>
									updateSelectedStructure({
										heightTiles: Math.max(1, Number(event.target.value)),
									})
								}
								type="number"
								value={selectedMapStructure.heightTiles}
							/>
						</label>
					</div>
					<label className="checkbox-row standalone">
						<input
							checked={selectedMapStructure.blocksMovement}
							onChange={(event) =>
								updateSelectedStructure({
									blocksMovement: event.target.checked,
								})
							}
							type="checkbox"
						/>
						Blocks movement
					</label>
					<div className="coordinate-readout">
						Preset movement:{" "}
						{movementRuleSummary(
							selectedMapStructure.movementRule ?? preset.movementRule,
						)}
					</div>
					{renderInteractionEditor(selectedMapStructure.interaction)}
					<button
						className="danger-button"
						onClick={deleteSelectedStructure}
						type="button"
					>
						Delete structure
					</button>
				</div>
			</>
		);
	}

	function renderPickupInspector() {
		if (!selectedPickup) {
			return renderAreaInspector();
		}

		return (
			<>
				<div className="panel-title">Pickup</div>
				<div className="form-stack">
					<label>
						Item
						<select
							onChange={(event) =>
								updateSelectedPickup({ itemId: event.target.value })
							}
							value={selectedPickup.itemId}
						>
							{project.items.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Quantity
						<input
							min={1}
							onChange={(event) =>
								updateSelectedPickup({
									quantity: Math.max(1, Number(event.target.value)),
								})
							}
							type="number"
							value={selectedPickup.quantity}
						/>
					</label>
					<label>
						Pickup mode
						<select
							onChange={(event) =>
								updateSelectedPickup({
									pickupMode: event.target.value as PickupObject["pickupMode"],
								})
							}
							value={selectedPickup.pickupMode}
						>
							<option value="on_touch">On touch</option>
							<option value="on_interact">On interact</option>
						</select>
					</label>
					<label className="checkbox-row standalone">
						<input
							checked={selectedPickup.once}
							onChange={(event) =>
								updateSelectedPickup({ once: event.target.checked })
							}
							type="checkbox"
						/>
						Collect once per play session
					</label>
					<div className="coordinate-readout">
						x {selectedPickup.x}, y {selectedPickup.y}
					</div>
					<button
						className="danger-button"
						onClick={deleteSelectedPickup}
						type="button"
					>
						Delete pickup
					</button>
				</div>
			</>
		);
	}

	function parseObjectStateValue(rawValue: string): boolean | number | string {
		if (rawValue === "true") {
			return true;
		}

		if (rawValue === "false") {
			return false;
		}

		const numberValue = Number(rawValue);
		return rawValue.trim() !== "" && Number.isFinite(numberValue)
			? numberValue
			: rawValue;
	}

	function renderObjectInspector() {
		if (!selectedObject) {
			return renderAreaInspector();
		}

		const definition = project.objects.find(
			(object) => object.id === selectedObject.objectDefinitionId,
		);
		const blocksMovement =
			selectedObject.blocksMovement ?? definition?.blocksMovement ?? false;
		const objectState = selectedObject.state ?? {};
		const resolvedBehaviour =
			selectedObject.behaviourOverride ??
			definition?.defaultBehaviour ??
			makeDefaultObjectBehaviour("none");
		const useDefaultBehaviour = !selectedObject.behaviourOverride;

		return (
			<>
				<div className="panel-title">Object Instance</div>
				<div className="form-stack">
					<label>
						Definition
						<select
							onChange={(event) => {
								const nextDefinition = project.objects.find(
									(object) => object.id === event.target.value,
								);
								updateSelectedObject({
									objectDefinitionId: event.target.value,
									widthTiles: nextDefinition?.widthTiles ?? 1,
									heightTiles: nextDefinition?.heightTiles ?? 1,
									blocksMovement: nextDefinition?.blocksMovement ?? false,
									interaction: nextDefinition?.defaultInteraction,
								});
							}}
							value={selectedObject.objectDefinitionId}
						>
							{project.objects.map((object) => (
								<option key={object.id} value={object.id}>
									{object.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Name override
						<input
							onChange={(event) =>
								updateSelectedObject({
									nameOverride: event.target.value || undefined,
								})
							}
							value={selectedObject.nameOverride ?? ""}
						/>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedObject({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedObject.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedObject({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedObject.y}
							/>
						</label>
					</div>
					<label className="checkbox-row standalone">
						<input
							checked={blocksMovement}
							onChange={(event) =>
								updateSelectedObject({ blocksMovement: event.target.checked })
							}
							type="checkbox"
						/>
						Blocks movement
					</label>
					<div className="coordinate-readout">
						Footprint:{" "}
						{selectedObject.widthTiles ?? definition?.widthTiles ?? 1} x{" "}
						{selectedObject.heightTiles ?? definition?.heightTiles ?? 1} tiles
					</div>
					<div className="panel-title secondary">Behaviour</div>
					<div className="coordinate-readout">
						Resolved behaviour: {resolvedBehaviour.type}
					</div>
					<label className="checkbox-row standalone">
						<input
							checked={useDefaultBehaviour}
							onChange={(event) =>
								updateSelectedObject({
									behaviourOverride: event.target.checked
										? undefined
										: resolvedBehaviour,
								})
							}
							type="checkbox"
						/>
						Use definition default behaviour
					</label>
					{!useDefaultBehaviour ? (
						<ObjectBehaviourEditor
							behaviour={
								selectedObject.behaviourOverride ??
								makeDefaultObjectBehaviour("none")
							}
							onChange={(behaviour: ObjectBehaviour) =>
								updateSelectedObject({ behaviourOverride: behaviour })
							}
							project={project}
						/>
					) : null}
					{renderInteractionEditor(selectedObject.interaction)}
					<div className="panel-title secondary">State</div>
					{Object.entries(objectState).map(([key, value]) => (
						<div className="state-row variable" key={key}>
							<input
								aria-label={`Object state ${key} key`}
								onChange={(event) => {
									const nextKey = event.target.value.trim();
									const nextState = { ...objectState };
									delete nextState[key];
									if (nextKey) {
										nextState[nextKey] = value;
									}
									updateSelectedObject({ state: nextState });
								}}
								value={key}
							/>
							<input
								aria-label={`Object state ${key} value`}
								onChange={(event) =>
									updateSelectedObject({
										state: {
											...objectState,
											[key]: parseObjectStateValue(event.target.value),
										},
									})
								}
								value={String(value)}
							/>
							<button
								className="danger-button compact"
								onClick={() => {
									const nextState = { ...objectState };
									delete nextState[key];
									updateSelectedObject({ state: nextState });
								}}
								type="button"
							>
								Delete
							</button>
						</div>
					))}
					<button
						onClick={() =>
							updateSelectedObject({
								state: {
									...objectState,
									[`state_${Object.keys(objectState).length + 1}`]: false,
								},
							})
						}
						type="button"
					>
						Add state
					</button>
					<button
						className="danger-button"
						onClick={deleteSelectedObject}
						type="button"
					>
						Delete object instance
					</button>
				</div>
			</>
		);
	}

	function renderNpcInspector() {
		if (!selectedNpc || !selectedResolvedNpc) {
			return renderAreaInspector();
		}

		const definition = selectedResolvedNpc.definition;
		const attributes = selectedResolvedNpc.attributes;
		const enemyBehaviour =
			selectedResolvedNpc.enemyBehaviour ?? defaultEnemyBehaviour;
		const hasAttributeOverride = Boolean(selectedNpc.attributesOverride);
		const hasMovementOverride = Boolean(selectedNpc.movementOverride);
		const hasEnemyOverride = Boolean(selectedNpc.enemyBehaviourOverride);
		const hasInteractionOverride = Boolean(selectedNpc.interactionOverride);

		return (
			<>
				<div className="panel-title">NPC Instance</div>
				<div className="form-stack">
					<label>
						NPC
						<select
							onChange={(event) =>
								updateSelectedNpc({ npcDefinitionId: event.target.value })
							}
							value={selectedNpc.npcDefinitionId}
						>
							{project.npcs.map((npc) => (
								<option key={npc.id} value={npc.id}>
									{npc.name}
								</option>
							))}
						</select>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedNpc({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedNpc.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedNpc({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedNpc.y}
							/>
						</label>
					</div>
					<label>
						Facing
						<select
							onChange={(event) =>
								updateSelectedNpc({
									facing: event.target.value as NonNullable<
										NPCInstance["facing"]
									>,
								})
							}
							value={selectedNpc.facing ?? "down"}
						>
							<option value="up">Up</option>
							<option value="down">Down</option>
							<option value="left">Left</option>
							<option value="right">Right</option>
						</select>
					</label>
					<label className="checkbox-row standalone">
						<input
							checked={selectedNpc.blocksMovement}
							onChange={(event) =>
								updateSelectedNpc({ blocksMovement: event.target.checked })
							}
							type="checkbox"
						/>
						Blocks movement
					</label>
					<div className="panel-title secondary">Attributes</div>
					<div className="coordinate-readout">
						Source:{" "}
						{hasAttributeOverride ? "instance override" : "definition default"}
					</div>
					<div className="form-grid compact">
						<label>
							Current health
							<input
								min={0}
								max={attributes.maxHealth}
								onChange={(event) =>
									updateSelectedNpcAttributes({
										health: Math.min(
											attributes.maxHealth,
											Math.max(0, Number(event.target.value)),
										),
									})
								}
								type="number"
								value={attributes.health}
							/>
						</label>
						<label>
							Max health
							<input
								min={1}
								onChange={(event) => {
									const maxHealth = Math.max(1, Number(event.target.value));
									updateSelectedNpcAttributes({
										maxHealth,
										health: Math.min(attributes.health, maxHealth),
									});
								}}
								type="number"
								value={attributes.maxHealth}
							/>
						</label>
					</div>
					<label>
						Faction
						<input
							onChange={(event) =>
								updateSelectedNpcAttributes({ faction: event.target.value })
							}
							value={attributes.faction}
						/>
					</label>
					<label>
						Alignment
						<select
							onChange={(event) =>
								updateSelectedNpcAttributes({
									alignment: event.target
										.value as NPCInstance["attributes"]["alignment"],
								})
							}
							value={attributes.alignment}
						>
							<option value="friendly">Friendly</option>
							<option value="neutral">Neutral</option>
							<option value="hostile">Hostile</option>
						</select>
					</label>
					<label className="checkbox-row standalone">
						<input
							checked={attributes.canInteract}
							onChange={(event) =>
								updateSelectedNpcAttributes({
									canInteract: event.target.checked,
								})
							}
							type="checkbox"
						/>
						Can interact
					</label>
					<label>
						Movement speed
						<input
							min={0.1}
							max={10}
							step={0.1}
							onChange={(event) =>
								updateSelectedNpcAttributes({
									movementSpeed: Math.max(0.1, Number(event.target.value)),
								})
							}
							type="number"
							value={attributes.movementSpeed ?? 1}
						/>
					</label>
					{hasAttributeOverride ? (
						<button
							onClick={() => resetSelectedNpcSection("attributes")}
							type="button"
						>
							Reset attributes to definition default
						</button>
					) : null}
					{attributes.alignment === "hostile" ? (
						<>
							<div className="panel-title secondary">Enemy Behaviour</div>
							<div className="coordinate-readout">
								Source:{" "}
								{hasEnemyOverride ? "instance override" : "definition default"}
							</div>
							<label className="checkbox-row standalone">
								<input
									checked={enemyBehaviour.enabled}
									onChange={(event) =>
										updateSelectedNpcEnemyBehaviour({
											enabled: event.target.checked,
										})
									}
									type="checkbox"
								/>
								Enabled
							</label>
							<div className="form-grid compact">
								<label>
									Detection radius
									<input
										min={0}
										onChange={(event) =>
											updateSelectedNpcEnemyBehaviour({
												detectionRadiusTiles: Math.max(
													0,
													Number(event.target.value),
												),
											})
										}
										type="number"
										value={enemyBehaviour.detectionRadiusTiles}
									/>
								</label>
								<label>
									Chase radius
									<input
										min={0}
										onChange={(event) =>
											updateSelectedNpcEnemyBehaviour({
												chaseRadiusTiles: Math.max(
													0,
													Number(event.target.value),
												),
											})
										}
										type="number"
										value={enemyBehaviour.chaseRadiusTiles}
									/>
								</label>
								<label>
									Contact damage
									<input
										min={0}
										onChange={(event) =>
											updateSelectedNpcEnemyBehaviour({
												contactDamage: Math.max(0, Number(event.target.value)),
											})
										}
										type="number"
										value={enemyBehaviour.contactDamage ?? 0}
									/>
								</label>
							</div>
							<label className="checkbox-row standalone">
								<input
									checked={enemyBehaviour.returnToOrigin}
									onChange={(event) =>
										updateSelectedNpcEnemyBehaviour({
											returnToOrigin: event.target.checked,
										})
									}
									type="checkbox"
								/>
								Return to origin when player leaves chase radius
							</label>
							{hasEnemyOverride ? (
								<button
									onClick={() => resetSelectedNpcSection("enemy")}
									type="button"
								>
									Reset enemy behaviour to definition default
								</button>
							) : null}
						</>
					) : null}
					<div className="panel-title secondary">Movement</div>
					<div className="coordinate-readout">
						Source:{" "}
						{hasMovementOverride ? "instance override" : "definition default"}
					</div>
					<label>
						Mode
						<select
							onChange={(event) =>
								updateSelectedNpcMovementMode(
									event.target.value as NPCInstance["movementMode"],
								)
							}
							value={selectedResolvedNpc.movementMode}
						>
							<option value="stationary">Stationary</option>
							<option value="patrol">Patrol</option>
							<option value="wander">Wander</option>
						</select>
					</label>
					{selectedResolvedNpc.movementMode === "patrol" ? (
						<div className="form-stack">
							<label className="checkbox-row">
								<input
									checked={selectedResolvedNpc.patrolPath?.loop ?? true}
									onChange={(event) =>
										updateSelectedNpcMovement({
											patrolPath: {
												points: selectedResolvedNpc.patrolPath?.points ?? [],
												loop: event.target.checked,
											},
										})
									}
									type="checkbox"
								/>
								Loop patrol
							</label>
							{(selectedResolvedNpc.patrolPath?.points ?? []).map(
								(point, index) => (
									<div
										className="patrol-point-row"
										key={`${selectedNpc.id}_${index}`}
									>
										<span>{index + 1}</span>
										<input
											aria-label={`Patrol point ${index + 1} X`}
											min={0}
											onChange={(event) =>
												updatePatrolPoint(index, {
													x: Number(event.target.value),
												})
											}
											type="number"
											value={point.x}
										/>
										<input
											aria-label={`Patrol point ${index + 1} Y`}
											min={0}
											onChange={(event) =>
												updatePatrolPoint(index, {
													y: Number(event.target.value),
												})
											}
											type="number"
											value={point.y}
										/>
										<button
											className="danger-button compact"
											onClick={() => deletePatrolPoint(index)}
											type="button"
										>
											Delete
										</button>
									</div>
								),
							)}
							<button onClick={addPatrolPoint} type="button">
								Add patrol point
							</button>
						</div>
					) : null}
					{selectedResolvedNpc.movementMode === "wander" ? (
						<div className="form-grid compact">
							{(["x", "y", "width", "height"] as const).map((field) => (
								<label key={field}>
									Zone {field}
									<input
										min={field === "width" || field === "height" ? 1 : 0}
										onChange={(event) =>
											updateSelectedNpcMovement({
												wanderZone: {
													x: selectedResolvedNpc.wanderZone?.x ?? selectedNpc.x,
													y: selectedResolvedNpc.wanderZone?.y ?? selectedNpc.y,
													width: selectedResolvedNpc.wanderZone?.width ?? 3,
													height: selectedResolvedNpc.wanderZone?.height ?? 3,
													[field]: Math.max(
														field === "width" || field === "height" ? 1 : 0,
														Number(event.target.value),
													),
												},
											})
										}
										type="number"
										value={
											selectedResolvedNpc.wanderZone?.[field] ??
											(field === "width" || field === "height"
												? 3
												: selectedNpc[field])
										}
									/>
								</label>
							))}
						</div>
					) : null}
					{hasMovementOverride ? (
						<button
							onClick={() => resetSelectedNpcSection("movement")}
							type="button"
						>
							Reset movement to definition default
						</button>
					) : null}
					<div className="coordinate-readout">
						{definition?.description ?? "Friendly interactable NPC."}
					</div>
					<div className="coordinate-readout">
						Interaction source:{" "}
						{hasInteractionOverride
							? "instance override"
							: "definition default"}
					</div>
					{renderInteractionEditor(selectedResolvedNpc.interaction)}
					{hasInteractionOverride ? (
						<button
							onClick={() => resetSelectedNpcSection("interaction")}
							type="button"
						>
							Reset interaction to definition default
						</button>
					) : null}
					<button
						className="danger-button"
						onClick={deleteSelectedNpc}
						type="button"
					>
						Delete NPC instance
					</button>
				</div>
			</>
		);
	}

	function renderEventInspector() {
		if (!selectedEventBlock) {
			return renderAreaInspector();
		}

		return (
			<>
				<div className="panel-title">Event Block</div>
				<div className="form-stack">
					<label>
						Name
						<input
							onChange={(event) =>
								updateSelectedEventBlock({ name: event.target.value })
							}
							value={selectedEventBlock.name}
						/>
					</label>
					<label>
						Tag
						<input
							onChange={(event) =>
								updateSelectedEventBlock({ tag: event.target.value })
							}
							value={selectedEventBlock.tag}
						/>
					</label>
					<label>
						Kind
						<select
							onChange={(event) =>
								updateSelectedEventKind(
									event.target.value as EventBlock["kind"],
								)
							}
							value={selectedEventBlock.kind}
						>
							<option value="spawn">Spawn</option>
							<option value="trigger">Trigger</option>
							<option value="area_link">Area Link</option>
						</select>
					</label>
					<div className="form-grid compact">
						<label>
							X
							<input
								min={0}
								onChange={(event) =>
									updateSelectedEventBlock({ x: Number(event.target.value) })
								}
								type="number"
								value={selectedEventBlock.x}
							/>
						</label>
						<label>
							Y
							<input
								min={0}
								onChange={(event) =>
									updateSelectedEventBlock({ y: Number(event.target.value) })
								}
								type="number"
								value={selectedEventBlock.y}
							/>
						</label>
					</div>
					{selectedEventBlock.kind === "area_link" ? (
						<>
							<label>
								Target area
								<select
									onChange={(event) =>
										updateSelectedAreaLinkTargetArea(event.target.value)
									}
									value={defaultLinkTargetArea?.id ?? ""}
								>
									{project.areas.map((area) => (
										<option key={area.id} value={area.id}>
											{area.name}
										</option>
									))}
								</select>
							</label>
							<label>
								Target spawn/event
								<select
									onChange={(event) =>
										updateSelectedAreaLinkTargetEvent(event.target.value)
									}
									value={selectedLinkTargetEventBlockId}
								>
									{linkTargetEventBlocks.map((eventBlock) => (
										<option key={eventBlock.id} value={eventBlock.id}>
											{eventBlock.name} ({eventBlock.kind})
										</option>
									))}
								</select>
							</label>
						</>
					) : null}
					<div className="coordinate-readout">
						{selectedEventBlock.kind === "spawn"
							? "Spawn"
							: selectedEventBlock.kind === "area_link"
								? "Link"
								: "Trigger"}{" "}
						at x {selectedEventBlock.x}, y {selectedEventBlock.y}
					</div>
					{renderInteractionEditor(selectedEventBlock.interaction)}
					<button
						className="danger-button"
						onClick={deleteSelectedEventBlock}
						type="button"
					>
						Delete event block
					</button>
				</div>
			</>
		);
	}

	function renderInspector() {
		if (selectedEventBlock) {
			return renderEventInspector();
		}

		if (selectedMapStructure) {
			return renderStructureInspector();
		}

		if (selectedObject) {
			return renderObjectInspector();
		}

		if (selectedPickup) {
			return renderPickupInspector();
		}

		if (selectedNpc) {
			return renderNpcInspector();
		}

		if (selectedOverlayTile?.overlayId) {
			return renderOverlayInspector();
		}

		if (selectedTerrainTile) {
			return renderTerrainInspector();
		}

		return renderAreaInspector();
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
										selectedTerrainId === tile.id && paintLayer === "terrain"
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

				<details open className="palette-section">
					<summary>Overlays</summary>
					<div className="palette-list tile-palette">
						{overlayPresets.map((overlay) => (
							<button
								className={`palette-item ${
									selectedOverlayId === overlay.id && paintLayer === "overlay"
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

				<details open className="palette-section">
					<summary>Structures</summary>
					<div className="palette-list tile-palette">
						{structurePresets.map((structure) => (
							<button
								className={`palette-item ${
									selectedStructureId === structure.id &&
									activeTool === "structure"
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

				<details open className="palette-section">
					<summary>Objects</summary>
					<label>
						Object definition
						<select
							onChange={(event) =>
								setSelectedObjectDefinitionId(event.target.value)
							}
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
						className={`palette-item ${activeTool === "object" ? "selected" : ""}`}
						disabled={!selectedObjectDefinitionId}
						onClick={() => {
							setActiveTool("object");
							setPaintLayer("event");
						}}
						type="button"
					>
						<span className="swatch object-swatch">O</span>
						{selectedObjectDefinition?.name ?? "Object"}
					</button>
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
					<button
						className={`palette-item ${activeTool === "pickup" ? "selected" : ""}`}
						onClick={() => {
							setActiveTool("pickup");
							setPaintLayer("event");
						}}
						type="button"
					>
						<span className="swatch pickup-swatch">P</span>
						Pickup
					</button>
					<label>
						NPC definition
						<select
							onChange={(event) =>
								setSelectedNpcDefinitionId(event.target.value)
							}
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
						className={`palette-item ${activeTool === "npc" ? "selected" : ""}`}
						disabled={!selectedNpcDefinitionId}
						onClick={() => {
							setActiveTool("npc");
							setPaintLayer("event");
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
						className={activeTool === "pan" ? "selected" : ""}
						onClick={() => setActiveTool("pan")}
						type="button"
					>
						Pan
					</button>
				</div>
				<p className="tool-note">
					Layer: <strong>{paintLayer}</strong>. Terrain eraser resets to grass;
					overlay eraser clears paths.
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
				<label>
					Overlay
					<select
						onChange={(event) =>
							setOverlayFilter(event.target.value as MapOverlayFilter)
						}
						value={overlayFilter}
					>
						<option value="npc_paths">NPC paths</option>
						<option value="enemy_ranges">Enemy ranges</option>
						<option value="none">None</option>
					</select>
				</label>
				<p className="tool-note">
					TODO: Add event block, collision, quest marker, and enemy territory
					overlays.
				</p>

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
							const eventBlock = eventLookup.get(key);
							const object = objectLookup.get(key);
							const pickup = pickupLookup.get(key);
							const pickupItem = project.items.find(
								(item) => item.id === pickup?.itemId,
							);
							const npc = npcLookup.get(key);
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

							return (
								<button
									aria-label={`Tile ${x}, ${y}`}
									className={`map-cell ${isOutsideMap ? "map-cell-outside" : ""} ${
										isSelectedTerrain || isSelectedOverlay
											? "selected-cell"
											: ""
									} ${isSelectedOverlay ? "selected-overlay-cell" : ""}`}
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
											<span className="event-marker-label">{eventLabel}</span>
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
					{overlayFilter === "npc_paths" &&
					selectedResolvedNpc?.movementMode === "patrol" &&
					selectedResolvedNpc.patrolPath ? (
						<svg
							className="map-npc-path-overlay"
							height={renderHeight * cellSize}
							width={renderWidth * cellSize}
						>
							<polyline
								points={selectedResolvedNpc.patrolPath.points
									.map(
										(point) =>
											`${point.x * cellSize + cellSize / 2},${point.y * cellSize + cellSize / 2}`,
									)
									.join(" ")}
							/>
							{selectedResolvedNpc.patrolPath.points.map((point, index) => (
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
					{overlayFilter === "npc_paths" &&
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
					{overlayFilter === "enemy_ranges" &&
					selectedResolvedNpc?.attributes.alignment === "hostile" &&
					selectedResolvedNpc.enemyBehaviour?.enabled ? (
						<>
							<div
								className="map-enemy-range detection"
								style={{
									left:
										(selectedResolvedNpc.x +
											0.5 -
											selectedResolvedNpc.enemyBehaviour.detectionRadiusTiles) *
										cellSize,
									top:
										(selectedResolvedNpc.y +
											0.5 -
											selectedResolvedNpc.enemyBehaviour.detectionRadiusTiles) *
										cellSize,
									width:
										selectedResolvedNpc.enemyBehaviour.detectionRadiusTiles *
										2 *
										cellSize,
									height:
										selectedResolvedNpc.enemyBehaviour.detectionRadiusTiles *
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
					{activeArea.structures.map((structure) => {
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
								<span className="structure-label">{structure.name}</span>
							</button>
						);
					})}
				</div>
			</div>

			<aside className="inspector-panel">{renderInspector()}</aside>

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
