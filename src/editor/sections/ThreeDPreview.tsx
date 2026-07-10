import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getTerrainSurfaceY } from "../../data/terrainHeight";
import {
	clampOrbitCameraState,
	createOrbitCameraState,
	getOrbitCameraBounds,
	getOrbitCameraLookTarget,
	getOrbitCameraPosition,
	type OrbitCameraDimensions,
	type OrbitCameraPreset,
	type OrbitCameraState,
	panOrbitCamera,
	resetOrbitCameraState,
	rotateOrbitCamera,
	zoomOrbitCamera,
} from "../../runtime/three/cameraControls";
import {
	disposePlaceholderObject,
	getPlaceholderSelectableObjects,
} from "../../runtime/three/placeholderMeshes";
import { ThreePerformanceOverlay } from "../../runtime/three/ThreePerformanceOverlay";
import { createSmoothTerrainBufferGeometry } from "../../runtime/three/terrainMeshGeometry";
import {
	createThreePerformanceDiagnostics,
	registerThreePerformanceDiagnostics,
	type ThreePerformanceDiagnostics,
} from "../../runtime/three/threePerformanceDiagnostics";
import { createThreeVisualMarkerGroup } from "../../runtime/three/threeVisualRenderer";
import {
	addThreeWorldLighting,
	applyShadowRole,
	configureThreeRenderer,
	configureThreeWorldScene,
	createTerrainMaterial,
	createWorldMaterial,
	getWorldMaterialColor,
	resolveTerrainMaterialKey,
} from "../../runtime/three/worldPresentation";
import { useProjectStore } from "../../store/useProjectStore";
import { areaEntitiesToMarkers } from "./entityMarkers";
import {
	GAMEPLAY_OVERLAY_FILTERS,
	HIDE_ALL_OVERLAY_FILTERS,
	type MapOverlayFilters,
	OVERLAY_FILTER_OPTIONS,
	readStoredMapOverlayFilters,
	SHOW_ALL_OVERLAY_FILTERS,
	toggleMapOverlayFilter,
	writeStoredMapOverlayFilters,
} from "./overlayFilters";
import {
	getPreviewSelectionFootprint,
	isMovablePreviewSelection,
	movePreviewSelectionInProject,
	type PreviewGridPosition,
	previewGridPositionToThreePoint,
} from "./previewMove";
import {
	getPreviewPlacementInfo,
	placePreviewEntity,
} from "./previewPlacement";
import {
	entityMarkerToSelectionMetadata,
	metadataToEditorSelection,
	type PreviewSelectionMetadata,
	selectionMatchesMetadata,
	terrainBlockToSelectionMetadata,
} from "./previewSelection";
import { getPreviewSelectionDetails } from "./previewSelectionDetails";
import {
	type TerrainRenderMode,
	terrainTilesToBlocks,
	terrainTilesToSmoothMeshes,
} from "./terrainBlocks";
import {
	resolveTerrainBrushFootprint,
	resolveTerrainBrushSamples,
	resolveTerrainFloodFill,
	resolveTerrainHeightUpdates,
	resolveTerrainLine,
	resolveTerrainPaintUpdates,
	resolveTerrainRectangle,
	type TerrainBrushCell,
	type TerrainBrushFalloff,
	type TerrainBrushSample,
	type TerrainBrushShape,
	type TerrainHeightOperation,
	terrainBrushCellKey,
} from "./terrainBrush";
import {
	getCanvasPointerNdc,
	resolveSelectionMetadataFromIntersection,
	terrainIntersectionToPreviewGridPosition,
} from "./threeDPreviewPicking";
import {
	getWalkPreviewDirectionFromKey,
	getWalkPreviewStart,
	moveWalkPreview,
} from "./threeDWalkPreview";

type PreviewCameraMode = OrbitCameraPreset | "custom";
export type TerrainHeightTool =
	| "raise"
	| "lower"
	| "flatten"
	| "set"
	| "smooth"
	| "roughen";
type TerrainBrushSize = 1 | 2 | 3 | 5;
type TerrainGesture = "brush" | "line" | "rectangle" | "fill";
type ThreeDPreviewBuildInputs = {
	activeAreaId: string;
	assetRenderVersion: number;
	entityMarkerCount: number;
	selectionKey: string;
	smoothTerrainMeshCount: number;
	terrainBlockCount: number;
	terrainRenderMode: TerrainRenderMode;
	walkPreviewKey: string;
};

type ThreeDPreviewProps = {
	brushFalloff?: TerrainBrushFalloff;
	brushShape?: TerrainBrushShape;
	brushSize?: TerrainBrushSize;
	brushStrength?: number;
	embedded?: boolean;
	heightToolValue?: number;
	hideDetails?: boolean;
	onOpenInMapEditor?: () => void;
	overlayFilters?: MapOverlayFilters;
	terrainGesture?: TerrainGesture;
	terrainPaintTileId?: string;
	terrainHeightTool?: TerrainHeightTool;
};

function createThreeDPreviewSelectionKey(selection: unknown): string {
	return JSON.stringify(selection ?? null);
}

function resolveThreeDPreviewBuildReason(
	previous: ThreeDPreviewBuildInputs | null,
	next: ThreeDPreviewBuildInputs,
): string {
	if (!previous) {
		return "initial preview build";
	}
	if (previous.assetRenderVersion !== next.assetRenderVersion) {
		return "asset state changed";
	}
	if (previous.activeAreaId !== next.activeAreaId) {
		return "active area changed";
	}
	if (previous.terrainRenderMode !== next.terrainRenderMode) {
		return "terrain mode changed";
	}
	if (
		previous.terrainBlockCount !== next.terrainBlockCount ||
		previous.smoothTerrainMeshCount !== next.smoothTerrainMeshCount
	) {
		return "terrain changed";
	}
	if (previous.entityMarkerCount !== next.entityMarkerCount) {
		return "entities changed";
	}
	if (previous.selectionKey !== next.selectionKey) {
		return "selection changed";
	}
	if (previous.walkPreviewKey !== next.walkPreviewKey) {
		return "walk preview changed";
	}
	return "preview state changed";
}

type TerrainBrushStroke = {
	pointerId: number;
	appliedCells: Set<string>;
	tool: "paint" | "height";
};

type TerrainShapeGesture = {
	gesture: Extract<TerrainGesture, "line" | "rectangle">;
	pointerId: number;
	start: PreviewGridPosition;
};

function getPreviewSize(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	return {
		height: Math.max(240, Math.floor(rect.height || 360)),
		width: Math.max(320, Math.floor(rect.width || 640)),
	};
}

function getPreviewCameraDimensions(
	height: number | undefined,
	width: number | undefined,
): OrbitCameraDimensions {
	return {
		height: Math.max(height ?? 8, 8),
		width: Math.max(width ?? 8, 8),
	};
}

function disposeMesh(mesh: THREE.Mesh): void {
	mesh.geometry.dispose();
	if (Array.isArray(mesh.material)) {
		mesh.material.forEach((material) => {
			material.dispose();
		});
	} else {
		mesh.material.dispose();
	}
}

export function ThreeDPreview({
	brushFalloff = "hard",
	brushShape = "square",
	brushSize = 1,
	brushStrength = 1,
	embedded = false,
	heightToolValue = 0,
	hideDetails = false,
	onOpenInMapEditor,
	overlayFilters: controlledOverlayFilters,
	terrainGesture = "brush",
	terrainPaintTileId,
	terrainHeightTool,
}: ThreeDPreviewProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const diagnosticsRef = useRef<ThreePerformanceDiagnostics | null>(null);
	if (!diagnosticsRef.current) {
		diagnosticsRef.current = createThreePerformanceDiagnostics({
			label: "ThreeDPreview",
		});
	}
	const diagnostics = diagnosticsRef.current;
	const cameraStateRef = useRef<OrbitCameraState>(
		resetOrbitCameraState({ height: 8, width: 8 }),
	);
	const terrainBrushStrokeRef = useRef<TerrainBrushStroke | null>(null);
	const previousBuildInputsRef = useRef<ThreeDPreviewBuildInputs | null>(null);
	const [mountError, setMountError] = useState("");
	const [localOverlayFilters, setLocalOverlayFilters] = useState(
		readStoredMapOverlayFilters,
	);
	const [cameraPreset, setCameraPreset] =
		useState<PreviewCameraMode>("isometric");
	const [assetRenderVersion, setAssetRenderVersion] = useState(0);
	const [terrainRenderMode, setTerrainRenderMode] =
		useState<TerrainRenderMode>("blocky");
	const [walkPreviewPosition, setWalkPreviewPosition] =
		useState<PreviewGridPosition>();
	const [walkPreviewMessage, setWalkPreviewMessage] = useState("");
	const overlayFilters = controlledOverlayFilters ?? localOverlayFilters;
	const project = useProjectStore((state) => state.project);
	const editorSelection = useProjectStore((state) => state.editorSelection);
	const setEditorSelection = useProjectStore(
		(state) => state.setEditorSelection,
	);
	const updateProject = useProjectStore((state) => state.updateProject);
	const setTiles = useProjectStore((state) => state.setTiles);
	const setTerrainHeights = useProjectStore((state) => state.setTerrainHeights);
	const mapPaletteSelection = useProjectStore(
		(state) => state.mapPaletteSelection,
	);
	const setMapPaletteSelection = useProjectStore(
		(state) => state.setMapPaletteSelection,
	);
	const addStructure = useProjectStore((state) => state.addStructure);
	const addObject = useProjectStore((state) => state.addObject);
	const addPickup = useProjectStore((state) => state.addPickup);
	const updatePickup = useProjectStore((state) => state.updatePickup);
	const addNpc = useProjectStore((state) => state.addNpc);
	const addEventBlock = useProjectStore((state) => state.addEventBlock);
	const activeArea = useMemo(
		() =>
			project.areas.find((area) => area.id === project.activeAreaId) ??
			project.areas[0],
		[project.activeAreaId, project.areas],
	);
	const terrainBlocks = useMemo(
		() => terrainTilesToBlocks(activeArea),
		[activeArea],
	);
	const smoothTerrainMeshes = useMemo(
		() => terrainTilesToSmoothMeshes(activeArea),
		[activeArea],
	);
	const entityMarkers = useMemo(
		() =>
			areaEntitiesToMarkers(
				activeArea,
				project.objects,
				project.npcs,
				overlayFilters,
			),
		[activeArea, overlayFilters, project.npcs, project.objects],
	);
	const selectionDetails = useMemo(
		() => getPreviewSelectionDetails(project, editorSelection),
		[editorSelection, project],
	);
	const placementInfo = useMemo(
		() => getPreviewPlacementInfo(project, mapPaletteSelection),
		[mapPaletteSelection, project],
	);
	const canMoveSelection =
		isMovablePreviewSelection(editorSelection) &&
		editorSelection.areaId === activeArea?.id;
	const isWalkPreviewActive = Boolean(walkPreviewPosition);
	const activeAreaId = activeArea?.id;
	const cameraDimensions = useMemo(
		() => getPreviewCameraDimensions(activeArea?.height, activeArea?.width),
		[activeArea?.height, activeArea?.width],
	);

	const applyCameraPreset = useCallback(
		(preset: OrbitCameraPreset) => {
			cameraStateRef.current = createOrbitCameraState(preset, cameraDimensions);
			setCameraPreset(preset);
		},
		[cameraDimensions],
	);

	const resetCamera = useCallback(() => {
		cameraStateRef.current = resetOrbitCameraState(cameraDimensions);
		setCameraPreset("isometric");
	}, [cameraDimensions]);

	useEffect(() => {
		if (!activeAreaId) {
			resetCamera();
			return;
		}
		resetCamera();
	}, [activeAreaId, resetCamera]);

	useEffect(() => {
		return () => {
			terrainBrushStrokeRef.current = null;
		};
	}, []);

	const startWalkPreview = () => {
		const start = getWalkPreviewStart(activeArea);
		if (!start) {
			setWalkPreviewMessage("No active area for 3D walk preview.");
			return;
		}
		setWalkPreviewPosition(start);
		setWalkPreviewMessage(
			"Experimental 3D walk preview — game logic disabled.",
		);
	};

	const stopWalkPreview = useCallback(() => {
		setWalkPreviewPosition(undefined);
		setWalkPreviewMessage("");
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				if (walkPreviewPosition) {
					event.preventDefault();
					stopWalkPreview();
				} else {
					setMapPaletteSelection({ type: "none" });
				}
				return;
			}
			const direction = getWalkPreviewDirectionFromKey(event.key);
			if (!direction || !activeArea || !walkPreviewPosition) {
				return;
			}
			event.preventDefault();
			setWalkPreviewPosition((position) => {
				if (!position) {
					return position;
				}
				const result = moveWalkPreview(
					activeArea,
					project.player,
					position,
					direction,
				);
				setWalkPreviewMessage(
					result.blockedReason
						? `Blocked: ${result.blockedReason}`
						: "Experimental 3D walk preview — game logic disabled.",
				);
				return result.position;
			});
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		activeArea,
		project.player,
		setMapPaletteSelection,
		stopWalkPreview,
		walkPreviewPosition,
	]);

	useEffect(() => {
		if (!controlledOverlayFilters) {
			writeStoredMapOverlayFilters(localOverlayFilters);
		}
	}, [controlledOverlayFilters, localOverlayFilters]);

	const updateLocalOverlayFilters = (filters: MapOverlayFilters) => {
		setLocalOverlayFilters(filters);
	};

	useEffect(() => {
		const unregisterDiagnostics =
			registerThreePerformanceDiagnostics(diagnostics);
		return () => {
			unregisterDiagnostics();
			diagnostics.dispose();
		};
	}, [diagnostics]);

	const getSceneBuildReason = () => {
		const nextBuildInputs: ThreeDPreviewBuildInputs = {
			activeAreaId: activeArea?.id ?? "",
			assetRenderVersion,
			entityMarkerCount: entityMarkers.length,
			selectionKey: createThreeDPreviewSelectionKey(editorSelection),
			smoothTerrainMeshCount: smoothTerrainMeshes.length,
			terrainBlockCount: terrainBlocks.length,
			terrainRenderMode,
			walkPreviewKey: walkPreviewPosition
				? `${walkPreviewPosition.x},${walkPreviewPosition.y}`
				: "none",
		};
		const reason = resolveThreeDPreviewBuildReason(
			previousBuildInputsRef.current,
			nextBuildInputs,
		);
		previousBuildInputsRef.current = nextBuildInputs;
		return reason;
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: renderer rebuilds when async asset load state changes.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) {
			return;
		}
		const sceneBuildStartedAt = performance.now();
		const rebuildReason = getSceneBuildReason();

		const scene = new THREE.Scene();
		configureThreeWorldScene(scene);

		const areaWidth = Math.max(activeArea?.width ?? 8, 8);
		const areaHeight = Math.max(activeArea?.height ?? 8, 8);
		const cameraBounds = getOrbitCameraBounds({
			height: areaHeight,
			width: areaWidth,
		});
		const camera = new THREE.PerspectiveCamera(
			50,
			1,
			0.1,
			Math.max(100, cameraBounds.maxDistance * 2),
		);
		const walkPreviewPoint =
			activeArea && walkPreviewPosition
				? previewGridPositionToThreePoint(activeArea, walkPreviewPosition, {
						height: 1,
						width: 1,
					})
				: undefined;
		const applyCameraFromState = () => {
			cameraStateRef.current = clampOrbitCameraState(
				cameraStateRef.current,
				cameraBounds,
			);
			const cameraPosition = getOrbitCameraPosition(cameraStateRef.current);
			const cameraTarget = getOrbitCameraLookTarget(cameraStateRef.current);
			camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
			camera.lookAt(
				new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z),
			);
			camera.updateMatrixWorld(true);
		};
		applyCameraFromState();

		addThreeWorldLighting(scene, { enableShadows: true });

		const gridSize = Math.max(areaWidth, areaHeight, 8);
		const grid = new THREE.GridHelper(
			gridSize,
			gridSize,
			getWorldMaterialColor("stone"),
			getWorldMaterialColor("default"),
		);
		scene.add(grid);

		const terrainRebuildStartedAt = performance.now();
		const smoothTerrainVisualMeshes =
			terrainRenderMode === "smooth"
				? smoothTerrainMeshes.map((smoothMesh) => {
						const mesh = new THREE.Mesh(
							createSmoothTerrainBufferGeometry(smoothMesh),
							createWorldMaterial(smoothMesh.materialKey),
						);
						applyShadowRole(mesh, {
							receive: smoothMesh.materialKey !== "water",
						});
						scene.add(mesh);
						return mesh;
					})
				: [];

		const terrainPickMeshes = terrainBlocks.map((block) => {
			const selectionMetadata = terrainBlockToSelectionMetadata(
				block,
				activeArea?.id ?? "",
			);
			const isSelected = selectionMatchesMetadata(
				editorSelection,
				selectionMetadata,
			);
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(
					terrainRenderMode === "smooth" ? 0.98 : 0.96,
					block.height,
					terrainRenderMode === "smooth" ? 0.98 : 0.96,
				),
				terrainRenderMode === "smooth"
					? createWorldMaterial("default", { opacity: 0 })
					: createTerrainMaterial(block.kind, { selected: isSelected }),
			);
			if (terrainRenderMode !== "smooth") {
				applyShadowRole(mesh, { receive: block.kind !== "water" });
			}
			mesh.userData.selectionMetadata = selectionMetadata;
			mesh.position.set(block.threeX, block.yOffset, block.threeZ);
			scene.add(mesh);
			return mesh;
		});
		diagnostics.recordTerrainRebuild({
			durationMs: performance.now() - terrainRebuildStartedAt,
			meshCount: smoothTerrainVisualMeshes.length + terrainPickMeshes.length,
			mode: terrainRenderMode,
			tileCount: terrainBlocks.length,
		});
		let assetStateChangeQueued = false;
		const handleAssetStateChange = () => {
			if (assetStateChangeQueued) {
				return;
			}
			assetStateChangeQueued = true;
			setAssetRenderVersion((version) => version + 1);
		};
		const markerRenderResults = entityMarkers.map((marker) => {
			const selectionMetadata = entityMarkerToSelectionMetadata(
				marker,
				activeArea?.id ?? "",
			);
			const isSelected = selectionMatchesMetadata(
				editorSelection,
				selectionMetadata,
			);
			const renderResult = createThreeVisualMarkerGroup(marker, {
				diagnostics,
				metadata: selectionMetadata,
				onAssetStateChange: handleAssetStateChange,
				selected: isSelected,
			});
			if (!renderResult.usedAsset) {
				applyShadowRole(renderResult.group, {
					cast: true,
					receive: marker.kind !== "event",
				});
			}
			const { group } = renderResult;
			scene.add(group);
			return renderResult;
		});
		const markerMeshes = markerRenderResults.map((result) => result.group);
		const walkPreviewMesh =
			activeArea && walkPreviewPosition
				? new THREE.Mesh(
						new THREE.CylinderGeometry(0.28, 0.36, 1.25, 16),
						createWorldMaterial("friendly", { selected: true }),
					)
				: undefined;
		if (
			walkPreviewMesh &&
			activeArea &&
			walkPreviewPosition &&
			walkPreviewPoint
		) {
			applyShadowRole(walkPreviewMesh, { cast: true });
			walkPreviewMesh.position.set(
				walkPreviewPoint.x,
				getTerrainSurfaceY(
					activeArea,
					walkPreviewPosition.x,
					walkPreviewPosition.y,
				) + 0.625,
				walkPreviewPoint.z,
			);
			scene.add(walkPreviewMesh);
		}
		diagnostics.setSceneEntityCounts({
			assetStatuses: markerRenderResults.map((result) => ({
				definitionId: result.assetDefinitionId,
				status: result.assetStatus,
				usedAsset: result.usedAsset,
			})),
			entityCount: entityMarkers.length + (walkPreviewMesh ? 1 : 0),
			sceneIdentity: {
				areaId: activeArea?.id,
				areaName: activeArea?.name,
				projectName: project.metadata.name,
			},
		});
		const selectableMeshes = [
			...terrainPickMeshes,
			...markerMeshes.flatMap(getPlaceholderSelectableObjects),
		];

		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true });
		} catch (error) {
			setMountError(
				error instanceof Error
					? error.message
					: "Three.js renderer could not be created.",
			);
			return;
		}

		configureThreeRenderer(renderer, { enableShadows: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		host.appendChild(renderer.domElement);

		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		let dragGhost: THREE.Mesh | null = null;
		let placementGhost: THREE.Mesh | null = null;
		let terrainBrushGhost: THREE.Group | null = null;
		let terrainShapeGesture: TerrainShapeGesture | null = null;
		let latestPlacementPosition: PreviewGridPosition | undefined;
		let pointerStart: {
			pointerId: number;
			x: number;
			y: number;
			metadata?: PreviewSelectionMetadata;
			didDrag: boolean;
			heightEditing?: boolean;
			terrainPainting?: boolean;
			terrainShape?: boolean;
			latestPosition?: PreviewGridPosition;
		} | null = null;
		let cameraDrag: {
			pointerId: number;
			mode: "orbit" | "pan";
			x: number;
			y: number;
		} | null = null;
		const markCustomCamera = () => {
			setCameraPreset((current) => (current === "custom" ? current : "custom"));
		};

		const isPrimaryEditorPointer = (event: PointerEvent) =>
			event.button === 0 && !event.altKey;

		const releasePointerCapture = (event: PointerEvent) => {
			renderer.domElement.releasePointerCapture?.(event.pointerId);
		};

		const setPointerFromEvent = (event: PointerEvent) => {
			const bounds = renderer.domElement.getBoundingClientRect();
			const ndc = getCanvasPointerNdc(
				{ clientX: event.clientX, clientY: event.clientY },
				bounds,
			);
			if (
				!ndc ||
				ndc.localX < 0 ||
				ndc.localY < 0 ||
				ndc.localX > bounds.width ||
				ndc.localY > bounds.height
			) {
				return false;
			}
			pointer.x = ndc.x;
			pointer.y = ndc.y;
			return true;
		};

		const updateRaycasterFromPointer = (event: PointerEvent) => {
			if (!setPointerFromEvent(event)) {
				return false;
			}
			applyCameraFromState();
			scene.updateMatrixWorld(true);
			raycaster.setFromCamera(pointer, camera);
			return true;
		};

		const getPointerHit = (event: PointerEvent) => {
			const pickStartedAt = performance.now();
			if (!updateRaycasterFromPointer(event)) {
				return undefined;
			}
			const hit = raycaster.intersectObjects(selectableMeshes, false)[0];
			diagnostics.recordPick(performance.now() - pickStartedAt);
			return resolveSelectionMetadataFromIntersection(hit);
		};

		const selectFromPointer = (event: PointerEvent) => {
			const metadata = getPointerHit(event);
			if (!metadata) {
				return;
			}
			setEditorSelection(metadataToEditorSelection(metadata));
		};

		const cleanupDragGhost = () => {
			if (!dragGhost) {
				return;
			}
			scene.remove(dragGhost);
			dragGhost.geometry.dispose();
			if (Array.isArray(dragGhost.material)) {
				dragGhost.material.forEach((material) => {
					material.dispose();
				});
			} else {
				dragGhost.material.dispose();
			}
			dragGhost = null;
		};

		const cleanupPlacementGhost = () => {
			if (!placementGhost) {
				return;
			}
			scene.remove(placementGhost);
			placementGhost.geometry.dispose();
			if (Array.isArray(placementGhost.material)) {
				placementGhost.material.forEach((material) => {
					material.dispose();
				});
			} else {
				placementGhost.material.dispose();
			}
			placementGhost = null;
			latestPlacementPosition = undefined;
		};

		const cleanupTerrainBrushGhost = () => {
			if (!terrainBrushGhost) {
				return;
			}
			scene.remove(terrainBrushGhost);
			terrainBrushGhost.traverse((child) => {
				if (!(child instanceof THREE.Mesh)) {
					return;
				}
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((material) => {
						material.dispose();
					});
				} else {
					child.material.dispose();
				}
			});
			terrainBrushGhost = null;
		};

		const metadataIsMovable = (metadata: PreviewSelectionMetadata) =>
			isMovablePreviewSelection(metadataToEditorSelection(metadata));

		const getTerrainPositionFromPointer = (
			event: PointerEvent,
			footprint = { height: 1, width: 1 },
		) => {
			const pickStartedAt = performance.now();
			if (!activeArea || !updateRaycasterFromPointer(event)) {
				return undefined;
			}
			const hit = raycaster.intersectObjects(terrainPickMeshes, false)[0];
			diagnostics.recordPick(performance.now() - pickStartedAt);
			if (!hit) {
				return undefined;
			}
			return terrainIntersectionToPreviewGridPosition(
				activeArea,
				hit,
				footprint,
			);
		};

		const getGridPositionFromPointer = (
			event: PointerEvent,
			metadata: PreviewSelectionMetadata,
		) => {
			const selection = metadataToEditorSelection(metadata);
			if (!activeArea) {
				return undefined;
			}
			return getTerrainPositionFromPointer(
				event,
				getPreviewSelectionFootprint(activeArea, selection),
			);
		};

		const getPlacementPositionFromPointer = (event: PointerEvent) => {
			if (
				!activeArea ||
				(!placementInfo.active && !terrainHeightTool && !terrainPaintTileId)
			) {
				return undefined;
			}
			return getTerrainPositionFromPointer(event, {
				height: Math.max(1, Math.round(placementInfo.depth)),
				width: Math.max(1, Math.round(placementInfo.width)),
			});
		};

		const getTerrainPaintPositionFromPointer = (event: PointerEvent) => {
			if (
				!activeArea ||
				!terrainPaintTileId ||
				terrainHeightTool ||
				placementInfo.active
			) {
				return undefined;
			}
			return getTerrainPositionFromPointer(event, { height: 1, width: 1 });
		};

		const getTerrainBrushPositionFromPointer = (event: PointerEvent) => {
			if (
				!activeArea ||
				placementInfo.active ||
				(!terrainHeightTool && !terrainPaintTileId)
			) {
				return undefined;
			}
			return getTerrainPositionFromPointer(event, { height: 1, width: 1 });
		};

		const getTerrainHeightOperation = (): TerrainHeightOperation | undefined =>
			terrainHeightTool;

		const getHeightBrushFalloff = () =>
			terrainHeightTool === "raise" ||
			terrainHeightTool === "lower" ||
			terrainHeightTool === "smooth" ||
			terrainHeightTool === "roughen"
				? brushFalloff
				: "hard";

		const getBrushPositions = (position: PreviewGridPosition) => {
			if (!activeArea) {
				return [];
			}
			return resolveTerrainBrushFootprint({
				bounds: { height: activeArea.height, width: activeArea.width },
				center: position,
				shape: brushShape,
				size: brushSize,
			});
		};

		const getBrushSamples = (position: PreviewGridPosition) => {
			if (!activeArea) {
				return [];
			}
			return resolveTerrainBrushSamples({
				bounds: { height: activeArea.height, width: activeArea.width },
				center: position,
				falloff: getHeightBrushFalloff(),
				shape: brushShape,
				size: brushSize,
			});
		};

		const getShapePositions = (
			gesture: Extract<TerrainGesture, "line" | "rectangle">,
			start: PreviewGridPosition,
			end: PreviewGridPosition,
		) => {
			if (!activeArea) {
				return [];
			}
			const bounds = { height: activeArea.height, width: activeArea.width };
			return gesture === "line"
				? resolveTerrainLine({ bounds, end, start })
				: resolveTerrainRectangle({ bounds, end, start });
		};

		const makeTerrainTileReader = () => {
			const lookup = new Map(
				activeArea?.terrainTiles.map((tile) => [
					terrainBrushCellKey(tile),
					tile.tileId,
				]) ?? [],
			);
			return (cell: TerrainBrushCell) =>
				lookup.get(terrainBrushCellKey(cell)) ?? "grass";
		};

		const getFillPositions = (position: PreviewGridPosition) => {
			if (!activeArea || !terrainPaintTileId || terrainHeightTool) {
				return [];
			}
			return resolveTerrainFloodFill({
				bounds: { height: activeArea.height, width: activeArea.width },
				getTileId: makeTerrainTileReader(),
				seed: position,
				targetTileId: terrainPaintTileId,
			});
		};

		const applyTerrainOperationAtCells = (
			positions: TerrainBrushCell[],
			selectionPosition: PreviewGridPosition,
			samples: TerrainBrushSample[] = positions.map((cell) => ({
				...cell,
				influence: 1,
			})),
		) => {
			if (!activeArea || positions.length === 0) {
				return false;
			}
			const heightOperation = getTerrainHeightOperation();
			if (heightOperation) {
				const updates = resolveTerrainHeightUpdates({
					area: activeArea,
					operation: heightOperation,
					samples,
					strength: brushStrength,
					targetHeight: heightOperation === "flatten" ? 0 : heightToolValue,
				});
				if (updates.length > 0) {
					setTerrainHeights(updates);
				}
			} else if (terrainPaintTileId) {
				const updates = resolveTerrainPaintUpdates({
					cells: positions,
					getTileId: makeTerrainTileReader(),
					knownBounds: { height: activeArea.height, width: activeArea.width },
					targetTileId: terrainPaintTileId,
				});
				if (updates.length > 0) {
					setTiles(updates);
				}
			} else {
				return false;
			}

			setEditorSelection({
				areaId: activeArea.id,
				type: "terrain",
				x: selectionPosition.x,
				y: selectionPosition.y,
			});
			return true;
		};

		const applyHeightToolAtPosition = (position: PreviewGridPosition) => {
			const terrainBrushStroke = terrainBrushStrokeRef.current;
			if (!activeArea || !terrainHeightTool || !terrainBrushStroke) {
				return false;
			}
			const samples = getBrushSamples(position).filter((cell) => {
				const key = terrainBrushCellKey(cell);
				if (terrainBrushStroke.appliedCells.has(key)) {
					return false;
				}
				terrainBrushStroke.appliedCells.add(key);
				return true;
			});
			return applyTerrainOperationAtCells(samples, position, samples);
		};

		const applyHeightToolFromPointer = (event: PointerEvent) => {
			const position = getTerrainBrushPositionFromPointer(event);
			return position ? applyHeightToolAtPosition(position) : false;
		};

		const applyTerrainPaintAtPosition = (position: PreviewGridPosition) => {
			const terrainBrushStroke = terrainBrushStrokeRef.current;
			if (!activeArea || !terrainPaintTileId || !terrainBrushStroke) {
				return false;
			}
			const positions = getBrushPositions(position).filter((cell) => {
				const key = terrainBrushCellKey(cell);
				if (terrainBrushStroke.appliedCells.has(key)) {
					return false;
				}
				terrainBrushStroke.appliedCells.add(key);
				return true;
			});
			if (positions.length === 0) {
				return true;
			}
			return applyTerrainOperationAtCells(positions, position);
		};

		const updateDragGhost = (
			metadata: PreviewSelectionMetadata,
			position: PreviewGridPosition,
		) => {
			if (!activeArea) {
				return;
			}
			const selection = metadataToEditorSelection(metadata);
			const footprint = getPreviewSelectionFootprint(activeArea, selection);
			const threePoint = previewGridPositionToThreePoint(
				activeArea,
				position,
				footprint,
			);
			if (!dragGhost) {
				dragGhost = new THREE.Mesh(
					new THREE.BoxGeometry(footprint.width, 0.12, footprint.height),
					createWorldMaterial("itemAccent", { opacity: 0.42 }),
				);
				scene.add(dragGhost);
			}
			dragGhost.position.set(
				threePoint.x,
				getTerrainSurfaceY(activeArea, position.x, position.y) + 0.06,
				threePoint.z,
			);
		};

		const updatePlacementGhost = (position: PreviewGridPosition) => {
			if (!activeArea || !placementInfo.active) {
				cleanupPlacementGhost();
				return;
			}
			const footprint = {
				height: Math.max(1, Math.round(placementInfo.depth)),
				width: Math.max(1, Math.round(placementInfo.width)),
			};
			const threePoint = previewGridPositionToThreePoint(
				activeArea,
				position,
				footprint,
			);
			if (!placementGhost) {
				const geometry =
					placementInfo.shape === "cylinder"
						? new THREE.CylinderGeometry(
								placementInfo.width / 2,
								placementInfo.depth / 2,
								placementInfo.height,
								12,
							)
						: new THREE.BoxGeometry(
								placementInfo.width,
								placementInfo.height,
								placementInfo.depth,
							);
				placementGhost = new THREE.Mesh(
					geometry,
					createWorldMaterial("default", {
						color: placementInfo.color,
						opacity: 0.42,
					}),
				);
				scene.add(placementGhost);
			}
			placementGhost.position.set(
				threePoint.x,
				getTerrainSurfaceY(activeArea, position.x, position.y) +
					placementInfo.height / 2,
				threePoint.z,
			);
			latestPlacementPosition = position;
		};

		const getTerrainBrushPreviewMaterialKey = () =>
			terrainPaintTileId
				? resolveTerrainMaterialKey(terrainPaintTileId)
				: "itemAccent";

		const updateTerrainCellsGhost = (positions: TerrainBrushCell[]) => {
			if (!activeArea || (!terrainPaintTileId && !terrainHeightTool)) {
				cleanupTerrainBrushGhost();
				return;
			}
			if (positions.length === 0) {
				cleanupTerrainBrushGhost();
				return;
			}

			cleanupTerrainBrushGhost();
			terrainBrushGhost = new THREE.Group();
			positions.forEach((cell) => {
				const threePoint = previewGridPositionToThreePoint(activeArea, cell, {
					height: 1,
					width: 1,
				});
				const mesh = new THREE.Mesh(
					new THREE.BoxGeometry(0.92, 0.08, 0.92),
					createWorldMaterial(getTerrainBrushPreviewMaterialKey(), {
						opacity: 0.48,
					}),
				);
				mesh.position.set(
					threePoint.x,
					getTerrainSurfaceY(activeArea, cell.x, cell.y) + 0.06,
					threePoint.z,
				);
				terrainBrushGhost?.add(mesh);
			});
			scene.add(terrainBrushGhost);
		};

		const updateTerrainBrushGhost = (position: PreviewGridPosition) => {
			updateTerrainCellsGhost(getBrushPositions(position));
		};

		const handlePointerDown = (event: PointerEvent) => {
			// Alt-modified drags are reserved for camera control so unmodified
			// pointer input remains owned by paint, sculpt, placement, and selection.
			if (event.altKey && (event.button === 0 || event.button === 1)) {
				event.preventDefault();
				cameraDrag = {
					pointerId: event.pointerId,
					mode: event.shiftKey || event.button === 1 ? "pan" : "orbit",
					x: event.clientX,
					y: event.clientY,
				};
				renderer.domElement.setPointerCapture?.(event.pointerId);
				return;
			}
			if (!isPrimaryEditorPointer(event)) {
				return;
			}
			if (
				terrainGesture === "fill" &&
				terrainPaintTileId &&
				!terrainHeightTool &&
				!placementInfo.active
			) {
				const fillPosition = getTerrainPaintPositionFromPointer(event);
				if (!fillPosition) {
					cleanupTerrainBrushGhost();
					return;
				}
				event.preventDefault();
				const fillPositions = getFillPositions(fillPosition);
				applyTerrainOperationAtCells(fillPositions, fillPosition);
				updateTerrainCellsGhost(
					fillPositions.length > 0 ? fillPositions : [fillPosition],
				);
				return;
			}
			if (
				(terrainGesture === "line" || terrainGesture === "rectangle") &&
				(terrainPaintTileId || terrainHeightTool) &&
				!placementInfo.active
			) {
				const shapePosition = getTerrainBrushPositionFromPointer(event);
				if (!shapePosition) {
					cleanupTerrainBrushGhost();
					return;
				}
				event.preventDefault();
				terrainShapeGesture = {
					gesture: terrainGesture,
					pointerId: event.pointerId,
					start: shapePosition,
				};
				pointerStart = {
					didDrag: false,
					pointerId: event.pointerId,
					terrainShape: true,
					x: event.clientX,
					y: event.clientY,
				};
				renderer.domElement.setPointerCapture?.(event.pointerId);
				updateTerrainCellsGhost(
					getShapePositions(terrainGesture, shapePosition, shapePosition),
				);
				return;
			}
			if (
				terrainGesture === "brush" &&
				terrainPaintTileId &&
				!terrainHeightTool &&
				!placementInfo.active
			) {
				const paintPosition = getTerrainPaintPositionFromPointer(event);
				if (!paintPosition) {
					cleanupTerrainBrushGhost();
					return;
				}
				event.preventDefault();
				terrainBrushStrokeRef.current = {
					appliedCells: new Set(),
					pointerId: event.pointerId,
					tool: "paint",
				};
				pointerStart = {
					didDrag: false,
					pointerId: event.pointerId,
					terrainPainting: true,
					x: event.clientX,
					y: event.clientY,
				};
				renderer.domElement.setPointerCapture?.(event.pointerId);
				applyTerrainPaintAtPosition(paintPosition);
				updateTerrainBrushGhost(paintPosition);
				return;
			}
			if (terrainGesture === "brush" && terrainHeightTool) {
				const heightPosition = getTerrainBrushPositionFromPointer(event);
				if (!heightPosition) {
					cleanupTerrainBrushGhost();
					return;
				}
				event.preventDefault();
				terrainBrushStrokeRef.current = {
					appliedCells: new Set(),
					pointerId: event.pointerId,
					tool: "height",
				};
				pointerStart = {
					didDrag: false,
					heightEditing: true,
					pointerId: event.pointerId,
					x: event.clientX,
					y: event.clientY,
				};
				renderer.domElement.setPointerCapture?.(event.pointerId);
				applyHeightToolAtPosition(heightPosition);
				updateTerrainBrushGhost(heightPosition);
				return;
			}
			if (placementInfo.active) {
				pointerStart = {
					didDrag: false,
					pointerId: event.pointerId,
					x: event.clientX,
					y: event.clientY,
				};
				return;
			}
			const metadata = getPointerHit(event);
			const startsSelectedMove =
				metadata &&
				metadataIsMovable(metadata) &&
				selectionMatchesMetadata(editorSelection, metadata);
			pointerStart = {
				didDrag: false,
				metadata: startsSelectedMove ? metadata : undefined,
				pointerId: event.pointerId,
				x: event.clientX,
				y: event.clientY,
			};
			if (startsSelectedMove) {
				renderer.domElement.setPointerCapture?.(event.pointerId);
			}
		};

		const handlePointerMove = (event: PointerEvent) => {
			diagnostics.recordPointerMove();
			if (cameraDrag) {
				if (cameraDrag.pointerId !== event.pointerId) {
					return;
				}
				event.preventDefault();
				const deltaX = event.clientX - cameraDrag.x;
				const deltaY = event.clientY - cameraDrag.y;
				if (deltaX !== 0 || deltaY !== 0) {
					cameraStateRef.current =
						cameraDrag.mode === "pan"
							? panOrbitCamera(cameraStateRef.current, deltaX, deltaY)
							: rotateOrbitCamera(
									cameraStateRef.current,
									deltaX,
									deltaY,
									cameraBounds,
								);
					markCustomCamera();
					applyCameraFromState();
					cameraDrag = {
						...cameraDrag,
						x: event.clientX,
						y: event.clientY,
					};
				}
				return;
			}
			if (terrainShapeGesture) {
				if (terrainShapeGesture.pointerId !== event.pointerId) {
					return;
				}
				pointerStart = pointerStart
					? { ...pointerStart, didDrag: true }
					: pointerStart;
				const nextPosition = getTerrainBrushPositionFromPointer(event);
				if (!nextPosition) {
					cleanupTerrainBrushGhost();
					return;
				}
				updateTerrainCellsGhost(
					getShapePositions(
						terrainShapeGesture.gesture,
						terrainShapeGesture.start,
						nextPosition,
					),
				);
				return;
			}
			const terrainBrushStroke = terrainBrushStrokeRef.current;
			if (terrainBrushStroke) {
				if (terrainBrushStroke.pointerId !== event.pointerId) {
					return;
				}
				if (pointerStart?.terrainPainting) {
					pointerStart.didDrag = true;
				}
				if (pointerStart?.heightEditing) {
					pointerStart.didDrag = true;
				}
				const nextPosition =
					terrainBrushStroke.tool === "paint"
						? getTerrainPaintPositionFromPointer(event)
						: getTerrainBrushPositionFromPointer(event);
				if (!nextPosition) {
					cleanupTerrainBrushGhost();
					return;
				}
				if (terrainBrushStroke.tool === "paint") {
					applyTerrainPaintAtPosition(nextPosition);
				} else {
					applyHeightToolAtPosition(nextPosition);
				}
				updateTerrainBrushGhost(nextPosition);
				return;
			}
			if (pointerStart?.heightEditing) {
				if (pointerStart.pointerId !== event.pointerId) {
					return;
				}
				pointerStart.didDrag = true;
				applyHeightToolFromPointer(event);
				return;
			}
			if (placementInfo.active && !pointerStart?.metadata) {
				const nextPosition = getPlacementPositionFromPointer(event);
				if (nextPosition) {
					updatePlacementGhost(nextPosition);
				} else {
					cleanupPlacementGhost();
				}
				return;
			}
			if (
				(terrainPaintTileId || terrainHeightTool) &&
				!placementInfo.active &&
				!pointerStart?.metadata
			) {
				const nextPosition = getTerrainBrushPositionFromPointer(event);
				if (nextPosition) {
					if (
						terrainGesture === "fill" &&
						terrainPaintTileId &&
						!terrainHeightTool
					) {
						const fillPositions = getFillPositions(nextPosition);
						updateTerrainCellsGhost(
							fillPositions.length > 0 ? fillPositions : [nextPosition],
						);
					} else if (terrainGesture === "brush") {
						updateTerrainBrushGhost(nextPosition);
					} else {
						cleanupTerrainBrushGhost();
					}
				} else {
					cleanupTerrainBrushGhost();
				}
				return;
			}
			if (!pointerStart?.metadata) {
				return;
			}
			if (pointerStart.pointerId !== event.pointerId) {
				return;
			}
			const deltaX = Math.abs(event.clientX - pointerStart.x);
			const deltaY = Math.abs(event.clientY - pointerStart.y);
			if (deltaX <= 4 && deltaY <= 4) {
				return;
			}
			const nextPosition = getGridPositionFromPointer(
				event,
				pointerStart.metadata,
			);
			if (!nextPosition) {
				return;
			}
			pointerStart.didDrag = true;
			pointerStart.latestPosition = nextPosition;
			updateDragGhost(pointerStart.metadata, nextPosition);
		};

		const handlePointerUp = (event: PointerEvent) => {
			if (cameraDrag) {
				if (cameraDrag.pointerId !== event.pointerId) {
					return;
				}
				event.preventDefault();
				cameraDrag = null;
				releasePointerCapture(event);
				return;
			}
			if (terrainShapeGesture) {
				if (terrainShapeGesture.pointerId !== event.pointerId) {
					return;
				}
				const shapeGesture = terrainShapeGesture;
				const nextPosition = getTerrainBrushPositionFromPointer(event);
				if (nextPosition) {
					const positions = getShapePositions(
						shapeGesture.gesture,
						shapeGesture.start,
						nextPosition,
					);
					applyTerrainOperationAtCells(positions, nextPosition);
					updateTerrainCellsGhost(positions);
				} else {
					cleanupTerrainBrushGhost();
				}
				terrainShapeGesture = null;
				releasePointerCapture(event);
				if (pointerStart?.terrainShape) {
					pointerStart = null;
				}
				return;
			}
			const terrainBrushStroke = terrainBrushStrokeRef.current;
			if (terrainBrushStroke) {
				if (terrainBrushStroke.pointerId !== event.pointerId) {
					return;
				}
				releasePointerCapture(event);
				terrainBrushStrokeRef.current = null;
				if (pointerStart?.terrainPainting || pointerStart?.heightEditing) {
					pointerStart = null;
				}
				return;
			}
			if (!pointerStart) {
				return;
			}
			if (pointerStart.pointerId !== event.pointerId) {
				return;
			}
			if (pointerStart.heightEditing) {
				releasePointerCapture(event);
				pointerStart = null;
				return;
			}
			if (placementInfo.active) {
				const deltaX = Math.abs(event.clientX - pointerStart.x);
				const deltaY = Math.abs(event.clientY - pointerStart.y);
				const nextPosition =
					latestPlacementPosition ?? getPlacementPositionFromPointer(event);
				if (deltaX <= 4 && deltaY <= 4 && activeArea && nextPosition) {
					const nextSelection = placePreviewEntity(
						mapPaletteSelection,
						nextPosition,
						{
							addEventBlock,
							addNpc,
							addObject,
							addPickup,
							addStructure,
							areaId: activeArea.id,
							updatePickup,
						},
					);
					setEditorSelection(nextSelection);
				}
				pointerStart = null;
				return;
			}
			if (pointerStart.didDrag && pointerStart.metadata) {
				const selection = metadataToEditorSelection(pointerStart.metadata);
				const nextPosition = pointerStart.latestPosition;
				if (nextPosition) {
					updateProject((draft) => {
						movePreviewSelectionInProject(draft, selection, nextPosition);
					});
				}
				cleanupDragGhost();
				releasePointerCapture(event);
				pointerStart = null;
				return;
			}
			const deltaX = Math.abs(event.clientX - pointerStart.x);
			const deltaY = Math.abs(event.clientY - pointerStart.y);
			cleanupDragGhost();
			cleanupTerrainBrushGhost();
			releasePointerCapture(event);
			pointerStart = null;
			if (deltaX <= 4 && deltaY <= 4) {
				selectFromPointer(event);
			}
		};

		const cancelPointerInteraction = (event: PointerEvent) => {
			if (cameraDrag?.pointerId === event.pointerId) {
				cameraDrag = null;
				releasePointerCapture(event);
				return;
			}
			if (terrainShapeGesture?.pointerId === event.pointerId) {
				terrainShapeGesture = null;
				cleanupTerrainBrushGhost();
				releasePointerCapture(event);
				if (pointerStart?.terrainShape) {
					pointerStart = null;
				}
				return;
			}
			if (terrainBrushStrokeRef.current?.pointerId === event.pointerId) {
				terrainBrushStrokeRef.current = null;
				cleanupTerrainBrushGhost();
				releasePointerCapture(event);
				if (pointerStart?.terrainPainting || pointerStart?.heightEditing) {
					pointerStart = null;
				}
				return;
			}
			if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
				cleanupPlacementGhost();
				cleanupTerrainBrushGhost();
				return;
			}
			cleanupDragGhost();
			cleanupTerrainBrushGhost();
			releasePointerCapture(event);
			pointerStart = null;
		};

		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			cameraStateRef.current = zoomOrbitCamera(
				cameraStateRef.current,
				event.deltaY,
				cameraBounds,
			);
			markCustomCamera();
			applyCameraFromState();
		};

		const handleWindowTerrainPaintMove = (event: PointerEvent) => {
			if (
				terrainBrushStrokeRef.current?.pointerId !== event.pointerId &&
				terrainShapeGesture?.pointerId !== event.pointerId
			) {
				return;
			}
			handlePointerMove(event);
		};

		const handleWindowTerrainPaintUp = (event: PointerEvent) => {
			if (
				terrainBrushStrokeRef.current?.pointerId !== event.pointerId &&
				terrainShapeGesture?.pointerId !== event.pointerId
			) {
				return;
			}
			handlePointerUp(event);
		};

		renderer.domElement.addEventListener("pointerdown", handlePointerDown);
		renderer.domElement.addEventListener("pointermove", handlePointerMove);
		renderer.domElement.addEventListener("pointerup", handlePointerUp);
		renderer.domElement.addEventListener(
			"pointercancel",
			cancelPointerInteraction,
		);
		renderer.domElement.addEventListener(
			"pointerleave",
			cancelPointerInteraction,
		);
		window.addEventListener("pointermove", handleWindowTerrainPaintMove);
		window.addEventListener("pointerup", handleWindowTerrainPaintUp);
		window.addEventListener("pointercancel", cancelPointerInteraction);
		renderer.domElement.addEventListener("wheel", handleWheel, {
			passive: false,
		});

		let animationFrame = 0;
		let lastFrameMs = performance.now();

		const resize = () => {
			const { height, width } = getPreviewSize(host);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			camera.updateMatrixWorld(true);
			renderer.setSize(width, height, false);
		};

		const render = () => {
			const now = performance.now();
			diagnostics.recordFrame(now - lastFrameMs);
			lastFrameMs = now;
			applyCameraFromState();
			const renderStartedAt = performance.now();
			renderer.render(scene, camera);
			diagnostics.recordRenderCall(performance.now() - renderStartedAt);
			diagnostics.recordRendererInfo(renderer.info);
			animationFrame = window.requestAnimationFrame(render);
		};

		const resizeObserver =
			"ResizeObserver" in window ? new ResizeObserver(resize) : undefined;
		resizeObserver?.observe(host);
		window.addEventListener("resize", resize);

		resize();
		diagnostics.recordSceneBuild(
			rebuildReason,
			performance.now() - sceneBuildStartedAt,
		);
		render();

		return () => {
			diagnostics.recordSceneCleanup();
			window.cancelAnimationFrame(animationFrame);
			window.removeEventListener("resize", resize);
			renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
			renderer.domElement.removeEventListener("pointermove", handlePointerMove);
			renderer.domElement.removeEventListener("pointerup", handlePointerUp);
			renderer.domElement.removeEventListener(
				"pointercancel",
				cancelPointerInteraction,
			);
			renderer.domElement.removeEventListener(
				"pointerleave",
				cancelPointerInteraction,
			);
			window.removeEventListener("pointermove", handleWindowTerrainPaintMove);
			window.removeEventListener("pointerup", handleWindowTerrainPaintUp);
			window.removeEventListener("pointercancel", cancelPointerInteraction);
			renderer.domElement.removeEventListener("wheel", handleWheel);
			resizeObserver?.disconnect();
			terrainShapeGesture = null;
			cleanupDragGhost();
			cleanupPlacementGhost();
			cleanupTerrainBrushGhost();
			renderer.dispose();
			terrainPickMeshes.forEach(disposeMesh);
			smoothTerrainVisualMeshes.forEach(disposeMesh);
			markerRenderResults.forEach((result) => {
				if (!result.usedAsset) {
					disposePlaceholderObject(result.group);
				}
			});
			if (walkPreviewMesh) {
				scene.remove(walkPreviewMesh);
				walkPreviewMesh.geometry.dispose();
				if (Array.isArray(walkPreviewMesh.material)) {
					walkPreviewMesh.material.forEach((material) => {
						material.dispose();
					});
				} else {
					walkPreviewMesh.material.dispose();
				}
			}
			if (host.contains(renderer.domElement)) {
				host.removeChild(renderer.domElement);
			}
		};
	}, [
		activeArea,
		addEventBlock,
		addNpc,
		addObject,
		addPickup,
		addStructure,
		assetRenderVersion,
		brushFalloff,
		brushShape,
		brushSize,
		brushStrength,
		editorSelection,
		entityMarkers,
		heightToolValue,
		mapPaletteSelection,
		placementInfo,
		setEditorSelection,
		setTiles,
		setTerrainHeights,
		smoothTerrainMeshes,
		terrainBlocks,
		terrainGesture,
		terrainPaintTileId,
		terrainHeightTool,
		terrainRenderMode,
		updatePickup,
		updateProject,
		walkPreviewPosition,
	]);

	return (
		<section
			className={
				embedded ? "three-d-preview-workspace" : "editor-panel three-d-preview"
			}
		>
			<div className="content-panel three-d-preview-panel">
				<div className="panel-title">3D Preview</div>
				<p className="helper-text">
					3D Preview is experimental. Entity movement edits the current project;
					height tools sculpt the current area.
				</p>
				<p className="helper-text">
					Showing terrain and entity placeholders for{" "}
					{activeArea?.name ?? "No active area"}.
				</p>
				<p className="helper-text">
					Click objects in 3D to inspect them. Drag a selected entity to move it
					on the grid.
				</p>
				{isWalkPreviewActive ? (
					<p className="helper-text">
						Experimental 3D walk preview — game logic disabled.
					</p>
				) : null}
				<p className="helper-text">
					{terrainHeightTool
						? `Height tool: ${terrainHeightTool}. Click or drag terrain to sculpt.`
						: terrainPaintTileId
							? `Click terrain to paint selected terrain type: ${terrainPaintTileId}.`
							: placementInfo.active
								? `${placementInfo.label}. Click terrain to place.`
								: "No placeable selected."}
				</p>
				<div className="three-d-preview-controls">
					<button
						className={cameraPreset === "top" ? "active" : ""}
						onClick={() => applyCameraPreset("top")}
						type="button"
					>
						Top
					</button>
					<button
						className={cameraPreset === "isometric" ? "active" : ""}
						onClick={() => applyCameraPreset("isometric")}
						type="button"
					>
						Isometric
					</button>
					<button
						className={cameraPreset === "low" ? "active" : ""}
						onClick={() => applyCameraPreset("low")}
						type="button"
					>
						Low angle
					</button>
					<button onClick={resetCamera} type="button">
						Reset camera
					</button>
					<button
						className={terrainRenderMode === "blocky" ? "active" : ""}
						onClick={() => setTerrainRenderMode("blocky")}
						type="button"
					>
						Blocky terrain
					</button>
					<button
						className={terrainRenderMode === "smooth" ? "active" : ""}
						onClick={() => setTerrainRenderMode("smooth")}
						type="button"
					>
						Smooth terrain
					</button>
					{isWalkPreviewActive ? (
						<button onClick={stopWalkPreview} type="button">
							Stop 3D Walk Preview
						</button>
					) : (
						<button onClick={startWalkPreview} type="button">
							Start 3D Walk Preview
						</button>
					)}
				</div>
				{walkPreviewPosition ? (
					<p className="helper-text">
						Walk preview at x {walkPreviewPosition.x}, y {walkPreviewPosition.y}
						. Use WASD or arrow keys. Press Escape to stop.
					</p>
				) : null}
				{walkPreviewMessage ? (
					<p className="helper-text">{walkPreviewMessage}</p>
				) : null}
				{controlledOverlayFilters ? null : (
					<div className="preview-filter-panel">
						<div className="filter-button-row">
							<button
								onClick={() =>
									updateLocalOverlayFilters(SHOW_ALL_OVERLAY_FILTERS)
								}
								type="button"
							>
								Show All
							</button>
							<button
								onClick={() =>
									updateLocalOverlayFilters(HIDE_ALL_OVERLAY_FILTERS)
								}
								type="button"
							>
								Hide All
							</button>
							<button
								onClick={() =>
									updateLocalOverlayFilters(GAMEPLAY_OVERLAY_FILTERS)
								}
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
											updateLocalOverlayFilters(
												toggleMapOverlayFilter(overlayFilters, option.key),
											)
										}
										type="checkbox"
									/>
									{option.label}
								</label>
							))}
						</div>
					</div>
				)}
				<div
					aria-label="3D preview viewport"
					className="three-d-preview-host"
					ref={hostRef}
					role="img"
				/>
				<ThreePerformanceOverlay
					diagnostics={diagnostics}
					title="3D Preview Perf"
				/>
				{hideDetails ? null : (
					<aside className="three-d-selection-details">
						<div className="panel-title">Selected</div>
						{selectionDetails ? (
							<>
								<h3>{selectionDetails.title}</h3>
								<dl>
									{selectionDetails.rows.map((row) => (
										<div
											className="three-d-selection-detail-row"
											key={`${row.label}:${row.value}`}
										>
											<dt>{row.label}</dt>
											<dd>{row.value}</dd>
										</div>
									))}
								</dl>
								{selectionDetails.canOpenInMap && onOpenInMapEditor ? (
									<button onClick={onOpenInMapEditor} type="button">
										Open in Map Editor
									</button>
								) : null}
								{canMoveSelection ? (
									<p className="helper-text three-d-move-hint">
										Move mode: drag the selected marker to another tile.
									</p>
								) : null}
							</>
						) : (
							<p className="helper-text">
								Click a tile, NPC, object, or marker in the 3D preview to
								inspect it.
							</p>
						)}
					</aside>
				)}
				{mountError ? (
					<div className="validation-message">{mountError}</div>
				) : null}
			</div>
		</section>
	);
}
