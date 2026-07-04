import Phaser from "phaser";
import { getOverlayPreset, getStructurePreset } from "../data/mapVisuals";
import {
	backgroundPresets,
	characterSprites,
	getTilePreset,
	getVisualPreset,
	portraitPresets,
} from "../data/presets";
import type {
	Cutscene,
	DialogueDefinition,
	DialogueNode,
	EventBlock,
	GameArea,
	GameProject,
	Interaction,
	MapStructure,
	NPCInstance,
	ObjectInstance,
	PickupObject,
	PixelAsset,
	RuleTrigger,
} from "../types/game";
import type { RuntimeCombatHudState } from "./combat";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
	getDialogueNode,
	type RuntimeDialogueState,
} from "./dialogueEngine";
import {
	canInteractActivate,
	canTouchActivate,
	findNearestInteractableTarget,
	findTouchInteractableTarget,
	type InteractableTarget,
	isPickupCollected,
	resolveObjectBehaviour,
	type TouchInteractableTarget,
} from "./interactionDiscovery";
import type { VehicleMovementConfig } from "./movement";
import { resolveNPCInstance } from "./npcResolver";
import { attemptPlayerMove } from "./playerMovementTransaction";
import type { QuestView } from "./questEngine";
import { fireTrigger, type RuleActionContext } from "./ruleEngine";
import {
	attemptRuntimeCombatAttack,
	type RuntimeCombatEvent,
} from "./runtimeCombat";
import { type RuntimeNpcTickEvent, tickRuntimeNpcs } from "./runtimeNpcTick";
import {
	buyRuntimeShopEntry,
	closeRuntimeShop,
	collectRuntimePickup,
	dismountRuntimeVehicle,
	openRuntimeShop,
	type RuntimeObjectInteractionEvent,
	runRuntimeObjectBehaviour,
} from "./runtimeObjectInteractions";
import {
	checkRuntimeWaitingTrigger,
	completeRuntimeProgressionCutscene,
	markRuntimeAreaEntered,
	processRuntimeProgression,
	type RuntimeProgressionEvent,
	syncRuntimeQuestProgress,
	transitionRuntimeArea,
} from "./runtimeProgression";
import {
	createRuntimeRuleContext,
	type RuntimeRuleEvent,
} from "./runtimeRuleActionDispatcher";
import {
	createRuntimeSession,
	getInitialRuntimeArea,
	type RuntimeSessionState,
} from "./runtimeSession";
import type { RuntimeShopPanelState } from "./shopRuntime";

type WasdKeys = {
	W: Phaser.Input.Keyboard.Key;
	A: Phaser.Input.Keyboard.Key;
	S: Phaser.Input.Keyboard.Key;
	D: Phaser.Input.Keyboard.Key;
};

type InteractKeys = {
	E: Phaser.Input.Keyboard.Key;
	ENTER: Phaser.Input.Keyboard.Key;
};

type CombatKeys = {
	SPACE: Phaser.Input.Keyboard.Key;
};

function hexToNumber(hex: string): number {
	return Phaser.Display.Color.HexStringToColor(hex).color;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function tileKey(x: number, y: number): string {
	return `${x}:${y}`;
}

export class AdventureScene extends Phaser.Scene {
	// Shared runtime session state. Phaser reads from this instead of owning gameplay state.
	private readonly project: GameProject;
	private readonly session: RuntimeSessionState;
	private currentArea: GameArea;
	private tileSize: number;

	// Phaser rendering cache.
	private readonly pixelTextureKeys = new Map<string, string>();
	private worldLayer?: Phaser.GameObjects.Container;
	private uiLayer?: Phaser.GameObjects.Container;
	private uiCamera?: Phaser.Cameras.Scene2D.Camera;
	private playerMarker?: Phaser.GameObjects.Container;
	private statusText?: Phaser.GameObjects.Text;
	private promptText?: Phaser.GameObjects.Text;
	private debugText?: Phaser.GameObjects.Text;
	private readonly npcMarkers = new Map<string, Phaser.GameObjects.Container>();
	private readonly objectMarkers = new Map<
		string,
		Phaser.GameObjects.Container
	>();
	private vehicleVisual?: Phaser.GameObjects.GameObject;

	// Phaser input and animation gating.
	private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd?: WasdKeys;
	private interactKeys?: InteractKeys;
	private combatKeys?: CombatKeys;
	private nextMoveAt = 0;
	private isMoving = false;

	// React/Phaser overlay callbacks and presentation-only modal state.
	private readonly onInventoryChanged?: (
		inventory: Record<string, number>,
	) => void;
	private readonly onQuestsChanged?: (quests: QuestView[]) => void;
	private readonly onShopChanged?: (shop: RuntimeShopPanelState | null) => void;
	private readonly onCombatChanged?: (combat: RuntimeCombatHudState) => void;
	private isCutsceneOpen = false;
	private isDialogueOpen = false;
	private activeDialogue?: {
		container?: Phaser.GameObjects.Container;
		definition: DialogueDefinition;
		state: RuntimeDialogueState;
	};
	private isFinished = false;

	constructor(
		project: GameProject,
		onInventoryChanged?: (inventory: Record<string, number>) => void,
		onQuestsChanged?: (quests: QuestView[]) => void,
		onShopChanged?: (shop: RuntimeShopPanelState | null) => void,
		onCombatChanged?: (combat: RuntimeCombatHudState) => void,
	) {
		super("AdventureScene");
		this.session = createRuntimeSession(project);
		this.project = this.session.project;
		this.currentArea = getInitialRuntimeArea(this.project);
		this.tileSize = this.currentArea.tileSize;
		this.onInventoryChanged = onInventoryChanged;
		this.onQuestsChanged = onQuestsChanged;
		this.onShopChanged = onShopChanged;
		this.onCombatChanged = onCombatChanged;
	}

	private get playerPosition() {
		return this.session.playerPosition;
	}

	private set playerPosition(position: RuntimeSessionState["playerPosition"]) {
		this.session.playerPosition = position;
	}

	private get progressionIndex() {
		return this.session.progressionIndex;
	}

	private set progressionIndex(index: number) {
		this.session.progressionIndex = index;
	}

	private get waitingForTrigger() {
		return this.session.waitingForTrigger;
	}

	private set waitingForTrigger(trigger: RuntimeSessionState["waitingForTrigger"],) {
		this.session.waitingForTrigger = trigger;
	}

	private get runtimeState() {
		return this.session.runtimeState;
	}

	private get runtimeQuestState() {
		return this.session.runtimeQuestState;
	}

	private get collectedPickupIds() {
		return this.session.collectedPickupIds;
	}

	private get openedObjectIds() {
		return this.session.openedObjectIds;
	}

	private get npcMovementStates() {
		return this.session.npcMovementStates;
	}

	private get enemyOrigins() {
		return this.session.enemyOrigins;
	}

	private get enemyContactCooldowns() {
		return this.session.enemyContactCooldowns;
	}

	private get runtimeShopStocks() {
		return this.session.runtimeShopStocks;
	}

	private get defeatedNpcIds() {
		return this.session.defeatedNpcIds;
	}

	private get activeShopId() {
		return this.session.activeShopId;
	}

	private set activeShopId(shopId: RuntimeSessionState["activeShopId"]) {
		this.session.activeShopId = shopId;
	}

	private get currentMovementMode() {
		return this.session.currentMovementMode;
	}

	private set currentMovementMode(mode: RuntimeSessionState["currentMovementMode"],) {
		this.session.currentMovementMode = mode;
	}

	private get playerFacing() {
		return this.session.playerFacing;
	}

	private set playerFacing(facing: RuntimeSessionState["playerFacing"]) {
		this.session.playerFacing = facing;
	}

	private get playerVehicleState() {
		return this.session.playerVehicleState;
	}

	private set playerVehicleState(vehicleState: RuntimeSessionState["playerVehicleState"],) {
		this.session.playerVehicleState = vehicleState;
	}

	private get playerCombat() {
		return this.session.playerCombat;
	}

	private get runtimePlayerHealth() {
		return this.session.runtimePlayerHealth;
	}

	private set runtimePlayerHealth(health: number) {
		this.session.runtimePlayerHealth = health;
	}

	private get recentEnemyHud() {
		return this.session.recentEnemy;
	}

	// Runtime-facing entry points used by React overlays.
	openShop(shopId: string) {
		openRuntimeShop(this.session, shopId, (event) =>
			this.handleRuntimeObjectInteractionEvent(event),
		);
	}

	closeShop() {
		closeRuntimeShop(this.session, (event) =>
			this.handleRuntimeObjectInteractionEvent(event),
		);
	}

	buyShopEntry(entryId: string) {
		buyRuntimeShopEntry(this.session, entryId, (event) =>
			this.handleRuntimeObjectInteractionEvent(event),
		);
	}

	// Phaser scene lifecycle.
	create() {
		this.worldLayer = this.add.container(0, 0);
		this.uiLayer = this.add.container(0, 0).setDepth(1000).setScrollFactor(0);
		this.createPixelTextures();
		this.renderMap();
		this.configureCameras();
		this.createInput();
		this.statusText = this.add
			.text(10, 10, "", {
				backgroundColor: "rgba(24, 24, 27, 0.82)",
				color: "#ffffff",
				fontFamily: "Arial, sans-serif",
				fontSize: "14px",
				padding: { x: 8, y: 5 },
			})
			.setDepth(100)
			.setScrollFactor(0);
		this.uiLayer.add(this.statusText);
		this.promptText = this.add
			.text(this.scale.width / 2, this.scale.height - 22, "", {
				backgroundColor: "rgba(17, 24, 39, 0.86)",
				color: "#ffffff",
				fontFamily: "Arial, sans-serif",
				fontSize: "14px",
				padding: { x: 10, y: 6 },
			})
			.setDepth(110)
			.setOrigin(0.5)
			.setScrollFactor(0);
		this.uiLayer.add(this.promptText);
		this.debugText = this.add
			.text(this.scale.width - 10, 10, "", {
				align: "right",
				backgroundColor: "rgba(17, 24, 39, 0.76)",
				color: "#d1fae5",
				fontFamily: "Arial, sans-serif",
				fontSize: "11px",
				padding: { x: 7, y: 5 },
			})
			.setDepth(105)
			.setOrigin(1, 0)
			.setScrollFactor(0);
		this.uiLayer.add(this.debugText);
		this.updateDebugPanel();
		this.notifyInventoryChanged();
		this.notifyCombatChanged();
		markRuntimeAreaEntered(this.session, this.currentArea.id, (event) =>
			this.handleRuntimeProgressionEvent(event),
		);

		this.fireRuleTrigger({ type: "on_game_start" }, () =>
			this.processProgression(),
		);
	}

	// Input translation into shared runtime transactions.
	update(time: number) {
		if (!this.isCutsceneOpen && !this.isDialogueOpen && !this.isFinished) {
			this.updateNpcMovement(time);
		}

		if (
			!this.playerMarker ||
			this.isCutsceneOpen ||
			this.isDialogueOpen ||
			this.isFinished ||
			this.isMoving ||
			time < this.nextMoveAt
		) {
			return;
		}

		const interactPressed = this.wasInteractPressed();
		if (this.playerVehicleState.active) {
			this.promptText?.setText("Press E to dismount");
			if (interactPressed) {
				this.tryDismountVehicle();
				return;
			}
		}

		const interactable = this.playerVehicleState.active
			? null
			: this.findNearestInteractable();
		if (!this.playerVehicleState.active) {
			this.updatePrompt(interactable);
		}
		if (interactPressed && interactable) {
			const targetId =
				interactable.type === "eventBlock"
					? interactable.eventBlock.id
					: interactable.type === "structure"
						? interactable.structure.id
						: interactable.type === "object"
							? interactable.object.id
							: interactable.type === "npc"
								? interactable.npc.id
								: "";
			if (interactable.type === "pickup") {
				this.collectPickupObject(interactable.pickup);
				return;
			}
			this.fireRuleTrigger({ type: "on_interact", targetId }, () => {
				if (
					interactable.type === "object" &&
					this.runObjectBehaviour(interactable.object)
				) {
					if (
						interactable.interaction &&
						canInteractActivate(interactable.interaction)
					) {
						this.runInteraction(interactable.interaction, interactable.label);
					}
					return;
				}

				if (
					interactable.interaction &&
					canInteractActivate(interactable.interaction)
				) {
					this.runInteraction(interactable.interaction, interactable.label);
				}
			});
			return;
		}

		if (this.wasAttackPressed()) {
			this.tryAttack(time);
			return;
		}

		const direction = this.readDirection();
		if (!direction) {
			return;
		}

		this.tryMove(direction.x, direction.y, time);
	}

	// Phaser input setup.
	private createInput() {
		const keyboard = this.input.keyboard;
		if (!keyboard) {
			return;
		}

		this.cursors = keyboard.createCursorKeys();
		this.wasd = {
			W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
			A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
			S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
			D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
		};
		this.interactKeys = {
			E: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
			ENTER: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
		};
		this.combatKeys = {
			SPACE: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
		};
	}

	// Phaser camera configuration.
	private configureCameras() {
		const screenWidth = this.scale.width;
		const screenHeight = this.scale.height;
		const visibleWorldWidth = clamp(
			Math.round(this.project.camera.viewportWidthTiles) * this.tileSize,
			this.tileSize,
			this.currentArea.width * this.tileSize,
		);
		const visibleWorldHeight = clamp(
			Math.round(this.project.camera.viewportHeightTiles) * this.tileSize,
			this.tileSize,
			this.currentArea.height * this.tileSize,
		);
		const zoom = Math.min(
			screenWidth / visibleWorldWidth,
			screenHeight / visibleWorldHeight,
		);
		const worldViewportWidth = Math.round(visibleWorldWidth * zoom);
		const worldViewportHeight = Math.round(visibleWorldHeight * zoom);
		const worldViewportX = Math.floor((screenWidth - worldViewportWidth) / 2);
		const worldViewportY = Math.floor((screenHeight - worldViewportHeight) / 2);

		this.cameras.main
			.setViewport(
				worldViewportX,
				worldViewportY,
				worldViewportWidth,
				worldViewportHeight,
			)
			.setZoom(zoom)
			.setBounds(
				0,
				0,
				this.currentArea.width * this.tileSize,
				this.currentArea.height * this.tileSize,
			)
			.setRoundPixels(true);

		if (!this.uiCamera) {
			this.uiCamera = this.cameras
				.add(0, 0, screenWidth, screenHeight)
				.setScroll(0, 0);
		} else {
			this.uiCamera
				.setViewport(0, 0, screenWidth, screenHeight)
				.setScroll(0, 0);
		}
		if (this.uiLayer && this.worldLayer) {
			this.cameras.main.ignore(this.uiLayer);
			this.uiCamera.ignore(this.worldLayer);
		}
	}

	private configurePlayerCamera(centerX: number, centerY: number) {
		const camera = this.cameras.main;
		const config = this.project.camera;
		const deadzoneWidth =
			(config.deadzoneWidthTiles ?? 0) * this.tileSize * camera.zoom;
		const deadzoneHeight =
			(config.deadzoneHeightTiles ?? 0) * this.tileSize * camera.zoom;

		if (deadzoneWidth > 0 && deadzoneHeight > 0) {
			camera.setDeadzone(deadzoneWidth, deadzoneHeight);
		}

		if (config.followPlayer && this.playerMarker) {
			camera.startFollow(
				this.playerMarker,
				true,
				clamp(config.followSmoothing, 0, 1),
				clamp(config.followSmoothing, 0, 1),
			);
			return;
		}

		camera.stopFollow();
		this.centerCameraOn(centerX, centerY);
	}

	private centerCameraOn(x: number, y: number) {
		const camera = this.cameras.main;
		const mapWidth = this.currentArea.width * this.tileSize;
		const mapHeight = this.currentArea.height * this.tileSize;
		const maxScrollX = Math.max(0, mapWidth - camera.width / camera.zoom);
		const maxScrollY = Math.max(0, mapHeight - camera.height / camera.zoom);

		camera.setScroll(
			clamp(x - camera.width / camera.zoom / 2, 0, maxScrollX),
			clamp(y - camera.height / camera.zoom / 2, 0, maxScrollY),
		);
	}

	// Phaser world rendering.
	private renderMap() {
		this.worldLayer?.removeAll(true);
		this.playerMarker = undefined;
		this.npcMarkers.clear();
		this.objectMarkers.clear();
		this.npcMovementStates.clear();
		const overlayLookup = new Map(
			this.currentArea.overlayTiles.map((tile) => [
				tileKey(tile.x, tile.y),
				tile.overlayId,
			]),
		);

		for (let y = 0; y < this.currentArea.height; y += 1) {
			for (let x = 0; x < this.currentArea.width; x += 1) {
				const tileId = this.tileIdAt(x, y);
				const tile = getTilePreset(tileId);
				const tileStyle = this.project.tileStyles[tileId];
				const worldX = x * this.tileSize;
				const worldY = y * this.tileSize;

				const tileRect = this.add
					.rectangle(
						worldX,
						worldY,
						this.tileSize,
						this.tileSize,
						hexToNumber(tileStyle?.color ?? tile.color),
					)
					.setOrigin(0)
					.setStrokeStyle(1, 0xffffff, 0.22);
				this.worldLayer?.add(tileRect);

				const tileTexture = this.addPixelImage(
					tileId,
					worldX,
					worldY,
					this.tileSize,
					this.tileSize,
				);
				if (tileTexture) {
					this.worldLayer?.add(tileTexture);
				} else if (tile.pattern === "waves") {
					const wave = this.add
						.text(worldX + this.tileSize / 2, worldY + this.tileSize / 2, "~", {
							color: "#d0ebff",
							fontFamily: "Arial, sans-serif",
							fontSize: "18px",
						})
						.setOrigin(0.5);
					this.worldLayer?.add(wave);
				} else if (tile.pattern === "tree") {
					const tree = this.add.circle(
						worldX + this.tileSize / 2,
						worldY + this.tileSize / 2,
						this.tileSize * 0.22,
						0x14532d,
						0.9,
					);
					this.worldLayer?.add(tree);
				} else if (tile.pattern === "blocks") {
					const rock = this.add
						.rectangle(
							worldX + this.tileSize / 2,
							worldY + this.tileSize / 2,
							this.tileSize * 0.5,
							this.tileSize * 0.36,
							0x4b5563,
							0.55,
						)
						.setStrokeStyle(1, 0x111827, 0.28);
					this.worldLayer?.add(rock);
				}

				const overlayId = overlayLookup.get(tileKey(x, y));
				if (overlayId) {
					const overlay = getOverlayPreset(overlayId);
					const overlayTexture = this.addPixelImage(
						overlayId,
						worldX,
						worldY,
						this.tileSize,
						this.tileSize,
						overlay.pattern === "shadow" ? 0.72 : 0.92,
					);

					if (overlayTexture) {
						this.worldLayer?.add(overlayTexture);
					} else {
						const path = this.add
							.rectangle(
								worldX + this.tileSize * 0.5,
								worldY + this.tileSize * 0.5,
								this.tileSize * 0.78,
								this.tileSize * 0.48,
								hexToNumber(overlay.color),
								overlay.pattern === "shadow" ? 0.25 : 0.62,
							)
							.setAngle(-4);
						this.worldLayer?.add(path);
					}
				}
			}
		}

		this.currentArea.structures.forEach((structure) => {
			this.renderStructure(structure);
		});
		this.currentArea.objects.forEach((object) => {
			this.renderObject(object);
		});
		this.currentArea.pickups
			.filter(
				(pickup) =>
					!isPickupCollected(
						pickup,
						this.runtimeState,
						this.collectedPickupIds,
					),
			)
			.forEach((pickup) => {
				this.renderPickup(pickup);
			});
		this.currentArea.npcs
			.filter((npc) => !this.defeatedNpcIds.has(npc.id))
			.forEach((npc) => {
				this.renderNpc(npc);
			});
	}

	private createPixelTextures() {
		Object.values(this.project.pixelAssets ?? {}).forEach((asset) => {
			const textureKey = this.getPixelTextureKey(asset);

			if (this.textures.exists(textureKey)) {
				this.textures.remove(textureKey);
			}

			const texture = this.textures.createCanvas(
				textureKey,
				asset.width,
				asset.height,
			);
			if (!texture) {
				return;
			}

			const context = texture.getContext();
			context.clearRect(0, 0, asset.width, asset.height);

			asset.pixels.forEach((row, y) => {
				row.forEach((color, x) => {
					if (!color || color === "transparent") {
						return;
					}

					context.fillStyle = color;
					context.fillRect(x, y, 1, 1);
				});
			});

			texture.refresh();
			this.pixelTextureKeys.set(asset.id, textureKey);
		});
	}

	private getPixelTextureKey(asset: PixelAsset): string {
		return `pixel_asset_${asset.id}`;
	}

	private addPixelImage(
		assetId: string,
		x: number,
		y: number,
		width: number,
		height: number,
		alpha = 1,
	): Phaser.GameObjects.Image | null {
		const textureKey = this.pixelTextureKeys.get(assetId);
		if (!textureKey) {
			return null;
		}

		return this.add
			.image(x, y, textureKey)
			.setOrigin(0)
			.setDisplaySize(width, height)
			.setAlpha(alpha);
	}

	private renderStructure(structure: MapStructure) {
		const preset = getStructurePreset(structure.structureId);
		const worldX = structure.x * this.tileSize;
		const worldY = structure.y * this.tileSize;
		const width = structure.widthTiles * this.tileSize;
		const height = structure.heightTiles * this.tileSize;
		const graphics = this.add.graphics();

		graphics.fillStyle(hexToNumber(preset.shadowColor), 0.32);
		graphics.fillRect(width * 0.12, height * 0.78, width * 0.82, height * 0.18);

		if (structure.structureId === "dock") {
			graphics.fillStyle(hexToNumber(preset.wallColor), 1);
			for (
				let y = height * 0.18;
				y < height * 0.86;
				y += this.tileSize * 0.34
			) {
				graphics.fillRect(width * 0.08, y, width * 0.84, this.tileSize * 0.18);
			}
			graphics.lineStyle(2, hexToNumber(preset.shadowColor), 0.65);
			for (let x = width * 0.14; x < width * 0.9; x += this.tileSize * 0.5) {
				graphics.lineBetween(x, height * 0.14, x, height * 0.9);
			}
		} else if (structure.structureId === "ruin_wall") {
			graphics.fillStyle(hexToNumber(preset.wallColor), 1);
			graphics.fillRect(
				width * 0.08,
				height * 0.35,
				width * 0.84,
				height * 0.42,
			);
			graphics.fillStyle(hexToNumber(preset.roofColor), 1);
			for (let x = width * 0.1; x < width * 0.82; x += this.tileSize * 0.48) {
				graphics.fillRect(
					x,
					height * 0.23,
					this.tileSize * 0.28,
					this.tileSize * 0.28,
				);
			}
			graphics.lineStyle(2, hexToNumber(preset.shadowColor), 0.5);
			graphics.strokeRect(
				width * 0.08,
				height * 0.35,
				width * 0.84,
				height * 0.42,
			);
		} else {
			graphics.fillStyle(hexToNumber(preset.wallColor), 1);
			graphics.fillRect(
				width * 0.18,
				height * 0.36,
				width * 0.64,
				height * 0.5,
			);
			graphics.fillStyle(hexToNumber(preset.roofColor), 1);
			graphics.fillTriangle(
				width * 0.08,
				height * 0.4,
				width * 0.5,
				height * 0.08,
				width * 0.92,
				height * 0.4,
			);
			graphics.fillRect(
				width * 0.14,
				height * 0.35,
				width * 0.72,
				height * 0.14,
			);
			graphics.fillStyle(0x382211, 0.62);
			graphics.fillRect(
				width * 0.44,
				height * 0.62,
				width * 0.13,
				height * 0.24,
			);
			graphics.fillStyle(0xf6d365, 0.78);
			graphics.fillRect(width * 0.26, height * 0.5, width * 0.12, height * 0.1);
			graphics.fillRect(width * 0.62, height * 0.5, width * 0.12, height * 0.1);
			graphics.lineStyle(2, hexToNumber(preset.shadowColor), 0.45);
			graphics.strokeRect(
				width * 0.18,
				height * 0.36,
				width * 0.64,
				height * 0.5,
			);
		}

		const container = this.add.container(worldX, worldY, [graphics]);
		this.worldLayer?.add(container);
	}

	// Shared runtime progression event translation.
	private processProgression() {
		processRuntimeProgression(this.session, (event) =>
			this.handleRuntimeProgressionEvent(event),
		);
	}

	private movePlayerToArea(areaId: string, eventBlock: EventBlock) {
		transitionRuntimeArea(this.session, areaId, eventBlock.id, (event) =>
			this.handleRuntimeProgressionEvent(event),
		);
	}

	private handleRuntimeProgressionEvent(event: RuntimeProgressionEvent) {
		if (event.type === "areaChanged") {
			const nextArea = this.findArea(event.areaId);
			if (!nextArea) {
				return;
			}

			this.currentArea = nextArea;
			this.tileSize = nextArea.tileSize;
			this.isMoving = false;
			this.renderMap();
			this.configureCameras();
			return;
		}

		if (event.type === "vehicleLeft") {
			this.vehicleVisual?.destroy();
			this.vehicleVisual = undefined;
			return;
		}

		if (event.type === "spawnPlayer") {
			const eventBlock = this.findEventBlock(event.eventBlockId, event.areaId);
			if (eventBlock) {
				this.spawnPlayer(eventBlock);
			}
			return;
		}

		if (event.type === "cutsceneRequested") {
			const cutscene = this.project.cutscenes.find(
				(candidate) => candidate.id === event.cutsceneId,
			);
			if (!cutscene) {
				completeRuntimeProgressionCutscene(this.session, (nextEvent) =>
					this.handleRuntimeProgressionEvent(nextEvent),
				);
				return;
			}

			this.showCutscene(cutscene, () => {
				this.fireRuleTrigger(
					{ type: "on_cutscene_end", cutsceneId: cutscene.id },
					() =>
						completeRuntimeProgressionCutscene(this.session, (nextEvent) =>
							this.handleRuntimeProgressionEvent(nextEvent),
						),
				);
			});
			return;
		}

		if (event.type === "status") {
			this.setStatus(event.message);
			return;
		}

		if (event.type === "stateChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "inventoryChanged") {
			this.onInventoryChanged?.(event.inventory);
			return;
		}

		if (event.type === "questsChanged") {
			this.onQuestsChanged?.(event.quests);
			return;
		}

		if (event.type === "areaEnterTriggerRequested") {
			this.fireRuleTrigger({ type: "on_area_enter", areaId: event.areaId });
			return;
		}

		if (event.type === "endGame") {
			this.showEndMessage();
		}
	}

	// Shared runtime object/shop/vehicle event translation.
	private handleRuntimeObjectInteractionEvent(
		event: RuntimeObjectInteractionEvent,
	) {
		if (event.type === "status") {
			this.setStatus(event.message);
			return;
		}

		if (event.type === "stateChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "inventoryChanged") {
			this.onInventoryChanged?.(event.inventory);
			return;
		}

		if (event.type === "questsChanged") {
			this.onQuestsChanged?.(event.quests);
			return;
		}

		if (event.type === "cutsceneRequested") {
			const cutscene = event.cutsceneId
				? this.project.cutscenes.find(
						(candidate) => candidate.id === event.cutsceneId,
					)
				: event.cutscene;
			if (cutscene) {
				this.showCutscene(cutscene, () => undefined);
			}
			return;
		}

		if (event.type === "teleportRequested") {
			const eventBlock = this.findEventBlock(event.eventBlockId, event.areaId);
			if (eventBlock) {
				this.movePlayerToArea(event.areaId, eventBlock);
			}
			return;
		}

		if (event.type === "shopChanged") {
			this.notifyShopChanged(event.message);
			return;
		}

		if (event.type === "shopClosed") {
			this.onShopChanged?.(null);
			return;
		}

		if (event.type === "pickupCollected") {
			if (event.once) {
				this.worldLayer?.getByName(`pickup:${event.pickupId}`)?.destroy();
			}
			return;
		}

		if (event.type === "vehicleBoarded") {
			this.addVehicleVisual(event.behaviour);
			return;
		}

		if (event.type === "vehicleDismounted") {
			this.vehicleVisual?.destroy();
			this.vehicleVisual = undefined;
			return;
		}

		if (event.type === "movementModeChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "objectMoved") {
			this.objectMarkers
				.get(event.objectId)
				?.setPosition(event.x * this.tileSize, event.y * this.tileSize);
			return;
		}

		if (event.type === "playerMoved") {
			this.playerMarker?.setPosition(
				event.x * this.tileSize + this.tileSize / 2,
				event.y * this.tileSize + this.tileSize / 2,
			);
		}
	}

	private renderPickup(pickup: PickupObject) {
		const item = this.project.items.find(
			(candidate) => candidate.id === pickup.itemId,
		);
		const centerX = pickup.x * this.tileSize + this.tileSize / 2;
		const centerY = pickup.y * this.tileSize + this.tileSize / 2;
		const body = this.add
			.circle(
				0,
				0,
				this.tileSize * 0.24,
				item?.category === "currency" ? 0xfbbf24 : 0x8b5cf6,
				0.96,
			)
			.setStrokeStyle(2, 0xffffff, 0.82);
		const label = this.add
			.text(0, 0, item?.name.slice(0, 1).toUpperCase() ?? "?", {
				color: "#312e81",
				fontFamily: "Arial, sans-serif",
				fontSize: "12px",
				fontStyle: "700",
			})
			.setOrigin(0.5);
		const container = this.add
			.container(centerX, centerY, [body, label])
			.setDepth(40);
		container.setName(`pickup:${pickup.id}`);
		this.worldLayer?.add(container);
	}

	private renderObject(object: ObjectInstance) {
		const definition = this.project.objects.find(
			(candidate) => candidate.id === object.objectDefinitionId,
		);
		const width =
			(object.widthTiles ?? definition?.widthTiles ?? 1) * this.tileSize;
		const height =
			(object.heightTiles ?? definition?.heightTiles ?? 1) * this.tileSize;
		const worldX = object.x * this.tileSize;
		const worldY = object.y * this.tileSize;
		const categoryColor =
			definition?.category === "container"
				? 0xb45309
				: definition?.category === "vehicle"
					? 0x0369a1
					: definition?.category === "sign"
						? 0x854d0e
						: 0x64748b;
		const body = this.add
			.rectangle(
				width / 2,
				height / 2,
				Math.max(16, width * 0.72),
				Math.max(16, height * 0.72),
				categoryColor,
				0.94,
			)
			.setStrokeStyle(2, 0xffffff, 0.8);
		const label = this.add
			.text(
				width / 2,
				height / 2,
				(object.nameOverride || definition?.name || "Object")
					.slice(0, 1)
					.toUpperCase(),
				{
					color: "#ffffff",
					fontFamily: "Arial, sans-serif",
					fontSize: "13px",
					fontStyle: "700",
				},
			)
			.setOrigin(0.5);
		const marker = this.add
			.container(worldX, worldY, [body, label])
			.setDepth(42);
		marker.setName(`object:${object.id}`);
		this.objectMarkers.set(object.id, marker);
		this.worldLayer?.add(marker);
	}

	private renderNpc(npc: NPCInstance) {
		const resolved = this.getResolvedNpc(npc);
		const avatar = getVisualPreset(
			resolved.definition?.mapAvatarId ?? "ranger",
			characterSprites,
		);
		const centerX = npc.x * this.tileSize + this.tileSize / 2;
		const centerY = npc.y * this.tileSize + this.tileSize / 2;
		const body = this.add.circle(
			0,
			0,
			this.tileSize * 0.3,
			hexToNumber(avatar.color),
		);
		const initial = this.add
			.text(0, 0, resolved.name.slice(0, 1).toUpperCase() ?? "?", {
				color: avatar.accent,
				fontFamily: "Arial, sans-serif",
				fontSize: "15px",
				fontStyle: "700",
			})
			.setOrigin(0.5);

		const marker = this.add
			.container(centerX, centerY, [body, initial])
			.setDepth(45);
		this.npcMarkers.set(npc.id, marker);
		this.worldLayer?.add(marker);
	}

	// Shared runtime NPC tick event translation.
	private updateNpcMovement(time: number) {
		tickRuntimeNpcs(this.session, this.currentArea, time, (event) =>
			this.handleRuntimeNpcTickEvent(event),
		);
	}

	private handleRuntimeNpcTickEvent(event: RuntimeNpcTickEvent) {
		if (event.type === "npcMoved") {
			this.tweens.add({
				targets: this.npcMarkers.get(event.npcId),
				x: event.to.x * this.tileSize + this.tileSize / 2,
				y: event.to.y * this.tileSize + this.tileSize / 2,
				duration: event.durationMs,
				ease: "Sine.easeInOut",
			});
			return;
		}

		if (event.type === "status") {
			this.setStatus(event.message);
			return;
		}

		if (event.type === "stateChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "combatChanged") {
			this.notifyCombatChanged();
			return;
		}

		if (event.type === "gameOver") {
			this.showGameOverMessage();
		}
	}

	private spawnPlayer(eventBlock: EventBlock) {
		const avatar = getVisualPreset(
			this.project.player.mapAvatarId,
			characterSprites,
		);
		const centerX = eventBlock.x * this.tileSize + this.tileSize / 2;
		const centerY = eventBlock.y * this.tileSize + this.tileSize / 2;

		this.playerMarker?.destroy();
		const body = this.add.circle(
			0,
			0,
			this.tileSize * 0.32,
			hexToNumber(avatar.color),
		);
		const initial = this.add
			.text(0, 0, this.project.player.name.slice(0, 1).toUpperCase(), {
				color: avatar.accent,
				fontFamily: "Arial, sans-serif",
				fontSize: "16px",
				fontStyle: "700",
			})
			.setOrigin(0.5);

		this.playerMarker = this.add
			.container(centerX, centerY, [body, initial])
			.setDepth(50);
		this.worldLayer?.add(this.playerMarker);
		this.playerPosition = { x: eventBlock.x, y: eventBlock.y };
		this.configurePlayerCamera(centerX, centerY);
		this.setStatus(`${this.project.player.name} spawned.`);
	}

	// UI/cutscene/dialogue presentation.
	private showCutscene(cutscene: Cutscene, onDone: () => void) {
		this.promptText?.setText("");
		const width = this.scale.width;
		const height = this.scale.height;
		const background = getVisualPreset(
			cutscene.backgroundImageId,
			backgroundPresets,
		);
		const portrait = cutscene.portraitImageId
			? getVisualPreset(cutscene.portraitImageId, portraitPresets)
			: undefined;
		const showPortrait = Boolean(portrait && width >= 300 && height >= 220);
		const textX = showPortrait ? 144 : 28;
		const dialogueWidth = Math.max(140, width - 32);
		const dialogueY = Math.max(128, height - 74);
		const container = this.add.container(0, 0).setDepth(500).setScrollFactor(0);
		this.uiLayer?.add(container);

		this.isCutsceneOpen = true;
		container.add(
			this.add
				.rectangle(0, 0, width, height, hexToNumber(background.color), 0.96)
				.setOrigin(0),
		);
		container.add(
			this.add
				.rectangle(
					width * 0.5,
					height * 0.35,
					width * 0.74,
					height * 0.38,
					hexToNumber(background.accent),
					0.18,
				)
				.setStrokeStyle(2, 0xffffff, 0.32),
		);
		container.add(
			this.add
				.text(28, 24, cutscene.name, {
					color: "#ffffff",
					fontFamily: "Arial, sans-serif",
					fontSize: "20px",
					fontStyle: "700",
				})
				.setShadow(1, 1, "#000000", 3),
		);

		if (portrait && showPortrait) {
			container.add(
				this.add
					.circle(84, height - 96, 42, hexToNumber(portrait.color))
					.setStrokeStyle(3, hexToNumber(portrait.accent), 0.75),
			);
			container.add(
				this.add
					.text(84, height - 96, portrait.label.slice(0, 1), {
						color: portrait.accent,
						fontFamily: "Arial, sans-serif",
						fontSize: "30px",
						fontStyle: "700",
					})
					.setOrigin(0.5),
			);
		}

		container.add(
			this.add
				.rectangle(width / 2, dialogueY, dialogueWidth, 116, 0x18181b, 0.9)
				.setStrokeStyle(1, 0xffffff, 0.22),
		);
		container.add(
			this.add.text(textX, dialogueY - 50, cutscene.speakerName || "Narrator", {
				color: "#ffd43b",
				fontFamily: "Arial, sans-serif",
				fontSize: "16px",
				fontStyle: "700",
			}),
		);
		container.add(
			this.add.text(textX, dialogueY - 20, cutscene.text, {
				color: "#ffffff",
				fontFamily: "Arial, sans-serif",
				fontSize: "17px",
				lineSpacing: 4,
				wordWrap: { width: Math.max(90, width - textX - 28) },
			}),
		);
		container.add(
			this.add
				.text(width - 42, height - 30, "Space / Enter / Click", {
					color: "#e5e7eb",
					fontFamily: "Arial, sans-serif",
					fontSize: "13px",
				})
				.setOrigin(1, 0.5),
		);

		let closed = false;
		const close = () => {
			if (closed) {
				return;
			}

			closed = true;
			this.isCutsceneOpen = false;
			container.destroy(true);
			onDone();
		};

		this.input.once(Phaser.Input.Events.POINTER_DOWN, close);
		this.input.keyboard?.once(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, close);
	}

	private showDialogue(dialogue: DialogueDefinition) {
		this.promptText?.setText("");
		this.closeShop();
		this.isDialogueOpen = true;
		this.activeDialogue = {
			definition: dialogue,
			state: createRuntimeDialogueState(dialogue),
		};
		this.renderActiveDialogueNode();
	}

	private closeDialogue() {
		this.activeDialogue?.container?.destroy(true);
		this.activeDialogue = undefined;
		this.isDialogueOpen = false;
		this.updatePrompt(this.findNearestInteractable());
	}

	private renderActiveDialogueNode() {
		const active = this.activeDialogue;
		if (!active) {
			return;
		}

		active.container?.destroy(true);
		active.container = undefined;

		const node = getDialogueNode(active.definition, active.state.nodeId);
		if (!node) {
			this.closeDialogue();
			return;
		}

		enterDialogueNode(active.state, node, this.getRuleContext(), () =>
			this.renderDialogueNodeContent(node),
		);
	}

	private renderDialogueNodeContent(node: DialogueNode) {
		const active = this.activeDialogue;
		if (!active) {
			return;
		}

		const width = this.scale.width;
		const height = this.scale.height;
		const panelY = height - 112;
		const panelWidth = Math.max(220, width - 32);
		const portrait = node.portraitId
			? getVisualPreset(node.portraitId, portraitPresets)
			: undefined;
		const showPortrait = Boolean(portrait && width >= 320);
		const textX = showPortrait ? 126 : 32;
		const container = this.add.container(0, 0).setDepth(520).setScrollFactor(0);
		this.uiLayer?.add(container);
		active.container = container;

		container.add(
			this.add.rectangle(0, 0, width, height, 0x000000, 0.2).setOrigin(0),
		);
		container.add(
			this.add
				.rectangle(width / 2, panelY, panelWidth, 184, 0x18181b, 0.94)
				.setStrokeStyle(2, 0xffffff, 0.18),
		);

		if (portrait) {
			container.add(
				this.add
					.rectangle(70, panelY - 18, 72, 72, hexToNumber(portrait.color), 1)
					.setStrokeStyle(2, hexToNumber(portrait.accent), 0.9),
			);
			container.add(
				this.add
					.text(70, panelY - 18, (node.speaker ?? "NPC").slice(0, 1), {
						color: portrait.accent,
						fontFamily: "Arial, sans-serif",
						fontSize: "28px",
						fontStyle: "700",
					})
					.setOrigin(0.5),
			);
		}

		container.add(
			this.add.text(
				textX,
				panelY - 78,
				node.speaker ?? active.definition.name,
				{
					color: "#f8fafc",
					fontFamily: "Arial, sans-serif",
					fontSize: "15px",
					fontStyle: "700",
				},
			),
		);
		container.add(
			this.add.text(textX, panelY - 52, node.text ?? "", {
				color: "#ffffff",
				fontFamily: "Arial, sans-serif",
				fontSize: "16px",
				lineSpacing: 4,
				wordWrap: { width: Math.max(120, width - textX - 34) },
			}),
		);

		if (node.type === "choice") {
			const choices = getAvailableDialogueChoices(
				node,
				this.runtimeState,
				this.runtimeQuestState,
			);
			choices.forEach((choice, index) => {
				const choiceText = this.add
					.text(
						textX,
						panelY + 4 + index * 28,
						`${index + 1}. ${choice.text}`,
						{
							backgroundColor: "#263244",
							color: "#f8fafc",
							fontFamily: "Arial, sans-serif",
							fontSize: "14px",
							padding: { x: 8, y: 5 },
						},
					)
					.setInteractive({ useHandCursor: true });
				choiceText.on(Phaser.Input.Events.POINTER_DOWN, () => {
					advanceDialogue(active.definition, active.state, choice.id);
					this.renderActiveDialogueNode();
				});
				container.add(choiceText);
			});
			if (choices.length === 0) {
				container.add(
					this.add.text(textX, panelY + 8, "No available choices.", {
						color: "#cbd5e1",
						fontFamily: "Arial, sans-serif",
						fontSize: "14px",
					}),
				);
			}
			return;
		}

		const buttonLabel =
			node.type === "text" && node.nextNodeId ? "Next" : "End conversation";
		const nextButton = this.add
			.text(width - 42, height - 36, buttonLabel, {
				backgroundColor: "#f8fafc",
				color: "#111827",
				fontFamily: "Arial, sans-serif",
				fontSize: "14px",
				fontStyle: "700",
				padding: { x: 10, y: 6 },
			})
			.setOrigin(1, 0.5)
			.setInteractive({ useHandCursor: true });
		nextButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
			const nextNode = advanceDialogue(active.definition, active.state);
			if (!nextNode) {
				this.closeDialogue();
				return;
			}
			this.renderActiveDialogueNode();
		});
		container.add(nextButton);
	}

	private showEndMessage() {
		this.isFinished = true;
		const width = this.scale.width;
		const height = this.scale.height;
		const boxWidth = Math.min(260, width - 24);
		const container = this.add.container(0, 0).setDepth(600).setScrollFactor(0);
		this.uiLayer?.add(container);
		container.add(
			this.add.rectangle(0, 0, width, height, 0x111827, 0.72).setOrigin(0),
		);
		container.add(
			this.add
				.rectangle(width / 2, height / 2, boxWidth, 130, 0xf8fafc, 0.96)
				.setStrokeStyle(2, 0x2f9e44, 0.8),
		);
		container.add(
			this.add
				.text(width / 2, height / 2 - 18, "End", {
					color: "#111827",
					fontFamily: "Arial, sans-serif",
					fontSize: "38px",
					fontStyle: "700",
				})
				.setOrigin(0.5),
		);
		container.add(
			this.add
				.text(width / 2, height / 2 + 28, "Progression complete", {
					color: "#374151",
					fontFamily: "Arial, sans-serif",
					fontSize: "15px",
				})
				.setOrigin(0.5),
		);
		this.setStatus("End game.");
	}

	private showGameOverMessage() {
		if (this.isFinished) {
			return;
		}

		this.isFinished = true;
		this.closeShop();
		const width = this.scale.width;
		const height = this.scale.height;
		const boxWidth = Math.min(300, width - 24);
		const container = this.add.container(0, 0).setDepth(620).setScrollFactor(0);
		this.uiLayer?.add(container);
		container.add(
			this.add.rectangle(0, 0, width, height, 0x111827, 0.78).setOrigin(0),
		);
		container.add(
			this.add
				.rectangle(width / 2, height / 2, boxWidth, 130, 0x18181b, 0.96)
				.setStrokeStyle(2, 0xdc2626, 0.9),
		);
		container.add(
			this.add
				.text(width / 2, height / 2 - 16, "Game Over", {
					color: "#fecaca",
					fontFamily: "Arial, sans-serif",
					fontSize: "34px",
					fontStyle: "700",
				})
				.setOrigin(0.5),
		);
		container.add(
			this.add
				.text(
					width / 2,
					height / 2 + 30,
					"Back to editor or restart play test",
					{
						color: "#e5e7eb",
						fontFamily: "Arial, sans-serif",
						fontSize: "14px",
					},
				)
				.setOrigin(0.5),
		);
		this.setStatus("Game Over.");
		this.notifyCombatChanged();
	}

	private readDirection(): { x: number; y: number } | null {
		if (this.cursors?.left.isDown || this.wasd?.A.isDown) {
			return { x: -1, y: 0 };
		}
		if (this.cursors?.right.isDown || this.wasd?.D.isDown) {
			return { x: 1, y: 0 };
		}
		if (this.cursors?.up.isDown || this.wasd?.W.isDown) {
			return { x: 0, y: -1 };
		}
		if (this.cursors?.down.isDown || this.wasd?.S.isDown) {
			return { x: 0, y: 1 };
		}

		return null;
	}

	private wasInteractPressed(): boolean {
		return Boolean(
			(this.interactKeys?.E &&
				Phaser.Input.Keyboard.JustDown(this.interactKeys.E)) ||
				(this.interactKeys?.ENTER &&
					Phaser.Input.Keyboard.JustDown(this.interactKeys.ENTER)),
		);
	}

	private wasAttackPressed(): boolean {
		return Boolean(
			this.combatKeys?.SPACE &&
				Phaser.Input.Keyboard.JustDown(this.combatKeys.SPACE),
		);
	}

	private findNearestInteractable(): InteractableTarget | null {
		return findNearestInteractableTarget({
			project: this.project,
			area: this.currentArea,
			playerPosition: this.playerPosition,
			runtimeState: this.runtimeState,
			collectedPickupIds: this.collectedPickupIds,
			defeatedNpcIds: this.defeatedNpcIds,
		});
	}

	private updatePrompt(interactable: InteractableTarget | null) {
		if (!this.promptText) {
			return;
		}

		this.promptText.setText(
			interactable
				? interactable.type === "pickup"
					? `Press E to pick up ${interactable.label}`
					: interactable.type === "npc"
						? `Press E to talk to ${interactable.label}`
						: interactable.type === "object"
							? this.promptForObject(interactable)
							: this.promptForInteraction(interactable.interaction)
				: "",
		);
	}

	private promptForObject(
		interactable: Extract<InteractableTarget, { type: "object" }>,
	): string {
		const behaviour = this.getObjectBehaviour(interactable.object);
		if (behaviour.type === "vehicle" && behaviour.vehicleType === "boat") {
			return "Press E to board";
		}

		if (behaviour.type === "sign") {
			return "Press E to read";
		}

		if (behaviour.type === "container") {
			return "Press E to open";
		}

		return this.promptForInteraction(interactable.interaction);
	}

	private promptForInteraction(interaction?: Interaction): string {
		if (!interaction) {
			return "Press E to interact";
		}

		if (interaction.prompt) {
			return interaction.prompt;
		}

		if (interaction.type === "area_link" || interaction.type === "teleport") {
			return "Press E to enter";
		}

		if (interaction.type === "change_movement_mode") {
			return interaction.mode === "sail"
				? "Press E to board"
				: "Press E to ride";
		}

		if (interaction.type === "start_dialogue") {
			return "Press E to talk";
		}

		if (interaction.type === "open_shop") {
			return "Press E to shop";
		}

		return "Press E to inspect";
	}

	// Legacy direct interaction presentation and compatibility handling.
	private runInteraction(interaction: Interaction, label: string) {
		if (interaction.activationMode === "disabled") {
			return;
		}

		if (interaction.type === "area_link" || interaction.type === "teleport") {
			if (!interaction.targetAreaId || !interaction.targetEventBlockId) {
				this.setStatus(`Interaction target missing: ${label}.`);
				return;
			}

			const targetArea = this.findArea(interaction.targetAreaId);
			const targetEventBlock = this.findEventBlock(
				interaction.targetEventBlockId,
				interaction.targetAreaId,
			);

			if (!targetArea || !targetEventBlock) {
				this.setStatus(`Interaction target missing: ${label}.`);
				return;
			}

			this.movePlayerToArea(targetArea.id, targetEventBlock);
			return;
		}

		if (interaction.type === "play_cutscene") {
			if (!interaction.cutsceneId) {
				this.setStatus(`Cutscene missing: ${label}.`);
				return;
			}

			const cutscene = this.project.cutscenes.find(
				(candidate) => candidate.id === interaction.cutsceneId,
			);
			if (!cutscene) {
				this.setStatus(`Cutscene missing: ${label}.`);
				return;
			}

			this.promptText?.setText("");
			this.showCutscene(cutscene, () => {
				this.fireRuleTrigger(
					{ type: "on_cutscene_end", cutsceneId: cutscene.id },
					() => {
						this.updatePrompt(this.findNearestInteractable());
					},
				);
			});
			return;
		}

		if (interaction.type === "start_dialogue") {
			if (!interaction.dialogueId) {
				this.setStatus(`Dialogue missing: ${label}.`);
				return;
			}

			const dialogue = this.project.dialogues.find(
				(candidate) => candidate.id === interaction.dialogueId,
			);
			if (!dialogue) {
				this.setStatus(`Dialogue missing: ${label}.`);
				return;
			}

			this.showDialogue(dialogue);
			return;
		}

		if (interaction.type === "open_shop") {
			if (!interaction.shopId) {
				this.setStatus(`Shop missing: ${label}.`);
				return;
			}

			this.openShop(interaction.shopId);
			return;
		}

		if (interaction.type === "set_flag") {
			if (!interaction.flag) {
				this.setStatus(`Flag missing: ${label}.`);
				return;
			}

			const value = interaction.value ?? true;
			this.runtimeState.flags[interaction.flag] = value;
			this.syncQuestProgress();
			this.updateDebugPanel();
			this.setStatus(`${interaction.flag}: ${value ? "true" : "false"}.`);
			return;
		}

		if (!interaction.mode) {
			this.setStatus(`Movement mode missing: ${label}.`);
			return;
		}

		this.currentMovementMode = interaction.mode;
		this.updateDebugPanel();
		this.setStatus(`Movement mode: ${this.currentMovementMode}.`);
	}

	private runObjectBehaviour(object: ObjectInstance): boolean {
		return runRuntimeObjectBehaviour(this.session, object, (event) =>
			this.handleRuntimeObjectInteractionEvent(event),
		);
	}

	private tryAttack(time: number): boolean {
		return attemptRuntimeCombatAttack(
			this.session,
			this.currentArea,
			time,
			(event) => this.handleRuntimeCombatEvent(event),
		);
	}

	// Shared runtime combat event translation.
	private handleRuntimeCombatEvent(event: RuntimeCombatEvent) {
		if (event.type === "status") {
			this.setStatus(event.message);
			return;
		}

		if (event.type === "npcRemoved") {
			this.npcMarkers.get(event.npcId)?.destroy();
			this.npcMarkers.delete(event.npcId);
			return;
		}

		if (event.type === "stateChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "combatChanged") {
			this.notifyCombatChanged();
			return;
		}

		if (event.type === "inventoryChanged") {
			this.onInventoryChanged?.(event.inventory);
			return;
		}

		if (event.type === "questsChanged") {
			this.onQuestsChanged?.(event.quests);
		}
	}

	private addVehicleVisual(behaviour: VehicleMovementConfig) {
		this.vehicleVisual?.destroy();
		if (!this.playerMarker || behaviour.vehicleType !== "boat") {
			return;
		}

		const hull = this.add
			.ellipse(
				0,
				this.tileSize * 0.08,
				this.tileSize * 0.86,
				this.tileSize * 0.52,
				0x075985,
				0.88,
			)
			.setStrokeStyle(2, 0xe0f2fe, 0.86);
		hull.setDepth(-1);
		this.vehicleVisual = hull;
		this.playerMarker.addAt(hull, 0);
	}

	private tryDismountVehicle(): boolean {
		if (
			!dismountRuntimeVehicle(
				this.session,
				(event) => this.handleRuntimeObjectInteractionEvent(event),
				this.currentArea,
			)
		) {
			return false;
		}

		if (this.checkTouchInteractions(() => this.checkTrigger())) {
			return true;
		}
		this.checkTrigger();
		return true;
	}

	private collectPickupObject(pickup: PickupObject): boolean {
		return collectRuntimePickup(this.session, pickup, (event) =>
			this.handleRuntimeObjectInteractionEvent(event),
		);
	}

	// Runtime movement transaction plus Phaser tween/animation.
	private tryMove(deltaX: number, deltaY: number, time: number) {
		const move = attemptPlayerMove(this.session, { x: deltaX, y: deltaY });
		if (move.type === "blocked") {
			if (move.reason) {
				this.setStatus(move.reason);
			}
			return;
		}

		const destinationX = move.to.x * this.tileSize + this.tileSize / 2;
		const destinationY = move.to.y * this.tileSize + this.tileSize / 2;

		this.isMoving = true;
		this.nextMoveAt = time + move.moveDurationMs;
		this.tweens.add({
			targets: this.playerMarker,
			x: destinationX,
			y: destinationY,
			duration: move.moveDurationMs,
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.isMoving = false;
				if (
					this.checkTouchInteractions(
						() => this.checkTrigger(),
						move.touchTargets,
					)
				) {
					return;
				}
				this.checkTrigger(move.triggerTargets);
			},
		});
	}

	private checkTouchInteractions(
		onDone: () => void,
		touchTargets?: TouchInteractableTarget[],
	): boolean {
		const target =
			touchTargets?.[0] ??
			findTouchInteractableTarget({
				project: this.project,
				area: this.currentArea,
				playerPosition: this.playerPosition,
				runtimeState: this.runtimeState,
				collectedPickupIds: this.collectedPickupIds,
			});

		if (!target) {
			return false;
		}

		if (target.type === "pickup") {
			if (this.collectPickupObject(target.pickup)) {
				onDone();
				return true;
			}
			return false;
		}

		if (target.type === "object") {
			const object = target.object;
			const objectInteraction = target.interaction;
			const objectBehaviour = this.getObjectBehaviour(object);
			const objectBehaviourCanTouch =
				objectBehaviour.type !== "none" && objectBehaviour.type !== "vehicle";
			this.fireRuleTrigger({ type: "on_touch", targetId: object.id }, () => {
				if (objectBehaviourCanTouch) {
					this.runObjectBehaviour(object);
				}
				if (objectInteraction && canTouchActivate(objectInteraction)) {
					this.runInteraction(objectInteraction, target.label);
				}
				onDone();
			});
			return true;
		}

		const eventBlock = target.eventBlock;
		const interaction = target.interaction;
		this.fireRuleTrigger({ type: "on_touch", targetId: eventBlock.id }, () => {
			if (interaction && canTouchActivate(interaction)) {
				this.runInteraction(interaction, eventBlock.name);
			}
			onDone();
		});
		return true;
	}

	private checkTrigger(triggerTargets?: InteractableTarget[]) {
		checkRuntimeWaitingTrigger(
			this.session,
			(event) => this.handleRuntimeProgressionEvent(event),
			triggerTargets,
		);
	}

	private tileIdAt(x: number, y: number): string {
		return (
			this.currentArea.terrainTiles.find((tile) => tile.x === x && tile.y === y)
				?.tileId ?? "grass"
		);
	}

	private findArea(areaId: string): GameArea | undefined {
		return this.project.areas.find((area) => area.id === areaId);
	}

	private findEventBlock(
		id: string,
		areaId = this.currentArea.id,
	): EventBlock | undefined {
		return this.findArea(areaId)?.eventBlocks.find(
			(eventBlock) => eventBlock.id === id,
		);
	}

	private getResolvedNpc(npc: NPCInstance) {
		const resolved = resolveNPCInstance(
			this.project.npcs.find(
				(definition) => definition.id === npc.npcDefinitionId,
			),
			npc,
		);
		const runtimeAttributes = this.runtimeState.npcs[npc.id];
		return runtimeAttributes
			? {
					...resolved,
					attributes: runtimeAttributes,
					movementSpeed:
						runtimeAttributes.movementSpeed ?? resolved.movementSpeed,
				}
			: resolved;
	}

	private getObjectBehaviour(object: ObjectInstance) {
		return resolveObjectBehaviour(this.project, object);
	}

	// Shared runtime rule action event translation.
	private getRuleContext(): RuleActionContext {
		return createRuntimeRuleContext(this.session, (event) =>
			this.handleRuntimeRuleEvent(event),
		);
	}

	private handleRuntimeRuleEvent(event: RuntimeRuleEvent) {
		if (event.type === "status") {
			this.setStatus(event.message);
			return;
		}

		if (event.type === "stateChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "inventoryChanged") {
			this.onInventoryChanged?.(event.inventory);
			return;
		}

		if (event.type === "questsChanged") {
			this.onQuestsChanged?.(event.quests);
			return;
		}

		if (event.type === "shopOpened") {
			this.notifyShopChanged(event.message);
			return;
		}

		if (event.type === "cutsceneRequested") {
			const cutscene = this.project.cutscenes.find(
				(candidate) => candidate.id === event.cutsceneId,
			);
			if (!cutscene) {
				event.onDone();
				return;
			}

			this.promptText?.setText("");
			this.showCutscene(cutscene, () => {
				this.fireRuleTrigger(
					{ type: "on_cutscene_end", cutsceneId: event.cutsceneId },
					event.onDone,
				);
			});
			return;
		}

		if (event.type === "teleportRequested") {
			const eventBlock = this.findEventBlock(event.eventBlockId, event.areaId);
			if (!eventBlock) {
				this.setStatus(`Rule teleport target missing: ${event.eventBlockId}.`);
				return;
			}

			this.movePlayerToArea(event.areaId, eventBlock);
			return;
		}

		if (event.type === "movementModeChanged") {
			this.updateDebugPanel();
			return;
		}

		if (event.type === "gameEnded") {
			this.showEndMessage();
		}
	}

	private fireRuleTrigger(
		trigger: RuleTrigger,
		onDone: () => void = () => undefined,
	) {
		fireTrigger(trigger, this.project.rules, this.getRuleContext(), onDone);
	}

	private updateDebugPanel() {
		if (!this.debugText) {
			return;
		}

		const flags = Object.entries(this.runtimeState.flags)
			.map(([name, value]) => `${name}=${value ? "true" : "false"}`)
			.join(", ");
		const variables = Object.entries(this.runtimeState.variables)
			.map(([name, value]) => `${name}=${value}`)
			.join(", ");
		const inventory = Object.entries(this.runtimeState.inventory.items)
			.filter(([, quantity]) => quantity > 0)
			.map(([itemId, quantity]) => `${itemId}=${quantity}`)
			.join(", ");

		const vehicle = this.playerVehicleState.active
			? `${this.playerVehicleState.vehicleType ?? "vehicle"}:${this.playerVehicleState.vehicleObjectInstanceId ?? "-"}`
			: "-";

		this.debugText.setText(
			[
				`Area: ${this.currentArea.name}`,
				`Mode: ${this.currentMovementMode}`,
				`Health: ${this.runtimePlayerHealth}/${this.playerCombat.maxHealth}`,
				`Vehicle: ${vehicle}`,
				`Flags: ${flags || "-"}`,
				`Vars: ${variables || "-"}`,
				`Items: ${inventory || "-"}`,
			].join("\n"),
		);
	}

	private notifyInventoryChanged() {
		this.onInventoryChanged?.({ ...this.runtimeState.inventory.items });
	}

	private notifyCombatChanged() {
		this.onCombatChanged?.({
			playerHealth: this.runtimePlayerHealth,
			playerMaxHealth: this.playerCombat.maxHealth,
			...(this.recentEnemyHud ? { recentEnemy: this.recentEnemyHud } : {}),
			gameOver: this.runtimePlayerHealth <= 0,
		});
	}

	private notifyShopChanged(message?: string) {
		if (!this.activeShopId) {
			this.onShopChanged?.(null);
			return;
		}

		this.onShopChanged?.({
			shopId: this.activeShopId,
			stockByEntryId: { ...(this.runtimeShopStocks[this.activeShopId] ?? {}) },
			...(message ? { message } : {}),
		});
	}

	private syncQuestProgress() {
		syncRuntimeQuestProgress(this.session, (event) =>
			this.handleRuntimeProgressionEvent(event),
		);
	}

	private setStatus(message: string) {
		this.statusText?.setText(message);
	}
}
