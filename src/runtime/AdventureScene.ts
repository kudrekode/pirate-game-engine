import Phaser from "phaser";
import {
  backgroundPresets,
  characterSprites,
  getTilePreset,
  getVisualPreset,
  portraitPresets,
} from "../data/presets";
import { getOverlayPreset, getStructurePreset } from "../data/mapVisuals";
import type { Cutscene, EventBlock, GameArea, GameProject, MapStructure, PixelAsset } from "../types/game";
import { resolveMovementAt } from "./movement";

type WasdKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
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
  return project.areas.find((area) => area.id === project.activeAreaId) ?? project.areas[0]!;
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
  private playerMarker?: Phaser.GameObjects.Container;
  private playerPosition = { x: 0, y: 0 };
  private progressionIndex = 0;
  private waitingForTrigger: { areaId?: string; eventBlockId: string } | null = null;
  private nextMoveAt = 0;
  private statusText?: Phaser.GameObjects.Text;
  private isCutsceneOpen = false;
  private isFinished = false;
  private isMoving = false;

  constructor(project: GameProject) {
    super("AdventureScene");
    this.project = project;
    this.currentArea = getInitialArea(project);
    this.tileSize = this.currentArea.tileSize;
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

    this.processProgression();
  }

  update(time: number) {
    if (
      !this.playerMarker ||
      this.isCutsceneOpen ||
      this.isFinished ||
      this.isMoving ||
      time < this.nextMoveAt
    ) {
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
    const zoom = Math.min(screenWidth / visibleWorldWidth, screenHeight / visibleWorldHeight);
    const worldViewportWidth = Math.round(visibleWorldWidth * zoom);
    const worldViewportHeight = Math.round(visibleWorldHeight * zoom);
    const worldViewportX = Math.floor((screenWidth - worldViewportWidth) / 2);
    const worldViewportY = Math.floor((screenHeight - worldViewportHeight) / 2);

    this.cameras.main
      .setViewport(worldViewportX, worldViewportY, worldViewportWidth, worldViewportHeight)
      .setZoom(zoom)
      .setBounds(
        0,
        0,
        this.currentArea.width * this.tileSize,
        this.currentArea.height * this.tileSize,
      )
      .setRoundPixels(true);

    if (!this.uiCamera) {
      this.uiCamera = this.cameras.add(0, 0, screenWidth, screenHeight).setScroll(0, 0);
    } else {
      this.uiCamera.setViewport(0, 0, screenWidth, screenHeight).setScroll(0, 0);
    }
    if (this.uiLayer && this.worldLayer) {
      this.cameras.main.ignore(this.uiLayer);
      this.uiCamera.ignore(this.worldLayer);
    }
  }

  private configurePlayerCamera(centerX: number, centerY: number) {
    const camera = this.cameras.main;
    const config = this.project.camera;
    const deadzoneWidth = (config.deadzoneWidthTiles ?? 0) * this.tileSize * camera.zoom;
    const deadzoneHeight = (config.deadzoneHeightTiles ?? 0) * this.tileSize * camera.zoom;

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
    const overlayLookup = new Map(
      this.currentArea.overlayTiles.map((tile) => [tileKey(tile.x, tile.y), tile.overlayId]),
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

        const tileTexture = this.addPixelImage(tileId, worldX, worldY, this.tileSize, this.tileSize);
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

    this.currentArea.structures.forEach((structure) => this.renderStructure(structure));
  }

  private createPixelTextures() {
    Object.values(this.project.pixelAssets ?? {}).forEach((asset) => {
      const textureKey = this.getPixelTextureKey(asset);

      if (this.textures.exists(textureKey)) {
        this.textures.remove(textureKey);
      }

      const texture = this.textures.createCanvas(textureKey, asset.width, asset.height);
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
      for (let y = height * 0.18; y < height * 0.86; y += this.tileSize * 0.34) {
        graphics.fillRect(width * 0.08, y, width * 0.84, this.tileSize * 0.18);
      }
      graphics.lineStyle(2, hexToNumber(preset.shadowColor), 0.65);
      for (let x = width * 0.14; x < width * 0.9; x += this.tileSize * 0.5) {
        graphics.lineBetween(x, height * 0.14, x, height * 0.9);
      }
    } else if (structure.structureId === "ruin_wall") {
      graphics.fillStyle(hexToNumber(preset.wallColor), 1);
      graphics.fillRect(width * 0.08, height * 0.35, width * 0.84, height * 0.42);
      graphics.fillStyle(hexToNumber(preset.roofColor), 1);
      for (let x = width * 0.1; x < width * 0.82; x += this.tileSize * 0.48) {
        graphics.fillRect(x, height * 0.23, this.tileSize * 0.28, this.tileSize * 0.28);
      }
      graphics.lineStyle(2, hexToNumber(preset.shadowColor), 0.5);
      graphics.strokeRect(width * 0.08, height * 0.35, width * 0.84, height * 0.42);
    } else {
      graphics.fillStyle(hexToNumber(preset.wallColor), 1);
      graphics.fillRect(width * 0.18, height * 0.36, width * 0.64, height * 0.5);
      graphics.fillStyle(hexToNumber(preset.roofColor), 1);
      graphics.fillTriangle(
        width * 0.08,
        height * 0.4,
        width * 0.5,
        height * 0.08,
        width * 0.92,
        height * 0.4,
      );
      graphics.fillRect(width * 0.14, height * 0.35, width * 0.72, height * 0.14);
      graphics.fillStyle(0x382211, 0.62);
      graphics.fillRect(width * 0.44, height * 0.62, width * 0.13, height * 0.24);
      graphics.fillStyle(0xf6d365, 0.78);
      graphics.fillRect(width * 0.26, height * 0.5, width * 0.12, height * 0.1);
      graphics.fillRect(width * 0.62, height * 0.5, width * 0.12, height * 0.1);
      graphics.lineStyle(2, hexToNumber(preset.shadowColor), 0.45);
      graphics.strokeRect(width * 0.18, height * 0.36, width * 0.64, height * 0.5);
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
          this.progressionIndex += 1;
          this.processProgression();
        });
        return;
      }

      if (action.type === "spawn_player") {
        const eventBlock = this.findEventBlock(action.eventBlockId, action.areaId);
        if (eventBlock) {
          this.movePlayerToArea(action.areaId, eventBlock);
        }
        this.progressionIndex += 1;
        continue;
      }

      if (action.type === "teleport_player") {
        const eventBlock = this.findEventBlock(action.eventBlockId, action.areaId);
        if (eventBlock) {
          this.movePlayerToArea(action.areaId, eventBlock);
        }
        this.progressionIndex += 1;
        continue;
      }

      if (action.type === "wait_for_trigger") {
        const eventBlock = this.findEventBlock(action.eventBlockId, action.areaId);
        this.waitingForTrigger = {
          areaId: action.areaId,
          eventBlockId: action.eventBlockId,
        };
        this.setStatus(eventBlock ? `Find trigger: ${eventBlock.name}` : "Find the trigger.");
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

    if (nextArea.id !== this.currentArea.id) {
      this.currentArea = nextArea;
      this.tileSize = nextArea.tileSize;
      this.isMoving = false;
      this.renderMap();
      this.configureCameras();
    }

    this.spawnPlayer(eventBlock);
    this.setStatus(`${this.project.player.name} entered ${nextArea.name}.`);
  }

  private spawnPlayer(eventBlock: EventBlock) {
    const avatar = getVisualPreset(this.project.player.mapAvatarId, characterSprites);
    const centerX = eventBlock.x * this.tileSize + this.tileSize / 2;
    const centerY = eventBlock.y * this.tileSize + this.tileSize / 2;

    this.playerMarker?.destroy();
    const body = this.add.circle(0, 0, this.tileSize * 0.32, hexToNumber(avatar.color));
    const initial = this.add
      .text(0, 0, this.project.player.name.slice(0, 1).toUpperCase(), {
        color: avatar.accent,
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.playerMarker = this.add.container(centerX, centerY, [body, initial]).setDepth(50);
    this.worldLayer?.add(this.playerMarker);
    this.playerPosition = { x: eventBlock.x, y: eventBlock.y };
    this.configurePlayerCamera(centerX, centerY);
    this.setStatus(`${this.project.player.name} spawned.`);
  }

  private teleportPlayer(eventBlock: EventBlock) {
    if (!this.playerMarker) {
      this.spawnPlayer(eventBlock);
      return;
    }

    const centerX = eventBlock.x * this.tileSize + this.tileSize / 2;
    const centerY = eventBlock.y * this.tileSize + this.tileSize / 2;

    this.playerPosition = { x: eventBlock.x, y: eventBlock.y };
    this.playerMarker.setPosition(centerX, centerY);
    this.setStatus(`${this.project.player.name} moved to ${eventBlock.name}.`);
  }

  private showCutscene(cutscene: Cutscene, onDone: () => void) {
    const width = this.scale.width;
    const height = this.scale.height;
    const background = getVisualPreset(cutscene.backgroundImageId, backgroundPresets);
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
      this.add.rectangle(0, 0, width, height, hexToNumber(background.color), 0.96).setOrigin(0),
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

  private showEndMessage() {
    this.isFinished = true;
    const width = this.scale.width;
    const height = this.scale.height;
    const boxWidth = Math.min(260, width - 24);
    const container = this.add.container(0, 0).setDepth(600).setScrollFactor(0);
    this.uiLayer?.add(container);
    container.add(this.add.rectangle(0, 0, width, height, 0x111827, 0.72).setOrigin(0));
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

  private tryMove(deltaX: number, deltaY: number, time: number) {
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

    const movement = resolveMovementAt(this.currentArea, nextX, nextY, this.project.player);
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
        if (this.checkAreaLink()) {
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

  private checkAreaLink(): boolean {
    const eventBlock = this.currentArea.eventBlocks.find(
      (candidate) =>
        candidate.kind === "area_link" &&
        candidate.x === this.playerPosition.x &&
        candidate.y === this.playerPosition.y,
    );

    if (!eventBlock?.link) {
      return false;
    }

    const targetArea = this.findArea(eventBlock.link.targetAreaId);
    const targetEventBlock = this.findEventBlock(
      eventBlock.link.targetEventBlockId,
      eventBlock.link.targetAreaId,
    );

    if (!targetArea || !targetEventBlock) {
      this.setStatus(`Link target missing: ${eventBlock.name}.`);
      return false;
    }

    this.movePlayerToArea(targetArea.id, targetEventBlock);
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

    const isInTargetArea = !this.waitingForTrigger.areaId || this.waitingForTrigger.areaId === this.currentArea.id;
    if (isInTargetArea && eventBlock.x === this.playerPosition.x && eventBlock.y === this.playerPosition.y) {
      this.waitingForTrigger = null;
      this.progressionIndex += 1;
      this.processProgression();
    }
  }

  private tileIdAt(x: number, y: number): string {
    return this.currentArea.terrainTiles.find((tile) => tile.x === x && tile.y === y)?.tileId ?? "grass";
  }

  private findArea(areaId: string): GameArea | undefined {
    return this.project.areas.find((area) => area.id === areaId);
  }

  private findEventBlock(id: string, areaId = this.currentArea.id): EventBlock | undefined {
    return this.findArea(areaId)?.eventBlocks.find((eventBlock) => eventBlock.id === id);
  }

  private setStatus(message: string) {
    this.statusText?.setText(message);
  }
}
