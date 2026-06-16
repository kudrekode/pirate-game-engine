import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useProjectStore } from "../../store/useProjectStore";
import { areaEntitiesToMarkers } from "./entityMarkers";
import {
	getPreviewSelectionFootprint,
	isMovablePreviewSelection,
	movePreviewSelectionInProject,
	type PreviewGridPosition,
	previewGridPositionToThreePoint,
	threePointToPreviewGridPosition,
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
import { terrainTilesToBlocks } from "./terrainBlocks";

type PreviewCameraPreset = "top" | "isometric" | "low";

type ThreeDPreviewProps = {
	embedded?: boolean;
	hideDetails?: boolean;
	onOpenInMapEditor?: () => void;
};

function getPreviewSize(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	return {
		height: Math.max(240, Math.floor(rect.height || 360)),
		width: Math.max(320, Math.floor(rect.width || 640)),
	};
}

function getCameraPosition(
	preset: PreviewCameraPreset,
	cameraDistance: number,
): [number, number, number] {
	if (preset === "top") {
		return [0, cameraDistance * 1.35, 0.01];
	}
	if (preset === "low") {
		return [cameraDistance * 1.1, cameraDistance * 0.38, cameraDistance * 1.1];
	}
	return [cameraDistance, cameraDistance * 0.85, cameraDistance];
}

export function ThreeDPreview({
	embedded = false,
	hideDetails = false,
	onOpenInMapEditor,
}: ThreeDPreviewProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [mountError, setMountError] = useState("");
	const [showEventMarkers, setShowEventMarkers] = useState(false);
	const [cameraPreset, setCameraPreset] =
		useState<PreviewCameraPreset>("isometric");
	const project = useProjectStore((state) => state.project);
	const editorSelection = useProjectStore((state) => state.editorSelection);
	const setEditorSelection = useProjectStore(
		(state) => state.setEditorSelection,
	);
	const updateProject = useProjectStore((state) => state.updateProject);
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
	const entityMarkers = useMemo(
		() => areaEntitiesToMarkers(activeArea, project.objects, showEventMarkers),
		[activeArea, project.objects, showEventMarkers],
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

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMapPaletteSelection({ type: "none" });
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [setMapPaletteSelection]);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) {
			return;
		}

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0xf6f8fb);

		const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
		const areaWidth = Math.max(activeArea?.width ?? 8, 8);
		const areaHeight = Math.max(activeArea?.height ?? 8, 8);
		const cameraDistance = Math.max(areaWidth, areaHeight) * 0.9;
		camera.position.set(...getCameraPosition(cameraPreset, cameraDistance));
		camera.lookAt(0, 0, 0);

		const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
		directionalLight.position.set(3, 6, 4);
		scene.add(ambientLight, directionalLight);

		const gridSize = Math.max(areaWidth, areaHeight, 8);
		const grid = new THREE.GridHelper(gridSize, gridSize, 0x7b8794, 0xd0d7de);
		scene.add(grid);

		const meshes = terrainBlocks.map((block) => {
			const selectionMetadata = terrainBlockToSelectionMetadata(
				block,
				activeArea?.id ?? "",
			);
			const isSelected = selectionMatchesMetadata(
				editorSelection,
				selectionMetadata,
			);
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(0.96, block.height, 0.96),
				new THREE.MeshStandardMaterial({
					color: block.color,
					emissive: isSelected ? 0xfef08a : 0x000000,
					emissiveIntensity: isSelected ? 0.65 : 0,
					transparent: block.kind === "water",
					opacity: block.kind === "water" ? 0.72 : 1,
				}),
			);
			mesh.userData.selectionMetadata = selectionMetadata;
			mesh.position.set(block.threeX, block.yOffset, block.threeZ);
			scene.add(mesh);
			return mesh;
		});
		const markerMeshes = entityMarkers.map((marker) => {
			const selectionMetadata = entityMarkerToSelectionMetadata(
				marker,
				activeArea?.id ?? "",
			);
			const isSelected = selectionMatchesMetadata(
				editorSelection,
				selectionMetadata,
			);
			const geometry =
				marker.shape === "cylinder"
					? new THREE.CylinderGeometry(
							marker.width / 2,
							marker.depth / 2,
							marker.height,
							12,
						)
					: new THREE.BoxGeometry(marker.width, marker.height, marker.depth);
			const mesh = new THREE.Mesh(
				geometry,
				new THREE.MeshStandardMaterial({
					color: marker.color,
					emissive: isSelected ? 0xfef08a : 0x000000,
					emissiveIntensity: isSelected ? 0.65 : 0,
					transparent: marker.opacity < 1,
					opacity: marker.opacity,
				}),
			);
			mesh.userData.selectionMetadata = selectionMetadata;
			mesh.position.set(marker.threeX, marker.threeY, marker.threeZ);
			scene.add(mesh);
			return mesh;
		});
		const selectableMeshes = [...meshes, ...markerMeshes];

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

		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		host.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.enablePan = true;
		controls.enableZoom = true;
		controls.maxDistance = cameraDistance * 3;
		controls.minDistance = 3;
		controls.target.set(0, 0, 0);
		controls.update();

		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		const groundPoint = new THREE.Vector3();
		let dragGhost: THREE.Mesh | null = null;
		let placementGhost: THREE.Mesh | null = null;
		let latestPlacementPosition: PreviewGridPosition | undefined;
		let pointerStart: {
			x: number;
			y: number;
			metadata?: PreviewSelectionMetadata;
			didDrag: boolean;
			latestPosition?: PreviewGridPosition;
		} | null = null;

		const setPointerFromEvent = (event: PointerEvent) => {
			const rect = renderer.domElement.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) {
				return false;
			}
			pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
			return true;
		};

		const getPointerHit = (event: PointerEvent) => {
			if (!setPointerFromEvent(event)) {
				return undefined;
			}
			raycaster.setFromCamera(pointer, camera);
			const hit = raycaster.intersectObjects(selectableMeshes, false)[0];
			return hit?.object.userData.selectionMetadata as
				| PreviewSelectionMetadata
				| undefined;
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

		const metadataIsMovable = (metadata: PreviewSelectionMetadata) =>
			isMovablePreviewSelection(metadataToEditorSelection(metadata));

		const getGridPositionFromPointer = (
			event: PointerEvent,
			metadata: PreviewSelectionMetadata,
		) => {
			if (!activeArea || !setPointerFromEvent(event)) {
				return undefined;
			}
			raycaster.setFromCamera(pointer, camera);
			const point = raycaster.ray.intersectPlane(groundPlane, groundPoint);
			if (!point) {
				return undefined;
			}
			const selection = metadataToEditorSelection(metadata);
			return threePointToPreviewGridPosition(
				activeArea,
				{ x: point.x, z: point.z },
				getPreviewSelectionFootprint(activeArea, selection),
			);
		};

		const getPlacementPositionFromPointer = (event: PointerEvent) => {
			if (!activeArea || !placementInfo.active || !setPointerFromEvent(event)) {
				return undefined;
			}
			raycaster.setFromCamera(pointer, camera);
			const point = raycaster.ray.intersectPlane(groundPlane, groundPoint);
			if (!point) {
				return undefined;
			}
			return threePointToPreviewGridPosition(
				activeArea,
				{ x: point.x, z: point.z },
				{
					height: Math.max(1, Math.round(placementInfo.depth)),
					width: Math.max(1, Math.round(placementInfo.width)),
				},
			);
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
					new THREE.MeshStandardMaterial({
						color: 0xfacc15,
						opacity: 0.42,
						transparent: true,
					}),
				);
				scene.add(dragGhost);
			}
			dragGhost.position.set(threePoint.x, 1.06, threePoint.z);
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
					new THREE.MeshStandardMaterial({
						color: placementInfo.color,
						opacity: 0.42,
						transparent: true,
					}),
				);
				scene.add(placementGhost);
			}
			placementGhost.position.set(
				threePoint.x,
				Math.max(1.08, placementInfo.height / 2 + 1),
				threePoint.z,
			);
			latestPlacementPosition = position;
		};

		const handlePointerDown = (event: PointerEvent) => {
			if (placementInfo.active) {
				pointerStart = {
					didDrag: false,
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
				x: event.clientX,
				y: event.clientY,
			};
			if (startsSelectedMove) {
				controls.enabled = false;
				renderer.domElement.setPointerCapture?.(event.pointerId);
			}
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (placementInfo.active && !pointerStart?.metadata) {
				const nextPosition = getPlacementPositionFromPointer(event);
				if (nextPosition) {
					updatePlacementGhost(nextPosition);
				} else {
					cleanupPlacementGhost();
				}
				return;
			}
			if (!pointerStart?.metadata) {
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
			if (!pointerStart) {
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
				controls.enabled = true;
				renderer.domElement.releasePointerCapture?.(event.pointerId);
				pointerStart = null;
				return;
			}
			const deltaX = Math.abs(event.clientX - pointerStart.x);
			const deltaY = Math.abs(event.clientY - pointerStart.y);
			cleanupDragGhost();
			controls.enabled = true;
			renderer.domElement.releasePointerCapture?.(event.pointerId);
			pointerStart = null;
			if (deltaX <= 4 && deltaY <= 4) {
				selectFromPointer(event);
			}
		};

		renderer.domElement.addEventListener("pointerdown", handlePointerDown);
		renderer.domElement.addEventListener("pointermove", handlePointerMove);
		renderer.domElement.addEventListener("pointerup", handlePointerUp);

		let animationFrame = 0;

		const resize = () => {
			const { height, width } = getPreviewSize(host);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height, false);
		};

		const render = () => {
			controls.update();
			renderer.render(scene, camera);
			animationFrame = window.requestAnimationFrame(render);
		};

		const resizeObserver =
			"ResizeObserver" in window ? new ResizeObserver(resize) : undefined;
		resizeObserver?.observe(host);
		window.addEventListener("resize", resize);

		resize();
		render();

		return () => {
			window.cancelAnimationFrame(animationFrame);
			window.removeEventListener("resize", resize);
			renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
			renderer.domElement.removeEventListener("pointermove", handlePointerMove);
			renderer.domElement.removeEventListener("pointerup", handlePointerUp);
			resizeObserver?.disconnect();
			controls.dispose();
			cleanupDragGhost();
			cleanupPlacementGhost();
			renderer.dispose();
			[...meshes, ...markerMeshes].forEach((mesh) => {
				mesh.geometry.dispose();
				if (Array.isArray(mesh.material)) {
					mesh.material.forEach((material) => {
						material.dispose();
					});
				} else {
					mesh.material.dispose();
				}
			});
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
		cameraPreset,
		editorSelection,
		entityMarkers,
		mapPaletteSelection,
		placementInfo,
		setEditorSelection,
		terrainBlocks,
		updatePickup,
		updateProject,
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
					terrain is inspect-only.
				</p>
				<p className="helper-text">
					Showing terrain and entity placeholders for{" "}
					{activeArea?.name ?? "No active area"}.
				</p>
				<p className="helper-text">
					Click objects in 3D to inspect them. Drag a selected entity to move it
					on the grid.
				</p>
				<p className="helper-text">
					{placementInfo.active
						? `${placementInfo.label}. Click terrain to place.`
						: "No placeable selected."}
				</p>
				<div className="three-d-preview-controls">
					<button
						className={cameraPreset === "top" ? "active" : ""}
						onClick={() => setCameraPreset("top")}
						type="button"
					>
						Top
					</button>
					<button
						className={cameraPreset === "isometric" ? "active" : ""}
						onClick={() => setCameraPreset("isometric")}
						type="button"
					>
						Isometric
					</button>
					<button
						className={cameraPreset === "low" ? "active" : ""}
						onClick={() => setCameraPreset("low")}
						type="button"
					>
						Low angle
					</button>
					<button onClick={() => setCameraPreset("isometric")} type="button">
						Reset camera
					</button>
				</div>
				<label className="inline-toggle">
					<input
						checked={showEventMarkers}
						onChange={(event) => setShowEventMarkers(event.target.checked)}
						type="checkbox"
					/>
					Show event blocks
				</label>
				<div
					aria-label="3D preview viewport"
					className="three-d-preview-host"
					ref={hostRef}
					role="img"
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
