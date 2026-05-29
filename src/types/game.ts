export type GameProject = {
  metadata: {
    name: string;
    version: string;
  };
  map: GameMap;
  player: PlayerConfig;
  cutscenes: Cutscene[];
  progression: ProgressionStep[];
};

export type GameMap = {
  width: number;
  height: number;
  tileSize: number;
  tiles: MapTile[];
  eventBlocks: EventBlock[];
};

export type MapTile = {
  x: number;
  y: number;
  tileId: string;
};

export type EventBlock = {
  id: string;
  name: string;
  x: number;
  y: number;
  tag: string;
  kind: "spawn" | "trigger";
};

export type PlayerConfig = {
  name: string;
  spriteId: string;
  portraitId: string;
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

export type ProgressionStep =
  | {
      id: string;
      type: "play_cutscene";
      cutsceneId: string;
    }
  | {
      id: string;
      type: "spawn_player";
      eventBlockId: string;
    }
  | {
      id: string;
      type: "wait_for_trigger";
      eventBlockId: string;
    }
  | {
      id: string;
      type: "end_game";
    };

// TODO: Future editor sections: Sounds, Achievements, Controls, Asset Library, UI Editor, Enemy/NPC Editor.
