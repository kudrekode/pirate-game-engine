import { create } from "zustand";
import {
	type AreaTemplateId,
	createAreaFromTemplate,
} from "../data/areaTemplates";
import { defaultProject } from "../data/defaultProject";
import { createDefaultPixelAssets } from "../data/mapVisuals";
import { cloneProject, migrateProject } from "../data/migrateProject";
import { backgroundPresets, portraitPresets } from "../data/presets";
import { resolveNPCInstance } from "../runtime/npcResolver";
import type {
	CameraConfig,
	Cutscene,
	EditorSelection,
	EventBlock,
	GameAction,
	GameArea,
	GameProject,
	Interaction,
	MapStructure,
	MapTile,
	NPCInstance,
	ObjectInstance,
	OverlayTile,
	PickupObject,
	PixelAsset,
	PlayerConfig,
	ProgressionAction,
	ProgressionStep,
	TileStyleConfig,
} from "../types/game";

const STORAGE_KEY = "adventure-builder-project-v1";

type ProgressionType = ProgressionAction["type"];

type ProjectStore = {
	project: GameProject;
	editorSelection: EditorSelection;
	setProject: (project: GameProject) => void;
	updateProject: (updater: (project: GameProject) => void) => void;
	resetProject: () => void;
	setEditorSelection: (selection: EditorSelection) => void;
	saveToLocalStorage: () => void;
	loadFromLocalStorage: () => boolean;
	updateMetadata: (metadata: Partial<GameProject["metadata"]>) => void;
	updateCamera: (patch: Partial<CameraConfig>) => void;
	updateTileStyle: (
		tileId: string,
		patch: Partial<TileStyleConfig[string]>,
	) => void;
	setActiveArea: (areaId: string) => void;
	addArea: (templateId: AreaTemplateId) => string;
	updateActiveArea: (patch: Partial<Pick<GameArea, "name" | "kind">>) => void;
	deleteArea: (areaId: string) => void;
	resizeMap: (width: number, height: number) => number;
	setTile: (x: number, y: number, tileId: string) => void;
	setTiles: (tiles: { x: number; y: number; tileId: string }[]) => void;
	setOverlayTiles: (
		tiles: { x: number; y: number; overlayId: string }[],
	) => void;
	eraseOverlayTiles: (cells: { x: number; y: number }[]) => void;
	addStructure: (structure: Omit<MapStructure, "id">) => string;
	updateStructure: (id: string, patch: Partial<MapStructure>) => void;
	deleteStructure: (id: string) => void;
	addObject: (x: number, y: number, objectDefinitionId: string) => string;
	updateObject: (id: string, patch: Partial<ObjectInstance>) => void;
	deleteObject: (id: string) => void;
	addPickup: (x: number, y: number) => string;
	updatePickup: (id: string, patch: Partial<PickupObject>) => void;
	deletePickup: (id: string) => void;
	addNpc: (x: number, y: number, npcDefinitionId: string) => string;
	updateNpc: (id: string, patch: Partial<NPCInstance>) => void;
	deleteNpc: (id: string) => void;
	updatePixelAsset: (asset: PixelAsset) => void;
	resetPixelAsset: (id: string) => void;
	addEventBlock: (x: number, y: number) => string;
	updateEventBlock: (id: string, patch: Partial<EventBlock>) => void;
	deleteEventBlock: (id: string) => void;
	updatePlayer: (patch: Partial<PlayerConfig>) => void;
	addCutscene: () => string;
	updateCutscene: (id: string, patch: Partial<Cutscene>) => void;
	deleteCutscene: (id: string) => void;
	addProgressionStep: (type: ProgressionType) => string;
	updateProgressionStep: (id: string, step: ProgressionStep) => void;
	deleteProgressionStep: (id: string) => void;
};

function makeId(prefix: string): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
	}

	return `${prefix}_${Date.now().toString(36)}`;
}

function tileKey(x: number, y: number): string {
	return `${x}:${y}`;
}

function clampMapSize(value: number): number {
	return Math.min(200, Math.max(1, Math.round(value)));
}

function getActiveArea(project: GameProject): GameArea {
	return (
		project.areas.find((area) => area.id === project.activeAreaId) ??
		project.areas[0] ??
		defaultProject.areas[0]
	);
}

function updateArea(
	project: GameProject,
	areaId: string,
	updater: (area: GameArea) => GameArea,
): GameProject {
	return {
		...project,
		areas: project.areas.map((area) =>
			area.id === areaId ? updater(area) : area,
		),
	};
}

function updateActiveArea(
	project: GameProject,
	updater: (area: GameArea) => GameArea,
): GameProject {
	const activeArea = getActiveArea(project);
	return {
		...updateArea(project, activeArea.id, updater),
		activeAreaId: activeArea.id,
	};
}

function buildResizedTerrainTiles(
	currentTiles: MapTile[],
	width: number,
	height: number,
	updates: { x: number; y: number; tileId: string }[] = [],
): MapTile[] {
	const tileLookup = new Map(
		currentTiles.map((tile) => [tileKey(tile.x, tile.y), tile.tileId]),
	);
	updates.forEach((tile) => {
		if (tile.x >= 0 && tile.y >= 0 && tile.x < width && tile.y < height) {
			tileLookup.set(tileKey(tile.x, tile.y), tile.tileId);
		}
	});

	const tiles: MapTile[] = [];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tiles.push({
				x,
				y,
				tileId: tileLookup.get(tileKey(x, y)) ?? "grass",
			});
		}
	}

	return tiles;
}

function buildOverlayTiles(
	currentTiles: OverlayTile[],
	updates: { x: number; y: number; overlayId: string }[],
	width: number,
	height: number,
): OverlayTile[] {
	const overlayLookup = new Map(
		currentTiles.map((tile) => [tileKey(tile.x, tile.y), tile.overlayId]),
	);
	updates.forEach((tile) => {
		if (tile.x >= 0 && tile.y >= 0 && tile.x < width && tile.y < height) {
			overlayLookup.set(tileKey(tile.x, tile.y), tile.overlayId);
		}
	});

	return Array.from(overlayLookup.entries()).flatMap(([key, overlayId]) => {
		const [x, y] = key.split(":").map(Number);
		return x >= 0 && y >= 0 && x < width && y < height
			? [{ x, y, overlayId }]
			: [];
	});
}

function actionReferencesEvent(
	action: ProgressionAction,
	areaId: string,
	eventBlockId: string,
): boolean {
	if (action.type === "spawn_player" || action.type === "teleport_player") {
		return action.areaId === areaId && action.eventBlockId === eventBlockId;
	}

	if (action.type === "wait_for_trigger") {
		return (
			(!action.areaId || action.areaId === areaId) &&
			action.eventBlockId === eventBlockId
		);
	}

	return false;
}

function cleanProgressionEventReferences(
	project: GameProject,
	areaId: string,
	eventBlockId: string,
) {
	project.progression = project.progression.filter(
		(step) => !actionReferencesEvent(step.action, areaId, eventBlockId),
	);
}

function cleanAreaReferences(project: GameProject, deletedAreaId: string) {
	project.progression = project.progression.filter((step) => {
		const action = step.action;
		if (action.type === "spawn_player" || action.type === "teleport_player") {
			return action.areaId !== deletedAreaId;
		}

		if (action.type === "wait_for_trigger") {
			return action.areaId !== deletedAreaId;
		}

		return true;
	});

	project.areas = project.areas.map((area) => ({
		...area,
		eventBlocks: area.eventBlocks.map((eventBlock) =>
			eventBlock.link?.targetAreaId === deletedAreaId ||
			interactionTargetsArea(eventBlock.interaction, deletedAreaId)
				? { ...eventBlock, link: undefined, interaction: undefined }
				: eventBlock,
		),
		structures: area.structures.map((structure) =>
			interactionTargetsArea(structure.interaction, deletedAreaId)
				? { ...structure, interaction: undefined }
				: structure,
		),
		objects: area.objects.map((object) =>
			interactionTargetsArea(object.interaction, deletedAreaId)
				? { ...object, interaction: undefined }
				: object,
		),
		npcs: area.npcs.map((npc) =>
			interactionTargetsArea(npc.interaction, deletedAreaId)
				? { ...npc, interaction: undefined }
				: npc,
		),
	}));
}

function interactionTargetsArea(
	interaction: Interaction | undefined,
	areaId: string,
): boolean {
	return (
		(interaction?.type === "area_link" || interaction?.type === "teleport") &&
		interaction.targetAreaId === areaId
	);
}

function interactionTargetsEvent(
	interaction: Interaction | undefined,
	areaId: string,
	eventBlockId: string,
): boolean {
	return (
		(interaction?.type === "area_link" || interaction?.type === "teleport") &&
		interaction.targetAreaId === areaId &&
		interaction.targetEventBlockId === eventBlockId
	);
}

function clearEventLinkReferences(
	project: GameProject,
	areaId: string,
	eventBlockId: string,
) {
	project.areas = project.areas.map((area) => ({
		...area,
		eventBlocks: area.eventBlocks.map((eventBlock) =>
			(eventBlock.link?.targetAreaId === areaId &&
				eventBlock.link.targetEventBlockId === eventBlockId) ||
			interactionTargetsEvent(eventBlock.interaction, areaId, eventBlockId)
				? { ...eventBlock, link: undefined, interaction: undefined }
				: eventBlock,
		),
		structures: area.structures.map((structure) =>
			interactionTargetsEvent(structure.interaction, areaId, eventBlockId)
				? { ...structure, interaction: undefined }
				: structure,
		),
		objects: area.objects.map((object) =>
			interactionTargetsEvent(object.interaction, areaId, eventBlockId)
				? { ...object, interaction: undefined }
				: object,
		),
		npcs: area.npcs.map((npc) =>
			interactionTargetsEvent(npc.interaction, areaId, eventBlockId)
				? { ...npc, interaction: undefined }
				: npc,
		),
	}));
}

function filterRuleActions(
	actions: GameAction[] | undefined,
	shouldRemove: (action: GameAction) => boolean,
): GameAction[] | undefined {
	return actions?.filter((action) => !shouldRemove(action));
}

function cleanRuleTargetReferences(
	project: GameProject,
	targetIds: Set<string>,
) {
	project.rules = project.rules.filter((rule) => {
		const trigger = rule.trigger;
		return (
			(trigger.type !== "on_interact" && trigger.type !== "on_touch") ||
			!targetIds.has(trigger.targetId)
		);
	});
}

function cleanRuleAreaReferences(project: GameProject, area: GameArea) {
	cleanRuleTargetReferences(
		project,
		new Set([
			...area.eventBlocks.map((eventBlock) => eventBlock.id),
			...area.structures.map((structure) => structure.id),
			...area.objects.map((object) => object.id),
			...area.npcs.map((npc) => npc.id),
		]),
	);
	project.rules = project.rules
		.filter(
			(rule) =>
				rule.trigger.type !== "on_area_enter" ||
				rule.trigger.areaId !== area.id,
		)
		.map((rule) => ({
			...rule,
			actions:
				filterRuleActions(
					rule.actions,
					(action) => action.type === "teleport" && action.areaId === area.id,
				) ?? [],
			elseActions: filterRuleActions(
				rule.elseActions,
				(action) => action.type === "teleport" && action.areaId === area.id,
			),
		}));
}

function cleanRuleEventReferences(
	project: GameProject,
	areaId: string,
	eventBlockId: string,
) {
	cleanRuleTargetReferences(project, new Set([eventBlockId]));
	project.rules = project.rules.map((rule) => ({
		...rule,
		actions:
			filterRuleActions(
				rule.actions,
				(action) =>
					action.type === "teleport" &&
					action.areaId === areaId &&
					action.eventBlockId === eventBlockId,
			) ?? [],
		elseActions: filterRuleActions(
			rule.elseActions,
			(action) =>
				action.type === "teleport" &&
				action.areaId === areaId &&
				action.eventBlockId === eventBlockId,
		),
	}));
}

function cleanRuleCutsceneReferences(project: GameProject, cutsceneId: string) {
	project.rules = project.rules
		.filter(
			(rule) =>
				rule.trigger.type !== "on_cutscene_end" ||
				rule.trigger.cutsceneId !== cutsceneId,
		)
		.map((rule) => ({
			...rule,
			actions:
				filterRuleActions(
					rule.actions,
					(action) =>
						action.type === "play_cutscene" && action.cutsceneId === cutsceneId,
				) ?? [],
			elseActions: filterRuleActions(
				rule.elseActions,
				(action) =>
					action.type === "play_cutscene" && action.cutsceneId === cutsceneId,
			),
		}));
}

function makeProgressionStep(
	type: ProgressionType,
	project: GameProject,
	id = makeId("step"),
): ProgressionStep {
	const activeArea = getActiveArea(project);

	if (type === "play_cutscene") {
		return {
			id,
			action: {
				type,
				cutsceneId: project.cutscenes[0]?.id ?? "",
			},
		};
	}

	if (type === "spawn_player" || type === "teleport_player") {
		const spawn = activeArea.eventBlocks.find(
			(block) => block.kind === "spawn",
		);

		return {
			id,
			action: {
				type,
				areaId: activeArea.id,
				eventBlockId: spawn?.id ?? activeArea.eventBlocks[0]?.id ?? "",
			},
		};
	}

	if (type === "wait_for_trigger") {
		const trigger = activeArea.eventBlocks.find(
			(block) => block.kind === "trigger",
		);

		return {
			id,
			action: {
				type,
				areaId: activeArea.id,
				eventBlockId: trigger?.id ?? activeArea.eventBlocks[0]?.id ?? "",
			},
		};
	}

	return {
		id,
		action: {
			type: "end_game",
		},
	};
}

function areaSelection(project: GameProject): EditorSelection {
	return {
		type: "area",
		areaId: project.activeAreaId || project.areas[0]?.id || "",
	};
}

const initialProject = migrateProject(defaultProject);

export const useProjectStore = create<ProjectStore>((set, get) => ({
	project: initialProject,
	editorSelection: areaSelection(initialProject),

	setProject: (project) => {
		const migratedProject = migrateProject(project);
		set({
			editorSelection: areaSelection(migratedProject),
			project: migratedProject,
		});
	},

	updateProject: (updater) =>
		set((state) => {
			const project = cloneProject(state.project);
			updater(project);
			return { project: migrateProject(project) };
		}),

	resetProject: () => {
		const project = migrateProject(defaultProject);
		set({ editorSelection: areaSelection(project), project });
	},

	setEditorSelection: (selection) => set({ editorSelection: selection }),

	saveToLocalStorage: () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(migrateProject(get().project), null, 2),
		);
	},

	loadFromLocalStorage: () => {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return false;
		}

		const project = migrateProject(JSON.parse(raw));
		set({ editorSelection: areaSelection(project), project });
		return true;
	},

	updateMetadata: (metadata) =>
		set((state) => ({
			project: {
				...state.project,
				metadata: {
					...state.project.metadata,
					...metadata,
				},
			},
		})),

	updateCamera: (patch) =>
		set((state) => ({
			project: {
				...state.project,
				camera: {
					...state.project.camera,
					...patch,
				},
			},
		})),

	updateTileStyle: (tileId, patch) =>
		set((state) => ({
			project: {
				...state.project,
				tileStyles: {
					...state.project.tileStyles,
					[tileId]: {
						...state.project.tileStyles[tileId],
						...patch,
					},
				},
			},
		})),

	setActiveArea: (areaId) =>
		set((state) =>
			state.project.areas.some((area) => area.id === areaId)
				? {
						editorSelection: { type: "area", areaId },
						project: {
							...state.project,
							activeAreaId: areaId,
						},
					}
				: state,
		),

	addArea: (templateId) => {
		const id = makeId("area");
		const index = get().project.areas.length + 1;
		const area = createAreaFromTemplate(templateId, id, `Area ${index}`);

		set((state) => ({
			editorSelection: { type: "area", areaId: id },
			project: {
				...state.project,
				areas: [...state.project.areas, area],
				activeAreaId: id,
			},
		}));

		return id;
	},

	updateActiveArea: (patch) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				...patch,
			})),
		})),

	deleteArea: (areaId) =>
		set((state) => {
			if (state.project.areas.length <= 1) {
				return state;
			}

			const project = cloneProject(state.project);
			const deletedArea = project.areas.find((area) => area.id === areaId);
			if (deletedArea) {
				cleanRuleAreaReferences(project, deletedArea);
			}
			project.areas = project.areas.filter((area) => area.id !== areaId);
			cleanAreaReferences(project, areaId);
			if (project.activeAreaId === areaId) {
				project.activeAreaId = project.areas[0]?.id ?? "";
			}

			return { editorSelection: areaSelection(project), project };
		}),

	resizeMap: (width, height) => {
		const nextWidth = clampMapSize(width);
		const nextHeight = clampMapSize(height);
		let removedEventBlockCount = 0;

		set((state) => {
			const activeArea = getActiveArea(state.project);
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);
			const eventBlocks = activeArea.eventBlocks.filter((eventBlock) => {
				const isInBounds =
					eventBlock.x >= 0 &&
					eventBlock.y >= 0 &&
					eventBlock.x < nextWidth &&
					eventBlock.y < nextHeight;

				if (!isInBounds) {
					removedEventBlockCount += 1;
				}

				return isInBounds;
			});
			const project = updateActiveArea(state.project, (area) => ({
				...area,
				width: nextWidth,
				height: nextHeight,
				terrainTiles,
				overlayTiles: area.overlayTiles.filter(
					(tile) =>
						tile.x >= 0 &&
						tile.y >= 0 &&
						tile.x < nextWidth &&
						tile.y < nextHeight,
				),
				structures: area.structures.filter(
					(structure) =>
						structure.x >= 0 &&
						structure.y >= 0 &&
						structure.x < nextWidth &&
						structure.y < nextHeight,
				),
				objects: area.objects.filter(
					(object) =>
						object.x >= 0 &&
						object.y >= 0 &&
						object.x < nextWidth &&
						object.y < nextHeight,
				),
				pickups: area.pickups.filter(
					(pickup) =>
						pickup.x >= 0 &&
						pickup.y >= 0 &&
						pickup.x < nextWidth &&
						pickup.y < nextHeight,
				),
				npcs: area.npcs.filter(
					(npc) =>
						npc.x >= 0 && npc.y >= 0 && npc.x < nextWidth && npc.y < nextHeight,
				),
				eventBlocks,
			}));

			activeArea.eventBlocks
				.filter(
					(eventBlock) =>
						!eventBlocks.some((kept) => kept.id === eventBlock.id),
				)
				.forEach((eventBlock) => {
					cleanProgressionEventReferences(
						project,
						activeArea.id,
						eventBlock.id,
					);
					clearEventLinkReferences(project, activeArea.id, eventBlock.id);
					cleanRuleEventReferences(project, activeArea.id, eventBlock.id);
				});

			return { project };
		});

		return removedEventBlockCount;
	},

	setTile: (x, y, tileId) =>
		set((state) => {
			if (x < 0 || y < 0) {
				return state;
			}

			const activeArea = getActiveArea(state.project);
			const nextWidth = clampMapSize(Math.max(activeArea.width, x + 1));
			const nextHeight = clampMapSize(Math.max(activeArea.height, y + 1));
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
				[{ x, y, tileId }],
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
				})),
			};
		}),

	setTiles: (tileUpdates) =>
		set((state) => {
			const validUpdates = tileUpdates.filter(
				(tile) => tile.x >= 0 && tile.y >= 0,
			);
			if (validUpdates.length === 0) {
				return state;
			}

			const activeArea = getActiveArea(state.project);
			const maxX = Math.max(...validUpdates.map((tile) => tile.x));
			const maxY = Math.max(...validUpdates.map((tile) => tile.y));
			const nextWidth = clampMapSize(Math.max(activeArea.width, maxX + 1));
			const nextHeight = clampMapSize(Math.max(activeArea.height, maxY + 1));
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
				validUpdates,
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
				})),
			};
		}),

	setOverlayTiles: (tileUpdates) =>
		set((state) => {
			const validUpdates = tileUpdates.filter(
				(tile) => tile.x >= 0 && tile.y >= 0,
			);
			if (validUpdates.length === 0) {
				return state;
			}

			const activeArea = getActiveArea(state.project);
			const maxX = Math.max(...validUpdates.map((tile) => tile.x));
			const maxY = Math.max(...validUpdates.map((tile) => tile.y));
			const nextWidth = clampMapSize(Math.max(activeArea.width, maxX + 1));
			const nextHeight = clampMapSize(Math.max(activeArea.height, maxY + 1));
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
					overlayTiles: buildOverlayTiles(
						area.overlayTiles,
						validUpdates,
						nextWidth,
						nextHeight,
					),
				})),
			};
		}),

	eraseOverlayTiles: (cells) =>
		set((state) => {
			const eraseKeys = new Set(cells.map((cell) => tileKey(cell.x, cell.y)));
			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					overlayTiles: area.overlayTiles.filter(
						(tile) => !eraseKeys.has(tileKey(tile.x, tile.y)),
					),
				})),
			};
		}),

	addStructure: (structure) => {
		const id = makeId("structure");

		set((state) => {
			const activeArea = getActiveArea(state.project);
			const nextWidth = clampMapSize(
				Math.max(activeArea.width, structure.x + structure.widthTiles),
			);
			const nextHeight = clampMapSize(
				Math.max(activeArea.height, structure.y + structure.heightTiles),
			);
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
					structures: [...area.structures, { ...structure, id }],
				})),
			};
		});

		return id;
	},

	deleteStructure: (id) =>
		set((state) => {
			const project = cloneProject(state.project);
			cleanRuleTargetReferences(project, new Set([id]));
			return {
				project: updateActiveArea(project, (area) => ({
					...area,
					structures: area.structures.filter(
						(structure) => structure.id !== id,
					),
				})),
			};
		}),

	updateStructure: (id, patch) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				structures: area.structures.map((structure) =>
					structure.id === id ? { ...structure, ...patch } : structure,
				),
			})),
		})),

	addObject: (x, y, objectDefinitionId) => {
		const nextX = Math.max(0, Math.round(x));
		const nextY = Math.max(0, Math.round(y));
		const id = makeId("object_instance");

		set((state) => {
			const activeArea = getActiveArea(state.project);
			const definition = state.project.objects.find(
				(object) => object.id === objectDefinitionId,
			);
			const widthTiles = definition?.widthTiles ?? 1;
			const heightTiles = definition?.heightTiles ?? 1;
			const nextWidth = clampMapSize(
				Math.max(activeArea.width, nextX + widthTiles),
			);
			const nextHeight = clampMapSize(
				Math.max(activeArea.height, nextY + heightTiles),
			);
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
					objects: [
						...area.objects,
						{
							id,
							objectDefinitionId,
							areaId: area.id,
							x: nextX,
							y: nextY,
							widthTiles,
							heightTiles,
							blocksMovement: definition?.blocksMovement ?? false,
							interaction: definition?.defaultInteraction,
						},
					],
				})),
			};
		});

		return id;
	},

	updateObject: (id, patch) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				objects: area.objects.map((object) =>
					object.id === id ? { ...object, ...patch, areaId: area.id } : object,
				),
			})),
		})),

	deleteObject: (id) =>
		set((state) => {
			const project = cloneProject(state.project);
			cleanRuleTargetReferences(project, new Set([id]));
			return {
				project: updateActiveArea(project, (area) => ({
					...area,
					objects: area.objects.filter((object) => object.id !== id),
				})),
			};
		}),

	addPickup: (x, y) => {
		const nextX = Math.max(0, Math.round(x));
		const nextY = Math.max(0, Math.round(y));
		const id = makeId("pickup");

		set((state) => {
			const activeArea = getActiveArea(state.project);
			const nextWidth = clampMapSize(Math.max(activeArea.width, nextX + 1));
			const nextHeight = clampMapSize(Math.max(activeArea.height, nextY + 1));
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
					pickups: [
						...area.pickups,
						{
							id,
							itemId: state.project.items[0]?.id ?? "",
							quantity: 1,
							areaId: area.id,
							x: nextX,
							y: nextY,
							pickupMode: "on_touch",
							once: true,
						},
					],
				})),
			};
		});

		return id;
	},

	updatePickup: (id, patch) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				pickups: area.pickups.map((pickup) =>
					pickup.id === id ? { ...pickup, ...patch, areaId: area.id } : pickup,
				),
			})),
		})),

	deletePickup: (id) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				pickups: area.pickups.filter((pickup) => pickup.id !== id),
			})),
		})),

	addNpc: (x, y, npcDefinitionId) => {
		const nextX = Math.max(0, Math.round(x));
		const nextY = Math.max(0, Math.round(y));
		const id = makeId("npc_instance");

		set((state) => {
			const activeArea = getActiveArea(state.project);
			const nextWidth = clampMapSize(Math.max(activeArea.width, nextX + 1));
			const nextHeight = clampMapSize(Math.max(activeArea.height, nextY + 1));
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);
			const definition = state.project.npcs.find(
				(npc) => npc.id === npcDefinitionId,
			);
			const resolved = resolveNPCInstance(definition, {
				id,
				npcDefinitionId,
				areaId: activeArea.id,
				x: nextX,
				y: nextY,
				facing: "down",
				blocksMovement: true,
				movementMode: "stationary",
				attributes: {
					maxHealth: 100,
					health: 100,
					faction: "villagers",
					alignment: "friendly",
					canInteract: true,
					movementSpeed: 1,
				},
			});

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
					npcs: [
						...area.npcs,
						{
							id,
							npcDefinitionId,
							areaId: area.id,
							x: nextX,
							y: nextY,
							facing: "down",
							blocksMovement: true,
							movementMode: resolved.movementMode,
							attributes: resolved.attributes,
							movementSpeed: resolved.movementSpeed,
							...(resolved.patrolPath
								? { patrolPath: resolved.patrolPath }
								: {}),
							...(resolved.wanderZone
								? { wanderZone: resolved.wanderZone }
								: {}),
							...(resolved.enemyBehaviour
								? { enemyBehaviour: resolved.enemyBehaviour }
								: {}),
							...(resolved.interaction
								? { interaction: resolved.interaction }
								: {}),
						},
					],
				})),
			};
		});

		return id;
	},

	updateNpc: (id, patch) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				npcs: area.npcs.map((npc) =>
					npc.id === id ? { ...npc, ...patch, areaId: area.id } : npc,
				),
			})),
		})),

	deleteNpc: (id) =>
		set((state) => {
			const project = cloneProject(state.project);
			cleanRuleTargetReferences(project, new Set([id]));
			return {
				project: updateActiveArea(project, (area) => ({
					...area,
					npcs: area.npcs.filter((npc) => npc.id !== id),
				})),
			};
		}),

	updatePixelAsset: (asset) =>
		set((state) => ({
			project: {
				...state.project,
				pixelAssets: {
					...state.project.pixelAssets,
					[asset.id]: asset,
				},
			},
		})),

	resetPixelAsset: (id) =>
		set((state) => {
			const defaultAsset = createDefaultPixelAssets()[id];
			if (!defaultAsset) {
				return state;
			}

			return {
				project: {
					...state.project,
					pixelAssets: {
						...state.project.pixelAssets,
						[id]: defaultAsset,
					},
				},
			};
		}),

	addEventBlock: (x, y) => {
		const nextX = Math.max(0, Math.round(x));
		const nextY = Math.max(0, Math.round(y));
		const id = makeId("event");

		set((state) => {
			const activeArea = getActiveArea(state.project);
			const index = activeArea.eventBlocks.length + 1;
			const nextWidth = clampMapSize(Math.max(activeArea.width, nextX + 1));
			const nextHeight = clampMapSize(Math.max(activeArea.height, nextY + 1));
			const terrainTiles = buildResizedTerrainTiles(
				activeArea.terrainTiles,
				nextWidth,
				nextHeight,
			);

			return {
				project: updateActiveArea(state.project, (area) => ({
					...area,
					width: nextWidth,
					height: nextHeight,
					terrainTiles,
					eventBlocks: [
						...area.eventBlocks,
						{
							id,
							name: `Event ${index}`,
							x: nextX,
							y: nextY,
							tag: `event_${index}`,
							kind: "trigger",
						},
					],
				})),
			};
		});

		return id;
	},

	updateEventBlock: (id, patch) =>
		set((state) => ({
			project: updateActiveArea(state.project, (area) => ({
				...area,
				eventBlocks: area.eventBlocks.map((eventBlock) =>
					eventBlock.id === id ? { ...eventBlock, ...patch } : eventBlock,
				),
			})),
		})),

	deleteEventBlock: (id) =>
		set((state) => {
			const activeArea = getActiveArea(state.project);
			const project = cloneProject(state.project);
			project.areas = project.areas.map((area) =>
				area.id === activeArea.id
					? {
							...area,
							eventBlocks: area.eventBlocks.filter(
								(eventBlock) => eventBlock.id !== id,
							),
						}
					: area,
			);
			cleanProgressionEventReferences(project, activeArea.id, id);
			clearEventLinkReferences(project, activeArea.id, id);
			cleanRuleEventReferences(project, activeArea.id, id);
			return { project };
		}),

	updatePlayer: (patch) =>
		set((state) => ({
			project: {
				...state.project,
				player: {
					...state.project.player,
					...patch,
				},
			},
		})),

	addCutscene: () => {
		const index = get().project.cutscenes.length + 1;
		const id = makeId("cutscene");

		set((state) => ({
			project: {
				...state.project,
				cutscenes: [
					...state.project.cutscenes,
					{
						id,
						name: `Cutscene ${index}`,
						backgroundImageId: backgroundPresets[0]?.id ?? "",
						portraitImageId:
							state.project.player.cutscenePortraitId ?? portraitPresets[0]?.id,
						speakerName: state.project.player.name,
						text: "New dialogue text.",
					},
				],
			},
		}));

		return id;
	},

	updateCutscene: (id, patch) =>
		set((state) => ({
			project: {
				...state.project,
				cutscenes: state.project.cutscenes.map((cutscene) =>
					cutscene.id === id ? { ...cutscene, ...patch } : cutscene,
				),
			},
		})),

	deleteCutscene: (id) =>
		set((state) => {
			const project = cloneProject(state.project);
			project.cutscenes = project.cutscenes.filter(
				(cutscene) => cutscene.id !== id,
			);
			project.progression = project.progression.filter(
				(step) =>
					step.action.type !== "play_cutscene" || step.action.cutsceneId !== id,
			);
			cleanRuleCutsceneReferences(project, id);
			return { project };
		}),

	addProgressionStep: (type) => {
		const id = makeId("step");

		set((state) => {
			const step = makeProgressionStep(type, state.project, id);
			return {
				project: {
					...state.project,
					progression: [...state.project.progression, step],
				},
			};
		});

		return id;
	},

	updateProgressionStep: (id, step) =>
		set((state) => ({
			project: {
				...state.project,
				progression: state.project.progression.map((existingStep) =>
					existingStep.id === id ? step : existingStep,
				),
			},
		})),

	deleteProgressionStep: (id) =>
		set((state) => ({
			project: {
				...state.project,
				progression: state.project.progression.filter((step) => step.id !== id),
			},
		})),
}));

export { STORAGE_KEY };
