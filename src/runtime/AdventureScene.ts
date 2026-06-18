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
	MovementMode,
	NPCInstance,
	ObjectInstance,
	PickupObject,
	PixelAsset,
	PlayerVehicleState,
	RuleTrigger,
} from "../types/game";
import {
	canAttack,
	damageNpc,
	damagePlayer,
	findAttackTarget,
	getPlayerCombatStats,
	type RuntimeCombatHudState,
	removeDefeatedNpc,
} from "./combat";
import {
	advanceDialogue,
	createRuntimeDialogueState,
	enterDialogueNode,
	getAvailableDialogueChoices,
	getDialogueNode,
	type RuntimeDialogueState,
} from "./dialogueEngine";
import { collectPickup } from "./inventory";
import {
	findDismountTile,
	resolveMovementAt,
	type VehicleMovementConfig,
} from "./movement";
import {
	isEnemyTouchingPlayer,
	isNpcTileWalkable,
	type NPCMovementState,
	updateEnemyNPC,
	updatePatrolNPC,
	updateStationaryNPC,
	updateWanderNPC,
} from "./npcMovement";
import { resolveNPCInstance } from "./npcResolver";
import {
	type ObjectBehaviourResult,
	runObjectBehaviour,
} from "./objectBehaviour";
import {
	activateQuest,
	completeQuest as completeRuntimeQuest,
	createRuntimeQuestState,
	failQuest,
	getQuestViews,
	markAreaEntered,
	type QuestView,
	type RuntimeQuestState,
	updateQuestProgress,
} from "./questEngine";
import {
	createRuntimeState,
	fireTrigger,
	type RuleActionContext,
	type RuntimeGameState,
} from "./ruleEngine";
import {
	buyShopEntry,
	createRuntimeShopStocks,
	type RuntimeShopPanelState,
	type RuntimeShopStocks,
} from "./shopRuntime";
import { createBoardedVehicleState } from "./vehicleRuntime";

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

type Interactable =
	| {
			kind: "event";
			label: string;
			interaction?: Interaction;
			eventBlock: EventBlock;
			distance: number;
	  }
	| {
			kind: "structure";
			label: string;
			interaction?: Interaction;
			structure: MapStructure;
			distance: number;
	  }
	| {
			kind: "object";
			label: string;
			interaction?: Interaction;
			object: ObjectInstance;
			distance: number;
	  }
	| { kind: "pickup"; label: string; pickup: PickupObject; distance: number }
	| {
			kind: "npc";
			label: string;
			interaction?: Interaction;
			npc: NPCInstance;
			distance: number;
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

function getInitialArea(project: GameProject): GameArea {
	const fallbackArea = project.areas[0];
	if (!fallbackArea) {
		throw new Error("Project must include at least one area.");
	}
	return (
		project.areas.find((area) => area.id === project.activeAreaId) ??
		fallbackArea
	);
}

function canTouchActivate(interaction: Interaction): boolean {
	return (
		interaction.activationMode === "on_touch" ||
		interaction.activationMode === "both"
	);
}

function canInteractActivate(interaction: Interaction): boolean {
	return (
		interaction.activationMode === "on_interact" ||
		interaction.activationMode === "both"
	);
}

export class AdventureScene extends Phaser.Scene {
	private readonly project: GameProject;
	private currentArea: GameArea;
	private tileSize: number;
	private readonly pixelTextureKeys = new Map<string, string>();
	private worldLayer?: Phaser.GameObjects.Container;
	private uiLayer?: Phaser.GameObjects.Container;
	private uiCamera?: Phaser.Cameras.Scene2D.Camera;
	private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd?: WasdKeys;
	private interactKeys?: InteractKeys;
	private combatKeys?: CombatKeys;
	private playerMarker?: Phaser.GameObjects.Container;
	private playerPosition = { x: 0, y: 0 };
	private progressionIndex = 0;
	private waitingForTrigger: { areaId?: string; eventBlockId: string } | null =
		null;
	private nextMoveAt = 0;
	private statusText?: Phaser.GameObjects.Text;
	private promptText?: Phaser.GameObjects.Text;
	private debugText?: Phaser.GameObjects.Text;
	private readonly runtimeState: RuntimeGameState;
	private readonly runtimeQuestState: RuntimeQuestState;
	private readonly collectedPickupIds = new Set<string>();
	private readonly openedObjectIds = new Set<string>();
	private readonly npcMarkers = new Map<string, Phaser.GameObjects.Container>();
	private readonly objectMarkers = new Map<
		string,
		Phaser.GameObjects.Container
	>();
	private readonly npcMovementStates = new Map<
		string,
		{ movement: NPCMovementState; nextMoveAt: number }
	>();
	private readonly enemyOrigins = new Map<string, { x: number; y: number }>();
	private readonly enemyContactCooldowns = new Map<string, number>();
	private readonly onInventoryChanged?: (
		inventory: Record<string, number>,
	) => void;
	private readonly onQuestsChanged?: (quests: QuestView[]) => void;
	private readonly onShopChanged?: (shop: RuntimeShopPanelState | null) => void;
	private readonly onCombatChanged?: (combat: RuntimeCombatHudState) => void;
	private readonly runtimeShopStocks: RuntimeShopStocks;
	private readonly defeatedNpcIds = new Set<string>();
	private activeShopId?: string;
	private currentMovementMode: Exclude<MovementMode, "swim"> = "walk";
	private playerFacing = { x: 0, y: 1 };
	private playerVehicleState: PlayerVehicleState = { active: false };
	private readonly playerCombat: ReturnType<typeof getPlayerCombatStats>;
	private runtimePlayerHealth: number;
	private nextAttackAt = 0;
	private recentEnemyHud?: RuntimeCombatHudState["recentEnemy"];
	private vehicleVisual?: Phaser.GameObjects.GameObject;
	private isCutsceneOpen = false;
	private isDialogueOpen = false;
	private activeDialogue?: {
		container?: Phaser.GameObjects.Container;
		definition: DialogueDefinition;
		state: RuntimeDialogueState;
	};
	private isFinished = false;
	private isMoving = false;

	constructor(
		project: GameProject,
		onInventoryChanged?: (inventory: Record<string, number>) => void,
		onQuestsChanged?: (quests: QuestView[]) => void,
		onShopChanged?: (shop: RuntimeShopPanelState | null) => void,
		onCombatChanged?: (combat: RuntimeCombatHudState) => void,
	) {
		super("AdventureScene");
		this.project = project;
		this.currentArea = getInitialArea(project);
		this.tileSize = this.currentArea.tileSize;
		this.playerCombat = getPlayerCombatStats(project.player);
		this.runtimePlayerHealth = this.playerCombat.health;
		this.runtimeState = createRuntimeState(
			project.gameState,
			project.areas.flatMap((area) => area.npcs),
			project.npcs,
		);
		this.runtimeQuestState = createRuntimeQuestState(project.quests);
		this.runtimeShopStocks = createRuntimeShopStocks(project.shops);
		this.onInventoryChanged = onInventoryChanged;
		this.onQuestsChanged = onQuestsChanged;
		this.onShopChanged = onShopChanged;
		this.onCombatChanged = onCombatChanged;
	}

	openShop(shopId: string) {
		const shop = this.project.shops.find(
			(candidate) => candidate.id === shopId,
		);
		if (!shop) {
			this.setStatus(`Shop missing: ${shopId}.`);
			return;
		}

		this.activeShopId = shopId;
		this.notifyShopChanged();
		this.setStatus(`Opened ${shop.name}.`);
	}

	closeShop() {
		this.activeShopId = undefined;
		this.onShopChanged?.(null);
	}

	buyShopEntry(entryId: string) {
		if (!this.activeShopId) {
			return;
		}

		const shop = this.project.shops.find(
			(candidate) => candidate.id === this.activeShopId,
		);
		if (!shop) {
			this.closeShop();
			return;
		}

		const stock = this.runtimeShopStocks[shop.id] ?? {};
		this.runtimeShopStocks[shop.id] = stock;
		const result = buyShopEntry(
			shop,
			entryId,
			this.runtimeState.inventory,
			this.project.items,
			stock,
		);
		this.setStatus(result.message);
		this.notifyInventoryChanged();
		this.syncQuestProgress();
		this.updateDebugPanel();
		this.notifyShopChanged(result.message);
	}

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
		markAreaEntered(this.runtimeQuestState, this.currentArea.id);
		this.syncQuestProgress();

		this.fireRuleTrigger({ type: "on_game_start" }, () =>
			this.processProgression(),
		);
	}

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
				interactable.kind === "event"
					? interactable.eventBlock.id
					: interactable.kind === "structure"
						? interactable.structure.id
						: interactable.kind === "object"
							? interactable.object.id
							: interactable.kind === "npc"
								? interactable.npc.id
								: "";
			if (interactable.kind === "pickup") {
				this.collectPickupObject(interactable.pickup);
				return;
			}
			this.fireRuleTrigger({ type: "on_interact", targetId }, () => {
				if (
					interactable.kind === "object" &&
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
			.filter((pickup) => !this.isPickupCollected(pickup))
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

	private processProgression() {
		while (this.progressionIndex < this.project.progression.length) {
			const step = this.project.progression[this.progressionIndex];
			const action = step.action;

			if (action.type === "play_cutscene") {
				const cutscene = this.project.cutscenes.find(
					(candidate) => candidate.id === action.cutsceneId,
				);

				if (!cutscene) {
					this.progressionIndex += 1;
					continue;
				}

				this.showCutscene(cutscene, () => {
					this.fireRuleTrigger(
						{ type: "on_cutscene_end", cutsceneId: cutscene.id },
						() => {
							this.progressionIndex += 1;
							this.processProgression();
						},
					);
				});
				return;
			}

			if (action.type === "spawn_player") {
				const eventBlock = this.findEventBlock(
					action.eventBlockId,
					action.areaId,
				);
				if (eventBlock) {
					this.movePlayerToArea(action.areaId, eventBlock);
				}
				this.progressionIndex += 1;
				continue;
			}

			if (action.type === "teleport_player") {
				const eventBlock = this.findEventBlock(
					action.eventBlockId,
					action.areaId,
				);
				if (eventBlock) {
					this.movePlayerToArea(action.areaId, eventBlock);
				}
				this.progressionIndex += 1;
				continue;
			}

			if (action.type === "wait_for_trigger") {
				const eventBlock = this.findEventBlock(
					action.eventBlockId,
					action.areaId,
				);
				this.waitingForTrigger = {
					areaId: action.areaId,
					eventBlockId: action.eventBlockId,
				};
				this.setStatus(
					eventBlock ? `Find trigger: ${eventBlock.name}` : "Find the trigger.",
				);
				return;
			}

			this.showEndMessage();
			this.progressionIndex = this.project.progression.length;
			return;
		}

		this.setStatus("Progression complete.");
	}

	private movePlayerToArea(areaId: string, eventBlock: EventBlock) {
		const nextArea = this.findArea(areaId);
		if (!nextArea) {
			return;
		}

		this.leaveVehicle(false);
		const enteredNewArea = nextArea.id !== this.currentArea.id;
		if (enteredNewArea) {
			this.currentArea = nextArea;
			this.tileSize = nextArea.tileSize;
			this.isMoving = false;
			this.renderMap();
			this.configureCameras();
		}

		this.spawnPlayer(eventBlock);
		markAreaEntered(this.runtimeQuestState, nextArea.id);
		this.syncQuestProgress();
		this.setStatus(`${this.project.player.name} entered ${nextArea.name}.`);
		this.updateDebugPanel();
		if (enteredNewArea) {
			this.fireRuleTrigger({ type: "on_area_enter", areaId: nextArea.id });
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

	private updateNpcMovement(time: number) {
		this.currentArea.npcs.forEach((npc) => {
			if (this.defeatedNpcIds.has(npc.id)) {
				return;
			}

			const runtime = this.npcMovementStates.get(npc.id) ?? {
				movement: { patrolIndex: 0 },
				nextMoveAt: time + 450,
			};
			if (time < runtime.nextMoveAt) {
				this.npcMovementStates.set(npc.id, runtime);
				return;
			}

			const canMove = (x: number, y: number) =>
				!(this.playerPosition.x === x && this.playerPosition.y === y) &&
				isNpcTileWalkable(this.currentArea, npc.id, x, y);
			const origin = this.enemyOrigins.get(npc.id) ?? { x: npc.x, y: npc.y };
			this.enemyOrigins.set(npc.id, origin);
			const resolved = this.getResolvedNpc(npc);
			const canUseEnemyMovement =
				resolved.attributes.alignment === "hostile" &&
				resolved.enemyBehaviour?.enabled === true;
			const update = canUseEnemyMovement
				? updateEnemyNPC(
						resolved,
						this.playerPosition,
						origin,
						runtime.movement,
						canMove,
					)
				: resolved.movementMode === "patrol"
					? updatePatrolNPC(resolved, runtime.movement, canMove)
					: resolved.movementMode === "wander"
						? updateWanderNPC(
								resolved,
								this.currentArea,
								runtime.movement,
								canMove,
							)
						: updateStationaryNPC(resolved, runtime.movement);
			const speed = clamp(
				this.runtimeState.npcs[npc.id]?.movementSpeed ?? resolved.movementSpeed,
				0.1,
				10,
			);
			const duration = Math.max(80, 360 / speed);
			const wait = update.moved ? 320 : 560;

			npc.x = update.x;
			npc.y = update.y;
			npc.facing = update.facing;
			this.npcMovementStates.set(npc.id, {
				movement: update.state,
				nextMoveAt: time + duration + wait,
			});

			if (update.moved) {
				this.tweens.add({
					targets: this.npcMarkers.get(npc.id),
					x: npc.x * this.tileSize + this.tileSize / 2,
					y: npc.y * this.tileSize + this.tileSize / 2,
					duration,
					ease: "Sine.easeInOut",
				});
			}

			if (isEnemyTouchingPlayer(resolved, this.playerPosition)) {
				this.handleEnemyContact(resolved, time);
			}
		});
	}

	private handleEnemyContact(npc: NPCInstance, time: number) {
		const nextAllowedAt = this.enemyContactCooldowns.get(npc.id) ?? 0;
		if (time < nextAllowedAt) {
			return;
		}

		const damage = npc.enemyBehaviour?.contactDamage ?? 0;
		if (damage > 0) {
			const result = damagePlayer(this.runtimePlayerHealth, damage);
			this.runtimePlayerHealth = result.health;
			this.setStatus(
				`Enemy touched player. Health ${this.runtimePlayerHealth}/${this.playerCombat.maxHealth}.`,
			);
			if (result.defeated) {
				this.showGameOverMessage();
			}
		} else {
			this.setStatus("Enemy touched player.");
		}
		this.enemyContactCooldowns.set(npc.id, time + 1200);
		this.updateDebugPanel();
		this.notifyCombatChanged();
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

	private findNearestInteractable(): Interactable | null {
		const candidates: Interactable[] = [];

		this.currentArea.eventBlocks.forEach((eventBlock) => {
			const interaction = this.getEventInteraction(eventBlock);
			const hasRule = this.hasRuleTrigger({
				type: "on_interact",
				targetId: eventBlock.id,
			});

			if ((!interaction || !canInteractActivate(interaction)) && !hasRule) {
				return;
			}

			const distance =
				Math.abs(eventBlock.x - this.playerPosition.x) +
				Math.abs(eventBlock.y - this.playerPosition.y);
			if (distance <= 1) {
				candidates.push({
					kind: "event",
					label: eventBlock.name,
					interaction,
					eventBlock,
					distance,
				});
			}
		});

		this.currentArea.structures.forEach((structure) => {
			const hasRule = this.hasRuleTrigger({
				type: "on_interact",
				targetId: structure.id,
			});
			if (
				(!structure.interaction ||
					!canInteractActivate(structure.interaction)) &&
				!hasRule
			) {
				return;
			}

			const distance = this.distanceToStructure(structure);
			if (distance <= 1) {
				candidates.push({
					kind: "structure",
					label: structure.name,
					interaction: structure.interaction,
					structure,
					distance,
				});
			}
		});

		this.currentArea.objects.forEach((object) => {
			const definition = this.getObjectDefinition(object);
			const interaction = object.interaction ?? definition?.defaultInteraction;
			const hasRule = this.hasRuleTrigger({
				type: "on_interact",
				targetId: object.id,
			});
			const behaviour = this.getObjectBehaviour(object);
			const hasBehaviour = behaviour.type !== "none";
			if (
				(!interaction || !canInteractActivate(interaction)) &&
				!hasRule &&
				!hasBehaviour
			) {
				return;
			}

			const distance = this.distanceToObject(object);
			if (distance <= 1) {
				candidates.push({
					kind: "object",
					label:
						object.nameOverride ??
						this.getObjectDefinition(object)?.name ??
						"Object",
					interaction,
					object,
					distance,
				});
			}
		});

		this.currentArea.pickups.forEach((pickup) => {
			if (
				pickup.pickupMode !== "on_interact" ||
				this.isPickupCollected(pickup)
			) {
				return;
			}

			const distance =
				Math.abs(pickup.x - this.playerPosition.x) +
				Math.abs(pickup.y - this.playerPosition.y);
			if (distance <= 1) {
				const item = this.project.items.find(
					(candidate) => candidate.id === pickup.itemId,
				);
				candidates.push({
					kind: "pickup",
					label: item?.name ?? "item",
					pickup,
					distance,
				});
			}
		});

		this.currentArea.npcs.forEach((npc) => {
			const resolved = this.getResolvedNpc(npc);
			const attributes = this.runtimeState.npcs[npc.id] ?? resolved.attributes;
			if (!attributes.canInteract) {
				return;
			}

			const hasRule = this.hasRuleTrigger({
				type: "on_interact",
				targetId: npc.id,
			});
			if (
				(!resolved.interaction || !canInteractActivate(resolved.interaction)) &&
				!hasRule
			) {
				return;
			}

			const distance =
				Math.abs(npc.x - this.playerPosition.x) +
				Math.abs(npc.y - this.playerPosition.y);
			if (distance <= 1) {
				candidates.push({
					kind: "npc",
					label: resolved.name,
					interaction: resolved.interaction,
					npc,
					distance,
				});
			}
		});

		return (
			candidates.sort((a, b) => {
				if (a.distance !== b.distance) {
					return a.distance - b.distance;
				}

				return a.kind === "event" ? -1 : 1;
			})[0] ?? null
		);
	}

	private distanceToStructure(structure: MapStructure): number {
		const minX = structure.x;
		const maxX = structure.x + structure.widthTiles - 1;
		const minY = structure.y;
		const maxY = structure.y + structure.heightTiles - 1;
		const deltaX =
			this.playerPosition.x < minX
				? minX - this.playerPosition.x
				: this.playerPosition.x > maxX
					? this.playerPosition.x - maxX
					: 0;
		const deltaY =
			this.playerPosition.y < minY
				? minY - this.playerPosition.y
				: this.playerPosition.y > maxY
					? this.playerPosition.y - maxY
					: 0;

		return deltaX + deltaY;
	}

	private distanceToObject(object: ObjectInstance): number {
		const definition = this.getObjectDefinition(object);
		const minX = object.x;
		const maxX =
			object.x + (object.widthTiles ?? definition?.widthTiles ?? 1) - 1;
		const minY = object.y;
		const maxY =
			object.y + (object.heightTiles ?? definition?.heightTiles ?? 1) - 1;
		const deltaX =
			this.playerPosition.x < minX
				? minX - this.playerPosition.x
				: this.playerPosition.x > maxX
					? this.playerPosition.x - maxX
					: 0;
		const deltaY =
			this.playerPosition.y < minY
				? minY - this.playerPosition.y
				: this.playerPosition.y > maxY
					? this.playerPosition.y - maxY
					: 0;

		return deltaX + deltaY;
	}

	private updatePrompt(interactable: Interactable | null) {
		if (!this.promptText) {
			return;
		}

		this.promptText.setText(
			interactable
				? interactable.kind === "pickup"
					? `Press E to pick up ${interactable.label}`
					: interactable.kind === "npc"
						? `Press E to talk to ${interactable.label}`
						: interactable.kind === "object"
							? this.promptForObject(interactable)
							: this.promptForInteraction(interactable.interaction)
				: "",
		);
	}

	private promptForObject(
		interactable: Extract<Interactable, { kind: "object" }>,
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
		const result = runObjectBehaviour(this.getObjectBehaviour(object), {
			itemDefinitions: this.project.items,
			objectId: object.id,
			openedObjectIds: this.openedObjectIds,
			state: this.runtimeState,
		});

		return this.applyObjectBehaviourResult(object, result);
	}

	private tryAttack(time: number): boolean {
		if (!canAttack(time, this.nextAttackAt)) {
			this.setStatus("Attack cooling down.");
			return false;
		}

		this.nextAttackAt = time + this.playerCombat.attackCooldownMs;
		const target = findAttackTarget(
			this.currentArea.npcs,
			this.runtimeState.npcs,
			this.defeatedNpcIds,
			this.playerPosition,
			this.playerFacing,
			this.playerCombat.attackRangeTiles,
		);

		if (!target) {
			this.setStatus("Attack missed.");
			return false;
		}

		const attributes = this.runtimeState.npcs[target.id] ?? target.attributes;
		const result = damageNpc(attributes, this.playerCombat.attackDamage);
		const enemyName = this.getNpcName(target);
		this.recentEnemyHud = {
			id: target.id,
			name: enemyName,
			health: result.health,
			maxHealth: attributes.maxHealth,
		};

		if (result.defeated) {
			this.defeatNpc(target, enemyName);
		} else {
			this.setStatus(`Hit ${enemyName} for ${this.playerCombat.attackDamage}.`);
		}

		this.updateDebugPanel();
		this.notifyCombatChanged();
		return true;
	}

	private defeatNpc(npc: NPCInstance, enemyName = this.getNpcName(npc)) {
		this.defeatedNpcIds.add(npc.id);
		this.runtimeState.flags[`npc_defeated_${npc.id}`] = true;
		this.currentArea.npcs = removeDefeatedNpc(this.currentArea.npcs, npc.id);
		this.npcMarkers.get(npc.id)?.destroy();
		this.npcMarkers.delete(npc.id);
		this.npcMovementStates.delete(npc.id);
		this.enemyContactCooldowns.delete(npc.id);
		this.setStatus(`${enemyName} defeated.`);
		this.syncQuestProgress();
		// TODO: Add on_npc_defeated rule trigger and combat rule actions when Logic Builder scope expands.
	}

	private applyObjectBehaviourResult(
		object: ObjectInstance,
		result: ObjectBehaviourResult,
	): boolean {
		if (!result.handled) {
			return false;
		}

		if (result.type === "container") {
			this.onInventoryChanged?.({ ...this.runtimeState.inventory.items });
			this.syncQuestProgress();
			this.updateDebugPanel();
			this.setStatus(result.message);
			return true;
		}

		if (result.type === "door") {
			if (!result.allowed) {
				if (result.lockedCutsceneId) {
					const cutscene = this.project.cutscenes.find(
						(candidate) => candidate.id === result.lockedCutsceneId,
					);
					if (cutscene) {
						this.showCutscene(cutscene, () => undefined);
						return true;
					}
				}
				this.setStatus(result.message);
				return true;
			}

			if (result.targetAreaId && result.targetEventBlockId) {
				const eventBlock = this.findEventBlock(
					result.targetEventBlockId,
					result.targetAreaId,
				);
				if (eventBlock) {
					this.movePlayerToArea(result.targetAreaId, eventBlock);
				} else {
					this.setStatus(`Door target missing: ${object.id}.`);
				}
				return true;
			}

			this.setStatus(result.message);
			return true;
		}

		if (result.type === "sign") {
			this.showCutscene(
				{
					id: `object_sign_${object.id}`,
					name:
						object.nameOverride ??
						this.getObjectDefinition(object)?.name ??
						"Sign",
					backgroundImageId: "forest_path",
					speakerName:
						object.nameOverride ??
						this.getObjectDefinition(object)?.name ??
						"Sign",
					text: result.text,
				},
				() => undefined,
			);
			return true;
		}

		if (result.type === "vehicle") {
			return this.boardVehicle(object, result.behaviour, result.message);
		}

		return false;
	}

	private boardVehicle(
		object: ObjectInstance,
		behaviour: VehicleMovementConfig,
		message: string,
	): boolean {
		if (behaviour.vehicleType !== "boat") {
			this.setStatus(message);
			return true;
		}

		this.playerVehicleState = createBoardedVehicleState(object.id, behaviour);
		this.currentMovementMode = behaviour.movementMode;
		this.addVehicleVisual(behaviour);
		this.updateDebugPanel();
		this.setStatus("Boarded boat.");
		return true;
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

	private leaveVehicle(showMessage: boolean) {
		if (!this.playerVehicleState.active) {
			return;
		}

		this.playerVehicleState = { active: false };
		this.currentMovementMode = "walk";
		this.vehicleVisual?.destroy();
		this.vehicleVisual = undefined;
		this.updateDebugPanel();
		if (showMessage) {
			this.setStatus("Dismounted.");
		}
	}

	private getActiveVehicleBehaviour(): VehicleMovementConfig | undefined {
		if (
			!this.playerVehicleState.active ||
			!this.playerVehicleState.vehicleObjectInstanceId
		) {
			return undefined;
		}

		const object = this.currentArea.objects.find(
			(candidate) =>
				candidate.id === this.playerVehicleState.vehicleObjectInstanceId,
		);
		const behaviour = object ? this.getObjectBehaviour(object) : undefined;
		return behaviour?.type === "vehicle" ? behaviour : undefined;
	}

	private tryDismountVehicle(): boolean {
		const behaviour = this.getActiveVehicleBehaviour();
		const vehicleObjectId = this.playerVehicleState.vehicleObjectInstanceId;
		const vehicleObject = vehicleObjectId
			? this.currentArea.objects.find(
					(candidate) => candidate.id === vehicleObjectId,
				)
			: undefined;

		if (!behaviour || !vehicleObject) {
			this.leaveVehicle(false);
			this.setStatus("Vehicle missing.");
			return false;
		}

		const waterTile = { ...this.playerPosition };
		const target = findDismountTile(
			this.currentArea,
			this.playerPosition,
			this.playerFacing,
			behaviour,
		);
		if (!target.canDismount) {
			this.setStatus(target.reason);
			return false;
		}

		vehicleObject.x = waterTile.x;
		vehicleObject.y = waterTile.y;
		this.objectMarkers
			.get(vehicleObject.id)
			?.setPosition(
				vehicleObject.x * this.tileSize,
				vehicleObject.y * this.tileSize,
			);

		this.playerPosition = { x: target.x, y: target.y };
		this.playerMarker?.setPosition(
			target.x * this.tileSize + this.tileSize / 2,
			target.y * this.tileSize + this.tileSize / 2,
		);
		this.leaveVehicle(true);
		if (this.checkTouchInteractions(() => this.checkTrigger())) {
			return true;
		}
		this.checkTrigger();
		return true;
	}

	private collectPickupObject(pickup: PickupObject): boolean {
		if (this.isPickupCollected(pickup)) {
			return false;
		}

		const collected = collectPickup(
			pickup,
			this.runtimeState.inventory,
			this.project.items,
			this.collectedPickupIds,
		);
		if (!collected) {
			return false;
		}

		if (pickup.collectedFlag) {
			this.runtimeState.flags[pickup.collectedFlag] = true;
		}

		const item = this.project.items.find(
			(candidate) => candidate.id === pickup.itemId,
		);
		if (pickup.once) {
			this.worldLayer?.getByName(`pickup:${pickup.id}`)?.destroy();
		}
		this.notifyInventoryChanged();
		this.syncQuestProgress();
		this.updateDebugPanel();
		this.setStatus(
			`Picked up ${item?.name ?? pickup.itemId} x${pickup.quantity}.`,
		);
		return true;
	}

	private isPickupCollected(pickup: PickupObject): boolean {
		return Boolean(
			pickup.once &&
				(this.collectedPickupIds.has(pickup.id) ||
					(pickup.collectedFlag &&
						this.runtimeState.flags[pickup.collectedFlag])),
		);
	}

	private tryMove(deltaX: number, deltaY: number, time: number) {
		this.playerFacing = { x: deltaX, y: deltaY };
		const nextX = this.playerPosition.x + deltaX;
		const nextY = this.playerPosition.y + deltaY;

		if (
			nextX < 0 ||
			nextY < 0 ||
			nextX >= this.currentArea.width ||
			nextY >= this.currentArea.height
		) {
			return;
		}

		const activeVehicle = this.getActiveVehicleBehaviour();
		const movement = resolveMovementAt(
			this.currentArea,
			nextX,
			nextY,
			this.project.player,
			{
				activeVehicle: activeVehicle
					? {
							...activeVehicle,
							vehicleObjectInstanceId:
								this.playerVehicleState.vehicleObjectInstanceId,
						}
					: undefined,
			},
		);
		if (!movement.canMove) {
			this.setStatus(movement.reason ?? "Blocked.");
			return;
		}

		const duration = this.getMoveDuration(movement.speedMultiplier);
		const destinationX = nextX * this.tileSize + this.tileSize / 2;
		const destinationY = nextY * this.tileSize + this.tileSize / 2;

		this.isMoving = true;
		this.nextMoveAt = time + duration;
		this.playerPosition = { x: nextX, y: nextY };
		this.tweens.add({
			targets: this.playerMarker,
			x: destinationX,
			y: destinationY,
			duration,
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.isMoving = false;
				if (this.checkTouchInteractions(() => this.checkTrigger())) {
					return;
				}
				this.checkTrigger();
			},
		});
	}

	private getMoveDuration(speedMultiplier = 1): number {
		const baseDuration = 360 - clamp(this.project.player.speed, 1, 20) * 24;
		return Math.max(50, baseDuration / clamp(speedMultiplier, 0.1, 4));
	}

	private checkTouchInteractions(onDone: () => void): boolean {
		const pickup = this.currentArea.pickups.find(
			(candidate) =>
				candidate.pickupMode === "on_touch" &&
				candidate.x === this.playerPosition.x &&
				candidate.y === this.playerPosition.y,
		);
		if (pickup && this.collectPickupObject(pickup)) {
			onDone();
			return true;
		}

		const object = this.currentArea.objects.find(
			(candidate) =>
				candidate.x === this.playerPosition.x &&
				candidate.y === this.playerPosition.y,
		);
		const objectInteraction = object
			? (object.interaction ??
				this.getObjectDefinition(object)?.defaultInteraction)
			: undefined;
		const objectBehaviour = object
			? this.getObjectBehaviour(object)
			: { type: "none" as const };
		const objectHasRule = object
			? this.hasRuleTrigger({ type: "on_touch", targetId: object.id })
			: false;

		const objectBehaviourCanTouch =
			objectBehaviour.type !== "none" && objectBehaviour.type !== "vehicle";
		if (
			object &&
			((objectInteraction && canTouchActivate(objectInteraction)) ||
				objectHasRule ||
				objectBehaviourCanTouch)
		) {
			this.fireRuleTrigger({ type: "on_touch", targetId: object.id }, () => {
				if (objectBehaviourCanTouch) {
					this.runObjectBehaviour(object);
				}
				if (objectInteraction && canTouchActivate(objectInteraction)) {
					this.runInteraction(
						objectInteraction,
						object.nameOverride ??
							this.getObjectDefinition(object)?.name ??
							"Object",
					);
				}
				onDone();
			});
			return true;
		}

		const eventBlock = this.currentArea.eventBlocks.find(
			(candidate) =>
				candidate.x === this.playerPosition.x &&
				candidate.y === this.playerPosition.y,
		);
		const interaction = eventBlock
			? this.getEventInteraction(eventBlock)
			: undefined;
		const hasRule = eventBlock
			? this.hasRuleTrigger({ type: "on_touch", targetId: eventBlock.id })
			: false;

		if (
			!eventBlock ||
			((!interaction || !canTouchActivate(interaction)) && !hasRule)
		) {
			return false;
		}

		this.fireRuleTrigger({ type: "on_touch", targetId: eventBlock.id }, () => {
			if (interaction && canTouchActivate(interaction)) {
				this.runInteraction(interaction, eventBlock.name);
			}
			onDone();
		});
		return true;
	}

	private checkTrigger() {
		if (!this.waitingForTrigger) {
			return;
		}

		const eventBlock = this.findEventBlock(
			this.waitingForTrigger.eventBlockId,
			this.waitingForTrigger.areaId,
		);
		if (!eventBlock) {
			this.waitingForTrigger = null;
			this.progressionIndex += 1;
			this.processProgression();
			return;
		}

		const isInTargetArea =
			!this.waitingForTrigger.areaId ||
			this.waitingForTrigger.areaId === this.currentArea.id;
		if (
			isInTargetArea &&
			eventBlock.x === this.playerPosition.x &&
			eventBlock.y === this.playerPosition.y
		) {
			this.waitingForTrigger = null;
			this.progressionIndex += 1;
			this.processProgression();
		}
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

	private getEventInteraction(eventBlock: EventBlock): Interaction | undefined {
		// TODO: Migrate legacy direct interactions into friendly rules once the rule editor covers every use case.
		if (eventBlock.interaction) {
			return eventBlock.interaction;
		}

		if (eventBlock.kind === "area_link" && eventBlock.link) {
			return {
				type: "area_link",
				activationMode: "on_touch",
				...eventBlock.link,
			};
		}

		return undefined;
	}

	private getObjectDefinition(object: ObjectInstance) {
		return this.project.objects.find(
			(definition) => definition.id === object.objectDefinitionId,
		);
	}

	private getNpcName(npc: NPCInstance): string {
		return this.getResolvedNpc(npc).name;
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
		return (
			object.behaviourOverride ??
			this.getObjectDefinition(object)?.defaultBehaviour ?? {
				type: "none" as const,
			}
		);
	}

	private hasRuleTrigger(trigger: RuleTrigger): boolean {
		return this.project.rules.some((rule) => {
			if (!rule.enabled || rule.trigger.type !== trigger.type) {
				return false;
			}

			if (
				rule.trigger.type === "on_interact" &&
				trigger.type === "on_interact"
			) {
				return rule.trigger.targetId === trigger.targetId;
			}

			if (rule.trigger.type === "on_touch" && trigger.type === "on_touch") {
				return rule.trigger.targetId === trigger.targetId;
			}

			if (
				rule.trigger.type === "on_area_enter" &&
				trigger.type === "on_area_enter"
			) {
				return rule.trigger.areaId === trigger.areaId;
			}

			if (
				rule.trigger.type === "on_cutscene_end" &&
				trigger.type === "on_cutscene_end"
			) {
				return rule.trigger.cutsceneId === trigger.cutsceneId;
			}

			return (
				rule.trigger.type === "on_game_start" &&
				trigger.type === "on_game_start"
			);
		});
	}

	private getRuleContext(): RuleActionContext {
		return {
			state: this.runtimeState,
			playCutscene: (cutsceneId, onDone) => {
				const cutscene = this.project.cutscenes.find(
					(candidate) => candidate.id === cutsceneId,
				);
				if (!cutscene) {
					this.setStatus(`Rule cutscene missing: ${cutsceneId}.`);
					onDone();
					return;
				}

				this.promptText?.setText("");
				this.showCutscene(cutscene, () => {
					this.fireRuleTrigger({ type: "on_cutscene_end", cutsceneId }, onDone);
				});
			},
			teleport: (areaId, eventBlockId) => {
				const eventBlock = this.findEventBlock(eventBlockId, areaId);
				if (!eventBlock) {
					this.setStatus(`Rule teleport target missing: ${eventBlockId}.`);
					return;
				}

				this.movePlayerToArea(areaId, eventBlock);
			},
			changeMovementMode: (mode) => {
				this.currentMovementMode = mode;
				this.setStatus(`Movement mode: ${mode}.`);
				this.updateDebugPanel();
			},
			endGame: () => this.showEndMessage(),
			activateQuest: (questId) => {
				activateQuest(this.runtimeQuestState, questId);
				this.syncQuestProgress();
			},
			completeQuest: (questId) => {
				if (
					completeRuntimeQuest(
						this.runtimeQuestState,
						questId,
						this.runtimeState,
						this.project.items,
					)
				) {
					this.notifyInventoryChanged();
					this.updateDebugPanel();
				}
				this.syncQuestProgress();
			},
			failQuest: (questId) => {
				failQuest(this.runtimeQuestState, questId);
				this.syncQuestProgress();
			},
			openShop: (shopId) => this.openShop(shopId),
			itemDefinitions: this.project.items,
			stateChanged: () => {
				this.updateDebugPanel();
				this.notifyInventoryChanged();
				this.syncQuestProgress();
			},
		};
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
		const stateChanged = updateQuestProgress(
			this.runtimeQuestState,
			this.runtimeState,
			this.project.items,
		);
		if (stateChanged) {
			this.notifyInventoryChanged();
			this.updateDebugPanel();
		}
		this.onQuestsChanged?.(
			getQuestViews(this.runtimeQuestState, this.runtimeState),
		);
	}

	private setStatus(message: string) {
		this.statusText?.setText(message);
	}
}
