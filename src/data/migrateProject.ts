import { defaultProject } from "./defaultProject";
import { defaultCameraConfig } from "./projectDefaults";
import type {
  CameraConfig,
  EventBlock,
  GameProject,
  MapTile,
  PlayerConfig,
  ProgressionAction,
  ProgressionStep,
} from "../types/game";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneProject(project: GameProject): GameProject {
  return JSON.parse(JSON.stringify(project)) as GameProject;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const withMin = min === undefined ? numberValue : Math.max(min, numberValue);
  return max === undefined ? withMin : Math.min(max, withMin);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : [...fallback];
}

function migrateTiles(value: unknown): MapTile[] {
  if (!Array.isArray(value)) {
    return cloneProject(defaultProject).map.tiles;
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    return [
      {
        x: readNumber(item.x, 0, 0),
        y: readNumber(item.y, 0, 0),
        tileId: readString(item.tileId, "grass"),
      },
    ];
  });
}

function migrateEventBlocks(value: unknown): EventBlock[] {
  if (!Array.isArray(value)) {
    return cloneProject(defaultProject).map.eventBlocks;
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const kind = item.kind === "spawn" || item.kind === "trigger" ? item.kind : "trigger";

    return [
      {
        id: readString(item.id, `event_${Date.now().toString(36)}`),
        name: readString(item.name, "Event"),
        x: readNumber(item.x, 0, 0),
        y: readNumber(item.y, 0, 0),
        tag: readString(item.tag, "event"),
        kind,
      },
    ];
  });
}

function migrateCamera(value: unknown): CameraConfig {
  const source = isRecord(value) ? value : {};

  return {
    viewportWidthTiles: Math.round(
      readNumber(source.viewportWidthTiles, defaultCameraConfig.viewportWidthTiles, 1, 100),
    ),
    viewportHeightTiles: Math.round(
      readNumber(source.viewportHeightTiles, defaultCameraConfig.viewportHeightTiles, 1, 100),
    ),
    followPlayer: readBoolean(source.followPlayer, defaultCameraConfig.followPlayer),
    followSmoothing: readNumber(
      source.followSmoothing,
      defaultCameraConfig.followSmoothing,
      0,
      1,
    ),
    deadzoneWidthTiles: Math.round(
      readNumber(source.deadzoneWidthTiles, defaultCameraConfig.deadzoneWidthTiles ?? 0, 0, 100),
    ),
    deadzoneHeightTiles: Math.round(
      readNumber(source.deadzoneHeightTiles, defaultCameraConfig.deadzoneHeightTiles ?? 0, 0, 100),
    ),
  };
}

function migratePlayer(value: unknown): PlayerConfig {
  const source = isRecord(value) ? value : {};
  const fallback = defaultProject.player;

  return {
    name: readString(source.name, fallback.name),
    mapAvatarId: readString(source.mapAvatarId ?? source.spriteId, fallback.mapAvatarId),
    cutscenePortraitId: readString(
      source.cutscenePortraitId ?? source.portraitId,
      fallback.cutscenePortraitId,
    ),
    speed: readNumber(source.speed, fallback.speed, 1, 20),
    health: readNumber(source.health, fallback.health, 1, 999),
    canWalkOn: readStringArray(source.canWalkOn, fallback.canWalkOn),
  };
}

function migrateAction(value: unknown, fallback: ProgressionAction): ProgressionAction {
  if (!isRecord(value)) {
    return fallback;
  }

  if (value.type === "play_cutscene") {
    return {
      type: "play_cutscene",
      cutsceneId: readString(value.cutsceneId, ""),
    };
  }

  if (
    value.type === "spawn_player" ||
    value.type === "wait_for_trigger" ||
    value.type === "teleport_player"
  ) {
    return {
      type: value.type,
      eventBlockId: readString(value.eventBlockId, ""),
    };
  }

  return { type: "end_game" };
}

function migrateProgressionStep(value: unknown, index: number): ProgressionStep | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id, `step_${index + 1}`);
  const label = typeof value.label === "string" && value.label.trim() ? value.label : undefined;

  if (isRecord(value.action)) {
    return {
      id,
      label,
      action: migrateAction(value.action, { type: "end_game" }),
    };
  }

  const legacyAction = migrateAction(value, { type: "end_game" });
  return {
    id,
    label,
    action: legacyAction,
  };
}

function migrateProgression(value: unknown): ProgressionStep[] {
  const source = Array.isArray(value) ? value : defaultProject.progression;
  const steps = source.flatMap((step, index) => {
    const migrated = migrateProgressionStep(step, index);
    return migrated ? [migrated] : [];
  });

  return steps.length > 0 ? steps : cloneProject(defaultProject).progression;
}

export function migrateProject(value: unknown): GameProject {
  const source = isRecord(value) ? value : {};
  const metadataSource = isRecord(source.metadata) ? source.metadata : {};
  const mapSource = isRecord(source.map) ? source.map : {};

  return {
    metadata: {
      name: readString(metadataSource.name, defaultProject.metadata.name),
      version: readString(metadataSource.version, defaultProject.metadata.version),
    },
    map: {
      width: Math.round(readNumber(mapSource.width, defaultProject.map.width, 1, 200)),
      height: Math.round(readNumber(mapSource.height, defaultProject.map.height, 1, 200)),
      tileSize: Math.round(readNumber(mapSource.tileSize, defaultProject.map.tileSize, 8, 128)),
      tiles: migrateTiles(mapSource.tiles),
      eventBlocks: migrateEventBlocks(mapSource.eventBlocks),
    },
    camera: migrateCamera(source.camera),
    player: migratePlayer(source.player),
    cutscenes: Array.isArray(source.cutscenes)
      ? (source.cutscenes as GameProject["cutscenes"])
      : cloneProject(defaultProject).cutscenes,
    progression: migrateProgression(source.progression),
  };
}
