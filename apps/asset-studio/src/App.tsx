import {
	type CharacterCompileResultV1,
	createNotImplementedCharacterCompileResult,
} from "@adventure-game-builder/asset-compiler-contract";
import {
	CHARACTER_BODY_PARAMETER_LIMITS,
	CHARACTER_COMPONENT_SLOTS,
	CHARACTER_PALETTE_REGIONS,
	type CharacterBodyParameters,
	type CharacterComponentSlot,
	type CharacterPaletteRegion,
	type CharacterRecipeV1,
	createDefaultCharacterRecipe,
	parseCharacterRecipe,
	serializeCharacterRecipe,
} from "@adventure-game-builder/character-contract";
import {
	GOLDEN_REFERENCE_HUMANOID_ASSET,
	GOLDEN_REFERENCE_IDLE_BAKED_ASSET,
	GOLDEN_REFERENCE_WALK_BAKED_ASSET,
	requestThreeVisualAsset,
	requestThreeVisualAssetAnimationClip,
	type ThreeVisualAssetAnalysis,
	type ThreeVisualAssetDefinition,
} from "@adventure-game-builder/three-asset-preview";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const NAV_SECTIONS = [
	"Character",
	"Components",
	"Materials",
	"Animations",
	"Export",
] as const;

const BODY_BASE_OPTIONS = [
	{ label: "Humanoid default", value: "humanoid-default" },
	{ label: "Future athletic base", value: "humanoid-athletic-placeholder" },
	{ label: "Future compact base", value: "humanoid-compact-placeholder" },
] as const;

const COMPONENT_OPTIONS: Record<CharacterComponentSlot, string[]> = {
	hair: ["short-curl", "tied-back", "none"],
	headwear: ["wide-brim-hat", "head-scarf", "none"],
	torso: ["linen-shirt", "sailor-coat", "none"],
	legs: ["canvas-trousers", "utility-skirt", "none"],
	feet: ["soft-boots", "deck-shoes", "none"],
	mainHand: ["training-cutlass", "lantern", "none"],
};

const COMPONENT_LABELS: Record<CharacterComponentSlot, string> = {
	hair: "Hair component",
	headwear: "Headwear component",
	torso: "Torso clothing",
	legs: "Leg clothing",
	feet: "Footwear",
	mainHand: "Main-hand item",
};

const PALETTE_LABELS: Record<CharacterPaletteRegion, string> = {
	skin: "Skin color",
	hair: "Hair color",
	primary: "Primary color",
	secondary: "Secondary color",
	metal: "Metal color",
};

const PARAMETER_LABELS: Record<keyof CharacterBodyParameters, string> = {
	height: "Height",
	build: "Build",
	shoulderWidth: "Shoulders",
	waist: "Waist",
	headScale: "Head scale",
};

const PARAMETER_STEP: Record<keyof CharacterBodyParameters, string> = {
	height: "0.01",
	build: "0.01",
	shoulderWidth: "0.01",
	waist: "0.01",
	headScale: "0.01",
};

function replaceComponentValue(
	recipe: CharacterRecipeV1,
	slot: CharacterComponentSlot,
	value: string,
): CharacterRecipeV1 {
	const components = { ...recipe.components };
	if (value === "none") {
		delete components[slot];
	} else {
		components[slot] = value;
	}
	return { ...recipe, components };
}

function downloadRecipe(recipe: CharacterRecipeV1) {
	const fileName = `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "character"}.recipe.json`;
	const blob = new Blob([serializeCharacterRecipe(recipe)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

const GOLDEN_REFERENCE_FIXTURE_ID = "golden-reference-humanoid-v0";
const RETARGET_ARTIFACT_ROOT =
	"/assets/derived/humanoid-animations/golden-reference-v0";
type PreviewAnimationState = "idle" | "rest" | "walk";
type PreviewCameraPreset = "front" | "side" | "three-quarter";
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

function GoldenReferenceHumanoidPreview() {
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
		key.position.set(3, 5, 4);
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
			const result = requestThreeVisualAsset(GOLDEN_REFERENCE_HUMANOID_ASSET, {
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
			group.name = "GoldenReferenceHumanoidPreview";
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
			const bounds = new THREE.Box3().setFromObject(group),
				center = bounds.getCenter(new THREE.Vector3()),
				radius = Math.max(
					bounds.getSize(new THREE.Vector3()).length() / 2,
					0.8,
				);
			controls.minDistance = radius * 0.75;
			controls.maxDistance = radius * 3.5;
			setCameraPresetRef.current = (preset) => {
				const target = new THREE.Vector3(
					center.x,
					Math.max(center.y, 0.8),
					center.z,
				);
				const offset =
					preset === "front"
						? new THREE.Vector3(0, radius * 0.08, -radius * 2.45)
						: preset === "side"
							? new THREE.Vector3(radius * 2.45, radius * 0.08, 0)
							: new THREE.Vector3(radius * 1.7, radius * 0.28, -radius * 1.7);
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
		const failedBaseline = requestedMode === "failed-v1";
		const runtimeV2 = requestedMode === "runtime-v2";
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
		Promise.all([
			idleClipPromise,
			walkClipPromise,
			fetchJson<RuntimeRetargetReport>(
				`${RETARGET_ARTIFACT_ROOT}/runtime-retarget-report.json`,
			),
			offlineBakePromise,
		])
			.then(([idleClip, walkClip, report, baked]) => {
				if (disposed) return;
				animationClips.set("idle", idleClip);
				animationClips.set("walk", walkClip);
				host.dataset.retargetProfile =
					baked?.idle.profileVersion ?? report.boneMapVersion;
				if (baked) {
					host.dataset.artifactPaths = `${baked.idle.outputPath},${baked.walk.outputPath}`;
					host.dataset.compilerVersion = baked.idle.compilerVersion;
					host.dataset.offlineRoundTripPassed = String(
						baked.roundTrip.passed &&
							baked.roundTrip.idle.poseComparison.passed &&
							baked.roundTrip.walk.poseComparison.passed,
					);
				}
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
				setRetargetReport(report);
				setOfflineBake(baked);
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
			activeClone?.removeFromParent();
			ground.geometry.dispose();
			(ground.material as THREE.Material).dispose();
			renderer.renderLists.dispose();
			renderer.dispose();
		};
	}, []);
	return (
		<div
			className="preview-host"
			data-preview-source={GOLDEN_REFERENCE_FIXTURE_ID}
			ref={hostRef}
		>
			<canvas aria-label="Golden Reference Humanoid preview" ref={canvasRef} />
			<fieldset className="preview-controls" aria-label="3D preview controls">
				{(["front", "side", "three-quarter"] as const).map((preset) => (
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
						{preset[0].toUpperCase() + preset.slice(1)}
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
				aria-label="Golden Reference animation controls"
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
				Golden Reference Humanoid · Reference fixture
			</div>
			<div className="preview-status" data-status={status}>
				{status === "loading"
					? "Loading reference fixture…"
					: status === "loaded"
						? clipStatus === "loaded"
							? `Reference loaded · ${animationState === "rest" ? "Rest pose" : `${animationState} ${offlineBake ? "offline-baked" : "runtime-retarget diagnostic"}`}`
							: clipStatus === "error"
								? `Reference loaded · Clip error: ${error}`
								: "Reference loaded · Loading animation clips…"
						: `Preview error: ${error}`}
			</div>
			<dl
				aria-label="Golden Reference Humanoid diagnostics"
				className="preview-diagnostics"
			>
				<div>
					<dt>Asset</dt>
					<dd>{GOLDEN_REFERENCE_HUMANOID_ASSET.id}</dd>
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
						{offlineBake
							? `${retargetReport?.provenance.provider ?? "Adobe Mixamo"} · Offline baked`
							: retargetReport
								? `${retargetReport.provenance.provider} · runtime diagnostic`
								: "—"}
					</dd>
				</div>
				<div>
					<dt>Bone mapping</dt>
					<dd>
						{offlineBake
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
						{offlineBake
							? "V2 rest-frame delta baked in Blender"
							: (retargetReport?.idle.profile.transformPolicy ?? "—")}
					</dd>
				</div>
				<div>
					<dt>Artifact</dt>
					<dd>
						{offlineBake
							? `${offlineBake.idle.outputPath} · ${offlineBake.walk.outputPath}`
							: "Runtime JSON diagnostics"}
					</dd>
				</div>
				<div>
					<dt>Compiler</dt>
					<dd>{offlineBake?.idle.compilerVersion ?? "Runtime only"}</dd>
				</div>
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
						{GOLDEN_REFERENCE_HUMANOID_ASSET.defaultScale} /{" "}
						{GOLDEN_REFERENCE_HUMANOID_ASSET.defaultRotationOffset}°
					</dd>
				</div>
			</dl>
		</div>
	);
}

export default function App() {
	const [activeSection, setActiveSection] =
		useState<(typeof NAV_SECTIONS)[number]>("Character");
	const [recipe, setRecipe] = useState<CharacterRecipeV1>(() =>
		createDefaultCharacterRecipe(),
	);
	const [loadStatus, setLoadStatus] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const validation = useMemo(() => parseCharacterRecipe(recipe), [recipe]);
	const recipeJson = useMemo(() => JSON.stringify(recipe, null, 2), [recipe]);
	const compileResult: CharacterCompileResultV1 = useMemo(
		() =>
			createNotImplementedCharacterCompileResult(
				{ requestId: "asset-studio-v0-preview" },
				"Asset Studio V0 has no character compiler.",
			),
		[],
	);

	function updateRecipe(
		updater: (current: CharacterRecipeV1) => CharacterRecipeV1,
	) {
		setRecipe((current) => updater(current));
		setLoadStatus("");
	}

	function updateBodyParameter(
		key: keyof CharacterBodyParameters,
		value: number,
	) {
		updateRecipe((current) => ({
			...current,
			body: {
				...current.body,
				parameters: {
					...current.body.parameters,
					[key]: value,
				},
			},
		}));
	}

	function handleLoadRecipe(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		file
			.text()
			.then((raw) => {
				const parsed = parseCharacterRecipe(JSON.parse(raw));
				if (!parsed.ok) {
					setLoadStatus(
						`Recipe rejected: ${parsed.issues[0]?.message ?? "Invalid recipe."}`,
					);
					return;
				}
				setRecipe(parsed.value);
				setLoadStatus(`Loaded ${file.name}.`);
			})
			.catch((error) => {
				setLoadStatus(
					error instanceof Error ? error.message : "Could not load recipe.",
				);
			})
			.finally(() => {
				event.target.value = "";
			});
	}

	return (
		<div className="asset-studio-shell">
			<header className="top-bar">
				<div className="brand-lockup">
					<span className="brand-mark">AS</span>
					<div>
						<strong>Asset Studio</strong>
						<span>Character recipe foundation</span>
					</div>
				</div>
				<nav aria-label="Asset Studio sections" className="top-nav">
					{NAV_SECTIONS.map((section) => (
						<button
							className={section === activeSection ? "active" : ""}
							key={section}
							onClick={() => setActiveSection(section)}
							type="button"
						>
							{section}
						</button>
					))}
				</nav>
				<div className="top-actions">
					<button
						disabled={!validation.ok}
						onClick={() => downloadRecipe(recipe)}
						type="button"
					>
						Save Recipe JSON
					</button>
					<button onClick={() => fileInputRef.current?.click()} type="button">
						Load Recipe JSON
					</button>
					<input
						accept="application/json"
						hidden
						onChange={handleLoadRecipe}
						ref={fileInputRef}
						type="file"
					/>
				</div>
			</header>

			{activeSection === "Character" ? (
				<main className="workspace">
					<aside className="panel creation-panel">
						<h1>Character</h1>
						<label>
							Recipe name
							<input
								onChange={(event) =>
									updateRecipe((current) => ({
										...current,
										name: event.target.value,
									}))
								}
								value={recipe.name}
							/>
						</label>
						<label>
							Recipe id
							<input
								onChange={(event) =>
									updateRecipe((current) => ({
										...current,
										id: event.target.value,
									}))
								}
								value={recipe.id}
							/>
						</label>
						<label>
							Body preset
							<select
								onChange={(event) =>
									updateRecipe((current) => ({
										...current,
										body: {
											...current.body,
											baseId: event.target.value,
										},
									}))
								}
								value={recipe.body.baseId}
							>
								{BODY_BASE_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>

						<div className="field-grid">
							{Object.entries(PARAMETER_LABELS).map(([key, label]) => {
								const parameterKey = key as keyof CharacterBodyParameters;
								const limits = CHARACTER_BODY_PARAMETER_LIMITS[parameterKey];
								return (
									<label key={key}>
										{label}
										<input
											max={limits.max}
											min={limits.min}
											onChange={(event) =>
												updateBodyParameter(
													parameterKey,
													Number(event.target.value),
												)
											}
											step={PARAMETER_STEP[parameterKey]}
											type="number"
											value={recipe.body.parameters[parameterKey]}
										/>
									</label>
								);
							})}
						</div>

						<div className="section-heading">Components</div>
						<div className="field-grid">
							{CHARACTER_COMPONENT_SLOTS.map((slot) => (
								<label key={slot}>
									{COMPONENT_LABELS[slot]}
									<select
										onChange={(event) =>
											updateRecipe((current) =>
												replaceComponentValue(
													current,
													slot,
													event.target.value,
												),
											)
										}
										value={recipe.components[slot] ?? "none"}
									>
										{COMPONENT_OPTIONS[slot].map((componentId) => (
											<option key={componentId} value={componentId}>
												{componentId}
											</option>
										))}
									</select>
								</label>
							))}
						</div>
					</aside>

					<section className="preview-panel" aria-label="Character preview">
						<div className="preview-toolbar">
							<div>
								<strong>{recipe.name || "Untitled Character"}</strong>
								<span>{recipe.skeletonId} source recipe</span>
							</div>
							<span>Golden Reference animation feasibility fixture</span>
						</div>
						<GoldenReferenceHumanoidPreview />
						<div className="compile-status">
							<strong>Compile status</strong>
							<span>{compileResult.errors[0]}</span>
							<button disabled type="button">
								Compile GLB unavailable
							</button>
						</div>
					</section>

					<aside className="panel details-panel">
						<div className="section-heading">Palette</div>
						<div className="palette-grid">
							{CHARACTER_PALETTE_REGIONS.map((region) => (
								<label key={region}>
									{PALETTE_LABELS[region]}
									<input
										onChange={(event) =>
											updateRecipe((current) => ({
												...current,
												palette: {
													...current.palette,
													[region]: event.target.value,
												},
											}))
										}
										type="color"
										value={recipe.palette[region as CharacterPaletteRegion]}
									/>
								</label>
							))}
						</div>

						<div className="section-heading">Validation</div>
						{validation.ok ? (
							<p className="validation-ok">
								Recipe is valid CharacterRecipeV1.
							</p>
						) : (
							<div className="validation-list">
								{validation.issues.map((entry) => (
									<p key={`${entry.path}:${entry.message}`}>
										<strong>{entry.path}</strong> {entry.message}
									</p>
								))}
							</div>
						)}
						{loadStatus ? <p className="load-status">{loadStatus}</p> : null}

						<div className="section-heading">Recipe JSON</div>
						<pre className="recipe-json" data-testid="recipe-json">
							{recipeJson}
						</pre>
					</aside>
				</main>
			) : (
				<main className="placeholder-workspace">
					<section className="panel placeholder-panel">
						<h1>{activeSection}</h1>
						<p>{activeSection} is a future Asset Studio section.</p>
						<p>No editor or compiler workflow is implemented here in V0.</p>
					</section>
				</main>
			)}

			<footer className="status-bar">
				<span>CharacterRecipeV1 is editable source data.</span>
				<span>GLB output is a future compiled artifact.</span>
				<span>Active section: {activeSection}</span>
			</footer>
		</div>
	);
}
