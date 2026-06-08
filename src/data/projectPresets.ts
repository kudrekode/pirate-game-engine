import type { GameProject } from "../types/game";
import { createAreaFromTemplate } from "./areaTemplates";
import { defaultProject } from "./defaultProject";
import { createDefaultPixelAssets } from "./mapVisuals";
import { cloneProject } from "./migrateProject";
import { defaultTileStyles } from "./presets";
import { defaultCameraConfig } from "./projectDefaults";

function createCleanArea(id: string, name: string) {
	const area = createAreaFromTemplate("outdoor", id, name);
	return {
		...area,
		terrainTiles: area.terrainTiles.map((tile) => ({
			...tile,
			tileId: "grass",
		})),
		overlayTiles: [],
		theme: {
			primaryTerrainId: "grass",
		},
	};
}

const blankArea = createCleanArea("area_main", "Main Area");
const blankSpawnId = blankArea.eventBlocks[0].id;

export const blankProject: GameProject = {
	metadata: {
		name: "Blank Project",
		version: "0.1.0",
	},
	areas: [blankArea],
	activeAreaId: blankArea.id,
	camera: defaultCameraConfig,
	tileStyles: defaultTileStyles,
	pixelAssets: createDefaultPixelAssets(),
	player: {
		name: "Player",
		mapAvatarId: "scout",
		cutscenePortraitId: "portrait_scout",
		speed: 6,
		health: 100,
		combat: {
			maxHealth: 100,
			health: 100,
			attackDamage: 25,
			attackRangeTiles: 1,
			attackCooldownMs: 500,
		},
		canWalkOn: [
			"grass",
			"dirt",
			"wooden_floor",
			"stone_floor",
			"carpet",
			"cave_floor",
			"ship_deck",
		],
	},
	cutscenes: [],
	progression: [
		{
			id: "step_spawn_player",
			action: {
				type: "spawn_player",
				areaId: blankArea.id,
				eventBlockId: blankSpawnId,
			},
		},
	],
	gameState: {
		flags: {},
		variables: {},
		inventory: {},
	},
	items: [],
	shops: [],
	quests: [],
	npcs: [],
	objects: [],
	ruleGroups: [],
	rules: [],
};

const demoStartArea = createCleanArea("area_demo_blank", "Blank Demo Area");
const fullDemoProject = cloneProject(defaultProject);

export const demoProject: GameProject = {
	...fullDemoProject,
	areas: [demoStartArea, ...fullDemoProject.areas],
	activeAreaId: demoStartArea.id,
};

export type ProjectPresetId = "blank" | "demo";

export const projectPresets: {
	id: ProjectPresetId;
	label: string;
	project: GameProject;
}[] = [
	{ id: "blank", label: "Blank Project", project: blankProject },
	{ id: "demo", label: "Demo Project", project: demoProject },
];

export function createProjectFromPreset(id: ProjectPresetId): GameProject {
	const preset =
		projectPresets.find((candidate) => candidate.id === id) ??
		projectPresets[0];
	return cloneProject(preset.project);
}
