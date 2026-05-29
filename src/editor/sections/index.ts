import type { ComponentType } from "react";
import { CharacterEditor } from "./CharacterEditor";
import { CutsceneEditor } from "./CutsceneEditor";
import { MapEditor } from "./MapEditor";
import { ProgressionEditor } from "./ProgressionEditor";

export type EditorSectionId = "map" | "character" | "cutscenes" | "progression";

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
    id: "cutscenes",
    label: "Cutscenes",
    component: CutsceneEditor,
  },
  {
    id: "progression",
    label: "Progression",
    component: ProgressionEditor,
  },
];
