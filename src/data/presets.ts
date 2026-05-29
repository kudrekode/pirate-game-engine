export type TilePreset = {
  id: string;
  label: string;
  color: string;
  textColor: string;
  pattern?: "dots" | "waves" | "blocks" | "tree";
};

export type VisualPreset = {
  id: string;
  label: string;
  color: string;
  accent: string;
};

export const tilePresets: TilePreset[] = [
  { id: "grass", label: "Grass", color: "#6fc56f", textColor: "#143c1d", pattern: "dots" },
  { id: "dirt", label: "Dirt", color: "#b8814a", textColor: "#321f11", pattern: "dots" },
  { id: "water", label: "Water", color: "#4f9fca", textColor: "#0c2b3b", pattern: "waves" },
  { id: "rock", label: "Rock", color: "#8f969f", textColor: "#20252b", pattern: "blocks" },
  { id: "tree", label: "Tree", color: "#2f8c57", textColor: "#0f2e1d", pattern: "tree" },
];

export const defaultTileStyles = Object.fromEntries(
  tilePresets.map((tile) => [tile.id, { color: tile.color, label: tile.label }]),
);

export const walkableTileIds = ["grass", "dirt"];

export const characterSprites: VisualPreset[] = [
  { id: "scout", label: "Scout", color: "#e85d75", accent: "#ffffff" },
  { id: "ranger", label: "Ranger", color: "#2f9e44", accent: "#f8f9fa" },
  { id: "knight", label: "Knight", color: "#748ffc", accent: "#f1f3f5" },
  { id: "mage", label: "Mage", color: "#845ef7", accent: "#fff3bf" },
  { id: "tinker", label: "Tinker", color: "#f08c00", accent: "#212529" },
];

export const portraitPresets: VisualPreset[] = [
  { id: "portrait_scout", label: "Scout", color: "#ffc9c9", accent: "#c92a2a" },
  { id: "portrait_ranger", label: "Ranger", color: "#b2f2bb", accent: "#2b8a3e" },
  { id: "portrait_knight", label: "Knight", color: "#d0ebff", accent: "#1864ab" },
  { id: "portrait_mage", label: "Mage", color: "#e5dbff", accent: "#5f3dc4" },
  { id: "portrait_tinker", label: "Tinker", color: "#ffe8cc", accent: "#d9480f" },
];

export const backgroundPresets: VisualPreset[] = [
  { id: "forest_path", label: "Forest Path", color: "#2b8a3e", accent: "#ffd43b" },
  { id: "river_crossing", label: "River Crossing", color: "#228be6", accent: "#d0ebff" },
  { id: "stone_gate", label: "Stone Gate", color: "#868e96", accent: "#f8f9fa" },
  { id: "sunset_field", label: "Sunset Field", color: "#ff922b", accent: "#5c2b1f" },
  { id: "night_camp", label: "Night Camp", color: "#364fc7", accent: "#ffd8a8" },
];

export function getTilePreset(tileId: string): TilePreset {
  return tilePresets.find((tile) => tile.id === tileId) ?? tilePresets[0];
}

export function getVisualPreset(id: string, presets: VisualPreset[]): VisualPreset {
  return presets.find((preset) => preset.id === id) ?? presets[0];
}
