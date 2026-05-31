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

export type MovementMode = "walk" | "swim" | "sail" | "ride";

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

export type MapObject = {
  id: string;
  x: number;
  y: number;
  objectId: string;
};

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
  canWalkOn: string[];
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
};

export type GameRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: Condition[];
  actions: GameAction[];
  elseActions?: GameAction[];
};

export type RuleTrigger =
  | { type: "on_game_start" }
  | { type: "on_interact"; targetId: string }
  | { type: "on_touch"; targetId: string }
  | { type: "on_area_enter"; areaId: string }
  | { type: "on_cutscene_end"; cutsceneId: string };

export type VariableComparisonOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

export type Condition =
  | { type: "flag_is"; flag: string; value: boolean }
  | {
      type: "variable_compare";
      variable: string;
      operator: VariableComparisonOperator;
      value: GameStateValue;
    };

export type GameAction =
  | { type: "set_flag"; flag: string; value: boolean }
  | { type: "change_variable"; variable: string; amount: number }
  | { type: "set_variable"; variable: string; value: GameStateValue }
  | { type: "play_cutscene"; cutsceneId: string }
  | { type: "teleport"; areaId: string; eventBlockId: string }
  | { type: "change_movement_mode"; mode: Exclude<MovementMode, "swim"> }
  | { type: "end_game" };

// TODO: Future foundations: freeform placement, per-area camera overrides, node graph logic, enemies, sounds, UI editor, and asset imports.
