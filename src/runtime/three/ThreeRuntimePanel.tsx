import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getTerrainSurfaceY } from "../../data/terrainHeight";
import { areaEntitiesToMarkers } from "../../editor/sections/entityMarkers";
import { previewGridPositionToThreePoint } from "../../editor/sections/previewMove";
import { terrainTilesToBlocks } from "../../editor/sections/terrainBlocks";
import type {
	Cutscene,
	GameArea,
	GameProject,
	Interaction,
	NPCInstance,
	RuleTrigger,
} from "../../types/game";
import {
	canInteractActivate,
	canTouchActivate,
	findNearestInteractableTarget,
	type InteractableTarget,
	isPickupCollected,
	resolveEventInteraction,
	type TouchInteractableTarget,
} from "../interactionDiscovery";
import { attemptPlayerMove } from "../playerMovementTransaction";
import { fireTrigger } from "../ruleEngine";
import {
	attemptRuntimeCombatAttack,
	type RuntimeCombatEvent,
} from "../runtimeCombat";
import { type RuntimeNpcTickEvent, tickRuntimeNpcs } from "../runtimeNpcTick";
import {
	buyRuntimeShopEntry,
	closeRuntimeShop,
	collectRuntimePickup,
	dismountRuntimeVehicle,
	openRuntimeShop,
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "../runtimeObjectInteractions";
import {
	checkRuntimeWaitingTrigger,
	completeRuntimeProgressionCutscene,
	markRuntimeAreaEntered,
	processRuntimeProgression,
	type RuntimeProgressionEvent,
	syncRuntimeQuestProgress,
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
	createPlaceholderMeshGroup,
	disposePlaceholderObject,
} from "./placeholderMeshes";
import {
	advanceCameraFollowRig,
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

type PendingCutscene = {
	cutscene: Cutscene;
	continueLabel: string;
	onContinue: () => void;
};

type ThreeRuntimePanelProps = {
	project: GameProject;
	onRestart: () => void;
};

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
): VisualWorldPosition {
	const point = previewGridPositionToThreePoint(area, position);
	const terrainX = clampGridCoordinate(position.x, area.width - 1);
	const terrainY = clampGridCoordinate(position.y, area.height - 1);
	return {
		x: point.x,
		y: getTerrainSurfaceY(area, terrainX, terrainY),
		z: point.z,
	};
}

function getVisualPlayerCenter(
	area: GameArea,
	position: VisualGridPosition,
): VisualWorldPosition {
	const base = getVisualWorldBase(area, position);
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
): void {
	const base = getVisualWorldBase(area, position);
	object.position.set(base.x, base.y, base.z);
}

function setObjectFacing(
	object: THREE.Object3D,
	facing: VisualGridPosition,
): void {
	object.rotation.y = facingToYawRadians(facing);
}

function createFacingMarker(color: number, y: number, z: number): THREE.Mesh {
	const marker = new THREE.Mesh(
		new THREE.BoxGeometry(0.16, 0.12, 0.3),
		new THREE.MeshStandardMaterial({ color }),
	);
	marker.position.set(0, y, z);
	return marker;
}

function createRuntimePlayerMesh(): THREE.Group {
	const group = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.32, 0.32, 1.25, 16),
		new THREE.MeshStandardMaterial({ color: 0x38bdf8 }),
	);
	body.position.set(0, 0.625, 0);
	group.add(body);
	group.add(createFacingMarker(0xe0f2fe, 0.78, -0.36));
	return group;
}

export function ThreeRuntimePanel({
	project,
	onRestart,
}: ThreeRuntimePanelProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const sessionRef = useRef<RuntimeSessionState | null>(null);
	const playerVisualRef = useRef<VisualEntityState | null>(null);
	const npcVisualsRef = useRef<Map<string, VisualEntityState>>(new Map());
	const [renderVersion, setRenderVersion] = useState(0);
	const [status, setStatus] = useState("Starting 3D runtime.");
	const [flowLog, setFlowLog] = useState<string[]>([]);
	const [inventory, setInventory] = useState<Record<string, number>>({});
	const [quests, setQuests] = useState<
		Array<{ id: string; name: string; status: string }>
	>([]);
	const [shopMessage, setShopMessage] = useState<string | undefined>();
	const [pendingCutscene, setPendingCutscene] =
		useState<PendingCutscene | null>(null);
	const [gameOver, setGameOver] = useState(false);
	const [mountError, setMountError] = useState<string | null>(null);

	function forceRender() {
		setRenderVersion((version) => version + 1);
	}

	function appendFlow(message: string) {
		setFlowLog((entries) => [message, ...entries].slice(0, 8));
	}

	function getSession(): RuntimeSessionState | null {
		return sessionRef.current;
	}

	function resetPlayerVisual(
		session: RuntimeSessionState | null = getSession(),
	) {
		playerVisualRef.current = session
			? resetVisualEntityState(
					session.currentAreaId,
					session.playerPosition,
					session.playerFacing,
				)
			: null;
	}

	function resetPresentationVisuals(
		session: RuntimeSessionState | null = getSession(),
	) {
		resetPlayerVisual(session);
		npcVisualsRef.current = new Map();
	}

	function syncPlayerVisual(session: RuntimeSessionState): void {
		const visual = playerVisualRef.current;
		if (
			!visual ||
			visual.areaId !== session.currentAreaId ||
			!gridPositionsEqual(
				getVisualStateTargetPosition(visual),
				session.playerPosition,
			)
		) {
			resetPlayerVisual(session);
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
		if (event.type === "inventoryChanged") {
			setInventory(event.inventory);
			return;
		}
		if (event.type === "questsChanged") {
			setQuests(event.quests);
			return;
		}
		if (event.type === "stateChanged") {
			forceRender();
			return;
		}
		if (event.type === "spawnPlayer") {
			resetPlayerVisual(session);
			forceRender();
			return;
		}
		if (event.type === "areaChanged") {
			resetPresentationVisuals(session);
			forceRender();
			return;
		}
		if (event.type === "vehicleLeft") {
			resetPlayerVisual(session);
			forceRender();
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
			forceRender();
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
			setShopMessage(event.message);
			forceRender();
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
				onContinue: () => {
					setPendingCutscene(null);
					event.onDone();
				},
			});
			return;
		}
		if (event.type === "dialogueRequested") {
			setStatus(`Dialogue requested: ${event.dialogueId}.`);
			return;
		}
		if (event.type === "movementModeChanged") {
			setStatus(`Movement mode: ${event.mode}.`);
			forceRender();
			return;
		}
		if (event.type === "gameEnded" || event.type === "gameOver") {
			setGameOver(true);
		}
	}

	function handleObjectEvent(event: RuntimeObjectInteractionEvent): void {
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
			forceRender();
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
			setShopMessage(event.message);
			forceRender();
			return;
		}
		if (event.type === "shopClosed") {
			setShopMessage(undefined);
			forceRender();
			return;
		}
		if (
			event.type === "vehicleBoarded" ||
			event.type === "vehicleDismounted" ||
			event.type === "playerMoved"
		) {
			resetPlayerVisual(session);
			forceRender();
			return;
		}
		if (
			event.type === "pickupCollected" ||
			event.type === "movementModeChanged" ||
			event.type === "objectMoved"
		) {
			forceRender();
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
			forceRender();
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
				forceRender();
			}
			return;
		}
		if (event.type === "stateChanged" || event.type === "combatChanged") {
			forceRender();
			return;
		}
		if (event.type === "gameOver") {
			setGameOver(true);
		}
	}

	function handleCombatEvent(event: RuntimeCombatEvent): void {
		if (event.type === "status") {
			setStatus(event.message);
			return;
		}
		if (event.type === "flowLog") {
			appendFlow(event.message);
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
			forceRender();
			return;
		}
		if (
			event.type === "stateChanged" ||
			event.type === "combatChanged" ||
			event.type === "npcDamaged"
		) {
			forceRender();
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

	function runDirectInteraction(interaction: Interaction, label: string): void {
		const session = getSession();
		if (!session || interaction.activationMode === "disabled") {
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
			setStatus(`Dialogue requested: ${interaction.dialogueId ?? label}.`);
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
			syncRuntimeQuestProgress(session, handleProgressionEvent);
			setStatus(`${interaction.flag}: ${value ? "true" : "false"}.`);
			forceRender();
			return;
		}

		if (interaction.mode) {
			session.currentMovementMode = interaction.mode;
			setStatus(`Movement mode: ${interaction.mode}.`);
			forceRender();
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
					runRuntimeObjectBehaviour(session, target.object, handleObjectEvent);
					if (target.interaction && canTouchActivate(target.interaction)) {
						runDirectInteraction(target.interaction, target.label);
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
					runDirectInteraction(interaction, target.label);
				}
			},
		);
		return true;
	}

	function handleMove(direction: RuntimeGridPosition): void {
		const session = getSession();
		if (!session || pendingCutscene || gameOver) {
			return;
		}

		const move = attemptPlayerMove(session, direction);
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

		playerVisualRef.current = startVisualGridMove(
			playerVisualRef.current ?? undefined,
			session.currentAreaId,
			{
				durationMs: move.moveDurationMs,
				facing: move.facing,
				from: move.from,
				to: move.to,
			},
			performance.now(),
		);
		setStatus(`Moved to ${move.to.x}, ${move.to.y}.`);
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
		forceRender();
	}

	function handleInteract(): void {
		const session = getSession();
		const area = session ? getArea(session) : undefined;
		if (!session || !area || pendingCutscene || gameOver) {
			return;
		}

		if (session.playerVehicleState.active) {
			dismountRuntimeVehicle(session, handleObjectEvent, area);
			return;
		}

		const target = findNearestInteractableTarget({
			area,
			collectedPickupIds: session.collectedPickupIds,
			defeatedNpcIds: session.defeatedNpcIds,
			playerPosition: session.playerPosition,
			project: session.project,
			runtimeState: session.runtimeState,
		});
		if (!target) {
			setStatus("Nothing to interact with.");
			return;
		}

		if (target.type === "pickup") {
			collectRuntimePickup(session, target.pickup, handleObjectEvent);
			forceRender();
			return;
		}

		fireRuntimeTrigger(
			{ type: "on_interact", targetId: getTargetId(target) },
			() => {
				if (target.type === "object") {
					runRuntimeObjectBehaviour(session, target.object, handleObjectEvent);
				}
				if (target.interaction && canInteractActivate(target.interaction)) {
					runDirectInteraction(target.interaction, target.label);
				} else {
					setStatus(`Interacted with ${target.label}.`);
				}
				forceRender();
			},
		);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: session startup owns fresh runtime state; callbacks read sessionRef.
	useEffect(() => {
		try {
			const session = createRuntimeSession(project);
			sessionRef.current = session;
			resetPresentationVisuals(session);
			setMountError(null);
			setGameOver(false);
			setPendingCutscene(null);
			setFlowLog([]);
			setInventory({ ...session.runtimeState.inventory.items });
			setQuests([]);
			setStatus("3D runtime started.");

			const area = getArea(session);
			if (area) {
				markRuntimeAreaEntered(session, area.id, handleProgressionEvent);
			}
			fireRuntimeTrigger({ type: "on_game_start" }, () =>
				processRuntimeProgression(session, handleProgressionEvent),
			);
			forceRender();
		} catch (error) {
			sessionRef.current = null;
			resetPresentationVisuals(null);
			setMountError(
				error instanceof Error ? error.message : "Could not start 3D runtime.",
			);
		}

		return () => {
			sessionRef.current = null;
			resetPresentationVisuals(null);
		};
	}, [project]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const direction = keyToDirection(event);
			if (direction) {
				event.preventDefault();
				handleMove(direction);
				return;
			}

			if (event.key === " " || event.code === "Space") {
				const session = getSession();
				const area = session ? getArea(session) : undefined;
				if (session && area) {
					event.preventDefault();
					attemptRuntimeCombatAttack(
						session,
						area,
						performance.now(),
						handleCombatEvent,
					);
				}
				return;
			}

			if (event.key.toLowerCase() === "e" || event.key === "Enter") {
				event.preventDefault();
				handleInteract();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: NPC ticking reads current sessionRef state.
	useEffect(() => {
		if (gameOver || pendingCutscene) {
			return undefined;
		}

		const interval = window.setInterval(() => {
			const session = getSession();
			const area = session ? getArea(session) : undefined;
			if (session && area) {
				tickRuntimeNpcs(session, area, performance.now(), handleNpcEvent);
			}
		}, 500);

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

		syncPlayerVisual(session);
		syncNpcVisuals(session, area);

		host.replaceChildren();
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0f172a);
		const camera = new THREE.PerspectiveCamera(55, 4 / 3, 0.1, 1000);
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
		let cameraRig: CameraFollowRig = getCameraFollowTarget(
			getVisualPlayerCenter(area, initialPlayerPosition),
		);
		camera.position.set(
			cameraRig.position.x,
			cameraRig.position.y,
			cameraRig.position.z,
		);
		camera.lookAt(cameraRig.lookAt.x, cameraRig.lookAt.y, cameraRig.lookAt.z);
		scene.add(new THREE.AmbientLight(0xffffff, 0.65));
		const light = new THREE.DirectionalLight(0xffffff, 0.85);
		light.position.set(4, 8, 5);
		scene.add(light);

		const renderObjects: THREE.Object3D[] = [];
		const addRenderObject = (object: THREE.Object3D) => {
			renderObjects.push(object);
			scene.add(object);
		};

		terrainTilesToBlocks(area).forEach((block) => {
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(0.98, block.height, 0.98),
				new THREE.MeshStandardMaterial({
					color: block.color,
					opacity: block.kind === "water" ? 0.76 : 1,
					transparent: block.kind === "water",
				}),
			);
			mesh.position.set(block.threeX, block.yOffset, block.threeZ);
			addRenderObject(mesh);
		});

		const runtimeArea: GameArea = {
			...area,
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
		areaEntitiesToMarkers(runtimeArea, session.project.objects, true).forEach(
			(marker) => {
				const group = createPlaceholderMeshGroup(marker);
				if (marker.kind === "npc") {
					const npcVisual = npcVisualsRef.current.get(marker.id);
					if (npcVisual) {
						group.add(createFacingMarker(0xfef3c7, 0.58, -0.34));
						setObjectBasePosition(
							group,
							area,
							getVisualGridPosition(npcVisual, performance.now()).position,
						);
						setObjectFacing(group, npcVisual.facing);
						npcRenderGroups.set(marker.id, group);
					}
				}
				addRenderObject(group);
			},
		);

		const playerMesh = createRuntimePlayerMesh();
		setObjectBasePosition(playerMesh, area, initialPlayerPosition);
		setObjectFacing(playerMesh, initialPlayerVisual.facing);
		addRenderObject(playerMesh);

		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true });
		} catch (error) {
			setMountError(
				error instanceof Error
					? error.message
					: "Three.js renderer could not be created.",
			);
			return undefined;
		}
		renderer.domElement.setAttribute("aria-label", "Three runtime viewport");
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setSize(host.clientWidth || 640, host.clientHeight || 480, false);
		host.appendChild(renderer.domElement);

		let animationFrame = 0;
		let lastFrameMs = performance.now();
		const render = () => {
			const now = performance.now();
			const deltaMs = now - lastFrameMs;
			lastFrameMs = now;

			const playerVisual =
				playerVisualRef.current ??
				resetVisualEntityState(
					session.currentAreaId,
					session.playerPosition,
					session.playerFacing,
				);
			const playerVisualPosition = getVisualGridPosition(
				playerVisual,
				now,
			).position;
			setObjectBasePosition(playerMesh, area, playerVisualPosition);
			setObjectFacing(playerMesh, playerVisual.facing);
			playerVisualRef.current = settleVisualEntityState(playerVisual, now);

			npcRenderGroups.forEach((group, npcId) => {
				const npcVisual = npcVisualsRef.current.get(npcId);
				if (!npcVisual || npcVisual.areaId !== area.id) {
					return;
				}
				const npcPosition = getVisualGridPosition(npcVisual, now).position;
				setObjectBasePosition(group, area, npcPosition);
				setObjectFacing(group, npcVisual.facing);
				npcVisualsRef.current.set(
					npcId,
					settleVisualEntityState(npcVisual, now),
				);
			});

			const nextCameraTarget = getCameraFollowTarget(
				getVisualPlayerCenter(area, playerVisualPosition),
			);
			cameraRig = advanceCameraFollowRig(
				cameraRig,
				nextCameraTarget,
				getFrameLerpAlpha(deltaMs),
			);
			camera.position.set(
				cameraRig.position.x,
				cameraRig.position.y,
				cameraRig.position.z,
			);
			camera.lookAt(cameraRig.lookAt.x, cameraRig.lookAt.y, cameraRig.lookAt.z);
			renderer.render(scene, camera);
			animationFrame = window.requestAnimationFrame(render);
		};
		render();

		return () => {
			window.cancelAnimationFrame(animationFrame);
			renderer.dispose();
			renderObjects.forEach(disposePlaceholderObject);
			if (renderer.domElement.parentElement === host) {
				host.removeChild(renderer.domElement);
			}
		};
	}, [renderVersion]);

	const session = getSession();
	const area = session ? getArea(session) : undefined;
	const goldCount = inventory.gold_coin ?? 0;
	const activeShop =
		session?.activeShopId && session
			? session.project.shops.find((shop) => shop.id === session.activeShopId)
			: undefined;

	return (
		<div className="three-runtime-panel">
			<div className="three-runtime-host" ref={hostRef}>
				{mountError ? (
					<div className="three-runtime-error">{mountError}</div>
				) : null}
			</div>
			<div className="three-runtime-hud">
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
				<span>Gold: {goldCount}</span>
				<span>{status}</span>
				<small>WASD/arrows move. E interacts. Space attacks.</small>
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
			{quests.length > 0 ? (
				<div className="three-runtime-quests">
					<strong>Quests</strong>
					{quests.slice(0, 3).map((quest) => (
						<span key={quest.id}>
							{quest.name}: {quest.status}
						</span>
					))}
				</div>
			) : null}
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
			{pendingCutscene ? (
				<div className="three-runtime-modal">
					<strong>{pendingCutscene.cutscene.name}</strong>
					<p>{pendingCutscene.cutscene.text}</p>
					<button onClick={pendingCutscene.onContinue} type="button">
						{pendingCutscene.continueLabel}
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
