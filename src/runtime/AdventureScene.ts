import Phaser from "phaser";
import {
  backgroundPresets,
  characterSprites,
  getTilePreset,
  getVisualPreset,
  portraitPresets,
} from "../data/presets";
import type { Cutscene, EventBlock, GameProject } from "../types/game";

type WasdKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

function hexToNumber(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function coordKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export class AdventureScene extends Phaser.Scene {
  private readonly project: GameProject;
  private readonly tileSize: number;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: WasdKeys;
  private playerMarker?: Phaser.GameObjects.Container;
  private playerPosition = { x: 0, y: 0 };
  private progressionIndex = 0;
  private waitingForTriggerId = "";
  private nextMoveAt = 0;
  private statusText?: Phaser.GameObjects.Text;
  private isCutsceneOpen = false;
  private isFinished = false;

  constructor(project: GameProject) {
    super("AdventureScene");
    this.project = project;
    this.tileSize = project.map.tileSize;
  }

  create() {
    this.renderMap();
    this.createInput();
    this.statusText = this.add
      .text(10, 10, "", {
        backgroundColor: "rgba(24, 24, 27, 0.82)",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        padding: { x: 8, y: 5 },
      })
      .setDepth(100);

    this.processProgression();
  }

  update(time: number) {
    if (!this.playerMarker || this.isCutsceneOpen || this.isFinished || time < this.nextMoveAt) {
      return;
    }

    const direction = this.readDirection();
    if (!direction) {
      return;
    }

    const moveDelay = Math.max(80, 280 - this.project.player.speed * 18);
    this.nextMoveAt = time + moveDelay;
    this.tryMove(direction.x, direction.y);
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

  private renderMap() {
    for (let y = 0; y < this.project.map.height; y += 1) {
      for (let x = 0; x < this.project.map.width; x += 1) {
        const tileId = this.tileIdAt(x, y);
        const tile = getTilePreset(tileId);
        const worldX = x * this.tileSize;
        const worldY = y * this.tileSize;

        this.add
          .rectangle(worldX, worldY, this.tileSize, this.tileSize, hexToNumber(tile.color))
          .setOrigin(0)
          .setStrokeStyle(1, 0xffffff, 0.22);

        if (tile.pattern === "waves") {
          this.add
            .text(worldX + this.tileSize / 2, worldY + this.tileSize / 2, "~", {
              color: "#d0ebff",
              fontFamily: "Arial, sans-serif",
              fontSize: "18px",
            })
            .setOrigin(0.5);
        }

        if (tile.pattern === "tree") {
          this.add.circle(
            worldX + this.tileSize / 2,
            worldY + this.tileSize / 2,
            this.tileSize * 0.22,
            0x14532d,
            0.9,
          );
        }

        if (tile.pattern === "blocks") {
          this.add
            .rectangle(
              worldX + this.tileSize / 2,
              worldY + this.tileSize / 2,
              this.tileSize * 0.5,
              this.tileSize * 0.36,
              0x4b5563,
              0.55,
            )
            .setStrokeStyle(1, 0x111827, 0.28);
        }
      }
    }
  }

  private processProgression() {
    while (this.progressionIndex < this.project.progression.length) {
      const step = this.project.progression[this.progressionIndex];

      if (step.type === "play_cutscene") {
        const cutscene = this.project.cutscenes.find((candidate) => candidate.id === step.cutsceneId);

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

      if (step.type === "spawn_player") {
        const eventBlock = this.findEventBlock(step.eventBlockId);
        if (eventBlock) {
          this.spawnPlayer(eventBlock);
        }
        this.progressionIndex += 1;
        continue;
      }

      if (step.type === "wait_for_trigger") {
        const eventBlock = this.findEventBlock(step.eventBlockId);
        this.waitingForTriggerId = step.eventBlockId;
        this.setStatus(eventBlock ? `Find trigger: ${eventBlock.name}` : "Find the trigger.");
        return;
      }

      this.showEndMessage();
      this.progressionIndex = this.project.progression.length;
      return;
    }

    this.setStatus("Progression complete.");
  }

  private spawnPlayer(eventBlock: EventBlock) {
    const sprite = getVisualPreset(this.project.player.spriteId, characterSprites);
    const centerX = eventBlock.x * this.tileSize + this.tileSize / 2;
    const centerY = eventBlock.y * this.tileSize + this.tileSize / 2;

    this.playerMarker?.destroy();
    const body = this.add.circle(0, 0, this.tileSize * 0.32, hexToNumber(sprite.color));
    const initial = this.add
      .text(0, 0, this.project.player.name.slice(0, 1).toUpperCase(), {
        color: sprite.accent,
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.playerMarker = this.add.container(centerX, centerY, [body, initial]).setDepth(50);
    this.playerPosition = { x: eventBlock.x, y: eventBlock.y };
    this.setStatus(`${this.project.player.name} spawned.`);
  }

  private showCutscene(cutscene: Cutscene, onDone: () => void) {
    const width = this.scale.width;
    const height = this.scale.height;
    const background = getVisualPreset(cutscene.backgroundImageId, backgroundPresets);
    const portrait = cutscene.portraitImageId
      ? getVisualPreset(cutscene.portraitImageId, portraitPresets)
      : undefined;
    const container = this.add.container(0, 0).setDepth(500);

    this.isCutsceneOpen = true;
    container.add(
      this.add.rectangle(0, 0, width, height, hexToNumber(background.color), 0.96).setOrigin(0),
    );
    container.add(
      this.add
        .rectangle(width * 0.5, height * 0.35, width * 0.74, height * 0.38, hexToNumber(background.accent), 0.18)
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

    if (portrait) {
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
        .rectangle(width / 2, height - 74, width - 48, 116, 0x18181b, 0.9)
        .setStrokeStyle(1, 0xffffff, 0.22),
    );
    container.add(
      this.add.text(portrait ? 144 : 48, height - 124, cutscene.speakerName || "Narrator", {
        color: "#ffd43b",
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "700",
      }),
    );
    container.add(
      this.add.text(portrait ? 144 : 48, height - 94, cutscene.text, {
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontSize: "17px",
        lineSpacing: 4,
        wordWrap: { width: portrait ? width - 190 : width - 96 },
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
    const container = this.add.container(0, 0).setDepth(600);
    container.add(this.add.rectangle(0, 0, width, height, 0x111827, 0.72).setOrigin(0));
    container.add(
      this.add
        .rectangle(width / 2, height / 2, 260, 130, 0xf8fafc, 0.96)
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

  private tryMove(deltaX: number, deltaY: number) {
    const nextX = this.playerPosition.x + deltaX;
    const nextY = this.playerPosition.y + deltaY;

    if (
      nextX < 0 ||
      nextY < 0 ||
      nextX >= this.project.map.width ||
      nextY >= this.project.map.height
    ) {
      return;
    }

    const tileId = this.tileIdAt(nextX, nextY);
    if (!this.project.player.canWalkOn.includes(tileId)) {
      this.setStatus(`Blocked by ${tileId}.`);
      return;
    }

    this.playerPosition = { x: nextX, y: nextY };
    this.playerMarker?.setPosition(
      nextX * this.tileSize + this.tileSize / 2,
      nextY * this.tileSize + this.tileSize / 2,
    );
    this.checkTrigger();
  }

  private checkTrigger() {
    if (!this.waitingForTriggerId) {
      return;
    }

    const eventBlock = this.findEventBlock(this.waitingForTriggerId);
    if (!eventBlock) {
      this.waitingForTriggerId = "";
      this.progressionIndex += 1;
      this.processProgression();
      return;
    }

    if (eventBlock.x === this.playerPosition.x && eventBlock.y === this.playerPosition.y) {
      this.waitingForTriggerId = "";
      this.progressionIndex += 1;
      this.processProgression();
    }
  }

  private tileIdAt(x: number, y: number): string {
    return this.project.map.tiles.find((tile) => tile.x === x && tile.y === y)?.tileId ?? "grass";
  }

  private findEventBlock(id: string): EventBlock | undefined {
    return this.project.map.eventBlocks.find((eventBlock) => eventBlock.id === id);
  }

  private setStatus(message: string) {
    this.statusText?.setText(message);
  }
}
