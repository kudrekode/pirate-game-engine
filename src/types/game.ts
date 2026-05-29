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
  interaction?: {
    type: "area_link";
    targetAreaId: string;
    targetEventBlockId: string;
  };
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

// TODO: Future foundations: freeform placement, per-area camera overrides, node graph progression, enemies, sounds, UI editor, and asset imports.
