import type { ComponentType } from "react";
import { CameraEditor } from "./CameraEditor";
import { CharacterEditor } from "./CharacterEditor";
import { CutsceneEditor } from "./CutsceneEditor";
import { GameStateEditor } from "./GameStateEditor";
import { MapEditor } from "./MapEditor";
import { ProgressionEditor } from "./ProgressionEditor";
import { ItemsEditor } from "./ItemsEditor";
import { QuestsEditor } from "./QuestsEditor";

export type EditorSectionId = "map" | "character" | "camera" | "cutscenes" | "progression" | "game-state" | "items" | "quests";

export type EditorSectionConfig = {
  id: EditorSectionId;
  label: string;
  component: ComponentType;
};

export const editorSections: EditorSectionConfig[] = [
  {
    id: "map",
    label: "Map",
    component: MapEditor,
  },
  {
    id: "character",
    label: "Character",
    component: CharacterEditor,
  },
  {
    id: "camera",
    label: "Camera",
    component: CameraEditor,
  },
  {
    id: "cutscenes",
    label: "Cutscenes",
    component: CutsceneEditor,
  },
  {
    id: "progression",
    label: "Logic",
    component: ProgressionEditor,
  },
  {
    id: "game-state",
    label: "Game State",
    component: GameStateEditor,
  },
  {
    id: "items",
    label: "Items",
    component: ItemsEditor,
  },
  {
    id: "quests",
    label: "Quests",
    component: QuestsEditor,
  },
];
