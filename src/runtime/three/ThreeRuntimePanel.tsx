import {
	type MutableRefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BOW } from "../../data/bow";
import { SWORD } from "../../data/sword";
import {
	getTerrainPresentationSurfaceY,
	type TerrainSurfaceMode,
	type TerrainSurfaceSampler,
} from "../../data/terrainSurface";
import {
	areaEntitiesToMarkers,
	type EntityMarker,
} from "../../editor/sections/entityMarkers";
import { previewGridPositionToThreePoint } from "../../editor/sections/previewMove";
import {
	type SmoothTerrainMesh,
	type TerrainRenderMode,
	terrainTilesToBlocks,
	terrainTilesToSmoothMeshes,
} from "../../editor/sections/terrainBlocks";
import type {
	CinematicActorCue,
	CinematicCamera,
	CinematicSequence,
	CinematicSubtitleCue,
	Cutscene,
	DialogueNode,
	GameArea,
	GameProject,
	Interaction,
	NPCInstance,
	RuleTrigger,
	ThreeRuntimeCameraConfig,
} from "../../types/game";
import {
	getCinematicDuration,
	sampleCinematicCues,
} from "../cinematicTimeline";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
	getDialogueNode,
} from "../dialogueEngine";
import {
	assertGameSaveSafe,
	type GameSave,
	restoreGameSave,
} from "../gameSave";
import { InventoryPanel } from "../InventoryPanel";
import {
	canInteractActivate,
	canTouchActivate,
	findNearestInteractableTarget,
	findTouchInteractableTarget,
	type InteractableTarget,
	isPickupCollected,
	resolveEventInteraction,
	resolveObjectBehaviour,
	type TouchInteractableTarget,
} from "../interactionDiscovery";
import {
	getRuntimeDialogueDefinition,
	prepareInteractionMessage,
} from "../interactionMessages";
import { interactionPrompt } from "../interactionPrompt";
import {
	advancePlayerLocomotion,
	isPlayerAirborne,
	setPlayerSprint,
	tryPlayerJump,
} from "../playerLocomotion";
import {
	attemptPlayerMove,
	findPlayerWaitingTriggerTargets,
	getContinuousPlayerMoveStartMs,
} from "../playerMovementTransaction";
import {
	advanceRuntimeProjectiles,
	type BowAim,
	beginRuntimeBowDraw,
	cancelRuntimeBowDraw,
	releaseRuntimeBowDraw,
	updateRuntimeBowDraw,
} from "../projectileRuntime";
import {
	QuestObjectiveTracker,
	useQuestPresentation,
} from "../QuestPresentation";
import { getQuestViews } from "../questEngine";
import {
	finishQuestConversation,
	finishQuestInteraction,
	observeQuestLocation,
} from "../questInteractions";
import { fireTrigger } from "../ruleEngine";
import {
	attemptRuntimeCombatAttack,
	type RuntimeCombatEvent,
} from "../runtimeCombat";
import { getCurrencyHudEntries } from "../runtimeHud";
import {
	canAcceptRuntimeInput,
	isRuntimeGameplayBlocked,
} from "../runtimeInput";
import { type RuntimeNpcTickEvent, tickRuntimeNpcs } from "../runtimeNpcTick";
import {
	buyRuntimeShopEntry,
	closeRuntimeShop,
	collectRuntimeObjectPickup,
	collectRuntimePickup,
	dismountRuntimeVehicle,
	getRuntimeVehicleDismountTarget,
	openRuntimeShop,
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "../runtimeObjectInteractions";
import {
	checkRuntimeWaitingTrigger,
	completeRuntimeProgressionCutscene,
	type RuntimeProgressionEvent,
	startRuntimeSession,
	transitionRuntimeArea,
} from "../runtimeProgression";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEvent,
} from "../runtimeRuleActionDispatcher";
import {
	createRuntimeSession,
	type RuntimeGridPosition,
	type RuntimeSessionState,
} from "../runtimeSession";
import {
	initializeRuntimeStory,
	queueStoryEvent,
	type StoryDebugSnapshot,
	tickRuntimeStory,
} from "../storyRuntime";
import {
	createRuntimeTraversal,
	createTraversalWorld,
	isTraversalMoving,
	sampleTraversalMotion,
	sampleTraversalTerrain,
} from "../traversal";
import {
	InventoryNotifications,
	useInventoryPresentation,
} from "../useInventoryPresentation";
import { equipRuntimeWeapon, getEquippedWeapon } from "../weaponRuntime";
import {
	advanceThirdPersonMouseLook,
	clampOrbitCameraState,
	createOrbitCameraStateFromView,
	createThirdPersonMouseLookState,
	getOrbitCameraBounds,
	getOrbitCameraLookTarget,
	getOrbitCameraPosition,
	getThirdPersonCameraRig,
	getThirdPersonMouseLookPitchDegrees,
	getThirdPersonMouseLookYawOffsetDegrees,
	type OrbitCameraState,
	panOrbitCamera,
	resolveRuntimeCameraMovement,
	rotateOrbitCamera,
	type ThirdPersonMouseLookOptions,
	type ThirdPersonMouseLookState,
	updateThirdPersonMouseLookTarget,
	zoomOrbitCamera,
} from "./cameraControls";
import {
	advanceCameraClearance,
	applyCameraClearance,
	getCameraClearFraction,
} from "./cameraObstruction";
import { createCinematicAudioController } from "./cinematicAudio";
import {
	cinematicBlend,
	DEFAULT_CINEMATIC_FOV,
	sampleCinematicShot,
} from "./cinematicCamera";
import {
	createGroundPresentation,
	createWorldEdgePresentation,
} from "./groundPresentation";
import {
	disposePlaceholderObject,
	type ThreeResourceDisposeTracker,
} from "./placeholderMeshes";
import { ThreePerformanceOverlay } from "./ThreePerformanceOverlay";
import { createSmoothTerrainBufferGeometry } from "./terrainMeshGeometry";
import { createThreeArrowPresentation } from "./threeArrowPresentation";
import {
	createThreeCharacterAnimationController,
	type ThreeCharacterAnimationController,
} from "./threeCharacterAnimation";
import {
	createThreePerformanceDiagnostics,
	registerThreePerformanceDiagnostics,
	type ThreePerformanceDiagnostics,
} from "./threePerformanceDiagnostics";
import {
	createThreePropAnimationController,
	interactionFacingYaw,
} from "./threePropAnimation";
import { getThreeRuntimeAction } from "./threeRuntimeInput";
import { createThreeVisualMarkerGroup } from "./threeVisualRenderer";
import {
	type ResolvedThreeVisual,
	resolveThreeCharacterFacingYaw,
	resolveThreeCharacterVisual,
	threeVisualRotationOffsetToRadians,
} from "./threeVisuals";
import {
	createThreeWeaponAttachment,
	resolveCharacterHand,
} from "./threeWeaponAttachment";
import { createTraversalDebugGroup } from "./traversalDebug";
import { createVehicleSeat, seatRiderHeading } from "./vehiclePresentation";
import {
	advanceCameraFollowRig,
	advancePlayerYaw,
	advanceThirdPersonFocus,
	type CameraFollowRig,
	facingToYawRadians,
	getCameraFollowTarget,
	getFrameLerpAlpha,
	getVisualGridPosition,
	getVisualStateTargetPosition,
	gridPositionsEqual,
	resetVisualEntityState,
	settleVisualEntityState,
	startVisualGridMove,
	type VisualEntityState,
	type VisualGridPosition,
	type VisualWorldPosition,
} from "./visualSmoothing";
import {
	createCoastlinePresentation,
	createWaterPresentationState,
	markWaterPresentationMesh,
	updateWaterPresentation,
	type WaterPresentationState,
} from "./waterPresentation";
import {
	applyAtmosphere,
	applyShadowRole,
	createTerrainMaterial,
	createWorldMaterial,
	getWorldMaterialColor,
} from "./worldPresentation";

type PendingCutscene = {
	cutscene: Cutscene;
	continueLabel: string;
	onContinue: () => void;
	storyPlaybackId?: string;
};

type CinematicPlayback = {
	request: PendingCutscene;
	sequence: CinematicSequence;
	requestedAt: number;
	durationMs: number;
	startMs?: number;
	entry: CameraFollowRig;
	last: CameraFollowRig;
	returnMs?: number;
};

const CINEMATIC_BLEND_MS = 650;
const CINEMATIC_ASSET_WAIT_MS = 5000;
const MOUSE_LOOK_STORAGE_KEY = "adventure-builder-mouse-look";
type MouseLookPreferences = Required<
	Pick<ThirdPersonMouseLookOptions, "sensitivity" | "invertX" | "invertY">
>;

function readMouseLookOptions(): MouseLookPreferences {
	try {
		const saved = JSON.parse(
			localStorage.getItem(MOUSE_LOOK_STORAGE_KEY) ?? "null",
		);
		if (saved)
			return {
				sensitivity:
					typeof saved.sensitivity === "number" &&
					Number.isFinite(saved.sensitivity)
						? Math.min(2.5, Math.max(0.25, saved.sensitivity))
						: 1,
				invertX: saved.invertX === true,
				invertY: saved.invertY === true,
			};
	} catch {
		// Invalid or unavailable storage uses the default settings.
	}
	return { sensitivity: 1, invertX: false, invertY: false };
}

function findInteractionTarget(session: RuntimeSessionState, area: GameArea) {
	return findNearestInteractableTarget({
		area,
		collectedPickupIds: session.collectedPickupIds,
		defeatedNpcIds: session.defeatedNpcIds,
		firedInteractionIds: session.firedInteractionIds,
		playerPosition: session.traversal?.position ?? session.playerPosition,
		playerFacing: session.playerFacing,
		project: session.project,
		runtimeState: session.runtimeState,
		traversal: session.traversal,
	});
}
type ThreeRuntimeBuildInputs = {
	areaId: string;
	renderVersion: number;
	terrainRenderMode: TerrainRenderMode;
};

function smoothTerrainMeshUsesWater(mesh: SmoothTerrainMesh): boolean {
	return mesh.groups.some((group) => group.materialKey === "water");
}

function createSmoothTerrainMaterials(
	mesh: SmoothTerrainMesh,
	waterPresentation: WaterPresentationState,
): THREE.Material[] {
	return mesh.groups.map((group) =>
		group.materialKey === "water"
			? waterPresentation.waterMaterial
			: createWorldMaterial(group.materialKey),
	);
}

function resolveThreeRuntimeBuildReason(
	previous: ThreeRuntimeBuildInputs | null,
	next: ThreeRuntimeBuildInputs,
	requestedReason: string,
): string {
	if (!previous) {
		return "initial runtime build";
	}
	if (previous.areaId !== next.areaId) {
		return "area changed";
	}
	if (previous.terrainRenderMode !== next.terrainRenderMode) {
		return "terrain mode changed";
	}
	if (previous.renderVersion !== next.renderVersion) {
		return requestedReason;
	}
	return "runtime view changed";
}

type ThreeRuntimePanelProps = {
	project: GameProject;
	onRestart: () => void;
	initialSave?: GameSave;
	cinematicPreview?: MutableRefObject<CinematicPreviewTransport>;
	saveSessionRef?: MutableRefObject<(() => RuntimeSessionState) | null>;
	onStoryDebug?: (snapshot: StoryDebugSnapshot) => void;
};

export type CinematicPreviewTransport = {
	sequence: CinematicSequence;
	timeMs: number;
	playing: boolean;
	orbit: boolean;
	seekRevision: number;
	currentView?: CinematicCamera;
	currentFov?: number;
	getSubjectGeometry?: (
		id: string,
	) => { head?: CinematicCamera["lookAt"]; height?: number } | undefined;
	onReady: () => void;
	onAudioIssue: (issue: string | undefined) => void;
};

type RuntimeCameraMode = "follow" | "inspect";
type ThirdPersonRuntimeLook = ThirdPersonMouseLookState;

function getArea(session: RuntimeSessionState): GameArea | undefined {
	return (
		session.project.areas.find(
			(candidate) => candidate.id === session.currentAreaId,
		) ?? session.project.areas[0]
	);
}

function getTargetId(target: InteractableTarget): string {
	if (target.type === "eventBlock") {
		return target.eventBlock.id;
	}
	if (target.type === "structure") {
		return target.structure.id;
	}
	if (target.type === "object") {
		return target.object.id;
	}
	if (target.type === "npc") {
		return target.npc.id;
	}
	return target.pickup.id;
}

function keyToDirection(event: KeyboardEvent): RuntimeGridPosition | null {
	const key = event.key.toLowerCase();
	if (key === "arrowleft" || key === "a") {
		return { x: -1, y: 0 };
	}
	if (key === "arrowright" || key === "d") {
		return { x: 1, y: 0 };
	}
	if (key === "arrowup" || key === "w") {
		return { x: 0, y: -1 };
	}
	if (key === "arrowdown" || key === "s") {
		return { x: 0, y: 1 };
	}
	return null;
}

function toVisualFacing(
	facing: NPCInstance["facing"] | RuntimeGridPosition | undefined,
): VisualGridPosition {
	if (!facing) {
		return { x: 0, y: 1 };
	}
	if (typeof facing !== "string") {
		return { x: facing.x, y: facing.y };
	}
	if (facing === "up") {
		return { x: 0, y: -1 };
	}
	if (facing === "left") {
		return { x: -1, y: 0 };
	}
	if (facing === "right") {
		return { x: 1, y: 0 };
	}
	return { x: 0, y: 1 };
}

function clampGridCoordinate(value: number, max: number): number {
	return Math.min(Math.max(0, max), Math.max(0, Math.round(value)));
}

function getVisualWorldBase(
	area: GameArea,
	position: VisualGridPosition,
	terrainMode: TerrainSurfaceMode,
	sampler?: TerrainSurfaceSampler,
): VisualWorldPosition {
	const point = previewGridPositionToThreePoint(area, position);
	const terrainX = clampGridCoordinate(position.x, area.width - 1);
	const terrainY = clampGridCoordinate(position.y, area.height - 1);
	return {
		x: point.x,
		y: sampler
			? sampler.sampleSurfaceY({ x: terrainX, y: terrainY }, terrainMode)
			: getTerrainPresentationSurfaceY(
					area,
					{ x: terrainX, y: terrainY },
					terrainMode,
				),
		z: point.z,
	};
}

function getVisualPlayerCenter(
	area: GameArea,
	position: VisualGridPosition,
	terrainMode: TerrainSurfaceMode,
	sampler?: TerrainSurfaceSampler,
): VisualWorldPosition {
	const base = getVisualWorldBase(area, position, terrainMode, sampler);
	return {
		x: base.x,
		y: base.y + 0.625,
		z: base.z,
	};
}

function setObjectBasePosition(
	object: THREE.Object3D,
	area: GameArea,
	position: VisualGridPosition,
	terrainMode: TerrainSurfaceMode,
	visual?: ResolvedThreeVisual,
	groundHeight?: number,
	sampler?: TerrainSurfaceSampler,
): void {
	const base = getVisualWorldBase(area, position, terrainMode, sampler);
	const offset = object.userData.mapEntityTransform?.position;
	object.position.set(
		base.x + (offset?.x ?? 0),
		(groundHeight ?? base.y) + (visual?.heightOffset ?? 0) + (offset?.y ?? 0),
		base.z + (offset?.z ?? 0),
	);
}

function setObjectFacing(
	object: THREE.Object3D,
	facing: VisualGridPosition,
	visual?: ResolvedThreeVisual,
): void {
	object.rotation.y =
		resolveThreeCharacterFacingYaw(facing, visual) +
		THREE.MathUtils.degToRad(
			object.userData.mapEntityTransform?.rotation.y ?? 0,
		);
}

function getRuntimeCameraDimensions(area: GameArea): {
	height: number;
	width: number;
} {
	return {
		height: Math.max(area.height, 8),
		width: Math.max(area.width, 8),
	};
}

function radiansToDegrees(radians: number): number {
	return (radians * 180) / Math.PI;
}

function getThirdPersonYawDegrees(
	playerFacing: VisualGridPosition,
	config: ThreeRuntimeCameraConfig,
	runtimeLook: ThirdPersonRuntimeLook,
): number {
	return (
		radiansToDegrees(facingToYawRadians(playerFacing)) +
		config.yawOffsetDegrees +
		getThirdPersonMouseLookYawOffsetDegrees(runtimeLook)
	);
}

function getThirdPersonFollowTarget(
	playerPosition: VisualWorldPosition,
	playerFacing: VisualGridPosition,
	config: ThreeRuntimeCameraConfig,
	runtimeLook: ThirdPersonRuntimeLook,
): CameraFollowRig {
	return getThirdPersonCameraRig(playerPosition, {
		distance: config.distance,
		height: config.height,
		lookAtHeight: config.lookAtHeight,
		pitchDegrees: getThirdPersonMouseLookPitchDegrees(
			config.pitchDegrees,
			runtimeLook,
		),
		yawDegrees: getThirdPersonYawDegrees(playerFacing, config, runtimeLook),
	});
}

function getFollowCameraTarget(
	playerPosition: VisualWorldPosition,
	playerFacing: VisualGridPosition,
	config: ThreeRuntimeCameraConfig,
	runtimeLook: ThirdPersonRuntimeLook,
): CameraFollowRig {
	return config.style === "thirdPerson"
		? getThirdPersonFollowTarget(
				playerPosition,
				playerFacing,
				config,
				runtimeLook,
			)
		: getCameraFollowTarget(playerPosition);
}

function createRuntimePlayerMarker(
	area: GameArea,
	position: VisualGridPosition,
	terrainMode: TerrainSurfaceMode,
	visual: ResolvedThreeVisual,
): EntityMarker {
	const base = getVisualWorldBase(area, position, terrainMode);
	return {
		color: getWorldMaterialColor("friendly"),
		depth: 0.64,
		gridX: position.x,
		gridY: position.y,
		height: 1.25,
		id: "runtime_player",
		kind: "npc",
		opacity: 1,
		shape: "cylinder",
		threeX: base.x,
		threeY: base.y + 0.625,
		threeZ: base.z,
		visual,
		visualType: visual.placeholderType,
		width: 0.64,
	};
}

export function ThreeRuntimePanel({
	project,
	onRestart,
	initialSave,
	cinematicPreview,
	saveSessionRef,
	onStoryDebug,
}: ThreeRuntimePanelProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const diagnosticsRef = useRef<ThreePerformanceDiagnostics | null>(null);
	if (!diagnosticsRef.current) {
		diagnosticsRef.current = createThreePerformanceDiagnostics({
			label: "ThreeRuntimePanel",
		});
	}
	const diagnostics = diagnosticsRef.current;
	const sessionRef = useRef<RuntimeSessionState | null>(null);
	const playerVisualRef = useRef<VisualEntityState | null>(null);
	const heldMovementKeys = useRef(new Map<string, RuntimeGridPosition>());
	const heldSprintKeys = useRef(new Set<string>());
	// Camera orientation is independent of travel/facing; only reset/recenter changes this base.
	const cameraFacingRef = useRef<VisualGridPosition | null>(null);
	const cameraFocusRef = useRef<CameraFollowRig | null>(null);
	const attackFacingRef = useRef<VisualGridPosition | null>(null);
	const bowAimRef = useRef<BowAim | null>(null);
	const bowChargeRef = useRef<HTMLProgressElement | null>(null);
	const showCollisionRef = useRef(false);
	const traversalWorldRef = useRef<ReturnType<
		typeof createTraversalWorld
	> | null>(null);
	const npcVisualsRef = useRef<Map<string, VisualEntityState>>(new Map());
	const removeNpcPresentationRef = useRef<((npcId: string) => void) | null>(
		null,
	);
	const characterAnimationControllersRef = useRef<
		Map<string, ThreeCharacterAnimationController>
	>(new Map());
	const physicalInteractionRef = useRef<
		| ((
				id: string,
				action: "interact" | "pickup" | undefined,
				remove: boolean,
		  ) => void)
		| null
	>(null);
	const cameraRigRef = useRef<CameraFollowRig | null>(null);
	const visibleCameraRigRef = useRef<CameraFollowRig | null>(null);
	const cameraModeRef = useRef<RuntimeCameraMode>("follow");
	const inspectCameraRef = useRef<OrbitCameraState | null>(null);
	const thirdPersonRuntimeLookRef = useRef<ThirdPersonRuntimeLook>(
		createThirdPersonMouseLookState(),
	);
	const mouseLookActiveRef = useRef(false);
	const [mouseLookOptions, setMouseLookOptions] =
		useState(readMouseLookOptions);
	const mouseLookOptionsRef = useRef(mouseLookOptions);
	const pointerLockRequestedRef = useRef(false);
	const requestMouseLookRef = useRef<(() => void) | null>(null);
	const resumeInventoryMouseLookRef = useRef(false);
	const pointerLockCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const pendingCutsceneRef = useRef<PendingCutscene | null>(null);
	const cinematicPlaybackRef = useRef<CinematicPlayback | undefined>(undefined);
	const cinematicPreviewStartedAt = useRef(0);
	const stopCinematicMediaRef = useRef<(() => void) | null>(null);
	const cinematicSubtitleRef = useRef<CinematicSubtitleCue | undefined>(
		undefined,
	);
	const gameOverRef = useRef(false);
	const playerDefeatedRef = useRef(false);
	const nextRebuildReasonRef = useRef("initial runtime start");
	const previousBuildInputsRef = useRef<ThreeRuntimeBuildInputs | null>(null);
	const isStartingRuntimeRef = useRef(false);
	const [renderVersion, setRenderVersion] = useState(0);
	const [, setHudVersion] = useState(0);
	const [cameraMode, setCameraModeState] =
		useState<RuntimeCameraMode>("follow");
	const [terrainRenderMode, setTerrainRenderMode] = useState<TerrainRenderMode>(
		initialSave?.player.traversal?.mode ?? "smooth",
	);
	const [mouseLookActive, setMouseLookActiveState] = useState(false);
	const [status, setStatus] = useState("Starting 3D runtime.");
	const [flowLog, setFlowLog] = useState<string[]>([]);
	const {
		inventory,
		updateInventory: setInventory,
		resetInventory,
		showItemFeedback,
		notices,
	} = useInventoryPresentation(project.gameState.inventory);
	const [isInventoryOpen, setIsInventoryOpen] = useState(false);
	const inventoryOpenRef = useRef(false);
	const { quests, setQuests, resetQuests } =
		useQuestPresentation(showItemFeedback);
	const [shopMessage, setShopMessage] = useState<string | undefined>();
	const [pendingCutscene, setPendingCutsceneState] =
		useState<PendingCutscene | null>(null);
	const [cinematicSubtitle, setCinematicSubtitle] =
		useState<CinematicSubtitleCue>();
	const [gameOver, setGameOver] = useState(false);
	const [dialogueNode, setDialogueNode] = useState<DialogueNode | null>(null);
	const [primaryPrompt, setPrimaryPrompt] = useState("");

	function updateMouseLookOptions(options: Partial<MouseLookPreferences>) {
		const next = { ...mouseLookOptionsRef.current, ...options };
		mouseLookOptionsRef.current = next;
		setMouseLookOptions(next);
		try {
			localStorage.setItem(MOUSE_LOOK_STORAGE_KEY, JSON.stringify(next));
		} catch {
			// Settings still work for the current session when storage is unavailable.
		}
	}

	function setPendingCutscene(value: PendingCutscene | null) {
		stopCinematicMediaRef.current?.();
		cinematicSubtitleRef.current = undefined;
		setCinematicSubtitle(undefined);
		if (value) {
			heldMovementKeys.current.clear();
			heldSprintKeys.current.clear();
			setMouseLookActive(false);
		}
		pendingCutsceneRef.current = value;
		setPendingCutsceneState(value);
	}

	function finishCutscene(
		request: PendingCutscene,
		outcome: "finished" | "skipped" = "skipped",
	) {
		if (pendingCutsceneRef.current !== request) return;
		request.onContinue();
		const session = getSession();
		if (session && request.cutscene.cinematic && !cinematicPreview) {
			queueStoryEvent(session, {
				type: "cinematic",
				cinematicId: request.cutscene.id,
				outcome,
				playbackId: request.storyPlaybackId,
			});
			tickStory(session);
		}
	}

	function tickStory(session: RuntimeSessionState, deltaMs = 0) {
		if (!session.story || cinematicPreview || gameOverRef.current) return;
		tickRuntimeStory(
			session,
			{
				emitRule: handleRuleEvent,
				emitProgression: handleProgressionEvent,
				canPresent: () =>
					!pendingCutsceneRef.current &&
					!inventoryOpenRef.current &&
					!session.activeShopId,
				onDebug: onStoryDebug,
			},
			deltaMs,
		);
	}

	function gameplayBlocked(session: RuntimeSessionState): boolean {
		return Boolean(
			cinematicPreview ||
				inventoryOpenRef.current ||
				pendingCutsceneRef.current ||
				session.dialogue ||
				gameOverRef.current,
		);
	}

	function toggleInventory() {
		const current = getSession();
		if (
			!current ||
			(!inventoryOpenRef.current &&
				isRuntimeGameplayBlocked(current, gameplayBlocked(current)))
		)
			return;
		const opening = !inventoryOpenRef.current;
		if (opening) cancelRuntimeBowDraw(current);
		if (opening)
			resumeInventoryMouseLookRef.current = mouseLookActiveRef.current;
		inventoryOpenRef.current = opening;
		heldMovementKeys.current.clear();
		heldSprintKeys.current.clear();
		setMouseLookActive(false);
		setIsInventoryOpen(opening);
		if (!opening && resumeInventoryMouseLookRef.current) {
			resumeInventoryMouseLookRef.current = false;
			// Run inside the close click/keypress so browser user activation is retained.
			requestMouseLookRef.current?.();
		}
	}

	function closeDialogue() {
		const session = getSession();
		if (session) session.dialogue = undefined;
		setDialogueNode(null);
		if (session)
			finishQuestConversation(session, handleRuleEvent, handleProgressionEvent);
	}

	function renderDialogueNode() {
		const session = getSession();
		const state = session?.dialogue;
		const definition = session
			? getRuntimeDialogueDefinition(session)
			: undefined;
		const node =
			state && definition
				? getDialogueNode(definition, state.nodeId)
				: undefined;
		if (!session || !state || !node) {
			closeDialogue();
			return;
		}
		setDialogueNode(null);
		enterDialogueNode(
			state,
			node,
			createRuntimeRuleContext(session, handleRuleEvent),
			() => {
				if (getSession() !== session || session.dialogue !== state) return;
				if (gameOverRef.current) {
					closeDialogue();
					return;
				}
				setDialogueNode(node);
			},
		);
	}

	function showDialogue(dialogueId: string | undefined) {
		const session = getSession();
		const definition = session
			? getRuntimeDialogueDefinition(session, dialogueId)
			: undefined;
		if (
			!session ||
			!definition ||
			!getDialogueNode(definition, definition.startNodeId)
		) {
			setStatus("Dialogue missing or invalid.");
			return;
		}
		closeRuntimeShop(session, handleObjectEvent);
		setMouseLookActive(false);
		session.dialogue = createRuntimeDialogueState(definition);
		renderDialogueNode();
	}

	function advanceConversation(choiceId?: string) {
		const session = getSession();
		const state = session?.dialogue;
		const definition = session
			? getRuntimeDialogueDefinition(session)
			: undefined;
		if (
			!session ||
			!state ||
			!definition ||
			!dialogueNode ||
			pendingCutsceneRef.current
		)
			return;
		if (
			dialogueNode.type === "choice" &&
			!getAvailableDialogueChoices(
				dialogueNode,
				session.runtimeState,
				session.runtimeQuestState,
			).some((choice) => choice.id === choiceId)
		)
			return;
		const origin = state.nodeId;
		if (advanceDialogue(definition, state, choiceId)) {
			if (choiceId)
				queueStoryEvent(session, {
					type: "dialogueChoice",
					dialogueId: definition.id,
					nodeId: origin,
					choiceId,
				});
			renderDialogueNode();
			tickStory(session);
		} else closeDialogue();
	}
	const [mountError, setMountError] = useState<string | null>(null);
	const [missingAssets, setMissingAssets] = useState(false);

	useEffect(() => {
		const unregisterDiagnostics =
			registerThreePerformanceDiagnostics(diagnostics);
		return () => {
			unregisterDiagnostics();
			diagnostics.dispose();
		};
	}, [diagnostics]);

	useEffect(() => {
		if (import.meta.env.DEV) diagnostics.recordReactCommit();
	});

	function forceRender(reason = "runtime state changed") {
		nextRebuildReasonRef.current = reason;
		if (isStartingRuntimeRef.current) {
			return;
		}
		setRenderVersion((version) => version + 1);
	}

	function appendFlow(message: string) {
		setFlowLog((entries) => [message, ...entries].slice(0, 8));
	}

	function getSession(): RuntimeSessionState | null {
		return sessionRef.current;
	}

	function setRuntimeCameraMode(mode: RuntimeCameraMode): void {
		if (mode !== "follow") {
			setMouseLookActive(false);
		}
		cameraModeRef.current = mode;
		setCameraModeState(mode);
	}

	const setMouseLookActive = useCallback((active: boolean): void => {
		if (!active) pointerLockRequestedRef.current = false;
		if (
			!active &&
			pointerLockCanvasRef.current &&
			document.pointerLockElement === pointerLockCanvasRef.current
		) {
			document.exitPointerLock();
		}
		mouseLookActiveRef.current = active;
		setMouseLookActiveState(active);
	}, []);

	function resetCameraPresentation({
		resetMode = false,
	}: {
		resetMode?: boolean;
	} = {}): void {
		cameraRigRef.current = null;
		visibleCameraRigRef.current = null;
		inspectCameraRef.current = null;
		cameraFacingRef.current = null;
		cameraFocusRef.current = null;
		attackFacingRef.current = null;
		thirdPersonRuntimeLookRef.current = createThirdPersonMouseLookState();
		setMouseLookActive(false);
		if (resetMode) {
			setRuntimeCameraMode("follow");
		}
	}

	function recenterThirdPersonCamera(): void {
		const session = getSession();
		if (!session) return;
		const config = session.project.camera.three;
		const look = thirdPersonRuntimeLookRef.current;
		const oldYaw = getThirdPersonYawDegrees(
			cameraFacingRef.current ?? session.playerFacing,
			config,
			look,
		);
		cameraFacingRef.current = { ...session.playerFacing };
		const baseYaw =
			radiansToDegrees(facingToYawRadians(session.playerFacing)) +
			config.yawOffsetDegrees;
		const difference = ((oldYaw - baseYaw) * Math.PI) / 180;
		thirdPersonRuntimeLookRef.current = createThirdPersonMouseLookState({
			currentYawOffsetDegrees: radiansToDegrees(
				Math.atan2(Math.sin(difference), Math.cos(difference)),
			),
			currentPitchOffsetDegrees: look.currentPitchOffsetDegrees,
		});
		if (visibleCameraRigRef.current) {
			cameraRigRef.current = {
				lookAt: { ...visibleCameraRigRef.current.lookAt },
				position: { ...visibleCameraRigRef.current.position },
			};
		}
	}

	function getRuntimeMovementDirection(
		rawDirection: RuntimeGridPosition,
		session: RuntimeSessionState | null = getSession(),
	): RuntimeGridPosition {
		const threeCameraConfig = session?.project.camera.three;
		if (
			!session ||
			cameraModeRef.current !== "follow" ||
			threeCameraConfig?.style !== "thirdPerson"
		) {
			return rawDirection;
		}

		cameraFacingRef.current ??= { ...session.playerFacing };
		const returningFromCinematic =
			cinematicPlaybackRef.current &&
			cinematicPlaybackRef.current.request !== pendingCutsceneRef.current;
		return resolveRuntimeCameraMovement(
			rawDirection,
			(returningFromCinematic
				? cameraRigRef.current
				: visibleCameraRigRef.current) ??
				getThirdPersonFollowTarget(
					{ x: 0, y: 0, z: 0 },
					cameraFacingRef.current,
					threeCameraConfig,
					thirdPersonRuntimeLookRef.current,
				),
			cameraModeRef.current,
			true,
			Boolean(session.traversal),
		);
	}

	function hasPointerBlockingOverlay(): boolean {
		const session = getSession();
		return Boolean(
			cinematicPreview ||
				inventoryOpenRef.current ||
				pendingCutsceneRef.current ||
				sessionRef.current?.dialogue ||
				gameOverRef.current ||
				session?.activeShopId,
		);
	}

	function canUseThirdPersonMouseLook(
		config: ThreeRuntimeCameraConfig,
	): boolean {
		return (
			cameraModeRef.current === "follow" &&
			config.style === "thirdPerson" &&
			config.allowRuntimeOrbit &&
			!hasPointerBlockingOverlay()
		);
	}

	function resetPlayerVisual(
		session: RuntimeSessionState | null = getSession(),
		{
			resetCamera = false,
			resetCameraMode = false,
			preserveTraversal = false,
		}: {
			resetCamera?: boolean;
			resetCameraMode?: boolean;
			preserveTraversal?: boolean;
		} = {},
	) {
		if (session && !preserveTraversal) session.traversal = undefined;
		playerVisualRef.current = session
			? resetVisualEntityState(
					session.currentAreaId,
					session.traversal?.position ?? session.playerPosition,
					session.playerFacing,
				)
			: null;
		if (resetCamera) {
			resetCameraPresentation({ resetMode: resetCameraMode });
		}
	}

	function resetPresentationVisuals(
		session: RuntimeSessionState | null = getSession(),
		options: { resetCameraMode?: boolean; preserveTraversal?: boolean } = {},
	) {
		resetPlayerVisual(session, {
			resetCamera: true,
			resetCameraMode: options.resetCameraMode,
			preserveTraversal: options.preserveTraversal,
		});
		npcVisualsRef.current = new Map();
	}

	function enterInspectCameraMode(): void {
		const session = getSession();
		const area = session ? getArea(session) : undefined;
		const visibleRig = visibleCameraRigRef.current ?? cameraRigRef.current;
		if (!area || !visibleRig) {
			return;
		}
		inspectCameraRef.current = createOrbitCameraStateFromView(
			visibleRig.position,
			visibleRig.lookAt,
			getOrbitCameraBounds(getRuntimeCameraDimensions(area)),
		);
		setRuntimeCameraMode("inspect");
	}

	function enterFollowCameraMode(): void {
		cameraFocusRef.current = null;
		if (visibleCameraRigRef.current) {
			cameraRigRef.current = {
				lookAt: { ...visibleCameraRigRef.current.lookAt },
				position: { ...visibleCameraRigRef.current.position },
			};
		}
		setRuntimeCameraMode("follow");
	}

	function syncPlayerVisual(session: RuntimeSessionState): void {
		const visual = playerVisualRef.current;
		if (
			!visual ||
			visual.areaId !== session.currentAreaId ||
			!gridPositionsEqual(
				getVisualStateTargetPosition(visual),
				session.traversal?.position ?? session.playerPosition,
			)
		) {
			resetPlayerVisual(session, { preserveTraversal: true });
		}
	}

	function syncNpcVisuals(session: RuntimeSessionState, area: GameArea): void {
		const visibleNpcIds = new Set<string>();

		area.npcs.forEach((npc) => {
			if (session.defeatedNpcIds.has(npc.id)) {
				return;
			}
			visibleNpcIds.add(npc.id);
			const visual = npcVisualsRef.current.get(npc.id);
			const authoritativePosition = { x: npc.x, y: npc.y };
			if (
				!visual ||
				visual.areaId !== area.id ||
				!gridPositionsEqual(
					getVisualStateTargetPosition(visual),
					authoritativePosition,
				)
			) {
				npcVisualsRef.current.set(
					npc.id,
					resetVisualEntityState(
						area.id,
						authoritativePosition,
						toVisualFacing(npc.facing),
					),
				);
			}
		});

		Array.from(npcVisualsRef.current.keys()).forEach((npcId) => {
			if (!visibleNpcIds.has(npcId)) {
				npcVisualsRef.current.delete(npcId);
			}
		});
	}

	function handleProgressionEvent(event: RuntimeProgressionEvent): void {
		if (event.type === "questAction") {
			handleRuleEvent(event.event);
			return;
		}
		const session = getSession();
		if (!session) {
			return;
		}

		if (event.type === "status") {
			setStatus(event.message);
			return;
		}
		if (event.type === "flowLog") {
			appendFlow(event.message);
			return;
		}
		if (event.type === "itemFeedback") {
			showItemFeedback(event.message);
			return;
		}
		if (event.type === "inventoryChanged") {
			setInventory(event.inventory);
			return;
		}
		if (event.type === "questsChanged") {
			setQuests(event.quests);
			return;
		}
		if (event.type === "stateChanged") {
			forceRender("progression state changed");
			return;
		}
		if (event.type === "spawnPlayer") {
			resetPlayerVisual(session, { resetCamera: true, resetCameraMode: true });
			forceRender("spawn player");
			return;
		}
		if (event.type === "areaChanged") {
			resetPresentationVisuals(session, { resetCameraMode: true });
			forceRender("area changed");
			return;
		}
		if (event.type === "vehicleLeft") {
			resetPlayerVisual(session, { resetCamera: true });
			forceRender("vehicle left");
			return;
		}
		if (event.type === "areaEnterTriggerRequested") {
			fireRuntimeTrigger({ type: "on_area_enter", areaId: event.areaId });
			return;
		}
		if (event.type === "cutsceneRequested") {
			const cutscene = session.project.cutscenes.find(
				(candidate) => candidate.id === event.cutsceneId,
			);
			if (!cutscene) {
				completeRuntimeProgressionCutscene(session, handleProgressionEvent);
				return;
			}
			setPendingCutscene({
				continueLabel: "Continue",
				cutscene,
				onContinue: () => {
					setPendingCutscene(null);
					fireRuntimeTrigger(
						{ type: "on_cutscene_end", cutsceneId: cutscene.id },
						() =>
							completeRuntimeProgressionCutscene(
								session,
								handleProgressionEvent,
							),
					);
				},
			});
			return;
		}
		if (event.type === "triggerWaiting") {
			appendFlow(`Waiting for trigger ${event.eventBlockId}.`);
			return;
		}
		if (event.type === "endGame") {
			setStatus("Game complete.");
			setMouseLookActive(false);
			gameOverRef.current = true;
			characterAnimationControllersRef.current
				.get("runtime_player")
				?.sync({ defeated: playerDefeatedRef.current, moving: false });
			setGameOver(true);
		}
	}

	function handleRuleEvent(event: RuntimeRuleEvent): void {
		const session = getSession();
		if (!session) {
			return;
		}

		if (event.type === "status") {
			setStatus(event.message);
			return;
		}
		if (event.type === "flowLog") {
			appendFlow(event.message);
			return;
		}
		if (event.type === "stateChanged") {
			// Flags/items/quest rewards update HUD and live session state; rebuilding
			// here would discard a successful container/pickup's physical feedback.
			diagnostics.recordObjectStateUpdate("rule state changed");
			return;
		}
		if (event.type === "itemFeedback") {
			showItemFeedback(event.message);
			return;
		}
		if (event.type === "inventoryChanged") {
			setInventory(event.inventory);
			return;
		}
		if (event.type === "questsChanged") {
			setQuests(event.quests);
			return;
		}
		if (event.type === "shopOpened") {
			setMouseLookActive(false);
			setShopMessage(event.message);
			return;
		}
		if (event.type === "teleportRequested") {
			transitionRuntimeArea(
				session,
				event.areaId,
				event.eventBlockId,
				handleProgressionEvent,
			);
			return;
		}
		if (event.type === "cutsceneRequested") {
			const cutscene = session.project.cutscenes.find(
				(candidate) => candidate.id === event.cutsceneId,
			);
			if (!cutscene) {
				event.onDone();
				return;
			}
			setPendingCutscene({
				continueLabel: "Continue",
				cutscene,
				storyPlaybackId: event.storyPlaybackId,
				onContinue: () => {
					setPendingCutscene(null);
					fireRuntimeTrigger(
						{ type: "on_cutscene_end", cutsceneId: event.cutsceneId },
						event.onDone,
					);
				},
			});
			return;
		}
		if (event.type === "dialogueRequested") {
			showDialogue(event.dialogueId);
			return;
		}
		if (event.type === "movementModeChanged") {
			setStatus(`Movement mode: ${event.mode}.`);
			forceRender("movement mode changed");
			return;
		}
		if (event.type === "gameEnded" || event.type === "gameOver") {
			if (event.type === "gameOver") playerDefeatedRef.current = true;
			setMouseLookActive(false);
			gameOverRef.current = true;
			characterAnimationControllersRef.current
				.get("runtime_player")
				?.sync({ defeated: playerDefeatedRef.current, moving: false });
			setGameOver(true);
		}
	}

	function handleObjectEvent(event: RuntimeObjectInteractionEvent): void {
		if (event.type === "questAction") {
			handleRuleEvent(event.event);
			return;
		}
		const session = getSession();
		if (!session) {
			return;
		}
		if (event.type === "containerOpened") {
			physicalInteractionRef.current?.(event.objectId, "interact", false);
			diagnostics.recordObjectStateUpdate("container opened");
			return;
		}
		if (event.type === "objectCollected") {
			physicalInteractionRef.current?.(event.objectId, undefined, true);
			diagnostics.recordObjectStateUpdate("object pickup collected");
			return;
		}

		if (event.type === "status") {
			setStatus(event.message);
			return;
		}
		if (event.type === "flowLog") {
			appendFlow(event.message);
			return;
		}
		if (event.type === "stateChanged") {
			diagnostics.recordObjectStateUpdate("object state changed");
			return;
		}
		if (event.type === "itemFeedback") {
			showItemFeedback(event.message);
			return;
		}
		if (event.type === "inventoryChanged") {
			setInventory(event.inventory);
			return;
		}
		if (event.type === "questsChanged") {
			setQuests(event.quests);
			return;
		}
		if (event.type === "teleportRequested") {
			transitionRuntimeArea(
				session,
				event.areaId,
				event.eventBlockId,
				handleProgressionEvent,
			);
			return;
		}
		if (event.type === "cutsceneRequested") {
			const cutscene = event.cutsceneId
				? session.project.cutscenes.find(
						(candidate) => candidate.id === event.cutsceneId,
					)
				: event.cutscene;
			if (cutscene) {
				setPendingCutscene({
					continueLabel: "Close",
					cutscene,
					onContinue: () => setPendingCutscene(null),
				});
			}
			return;
		}
		if (event.type === "shopChanged") {
			setMouseLookActive(false);
			setShopMessage(event.message);
			diagnostics.recordObjectStateUpdate("shop changed");
			return;
		}
		if (event.type === "shopClosed") {
			setShopMessage(undefined);
			diagnostics.recordObjectStateUpdate("shop closed");
			return;
		}
		if (
			event.type === "vehicleBoarded" ||
			event.type === "vehicleDismounted" ||
			event.type === "playerMoved"
		) {
			resetPlayerVisual(session, { preserveTraversal: true });
			setHudVersion((version) => version + 1);
			return;
		}
		if (event.type === "movementModeChanged") {
			setStatus(`Movement mode: ${event.mode}.`);
			diagnostics.recordObjectStateUpdate("movement mode changed");
			return;
		}
		if (event.type === "pickupCollected") {
			physicalInteractionRef.current?.(event.pickupId, "pickup", event.once);
			diagnostics.recordObjectStateUpdate("pickup collected");
			return;
		}
		if (event.type === "objectMoved") {
			// The scene updates the active vehicle and its parking position in RAF.
			if (event.objectId !== session.playerVehicleState.vehicleObjectInstanceId)
				forceRender("object interaction changed");
		}
	}

	function handleNpcEvent(event: RuntimeNpcTickEvent): void {
		if (event.type === "status") {
			setStatus(event.message);
			return;
		}
		if (event.type === "flowLog") {
			appendFlow(event.message);
			return;
		}
		if (event.type === "npcMoved") {
			const session = getSession();
			if (session) {
				npcVisualsRef.current.set(
					event.npcId,
					startVisualGridMove(
						npcVisualsRef.current.get(event.npcId),
						session.currentAreaId,
						{
							durationMs: event.durationMs,
							facing: toVisualFacing(event.facing),
							from: event.from,
							to: event.to,
						},
						performance.now(),
					),
				);
			}
			return;
		}
		if (event.type === "npcFacingChanged") {
			const session = getSession();
			const area = session ? getArea(session) : undefined;
			const npc = area?.npcs.find((candidate) => candidate.id === event.npcId);
			if (session && area && npc) {
				const currentVisual = npcVisualsRef.current.get(event.npcId);
				npcVisualsRef.current.set(
					event.npcId,
					currentVisual?.areaId === area.id
						? { ...currentVisual, facing: toVisualFacing(event.facing) }
						: resetVisualEntityState(
								session.currentAreaId,
								{ x: npc.x, y: npc.y },
								toVisualFacing(event.facing),
							),
				);
			}
			return;
		}
		if (event.type === "stateChanged" || event.type === "combatChanged") {
			// Health/contact updates need a HUD commit, not a new WebGL scene.
			setHudVersion((version) => version + 1);
			return;
		}
		if (event.type === "playerDamaged" && event.damage > 0) {
			characterAnimationControllersRef.current
				.get(event.npcId)
				?.triggerAttack();
			if (event.health > 0)
				characterAnimationControllersRef.current
					.get("runtime_player")
					?.triggerHit();
		}
		if (event.type === "gameOver") {
			playerDefeatedRef.current = true;
			gameOverRef.current = true;
			characterAnimationControllersRef.current
				.get("runtime_player")
				?.sync({ defeated: true, moving: false });
			setGameOver(true);
		}
	}

	function handleCombatEvent(event: RuntimeCombatEvent): void {
		if (event.type === "attackStarted") {
			attackFacingRef.current =
				event.weapon === "bow" && bowAimRef.current
					? {
							x: bowAimRef.current.direction.x,
							y: bowAimRef.current.direction.z,
						}
					: {
							...(playerVisualRef.current?.facing ??
								getSession()?.playerFacing ?? { x: 0, y: 1 }),
						};
			characterAnimationControllersRef.current
				.get("runtime_player")
				?.triggerAttack(event.weapon);
			return;
		}
		if (event.type === "npcDefeated") {
			// Start death before npcRemoved decides whether this loaded visual can finish locally.
			characterAnimationControllersRef.current
				.get(event.npcId)
				?.sync({ defeated: true, moving: false });
			return;
		}
		if (event.type === "status") {
			setStatus(event.message);
			return;
		}
		if (event.type === "flowLog") {
			appendFlow(event.message);
			return;
		}
		if (event.type === "itemFeedback") {
			showItemFeedback(event.message);
			return;
		}
		if (event.type === "inventoryChanged") {
			setInventory(event.inventory);
			return;
		}
		if (event.type === "questsChanged") {
			setQuests(event.quests);
			return;
		}
		if (event.type === "npcRemoved") {
			npcVisualsRef.current.delete(event.npcId);
			removeNpcPresentationRef.current?.(event.npcId);
			return;
		}
		if (event.type === "npcDamaged" && event.damage > 0 && event.health > 0)
			characterAnimationControllersRef.current.get(event.npcId)?.triggerHit();
		if (
			event.type === "stateChanged" ||
			event.type === "combatChanged" ||
			event.type === "npcDamaged"
		) {
			// Health and defeat feedback retain the scene and surviving actors.
			setHudVersion((version) => version + 1);
		}
	}

	function fireRuntimeTrigger(
		trigger: RuleTrigger,
		onDone: () => void = () => undefined,
	): void {
		const session = getSession();
		if (!session) {
			onDone();
			return;
		}

		fireTrigger(
			trigger,
			session.project.rules,
			createRuntimeRuleContext(session, handleRuleEvent),
			onDone,
		);
	}

	function runDirectInteraction(
		interaction: Interaction,
		label: string,
		targetId: string,
	): void {
		const session = getSession();
		if (!session || interaction.activationMode === "disabled") {
			return;
		}
		if (interaction.type === "show_message") {
			const definition = prepareInteractionMessage(
				session,
				interaction,
				targetId,
				label,
			);
			if (definition) {
				session.pendingInteraction = {
					areaId: session.currentAreaId,
					targetId,
					interaction,
				};
				showDialogue(definition.id);
			}
			return;
		}
		if (interaction.type === "object_behaviour") return;
		if (interaction.type === "collect_item") {
			collectRuntimeObjectPickup(session, targetId, handleObjectEvent);
			return;
		}

		if (interaction.type === "area_link" || interaction.type === "teleport") {
			if (!interaction.targetAreaId || !interaction.targetEventBlockId) {
				setStatus(`Interaction target missing: ${label}.`);
				return;
			}
			transitionRuntimeArea(
				session,
				interaction.targetAreaId,
				interaction.targetEventBlockId,
				handleProgressionEvent,
			);
			return;
		}

		if (interaction.type === "play_cutscene") {
			const cutscene = session.project.cutscenes.find(
				(candidate) => candidate.id === interaction.cutsceneId,
			);
			if (!cutscene) {
				setStatus(`Cutscene missing: ${label}.`);
				return;
			}
			setPendingCutscene({
				continueLabel: "Close",
				cutscene,
				onContinue: () => {
					setPendingCutscene(null);
					fireRuntimeTrigger({
						type: "on_cutscene_end",
						cutsceneId: cutscene.id,
					});
				},
			});
			return;
		}

		if (interaction.type === "start_dialogue") {
			if (getRuntimeDialogueDefinition(session, interaction.dialogueId))
				session.pendingInteraction = {
					areaId: session.currentAreaId,
					targetId,
					interaction,
				};
			showDialogue(interaction.dialogueId);
			return;
		}

		if (interaction.type === "open_shop") {
			if (interaction.shopId) {
				openRuntimeShop(session, interaction.shopId, handleObjectEvent);
			} else {
				setStatus(`Shop missing: ${label}.`);
			}
			return;
		}

		if (interaction.type === "set_flag") {
			if (!interaction.flag) {
				setStatus(`Flag missing: ${label}.`);
				return;
			}
			const value = interaction.value ?? true;
			session.runtimeState.flags[interaction.flag] = value;
			finishQuestInteraction(
				session,
				session.currentAreaId,
				targetId,
				interaction,
				handleRuleEvent,
				handleProgressionEvent,
			);
			setStatus(`${interaction.flag}: ${value ? "true" : "false"}.`);
			forceRender("direct interaction changed flag");
			return;
		}

		if (interaction.mode) {
			session.currentMovementMode = interaction.mode;
			setStatus(`Movement mode: ${interaction.mode}.`);
			forceRender("direct interaction changed movement mode");
		}
	}

	function runTouchTarget(target: TouchInteractableTarget): boolean {
		const session = getSession();
		if (!session) {
			return false;
		}

		if (target.type === "pickup") {
			return collectRuntimePickup(session, target.pickup, handleObjectEvent);
		}

		if (target.type === "object") {
			fireRuntimeTrigger(
				{ type: "on_touch", targetId: target.object.id },
				() => {
					runRuntimeObjectBehaviour(
						session,
						target.object,
						handleObjectEvent,
						"on_touch",
					);
					if (target.interaction && canTouchActivate(target.interaction)) {
						runDirectInteraction(target.interaction, target.label, target.id);
					}
				},
			);
			return true;
		}

		const interaction = resolveEventInteraction(target.eventBlock);
		fireRuntimeTrigger(
			{ type: "on_touch", targetId: target.eventBlock.id },
			() => {
				if (interaction && canTouchActivate(interaction)) {
					runDirectInteraction(interaction, target.label, target.id);
				}
			},
		);
		return true;
	}

	function handleMove(
		direction: RuntimeGridPosition,
		continuingHeld = false,
	): void {
		const session = getSession();
		const now = performance.now();
		if (
			!session ||
			!canAcceptRuntimeInput(session, now, gameplayBlocked(session))
		) {
			return;
		}

		const area = getArea(session);
		if (!area) return;
		if (!session.traversal && !session.playerVehicleState.active) {
			const world =
				traversalWorldRef.current?.areaId === area.id
					? traversalWorldRef.current
					: createTraversalWorld(session.project, area, terrainRenderMode);
			if (world.profiledObjects.size || heldSprintKeys.current.size)
				session.traversal = createRuntimeTraversal(
					world,
					area,
					session.project,
					session.playerPosition,
				);
		}
		setPlayerSprint(
			session,
			heldSprintKeys.current.size > 0,
			heldMovementKeys.current.size > 0,
			gameplayBlocked(session),
		);
		const moveStartMs = getContinuousPlayerMoveStartMs(
			now,
			session.nextMoveAt,
			continuingHeld && !!session.traversal,
		);
		const move = attemptPlayerMove(
			session,
			direction,
			moveStartMs,
			session.traversal ? 0.2 : 1,
		);
		if (move.type === "blocked") {
			playerVisualRef.current = playerVisualRef.current
				? { ...playerVisualRef.current, facing: move.facing }
				: resetVisualEntityState(
						session.currentAreaId,
						session.playerPosition,
						move.facing,
					);
			setStatus(move.reason ?? "Blocked.");
			return;
		}

		if (!isPlayerAirborne(session))
			observeQuestLocation(session, handleProgressionEvent);
		playerVisualRef.current = startVisualGridMove(
			playerVisualRef.current ?? undefined,
			session.currentAreaId,
			{
				durationMs: move.moveDurationMs,
				facing: move.facing,
				from: move.from,
				to: move.to,
			},
			moveStartMs,
		);
		setStatus(
			`Moved to ${Number(move.to.x.toFixed(2))}, ${Number(move.to.y.toFixed(2))}.`,
		);
		const handledTouch = move.touchTargets.some((target) =>
			runTouchTarget(target),
		);
		if (!handledTouch) {
			checkRuntimeWaitingTrigger(
				session,
				handleProgressionEvent,
				move.triggerTargets,
			);
		}
	}

	function handleInteract(): void {
		const session = getSession();
		const area = session ? getArea(session) : undefined;
		if (
			!session ||
			!area ||
			isPlayerAirborne(session) ||
			!canAcceptRuntimeInput(
				session,
				performance.now(),
				gameplayBlocked(session),
			)
		) {
			return;
		}

		if (session.playerVehicleState.active) {
			dismountRuntimeVehicle(session, handleObjectEvent, area);
			return;
		}

		const target = findInteractionTarget(session, area);
		if (!target) {
			setStatus("Nothing to interact with.");
			return;
		}

		if (target.type === "pickup") {
			collectRuntimePickup(session, target.pickup, handleObjectEvent);
			return;
		}
		if (target.type === "npc") {
			queueStoryEvent(session, {
				type: "npc",
				areaId: area.id,
				npcId: target.id,
			});
		}
		if (target.type === "eventBlock") {
			queueStoryEvent(session, {
				type: "mapEvent",
				areaId: area.id,
				eventBlockId: target.id,
			});
		}

		fireRuntimeTrigger(
			{ type: "on_interact", targetId: getTargetId(target) },
			() => {
				let handled = false;
				if (target.type === "object") {
					handled = runRuntimeObjectBehaviour(
						session,
						target.object,
						handleObjectEvent,
					);
				}
				if (target.interaction && canInteractActivate(target.interaction)) {
					runDirectInteraction(target.interaction, target.label, target.id);
				} else if (!handled) {
					setStatus(`Interacted with ${target.label}.`);
				}
				diagnostics.recordObjectStateUpdate("interaction completed");
			},
		);
	}

	useEffect(() => {
		gameOverRef.current = gameOver;
		if (gameOver) {
			setMouseLookActive(false);
		}
	}, [gameOver, setMouseLookActive]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: session startup owns fresh runtime state; callbacks read sessionRef.
	useEffect(() => {
		isStartingRuntimeRef.current = true;
		try {
			const session = initialSave
				? restoreGameSave(project, initialSave)
				: createRuntimeSession(project);
			if (cinematicPreview) {
				cinematicPreviewStartedAt.current = performance.now();
				const sequence = cinematicPreview.current.sequence;
				const previewArea = session.project.areas.find(
					(entry) => entry.id === sequence.areaId,
				);
				if (!previewArea)
					throw new Error("Choose an existing area for this 3D sequence.");
				session.currentAreaId = previewArea.id;
				const spawn = previewArea.eventBlocks.find(
					(entry) => entry.kind === "spawn",
				);
				session.playerPosition = {
					x: spawn?.x ?? Math.floor((previewArea.width - 1) / 2),
					y: spawn?.y ?? Math.floor((previewArea.height - 1) / 2),
				};
			}
			sessionRef.current = session;
			cinematicPlaybackRef.current = undefined;
			previousBuildInputsRef.current = null;
			resetPresentationVisuals(session, {
				resetCameraMode: true,
				preserveTraversal: !!initialSave,
			});
			setMountError(null);
			gameOverRef.current = false;
			playerDefeatedRef.current = session.runtimePlayerHealth <= 0;
			setGameOver(false);
			setPendingCutscene(null);
			setFlowLog([]);
			resetInventory({ ...session.runtimeState.inventory.items });
			resetQuests(
				initialSave
					? getQuestViews(session.runtimeQuestState, session.runtimeState)
					: [],
			);
			setStatus(initialSave ? "Saved game continued." : "3D runtime started.");

			setDialogueNode(null);
			if (!cinematicPreview && !initialSave) {
				initializeRuntimeStory(session, true);
				startRuntimeSession(
					session,
					(onDone) => fireRuntimeTrigger({ type: "on_game_start" }, onDone),
					handleProgressionEvent,
				);
				tickStory(session);
			}
			nextRebuildReasonRef.current = "initial runtime start";
		} catch (error) {
			sessionRef.current = null;
			resetPresentationVisuals(null);
			setMountError(
				error instanceof Error ? error.message : "Could not start 3D runtime.",
			);
		} finally {
			isStartingRuntimeRef.current = false;
		}

		return () => {
			sessionRef.current = null;
			resetPresentationVisuals(null);
		};
	}, [project, initialSave, cinematicPreview]);

	useEffect(() => {
		if (!saveSessionRef) return;
		saveSessionRef.current = () => {
			const session = getSession();
			if (!session) throw new Error("Game is still starting.");
			tickStory(session);
			assertGameSaveSafe(session, gameplayBlocked(session));
			return session;
		};
		return () => {
			saveSessionRef.current = null;
		};
	});

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (cinematicPreview || event.defaultPrevented) return;
			if (
				event.target instanceof HTMLElement &&
				/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
			)
				return;
			if (
				event.repeat &&
				["e", "enter", "escape", "i"].includes(event.key.toLowerCase())
			)
				return;
			if (event.key.toLowerCase() === "i") {
				event.preventDefault();
				toggleInventory();
				return;
			}
			if (inventoryOpenRef.current) return;
			const cutscene = pendingCutsceneRef.current;
			if (cutscene) {
				if (event.key === "Enter" && event.target instanceof HTMLButtonElement)
					return;
				if (
					event.key === "Escape" ||
					event.key.toLowerCase() === "e" ||
					event.key === "Enter"
				) {
					event.preventDefault();
					finishCutscene(cutscene);
				}
				return;
			}
			if (
				getSession()?.dialogue &&
				["e", "E", "Enter", "Escape"].includes(event.key)
			) {
				event.preventDefault();
				heldMovementKeys.current.clear();
				heldSprintKeys.current.clear();
				if (event.key === "Escape") closeDialogue();
				else if (dialogueNode?.type !== "choice") advanceConversation();
				return;
			}
			if (event.key === "Escape" && mouseLookActiveRef.current) {
				event.preventDefault();
				setMouseLookActive(false);
				return;
			}

			const session = getSession();
			const direction = keyToDirection(event);
			if (session?.traversal && direction) {
				if (isRuntimeGameplayBlocked(session, gameplayBlocked(session))) return;
				event.preventDefault();
				if (event.repeat) return;
				// Track a second held direction even during an accepted move's deadline.
				heldMovementKeys.current.set(event.code, direction);
				handleMove(getRuntimeMovementDirection(direction));
				return;
			}
			const action = getThreeRuntimeAction(event);
			if (
				session &&
				(action === "sprint" || action === "jump") &&
				!session.traversal &&
				!session.playerVehicleState.active &&
				!isRuntimeGameplayBlocked(session, gameplayBlocked(session))
			) {
				const area = getArea(session);
				const world = traversalWorldRef.current;
				if (area && world?.areaId === area.id)
					session.traversal = createRuntimeTraversal(
						world,
						area,
						session.project,
						session.playerPosition,
					);
			}
			if (session && action === "sprint") {
				if (!isRuntimeGameplayBlocked(session, gameplayBlocked(session)))
					heldSprintKeys.current.add(event.code);
				event.preventDefault();
				return;
			}
			if (session && (action === "jump" || action === "attack")) {
				event.preventDefault();
				if (
					(event.repeat && action === "jump") ||
					isRuntimeGameplayBlocked(session, gameplayBlocked(session))
				)
					return;
				if (action === "jump")
					tryPlayerJump(session, performance.now(), gameplayBlocked(session));
				else {
					const area = getArea(session);
					if (area && getEquippedWeapon(session)?.id === "bow") {
						if (!event.repeat) beginRuntimeBowDraw(session, performance.now());
					} else if (area)
						attemptRuntimeCombatAttack(
							session,
							area,
							performance.now(),
							handleCombatEvent,
							playerVisualRef.current?.facing,
						);
				}
				return;
			}
			if (
				!session ||
				!canAcceptRuntimeInput(
					session,
					performance.now(),
					gameplayBlocked(session),
				)
			)
				return;
			if (direction) {
				event.preventDefault();
				// Remember physical keys in legacy grid areas so Shift/Jump can hand off a held gesture.
				heldMovementKeys.current.set(event.code, direction);
				handleMove(getRuntimeMovementDirection(direction));
				return;
			}

			if (event.key.toLowerCase() === "e" || event.key === "Enter") {
				event.preventDefault();
				handleInteract();
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			const session = getSession();
			if (
				session &&
				getThreeRuntimeAction(event) === "attack" &&
				session.bowDraw
			) {
				event.preventDefault();
				if (bowAimRef.current)
					releaseRuntimeBowDraw(
						session,
						performance.now(),
						bowAimRef.current,
						handleCombatEvent,
						gameplayBlocked(session),
					);
				else cancelRuntimeBowDraw(session);
			}
			heldMovementKeys.current.delete(event.code);
			heldSprintKeys.current.delete(event.code);
		};
		const clearKeys = () => {
			const session = getSession();
			if (session) cancelRuntimeBowDraw(session);
			heldMovementKeys.current.clear();
			heldSprintKeys.current.clear();
		};
		const interval = window.setInterval(() => {
			const current = getSession();
			if (!current?.traversal || !heldMovementKeys.current.size) return;
			const direction = [...heldMovementKeys.current.values()].reduce(
				(sum, d) => ({ x: sum.x + d.x, y: sum.y + d.y }),
				{ x: 0, y: 0 },
			);
			const length = Math.hypot(direction.x, direction.y);
			if (length)
				handleMove(
					getRuntimeMovementDirection({
						x: direction.x / length,
						y: direction.y / length,
					}),
					true,
				);
		}, 16);
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", clearKeys);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", clearKeys);
			window.clearInterval(interval);
		};
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: The prompt reads the current session and overlay refs.
	useEffect(() => {
		const refresh = () => {
			const current = getSession();
			const currentArea = current ? getArea(current) : undefined;
			if (
				!current ||
				!currentArea ||
				isPlayerAirborne(current) ||
				isRuntimeGameplayBlocked(current, gameplayBlocked(current))
			) {
				setPrimaryPrompt("");
				return;
			}
			const vehicle = current.playerVehicleState;
			if (vehicle.active) {
				const canLeave = getRuntimeVehicleDismountTarget(current, currentArea)
					?.target.canDismount;
				setPrimaryPrompt(
					vehicle.vehicleType === "boat"
						? canLeave
							? "E — Disembark"
							: "Steer to a dock or shore to disembark"
						: canLeave
							? "E — Dismount"
							: "Move to clear ground to dismount",
				);
				return;
			}
			setPrimaryPrompt(
				interactionPrompt(current, findInteractionTarget(current, currentArea)),
			);
		};
		refresh();
		const timer = window.setInterval(refresh, 100);
		return () => window.clearInterval(timer);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: NPC ticking reads current sessionRef state.
	useEffect(() => {
		if (gameOver || pendingCutscene) {
			return undefined;
		}

		const interval = window.setInterval(() => {
			const session = getSession();
			const area = session ? getArea(session) : undefined;
			if (
				session &&
				area &&
				!isRuntimeGameplayBlocked(session, gameplayBlocked(session))
			) {
				const tickStartedAt = performance.now();
				tickRuntimeNpcs(session, area, performance.now(), handleNpcEvent);
				diagnostics.recordRuntimeTick(performance.now() - tickStartedAt);
			}
		}, 50);

		return () => window.clearInterval(interval);
	}, [gameOver, pendingCutscene]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: renderer rebuilds when renderVersion changes and reads sessionRef.
	useEffect(() => {
		const host = hostRef.current;
		const session = getSession();
		const area = session ? getArea(session) : undefined;
		if (!host || !session || !area) {
			return undefined;
		}
		const nextBuildInputs: ThreeRuntimeBuildInputs = {
			areaId: area.id,
			renderVersion,
			terrainRenderMode,
		};
		const rebuildReason = resolveThreeRuntimeBuildReason(
			previousBuildInputsRef.current,
			nextBuildInputs,
			nextRebuildReasonRef.current,
		);
		previousBuildInputsRef.current = nextBuildInputs;
		const sceneBuildStartedAt = performance.now();
		const traversalWorld = createTraversalWorld(
			session.project,
			area,
			terrainRenderMode,
		);
		traversalWorldRef.current = traversalWorld;
		if (
			traversalWorld.profiledObjects.size ||
			session.traversal?.world.areaId === area.id
		) {
			if (
				session.traversal?.world.areaId === area.id &&
				session.traversal.world.mode === terrainRenderMode
			)
				session.traversal.world = traversalWorld;
			else
				session.traversal = createRuntimeTraversal(
					traversalWorld,
					area,
					session.project,
					session.playerPosition,
					session.traversal?.world.areaId === area.id
						? session.traversal.position
						: undefined,
				);
		} else session.traversal = undefined;

		syncPlayerVisual(session);
		syncNpcVisuals(session, area);

		host.replaceChildren();
		const scene = new THREE.Scene();
		const collisionDebug = createTraversalDebugGroup(traversalWorld, area);
		scene.add(collisionDebug);
		const camera = new THREE.PerspectiveCamera(
			55,
			(host.clientWidth || 640) / (host.clientHeight || 480),
			0.1,
			1000,
		);
		const initialPlayerVisual =
			playerVisualRef.current ??
			resetVisualEntityState(
				session.currentAreaId,
				session.playerPosition,
				session.playerFacing,
			);
		playerVisualRef.current = initialPlayerVisual;
		const initialPlayerPosition = getVisualGridPosition(
			initialPlayerVisual,
			performance.now(),
		).position;
		const threeCameraConfig = session.project.camera.three;
		cameraFacingRef.current ??= { ...initialPlayerVisual.facing };
		let cameraRig: CameraFollowRig =
			cameraRigRef.current ??
			getFollowCameraTarget(
				{
					...getVisualPlayerCenter(
						area,
						initialPlayerPosition,
						terrainRenderMode,
					),
					...(session.traversal
						? { y: session.traversal.motion.height + 0.625 }
						: {}),
				},
				cameraFacingRef.current,
				threeCameraConfig,
				thirdPersonRuntimeLookRef.current,
			);
		const applyCameraRig = (rig: CameraFollowRig) => {
			camera.position.set(rig.position.x, rig.position.y, rig.position.z);
			camera.lookAt(rig.lookAt.x, rig.lookAt.y, rig.lookAt.z);
			visibleCameraRigRef.current = {
				lookAt: { ...rig.lookAt },
				position: { ...rig.position },
			};
		};
		const getInspectCameraRig = () => {
			const cameraBounds = getOrbitCameraBounds(
				getRuntimeCameraDimensions(area),
			);
			const inspectCamera =
				inspectCameraRef.current ??
				createOrbitCameraStateFromView(
					cameraRig.position,
					cameraRig.lookAt,
					cameraBounds,
				);
			inspectCameraRef.current = clampOrbitCameraState(
				inspectCamera,
				cameraBounds,
			);
			return {
				lookAt: getOrbitCameraLookTarget(inspectCameraRef.current),
				position: getOrbitCameraPosition(inspectCameraRef.current),
			};
		};
		applyCameraRig(cameraRig);
		const renderObjects: Array<{
			disposeResources: boolean;
			object: THREE.Object3D;
		}> = [];
		const addRenderObject = (
			object: THREE.Object3D,
			options: { disposeResources?: boolean } = {},
		) => {
			renderObjects.push({
				disposeResources: options.disposeResources ?? true,
				object,
			});
			scene.add(object);
		};

		const terrainRebuildStartedAt = performance.now();
		const waterPresentation = createWaterPresentationState(
			area.theme?.atmosphere,
		);
		const groundPresentation = createGroundPresentation(area);
		let terrainMeshCount = 0;
		let terrainTriangleCount = 0;
		let terrainVertexCount = 0;
		let waterSurfaceMeshCount = 0;
		if (terrainRenderMode === "smooth") {
			const smoothMeshes = terrainTilesToSmoothMeshes(area);
			terrainMeshCount = smoothMeshes.length;
			terrainTriangleCount = smoothMeshes.reduce(
				(total, mesh) => total + mesh.indices.length / 3,
				0,
			);
			terrainVertexCount = smoothMeshes.reduce(
				(total, mesh) => total + mesh.vertices.length / 3,
				0,
			);
			smoothMeshes.forEach((smoothMesh) => {
				const usesWaterPresentation = smoothTerrainMeshUsesWater(smoothMesh);
				if (usesWaterPresentation) {
					waterSurfaceMeshCount += 1;
				}
				const mesh = new THREE.Mesh(
					createSmoothTerrainBufferGeometry(smoothMesh),
					createSmoothTerrainMaterials(smoothMesh, waterPresentation),
				);
				if (usesWaterPresentation) {
					markWaterPresentationMesh(mesh);
				}
				applyShadowRole(mesh, {
					receive: true,
				});
				if (!usesWaterPresentation) groundPresentation.apply(mesh);
				addRenderObject(mesh);
			});
		} else {
			const terrainBlocks = terrainTilesToBlocks(area);
			terrainMeshCount = terrainBlocks.length;
			terrainTriangleCount = terrainBlocks.length * 12;
			terrainVertexCount = terrainBlocks.length * 24;
			terrainBlocks.forEach((block) => {
				const usesWaterPresentation = block.materialKey === "water";
				if (usesWaterPresentation) {
					waterSurfaceMeshCount += 1;
				}
				const mesh = new THREE.Mesh(
					new THREE.BoxGeometry(0.98, block.height, 0.98),
					usesWaterPresentation
						? waterPresentation.waterMaterial
						: createTerrainMaterial(block.kind),
				);
				if (usesWaterPresentation) {
					markWaterPresentationMesh(mesh);
				}
				applyShadowRole(mesh, { receive: !usesWaterPresentation });
				mesh.position.set(block.threeX, block.yOffset, block.threeZ);
				if (!usesWaterPresentation) groundPresentation.apply(mesh);
				addRenderObject(mesh);
			});
		}
		const coastlinePresentation = createCoastlinePresentation(
			area,
			waterPresentation,
		);
		coastlinePresentation.meshes.forEach((mesh) => {
			addRenderObject(mesh);
		});
		createWorldEdgePresentation(
			area,
			waterPresentation.waterMaterial,
			terrainRenderMode,
		).forEach((mesh) => {
			addRenderObject(mesh);
		});
		const coastlineTriangleCount = coastlinePresentation.meshes.length * 2;
		const coastlineVertexCount = coastlinePresentation.meshes.length * 4;
		diagnostics.recordTerrainRebuild({
			coastlineEdgeCount: coastlinePresentation.edges.length,
			durationMs: performance.now() - terrainRebuildStartedAt,
			meshCount: terrainMeshCount + coastlinePresentation.meshes.length,
			mode: terrainRenderMode,
			tileCount: area.terrainTiles.length,
			triangleCount: terrainTriangleCount + coastlineTriangleCount,
			vertexCount: terrainVertexCount + coastlineVertexCount,
			waterMeshCount: waterSurfaceMeshCount,
		});

		const runtimeArea: GameArea = {
			...area,
			// Spawn helpers stay in Edit; the player's feet and shadow sit on the
			// authored ground in Play. This copy is only used to build visual markers.
			eventBlocks: area.eventBlocks.filter(
				(block) => block.kind === "area_link",
			),
			npcs: area.npcs.filter((npc) => !session.defeatedNpcIds.has(npc.id)),
			pickups: area.pickups.filter(
				(pickup) =>
					!isPickupCollected(
						pickup,
						session.runtimeState,
						session.collectedPickupIds,
					),
			),
		};
		const npcRenderGroups = new Map<string, THREE.Group>();
		const npcRenderVisuals = new Map<string, ResolvedThreeVisual | undefined>();
		const characterAnimationControllers = new Map<
			string,
			ThreeCharacterAnimationController
		>();
		const updateCharacterAnimationDiagnostics = () => {
			const sourceAssetIds = new Set<string>();
			let activeLoopingActions = 0;
			let incompatibleClipCount = 0;
			let loadingSourceCount = 0;
			let missingClipCount = 0;
			let oneShotActionsTriggered = 0;
			let playerState = "idle";
			for (const [id, controller] of characterAnimationControllers) {
				const stats = controller.getStats();
				activeLoopingActions += stats.activeLoopingActions;
				incompatibleClipCount += stats.incompatibleClipCount;
				loadingSourceCount += stats.loadingSourceCount;
				missingClipCount += stats.missingClipCount;
				oneShotActionsTriggered += stats.oneShotActionsTriggered;
				if (id === "runtime_player") {
					playerState = stats.semanticState;
				}
				for (const assetId of stats.sourceAssetIds) {
					sourceAssetIds.add(assetId);
				}
			}
			diagnostics.setCharacterAnimationMetrics({
				activeLoopingActions,
				activeMixers: characterAnimationControllers.size,
				incompatibleClipCount,
				loadingSourceCount,
				missingClipCount,
				oneShotActionsTriggered,
				playerState,
				sourceAssetIds: Array.from(sourceAssetIds),
			});
		};
		const addCharacterAnimationController = (
			id: string,
			group: THREE.Group,
			visual: ResolvedThreeVisual | undefined,
			usedAsset: boolean,
		) => {
			if (
				!usedAsset ||
				visual?.mode !== "asset" ||
				(visual.asset.category !== "character" &&
					!(visual.asset.category === "vehicle" && visual.asset.animations))
			) {
				return;
			}
			characterAnimationControllers.set(
				id,
				createThreeCharacterAnimationController({
					asset: visual.asset,
					root: group,
					attackVariants:
						id === "runtime_player"
							? {
									...(session.project.items.some(
										(item) => item.weapon === "sword",
									) && resolveCharacterHand(group, "rightHand")
										? { sword: SWORD.attackAnimation }
										: {}),
									...(session.project.items.some(
										(item) => item.weapon === "bow",
									) && resolveCharacterHand(group, "leftHand")
										? { bow: BOW.attackAnimation }
										: {}),
								}
							: undefined,
				}),
			);
		};
		let assetStateChangeQueued = false;
		const handleAssetStateChange = () => {
			if (assetStateChangeQueued) {
				return;
			}
			assetStateChangeQueued = true;
			nextRebuildReasonRef.current = "asset state changed";
			setRenderVersion((version) => version + 1);
		};
		const runtimeMarkers = areaEntitiesToMarkers(
			runtimeArea,
			session.project.objects,
			session.project.npcs,
			true,
			terrainRenderMode,
			session.project.characterAssets,
			session.project.assetCreator?.variants,
		);
		const openedLabels: {
			id: string;
			flag?: string;
			element: HTMLDivElement;
			position: THREE.Vector3;
		}[] = [];
		const propAnimations = new Map<
			string,
			{
				flag?: string;
				controller: ReturnType<typeof createThreePropAnimationController>;
			}
		>();
		const markerGroups = new Map<string, THREE.Group>();
		const vehicles = new Map<
			string,
			{
				group: THREE.Group;
				visual?: ResolvedThreeVisual;
				mountRider?: ReturnType<typeof createVehicleSeat>;
				parkedObject: GameArea["objects"][number];
			}
		>();
		const markerRenderResults = runtimeMarkers.map((marker) => {
			const renderResult = createThreeVisualMarkerGroup(marker, {
				diagnostics,
				onAssetStateChange: handleAssetStateChange,
			});
			const { group } = renderResult;
			markerGroups.set(marker.id, group);
			const object =
				marker.kind === "object" || marker.kind === "vehicle"
					? area.objects.find((o) => o.id === marker.id)
					: undefined;
			const behaviour = object
				? resolveObjectBehaviour(session.project, object)
				: undefined;
			if (object && behaviour?.type === "vehicle") {
				const seat = marker.visual?.asset?.mountedSeat;
				vehicles.set(marker.id, {
					group,
					visual: marker.visual,
					parkedObject: object,
					mountRider: seat && createVehicleSeat(group, seat),
				});
				addCharacterAnimationController(
					marker.id,
					group,
					marker.visual,
					renderResult.usedAsset,
				);
			}
			if (behaviour?.type === "container") {
				if (renderResult.usedAsset && marker.visual?.asset?.propAnimations) {
					propAnimations.set(marker.id, {
						flag: behaviour.openedFlag,
						controller: createThreePropAnimationController(
							marker.visual.asset,
							group,
							session.openedObjectIds.has(marker.id) ||
								!!(
									behaviour.openedFlag &&
									session.runtimeState.flags[behaviour.openedFlag]
								),
						),
					});
				}
				if (!propAnimations.has(marker.id)) {
					const element = document.createElement("div");
					element.className = "runtime-opened-label";
					element.textContent = "Opened";
					element.hidden = true;
					host.append(element);
					openedLabels.push({
						id: marker.id,
						flag: behaviour.openedFlag,
						element,
						position: new THREE.Vector3(
							marker.threeX,
							marker.threeY + 0.7,
							marker.threeZ,
						),
					});
				}
			}
			if (marker.kind === "npc") {
				const npcVisual = npcVisualsRef.current.get(marker.id);
				if (npcVisual) {
					setObjectBasePosition(
						group,
						area,
						getVisualGridPosition(npcVisual, performance.now()).position,
						terrainRenderMode,
						marker.visual,
					);
					setObjectFacing(group, npcVisual.facing, marker.visual);
					npcRenderGroups.set(marker.id, group);
					npcRenderVisuals.set(marker.id, marker.visual);
					addCharacterAnimationController(
						marker.id,
						group,
						marker.visual,
						renderResult.usedAsset,
					);
				}
			}
			if (!renderResult.usedAsset) {
				applyShadowRole(group, {
					cast: true,
					receive: marker.kind !== "event",
				});
			}
			addRenderObject(group, { disposeResources: !renderResult.usedAsset });
			return renderResult;
		});

		const playerRenderVisual = resolveThreeCharacterVisual(
			{
				kind: "player",
				name: session.project.player.name,
				threeVisual: session.project.player.threeVisual,
			},
			session.project.characterAssets,
			session.project.assetCreator?.variants,
		);
		const playerRenderResult = createThreeVisualMarkerGroup(
			createRuntimePlayerMarker(
				area,
				initialPlayerPosition,
				terrainRenderMode,
				playerRenderVisual,
			),
			{
				diagnostics,
				onAssetStateChange: handleAssetStateChange,
			},
		);
		const playerMesh = playerRenderResult.group;
		const riderHips =
			playerMesh.getObjectByName("pelvis") ??
			playerMesh.getObjectByName("Hips");
		let lastRiddenId: string | undefined;
		let riderLean = 0;
		let riderPitch = 0;
		const weaponAttachment = createThreeWeaponAttachment(
			playerMesh,
			diagnostics,
		);
		if (!playerRenderResult.usedAsset) {
			applyShadowRole(playerMesh, { cast: true });
		}
		setObjectBasePosition(
			playerMesh,
			area,
			initialPlayerPosition,
			terrainRenderMode,
			playerRenderVisual,
		);
		setObjectFacing(playerMesh, initialPlayerVisual.facing, playerRenderVisual);
		addCharacterAnimationController(
			"runtime_player",
			playerMesh,
			playerRenderVisual,
			playerRenderResult.usedAsset,
		);
		characterAnimationControllersRef.current = characterAnimationControllers;
		updateCharacterAnimationDiagnostics();
		addRenderObject(playerMesh, {
			disposeResources: !playerRenderResult.usedAsset,
		});
		setMissingAssets(
			[...markerRenderResults, playerRenderResult].some(
				(result) =>
					result.assetStatus === "error" || result.assetStatus === "missing",
			),
		);
		const updateSceneEntityCounts = () =>
			diagnostics.setSceneEntityCounts({
				assetStatuses: [...markerRenderResults, playerRenderResult].map(
					(result) => ({
						analysis: result.assetAnalysis,
						category: result.assetCategory,
						cloneType: result.cloneType,
						definitionId: result.assetDefinitionId,
						status: result.assetStatus,
						usedAsset: result.usedAsset,
					}),
				),
				entityCount: markerRenderResults.length + 1,
				sceneIdentity: {
					areaId: area.id,
					areaName: area.name,
					projectName: session.project.metadata.name,
				},
			});

		updateSceneEntityCounts();
		let interactionTarget: { x: number; y: number } | undefined;
		const presentPhysicalInteraction = (
			id: string,
			action: "interact" | "pickup" | undefined,
			remove: boolean,
		) => {
			const group = markerGroups.get(id);
			if (!group) return;
			if (
				action &&
				!isPlayerAirborne(session) &&
				characterAnimationControllers
					.get("runtime_player")
					?.triggerInteraction(action)
			)
				interactionTarget = { x: group.position.x, y: group.position.z };
			if (action === "interact")
				propAnimations.get(id)?.controller.setOpened(true);
			if (!remove) return;
			// Gameplay has already collected this source. Drop only its local presentation.
			scene.remove(group);
			markerGroups.delete(id);
			propAnimations.get(id)?.controller.dispose();
			propAnimations.delete(id);
			const index = markerRenderResults.findIndex((r) => r.group === group);
			if (index >= 0) {
				const [result] = markerRenderResults.splice(index, 1);
				result.disposePresentation?.();
				if (!result.usedAsset) disposePlaceholderObject(group);
				else {
					const skeletons = new Set<THREE.Skeleton>();
					group.traverse((o) => {
						if ((o as THREE.SkinnedMesh).isSkinnedMesh)
							skeletons.add((o as THREE.SkinnedMesh).skeleton);
					});
					for (const skeleton of skeletons) skeleton.dispose();
				}
			}
			const renderIndex = renderObjects.findIndex((r) => r.object === group);
			if (renderIndex >= 0) renderObjects.splice(renderIndex, 1);
			updateSceneEntityCounts();
		};

		// The shared combat transaction already removes the NPC from the live area,
		// which movement/collision reads directly. Only this actor's presentation
		// needs disposal; terrain, traversal, renderer and other mixers stay alive.
		const dyingNpcs = new Map<string, number>();
		const removeNpcPresentation = (npcId: string) => {
			dyingNpcs.delete(npcId);
			const group = npcRenderGroups.get(npcId);
			if (!group) return;
			characterAnimationControllers.get(npcId)?.dispose();
			characterAnimationControllers.delete(npcId);
			npcRenderGroups.delete(npcId);
			npcRenderVisuals.delete(npcId);
			scene.remove(group);

			const resultIndex = markerRenderResults.findIndex(
				(result) => result.group === group,
			);
			const [result] = markerRenderResults.splice(resultIndex, 1);
			result.disposePresentation?.();
			if (result.usedAsset) {
				// Skeleton clones own their bone textures; GLTF geometry/materials
				// remain shared with the loader cache and surviving actors.
				const skeletons = new Set<THREE.Skeleton>();
				group.traverse((object) => {
					const mesh = object as THREE.SkinnedMesh;
					if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton);
				});
				for (const skeleton of skeletons) skeleton.dispose();
			} else {
				disposePlaceholderObject(group);
			}
			const objectIndex = renderObjects.findIndex(
				(entry) => entry.object === group,
			);
			renderObjects.splice(objectIndex, 1);
			updateCharacterAnimationDiagnostics();
			updateSceneEntityCounts();
		};

		const finishNpcPresentation = (npcId: string) => {
			const death = characterAnimationControllers
				.get(npcId)
				?.getDefeatPlayback();
			if (death && !death.finished) {
				// A deadline also bounds malformed/paused actions. Gameplay is already removed.
				if (!dyingNpcs.has(npcId))
					dyingNpcs.set(
						npcId,
						performance.now() + Math.min(death.duration * 1000 + 250, 10000),
					);
			} else removeNpcPresentation(npcId);
		};

		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true });
		} catch (error) {
			for (const prop of propAnimations.values()) prop.controller.dispose();
			weaponAttachment.dispose();
			characterAnimationControllers.forEach((controller) => {
				controller.dispose();
			});
			if (
				characterAnimationControllersRef.current ===
				characterAnimationControllers
			) {
				characterAnimationControllersRef.current = new Map();
			}
			setMountError(
				error instanceof Error
					? error.message
					: "Three.js renderer could not be created.",
			);
			return undefined;
		}
		renderer.domElement.setAttribute("aria-label", "Three runtime viewport");
		renderer.domElement.tabIndex = 0;
		const atmosphere = applyAtmosphere(scene, renderer, {
			preset: area.theme?.atmosphere,
			fogOverride: area.theme?.fog,
			enableShadows: true,
		});
		// The moonlit scene has dense foliage in the shadow pass. Keep the
		// previous map between updates while the main view renders each frame.
		const moonShadow =
			area.theme?.atmosphere === "moonlit"
				? atmosphere.lights.sun.shadow
				: undefined;
		if (moonShadow) moonShadow.autoUpdate = false;
		let lastMoonShadowMs = -Infinity;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setSize(host.clientWidth || 640, host.clientHeight || 480, false);
		const viewportObserver =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(() => {
						if (!host.clientWidth || !host.clientHeight) return;
						camera.aspect = host.clientWidth / host.clientHeight;
						camera.updateProjectionMatrix();
						renderer.setSize(host.clientWidth, host.clientHeight, false);
					});
		viewportObserver?.observe(host);
		host.appendChild(renderer.domElement);
		const previewOrbit = cinematicPreview
			? new OrbitControls(camera, renderer.domElement)
			: undefined;
		if (previewOrbit) {
			previewOrbit.enabled = false;
			previewOrbit.minDistance = 0.3;
			previewOrbit.maxDistance = 140;
		}
		physicalInteractionRef.current = presentPhysicalInteraction;
		removeNpcPresentationRef.current = finishNpcPresentation;
		if (import.meta.env.DEV) {
			const gl = renderer.getContext?.();
			const debug = gl?.getExtension("WEBGL_debug_renderer_info");
			diagnostics.setRenderContext({
				backend: debug
					? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
					: "unavailable",
				width: renderer.domElement.width,
				height: renderer.domElement.height,
				pixelRatio: renderer.getPixelRatio?.() ?? 1,
			});
		}

		let cameraDrag: {
			mode: "inspectOrbit" | "inspectPan";
			x: number;
			y: number;
		} | null = null;
		let inputDisposed = false;
		pointerLockCanvasRef.current = renderer.domElement;
		const handlePointerLockChange = () => {
			setMouseLookActive(
				document.pointerLockElement === renderer.domElement &&
					pointerLockRequestedRef.current &&
					canUseThirdPersonMouseLook(threeCameraConfig),
			);
		};
		const handlePointerLockError = () => {
			setMouseLookActive(false);
		};
		const handleFocusLoss = () => {
			resumeInventoryMouseLookRef.current = false;
			setMouseLookActive(false);
		};
		const updateInspectCamera = (
			updater: (state: OrbitCameraState) => OrbitCameraState,
		) => {
			if (
				cameraModeRef.current !== "inspect" ||
				pendingCutsceneRef.current?.cutscene.cinematic
			) {
				return;
			}
			const cameraBounds = getOrbitCameraBounds(
				getRuntimeCameraDimensions(area),
			);
			const current =
				inspectCameraRef.current ??
				createOrbitCameraStateFromView(
					visibleCameraRigRef.current?.position ?? cameraRig.position,
					visibleCameraRigRef.current?.lookAt ?? cameraRig.lookAt,
					cameraBounds,
				);
			inspectCameraRef.current = clampOrbitCameraState(
				updater(current),
				cameraBounds,
			);
		};
		const handlePointerDown = (event: PointerEvent) => {
			if (cinematicPreview || pendingCutsceneRef.current?.cutscene.cinematic)
				return;
			if (cameraModeRef.current === "inspect") {
				if (!event.altKey || (event.button !== 0 && event.button !== 1)) {
					return;
				}
				event.preventDefault();
				cameraDrag = {
					mode:
						event.shiftKey || event.button === 1
							? "inspectPan"
							: "inspectOrbit",
					x: event.clientX,
					y: event.clientY,
				};
				renderer.domElement.setPointerCapture?.(event.pointerId);
				return;
			}

			if (
				event.altKey ||
				event.button !== 0 ||
				!canUseThirdPersonMouseLook(threeCameraConfig)
			) {
				return;
			}
			event.preventDefault();
			requestMouseLook();
		};
		const requestMouseLook = () => {
			if (inputDisposed || !canUseThirdPersonMouseLook(threeCameraConfig))
				return;
			renderer.domElement.focus();
			if (document.pointerLockElement === renderer.domElement) return;
			try {
				pointerLockRequestedRef.current = true;
				const request = renderer.domElement.requestPointerLock?.();
				// Older implementations return void. State comes only from lockchange.
				void Promise.resolve(request).then(
					() => {
						if (inputDisposed) {
							if (document.pointerLockElement === renderer.domElement)
								document.exitPointerLock();
						} else if (document.pointerLockElement === renderer.domElement)
							handlePointerLockChange();
					},
					() => {
						if (!inputDisposed) handlePointerLockError();
					},
				);
			} catch {
				handlePointerLockError();
			}
		};
		requestMouseLookRef.current = requestMouseLook;
		const handlePointerMove = (event: PointerEvent) => {
			if (!cameraDrag) return;
			diagnostics.recordPointerMove();
			if (cameraDrag) {
				event.preventDefault();
				const deltaX = event.clientX - cameraDrag.x;
				const deltaY = event.clientY - cameraDrag.y;
				if (deltaX !== 0 || deltaY !== 0) {
					updateInspectCamera((state) =>
						cameraDrag?.mode === "inspectPan"
							? panOrbitCamera(state, deltaX, deltaY)
							: rotateOrbitCamera(
									state,
									deltaX,
									deltaY,
									getOrbitCameraBounds(getRuntimeCameraDimensions(area)),
								),
					);
					cameraDrag = { ...cameraDrag, x: event.clientX, y: event.clientY };
				}
				return;
			}
		};
		const handleMouseMove = (event: MouseEvent) => {
			if (
				document.pointerLockElement !== renderer.domElement ||
				!mouseLookActiveRef.current
			)
				return;
			if (!canUseThirdPersonMouseLook(threeCameraConfig)) {
				setMouseLookActive(false);
				return;
			}
			diagnostics.recordPointerMove();
			const deltaX = event.movementX;
			const deltaY = event.movementY;
			if (deltaX !== 0 || deltaY !== 0) {
				event.preventDefault();
				thirdPersonRuntimeLookRef.current = updateThirdPersonMouseLookTarget(
					thirdPersonRuntimeLookRef.current,
					deltaX,
					deltaY,
					threeCameraConfig.pitchDegrees,
					mouseLookOptionsRef.current,
				);
			}
		};
		const handlePointerUp = (event: PointerEvent) => {
			if (!cameraDrag) {
				return;
			}
			event.preventDefault();
			cameraDrag = null;
			renderer.domElement.releasePointerCapture?.(event.pointerId);
		};
		const handleWheel = (event: WheelEvent) => {
			if (cameraModeRef.current !== "inspect") {
				return;
			}
			event.preventDefault();
			updateInspectCamera((state) =>
				zoomOrbitCamera(
					state,
					event.deltaY,
					getOrbitCameraBounds(getRuntimeCameraDimensions(area)),
				),
			);
		};
		renderer.domElement.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("pointerlockchange", handlePointerLockChange);
		document.addEventListener("pointerlockerror", handlePointerLockError);
		window.addEventListener("blur", handleFocusLoss);
		renderer.domElement.addEventListener("pointerup", handlePointerUp);
		renderer.domElement.addEventListener("wheel", handleWheel, {
			passive: false,
		});

		let cameraClearance = 1;
		const cameraWorldOffset = previewGridPositionToThreePoint(area, {
			x: 0,
			y: 0,
		});
		const cinematicPointToWorld = (point: THREE.Vector3Like) => ({
			x: point.x + cameraWorldOffset.x,
			y: point.y,
			z: point.z + cameraWorldOffset.z,
		});
		const cinematicPointToGrid = (point: THREE.Vector3Like) => ({
			x: point.x - cameraWorldOffset.x,
			y: point.y,
			z: point.z - cameraWorldOffset.z,
		});
		const measureSubject: CinematicPreviewTransport["getSubjectGeometry"] = (
			id,
		) => {
			const group =
				id === "runtime_player" ? playerMesh : npcRenderGroups.get(id);
			if (!group || !characterAnimationControllers.has(id)) return;
			group.updateWorldMatrix(true, true);
			let head: THREE.Bone | undefined;
			group.traverse((node) => {
				if (node instanceof THREE.Bone && /(^|[:_])head$/i.test(node.name))
					head = node;
			});
			const bounds = new THREE.Box3().setFromObject(group);
			return {
				height: bounds.isEmpty() ? undefined : bounds.max.y - bounds.min.y,
				head: head
					? cinematicPointToGrid(head.getWorldPosition(new THREE.Vector3()))
					: undefined,
			};
		};
		if (cinematicPreview)
			cinematicPreview.current.getSubjectGeometry = measureSubject;
		const cinematicActorFacing = new Map<string, number>();
		const applyCinematicFacing = (
			id: string,
			group: THREE.Group,
			cue: CinematicActorCue | undefined,
			visual: ResolvedThreeVisual | undefined,
			deltaMs: number,
		) => {
			const previous = cinematicActorFacing.get(id);
			const target =
				cue?.face &&
				interactionFacingYaw(
					{ x: group.position.x, y: group.position.z },
					{
						x: cue.face.x + cameraWorldOffset.x,
						y: cue.face.z + cameraWorldOffset.z,
					},
					visual?.rotationOffset,
				);
			if (previous === undefined && target === undefined) return;
			const ordinaryYaw = group.rotation.y;
			const yaw = advancePlayerYaw(
				previous ?? ordinaryYaw,
				target ?? ordinaryYaw,
				deltaMs,
			);
			if (
				target === undefined &&
				Math.abs(Math.sin(yaw - ordinaryYaw)) < 0.001 &&
				Math.cos(yaw - ordinaryYaw) > 0
			) {
				cinematicActorFacing.delete(id);
				return;
			}
			cinematicActorFacing.set(id, yaw);
			group.rotation.y = yaw;
		};
		const audio = createCinematicAudioController((issue) =>
			cinematicPreview?.current.onAudioIssue(issue),
		);
		const animatedActors = new Set<string>();
		const stopCinematicMedia = () => {
			audio.sync(undefined, 0);
			for (const id of animatedActors)
				characterAnimationControllers
					.get(id)
					?.setCinematicAnimation?.(undefined);
			animatedActors.clear();
		};
		stopCinematicMediaRef.current = stopCinematicMedia;
		const assetsLoading =
			playerRenderResult.assetStatus === "loading" ||
			markerRenderResults.some((result) => result.assetStatus === "loading");
		const arrowPresentation = session.project.items.some(
			(item) => item.weapon === "bow",
		)
			? createThreeArrowPresentation(scene, cameraWorldOffset, diagnostics)
			: undefined;
		let animationFrame = 0;
		let lastFrameMs = performance.now();
		let previewReady = false;
		let previewSeekRevision = -1;
		let clearanceTargetId: string | undefined;
		let cinematicSolids = traversalWorld.solids;
		const cinematicCameraView = (
			sample: NonNullable<ReturnType<typeof sampleCinematicShot>>,
		): CameraFollowRig => {
			const rig = {
				position: cinematicPointToWorld(sample.camera.position),
				lookAt: cinematicPointToWorld(sample.camera.lookAt),
			};
			const { targetId, trackingOrigin } = sample.shot;
			if (trackingOrigin && targetId) {
				const target =
					targetId === "runtime_player"
						? playerMesh
						: npcRenderGroups.get(targetId);
				if (target) {
					const origin = cinematicPointToWorld(trackingOrigin);
					rig.lookAt.x += target.position.x - origin.x;
					rig.lookAt.y += target.position.y - origin.y;
					rig.lookAt.z += target.position.z - origin.z;
				}
			}
			if (!sample.shot.clearance) return rig;
			if (sample.shot.targetId !== clearanceTargetId) {
				clearanceTargetId = sample.shot.targetId;
				cinematicSolids = traversalWorld.solids.filter(
					(solid) => solid.id !== clearanceTargetId,
				);
			}
			const fraction = getCameraClearFraction(
				{ ...traversalWorld, solids: cinematicSolids },
				rig.lookAt,
				rig.position,
				cameraWorldOffset,
			);
			return fraction > 0.05 && fraction < 1
				? applyCameraClearance(rig, fraction * 0.92)
				: rig;
		};
		const render = () => {
			const frameCallbackStartedAt = performance.now();
			const now = performance.now();
			const deltaMs = now - lastFrameMs;
			lastFrameMs = now;
			diagnostics.recordFrameInterval(deltaMs);

			const request = pendingCutsceneRef.current;
			const sequence = request?.cutscene.cinematic;
			const previousView = visibleCameraRigRef.current ?? cameraRig;
			let cinematic =
				cinematicPlaybackRef.current?.sequence.areaId === area.id
					? cinematicPlaybackRef.current
					: undefined;
			if (request && sequence?.areaId === area.id) {
				if (cinematic?.request !== request) {
					cinematic = {
						request,
						sequence,
						requestedAt: now,
						durationMs: getCinematicDuration(sequence),
						entry: previousView,
						last: previousView,
					};
					cinematicPlaybackRef.current = cinematic;
				}
				if (
					cinematic.startMs === undefined &&
					(!sequence.cues?.some((cue) => cue.type === "actor") ||
						now - cinematic.requestedAt >= CINEMATIC_ASSET_WAIT_MS ||
						(!assetsLoading &&
							![...characterAnimationControllers.values()].some(
								(controller) => controller.getStats().loadingSourceCount > 0,
							)))
				)
					cinematic.startMs = now;
			}
			const activeCinematic =
				request && cinematic?.request === request ? cinematic : undefined;
			const preview = cinematicPreview?.current;
			if (
				preview &&
				!previewReady &&
				(now - cinematicPreviewStartedAt.current >= CINEMATIC_ASSET_WAIT_MS ||
					(!assetsLoading &&
						![...characterAnimationControllers.values()].some(
							(controller) => controller.getStats().loadingSourceCount > 0,
						)))
			) {
				previewReady = true;
				preview.onReady();
			}
			const elapsedMs = preview
				? preview.timeMs
				: activeCinematic?.startMs === undefined
					? undefined
					: now - activeCinematic.startMs - CINEMATIC_BLEND_MS;
			const cueSequence = preview?.sequence ?? activeCinematic?.sequence;
			const cues =
				cueSequence?.cues?.length && elapsedMs !== undefined && elapsedMs >= 0
					? sampleCinematicCues(cueSequence, elapsedMs)
					: undefined;
			if (activeCinematic) {
				if (cinematicSubtitleRef.current !== cues?.subtitle) {
					cinematicSubtitleRef.current = cues?.subtitle;
					setCinematicSubtitle(cues?.subtitle);
				}
				audio.sync(cues?.audio, elapsedMs ?? 0);
			} else if (preview) {
				audio.sync(
					previewReady && preview.playing ? cues?.audio : undefined,
					preview.timeMs,
					previewSeekRevision !== preview.seekRevision,
				);
				previewSeekRevision = preview.seekRevision;
			}

			// The scene owns a terrain lookup already. Reuse it for every actor
			// and the camera instead of allocating full tile maps per frame.
			const landed = advancePlayerLocomotion(session, deltaMs / 1000, now);
			if (
				landed &&
				!isRuntimeGameplayBlocked(session, gameplayBlocked(session))
			) {
				observeQuestLocation(session, handleProgressionEvent);
				const touch = findTouchInteractableTarget({
					project: session.project,
					area,
					playerPosition: session.playerPosition,
					runtimeState: session.runtimeState,
					collectedPickupIds: session.collectedPickupIds,
					defeatedNpcIds: session.defeatedNpcIds,
				});
				if (touch) runTouchTarget(touch);
				checkRuntimeWaitingTrigger(
					session,
					handleProgressionEvent,
					findPlayerWaitingTriggerTargets(
						session,
						area,
						session.playerPosition,
					),
				);
			}
			tickStory(session, deltaMs);
			const visualUpdateStartedAt = performance.now();
			updateRuntimeBowDraw(session, now, gameplayBlocked(session));
			characterAnimationControllers
				.get("runtime_player")
				?.syncBowDraw(session.bowDraw?.charge);
			const chargeMeter = bowChargeRef.current;
			if (chargeMeter) {
				chargeMeter.hidden = !session.bowDraw;
				chargeMeter.value = session.bowDraw?.charge ?? 0;
			}
			const playerVisual =
				playerVisualRef.current ??
				resetVisualEntityState(
					session.currentAreaId,
					session.playerPosition,
					session.playerFacing,
				);
			const playerVisualGridPosition = getVisualGridPosition(playerVisual, now);
			const traversal = session.traversal;
			const playerMoving =
				!playerVisualGridPosition.done ||
				!!(
					traversal &&
					isTraversalMoving(
						traversal,
						now,
						heldMovementKeys.current.size > 0 && !gameplayBlocked(session),
					)
				);
			setPlayerSprint(
				session,
				heldSprintKeys.current.size > 0,
				playerMoving,
				gameplayBlocked(session),
			);
			const support = traversal
				? sampleTraversalMotion(traversal, now)
				: undefined;
			const grounded =
				support && traversal
					? { ...support, height: traversal.motion.height }
					: undefined;
			const playerVisualPosition =
				grounded ?? playerVisualGridPosition.position;
			const riddenId = session.playerVehicleState.active
				? session.playerVehicleState.vehicleObjectInstanceId
				: undefined;
			const mount = riddenId ? vehicles.get(riddenId) : undefined;
			const ridingHorse =
				session.playerVehicleState.vehicleType === "horse" &&
				!!mount?.mountRider;
			let horseTurn = 0;
			if (lastRiddenId && riddenId !== lastRiddenId) {
				const parked = vehicles.get(lastRiddenId);
				if (parked) {
					setObjectBasePosition(
						parked.group,
						area,
						parked.parkedObject,
						terrainRenderMode,
						parked.visual,
						undefined,
						traversalWorld.sampler,
					);
					characterAnimationControllers.get(lastRiddenId)?.sync({
						defeated: false,
						moving: false,
					});
				}
			}
			lastRiddenId = riddenId;
			if (mount && riddenId) {
				setObjectBasePosition(
					mount.group,
					area,
					playerVisualPosition,
					terrainRenderMode,
					mount.visual,
					grounded?.height,
					traversalWorld.sampler,
				);
				const previousYaw = mount.group.rotation.y;
				mount.group.rotation.y = advancePlayerYaw(
					mount.group.rotation.y,
					resolveThreeCharacterFacingYaw(playerVisual.facing, mount.visual),
					deltaMs,
					{},
				);
				horseTurn =
					deltaMs > 0
						? (mount.group.rotation.y - previousYaw) / (deltaMs / 1000)
						: 0;
				if (session.playerVehicleState.vehicleType === "boat") {
					mount.group.position.y += 0.022 * Math.sin(now * 0.0025);
				}
				characterAnimationControllers.get(riddenId)?.sync({
					defeated: false,
					moving: playerMoving,
					sprinting: traversal?.motion.sprinting,
					movementSpeed: traversal?.motion.speed,
				});
			}
			const playerMark = !mount ? cueSequence?.playerMark : undefined;
			setObjectBasePosition(
				playerMesh,
				area,
				playerMark ?? playerVisualPosition,
				terrainRenderMode,
				playerRenderVisual,
				playerMark ? undefined : grounded?.height,
				traversalWorld.sampler,
			);
			collisionDebug.visible = showCollisionRef.current;
			if (grounded) {
				host.dataset.traversal = JSON.stringify({
					...grounded,
					motion: traversal?.motion,
					supportHeight: support?.height,
					rootY: playerMesh.position.y,
					moving: playerMoving,
					grid: session.playerPosition,
					reason: traversal?.lastReason,
				});
			}
			const playerAction = characterAnimationControllers
				.get("runtime_player")
				?.getStats().semanticState;
			const attacking = playerAction === "attack";
			if (session.bowDraw && bowAimRef.current)
				attackFacingRef.current = {
					x: bowAimRef.current.direction.x,
					y: bowAimRef.current.direction.z,
				};
			if (!attacking) attackFacingRef.current = null;
			if (playerAction !== "defeated" && playerAction !== "hit") {
				playerMesh.rotation.y = advancePlayerYaw(
					playerMesh.rotation.y,
					resolveThreeCharacterFacingYaw(
						attacking
							? (attackFacingRef.current ?? session.playerFacing)
							: playerVisual.facing,
						playerRenderVisual,
					),
					deltaMs,
					{
						attacking,
						sprinting: traversal?.motion.sprinting,
						airborne: isPlayerAirborne(session),
					},
				);
			}
			if (
				interactionTarget &&
				(playerAction === "interact" || playerAction === "pickup")
			) {
				const yaw = interactionFacingYaw(
					{ x: playerMesh.position.x, y: playerMesh.position.z },
					interactionTarget,
					playerRenderVisual?.rotationOffset,
				);
				if (yaw !== undefined) playerMesh.rotation.y = yaw;
			} else interactionTarget = undefined;
			const playerActor = cues?.actors.get("runtime_player")?.cue;
			if (!mount && playerActor?.face)
				applyCinematicFacing(
					"runtime_player",
					playerMesh,
					playerActor,
					playerRenderVisual,
					deltaMs,
				);
			else cinematicActorFacing.delete("runtime_player");
			playerVisualRef.current = settleVisualEntityState(playerVisual, now);

			npcRenderGroups.forEach((group, npcId) => {
				const npcVisual = npcVisualsRef.current.get(npcId);
				if (!npcVisual || npcVisual.areaId !== area.id) {
					return;
				}
				const npcVisualGridPosition = getVisualGridPosition(npcVisual, now);
				const npcPosition = npcVisualGridPosition.position;
				const visual = npcRenderVisuals.get(npcId);
				setObjectBasePosition(
					group,
					area,
					npcPosition,
					terrainRenderMode,
					visual,
					sampleTraversalTerrain(traversalWorld, npcPosition),
					traversalWorld.sampler,
				);
				setObjectFacing(group, npcVisual.facing, visual);
				applyCinematicFacing(
					npcId,
					group,
					cues?.actors.get(npcId)?.cue,
					visual,
					deltaMs,
				);
				npcVisualsRef.current.set(
					npcId,
					settleVisualEntityState(npcVisual, now),
				);
				characterAnimationControllers.get(npcId)?.sync({
					defeated: session.defeatedNpcIds.has(npcId),
					moving: !npcVisualGridPosition.done,
				});
			});
			const animationUpdateStartedAt = performance.now();
			const playerAnimation = characterAnimationControllers
				.get("runtime_player")
				?.getStats();
			// A sword in the reaching hand intersects containers. Hide only this cosmetic action.
			weaponAttachment.sync(
				getEquippedWeapon(session),
				!!mount ||
					playerAnimation?.semanticState === "interact" ||
					playerAnimation?.semanticState === "pickup",
			);
			if (import.meta.env.DEV)
				host.dataset.weapon = JSON.stringify({
					...weaponAttachment.getStats(),
					equippedWeaponId: getEquippedWeapon(session)
						? session.equippedWeaponId
						: undefined,
					activeClip: playerAnimation?.activeClip,
					bowPhase: playerAnimation?.bowPhase,
					clipTime: playerAnimation?.clipTime,
					semanticState: playerAnimation?.semanticState,
				});
			characterAnimationControllers.get("runtime_player")?.sync({
				defeated: playerDefeatedRef.current || session.runtimePlayerHealth <= 0,
				moving: !mount && playerMoving,
				seated: !!mount?.mountRider,
				sprinting: traversal?.motion.sprinting,
				airborne: isPlayerAirborne(session),
				movementPhase: traversal?.motion.phase,
				movementSpeed: traversal?.motion.speed,
			});
			characterAnimationControllers.forEach((controller, id) => {
				const actor = cues?.actors.get(id);
				if (actor?.cue.animation) {
					controller.setCinematicAnimation?.(
						actor.cue.animation,
						actor.index,
						preview ? (preview.timeMs - actor.cue.startMs) / 1000 : undefined,
					);
					animatedActors.add(id);
				} else if (animatedActors.delete(id)) {
					controller.setCinematicAnimation?.(
						undefined,
						undefined,
						preview ? 0 : undefined,
					);
				}
				if (
					id === "runtime_player" &&
					!actor?.cue.animation &&
					session.projectiles?.pending &&
					isRuntimeGameplayBlocked(session, gameplayBlocked(session))
				)
					return;
				if (!preview || !actor?.cue.animation)
					controller.update(deltaMs / 1000);
			});
			if (import.meta.env.DEV)
				host.dataset.npcs = JSON.stringify(
					area.npcs.map((npc) => {
						const group = npcRenderGroups.get(npc.id);
						const animation = characterAnimationControllers
							.get(npc.id)
							?.getStats();
						return {
							id: npc.id,
							x: npc.x,
							y: npc.y,
							facing: npc.facing,
							health: session.runtimeState.npcs[npc.id]?.health,
							position: group?.position.toArray(),
							yaw: group?.rotation.y,
							animation: animation?.semanticState,
							clip: animation?.activeClip,
							clipTime: animation?.clipTime,
						};
					}),
				);
			if (mount?.mountRider) {
				playerMesh.rotation.y = seatRiderHeading(
					mount.group.rotation.y,
					threeVisualRotationOffsetToRadians(mount.visual),
					threeVisualRotationOffsetToRadians(playerRenderVisual),
				);
				const leanAlpha = getFrameLerpAlpha(deltaMs, 12);
				const turnLean =
					ridingHorse && playerMoving
						? THREE.MathUtils.clamp(-horseTurn * 0.015, -0.14, 0.14)
						: 0;
				const forwardLean =
					ridingHorse && playerMoving
						? traversal?.motion.sprinting
							? 0.12
							: 0.05
						: 0;
				riderLean += (turnLean - riderLean) * leanAlpha;
				riderPitch += (forwardLean - riderPitch) * leanAlpha;
				playerMesh.rotation.set(
					riderPitch,
					playerMesh.rotation.y,
					riderLean,
					"YXZ",
				);
				mount.mountRider(playerMesh, riderHips);
			} else if (mount) {
				playerMesh.position.y = mount.group.position.y + 0.35;
			} else if (riderPitch || riderLean) {
				riderPitch = 0;
				riderLean = 0;
				playerMesh.rotation.x = 0;
				playerMesh.rotation.z = 0;
			}
			if (import.meta.env.DEV) {
				if (mount && riddenId) {
					host.dataset.vehicle = JSON.stringify({
						id: riddenId,
						position: mount.group.position.toArray(),
						yaw: mount.group.rotation.y,
						riderPosition: playerMesh.position.toArray(),
						riderYaw: playerMesh.rotation.y,
						riderLean,
						riderClip: characterAnimationControllers
							.get("runtime_player")
							?.getStats().activeClip,
						gaitClip: characterAnimationControllers.get(riddenId)?.getStats()
							.activeClip,
					});
				} else delete host.dataset.vehicle;
			}
			weaponAttachment.updateGrip();
			if (gameOverRef.current) session.projectiles = undefined;
			if (session.projectiles) {
				const body = {
					x: playerMesh.position.x - cameraWorldOffset.x,
					y:
						(grounded?.height ??
							traversalWorld.sampler.sampleSurfaceY(
								playerVisualPosition,
								terrainRenderMode,
							)) + 1.25,
					z: playerMesh.position.z - cameraWorldOffset.z,
				};
				const socket = weaponAttachment.getProjectileSpawn();
				const facing = bowAimRef.current?.direction ?? { x: 0, y: 0, z: 1 };
				const length = Math.hypot(facing.x, facing.z) || 1;
				const muzzle = socket
					? {
							x: socket.x - cameraWorldOffset.x,
							y: socket.y,
							z: socket.z - cameraWorldOffset.z,
						}
					: {
							x: body.x + (facing.x / length) * 0.45,
							y: body.y,
							z: body.z + (facing.z / length) * 0.45,
						};
				advanceRuntimeProjectiles(
					session,
					area,
					traversalWorld,
					deltaMs,
					{ body, muzzle },
					handleCombatEvent,
					isRuntimeGameplayBlocked(session, gameplayBlocked(session)),
				);
			}
			arrowPresentation?.sync(session.projectiles?.arrows ?? []);
			if (import.meta.env.DEV && arrowPresentation)
				host.dataset.projectiles = JSON.stringify({
					...arrowPresentation.getStats(),
					active: session.projectiles?.arrows.length ?? 0,
					pending: !!session.projectiles?.pending,
					draw: session.bowDraw,
					spawned: session.projectiles?.spawned ?? 0,
					removed: session.projectiles?.removed ?? 0,
					lastImpact: session.projectiles?.lastImpact,
					arrows: session.projectiles?.arrows.map((a) => ({
						id: a.id,
						position: a.position,
						direction: a.direction,
						velocity: a.velocity,
						damage: a.damage,
					})),
				});
			for (const [id, prop] of propAnimations) {
				prop.controller.setOpened(
					session.openedObjectIds.has(id) ||
						!!(prop.flag && session.runtimeState.flags[prop.flag]),
				);
				prop.controller.update(deltaMs / 1000);
			}
			if (import.meta.env.DEV)
				host.dataset.interactionProps = JSON.stringify({
					props: [...propAnimations].map(([id, p]) => ({
						id,
						...p.controller.getStats(),
					})),
					visibleIds: [...markerGroups.keys()],
					playerYaw: playerMesh.rotation.y,
				});
			for (const [npcId, deadline] of dyingNpcs) {
				const death = characterAnimationControllers
					.get(npcId)
					?.getDefeatPlayback();
				if (!death || death.finished || now >= deadline)
					removeNpcPresentation(npcId);
			}
			if (import.meta.env.DEV)
				host.dataset.dyingNpcs = JSON.stringify([...dyingNpcs.keys()]);
			updateCharacterAnimationDiagnostics();
			diagnostics.recordCharacterAnimationUpdate(
				performance.now() - animationUpdateStartedAt,
			);

			if (
				cameraModeRef.current === "follow" &&
				threeCameraConfig.style === "thirdPerson"
			) {
				thirdPersonRuntimeLookRef.current = advanceThirdPersonMouseLook(
					thirdPersonRuntimeLookRef.current,
					getFrameLerpAlpha(deltaMs, 30),
				);
			}
			diagnostics.recordVisualUpdate(performance.now() - visualUpdateStartedAt);

			const cameraUpdateStartedAt = performance.now();
			const cameraAnchor = {
				...getVisualPlayerCenter(
					area,
					playerVisualPosition,
					terrainRenderMode,
					traversalWorld.sampler,
				),
				...(mount
					? { y: playerMesh.position.y + 0.625 }
					: grounded
						? { y: grounded.height + 0.625 }
						: {}),
			};
			const bowFraming =
				!mount &&
				getEquippedWeapon(session)?.id === "bow" &&
				threeCameraConfig.style === "thirdPerson";
			const nextCameraTarget = getFollowCameraTarget(
				cameraAnchor,
				cameraFacingRef.current ?? session.playerFacing,
				mount?.mountRider
					? {
							...threeCameraConfig,
							distance: threeCameraConfig.distance + 1.4,
							lookAtHeight: threeCameraConfig.lookAtHeight - 0.35,
						}
					: bowFraming
						? {
								...threeCameraConfig,
								lookAtHeight: Math.max(1, threeCameraConfig.lookAtHeight),
							}
						: threeCameraConfig,
				thirdPersonRuntimeLookRef.current,
			);
			if (bowFraming) {
				// A small shoulder shift clears the centre reticle; the existing rig,
				// damping, pitch limits and obstruction still own the camera.
				const dx = nextCameraTarget.lookAt.x - nextCameraTarget.position.x,
					dz = nextCameraTarget.lookAt.z - nextCameraTarget.position.z;
				const length = Math.hypot(dx, dz) || 1;
				for (const point of [
					nextCameraTarget.position,
					nextCameraTarget.lookAt,
				]) {
					point.x -= (dz / length) * 0.45;
					point.z += (dx / length) * 0.45;
				}
			}
			let view: CameraFollowRig;
			if (cameraModeRef.current === "inspect") {
				view = getInspectCameraRig();
			} else {
				if (threeCameraConfig.style === "thirdPerson") {
					if (!cameraFocusRef.current) cameraClearance = 1;
					const focus = advanceThirdPersonFocus(
						cameraFocusRef.current,
						cameraAnchor,
						{ ...cameraAnchor, y: nextCameraTarget.lookAt.y },
						deltaMs,
						threeCameraConfig.followSmoothing,
						threeCameraConfig.lookSmoothing,
					);
					cameraFocusRef.current = focus;
					// At steep pitch the projected boom is short. Separate anchor/look
					// translation lag could cross that ray while sprinting and flip yaw.
					const skyTranslation = Math.min(
						1,
						Math.max(
							0,
							-getThirdPersonMouseLookPitchDegrees(
								threeCameraConfig.pitchDegrees,
								thirdPersonRuntimeLookRef.current,
							) / 45,
						),
					);
					cameraRig = {
						lookAt: {
							x:
								focus.lookAt.x +
								(focus.position.x - focus.lookAt.x) * skyTranslation +
								nextCameraTarget.lookAt.x -
								cameraAnchor.x,
							y: focus.lookAt.y,
							z:
								focus.lookAt.z +
								(focus.position.z - focus.lookAt.z) * skyTranslation +
								nextCameraTarget.lookAt.z -
								cameraAnchor.z,
						},
						position: {
							x:
								focus.position.x + nextCameraTarget.position.x - cameraAnchor.x,
							y:
								focus.position.y + nextCameraTarget.position.y - cameraAnchor.y,
							z:
								focus.position.z + nextCameraTarget.position.z - cameraAnchor.z,
						},
					};
					// The bounded sky-look setback (and existing bow offset) must not
					// move the obstruction ray's origin through a nearby wall.
					const pivotFraction =
						Math.hypot(
							cameraRig.lookAt.x - focus.lookAt.x,
							cameraRig.lookAt.z - focus.lookAt.z,
						) < 1e-8
							? 1
							: getCameraClearFraction(
									traversalWorld,
									focus.lookAt,
									cameraRig.lookAt,
									cameraWorldOffset,
								);
					// Leave room for a nonzero view ray even when the translated
					// target itself meets a wall. Exact contact collapses the boom.
					const pivotClearance = pivotFraction < 1 ? pivotFraction * 0.9 : 1;
					for (const axis of ["x", "z"] as const) {
						const correction =
							(cameraRig.lookAt[axis] - focus.lookAt[axis]) *
							(1 - pivotClearance);
						cameraRig.lookAt[axis] -= correction;
						cameraRig.position[axis] -= correction;
					}
					cameraClearance = advanceCameraClearance(
						cameraClearance,
						getCameraClearFraction(
							traversalWorld,
							cameraRig.lookAt,
							cameraRig.position,
							cameraWorldOffset,
						),
						deltaMs,
					);
					cameraRig = applyCameraClearance(cameraRig, cameraClearance);
				} else
					cameraRig = advanceCameraFollowRig(
						cameraRigRef.current ?? cameraRig,
						nextCameraTarget,
						getFrameLerpAlpha(deltaMs),
					);
				cameraRigRef.current = cameraRig;
				view = cameraRig;
			}
			let fov = DEFAULT_CINEMATIC_FOV;
			if (activeCinematic && elapsedMs !== undefined) {
				if (elapsedMs < activeCinematic.durationMs) {
					const { sequence } = activeCinematic;
					const sample = sampleCinematicShot(sequence, elapsedMs, true);
					if (sample) {
						activeCinematic.last = cinematicBlend(
							activeCinematic.entry,
							cinematicCameraView(sample),
							(elapsedMs + CINEMATIC_BLEND_MS) / CINEMATIC_BLEND_MS,
						);
						view = activeCinematic.last;
						fov = sample.shot.fov ?? DEFAULT_CINEMATIC_FOV;
					}
				} else finishCutscene(activeCinematic.request, "finished");
			}
			if (cinematic && cinematic.request !== pendingCutsceneRef.current) {
				cinematic.returnMs ??= now;
				const progress = (now - cinematic.returnMs) / CINEMATIC_BLEND_MS;
				if (progress < 1) view = cinematicBlend(cinematic.last, view, progress);
				else cinematicPlaybackRef.current = undefined;
			}
			if (preview && previewOrbit) {
				const sample = sampleCinematicShot(
					preview.sequence,
					preview.timeMs,
					true,
				);
				if (sample) {
					view = cinematicCameraView(sample);
					fov = sample.shot.fov ?? DEFAULT_CINEMATIC_FOV;
				}
				if (preview.orbit) {
					if (!previewOrbit.enabled) {
						if (preview.currentView) {
							view = {
								position: cinematicPointToWorld(preview.currentView.position),
								lookAt: cinematicPointToWorld(preview.currentView.lookAt),
							};
						}
						applyCameraRig(view);
						previewOrbit.target.copy(view.lookAt);
						previewOrbit.enabled = true;
					}
					previewOrbit.update();
					view = { position: camera.position, lookAt: previewOrbit.target };
				} else previewOrbit.enabled = false;
				preview.currentView = {
					position: cinematicPointToGrid(view.position),
					lookAt: cinematicPointToGrid(view.lookAt),
				};
				preview.currentFov = fov;
				if (import.meta.env.DEV)
					host.dataset.cinematicView = JSON.stringify(preview.currentView);
			}
			if (camera.fov !== fov) {
				camera.fov = fov;
				camera.updateProjectionMatrix();
			}
			applyCameraRig(view);
			if (import.meta.env.DEV)
				host.dataset.cameraFeel = JSON.stringify({
					mode: cameraModeRef.current,
					yaw: getThirdPersonYawDegrees(
						cameraFacingRef.current ?? session.playerFacing,
						threeCameraConfig,
						thirdPersonRuntimeLookRef.current,
					),
					pitch: getThirdPersonMouseLookPitchDegrees(
						threeCameraConfig.pitchDegrees,
						thirdPersonRuntimeLookRef.current,
					),
					playerYaw: playerMesh.rotation.y,
					facing: session.playerFacing,
					desiredFacing: playerVisual.facing,
					clearance: cameraClearance,
					target: nextCameraTarget,
					actual: visibleCameraRigRef.current,
				});
			diagnostics.recordCameraUpdate(performance.now() - cameraUpdateStartedAt);
			// Actual visible centre ray, including camera obstruction and orbit damping.
			const visibleRig = visibleCameraRigRef.current;
			if (visibleRig)
				bowAimRef.current = {
					origin: {
						x: visibleRig.position.x - cameraWorldOffset.x,
						y: visibleRig.position.y,
						z: visibleRig.position.z - cameraWorldOffset.z,
					},
					direction: {
						x: visibleRig.lookAt.x - visibleRig.position.x,
						y: visibleRig.lookAt.y - visibleRig.position.y,
						z: visibleRig.lookAt.z - visibleRig.position.z,
					},
				};
			if (
				waterSurfaceMeshCount > 0 ||
				coastlinePresentation.meshes.length > 0
			) {
				const waterUpdateStartedAt = performance.now();
				updateWaterPresentation(waterPresentation, now);
				diagnostics.recordWaterUpdate(performance.now() - waterUpdateStartedAt);
			}
			const renderStartedAt = performance.now();
			if (moonShadow && now - lastMoonShadowMs >= 32) {
				moonShadow.needsUpdate = true;
				lastMoonShadowMs = now;
			}
			renderer.render(scene, camera);
			for (const label of openedLabels) {
				if (
					!session.openedObjectIds.has(label.id) &&
					!(label.flag && session.runtimeState.flags[label.flag])
				) {
					label.element.hidden = true;
					continue;
				}
				const point = label.position.clone().project(camera);
				label.element.style.left = `${((point.x + 1) * host.clientWidth) / 2}px`;
				label.element.style.top = `${((1 - point.y) * host.clientHeight) / 2}px`;
				label.element.hidden = point.z > 1 || point.z < -1;
			}
			diagnostics.recordRenderCall(performance.now() - renderStartedAt);
			diagnostics.recordRendererInfo(renderer.info);
			animationFrame = window.requestAnimationFrame(render);
			diagnostics.recordFrameCallback(
				performance.now() - frameCallbackStartedAt,
			);
		};
		diagnostics.recordSceneBuild(
			rebuildReason,
			performance.now() - sceneBuildStartedAt,
		);
		diagnostics.recordRafLoopStart(rebuildReason);
		render();

		return () => {
			audio.dispose();
			previewOrbit?.dispose();
			if (
				cinematicPreview?.current.getSubjectGeometry === measureSubject &&
				cinematicPreview
			)
				cinematicPreview.current.getSubjectGeometry = undefined;
			if (stopCinematicMediaRef.current === stopCinematicMedia)
				stopCinematicMediaRef.current = null;
			if (physicalInteractionRef.current === presentPhysicalInteraction)
				physicalInteractionRef.current = null;
			weaponAttachment.dispose();
			for (const prop of propAnimations.values()) prop.controller.dispose();
			diagnostics.recordRafLoopCancel(rebuildReason);
			for (const label of openedLabels) label.element.remove();
			diagnostics.recordSceneCleanup();
			if (removeNpcPresentationRef.current === finishNpcPresentation) {
				removeNpcPresentationRef.current = null;
			}
			for (const npcId of dyingNpcs.keys()) removeNpcPresentation(npcId);
			window.cancelAnimationFrame(animationFrame);
			renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
			arrowPresentation?.dispose();
			bowAimRef.current = null;
			cancelRuntimeBowDraw(session);
			session.projectiles = undefined;
			window.removeEventListener("pointermove", handlePointerMove);
			inputDisposed = true;
			if (requestMouseLookRef.current === requestMouseLook)
				requestMouseLookRef.current = null;
			resumeInventoryMouseLookRef.current = false;
			setMouseLookActive(false);
			if (pointerLockCanvasRef.current === renderer.domElement)
				pointerLockCanvasRef.current = null;
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener(
				"pointerlockchange",
				handlePointerLockChange,
			);
			document.removeEventListener("pointerlockerror", handlePointerLockError);
			window.removeEventListener("blur", handleFocusLoss);
			renderer.domElement.removeEventListener("pointerup", handlePointerUp);
			renderer.domElement.removeEventListener("wheel", handleWheel);
			characterAnimationControllers.forEach((controller) => {
				controller.dispose();
			});
			if (
				characterAnimationControllersRef.current ===
				characterAnimationControllers
			) {
				characterAnimationControllersRef.current = new Map();
			}
			renderer.dispose();
			atmosphere.dispose();
			viewportObserver?.disconnect();
			groundPresentation.dispose();
			for (const result of [...markerRenderResults, playerRenderResult])
				result.disposePresentation?.();
			const disposeTracker: ThreeResourceDisposeTracker = {
				geometries: new Set(),
				materials: new Set(),
			};
			disposePlaceholderObject(collisionDebug, disposeTracker);
			renderObjects.forEach((entry) => {
				if (entry.disposeResources) {
					disposePlaceholderObject(entry.object, disposeTracker);
				}
			});
			if (renderer.domElement.parentElement === host) {
				host.removeChild(renderer.domElement);
			}
		};
	}, [renderVersion, terrainRenderMode, cinematicPreview]);

	const session = getSession();
	const area = session ? getArea(session) : undefined;
	const currencyEntries = getCurrencyHudEntries(project, inventory);
	const activeShop =
		session?.activeShopId && session
			? session.project.shops.find((shop) => shop.id === session.activeShopId)
			: undefined;
	const runtimeThreeCamera = session?.project.camera.three;
	const isCinematic =
		!!pendingCutscene?.cutscene.cinematic &&
		pendingCutscene.cutscene.cinematic.areaId === area?.id;
	const timedSubtitles =
		isCinematic &&
		pendingCutscene.cutscene.cinematic?.cues?.some(
			(cue) => cue.type === "subtitle",
		);
	const caption = timedSubtitles
		? cinematicSubtitle
		: pendingCutscene?.cutscene;
	const captionSpeaker =
		caption && ("type" in caption ? caption.speaker : caption.speakerName);

	return (
		<div
			className={`three-runtime-panel${isCinematic || cinematicPreview ? " playing-cinematic" : ""}`}
		>
			{missingAssets && (
				<p role="alert">
					A visual asset is unavailable. Restore its project asset files or
					reimport it through Asset Creator. Saved assignments are preserved.
				</p>
			)}
			{session &&
				!session.playerVehicleState.active &&
				getEquippedWeapon(session)?.id === "bow" &&
				!gameplayBlocked(session) &&
				cameraMode === "follow" && (
					<div
						className="runtime-bow-reticle"
						role="img"
						aria-label="Bow aim reticle"
					>
						<progress
							ref={bowChargeRef}
							className="runtime-bow-charge"
							aria-label="Bow draw charge"
							max={1}
							defaultValue={0}
							hidden
						/>
					</div>
				)}
			<div className="three-runtime-host" ref={hostRef}>
				{mountError ? (
					<div className="three-runtime-error">{mountError}</div>
				) : null}
			</div>
			<InventoryNotifications items={project.items} notices={notices} />
			{isInventoryOpen && (
				<InventoryPanel
					items={project.items}
					inventory={inventory}
					equippedWeaponId={session?.equippedWeaponId}
					onEquipWeapon={(itemId) => {
						const current = getSession();
						if (current && equipRuntimeWeapon(current, itemId))
							setHudVersion((v) => v + 1);
						else
							showItemFeedback(
								"Land and finish the current action before equipping.",
							);
					}}
					onClose={toggleInventory}
				/>
			)}
			{primaryPrompt &&
				!isInventoryOpen &&
				!dialogueNode &&
				!pendingCutscene && (
					<div className="runtime-interaction-prompt" role="status">
						{primaryPrompt}
					</div>
				)}
			<ThreePerformanceOverlay
				diagnostics={diagnostics}
				title="3D Runtime Perf"
			/>
			<div
				className="three-runtime-hud"
				data-traversal-target={
					session?.traversal
						? JSON.stringify(session.traversal.position)
						: undefined
				}
			>
				<strong>3D Runtime Experimental</strong>
				<span>{area?.name ?? "No area"}</span>
				<span>
					Pos: {session?.playerPosition.x ?? 0},{" "}
					{session?.playerPosition.y ?? 0}
				</span>
				<span>
					Health {session?.runtimePlayerHealth ?? 0}/
					{session?.playerCombat.maxHealth ?? 0}
				</span>
				{session?.recentEnemy && (
					<span>
						{session.recentEnemy.name} {session.recentEnemy.health}/
						{session.recentEnemy.maxHealth}
					</span>
				)}
				{currencyEntries.map((entry) => (
					<span key={entry.id}>
						{entry.name}: {entry.quantity}
					</span>
				))}
				<span>{status}</span>
				<button
					type="button"
					onClick={toggleInventory}
					disabled={
						!!session &&
						!isInventoryOpen &&
						isRuntimeGameplayBlocked(session, gameplayBlocked(session))
					}
				>
					Inventory <kbd>I</kbd>
				</button>
				<div className="three-runtime-camera-controls">
					<span>
						Camera
						{runtimeThreeCamera?.style === "thirdPerson"
							? " - Third-person"
							: " - Fixed"}
					</span>
					<button
						className={cameraMode === "follow" ? "active" : ""}
						onClick={enterFollowCameraMode}
						type="button"
					>
						Follow Player
					</button>
					<button
						className={cameraMode === "inspect" ? "active" : ""}
						onClick={enterInspectCameraMode}
						type="button"
					>
						Inspect
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
					{cameraMode === "follow" &&
					runtimeThreeCamera?.style === "thirdPerson" ? (
						<button onClick={recenterThirdPersonCamera} type="button">
							Recenter
						</button>
					) : null}
				</div>
				<small>
					{session?.playerVehicleState.active
						? session.playerVehicleState.vehicleType === "horse"
							? "WASD/arrows ride. Hold Shift to canter. E dismounts."
							: "WASD/arrows steer. Press E beside a shore or dock to disembark."
						: "WASD/arrows move. Shift sprints. Space jumps. F attacks; hold and release F for Bow. E interacts."}
				</small>
				{session?.traversal && (
					<details>
						<summary>Traversal debug</summary>
						<label>
							<input
								type="checkbox"
								defaultChecked={showCollisionRef.current}
								onChange={(event) => {
									showCollisionRef.current = event.target.checked;
								}}
							/>{" "}
							Show collision
						</label>
					</details>
				)}
				{cameraMode === "inspect" ? (
					<small>
						Inspect: Alt-drag orbits. Alt-Shift-drag pans. Wheel zooms.
					</small>
				) : runtimeThreeCamera?.style === "thirdPerson" &&
					runtimeThreeCamera.allowRuntimeOrbit ? (
					<>
						<small>
							Click the viewport to look. Esc releases the mouse.
							{mouseLookActive ? " Mouse look active." : ""}
						</small>
						<details className="three-runtime-mouse-settings">
							<summary>Mouse settings</summary>
							<label>
								Sensitivity
								<input
									type="range"
									min={0.25}
									max={2.5}
									step={0.05}
									value={mouseLookOptions.sensitivity}
									onChange={(e) =>
										updateMouseLookOptions({
											sensitivity: e.currentTarget.valueAsNumber,
										})
									}
								/>
								<output>{mouseLookOptions.sensitivity}×</output>
							</label>
							<label>
								<input
									type="checkbox"
									checked={mouseLookOptions.invertX}
									onChange={(e) =>
										updateMouseLookOptions({ invertX: e.currentTarget.checked })
									}
								/>
								Invert horizontal look
							</label>
							<label>
								<input
									type="checkbox"
									checked={mouseLookOptions.invertY}
									onChange={(e) =>
										updateMouseLookOptions({ invertY: e.currentTarget.checked })
									}
								/>
								Invert vertical look
							</label>
						</details>
					</>
				) : null}
			</div>
			{flowLog.length > 0 ? (
				<div className="three-runtime-log">
					<strong>Runtime log</strong>
					{flowLog.map((entry, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: log entries may repeat and have no local state.
						<span key={`${entry}-${index}`}>{entry}</span>
					))}
				</div>
			) : null}
			<QuestObjectiveTracker
				project={project}
				quests={quests}
				className="three-runtime-quests"
			/>
			{activeShop ? (
				<div className="three-runtime-shop">
					<div>
						<strong>{activeShop.name}</strong>
						<button
							onClick={() => {
								const current = getSession();
								if (current) {
									closeRuntimeShop(current, handleObjectEvent);
								}
							}}
							type="button"
						>
							Close
						</button>
					</div>
					{shopMessage ? <p>{shopMessage}</p> : null}
					{activeShop.entries.map((entry) => {
						const item = session?.project.items.find(
							(candidate) => candidate.id === entry.itemId,
						);
						return (
							<button
								key={entry.id}
								onClick={() => {
									const current = getSession();
									if (current) {
										buyRuntimeShopEntry(current, entry.id, handleObjectEvent);
									}
								}}
								type="button"
							>
								Buy {item?.name ?? entry.itemId} ({entry.buyPrice})
							</button>
						);
					})}
				</div>
			) : null}
			{dialogueNode && session?.dialogue && !pendingCutscene ? (
				<div
					className="three-runtime-modal"
					role="dialog"
					aria-label="Conversation"
				>
					<strong>
						{dialogueNode.speaker ??
							session.project.dialogues.find(
								(entry) => entry.id === session.dialogue?.dialogueId,
							)?.name}
					</strong>
					<p>{dialogueNode.text}</p>
					{dialogueNode.type === "choice" ? (
						getAvailableDialogueChoices(
							dialogueNode,
							session.runtimeState,
							session.runtimeQuestState,
						).length ? (
							getAvailableDialogueChoices(
								dialogueNode,
								session.runtimeState,
								session.runtimeQuestState,
							).map((choice) => (
								<button
									key={choice.id}
									type="button"
									onClick={() => advanceConversation(choice.id)}
								>
									{choice.text}
								</button>
							))
						) : (
							<button type="button" onClick={closeDialogue}>
								End conversation
							</button>
						)
					) : (
						<button type="button" onClick={() => advanceConversation()}>
							{dialogueNode.type === "text" && dialogueNode.nextNodeId
								? session.inlineDialogue?.id === session.dialogue.dialogueId
									? "Continue"
									: "Next"
								: session.inlineDialogue?.id === session.dialogue.dialogueId
									? "Close"
									: "End conversation"}
						</button>
					)}
				</div>
			) : null}
			{pendingCutscene ? (
				<div
					className={
						isCinematic ? "three-runtime-cinematic" : "three-runtime-modal"
					}
					role="dialog"
					aria-label={pendingCutscene.cutscene.name}
				>
					<strong>{pendingCutscene.cutscene.name}</strong>
					{isCinematic ? (
						<p
							className="cinematic-subtitle"
							aria-live="polite"
							aria-atomic="true"
						>
							{caption && (
								<>
									{captionSpeaker && (
										<strong>
											{captionSpeaker}
											{" · "}
										</strong>
									)}
									{caption.text}
								</>
							)}
						</p>
					) : (
						<p>{pendingCutscene.cutscene.text}</p>
					)}
					<button onClick={() => finishCutscene(pendingCutscene)} type="button">
						{isCinematic ? "Skip cinematic" : pendingCutscene.continueLabel}
					</button>
				</div>
			) : null}
			{gameOver ? (
				<div className="three-runtime-modal">
					<strong>Play session ended</strong>
					<button onClick={onRestart} type="button">
						Restart
					</button>
				</div>
			) : null}
		</div>
	);
}
