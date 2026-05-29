import type { PixelAsset } from "../types/game";

export type TerrainPreset = {
  id: string;
  label: string;
  color: string;
  textColor: string;
  walkable: boolean;
  pattern?: "grass" | "dirt" | "sand" | "water" | "stone";
};

export type OverlayPreset = {
  id: string;
  label: string;
  color: string;
  walkable: boolean;
  pattern?: "path" | "planks" | "shadow";
};

export type StructurePreset = {
  id: string;
  label: string;
  widthTiles: number;
  heightTiles: number;
  blocksMovement: boolean;
  roofColor: string;
  wallColor: string;
  shadowColor: string;
};

export const terrainPresets: TerrainPreset[] = [
  { id: "grass", label: "Grass", color: "#6fc56f", textColor: "#143c1d", walkable: true, pattern: "grass" },
  { id: "dirt", label: "Dirt", color: "#b8814a", textColor: "#321f11", walkable: true, pattern: "dirt" },
  { id: "sand", label: "Sand", color: "#d9c27f", textColor: "#4d3b14", walkable: true, pattern: "sand" },
  { id: "water", label: "Water", color: "#4f9fca", textColor: "#0c2b3b", walkable: false, pattern: "water" },
  { id: "stone", label: "Stone", color: "#8f969f", textColor: "#20252b", walkable: false, pattern: "stone" },
];

export const overlayPresets: OverlayPreset[] = [
  { id: "dirt_path", label: "Dirt Path", color: "#9b6538", walkable: true, pattern: "path" },
  { id: "hay_path", label: "Hay Path", color: "#d6b85c", walkable: true, pattern: "path" },
  { id: "stone_road", label: "Stone Road", color: "#8a8f96", walkable: true, pattern: "path" },
  { id: "wooden_planks", label: "Wooden Planks", color: "#9a6637", walkable: true, pattern: "planks" },
  { id: "shadow", label: "Shadow", color: "#262626", walkable: true, pattern: "shadow" },
];

export const structurePresets: StructurePreset[] = [
  {
    id: "small_house",
    label: "Small House",
    widthTiles: 3,
    heightTiles: 3,
    blocksMovement: true,
    roofColor: "#a64b3c",
    wallColor: "#d8b06d",
    shadowColor: "#5f4534",
  },
  {
    id: "cottage",
    label: "Cottage",
    widthTiles: 4,
    heightTiles: 3,
    blocksMovement: true,
    roofColor: "#7f5a34",
    wallColor: "#d6c08c",
    shadowColor: "#5b4733",
  },
  {
    id: "stone_tower",
    label: "Stone Tower",
    widthTiles: 2,
    heightTiles: 4,
    blocksMovement: true,
    roofColor: "#5c6370",
    wallColor: "#a4abb4",
    shadowColor: "#59616b",
  },
  {
    id: "castle_gate",
    label: "Castle Gate",
    widthTiles: 4,
    heightTiles: 4,
    blocksMovement: true,
    roofColor: "#6b7280",
    wallColor: "#a8adb5",
    shadowColor: "#4b5563",
  },
  {
    id: "dock",
    label: "Dock",
    widthTiles: 4,
    heightTiles: 2,
    blocksMovement: false,
    roofColor: "#8b5a2b",
    wallColor: "#b87945",
    shadowColor: "#56381f",
  },
  {
    id: "market_stall",
    label: "Market Stall",
    widthTiles: 3,
    heightTiles: 2,
    blocksMovement: true,
    roofColor: "#d14b4b",
    wallColor: "#d7b071",
    shadowColor: "#6b3e28",
  },
  {
    id: "ruin_wall",
    label: "Ruin Wall",
    widthTiles: 3,
    heightTiles: 2,
    blocksMovement: true,
    roofColor: "#777f87",
    wallColor: "#9aa1a8",
    shadowColor: "#525a62",
  },
];

export const defaultTileStyles = Object.fromEntries(
  terrainPresets.map((tile) => [tile.id, { color: tile.color, label: tile.label }]),
);

const legacyTerrainFallbacks: TerrainPreset[] = [
  {
    id: "rock",
    label: "Rock",
    color: "#8f969f",
    textColor: "#20252b",
    walkable: false,
    pattern: "stone",
  },
  {
    id: "tree",
    label: "Tree",
    color: "#2f8c57",
    textColor: "#0f2e1d",
    walkable: false,
    pattern: "grass",
  },
];

function makeGrid(width: number, height: number, color = "transparent"): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => color));
}

function shade(hex: string, amount: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const r = Math.min(255, Math.max(0, (value >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((value >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (value & 255) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function makeTerrainAsset(tile: TerrainPreset): PixelAsset {
  const pixels = makeGrid(16, 16, tile.color);

  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if ((x + y) % 7 === 0) {
        pixels[y][x] = shade(tile.color, 16);
      }
      if ((x * 3 + y * 5) % 19 === 0) {
        pixels[y][x] = shade(tile.color, -16);
      }
    }
  }

  if (tile.pattern === "water") {
    for (let y = 3; y < 16; y += 5) {
      for (let x = 0; x < 16; x += 1) {
        if ((x + y) % 3 !== 0) {
          pixels[y][x] = shade(tile.color, 28);
        }
      }
    }
  }

  if (tile.pattern === "stone") {
    for (let x = 0; x < 16; x += 5) {
      for (let y = 0; y < 16; y += 1) {
        pixels[y][x] = shade(tile.color, -22);
      }
    }
  }

  return {
    id: tile.id,
    name: tile.label,
    kind: "terrain",
    width: 16,
    height: 16,
    pixels,
  };
}

function makeOverlayAsset(overlay: OverlayPreset): PixelAsset {
  const pixels = makeGrid(16, 16);
  const edge = shade(overlay.color, -22);
  const light = shade(overlay.color, 18);

  if (overlay.pattern === "shadow") {
    for (let y = 10; y < 16; y += 1) {
      for (let x = 1; x < 15; x += 1) {
        if ((x + y) % 2 === 0) {
          pixels[y][x] = "rgba(0,0,0,0.32)";
        }
      }
    }
  } else if (overlay.pattern === "planks") {
    for (let y = 4; y < 13; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        pixels[y][x] = y % 4 === 0 ? edge : overlay.color;
      }
    }
    for (let x = 3; x < 16; x += 5) {
      for (let y = 4; y < 13; y += 1) {
        pixels[y][x] = edge;
      }
    }
  } else {
    for (let y = 3; y < 13; y += 1) {
      for (let x = 1; x < 15; x += 1) {
        if (x + y > 2 && x + y < 28) {
          pixels[y][x] = (x + y) % 6 === 0 ? light : overlay.color;
        }
      }
    }
    for (let x = 2; x < 14; x += 1) {
      pixels[3][x] = edge;
      pixels[12][x] = edge;
    }
  }

  return {
    id: overlay.id,
    name: overlay.label,
    kind: "overlay",
    width: 16,
    height: 16,
    pixels,
  };
}

export function createDefaultPixelAssets(): Record<string, PixelAsset> {
  return Object.fromEntries([
    ...terrainPresets.map((tile) => [tile.id, makeTerrainAsset(tile)]),
    ...overlayPresets.map((overlay) => [overlay.id, makeOverlayAsset(overlay)]),
  ]);
}

export function getTerrainPreset(tileId: string): TerrainPreset {
  return (
    terrainPresets.find((tile) => tile.id === tileId) ??
    legacyTerrainFallbacks.find((tile) => tile.id === tileId) ??
    terrainPresets.find((tile) => tile.id === "grass") ??
    terrainPresets[0]
  );
}

export function getOverlayPreset(overlayId: string): OverlayPreset {
  return overlayPresets.find((overlay) => overlay.id === overlayId) ?? overlayPresets[0];
}

export function getStructurePreset(structureId: string): StructurePreset {
  return structurePresets.find((structure) => structure.id === structureId) ?? structurePresets[0];
}
