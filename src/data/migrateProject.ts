import { defaultProject } from "./defaultProject";
import { createDefaultPixelAssets } from "./mapVisuals";
import { defaultCameraConfig } from "./projectDefaults";
import { defaultTileStyles, tilePresets } from "./presets";
import type {
  AreaLink,
  CameraConfig,
  ConditionExpression,
  ConditionGroup,
  Cutscene,
  EventBlock,
  GameAction,
  GameArea,
  GameAreaKind,
  GameProject,
  GameRule,
  GameStateConfig,
  GameStateValue,
  Interaction,
  InteractionActivationMode,
  ItemDefinition,
  NPCDefinition,
  NPCInstance,
  MapStructure,
  MapTile,
  MovementRule,
  OverlayTile,
  PickupObject,
  Quest,
  QuestReward,
  Objective,
  ObjectiveCondition,
  PlayerConfig,
  PixelAsset,
  ProgressionAction,
  ProgressionStep,
  RuleGroup,
  RuleTrigger,
  SingleCondition,
  TileStyleConfig,
  VariableComparisonOperator,
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

function readAreaKind(value: unknown, fallback: GameAreaKind): GameAreaKind {
  return value === "outdoor" ||
    value === "indoor" ||
    value === "cave" ||
    value === "ship" ||
    value === "dungeon" ||
    value === "custom"
    ? value
    : fallback;
}

function migrateTiles(value: unknown, fallbackTiles: MapTile[]): MapTile[] {
  if (!Array.isArray(value)) {
    return fallbackTiles.map((tile) => ({ ...tile }));
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

function migrateOverlayTiles(value: unknown): OverlayTile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    return [
      {
        x: readNumber(item.x, 0, 0),
        y: readNumber(item.y, 0, 0),
        overlayId: readString(item.overlayId, ""),
      },
    ];
  });
}

function migrateAreaLink(value: unknown): AreaLink | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const targetAreaId = readString(value.targetAreaId, "");
  const targetEventBlockId = readString(value.targetEventBlockId, "");
  return targetAreaId && targetEventBlockId ? { targetAreaId, targetEventBlockId } : undefined;
}

function migrateMovementRule(value: unknown): MovementRule | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rule: MovementRule = {};
  if (typeof value.walkable === "boolean") {
    rule.walkable = value.walkable;
  }
  if (
    value.movementMode === "walk" ||
    value.movementMode === "swim" ||
    value.movementMode === "sail" ||
    value.movementMode === "ride"
  ) {
    rule.movementMode = value.movementMode;
  }
  if (typeof value.speedMultiplier === "number" && Number.isFinite(value.speedMultiplier)) {
    rule.speedMultiplier = readNumber(value.speedMultiplier, 1, 0.1, 10);
  }

  return Object.keys(rule).length > 0 ? rule : undefined;
}

function readActivationMode(
  value: unknown,
  fallback: InteractionActivationMode,
): InteractionActivationMode {
  return value === "on_touch" ||
    value === "on_interact" ||
    value === "both" ||
    value === "disabled"
    ? value
    : fallback;
}

function withInteractionBase(
  source: UnknownRecord,
  fallbackActivationMode: InteractionActivationMode,
  interaction: Omit<Interaction, "activationMode">,
): Interaction {
  const prompt = readString(source.prompt, "");
  return {
    ...interaction,
    activationMode: readActivationMode(source.activationMode, fallbackActivationMode),
    ...(prompt ? { prompt } : {}),
  };
}

function migrateInteraction(
  value: unknown,
  fallbackActivationMode: InteractionActivationMode,
): Interaction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "area_link" || value.type === "teleport") {
    const targetAreaId = readString(value.targetAreaId, "");
    const targetEventBlockId = readString(value.targetEventBlockId, "");
    return targetAreaId && targetEventBlockId
      ? withInteractionBase(value, fallbackActivationMode, {
          type: value.type,
          targetAreaId,
          targetEventBlockId,
        })
      : undefined;
  }

  if (value.type === "play_cutscene") {
    const cutsceneId = readString(value.cutsceneId, "");
    return cutsceneId
      ? withInteractionBase(value, fallbackActivationMode, {
          type: "play_cutscene",
          cutsceneId,
        })
      : undefined;
  }

  if (value.type === "set_flag") {
    const flag = readString(value.flag, "");
    return flag
      ? withInteractionBase(value, fallbackActivationMode, {
          type: "set_flag",
          flag,
          value: readBoolean(value.value, true),
        })
      : undefined;
  }

  if (
    value.type === "change_movement_mode" &&
    (value.mode === "walk" || value.mode === "sail" || value.mode === "ride")
  ) {
    return withInteractionBase(value, fallbackActivationMode, {
      type: "change_movement_mode",
      mode: value.mode,
    });
  }

  return undefined;
}

function migrateEventBlocks(value: unknown, fallbackEventBlocks: EventBlock[]): EventBlock[] {
  if (!Array.isArray(value)) {
    return fallbackEventBlocks.map((eventBlock) => ({ ...eventBlock }));
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const kind =
      item.kind === "spawn" || item.kind === "trigger" || item.kind === "area_link"
        ? item.kind
        : "trigger";

    const link = kind === "area_link" ? migrateAreaLink(item.link) : undefined;
    const fallbackActivationMode =
      kind === "area_link" || kind === "trigger" ? "on_touch" : "on_interact";
    const interaction =
      migrateInteraction(item.interaction, fallbackActivationMode) ??
      (kind === "area_link" && link
        ? {
            type: "area_link" as const,
            activationMode: "on_touch" as const,
            ...link,
          }
        : undefined);

    return [
      {
        id: readString(item.id, `event_${Date.now().toString(36)}`),
        name: readString(item.name, "Event"),
        x: readNumber(item.x, 0, 0),
        y: readNumber(item.y, 0, 0),
        tag: readString(item.tag, "event"),
        kind,
        link,
        interaction,
      },
    ];
  });
}

function migrateStructures(value: unknown): MapStructure[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const interaction = migrateInteraction(item.interaction, "on_interact");

    return [
      {
        id: readString(item.id, `structure_${Date.now().toString(36)}`),
        structureId: readString(item.structureId, "small_house"),
        name: readString(item.name, "Structure"),
        x: readNumber(item.x, 0, 0),
        y: readNumber(item.y, 0, 0),
        widthTiles: Math.round(readNumber(item.widthTiles, 1, 1, 20)),
        heightTiles: Math.round(readNumber(item.heightTiles, 1, 1, 20)),
        blocksMovement: readBoolean(item.blocksMovement, true),
        movementRule: migrateMovementRule(item.movementRule),
        interaction,
      },
    ];
  });
}

function migratePickups(value: unknown, areaId: string): PickupObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const collectedFlag = readString(item.collectedFlag, "");
    return [
      {
        id: readString(item.id, `pickup_${Date.now().toString(36)}`),
        itemId: readString(item.itemId, ""),
        quantity: Math.round(readNumber(item.quantity, 1, 1, 9999)),
        areaId,
        x: readNumber(item.x, 0, 0),
        y: readNumber(item.y, 0, 0),
        pickupMode: item.pickupMode === "on_interact" ? "on_interact" : "on_touch",
        once: readBoolean(item.once, true),
        ...(collectedFlag ? { collectedFlag } : {}),
      },
    ];
  });
}

function migrateNpcInstances(value: unknown, areaId: string): NPCInstance[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const facing =
      item.facing === "up" || item.facing === "left" || item.facing === "right"
        ? item.facing
        : "down";
    const movementMode =
      item.movementMode === "patrol" || item.movementMode === "wander"
        ? item.movementMode
        : "stationary";
    const patrolSource = isRecord(item.patrolPath) ? item.patrolPath : {};
    const points = Array.isArray(patrolSource.points)
      ? patrolSource.points.flatMap((point) =>
          isRecord(point)
            ? [{ x: readNumber(point.x, 0, 0), y: readNumber(point.y, 0, 0) }]
            : [],
        )
      : [];
    const wanderSource = isRecord(item.wanderZone) ? item.wanderZone : {};

    return [{
      id: readString(item.id, `npc_instance_${Date.now().toString(36)}`),
      npcDefinitionId: readString(item.npcDefinitionId, ""),
      areaId,
      x: readNumber(item.x, 0, 0),
      y: readNumber(item.y, 0, 0),
      facing,
      blocksMovement: readBoolean(item.blocksMovement, true),
      movementMode,
      movementSpeed: readNumber(item.movementSpeed, 1, 0.1, 10),
      ...(points.length > 0
        ? { patrolPath: { points, loop: readBoolean(patrolSource.loop, true) } }
        : {}),
      ...(movementMode === "wander"
        ? {
            wanderZone: {
              x: readNumber(wanderSource.x, readNumber(item.x, 0, 0), 0),
              y: readNumber(wanderSource.y, readNumber(item.y, 0, 0), 0),
              width: Math.round(readNumber(wanderSource.width, 3, 1, 200)),
              height: Math.round(readNumber(wanderSource.height, 3, 1, 200)),
            },
          }
        : {}),
      interaction: migrateInteraction(item.interaction, "on_interact"),
    }];
  });
}

function migrateArea(value: unknown, index: number, fallback: GameArea): GameArea {
  const source = isRecord(value) ? value : {};
  const id = readString(source.id, index === 0 ? "area_main" : `area_${index + 1}`);
  const width = Math.round(readNumber(source.width, fallback.width, 1, 200));
  const height = Math.round(readNumber(source.height, fallback.height, 1, 200));
  const terrainTiles = migrateTiles(source.terrainTiles ?? source.tiles, fallback.terrainTiles);

  return {
    id,
    name: readString(source.name, index === 0 ? "Main Area" : `Area ${index + 1}`),
    kind: readAreaKind(source.kind, fallback.kind),
    width,
    height,
    tileSize: Math.round(readNumber(source.tileSize, fallback.tileSize, 8, 128)),
    terrainTiles,
    overlayTiles: migrateOverlayTiles(source.overlayTiles),
    structures: migrateStructures(source.structures),
    pickups: migratePickups(source.pickups, id),
    npcs: migrateNpcInstances(source.npcs, id),
    eventBlocks: migrateEventBlocks(source.eventBlocks, fallback.eventBlocks),
    theme: isRecord(source.theme) ? { ...source.theme } : fallback.theme,
  };
}

function migrateAreas(source: UnknownRecord): GameArea[] {
  if (Array.isArray(source.areas) && source.areas.length > 0) {
    const areas = source.areas.flatMap((area, index) => {
      const fallback = defaultProject.areas[index] ?? defaultProject.areas[0];
      return fallback ? [migrateArea(area, index, fallback)] : [];
    });

    return areas.length > 0 ? areas : cloneProject(defaultProject).areas;
  }

  const legacyMap = isRecord(source.map) ? source.map : {};
  return [migrateArea(legacyMap, 0, defaultProject.areas[0])];
}

function migrateTileStyles(value: unknown): TileStyleConfig {
  const source = isRecord(value) ? value : {};
  const styles: TileStyleConfig = {};

  tilePresets.forEach((tile) => {
    const customStyleSource = source[tile.id];
    const customStyle = isRecord(customStyleSource) ? customStyleSource : {};
    styles[tile.id] = {
      color: readString(customStyle.color, defaultTileStyles[tile.id]?.color ?? tile.color),
      label: readString(customStyle.label, defaultTileStyles[tile.id]?.label ?? tile.label),
    };
  });

  return styles;
}

function migratePixelAssets(value: unknown): Record<string, PixelAsset> {
  const defaults = createDefaultPixelAssets();
  const source = isRecord(value) ? value : {};
  const assets: Record<string, PixelAsset> = { ...defaults };

  Object.entries(source).forEach(([id, item]) => {
    if (!isRecord(item) || !Array.isArray(item.pixels)) {
      return;
    }

    const kind =
      item.kind === "terrain" ||
      item.kind === "overlay" ||
      item.kind === "structure" ||
      item.kind === "character" ||
      item.kind === "portrait"
        ? item.kind
        : "terrain";
    const width = Math.round(readNumber(item.width, 16, 1, 128));
    const height = Math.round(readNumber(item.height, 16, 1, 128));
    const pixels = item.pixels.slice(0, height).map((row) => {
      if (!Array.isArray(row)) {
        return Array.from({ length: width }, () => "transparent");
      }

      return Array.from({ length: width }, (_, index) => readString(row[index], "transparent"));
    });

    while (pixels.length < height) {
      pixels.push(Array.from({ length: width }, () => "transparent"));
    }

    assets[id] = {
      id,
      name: readString(item.name, defaults[id]?.name ?? id),
      kind,
      width,
      height,
      pixels,
    };
  });

  return assets;
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
    followSmoothing: readNumber(source.followSmoothing, defaultCameraConfig.followSmoothing, 0, 1),
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

function migrateAction(value: unknown, fallback: ProgressionAction, defaultAreaId: string): ProgressionAction {
  if (!isRecord(value)) {
    return fallback;
  }

  if (value.type === "play_cutscene") {
    return {
      type: "play_cutscene",
      cutsceneId: readString(value.cutsceneId, ""),
    };
  }

  if (value.type === "spawn_player" || value.type === "teleport_player") {
    return {
      type: value.type,
      areaId: readString(value.areaId, defaultAreaId),
      eventBlockId: readString(value.eventBlockId, ""),
    };
  }

  if (value.type === "wait_for_trigger") {
    return {
      type: "wait_for_trigger",
      areaId: readString(value.areaId, defaultAreaId),
      eventBlockId: readString(value.eventBlockId, ""),
    };
  }

  return { type: "end_game" };
}

function migrateProgressionStep(
  value: unknown,
  index: number,
  defaultAreaId: string,
): ProgressionStep | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id, `step_${index + 1}`);
  const label = typeof value.label === "string" && value.label.trim() ? value.label : undefined;

  if (isRecord(value.action)) {
    return {
      id,
      label,
      action: migrateAction(value.action, { type: "end_game" }, defaultAreaId),
    };
  }

  return {
    id,
    label,
    action: migrateAction(value, { type: "end_game" }, defaultAreaId),
  };
}

function migrateProgression(value: unknown, defaultAreaId: string): ProgressionStep[] {
  const source = Array.isArray(value) ? value : defaultProject.progression;
  const steps = source.flatMap((step, index) => {
    const migrated = migrateProgressionStep(step, index, defaultAreaId);
    return migrated ? [migrated] : [];
  });

  return steps.length > 0 ? steps : cloneProject(defaultProject).progression;
}

function migrateGameState(value: unknown): GameStateConfig {
  const source = isRecord(value) ? value : {};
  const fallback = defaultProject.gameState;
  const flagSource = isRecord(source.flags) ? source.flags : fallback.flags;
  const variableSource = isRecord(source.variables) ? source.variables : fallback.variables;
  const flags: Record<string, boolean> = {};
  const variables: Record<string, GameStateValue> = {};
  const inventory: Record<string, number> = {};

  Object.entries(flagSource).forEach(([name, flagValue]) => {
    if (name) {
      flags[name] = readBoolean(flagValue, false);
    }
  });

  Object.entries(variableSource).forEach(([name, variableValue]) => {
    if (name && (typeof variableValue === "number" || typeof variableValue === "string")) {
      variables[name] = variableValue;
    }
  });

  if (isRecord(source.inventory)) {
    Object.entries(source.inventory).forEach(([itemId, quantity]) => {
      if (itemId && typeof quantity === "number" && Number.isFinite(quantity)) {
        inventory[itemId] = Math.max(0, Math.round(quantity));
      }
    });
  }

  return { flags, variables, inventory };
}

function migrateItems(value: unknown): ItemDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const category =
      item.category === "key" ||
      item.category === "currency" ||
      item.category === "consumable" ||
      item.category === "quest" ||
      item.category === "misc"
        ? item.category
        : "misc";
    const description = readString(item.description, "");
    const iconId = readString(item.iconId, "");
    const stackable = readBoolean(item.stackable, false);
    const maxStack =
      stackable && typeof item.maxStack === "number" && Number.isFinite(item.maxStack)
        ? Math.round(readNumber(item.maxStack, 1, 1, 9999))
        : undefined;

    return [
      {
        id: readString(item.id, `item_${index + 1}`),
        name: readString(item.name, `Item ${index + 1}`),
        ...(description ? { description } : {}),
        category,
        ...(iconId ? { iconId } : {}),
        stackable,
        ...(maxStack ? { maxStack } : {}),
      },
    ];
  });
}

function migrateNpcDefinitions(value: unknown): NPCDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const description = readString(item.description, "");
    const portraitId = readString(item.portraitId, "");
    return [{
      id: readString(item.id, `npc_${index + 1}`),
      name: readString(item.name, `NPC ${index + 1}`),
      ...(description ? { description } : {}),
      mapAvatarId: readString(item.mapAvatarId, "ranger"),
      ...(portraitId ? { portraitId } : {}),
    }];
  });
}

function migrateObjectiveCondition(value: unknown): ObjectiveCondition | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "flag") {
    return {
      type: "flag",
      flag: readString(value.flag, ""),
      value: readBoolean(value.value, true),
    };
  }

  if (value.type === "has_item") {
    return {
      type: "has_item",
      itemId: readString(value.itemId, ""),
      quantity: Math.round(readNumber(value.quantity, 1, 1, 9999)),
    };
  }

  if (value.type === "variable_compare") {
    return {
      type: "variable_compare",
      variable: readString(value.variable, ""),
      operator: readComparisonOperator(value.operator),
      value: readStateValue(value.value, 0),
    };
  }

  return value.type === "enter_area"
    ? { type: "enter_area", areaId: readString(value.areaId, "") }
    : null;
}

function migrateObjectives(value: unknown): Objective[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((objective, index) => {
    if (!isRecord(objective)) {
      return [];
    }

    const condition = migrateObjectiveCondition(objective.condition);
    return condition
      ? [
          {
            id: readString(objective.id, `objective_${index + 1}`),
            description: readString(objective.description, `Objective ${index + 1}`),
            condition,
          },
        ]
      : [];
  });
}

function migrateQuestRewards(value: unknown): QuestReward[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((reward): QuestReward[] => {
    if (!isRecord(reward)) {
      return [];
    }

    if (reward.type === "item") {
      return [{
        type: "item" as const,
        itemId: readString(reward.itemId, ""),
        quantity: Math.round(readNumber(reward.quantity, 1, 1, 9999)),
      }];
    }

    if (reward.type === "flag") {
      return [{
        type: "flag" as const,
        flag: readString(reward.flag, ""),
        value: readBoolean(reward.value, true),
      }];
    }

    return reward.type === "variable"
      ? [{
          type: "variable" as const,
          variable: readString(reward.variable, ""),
          amount: readNumber(reward.amount, 0),
        }]
      : [];
  });
}

function migrateQuests(value: unknown): Quest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((quest, index) => {
    if (!isRecord(quest)) {
      return [];
    }

    const status =
      quest.status === "active" ||
      quest.status === "completed" ||
      quest.status === "failed"
        ? quest.status
        : "inactive";
    const description = readString(quest.description, "");

    return [{
      id: readString(quest.id, `quest_${index + 1}`),
      name: readString(quest.name, `Quest ${index + 1}`),
      ...(description ? { description } : {}),
      status,
      objectives: migrateObjectives(quest.objectives),
      rewards: migrateQuestRewards(quest.rewards),
    }];
  });
}

function readComparisonOperator(value: unknown): VariableComparisonOperator {
  return value === "==" ||
    value === "!=" ||
    value === ">" ||
    value === "<" ||
    value === ">=" ||
    value === "<="
    ? value
    : "==";
}

function readStateValue(value: unknown, fallback: GameStateValue): GameStateValue {
  return typeof value === "number" || typeof value === "string" ? value : fallback;
}

function migrateRuleTrigger(value: unknown): RuleTrigger {
  if (!isRecord(value)) {
    return { type: "on_game_start" };
  }

  if (value.type === "on_interact" || value.type === "on_touch") {
    return { type: value.type, targetId: readString(value.targetId, "") };
  }

  if (value.type === "on_area_enter") {
    return { type: "on_area_enter", areaId: readString(value.areaId, "") };
  }

  if (value.type === "on_cutscene_end") {
    return { type: "on_cutscene_end", cutsceneId: readString(value.cutsceneId, "") };
  }

  return { type: "on_game_start" };
}

function migrateSingleCondition(value: unknown, fallbackId: string): SingleCondition | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "flag_is") {
    return {
      id: readString(value.id, fallbackId),
      type: "flag_is",
      flag: readString(value.flag, ""),
      value: readBoolean(value.value, true),
    };
  }

  if (value.type === "variable_compare") {
    return {
      id: readString(value.id, fallbackId),
      type: "variable_compare",
      variable: readString(value.variable, ""),
      operator: readComparisonOperator(value.operator),
      value: readStateValue(value.value, 0),
    };
  }

  if (value.type === "has_item" || value.type === "not_has_item") {
    return {
      id: readString(value.id, fallbackId),
      type: value.type,
      itemId: readString(value.itemId, ""),
      quantity: Math.round(readNumber(value.quantity, 1, 1, 9999)),
    };
  }

  return null;
}

function migrateConditionExpression(value: unknown, fallbackId: string): ConditionExpression | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "group") {
    const groupId = readString(value.id, fallbackId);
    const conditions = Array.isArray(value.conditions)
      ? value.conditions.flatMap((condition, index) => {
          const migrated = migrateConditionExpression(condition, `${groupId}_${index + 1}`);
          return migrated ? [migrated] : [];
        })
      : [];

    return {
      id: groupId,
      type: "group",
      operator: value.operator === "OR" ? "OR" : "AND",
      conditions,
    };
  }

  return migrateSingleCondition(value, fallbackId);
}

function migrateGameAction(value: unknown): GameAction | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "set_flag") {
    return {
      type: "set_flag",
      flag: readString(value.flag, ""),
      value: readBoolean(value.value, true),
    };
  }

  if (value.type === "change_variable") {
    return {
      type: "change_variable",
      variable: readString(value.variable, ""),
      amount: readNumber(value.amount, 0),
    };
  }

  if (value.type === "set_variable") {
    return {
      type: "set_variable",
      variable: readString(value.variable, ""),
      value: readStateValue(value.value, 0),
    };
  }

  if (value.type === "play_cutscene") {
    return { type: "play_cutscene", cutsceneId: readString(value.cutsceneId, "") };
  }

  if (value.type === "teleport") {
    return {
      type: "teleport",
      areaId: readString(value.areaId, ""),
      eventBlockId: readString(value.eventBlockId, ""),
    };
  }

  if (
    value.type === "change_movement_mode" &&
    (value.mode === "walk" || value.mode === "sail" || value.mode === "ride")
  ) {
    return { type: "change_movement_mode", mode: value.mode };
  }

  if (value.type === "give_item" || value.type === "remove_item") {
    return {
      type: value.type,
      itemId: readString(value.itemId, ""),
      quantity: Math.round(readNumber(value.quantity, 1, 1, 9999)),
    };
  }

  if (
    value.type === "activate_quest" ||
    value.type === "complete_quest" ||
    value.type === "fail_quest"
  ) {
    return {
      type: value.type,
      questId: readString(value.questId, ""),
    };
  }

  return value.type === "end_game" ? { type: "end_game" } : null;
}

function migrateActions(value: unknown): GameAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((action) => {
    const migrated = migrateGameAction(action);
    return migrated ? [migrated] : [];
  });
}

function migrateRules(value: unknown): GameRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((rule, index) => {
    if (!isRecord(rule)) {
      return [];
    }

    const ruleId = readString(rule.id, `rule_${index + 1}`);
    const legacyConditions = Array.isArray(rule.conditions)
      ? rule.conditions.flatMap((condition, conditionIndex) => {
          const migrated = migrateSingleCondition(
            condition,
            `${ruleId}_condition_${conditionIndex + 1}`,
          );
          return migrated ? [migrated] : [];
        })
      : [];
    const conditionTree =
      migrateConditionExpression(rule.conditionTree, `${ruleId}_conditions`) ??
      (legacyConditions.length > 0
        ? ({
            id: `${ruleId}_conditions`,
            type: "group",
            operator: "AND",
            conditions: legacyConditions,
          } satisfies ConditionGroup)
        : undefined);
    const groupId = readString(rule.groupId, "");

    return [
      {
        id: ruleId,
        name: readString(rule.name, `Rule ${index + 1}`),
        enabled: readBoolean(rule.enabled, true),
        ...(groupId ? { groupId } : {}),
        trigger: migrateRuleTrigger(rule.trigger),
        ...(conditionTree ? { conditionTree } : {}),
        actions: migrateActions(rule.actions),
        elseActions: migrateActions(rule.elseActions),
      },
    ];
  });
}

function migrateRuleGroups(value: unknown): RuleGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((group, index) => {
    if (!isRecord(group)) {
      return [];
    }

    const description = readString(group.description, "");
    const parentGroupId = readString(group.parentGroupId, "");
    return [
      {
        id: readString(group.id, `rule_group_${index + 1}`),
        name: readString(group.name, `Folder ${index + 1}`),
        ...(description ? { description } : {}),
        collapsed: readBoolean(group.collapsed, false),
        ...(parentGroupId ? { parentGroupId } : {}),
      },
    ];
  });
}

export function migrateProject(value: unknown): GameProject {
  const source = isRecord(value) ? value : {};
  const metadataSource = isRecord(source.metadata) ? source.metadata : {};
  const areas = migrateAreas(source);
  const fallbackActiveAreaId = areas[0]?.id ?? "area_main";
  const requestedActiveAreaId = readString(source.activeAreaId, fallbackActiveAreaId);
  const activeAreaId = areas.some((area) => area.id === requestedActiveAreaId)
    ? requestedActiveAreaId
    : fallbackActiveAreaId;

  return {
    metadata: {
      name: readString(metadataSource.name, defaultProject.metadata.name),
      version: readString(metadataSource.version, defaultProject.metadata.version),
    },
    areas,
    activeAreaId,
    camera: migrateCamera(source.camera),
    tileStyles: migrateTileStyles(source.tileStyles),
    pixelAssets: migratePixelAssets(source.pixelAssets),
    player: migratePlayer(source.player),
    cutscenes: Array.isArray(source.cutscenes)
      ? (source.cutscenes as Cutscene[])
      : cloneProject(defaultProject).cutscenes,
    progression: migrateProgression(source.progression, activeAreaId),
    gameState: migrateGameState(source.gameState),
    items: migrateItems(source.items),
    quests: migrateQuests(source.quests),
    ...(readString(source.trackedQuestId, "") ? { trackedQuestId: readString(source.trackedQuestId, "") } : {}),
    npcs: migrateNpcDefinitions(source.npcs),
    ruleGroups: migrateRuleGroups(source.ruleGroups),
    rules: migrateRules(source.rules),
  };
}
