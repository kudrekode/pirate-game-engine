import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useProjectStore } from "../../store/useProjectStore";
import { areaEntitiesToMarkers } from "./entityMarkers";
import { terrainTilesToBlocks } from "./terrainBlocks";

type PreviewCameraPreset = "top" | "isometric" | "low";

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

export function ThreeDPreview() {
	const hostRef = useRef<HTMLDivElement>(null);
	const [mountError, setMountError] = useState("");
	const [showEventMarkers, setShowEventMarkers] = useState(false);
	const [cameraPreset, setCameraPreset] =
		useState<PreviewCameraPreset>("isometric");
	const project = useProjectStore((state) => state.project);
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
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(0.96, block.height, 0.96),
				new THREE.MeshStandardMaterial({
					color: block.color,
					transparent: block.kind === "water",
					opacity: block.kind === "water" ? 0.72 : 1,
				}),
			);
			mesh.position.set(block.threeX, block.yOffset, block.threeZ);
			scene.add(mesh);
			return mesh;
		});
		const markerMeshes = entityMarkers.map((marker) => {
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
					transparent: marker.opacity < 1,
					opacity: marker.opacity,
				}),
			);
			mesh.position.set(marker.threeX, marker.threeY, marker.threeZ);
			scene.add(mesh);
			return mesh;
		});

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
			resizeObserver?.disconnect();
			controls.dispose();
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
	}, [activeArea, cameraPreset, entityMarkers, terrainBlocks]);

	return (
		<section className="editor-panel three-d-preview">
			<div className="content-panel three-d-preview-panel">
				<div className="panel-title">3D Preview</div>
				<p className="helper-text">3D Preview is experimental and read-only.</p>
				<p className="helper-text">
					Showing terrain and entity placeholders for{" "}
					{activeArea?.name ?? "No active area"}.
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
				{mountError ? (
					<div className="validation-message">{mountError}</div>
				) : null}
			</div>
		</section>
	);
}
