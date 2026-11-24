import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { resolveAssetVariantSocket } from "../../runtime/three/threeAssetVariantPresentation";
import {
	forgetFailedThreeVisualAsset,
	requestThreeVisualAsset,
} from "../../runtime/three/threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "../../runtime/three/threeVisualAssetRegistry";
import type {
	AssetCreatorEffect,
	AssetCreatorVariant,
	AssetCreatorVector,
} from "../../types/game";
import { createAssetPreviewEffect } from "./assetPreviewEffects";

export type PreviewSettings = {
	background: "grid" | "black" | "white" | "forest" | "castle";
	skeleton: boolean;
	wireframe: boolean;
	light: "studio" | "warm" | "cool";
	ground: boolean;
	linked: boolean;
	reset: number;
};

export type PreviewRig = {
	bones: { name: string; parent?: string; rotation: AssetCreatorVector }[];
	sockets: { name: string; bone: string }[];
	nodes: string[];
};

export const EMPTY_PREVIEW_RIG: PreviewRig = {
	bones: [],
	sockets: [],
	nodes: [],
};

type AssetPreviewProps = {
	asset: ThreeVisualAssetDefinition;
	draft: AssetCreatorVariant;
	settings: PreviewSettings;
	bone: string;
	onRig: (rig: PreviewRig) => void;
	onBone?: (name: string) => void;
	clip?: THREE.AnimationClip;
	playing: boolean;
	speed: number;
	loop: boolean;
	seek: { time: number; revision: number };
	onTime: (time: number) => void;
	prop?: ThreeVisualAssetDefinition;
	effect?: AssetCreatorEffect;
	effectRestart?: number;
};

type PreviewMaterial = THREE.Material & {
	color?: THREE.Color;
	wireframe?: boolean;
};

type OwnedModel = {
	root: THREE.Object3D;
	bones: Map<string, THREE.Bone>;
	bind: Map<THREE.Bone, THREE.Quaternion>;
	sockets: Map<string, THREE.Object3D>;
	rig: PreviewRig;
	materials: { material: PreviewMaterial; color?: THREE.Color }[];
	dispose: () => void;
};

// Shared loader clones retain the canonical GLB buffers. Give the viewport its
// own buffers and texture handles so changing selections releases renderer
// allocations without invalidating a model already placed in a map.
function createPreviewResources() {
	const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
	const textures = new Map<THREE.Texture, THREE.Texture>();
	return {
		geometry(original: THREE.BufferGeometry) {
			const geometry = geometries.get(original) ?? original.clone();
			geometries.set(original, geometry);
			return geometry;
		},
		texture(original: THREE.Texture) {
			const texture = textures.get(original) ?? original.clone();
			textures.set(original, texture);
			return texture;
		},
		dispose() {
			for (const geometry of geometries.values()) geometry.dispose();
			for (const texture of textures.values()) texture.dispose();
			geometries.clear();
			textures.clear();
		},
	};
}

function createOwnedModel(
	root: THREE.Object3D,
	resources: ReturnType<typeof createPreviewResources>,
): OwnedModel {
	const bones = new Map<string, THREE.Bone>();
	const nodes = new Set<string>();
	const bind = new Map<THREE.Bone, THREE.Quaternion>();
	const copied = new Map<THREE.Material, PreviewMaterial>();
	const skin = new Set<THREE.Skeleton>();
	const ownMaterial = (original: THREE.Material) => {
		const existing = copied.get(original);
		if (existing) return existing;
		const material = original.clone() as PreviewMaterial;
		const properties = material as unknown as Record<string, unknown>;
		for (const [name, value] of Object.entries(properties)) {
			if (value instanceof THREE.Texture)
				properties[name] = resources.texture(value);
		}
		copied.set(original, material);
		return material;
	};
	root.traverse((object) => {
		if (object.name) nodes.add(object.name);
		if (object instanceof THREE.Mesh) {
			object.geometry = resources.geometry(object.geometry);
			object.material = Array.isArray(object.material)
				? object.material.map(ownMaterial)
				: ownMaterial(object.material);
		}
		if (object instanceof THREE.SkinnedMesh) skin.add(object.skeleton);
	});
	for (const skeleton of skin) {
		for (const bone of skeleton.bones) {
			bones.set(bone.name, bone);
			bind.set(bone, bone.quaternion.clone());
		}
	}
	const sockets = new Map<string, THREE.Object3D>();
	for (const name of ["right_hand", "left_hand", "head", "back"]) {
		const target = resolveAssetVariantSocket(root, name);
		if (target) sockets.set(name, target);
	}
	for (const [name, bone] of bones) {
		if (name && !sockets.has(name)) sockets.set(name, bone);
	}
	const rig = {
		nodes: Array.from(nodes),
		bones: Array.from(bones.values(), (bone) => ({
			name: bone.name,
			...(bone.parent instanceof THREE.Bone && { parent: bone.parent.name }),
			rotation: {
				x: THREE.MathUtils.radToDeg(bone.rotation.x),
				y: THREE.MathUtils.radToDeg(bone.rotation.y),
				z: THREE.MathUtils.radToDeg(bone.rotation.z),
			},
		})),
		sockets: Array.from(sockets, ([name, bone]) => ({ name, bone: bone.name })),
	};
	return {
		bind,
		bones,
		rig,
		root,
		sockets,
		materials: Array.from(copied.values(), (material) => ({
			material,
			color: material.color?.clone(),
		})),
		dispose: () => {
			root.removeFromParent();
			for (const material of copied.values()) material.dispose();
			for (const skeleton of skin) skeleton.dispose();
		},
	};
}

const BACKGROUNDS = {
	grid: 0x252b33,
	black: 0x101211,
	white: 0xe6e8e2,
	forest: 0x1b392a,
	castle: 0x3e3936,
};
const GRID_GROUND_COLOR = 0x313b48;
const LIGHTING = {
	studio: { sky: 0xe2f3ff, ground: 0x665e52, key: 0xffedce, intensity: 3.1 },
	warm: { sky: 0xffdfaf, ground: 0x775040, key: 0xffbe78, intensity: 3.8 },
	cool: { sky: 0xcbdfff, ground: 0x474d69, key: 0xc5e2ff, intensity: 2.7 },
};

function makeView(element: HTMLDivElement) {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(BACKGROUNDS.grid);
	const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 2000);
	const controls = new OrbitControls(camera, element);
	const modelGroup = new THREE.Group();
	const attachmentGroup = new THREE.Group();
	const effectStage = new THREE.Group();
	const ambient = new THREE.HemisphereLight(0xe2f3ff, 0x665e52, 2.1);
	const light = new THREE.DirectionalLight(0xffedce, 3.1);
	light.position.set(3, 5, 4);
	const fill = new THREE.DirectionalLight(0xc1d6c6, 1.2);
	fill.position.set(-4, 3, -3);
	const grid = new THREE.GridHelper(12, 24, 0x747e8c, 0x424b56);
	const gridMaterial = grid.material;
	gridMaterial.transparent = true;
	gridMaterial.opacity = 0.7;
	const ground = new THREE.Mesh(
		new THREE.PlaneGeometry(200, 200),
		new THREE.MeshStandardMaterial({ color: GRID_GROUND_COLOR, roughness: 1 }),
	);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.013;
	ground.visible = false;
	const selected = new THREE.Mesh(
		new THREE.SphereGeometry(1, 12, 8),
		new THREE.MeshBasicMaterial({ color: 0xffdf83, depthTest: false }),
	);
	selected.visible = false;
	selected.renderOrder = 20;
	scene.add(
		ambient,
		light,
		fill,
		grid,
		ground,
		modelGroup,
		attachmentGroup,
		effectStage,
		selected,
	);
	return {
		element,
		scene,
		camera,
		controls,
		modelGroup,
		effectStage,
		ambient,
		light,
		grid,
		ground,
		selected,
		model: undefined as OwnedModel | undefined,
		attachment: undefined as OwnedModel | undefined,
		attachmentGroup: new THREE.Group(),
		helper: undefined as THREE.SkeletonHelper | undefined,
		effect: undefined as
			| ReturnType<typeof createAssetPreviewEffect>
			| undefined,
	};
}
type PreviewView = ReturnType<typeof makeView>;

function fitCamera(view: PreviewView) {
	const box = new THREE.Box3().setFromObject(view.modelGroup);
	const center = box.isEmpty()
		? new THREE.Vector3(0, 0.85, 0)
		: box.getCenter(new THREE.Vector3());
	const size = Math.max(
		0.05,
		box.isEmpty() ? 1.7 : box.getSize(new THREE.Vector3()).length(),
	);
	const aspect =
		view.element.clientWidth / Math.max(1, view.element.clientHeight);
	view.controls.target.copy(center);
	view.camera.position
		.copy(center)
		.addScaledVector(
			new THREE.Vector3(0.4, 0.18, -1).normalize(),
			size * 1.85 * Math.max(1, 0.72 / (aspect || 1)),
		);
	view.camera.near = size * 0.003;
	view.camera.far = Math.max(100, size * 100);
	view.camera.updateProjectionMatrix();
	view.controls.minDistance = size * 0.14;
	view.controls.maxDistance = size * 18;
	view.controls.update();
	view.selected.scale.setScalar(size * 0.014);
	view.grid.scale.setScalar(size * 0.3);
}

function disposeModel(view: PreviewView) {
	view.attachment?.dispose();
	view.attachment = undefined;
	view.attachmentGroup.removeFromParent();
	if (view.effect) view.effectStage.add(view.effect.object);
	view.helper?.removeFromParent();
	view.helper?.dispose();
	view.helper = undefined;
	view.model?.dispose();
	view.model = undefined;
	view.selected.visible = false;
	view.element.dataset.bones = "0";
	view.element.dataset.attachment = "";
	view.element.dataset.attachmentPosition = "";
}

function syncMaterials(
	model: OwnedModel | undefined,
	tint: string | undefined,
	wireframe: boolean,
) {
	const tintColor = tint ? new THREE.Color(tint) : undefined;
	for (const { material, color } of model?.materials ?? []) {
		if (color && material.color) {
			material.color.copy(color);
			if (tintColor) material.color.multiply(tintColor);
		}
		if (material.wireframe !== undefined && material.wireframe !== wireframe) {
			material.wireframe = wireframe;
			material.needsUpdate = true;
		}
	}
}

function applyPose(view: PreviewView, pose: AssetCreatorVariant["pose"]) {
	for (const [bone, bind] of view.model?.bind ?? []) {
		const rotation =
			Object.getOwnPropertyDescriptor(pose, bone.name) !== undefined
				? pose[bone.name]
				: undefined;
		if (rotation)
			bone.rotation.set(
				THREE.MathUtils.degToRad(rotation.x),
				THREE.MathUtils.degToRad(rotation.y),
				THREE.MathUtils.degToRad(rotation.z),
			);
		else bone.quaternion.copy(bind);
	}
}

function syncView(
	view: PreviewView,
	{ asset, draft, settings, effect, prop }: AssetPreviewProps,
) {
	(view.scene.background as THREE.Color).setHex(
		BACKGROUNDS[settings.background],
	);
	const lighting = LIGHTING[settings.light];
	view.ambient.color.setHex(lighting.sky);
	view.ambient.groundColor.setHex(lighting.ground);
	view.light.color.setHex(lighting.key);
	view.light.intensity = lighting.intensity;
	view.ground.visible = settings.ground;
	view.grid.visible = settings.ground && settings.background === "grid";
	view.ground.material.color.setHex(
		settings.background === "grid"
			? GRID_GROUND_COLOR
			: BACKGROUNDS[settings.background],
	);
	view.modelGroup.scale.setScalar((asset.defaultScale ?? 1) * draft.scale);
	if (view.helper) view.helper.visible = settings.skeleton;
	syncMaterials(view.model, draft.tint, settings.wireframe);
	if (view.attachment && draft.attachment) {
		const { socket, position, rotation, scale } = draft.attachment;
		const target = view.model?.sockets.get(socket);
		if (target && view.attachmentGroup.parent !== target)
			target.add(view.attachmentGroup);
		if (!target) view.attachmentGroup.removeFromParent();
		view.attachmentGroup.position.set(position.x, position.y, position.z);
		view.attachmentGroup.rotation.set(
			THREE.MathUtils.degToRad(rotation.x),
			THREE.MathUtils.degToRad(rotation.y + (prop?.defaultRotationOffset ?? 0)),
			THREE.MathUtils.degToRad(rotation.z),
		);
		view.attachmentGroup.scale.setScalar(scale * (prop?.defaultScale ?? 1));
		view.element.dataset.attachment = target?.name ?? "";
		syncMaterials(view.attachment, prop?.variant?.tint, settings.wireframe);
	}
	if (view.effect) {
		const target = effect?.socket
			? view.model?.sockets.get(effect.socket)
			: view.effectStage;
		if (target && view.effect.object.parent !== target)
			target.add(view.effect.object);
		if (!target) view.effect.object.removeFromParent();
	}
}

function syncPick(
	view: PreviewView,
	element: HTMLDivElement,
	onBone: (name: string) => void,
) {
	let start: { x: number; y: number } | undefined;
	const pointerDown = (event: PointerEvent) => {
		start =
			event.button === 0 ? { x: event.clientX, y: event.clientY } : undefined;
	};
	const pointerUp = (event: PointerEvent) => {
		if (
			!start ||
			event.button !== 0 ||
			!view.helper?.visible ||
			Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
		)
			return;
		const rect = element.getBoundingClientRect();
		const position = new THREE.Vector3();
		let closest = 11;
		let selected = "";
		for (const [name, bone] of view.model?.bones ?? []) {
			bone.getWorldPosition(position).project(view.camera);
			if (position.z < -1 || position.z > 1) continue;
			const x = rect.left + ((position.x + 1) * rect.width) / 2;
			const y = rect.top + ((1 - position.y) * rect.height) / 2;
			const distance = Math.hypot(event.clientX - x, event.clientY - y);
			if (distance < closest) {
				closest = distance;
				selected = name;
			}
		}
		if (selected) onBone(selected);
	};
	element.addEventListener("pointerdown", pointerDown);
	element.addEventListener("pointerup", pointerUp);
	return () => {
		element.removeEventListener("pointerdown", pointerDown);
		element.removeEventListener("pointerup", pointerUp);
	};
}

type PreviewScene = {
	views: [PreviewView, PreviewView];
	dirty: boolean;
	time: number;
	effectTime: number;
	mixer?: THREE.AnimationMixer;
	action?: THREE.AnimationAction;
};

function stopClip(scene: PreviewScene) {
	scene.mixer?.stopAllAction();
	if (scene.mixer) scene.mixer.uncacheRoot(scene.mixer.getRoot());
	scene.mixer = undefined;
	scene.action = undefined;
	scene.time = 0;
}

function canPlayClip(clip: THREE.AnimationClip, model: OwnedModel) {
	const nodes = new Set(model.rig.nodes);
	return clip.tracks.every((track) => {
		const { nodeName, objectName, objectIndex } =
			THREE.PropertyBinding.parseTrackName(track.name);
		if (objectName === "bones" && !model.bones.has(objectIndex)) return false;
		return !nodeName || nodeName === model.root.uuid || nodes.has(nodeName);
	});
}

export function AssetPreview(props: AssetPreviewProps) {
	const host = useRef<HTMLDivElement>(null);
	const reference = useRef<HTMLDivElement>(null);
	const animation = useRef<HTMLDivElement>(null);
	const scene = useRef<PreviewScene | undefined>(undefined);
	const latest = useRef(props);
	const [attempt, setAttempt] = useState(0);
	const [contextAttempt, setContextAttempt] = useState(0);
	const [status, setStatus] = useState("loading");
	const [attachmentStatus, setAttachmentStatus] = useState("");
	latest.current = props;
	const {
		asset,
		prop,
		effect,
		effectRestart,
		draft,
		settings,
		clip,
		bone,
		seek,
	} = props;
	const assetId = asset.id;
	const assetUrl = asset.url;
	const propId = prop?.id;
	const propUrl = prop?.url;

	useLayoutEffect(() => {
		void contextAttempt;
		if (!host.current || !reference.current || !animation.current) return;
		const element = host.current;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		} catch {
			setStatus("unavailable");
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.03;
		renderer.setClearColor(0x000000, 0);
		renderer.domElement.setAttribute(
			"aria-label",
			"Reference and animation 3D previews",
		);
		Object.assign(renderer.domElement.style, {
			position: "absolute",
			inset: "0",
			width: "100%",
			height: "100%",
			pointerEvents: "none",
		});
		element.prepend(renderer.domElement);
		const views: PreviewScene["views"] = [
			makeView(reference.current),
			makeView(animation.current),
		];
		const state: PreviewScene = { views, dirty: true, effectTime: 0, time: 0 };
		scene.current = state;
		let syncing = false;
		function syncCamera(source: PreviewView, target: PreviewView) {
			state.dirty = true;
			if (syncing || !latest.current.settings.linked) return;
			syncing = true;
			target.camera.position.copy(source.camera.position);
			target.controls.target.copy(source.controls.target);
			target.controls.update();
			syncing = false;
		}
		const referenceChange = () => syncCamera(views[0], views[1]);
		const animationChange = () => syncCamera(views[1], views[0]);
		views[0].controls.addEventListener("change", referenceChange);
		views[1].controls.addEventListener("change", animationChange);
		const removePick = syncPick(views[0], reference.current, (name) =>
			latest.current.onBone?.(name),
		);
		for (const view of views) fitCamera(view);
		let width = 0;
		let height = 0;
		const observer = new ResizeObserver(() => {
			state.dirty = true;
		});
		observer.observe(element);
		const contextRestored = () => {
			state.dirty = true;
		};
		renderer.domElement.addEventListener(
			"webglcontextrestored",
			contextRestored,
		);
		let frame = 0;
		let lastFrame = 0;
		let lastNotify = 0;
		const attachmentPosition = new THREE.Vector3();
		function draw(now: number) {
			frame = requestAnimationFrame(draw);
			const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
			lastFrame = now;
			const {
				playing,
				speed,
				loop,
				bone: boneName,
				settings,
				onTime,
			} = latest.current;
			const duration = state.action?.getClip().duration ?? 0;
			if (playing && duration > 0 && (loop || state.time < duration)) {
				state.time = loop
					? (state.time + delta * speed) % duration
					: Math.min(duration, state.time + delta * speed);
				state.dirty = true;
				if (now - lastNotify > 50 || state.time === duration) {
					lastNotify = now;
					onTime(state.time);
				}
			}
			if (views[0].effect || views[1].effect) {
				state.effectTime += delta;
				state.dirty = true;
			}
			if (!state.dirty) return;
			state.dirty = false;
			if (state.action && state.mixer) {
				state.action.time = state.time;
				state.mixer.update(0);
			}
			const bounds = element.getBoundingClientRect();
			if (width !== bounds.width || height !== bounds.height) {
				width = bounds.width;
				height = bounds.height;
				renderer.setSize(width, height, false);
			}
			renderer.setScissorTest(false);
			renderer.clear();
			renderer.setScissorTest(true);
			for (const view of views) {
				const rect = view.element.getBoundingClientRect();
				if (!rect.width || !rect.height) continue;
				view.camera.aspect = rect.width / rect.height;
				view.camera.updateProjectionMatrix();
				const selected = view.model?.bones.get(boneName);
				view.selected.visible = Boolean(selected && settings.skeleton);
				selected?.getWorldPosition(view.selected.position);
				view.effect?.update(state.effectTime);
				if (view.attachmentGroup.parent) {
					view.attachmentGroup.getWorldPosition(attachmentPosition);
					view.element.dataset.attachmentPosition = attachmentPosition
						.toArray()
						.map((coordinate) => coordinate.toFixed(4))
						.join(",");
				} else view.element.dataset.attachmentPosition = "";
				view.element.dataset.time =
					view === views[1] ? state.time.toFixed(3) : "0";
				view.element.dataset.camera = view.camera.position
					.toArray()
					.map((coordinate) => coordinate.toFixed(4))
					.join(",");
				const area = [
					rect.left - bounds.left,
					bounds.bottom - rect.bottom,
					rect.width,
					rect.height,
				] as const;
				renderer.setViewport(...area);
				renderer.setScissor(...area);
				renderer.render(view.scene, view.camera);
			}
			element.dataset.previewGeometries = String(
				renderer.info.memory.geometries,
			);
			element.dataset.previewTextures = String(renderer.info.memory.textures);
		}
		frame = requestAnimationFrame(draw);
		return () => {
			scene.current = undefined;
			cancelAnimationFrame(frame);
			observer.disconnect();
			renderer.domElement.removeEventListener(
				"webglcontextrestored",
				contextRestored,
			);
			removePick();
			stopClip(state);
			for (const view of views) {
				disposeModel(view);
				view.effect?.dispose();
				view.effect = undefined;
				view.controls.dispose();
				view.grid.dispose();
				view.ground.geometry.dispose();
				view.ground.material.dispose();
				view.selected.geometry.dispose();
				view.selected.material.dispose();
			}
			renderer.dispose();
			renderer.forceContextLoss();
			renderer.domElement.remove();
		};
	}, [contextAttempt]);

	// The asset ID and artifact URL are the load identity. Draft edits reuse these clones.
	// biome-ignore lint/correctness/useExhaustiveDependencies: read the current definition and callbacks through the ref
	useEffect(() => {
		const state = scene.current;
		if (!state) return;
		let cancelled = false;
		const resources = createPreviewResources();
		setStatus("loading");
		latest.current.onRig(EMPTY_PREVIEW_RIG);
		function load() {
			if (!state || cancelled) return;
			const { asset, draft } = latest.current;
			for (const view of state.views) {
				const result = requestThreeVisualAsset(asset, {
					onStateChange: view === state.views[0] ? load : undefined,
				});
				if (result.status === "loading") return;
				if (result.status !== "loaded") {
					setStatus(result.status);
					return;
				}
				const { object, analysis } = result;
				view.model = createOwnedModel(object, resources);
				view.modelGroup.rotation.y = THREE.MathUtils.degToRad(
					asset.defaultRotationOffset ?? 0,
				);
				view.modelGroup.scale.setScalar(
					(asset.defaultScale ?? 1) * draft.scale,
				);
				object.position.y -= analysis.bounds.minY;
				view.modelGroup.add(object);
				if (view.model.bones.size) {
					view.helper = new THREE.SkeletonHelper(object);
					for (const material of [view.helper.material].flat()) {
						material.depthTest = false;
						material.transparent = true;
					}
					view.helper.renderOrder = 10;
					view.scene.add(view.helper);
				}
				view.element.dataset.bones = String(view.model.bones.size);
				syncView(view, latest.current);
				fitCamera(view);
			}
			latest.current.onRig(state.views[0].model?.rig ?? EMPTY_PREVIEW_RIG);
			state.dirty = true;
			setStatus("loaded");
		}
		load();
		return () => {
			cancelled = true;
			stopClip(state);
			for (const view of state.views) disposeModel(view);
			resources.dispose();
			state.dirty = true;
		};
	}, [assetId, assetUrl, attempt, contextAttempt]);

	// Asset swaps rerun attachment loading once the new socket hierarchy exists.
	// biome-ignore lint/correctness/useExhaustiveDependencies: artifact identity is the load dependency
	useEffect(() => {
		const state = scene.current;
		if (!state) return;
		let cancelled = false;
		const resources = createPreviewResources();
		setAttachmentStatus("");
		function load() {
			const prop = latest.current.prop;
			if (!state || !prop || cancelled || !state.views[0].model) return;
			for (const view of state.views) {
				const result = requestThreeVisualAsset(prop, {
					onStateChange: view === state.views[0] ? load : undefined,
				});
				if (result.status === "loading") {
					setAttachmentStatus("Loading attachment…");
					return;
				}
				if (result.status !== "loaded") {
					setAttachmentStatus("Attachment file could not be loaded.");
					return;
				}
				view.attachment = createOwnedModel(result.object, resources);
				view.attachmentGroup.add(view.attachment.root);
				syncView(view, latest.current);
			}
			setAttachmentStatus("");
			state.dirty = true;
		}
		load();
		return () => {
			cancelled = true;
			for (const view of state.views) {
				view.attachment?.dispose();
				view.attachment = undefined;
				view.attachmentGroup.removeFromParent();
				view.element.dataset.attachment = "";
			}
			resources.dispose();
			state.dirty = true;
		};
	}, [status, assetId, assetUrl, propId, propUrl, attempt]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restart is an explicit effect replay command
	useEffect(() => {
		const state = scene.current;
		if (!state || !effect) return;
		for (const view of state.views) {
			view.effect = createAssetPreviewEffect(effect);
			syncView(view, latest.current);
		}
		state.effectTime = 0;
		state.dirty = true;
		return () => {
			for (const view of state.views) {
				view.effect?.dispose();
				view.effect = undefined;
			}
			state.dirty = true;
		};
	}, [effect, effectRestart]);

	// Reapply presentation after model load and whenever an inspector setting changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the ref avoids invalidating on playback time callbacks
	useLayoutEffect(() => {
		const state = scene.current;
		if (!state) return;
		for (const view of state.views) syncView(view, latest.current);
		applyPose(state.views[0], draft.pose);
		if (!state.action) applyPose(state.views[1], draft.pose);
		state.dirty = true;
	}, [assetId, draft, settings, bone, status]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the reset counter is an explicit camera command
	useLayoutEffect(() => {
		const state = scene.current;
		if (!state) return;
		for (const view of state.views) fitCamera(view);
		state.dirty = true;
	}, [settings.reset]);

	useLayoutEffect(() => {
		const state = scene.current;
		if (!state || !settings.linked) return;
		const [left, right] = state.views;
		right.camera.position.copy(left.camera.position);
		right.controls.target.copy(left.controls.target);
		right.controls.update();
		state.dirty = true;
	}, [settings.linked]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: rebuild the mixer when the bound artifact changes
	useEffect(() => {
		const state = scene.current;
		const view = state?.views[1];
		if (!state || !view?.model) return;
		stopClip(state);
		if (clip && clip.duration > 0 && canPlayClip(clip, view.model)) {
			applyPose(view, {});
			const mixer = new THREE.AnimationMixer(view.model.root);
			const action = mixer.clipAction(clip);
			action.setLoop(THREE.LoopOnce, 0);
			action.clampWhenFinished = true;
			action.play();
			action.paused = true;
			state.action = action;
			state.mixer = mixer;
			state.time = THREE.MathUtils.clamp(
				latest.current.seek.time,
				0,
				clip.duration,
			);
		} else applyPose(view, latest.current.draft.pose);
		state.dirty = true;
		return () => stopClip(state);
	}, [assetId, assetUrl, clip, status]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reapply a seek command even when its time repeats
	useEffect(() => {
		const state = scene.current;
		if (!state?.action) return;
		state.time = THREE.MathUtils.clamp(
			seek.time,
			0,
			state.action.getClip().duration,
		);
		state.dirty = true;
	}, [seek.time, seek.revision]);

	const message =
		status === "loading"
			? "Loading model…"
			: status === "unavailable"
				? "WebGL is unavailable in this browser."
				: status !== "loaded"
					? "Model file could not be loaded."
					: "";
	return (
		<div className="asset-preview" ref={host}>
			<div
				className="asset-preview-view"
				data-preview="reference"
				data-model-status={status}
				ref={reference}
			>
				<span className="asset-preview-label">Reference pose</span>
				<span className="asset-preview-caption">
					{settings.skeleton
						? "Select a bone on the model or in the inspector"
						: "Drag to orbit · scroll to zoom · right-drag to pan"}
				</span>
			</div>
			<div
				className="asset-preview-view"
				data-preview="animation"
				data-model-status={status}
				ref={animation}
			>
				<span className="asset-preview-label">Animation preview</span>
				<span className="asset-preview-caption">
					{clip
						? `${props.playing ? "Playing" : "Paused"} · ${clip.name}`
						: "Reference pose · no animation selected"}
				</span>
			</div>
			{(message || attachmentStatus) && (
				<div className="asset-preview-message" role="status">
					{message || attachmentStatus}
					{(status === "error" ||
						status === "unavailable" ||
						attachmentStatus.startsWith("Attachment file")) && (
						<button
							type="button"
							onClick={() => {
								forgetFailedThreeVisualAsset(asset.id || asset.url);
								if (prop) forgetFailedThreeVisualAsset(prop.id || prop.url);
								if (status === "unavailable")
									setContextAttempt((value) => value + 1);
								setAttempt((value) => value + 1);
							}}
						>
							Retry preview
						</button>
					)}
				</div>
			)}
		</div>
	);
}
