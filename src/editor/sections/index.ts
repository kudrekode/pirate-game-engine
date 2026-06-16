import type { ComponentType } from "react";
import { CameraEditor } from "./CameraEditor";
import { CharacterEditor } from "./CharacterEditor";
import { CutsceneEditor } from "./CutsceneEditor";
import { GameStateEditor } from "./GameStateEditor";
import { ItemsEditor } from "./ItemsEditor";
import { MapEditor } from "./MapEditor";
import { NpcsEditor } from "./NpcsEditor";
import { ObjectsEditor } from "./ObjectsEditor";
import { ProgressionEditor } from "./ProgressionEditor";
import { QuestsEditor } from "./QuestsEditor";
import { ShopsEditor } from "./ShopsEditor";
import { ThreeDPreview } from "./ThreeDPreview";

export type EditorSectionId =
	| "map"
	| "character"
	| "camera"
	| "cutscenes"
	| "progression"
	| "game-state"
	| "items"
	| "shops"
	| "quests"
	| "objects"
	| "npcs"
	| "three-d-preview";

export type EditorSectionConfig = {
	id: EditorSectionId;
	label: string;
	description: string;
	component: ComponentType;
};

export const editorSections: EditorSectionConfig[] = [
	{
		id: "map",
		label: "Map",
		description: "Paint areas, place objects, and edit map entities.",
		component: MapEditor,
	},
	{
		id: "character",
		label: "Character",
		description:
			"Configure the player avatar, portrait, stats, and walkable terrain.",
		component: CharacterEditor,
	},
	{
		id: "camera",
		label: "Camera",
		description: "Configure the play-mode viewport and player follow behavior.",
		component: CameraEditor,
	},
	{
		id: "cutscenes",
		label: "Cutscenes",
		description: "Create simple image and text story moments.",
		component: CutsceneEditor,
	},
	{
		id: "progression",
		label: "Logic",
		description:
			"Build plain-English rules using triggers, conditions, and actions.",
		component: ProgressionEditor,
	},
	{
		id: "game-state",
		label: "Game State",
		description:
			"Define default flags and variables copied into each play session.",
		component: GameStateEditor,
	},
	{
		id: "items",
		label: "Items",
		description: "Define inventory items used by pickups, quests, and rules.",
		component: ItemsEditor,
	},
	{
		id: "shops",
		label: "Shops",
		description: "Define simple buy-only shops opened by rules.",
		component: ShopsEditor,
	},
	{
		id: "quests",
		label: "Quests",
		description: "Create player-facing objectives and completion rewards.",
		component: QuestsEditor,
	},
	{
		id: "objects",
		label: "Objects",
		description:
			"Define reusable map props such as signs, chests, doors, and vehicle markers.",
		component: ObjectsEditor,
	},
	{
		id: "npcs",
		label: "NPCs",
		description:
			"Define reusable NPCs, then place and configure instances in the Map tab.",
		component: NpcsEditor,
	},
	{
		id: "three-d-preview",
		label: "3D Preview",
		description: "Experimental read-only Three.js preview shell.",
		component: ThreeDPreview,
	},
];
