export type GameProject = {
  metadata: ProjectMetadata;
  areas: GameArea[];
  activeAreaId: string;
  camera: CameraConfig;
  tileStyles: TileStyleConfig;
  pixelAssets: Record<string, PixelAsset>;
  player: PlayerConfig;
  cutscenes: Cutscene[];
  progression: ProgressionStep[];
  gameState: GameStateConfig;
  items: ItemDefinition[];
  shops: ShopDefinition[];
  quests: Quest[];
  trackedQuestId?: string;
  npcs: NPCDefinition[];
  objects: ObjectDefinition[];
  ruleGroups: RuleGroup[];
  rules: GameRule[];
};

export type ProjectMetadata = {
  name: string;
  version: string;
};

export type GameAreaKind = "outdoor" | "indoor" | "cave" | "ship" | "dungeon" | "custom";

export type AreaThemeConfig = {
  primaryTerrainId?: string;
  accentTerrainId?: string;
  overlayId?: string;
};

export type MovementMode = "walk" | "swim" | "sail" | "ride" | "drive";

export type MovementRule = {
  walkable?: boolean;
  movementMode?: MovementMode;
  speedMultiplier?: number;
};

export type MovementResult = {
  canMove: boolean;
  reason?: string;
  speedMultiplier: number;
  movementMode?: MovementMode;
};

export type PlayerVehicleState = {
  active: boolean;
  vehicleObjectInstanceId?: string;
  vehicleType?: "boat" | "horse" | "cart";
  movementMode?: "sail" | "ride" | "drive";
};

export type InteractionActivationMode = "on_touch" | "on_interact" | "both" | "disabled";

export type InteractionType =
  | "area_link"
  | "teleport"
  | "play_cutscene"
  | "set_flag"
  | "change_movement_mode";

export type Interaction = {
  type: InteractionType;
  activationMode: InteractionActivationMode;
  prompt?: string;
  targetAreaId?: string;
  targetEventBlockId?: string;
  cutsceneId?: string;
  flag?: string;
  value?: boolean;
  mode?: Exclude<MovementMode, "swim">;
};

export type EditorSelection =
  | { type: "eventBlock"; areaId: string; id: string }
  | { type: "structure"; areaId: string; id: string }
  | { type: "object"; areaId: string; id: string }
  | { type: "pickup"; areaId: string; id: string }
  | { type: "npc"; areaId: string; id: string }
  | { type: "overlay"; areaId: string; x: number; y: number }
  | { type: "terrain"; areaId: string; x: number; y: number }
  | { type: "area"; areaId: string }
  | null;

export type GameArea = {
  id: string;
  name: string;
  kind: GameAreaKind;
  width: number;
  height: number;
  tileSize: number;
  terrainTiles: MapTile[];
  overlayTiles: OverlayTile[];
  structures: MapStructure[];
  objects: ObjectInstance[];
  pickups: PickupObject[];
  npcs: NPCInstance[];
  eventBlocks: EventBlock[];
  theme?: AreaThemeConfig;
};

export type GameMap = GameArea;

export type MapTile = {
  x: number;
  y: number;
  tileId: string;
};

export type OverlayTile = {
  x: number;
  y: number;
  overlayId: string;
};

export type MapStructure = {
  id: string;
  structureId: string;
  name: string;
  x: number;
  y: number;
  widthTiles: number;
  heightTiles: number;
  blocksMovement: boolean;
  movementRule?: MovementRule;
  interaction?: Interaction;
};

export type ObjectDefinition = {
  id: string;
  name: string;
  description?: string;
  category: "prop" | "container" | "vehicle" | "door" | "switch" | "sign" | "misc";
  iconId?: string;
  widthTiles: number;
  heightTiles: number;
  blocksMovement: boolean;
  defaultInteraction?: Interaction;
  defaultBehaviour?: ObjectBehaviour;
};

export type ObjectBehaviour =
  | { type: "none" }
  | {
      type: "container";
      contents: { itemId: string; quantity: number }[];
      once: boolean;
      openedFlag?: string;
    }
  | {
      type: "door";
      targetAreaId?: string;
      targetEventBlockId?: string;
      requiredItemId?: string;
      lockedCutsceneId?: string;
    }
  | { type: "sign"; text: string }
  | {
      type: "vehicle";
      vehicleType: "boat" | "horse" | "cart";
      movementMode: "sail" | "ride" | "drive";
      allowedTerrainIds: string[];
      allowedOverlayIds?: string[];
      dismountAllowedTerrainIds: string[];
      dismountAllowedOverlayIds?: string[];
      speedMultiplier?: number;
    };

export type ObjectInstance = {
  id: string;
  objectDefinitionId: string;
  areaId: string;
  x: number;
  y: number;
  nameOverride?: string;
  widthTiles?: number;
  heightTiles?: number;
  blocksMovement?: boolean;
  interaction?: Interaction;
  behaviourOverride?: ObjectBehaviour;
  state?: Record<string, boolean | number | string>;
};

export type PickupObject = {
  id: string;
  itemId: string;
  quantity: number;
  areaId: string;
  x: number;
  y: number;
  pickupMode: "on_touch" | "on_interact";
  once: boolean;
  collectedFlag?: string;
};

export type NPCDefinition = {
  id: string;
  name: string;
  description?: string;
  mapAvatarId: string;
  portraitId?: string;
};

export type NPCMovementMode = "stationary" | "patrol" | "wander";

export type PatrolPoint = {
  x: number;
  y: number;
};

export type PatrolPath = {
  points: PatrolPoint[];
  loop: boolean;
};

export type WanderZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NPCAlignment = "friendly" | "neutral" | "hostile";

export type NPCAttributes = {
  maxHealth: number;
  health: number;
  faction: string;
  alignment: NPCAlignment;
  canInteract: boolean;
  movementSpeed?: number;
};

export type EnemyBehaviour = {
  enabled: boolean;
  detectionRadiusTiles: number;
  chaseRadiusTiles: number;
  returnToOrigin: boolean;
  contactDamage?: number;
};

export type NPCInstance = {
  id: string;
  npcDefinitionId: string;
  areaId: string;
  x: number;
  y: number;
  facing?: "up" | "down" | "left" | "right";
  blocksMovement: boolean;
  movementMode: NPCMovementMode;
  attributes: NPCAttributes;
  // Legacy migration fallback. New edits use attributes.movementSpeed.
  movementSpeed?: number;
  patrolPath?: PatrolPath;
  wanderZone?: WanderZone;
  enemyBehaviour?: EnemyBehaviour;
  interaction?: Interaction;
};

export type MapOverlayFilter = "npc_paths" | "enemy_ranges" | "event_blocks" | "collision" | "none";

export type EventBlock = {
  id: string;
  name: string;
  x: number;
  y: number;
  tag: string;
  kind: "spawn" | "trigger" | "area_link";
  link?: AreaLink;
  interaction?: Interaction;
};

export type AreaLink = {
  targetAreaId: string;
  targetEventBlockId: string;
};

export type TileStyleConfig = {
  [tileId: string]: {
    color: string;
    label?: string;
  };
};

export type PixelAsset = {
  id: string;
  name: string;
  kind: "terrain" | "overlay" | "structure" | "character" | "portrait";
  width: number;
  height: number;
  pixels: string[][];
};

export type CameraConfig = {
  viewportWidthTiles: number;
  viewportHeightTiles: number;
  followPlayer: boolean;
  followSmoothing: number;
  deadzoneWidthTiles?: number;
  deadzoneHeightTiles?: number;
};

export type PlayerConfig = {
  name: string;
  mapAvatarId: string;
  cutscenePortraitId: string;
  speed: number;
  health: number;
  combat?: PlayerCombatStats;
  canWalkOn: string[];
};

export type PlayerCombatStats = {
  maxHealth: number;
  health: number;
  attackDamage: number;
  attackRangeTiles: number;
  attackCooldownMs: number;
};

export type Cutscene = {
  id: string;
  name: string;
  backgroundImageId: string;
  portraitImageId?: string;
  speakerName?: string;
  text: string;
};

export type ProgressionStep = {
  id: string;
  label?: string;
  action: ProgressionAction;
};

export type ProgressionAction =
  | { type: "play_cutscene"; cutsceneId: string }
  | { type: "spawn_player"; areaId: string; eventBlockId: string }
  | { type: "wait_for_trigger"; areaId?: string; eventBlockId: string }
  | { type: "teleport_player"; areaId: string; eventBlockId: string }
  | { type: "end_game" };

export type GameStateValue = number | string;

export type GameStateConfig = {
  flags: Record<string, boolean>;
  variables: Record<string, GameStateValue>;
  inventory?: Record<string, number>;
};

export type InventoryState = {
  items: Record<string, number>;
};

export type ItemDefinition = {
  id: string;
  name: string;
  description?: string;
  category: "key" | "currency" | "consumable" | "quest" | "misc";
  iconId?: string;
  stackable: boolean;
  maxStack?: number;
};

export type ShopDefinition = {
  id: string;
  name: string;
  currencyItemId: string;
  entries: ShopEntry[];
};

export type ShopEntry = {
  id: string;
  itemId: string;
  buyPrice: number;
  stock?: number;
};

export type QuestStatus = "inactive" | "active" | "completed" | "failed";

export type Quest = {
  id: string;
  name: string;
  description?: string;
  status: QuestStatus;
  objectives: Objective[];
  rewards?: QuestReward[];
};

export type Objective = {
  id: string;
  description: string;
  condition: ObjectiveCondition;
};

export type ObjectiveCondition =
  | { type: "flag"; flag: string; value: boolean }
  | { type: "has_item"; itemId: string; quantity?: number }
  | {
      type: "variable_compare";
      variable: string;
      operator: VariableComparisonOperator;
      value: GameStateValue;
    }
  | { type: "enter_area"; areaId: string };

export type QuestReward =
  | { type: "item"; itemId: string; quantity: number }
  | { type: "flag"; flag: string; value: boolean }
  | { type: "variable"; variable: string; amount: number };

export type GameRule = {
  id: string;
  name: string;
  enabled: boolean;
  groupId?: string;
  trigger: RuleTrigger;
  conditionTree?: ConditionExpression;
  actions: GameAction[];
  elseActions?: GameAction[];
};

export type RuleGroup = {
  id: string;
  name: string;
  description?: string;
  collapsed?: boolean;
  parentGroupId?: string;
};

export type RuleTrigger =
  | { type: "on_game_start" }
  | { type: "on_interact"; targetId: string }
  | { type: "on_touch"; targetId: string }
  | { type: "on_area_enter"; areaId: string }
  | { type: "on_cutscene_end"; cutsceneId: string };

// TODO: Add enemy-specific rule triggers such as on_enemy_detect_player and on_enemy_touch_player.

export type VariableComparisonOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

export type ConditionExpression = SingleCondition | ConditionGroup;

export type ConditionGroup = {
  id: string;
  type: "group";
  operator: "AND" | "OR";
  conditions: ConditionExpression[];
};

export type SingleCondition =
  | { id: string; type: "flag_is"; flag: string; value: boolean }
  | {
      id: string;
      type: "variable_compare";
      variable: string;
      operator: VariableComparisonOperator;
      value: GameStateValue;
    }
  | { id: string; type: "has_item"; itemId: string; quantity?: number }
  | { id: string; type: "not_has_item"; itemId: string; quantity?: number }
  | { id: string; type: "npc_alignment"; npcId: string; alignment: NPCAlignment }
  | {
      id: string;
      type: "npc_health_compare";
      npcId: string;
      operator: VariableComparisonOperator;
      value: number;
    };

export type GameAction =
  | { type: "set_flag"; flag: string; value: boolean }
  | { type: "change_variable"; variable: string; amount: number }
  | { type: "set_variable"; variable: string; value: GameStateValue }
  | { type: "play_cutscene"; cutsceneId: string }
  | { type: "teleport"; areaId: string; eventBlockId: string }
  | { type: "change_movement_mode"; mode: Exclude<MovementMode, "swim"> }
  | { type: "give_item"; itemId: string; quantity: number }
  | { type: "remove_item"; itemId: string; quantity: number }
  | { type: "activate_quest"; questId: string }
  | { type: "complete_quest"; questId: string }
  | { type: "fail_quest"; questId: string }
  | { type: "set_npc_alignment"; npcId: string; alignment: NPCAlignment }
  | { type: "set_npc_health"; npcId: string; value: number }
  | { type: "open_shop"; shopId: string }
  | { type: "end_game" };

// TODO: Future foundations: freeform placement, per-area camera overrides, node graph logic, enemies, sounds, UI editor, asset imports, selling, dynamic pricing, and stock refresh.
