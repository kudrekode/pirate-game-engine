import type { GameProject, MapTile } from "../types/game";
import { defaultCameraConfig } from "./projectDefaults";

function makeTiles(width: number, height: number): MapTile[] {
  const tiles: MapTile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let tileId = "grass";

      if (y === 7 && x > 2 && x < 17) {
        tileId = "water";
      }

      if ((x === 4 && y > 1 && y < 6) || (x === 15 && y > 9 && y < 14)) {
        tileId = "tree";
      }

      if ((x === 10 && y === 4) || (x === 11 && y === 4) || (x === 10 && y === 5)) {
        tileId = "rock";
      }

      if ((y === 3 && x > 1 && x < 9) || (x === 18 && y > 4 && y < 12)) {
        tileId = "dirt";
      }

      tiles.push({ x, y, tileId });
    }
  }

  return tiles;
}

export const defaultProject: GameProject = {
  metadata: {
    name: "Demo Adventure",
    version: "0.1.0",
  },
  map: {
    width: 20,
    height: 15,
    tileSize: 32,
    tiles: makeTiles(20, 15),
    eventBlocks: [
      {
        id: "spawn_start",
        name: "Start",
        x: 2,
        y: 2,
        tag: "start",
        kind: "spawn",
      },
      {
        id: "trigger_gate",
        name: "Gate Trigger",
        x: 18,
        y: 10,
        tag: "gate",
        kind: "trigger",
      },
    ],
  },
  camera: defaultCameraConfig,
  player: {
    name: "Ari",
    mapAvatarId: "scout",
    cutscenePortraitId: "portrait_scout",
    speed: 6,
    health: 5,
    canWalkOn: ["grass", "dirt"],
  },
  cutscenes: [
    {
      id: "intro_cutscene",
      name: "Intro",
      backgroundImageId: "forest_path",
      portraitImageId: "portrait_scout",
      speakerName: "Ari",
      text: "The old path has opened. Find the gate marker beyond the river trail.",
    },
    {
      id: "gate_cutscene",
      name: "At the Gate",
      backgroundImageId: "stone_gate",
      portraitImageId: "portrait_ranger",
      speakerName: "Gatekeeper",
      text: "You reached the marker. The first chapter ends here.",
    },
  ],
  progression: [
    {
      id: "step_intro",
      label: "Intro cutscene",
      action: {
        type: "play_cutscene",
        cutsceneId: "intro_cutscene",
      },
    },
    {
      id: "step_spawn",
      label: "Spawn player",
      action: {
        type: "spawn_player",
        eventBlockId: "spawn_start",
      },
    },
    {
      id: "step_wait_gate",
      label: "Wait for gate trigger",
      action: {
        type: "wait_for_trigger",
        eventBlockId: "trigger_gate",
      },
    },
    {
      id: "step_gate_scene",
      label: "Gate cutscene",
      action: {
        type: "play_cutscene",
        cutsceneId: "gate_cutscene",
      },
    },
    {
      id: "step_end",
      label: "End",
      action: {
        type: "end_game",
      },
    },
  ],
};
