import type { GameArea, GameProject, MapTile } from "../types/game";
import { createDefaultPixelAssets, defaultTileStyles } from "./mapVisuals";
import { defaultCameraConfig } from "./projectDefaults";

function makeOutdoorTiles(width: number, height: number): MapTile[] {
  const tiles: MapTile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let tileId = "grass";

      if (y === 7 && x > 2 && x < 17) {
        tileId = "water";
      }

      if ((x === 4 && y > 1 && y < 6) || (x === 15 && y > 9 && y < 14)) {
        tileId = "stone";
      }

      if ((y === 3 && x > 1 && x < 9) || (x === 18 && y > 4 && y < 12)) {
        tileId = "dirt";
      }

      tiles.push({ x, y, tileId });
    }
  }

  return tiles;
}

function makeIndoorTiles(width: number, height: number): MapTile[] {
  const tiles: MapTile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isWall = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles.push({ x, y, tileId: isWall ? "indoor_wall" : "wooden_floor" });
    }
  }

  return tiles;
}

const mainArea: GameArea = {
  id: "area_main",
  name: "Main Area",
  kind: "outdoor",
  width: 20,
  height: 15,
  tileSize: 32,
  terrainTiles: makeOutdoorTiles(20, 15),
  overlayTiles: [
    { x: 2, y: 3, overlayId: "dirt_path" },
    { x: 3, y: 3, overlayId: "dirt_path" },
    { x: 4, y: 3, overlayId: "dirt_path" },
    { x: 5, y: 3, overlayId: "dirt_path" },
    { x: 18, y: 9, overlayId: "stone_road" },
    { x: 18, y: 10, overlayId: "stone_road" },
  ],
  structures: [
    {
      id: "structure_demo_house",
      structureId: "small_house",
      name: "Tavern Door",
      x: 7,
      y: 9,
      widthTiles: 3,
      heightTiles: 3,
      blocksMovement: true,
    },
  ],
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
    {
      id: "link_house_door",
      name: "Tavern Threshold",
      x: 8,
      y: 12,
      tag: "tavern_threshold",
      kind: "trigger",
    },
  ],
  theme: {
    primaryTerrainId: "grass",
    accentTerrainId: "dirt",
    overlayId: "dirt_path",
  },
};

const houseArea: GameArea = {
  id: "area_house",
  name: "Tavern Interior",
  kind: "indoor",
  width: 12,
  height: 9,
  tileSize: 32,
  terrainTiles: makeIndoorTiles(12, 9),
  overlayTiles: [
    { x: 5, y: 4, overlayId: "wooden_planks" },
    { x: 6, y: 4, overlayId: "wooden_planks" },
  ],
  structures: [
    {
      id: "structure_house_bed",
      structureId: "bed",
      name: "Bed",
      x: 2,
      y: 2,
      widthTiles: 2,
      heightTiles: 2,
      blocksMovement: true,
      interaction: {
        type: "play_cutscene",
        activationMode: "on_interact",
        prompt: "Press E to inspect",
        cutsceneId: "intro_cutscene",
      },
    },
    {
      id: "structure_house_table",
      structureId: "table",
      name: "Table",
      x: 7,
      y: 4,
      widthTiles: 2,
      heightTiles: 1,
      blocksMovement: true,
    },
  ],
  eventBlocks: [
    {
      id: "spawn_house_entry",
      name: "House Entry",
      x: 5,
      y: 6,
      tag: "entry",
      kind: "spawn",
    },
    {
      id: "link_house_exit",
      name: "Exit",
      x: 5,
      y: 7,
      tag: "exit",
      kind: "area_link",
      link: {
        targetAreaId: "area_main",
        targetEventBlockId: "spawn_start",
      },
      interaction: {
        type: "area_link",
        activationMode: "on_touch",
        targetAreaId: "area_main",
        targetEventBlockId: "spawn_start",
      },
    },
  ],
  theme: {
    primaryTerrainId: "wooden_floor",
    accentTerrainId: "carpet",
    overlayId: "wooden_planks",
  },
};

export const defaultProject: GameProject = {
  metadata: {
    name: "Demo Adventure",
    version: "0.1.0",
  },
  areas: [mainArea, houseArea],
  activeAreaId: "area_main",
  camera: defaultCameraConfig,
  tileStyles: defaultTileStyles,
  pixelAssets: createDefaultPixelAssets(),
  player: {
    name: "Ari",
    mapAvatarId: "scout",
    cutscenePortraitId: "portrait_scout",
    speed: 6,
    health: 5,
    canWalkOn: ["grass", "dirt", "wooden_floor", "stone_floor", "carpet", "cave_floor", "ship_deck"],
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
    {
      id: "not_enough_gold",
      name: "Not Enough Gold",
      backgroundImageId: "stone_gate",
      portraitImageId: "portrait_ranger",
      speakerName: "Innkeeper",
      text: "A room costs 5 gold. Come back when you have enough.",
    },
    {
      id: "tavern_welcome",
      name: "Welcome To The Tavern",
      backgroundImageId: "forest_path",
      portraitImageId: "portrait_ranger",
      speakerName: "Innkeeper",
      text: "Welcome in. The first drink is on the house.",
    },
  ],
  progression: [
    {
      id: "step_spawn",
      label: "Spawn player",
      action: {
        type: "spawn_player",
        areaId: "area_main",
        eventBlockId: "spawn_start",
      },
    },
    {
      id: "step_wait_gate",
      label: "Wait for gate trigger",
      action: {
        type: "wait_for_trigger",
        areaId: "area_main",
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
  gameState: {
    flags: {
      intro_seen: false,
      has_boat: false,
      cave_open: false,
      has_key: false,
      tavern_intro_seen: false,
    },
    variables: {
      gold: 3,
      reputation: 0,
    },
  },
  rules: [
    {
      id: "rule_intro",
      name: "Intro",
      enabled: true,
      trigger: { type: "on_game_start" },
      conditions: [{ type: "flag_is", flag: "intro_seen", value: false }],
      actions: [
        { type: "play_cutscene", cutsceneId: "intro_cutscene" },
        { type: "set_flag", flag: "intro_seen", value: true },
      ],
    },
    {
      id: "rule_enter_tavern",
      name: "Enter Tavern",
      enabled: true,
      trigger: { type: "on_interact", targetId: "structure_demo_house" },
      conditions: [{ type: "variable_compare", variable: "gold", operator: ">=", value: 5 }],
      actions: [
        { type: "change_variable", variable: "gold", amount: -5 },
        { type: "teleport", areaId: "area_house", eventBlockId: "spawn_house_entry" },
      ],
      elseActions: [{ type: "play_cutscene", cutsceneId: "not_enough_gold" }],
    },
    {
      id: "rule_tavern_intro",
      name: "Tavern Intro",
      enabled: true,
      trigger: { type: "on_area_enter", areaId: "area_house" },
      conditions: [{ type: "flag_is", flag: "tavern_intro_seen", value: false }],
      actions: [
        { type: "play_cutscene", cutsceneId: "tavern_welcome" },
        { type: "set_flag", flag: "tavern_intro_seen", value: true },
      ],
    },
    {
      id: "rule_gate_touch",
      name: "Open Cave At Gate",
      enabled: true,
      trigger: { type: "on_touch", targetId: "trigger_gate" },
      conditions: [],
      actions: [{ type: "set_flag", flag: "cave_open", value: true }],
    },
  ],
};
