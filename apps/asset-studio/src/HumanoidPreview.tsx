import {
	disposeThreeVisualAssetCacheEntry,
	GOLDEN_REFERENCE_IDLE_BAKED_ASSET,
	GOLDEN_REFERENCE_WALK_BAKED_ASSET,
	requestThreeVisualAsset,
	requestThreeVisualAssetAnimationClip,
	type ThreeVisualAssetAnalysis,
	type ThreeVisualAssetDefinition,
} from "@adventure-game-builder/three-asset-preview";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MANNEQUIN_ARTIFACT_ROOT, type PreviewSource } from "./previewSources";
import type { ProceduralMannequinManifest } from "./proceduralMannequinCreator";

const RETARGET_ARTIFACT_ROOT =
	"/assets/derived/humanoid-animations/golden-reference-v0";

// This component owns the entire preview lifetime, including animation and disposal.
type PreviewAnimationState = "idle" | "rest" | "walk";
type PreviewCameraPreset =
	| "full-body"
	| "upper-body"
	| "face"
	| "back"
	| "close-front"
	| "close-three-quarter"
	| "front"
	| "right-side"
	| "scalp"
	| "side"
	| "three-quarter"
	| "three-quarter-rear";
const PREVIEW_CAMERA_LABELS: Record<PreviewCameraPreset, string> = {
	"full-body": "Full Body",
	"upper-body": "Upper Body",
	face: "Face",
	back: "Back",
	"close-front": "Close front",
	"close-three-quarter": "Close three-quarter",
	front: "Front",
	"right-side": "Right side",
	scalp: "Scalp",
	side: "Side",
	"three-quarter": "Three-quarter",
	"three-quarter-rear": "Three-quarter rear",
};
type RetargetQualitySummary = {
	finiteTransforms: boolean;
	maxBoneLengthRelativeError: number;
	maxBoundingSpanRelativeToRestHeight: number;
	maxClavicleRestRotationDegrees: number;
	maxIdleSymmetryError: number;
	maxRootHorizontalDisplacement: number;
	passed: boolean;
};
type RuntimeRetargetReport = {
	artifactStatus: string;
	boneMapVersion: string;
	idle: {
		clip: { duration: number };
		profile: { boneMap: Record<string, string>; transformPolicy: string };
		quality: { summary: RetargetQualitySummary };
		rootMotion: { policy: string };
	};
	provenance: { provider: string };
	walk: {
		clip: { duration: number };
		quality: { summary: RetargetQualitySummary };
		rootMotion: { policy: string };
	};
	idleComparison: {
		semanticMatches: unknown[];
		unmatchedSourceBones: string[];
		unmatchedTargetBones: string[];
	};
	legacyFailedBaseline: {
		idleQuality: RetargetQualitySummary;
		walkQuality: RetargetQualitySummary;
	};
};
type OfflineBakeMetadata = {
	clipId: "idle" | "walk";
	clipName: string;
	compilerVersion: string;
	durationSeconds: number;
	mappedBoneCount: number;
	outputPath: string;
	profileVersion: string;
	rootMotion: { policy: string };
	warnings: string[];
};
type OfflineBakeRoundTripReport = {
	passed: boolean;
	profileVersion: string;
	idle: { passed: boolean; poseComparison: { passed: boolean } };
	walk: { passed: boolean; poseComparison: { passed: boolean } };
};
type OfflineBakeBundle = {
	idle: OfflineBakeMetadata;
	walk: OfflineBakeMetadata;
	roundTrip: OfflineBakeRoundTripReport;
};
const RETARGET_DIAGNOSTIC_JOINTS = [
	"pelvis",
	"spine_03",
	"neck_01",
	"Head",
	"clavicle_l",
	"clavicle_r",
	"upperarm_l",
	"upperarm_r",
	"lowerarm_l",
	"lowerarm_r",
	"hand_l",
	"hand_r",
	"thigh_l",
	"thigh_r",
	"calf_l",
	"calf_r",
	"foot_l",
	"foot_r",
] as const;

function loadRegisteredAnimationClip(
	definition: ThreeVisualAssetDefinition,
	clipName: string,
): Promise<THREE.AnimationClip> {
	return new Promise((resolve, reject) => {
		const check = () => {
			const result = requestThreeVisualAssetAnimationClip(
				definition,
				clipName,
				{ onStateChange: check },
			);
			if (result.status === "loaded") resolve(result.clip);
			else if (result.status === "error") reject(result.error);
			else if (result.status === "missing_clip")
				reject(
					new Error(
						`${definition.id} does not contain the required ${clipName} clip.`,
					),
				);
		};
		check();
	});
}

export function HumanoidPreview({
	onManifestLoaded,
	source,
}: {
	onManifestLoaded?: (manifest: ProceduralMannequinManifest) => void;
	source: PreviewSource;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const hostRef = useRef<HTMLDivElement>(null);
	const resetViewRef = useRef<() => void>(() => undefined);
	const setCameraPresetRef = useRef<(preset: PreviewCameraPreset) => void>(
		() => undefined,
	);
	const seekAnimationRef = useRef<(normalizedTime: number) => void>(
		() => undefined,
	);
	const [status, setStatus] = useState<"loading" | "loaded" | "error">(
		"loading",
	);
	const [analysis, setAnalysis] = useState<ThreeVisualAssetAnalysis>();
	const [error, setError] = useState("");
	const [canResetView, setCanResetView] = useState(false);
	const [animationState, setAnimationState] =
		useState<PreviewAnimationState>("rest");
	const [animationPlaying, setAnimationPlaying] = useState(true);
	const [animationSample, setAnimationSample] = useState(0);
	const [cameraPreset, setCameraPreset] =
		useState<PreviewCameraPreset>("three-quarter");
	const [clipStatus, setClipStatus] = useState<"loading" | "loaded" | "error">(
		"loading",
	);
	const [retargetReport, setRetargetReport] = useState<RuntimeRetargetReport>();
	const [offlineBake, setOfflineBake] = useState<OfflineBakeBundle>();
	const [mannequinManifest, setMannequinManifest] =
		useState<ProceduralMannequinManifest>();
	const isMannequin = source.mannequin;
	const animationPlayingRef = useRef(animationPlaying);
	const applyAnimationStateRef = useRef<(state: PreviewAnimationState) => void>(
		() => undefined,
	);
	useEffect(() => {
		animationPlayingRef.current = animationPlaying;
	}, [animationPlaying]);
	useEffect(() => {
		applyAnimationStateRef.current(animationState);
	}, [animationState]);
	useEffect(() => {
		seekAnimationRef.current(animationSample);
	}, [animationSample]);
	useEffect(() => {
		const canvas = canvasRef.current,
			host = hostRef.current;
		if (!canvas || !host || typeof WebGLRenderingContext === "undefined")
			return;
		setStatus("loading");
		setAnalysis(undefined);
		setError("");
		setCanResetView(false);
		setAnimationState("rest");
		setAnimationSample(0);
		setClipStatus("loading");
		setRetargetReport(undefined);
		setOfflineBake(undefined);
		setMannequinManifest(undefined);
		host.dataset.previewRevision = source.revision;
		let disposed = false,
			frame = 0;
		let activeClone: THREE.Group | undefined;
		let animationRoot: THREE.Object3D | undefined;
		let animationMixer: THREE.AnimationMixer | undefined;
		let activeAction: THREE.AnimationAction | undefined;
		let activeState: PreviewAnimationState = "rest";
		let restBoundsSize: THREE.Vector3 | undefined;
		let restBoundsDiagonal: number | undefined;
		const animationClips = new Map<
			PreviewAnimationState,
			THREE.AnimationClip
		>();
		const clock = new THREE.Clock();
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
		} catch (renderError) {
			setStatus("error");
			setError(
				renderError instanceof Error
					? renderError.message
					: "WebGL unavailable.",
			);
			return;
		}
		renderer.setClearColor(0xf6f8fb, 1);
		renderer.shadowMap.enabled = true;
		const scene = new THREE.Scene(),
			camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.enablePan = false;
		controls.minPolarAngle = 0.2;
		controls.maxPolarAngle = Math.PI / 2.05;
		controls.rotateSpeed = 0.7;
		controls.zoomSpeed = 0.8;
		let initialCameraPosition: THREE.Vector3 | undefined;
		let initialCameraTarget: THREE.Vector3 | undefined;
		const updateCameraMetadata = () => {
			host.dataset.cameraPosition = camera.position
				.toArray()
				.map((value) => value.toFixed(3))
				.join(",");
		};
		controls.addEventListener("change", updateCameraMetadata);
		scene.add(new THREE.HemisphereLight(0xffffff, 0xaab7c4, 1.8));
		const key = new THREE.DirectionalLight(0xffffff, 2.1);
		key.position.set(3, 5, source.authoredHuman ? -4 : 4);
		if (source.authoredHuman) {
			const fill = new THREE.DirectionalLight(0xffffff, 1.1);
			fill.position.set(-3, 2, -2);
			scene.add(fill);
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
		}
		key.castShadow = true;
		const grid = new THREE.GridHelper(4, 16, 0x94a3b8, 0xd3dae2);
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(8, 8),
			new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.9 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(key, grid, ground);
		const resize = () => {
			const width = Math.max(1, host.clientWidth),
				height = Math.max(1, host.clientHeight);
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		};
		const updateAnimationMetadata = (measureBounds = false) => {
			animationRoot?.updateMatrixWorld(true);
			host.dataset.animationState = activeState;
			host.dataset.animationPlaying = String(animationPlayingRef.current);
			host.dataset.animationTime = (activeAction?.time ?? 0).toFixed(4);
			const pose = ["pelvis", "spine_03", "Head", "hand_l", "foot_l"]
				.map((name) => animationRoot?.getObjectByName(name)?.quaternion)
				.filter((quaternion): quaternion is THREE.Quaternion =>
					Boolean(quaternion),
				)
				.flatMap((quaternion) => quaternion.toArray())
				.map((value) => value.toFixed(4))
				.join(",");
			host.dataset.poseSnapshot = pose;
			const pelvisWorld = animationRoot
				?.getObjectByName("pelvis")
				?.getWorldPosition(new THREE.Vector3());
			host.dataset.pelvisHorizontal = pelvisWorld
				? `${pelvisWorld.x.toFixed(5)},${pelvisWorld.z.toFixed(5)}`
				: "";
			const jointDiagnostics = Object.fromEntries(
				RETARGET_DIAGNOSTIC_JOINTS.map((name) => {
					const bone = animationRoot?.getObjectByName(name);
					return [
						name,
						bone
							? {
									position: bone
										.getWorldPosition(new THREE.Vector3())
										.toArray()
										.map((value) => Number(value.toFixed(6))),
									rotation: bone
										.getWorldQuaternion(new THREE.Quaternion())
										.toArray()
										.map((value) => Number(value.toFixed(6))),
								}
							: undefined,
					];
				}),
			);
			host.dataset.jointDiagnostics = JSON.stringify(jointDiagnostics);
			if (measureBounds && animationRoot && restBoundsSize) {
				const animatedSize = new THREE.Box3()
					.setFromObject(animationRoot, true)
					.getSize(new THREE.Vector3());
				const expansion = animatedSize
					.clone()
					.divide(restBoundsSize)
					.toArray()
					.map((value) => Number(value.toFixed(6)));
				const diagonalExpansion = restBoundsDiagonal
					? animatedSize.length() / restBoundsDiagonal
					: Number.NaN;
				const heightExpansion = expansion[1];
				host.dataset.boundsExpansion = expansion.join(",");
				host.dataset.boundsOverallExpansion = diagonalExpansion.toFixed(6);
				host.dataset.meshInvariantPassed = String(
					expansion.every(Number.isFinite) &&
						Number.isFinite(diagonalExpansion) &&
						diagonalExpansion >= 0.65 &&
						diagonalExpansion <= 1.5 &&
						heightExpansion >= 0.7 &&
						heightExpansion <= 1.3,
				);
			}
		};
		const restoreRestPose = () => {
			animationMixer?.stopAllAction();
			activeAction = undefined;
			const skeletons = new Set<THREE.Skeleton>();
			animationRoot?.traverse((object) => {
				if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
			});
			for (const skeleton of skeletons) skeleton.pose();
			animationRoot?.updateMatrixWorld(true);
		};
		const applyAnimationState = (state: PreviewAnimationState) => {
			activeState = state;
			if (!animationMixer || state === "rest") {
				restoreRestPose();
				updateAnimationMetadata(true);
				return;
			}
			const clip = animationClips.get(state);
			if (!clip) return;
			activeAction?.stop();
			const nextAction = animationMixer.clipAction(clip);
			nextAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();
			activeAction = nextAction;
			animationMixer.setTime(0);
			updateAnimationMetadata(true);
		};
		applyAnimationStateRef.current = applyAnimationState;
		seekAnimationRef.current = (normalizedTime) => {
			if (!animationMixer || !activeAction) return;
			const clip = activeAction.getClip();
			animationMixer.setTime(
				clip.duration * THREE.MathUtils.clamp(normalizedTime, 0, 0.999999),
			);
			updateAnimationMetadata(true);
		};
		const render = () => {
			const deltaSeconds = Math.min(clock.getDelta(), 0.1);
			if (animationPlayingRef.current) animationMixer?.update(deltaSeconds);
			updateAnimationMetadata();
			controls.update();
			renderer.render(scene, camera);
			frame = window.requestAnimationFrame(render);
		};
		const mountAsset = () => {
			const result = requestThreeVisualAsset(source.definition, {
				onStateChange: mountAsset,
			});
			if (disposed || result.status === "loading") return;
			if (result.status === "error" || result.status === "missing") {
				setStatus("error");
				setError(
					result.status === "error" ? String(result.error) : "Fixture missing.",
				);
				return;
			}
			activeClone?.removeFromParent();
			const group = new THREE.Group();
			group.name = `${source.definition.id}Preview`;
			group.rotation.y = THREE.MathUtils.degToRad(
				result.definition.defaultRotationOffset ?? 0,
			);
			group.scale.setScalar(result.definition.defaultScale ?? 1);
			result.object.position.y = -result.analysis.bounds.minY;
			result.object.traverse((object) => {
				if (object instanceof THREE.Mesh) {
					object.castShadow = result.definition.castShadow ?? false;
					object.receiveShadow = result.definition.receiveShadow ?? false;
				}
			});
			group.add(result.object);
			scene.add(group);
			activeClone = group;
			animationRoot = result.object;
			animationMixer?.stopAllAction();
			if (animationRoot)
				animationMixer = new THREE.AnimationMixer(animationRoot);
			// Evaluate the skinned surface, including its exported root height scale.
			const bounds = new THREE.Box3().setFromObject(group, true),
				center = bounds.getCenter(new THREE.Vector3()),
				radius = Math.max(
					bounds.getSize(new THREE.Vector3()).length() / 2,
					0.8,
				);
			controls.minDistance = radius * 0.22;
			controls.maxDistance = radius * 3.5;
			setCameraPresetRef.current = (preset) => {
				const closeView =
					preset === "close-front" ||
					preset === "close-three-quarter" ||
					preset === "face";
				const target = new THREE.Vector3(
					center.x,
					preset === "scalp" || closeView
						? bounds.max.y -
								(preset === "face"
									? (bounds.max.y - bounds.min.y) * 0.095
									: radius * 0.08)
						: preset === "upper-body"
							? bounds.max.y - (bounds.max.y - bounds.min.y) * 0.23
							: Math.max(center.y, 0.8),
					center.z,
				);
				const offsets: Record<PreviewCameraPreset, THREE.Vector3> = {
					"full-body": new THREE.Vector3(0, radius * 0.08, -radius * 2.45),
					"upper-body": new THREE.Vector3(0, radius * 0.04, -radius * 1.45),
					face: new THREE.Vector3(0, 0, -radius * 0.58),
					back: new THREE.Vector3(0, radius * 0.08, radius * 2.45),
					"close-front": new THREE.Vector3(0, radius * 0.02, -radius * 0.88),
					"close-three-quarter": new THREE.Vector3(
						radius * 0.62,
						radius * 0.12,
						-radius * 0.62,
					),
					front: new THREE.Vector3(0, radius * 0.08, -radius * 2.45),
					"right-side": new THREE.Vector3(-radius * 2.45, radius * 0.08, 0),
					scalp: new THREE.Vector3(
						radius * 0.72,
						radius * 0.82,
						-radius * 0.72,
					),
					side: new THREE.Vector3(radius * 2.45, radius * 0.08, 0),
					"three-quarter": new THREE.Vector3(
						radius * 1.7,
						radius * 0.28,
						-radius * 1.7,
					),
					"three-quarter-rear": new THREE.Vector3(
						radius * 1.7,
						radius * 0.28,
						radius * 1.7,
					),
				};
				const offset = offsets[preset];
				const damping = controls.enableDamping;
				controls.enableDamping = false;
				camera.position.copy(target).add(offset);
				controls.target.copy(target);
				controls.update();
				controls.enableDamping = damping;
				host.dataset.cameraPreset = preset;
				updateCameraMetadata();
			};
			setCameraPresetRef.current("three-quarter");
			initialCameraPosition = camera.position.clone();
			initialCameraTarget = controls.target.clone();
			controls.saveState();
			resetViewRef.current = () => {
				if (!initialCameraPosition || !initialCameraTarget) return;
				setCameraPresetRef.current("three-quarter");
			};
			restoreRestPose();
			restBoundsSize = new THREE.Box3()
				.setFromObject(animationRoot, true)
				.getSize(new THREE.Vector3());
			restBoundsDiagonal = restBoundsSize.length();
			updateCameraMetadata();
			setCanResetView(true);
			setAnalysis(result.analysis);
			setStatus("loaded");
			applyAnimationState(activeState);
		};
		const requestedMode = new URLSearchParams(window.location.search).get(
			"retarget",
		);
		const failedBaseline = !isMannequin && requestedMode === "failed-v1";
		const runtimeV2 = !isMannequin && requestedMode === "runtime-v2";
		const offlineBaked = !failedBaseline && !runtimeV2;
		host.dataset.retargetMode = failedBaseline
			? "failed-v1"
			: runtimeV2
				? "runtime-v2"
				: "offline-baked";
		host.dataset.playbackMethod = offlineBaked
			? "Offline baked"
			: "Runtime retarget diagnostic";
		const fetchJson = async <Result,>(url: string): Promise<Result> => {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`${url} HTTP ${response.status}.`);
			return response.json() as Promise<Result>;
		};
		const runtimeClip = (url: string) =>
			fetchJson<ReturnType<typeof THREE.AnimationClip.toJSON>>(url).then(
				(json) => THREE.AnimationClip.parse(json),
			);
		const idleClipPromise = offlineBaked
			? loadRegisteredAnimationClip(
					GOLDEN_REFERENCE_IDLE_BAKED_ASSET,
					"GoldenReference_Idle",
				)
			: runtimeClip(
					failedBaseline
						? `${RETARGET_ARTIFACT_ROOT}/diagnostics/failed-v1-idle.json`
						: `${RETARGET_ARTIFACT_ROOT}/idle.runtime-retarget.json`,
				);
		const walkClipPromise = offlineBaked
			? loadRegisteredAnimationClip(
					GOLDEN_REFERENCE_WALK_BAKED_ASSET,
					"GoldenReference_Walk_InPlace",
				)
			: runtimeClip(
					failedBaseline
						? `${RETARGET_ARTIFACT_ROOT}/diagnostics/failed-v1-walk.json`
						: `${RETARGET_ARTIFACT_ROOT}/walk-in-place.runtime-retarget.json`,
				);
		const offlineBakePromise = offlineBaked
			? Promise.all([
					fetchJson<OfflineBakeMetadata>(
						`${RETARGET_ARTIFACT_ROOT}/idle.bake-metadata.json`,
					),
					fetchJson<OfflineBakeMetadata>(
						`${RETARGET_ARTIFACT_ROOT}/walk.bake-metadata.json`,
					),
					fetchJson<OfflineBakeRoundTripReport>(
						`${RETARGET_ARTIFACT_ROOT}/offline-bake-roundtrip-report.json`,
					),
				]).then(([idle, walk, roundTrip]) => ({ idle, roundTrip, walk }))
			: Promise.resolve(undefined);
		const mannequinManifestPromise = isMannequin
			? fetchJson<ProceduralMannequinManifest>(
					source.manifestUrl ?? `${MANNEQUIN_ARTIFACT_ROOT}/manifest.json`,
				)
			: Promise.resolve(undefined);
		Promise.all([
			idleClipPromise,
			walkClipPromise,
			offlineBaked
				? Promise.resolve(undefined)
				: fetchJson<RuntimeRetargetReport>(
						`${RETARGET_ARTIFACT_ROOT}/runtime-retarget-report.json`,
					),
			offlineBakePromise,
			mannequinManifestPromise,
		])
			.then(([idleClip, walkClip, report, baked, manifest]) => {
				if (disposed) return;
				animationClips.set("idle", idleClip);
				animationClips.set("walk", walkClip);
				host.dataset.retargetProfile =
					baked?.idle.profileVersion ?? report?.boneMapVersion ?? "unknown";
				if (baked) {
					host.dataset.artifactPaths = `${baked.idle.outputPath},${baked.walk.outputPath}`;
					host.dataset.compilerVersion = baked.idle.compilerVersion;
					host.dataset.offlineRoundTripPassed = String(
						baked.roundTrip.passed &&
							baked.roundTrip.idle.poseComparison.passed &&
							baked.roundTrip.walk.poseComparison.passed,
					);
				}
				// Historical runtime metrics must not be presented as offline artifact quality.
				if (report) {
					host.dataset.idleQuality = JSON.stringify(
						failedBaseline
							? report.legacyFailedBaseline.idleQuality
							: report.idle.quality.summary,
					);
					host.dataset.walkQuality = JSON.stringify(
						failedBaseline
							? report.legacyFailedBaseline.walkQuality
							: report.walk.quality.summary,
					);
				} else {
					delete host.dataset.idleQuality;
					delete host.dataset.walkQuality;
				}
				setRetargetReport(report);
				setOfflineBake(baked);
				setMannequinManifest(manifest);
				if (manifest) {
					onManifestLoaded?.(manifest);
					host.dataset.assetHash = manifest.outputHash;
					host.dataset.boundsHeight = String(manifest.bounds.dimensions.y);
					host.dataset.heightMetres = String(manifest.heightMetres);
					host.dataset.proportions = JSON.stringify(manifest.proportions);
					host.dataset.anatomy = JSON.stringify(manifest.anatomy);
					host.dataset.recipeId = manifest.recipeId;
					host.dataset.recipeVersion = String(manifest.recipeVersion);
					host.dataset.recipeHash = manifest.recipeHash;
					host.dataset.skeletonSignature = manifest.skeletonSignature;
					host.dataset.deterministicBuild = String(manifest.deterministicBuild);
					host.dataset.semanticHash = manifest.normalizedSemanticHash;
					host.dataset.geometrySkinningHash =
						manifest.geometryAndSkinningSemanticHash ?? "legacy";
					host.dataset.materialHash = manifest.materialSemanticHash ?? "legacy";
					if (manifest.appearance?.skin) {
						host.dataset.skinColor = manifest.appearance.skin.authoredColor;
						host.dataset.skinRoughness = String(
							manifest.appearance.skin.authoredRoughness,
						);
						host.dataset.skinMetallic = String(
							manifest.appearance.skin.exportedMetallic,
						);
					}
					if (manifest.appearance?.face) {
						host.dataset.eyeColor = manifest.appearance.face.authoredEyeColor;
						host.dataset.faceMaterial =
							manifest.appearance.face.materialSchemaVersion;
					}
					host.dataset.hairColor =
						manifest.appearance?.hair?.authoredColor ?? "legacy";
					host.dataset.faceVersion = manifest.face?.version ?? "legacy";
					host.dataset.faceEyeMeshes = String(manifest.face?.eyeMeshCount ?? 0);
					host.dataset.faceValidation = String(
						manifest.face?.validation?.passed ?? false,
					);
					host.dataset.hairComponent =
						manifest.components?.hair?.componentId ?? "none";
					host.dataset.hairAttachment =
						manifest.components?.hair?.attachmentBone ?? "none";
					host.dataset.hairFitProfile =
						manifest.components?.hair?.fittingProfile?.id ?? "none";
					host.dataset.hairFitStatus = String(
						manifest.components?.hair?.fitValidation?.passed ??
							manifest.components?.hair?.componentId === "none",
					);
					host.dataset.headContract = manifest.head
						? JSON.stringify(manifest.head)
						: "legacy";
					host.dataset.topologyVersion =
						manifest.topologyVersion ?? "legacy-primitive-v0";
					host.dataset.topologyComponents = String(
						manifest.topology?.connectedComponentCount ?? 38,
					);
				}
				setClipStatus("loaded");
				setAnimationState("idle");
			})
			.catch((clipError) => {
				if (disposed) return;
				setClipStatus("error");
				setError(
					clipError instanceof Error
						? clipError.message
						: "Animation artifacts failed to load.",
				);
			});
		const observer =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(resize);
		observer?.observe(host);
		resize();
		mountAsset();
		render();
		return () => {
			disposed = true;
			resetViewRef.current = () => undefined;
			setCameraPresetRef.current = () => undefined;
			seekAnimationRef.current = () => undefined;
			applyAnimationStateRef.current = () => undefined;
			window.cancelAnimationFrame(frame);
			observer?.disconnect();
			controls.removeEventListener("change", updateCameraMetadata);
			controls.dispose();
			animationMixer?.stopAllAction();
			if (animationRoot) animationMixer?.uncacheRoot(animationRoot);
			const cloneSkeletons = new Set<THREE.Skeleton>();
			activeClone?.traverse((object) => {
				if (object instanceof THREE.SkinnedMesh)
					cloneSkeletons.add(object.skeleton);
			});
			for (const skeleton of cloneSkeletons) skeleton.dispose();
			activeClone?.removeFromParent();
			if (source.transient)
				disposeThreeVisualAssetCacheEntry(source.definition);
			ground.geometry.dispose();
			(ground.material as THREE.Material).dispose();
			renderer.renderLists.dispose();
			renderer.dispose();
		};
	}, [isMannequin, onManifestLoaded, source]);
	return (
		<div
			className="preview-host"
			data-preview-source={source.fixtureId}
			data-preview-revision={source.revision}
			ref={hostRef}
		>
			<canvas aria-label={`${source.displayName} preview`} ref={canvasRef} />
			<fieldset className="preview-controls" aria-label="3D preview controls">
				{(source.authoredHuman
					? ([
							"full-body",
							"upper-body",
							"face",
							"three-quarter",
							"back",
						] as const)
					: ([
							"front",
							"close-front",
							"side",
							"right-side",
							"three-quarter",
							"close-three-quarter",
							"three-quarter-rear",
							"back",
							"scalp",
						] as const)
				).map((preset) => (
					<button
						aria-pressed={cameraPreset === preset}
						disabled={!canResetView}
						key={preset}
						onClick={() => {
							setCameraPreset(preset);
							setCameraPresetRef.current(preset);
						}}
						type="button"
					>
						{PREVIEW_CAMERA_LABELS[preset]}
					</button>
				))}
				<button
					disabled={!canResetView}
					onClick={() => {
						setCameraPreset("three-quarter");
						resetViewRef.current();
					}}
					type="button"
				>
					Reset view
				</button>
			</fieldset>
			<fieldset
				className="animation-controls"
				aria-label={`${source.displayName} animation controls`}
			>
				{(["rest", "idle", "walk"] as const).map((state) => (
					<button
						aria-pressed={animationState === state}
						disabled={state !== "rest" && clipStatus !== "loaded"}
						key={state}
						onClick={() => {
							setAnimationSample(0);
							setAnimationState(state);
						}}
						type="button"
					>
						{state[0].toUpperCase() + state.slice(1)}
					</button>
				))}
				<button
					disabled={animationState === "rest" || clipStatus !== "loaded"}
					onClick={() => setAnimationPlaying((playing) => !playing)}
					type="button"
				>
					{animationPlaying ? "Pause" : "Play"}
				</button>
				<label className="animation-sample-control">
					Sample {Math.round(animationSample * 100)}%
					<input
						aria-label="Animation sample time"
						disabled={animationState === "rest" || clipStatus !== "loaded"}
						max="0.75"
						min="0"
						onChange={(event) => {
							setAnimationPlaying(false);
							setAnimationSample(Number(event.target.value));
						}}
						step="0.25"
						type="range"
						value={animationSample}
					/>
				</label>
			</fieldset>
			<div className="preview-label">
				{source.displayName} · {source.kindLabel}
			</div>
			<div className="preview-status" data-status={status}>
				{status === "loading"
					? `Loading ${source.displayName}…`
					: status === "loaded"
						? clipStatus === "loaded"
							? `${source.kindLabel} loaded · ${animationState === "rest" ? "Rest pose" : `${animationState} ${offlineBake ? "offline-baked" : "runtime-retarget diagnostic"}`}`
							: clipStatus === "error"
								? `${source.kindLabel} loaded · Clip error: ${error}`
								: `${source.kindLabel} loaded · Loading animation clips…`
						: `Preview error: ${error}`}
			</div>
			<dl
				aria-label={`${source.displayName} diagnostics`}
				hidden={source.authoredHuman}
				className="preview-diagnostics"
			>
				<div>
					<dt>Asset</dt>
					<dd>{source.definition.id}</dd>
				</div>
				<div>
					<dt>Load</dt>
					<dd>{status}</dd>
				</div>
				<div>
					<dt>Skinned meshes</dt>
					<dd>{analysis?.skinnedMeshCount ?? "—"}</dd>
				</div>
				<div>
					<dt>Bones</dt>
					<dd>{analysis?.boneCount ?? "—"}</dd>
				</div>
				<div>
					<dt>Materials</dt>
					<dd>{analysis?.materialCount ?? "—"}</dd>
				</div>
				<div>
					<dt>Animation clips</dt>
					<dd>
						{clipStatus === "loaded"
							? 2
							: (analysis?.animationClips.length ?? "—")}
					</dd>
				</div>
				<div>
					<dt>Active clip</dt>
					<dd>
						{animationState === "rest"
							? "Rest"
							: `${animationState} · ${
									offlineBake?.[animationState].durationSeconds.toFixed(3) ??
									retargetReport?.[animationState].clip.duration.toFixed(3) ??
									"—"
								}s`}
					</dd>
				</div>
				<div>
					<dt>Provider / method</dt>
					<dd>
						{isMannequin
							? "Blender-generated geometry · Offline-baked animation reuse"
							: offlineBake
								? `${retargetReport?.provenance.provider ?? "Adobe Mixamo"} · Offline baked`
								: retargetReport
									? `${retargetReport.provenance.provider} · runtime diagnostic`
									: "—"}
					</dd>
				</div>
				<div>
					<dt>Bone mapping</dt>
					<dd>
						{isMannequin
							? "65-joint Golden template · 22 explicitly weighted bones"
							: offlineBake
								? `${offlineBake.idle.mappedBoneCount} mapped · fingers/helpers at rest`
								: retargetReport
									? `${retargetReport.idleComparison.semanticMatches.length} mapped · ${retargetReport.idleComparison.unmatchedSourceBones.length} source / ${retargetReport.idleComparison.unmatchedTargetBones.length} target unmapped`
									: "—"}
					</dd>
				</div>
				<div>
					<dt>Root motion</dt>
					<dd>
						{offlineBake?.walk.rootMotion.policy ??
							retargetReport?.walk.rootMotion.policy ??
							"—"}
					</dd>
				</div>
				<div>
					<dt>Retarget profile</dt>
					<dd>
						{offlineBake?.roundTrip.profileVersion ??
							retargetReport?.boneMapVersion ??
							"—"}
					</dd>
				</div>
				<div>
					<dt>Transform policy</dt>
					<dd>
						{isMannequin
							? "Exact Golden rest skeleton · registry-owned facing"
							: offlineBake
								? "V2 rest-frame delta baked in Blender"
								: (retargetReport?.idle.profile.transformPolicy ?? "—")}
					</dd>
				</div>
				<div>
					<dt>Artifact</dt>
					<dd>
						{isMannequin
							? source.artifactUrl
							: offlineBake
								? `${offlineBake.idle.outputPath} · ${offlineBake.walk.outputPath}`
								: "Runtime JSON diagnostics"}
					</dd>
				</div>
				<div>
					<dt>Compiler</dt>
					<dd>
						{mannequinManifest?.compilerVersion ??
							offlineBake?.idle.compilerVersion ??
							"Runtime only"}
					</dd>
				</div>
				{mannequinManifest ? (
					<>
						<div>
							<dt>Recipe</dt>
							<dd>
								{mannequinManifest.recipeId} · V
								{mannequinManifest.recipeVersion}
							</dd>
						</div>
						<div>
							<dt>Recipe hash</dt>
							<dd>{mannequinManifest.recipeHash}</dd>
						</div>
						<div>
							<dt>Authored height</dt>
							<dd>{mannequinManifest.heightMetres.toFixed(2)} m</dd>
						</div>
						<div>
							<dt>Body proportions</dt>
							<dd>
								Shoulders{" "}
								{mannequinManifest.proportions.shoulderWidth.toFixed(2)} · Torso{" "}
								{mannequinManifest.proportions.torsoLength.toFixed(2)} · Arms{" "}
								{mannequinManifest.proportions.armLength.toFixed(2)} · Legs{" "}
								{mannequinManifest.proportions.legLength.toFixed(2)} · Hips{" "}
								{mannequinManifest.proportions.hipWidth.toFixed(2)}
							</dd>
						</div>
						<div>
							<dt>Asset hash</dt>
							<dd>{mannequinManifest.outputHash}</dd>
						</div>
						<div>
							<dt>Skeleton contract</dt>
							<dd>{mannequinManifest.skeletonContract}</dd>
						</div>
						<div>
							<dt>Body topology</dt>
							<dd>
								{mannequinManifest.topologyVersion ?? "legacy-primitive-v0"} ·{" "}
								{mannequinManifest.topology?.connectedComponentCount ?? 38}{" "}
								connected component ·{" "}
								{mannequinManifest.topology?.manifold
									? "manifold"
									: "legacy disconnected"}
							</dd>
						</div>
						<div>
							<dt>Generated geometry</dt>
							<dd>
								{mannequinManifest.meshCount} mesh ·{" "}
								{mannequinManifest.vertexCount} vertices ·{" "}
								{mannequinManifest.triangleCount} triangles ·{" "}
								{mannequinManifest.materialCount} material
							</dd>
						</div>
						<div>
							<dt>Weights</dt>
							<dd>
								{mannequinManifest.influenceStatistics.maximumInfluences}{" "}
								maximum influence ·{" "}
								{mannequinManifest.influenceStatistics.unweightedVertexCount}{" "}
								unweighted
							</dd>
						</div>
						<div>
							<dt>Deterministic build</dt>
							<dd>
								{mannequinManifest.validationLevel === "preview"
									? "Not tested for previews"
									: mannequinManifest.deterministicBuild
										? "Pass"
										: "Failed"}
							</dd>
						</div>
						<div>
							<dt>Known limitations</dt>
							<dd>{mannequinManifest.knownLimitations.join(" · ")}</dd>
						</div>
					</>
				) : null}
				<div>
					<dt>Pose quality gate</dt>
					<dd>
						{animationState === "rest"
							? "Rest baseline"
							: offlineBake
								? offlineBake.roundTrip[animationState].poseComparison.passed
									? "Pass · offline round trip and V2 pose comparison"
									: "Failed offline round trip"
								: retargetReport?.[animationState].quality.summary.passed
									? "Pass (visual inspection still required)"
									: "Failed"}
					</dd>
				</div>
				<div>
					<dt>Bounds</dt>
					<dd>
						{analysis
							? `${analysis.bounds.dimensions.x.toFixed(2)} × ${analysis.bounds.dimensions.y.toFixed(2)} × ${analysis.bounds.dimensions.z.toFixed(2)}`
							: "—"}
					</dd>
				</div>
				<div>
					<dt>Scale / facing</dt>
					<dd>
						{source.definition.defaultScale} /{" "}
						{source.definition.defaultRotationOffset}°
					</dd>
				</div>
			</dl>
		</div>
	);
}
