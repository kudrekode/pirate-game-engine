export type GameProject = {
  metadata: {
    name: string;
    version: string;
  };
  map: GameMap;
  camera: CameraConfig;
  tileStyles: TileStyleConfig;
  pixelAssets: Record<string, PixelAsset>;
  player: PlayerConfig;
  cutscenes: Cutscene[];
  progression: ProgressionStep[];
};

export type GameMap = {
  width: number;
  height: number;
  tileSize: number;
  terrainTiles: MapTile[];
  overlayTiles: OverlayTile[];
  structures: MapStructure[];
  tiles: MapTile[];
  objectTiles?: MapObject[];
  eventBlocks: EventBlock[];
};

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
  kind: "spawn" | "trigger";
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
  | { type: "spawn_player"; eventBlockId: string }
  | { type: "wait_for_trigger"; eventBlockId: string }
  | { type: "teleport_player"; eventBlockId: string }
  | { type: "end_game" };

// TODO: Future foundations: terrain/object/entity layers, node graph progression, enemies, sounds, UI editor, and asset imports.
