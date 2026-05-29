import type { GameArea, GameAreaKind, MapTile } from "../types/game";

export type AreaTemplateId = "outdoor" | "indoor" | "cave" | "ship" | "dungeon";

export type AreaTemplate = {
  id: AreaTemplateId;
  label: string;
  kind: GameAreaKind;
  width: number;
  height: number;
  baseTerrainId: string;
  borderTerrainId?: string;
  accentTerrainId?: string;
  overlayId?: string;
};

export const areaTemplates: AreaTemplate[] = [
  {
    id: "outdoor",
    label: "Outdoor grass",
    kind: "outdoor",
    width: 20,
    height: 15,
    baseTerrainId: "grass",
    accentTerrainId: "dirt",
    overlayId: "dirt_path",
  },
  {
    id: "indoor",
    label: "Indoor wooden floor",
    kind: "indoor",
    width: 14,
    height: 10,
    baseTerrainId: "wooden_floor",
    borderTerrainId: "indoor_wall",
    accentTerrainId: "carpet",
  },
  {
    id: "cave",
    label: "Cave stone",
    kind: "cave",
    width: 18,
    height: 12,
    baseTerrainId: "cave_floor",
    borderTerrainId: "cave_wall",
    accentTerrainId: "stone_floor",
  },
  {
    id: "ship",
    label: "Ship deck",
    kind: "ship",
    width: 18,
    height: 10,
    baseTerrainId: "ship_deck",
    accentTerrainId: "wooden_floor",
    overlayId: "wooden_planks",
  },
  {
    id: "dungeon",
    label: "Dungeon",
    kind: "dungeon",
    width: 16,
    height: 12,
    baseTerrainId: "stone_floor",
    borderTerrainId: "stone",
    accentTerrainId: "carpet",
  },
];

function makeTiles(template: AreaTemplate): MapTile[] {
  const tiles: MapTile[] = [];

  for (let y = 0; y < template.height; y += 1) {
    for (let x = 0; x < template.width; x += 1) {
      const isBorder = x === 0 || y === 0 || x === template.width - 1 || y === template.height - 1;
      const shouldAccent =
        template.accentTerrainId &&
        !isBorder &&
        ((template.id === "outdoor" && ((y === 3 && x > 1 && x < 9) || (x === 10 && y > 3 && y < 10))) ||
          (template.id !== "outdoor" && y > 2 && y < template.height - 3 && x > 3 && x < template.width - 4));

      tiles.push({
        x,
        y,
        tileId: isBorder && template.borderTerrainId
          ? template.borderTerrainId
          : shouldAccent && template.accentTerrainId
            ? template.accentTerrainId
            : template.baseTerrainId,
      });
    }
  }

  return tiles;
}

export function createAreaFromTemplate(
  templateId: AreaTemplateId,
  id: string,
  name?: string,
): GameArea {
  const template = areaTemplates.find((candidate) => candidate.id === templateId) ?? areaTemplates[0];
  const spawnX = Math.min(template.width - 2, Math.max(1, Math.floor(template.width / 2)));
  const spawnY = Math.min(template.height - 2, Math.max(1, Math.floor(template.height / 2)));

  return {
    id,
    name: name ?? template.label,
    kind: template.kind,
    width: template.width,
    height: template.height,
    tileSize: 32,
    terrainTiles: makeTiles(template),
    overlayTiles: template.overlayId
      ? [
          { x: spawnX - 1, y: spawnY, overlayId: template.overlayId },
          { x: spawnX, y: spawnY, overlayId: template.overlayId },
          { x: spawnX + 1, y: spawnY, overlayId: template.overlayId },
        ]
      : [],
    structures: [],
    eventBlocks: [
      {
        id: `${id}_spawn`,
        name: "Entry",
        x: spawnX,
        y: spawnY,
        tag: "entry",
        kind: "spawn",
      },
    ],
    theme: {
      primaryTerrainId: template.baseTerrainId,
      accentTerrainId: template.accentTerrainId,
      overlayId: template.overlayId,
    },
  };
}
