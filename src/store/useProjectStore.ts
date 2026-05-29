import { create } from "zustand";
import { defaultProject } from "../data/defaultProject";
import { cloneProject, migrateProject } from "../data/migrateProject";
import { backgroundPresets, portraitPresets } from "../data/presets";
import type {
  CameraConfig,
  Cutscene,
  EventBlock,
  GameProject,
  MapTile,
  PlayerConfig,
  ProgressionAction,
  ProgressionStep,
  TileStyleConfig,
} from "../types/game";

const STORAGE_KEY = "adventure-builder-project-v1";

type ProgressionType = ProgressionAction["type"];

type ProjectStore = {
  project: GameProject;
  setProject: (project: GameProject) => void;
  updateProject: (updater: (project: GameProject) => void) => void;
  resetProject: () => void;
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => boolean;
  updateMetadata: (metadata: Partial<GameProject["metadata"]>) => void;
  updateCamera: (patch: Partial<CameraConfig>) => void;
  updateTileStyle: (tileId: string, patch: Partial<TileStyleConfig[string]>) => void;
  resizeMap: (width: number, height: number) => number;
  setTile: (x: number, y: number, tileId: string) => void;
  setTiles: (tiles: { x: number; y: number; tileId: string }[]) => void;
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

function buildResizedTerrainTiles(
  currentTiles: MapTile[],
  width: number,
  height: number,
  updates: { x: number; y: number; tileId: string }[] = [],
): MapTile[] {
  const tileLookup = new Map(currentTiles.map((tile) => [tileKey(tile.x, tile.y), tile.tileId]));
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

function cleanProgressionReferences(project: GameProject, deletedKind: "cutscene" | "event", deletedId: string) {
  project.progression = project.progression.filter((step) => {
    if (deletedKind === "cutscene" && step.action.type === "play_cutscene") {
      return step.action.cutsceneId !== deletedId;
    }

    if (
      deletedKind === "event" &&
      (step.action.type === "spawn_player" ||
        step.action.type === "wait_for_trigger" ||
        step.action.type === "teleport_player")
    ) {
      return step.action.eventBlockId !== deletedId;
    }

    return true;
  });
}

function makeProgressionStep(type: ProgressionType, project: GameProject, id = makeId("step")): ProgressionStep {
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
    const spawn = project.map.eventBlocks.find((block) => block.kind === "spawn");

    return {
      id,
      action: {
        type,
        eventBlockId: spawn?.id ?? project.map.eventBlocks[0]?.id ?? "",
      },
    };
  }

  if (type === "wait_for_trigger") {
    const trigger = project.map.eventBlocks.find((block) => block.kind === "trigger");

    return {
      id,
      action: {
        type,
        eventBlockId: trigger?.id ?? project.map.eventBlocks[0]?.id ?? "",
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

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: migrateProject(defaultProject),

  setProject: (project) => set({ project: migrateProject(project) }),

  updateProject: (updater) =>
    set((state) => {
      const project = cloneProject(state.project);
      updater(project);
      return { project: migrateProject(project) };
    }),

  resetProject: () => set({ project: migrateProject(defaultProject) }),

  saveToLocalStorage: () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrateProject(get().project), null, 2));
  },

  loadFromLocalStorage: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const project = migrateProject(JSON.parse(raw));
    set({ project });
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

  resizeMap: (width, height) => {
    const nextWidth = clampMapSize(width);
    const nextHeight = clampMapSize(height);
    let removedEventBlockCount = 0;

    set((state) => {
      const terrainTiles = buildResizedTerrainTiles(
        state.project.map.terrainTiles ?? state.project.map.tiles,
        nextWidth,
        nextHeight,
      );

      const eventBlocks = state.project.map.eventBlocks.filter((eventBlock) => {
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

      const project = {
        ...state.project,
        map: {
          ...state.project.map,
          width: nextWidth,
          height: nextHeight,
          terrainTiles,
          tiles: terrainTiles,
          eventBlocks,
        },
      };

      state.project.map.eventBlocks
        .filter((eventBlock) => !eventBlocks.some((kept) => kept.id === eventBlock.id))
        .forEach((eventBlock) => cleanProgressionReferences(project, "event", eventBlock.id));

      return { project };
    });

    return removedEventBlockCount;
  },

  setTile: (x, y, tileId) =>
    set((state) => {
      if (x < 0 || y < 0) {
        return state;
      }

      const nextWidth = clampMapSize(Math.max(state.project.map.width, x + 1));
      const nextHeight = clampMapSize(Math.max(state.project.map.height, y + 1));
      const terrainTiles = buildResizedTerrainTiles(
        state.project.map.terrainTiles ?? state.project.map.tiles,
        nextWidth,
        nextHeight,
        [{ x, y, tileId }],
      );

      return {
        project: {
          ...state.project,
          map: {
            ...state.project.map,
            width: nextWidth,
            height: nextHeight,
            terrainTiles,
            tiles: terrainTiles,
          },
        },
      };
    }),

  setTiles: (tileUpdates) =>
    set((state) => {
      if (tileUpdates.length === 0) {
        return state;
      }

      const validUpdates = tileUpdates.filter((tile) => tile.x >= 0 && tile.y >= 0);
      if (validUpdates.length === 0) {
        return state;
      }

      const maxX = Math.max(...validUpdates.map((tile) => tile.x));
      const maxY = Math.max(...validUpdates.map((tile) => tile.y));
      const nextWidth = clampMapSize(Math.max(state.project.map.width, maxX + 1));
      const nextHeight = clampMapSize(Math.max(state.project.map.height, maxY + 1));
      const terrainTiles = buildResizedTerrainTiles(
        state.project.map.terrainTiles ?? state.project.map.tiles,
        nextWidth,
        nextHeight,
        validUpdates,
      );

      return {
        project: {
          ...state.project,
          map: {
            ...state.project.map,
            width: nextWidth,
            height: nextHeight,
            terrainTiles,
            tiles: terrainTiles,
          },
        },
      };
    }),

  addEventBlock: (x, y) => {
    const nextX = Math.max(0, Math.round(x));
    const nextY = Math.max(0, Math.round(y));
    const index = get().project.map.eventBlocks.length + 1;
    const id = makeId("event");

    set((state) => ({
      project: (() => {
        const nextWidth = clampMapSize(Math.max(state.project.map.width, nextX + 1));
        const nextHeight = clampMapSize(Math.max(state.project.map.height, nextY + 1));
        const terrainTiles = buildResizedTerrainTiles(
          state.project.map.terrainTiles ?? state.project.map.tiles,
          nextWidth,
          nextHeight,
        );

        return {
          ...state.project,
          map: {
            ...state.project.map,
            width: nextWidth,
            height: nextHeight,
            terrainTiles,
            tiles: terrainTiles,
            eventBlocks: [
              ...state.project.map.eventBlocks,
              {
                id,
                name: `Event ${index}`,
                x: nextX,
                y: nextY,
                tag: `event_${index}`,
                kind: "trigger",
              },
            ],
          },
        };
      })(),
    }));

    return id;
  },

  updateEventBlock: (id, patch) =>
    set((state) => ({
      project: {
        ...state.project,
        map: {
          ...state.project.map,
          eventBlocks: state.project.map.eventBlocks.map((eventBlock) =>
            eventBlock.id === id ? { ...eventBlock, ...patch } : eventBlock,
          ),
        },
      },
    })),

  deleteEventBlock: (id) =>
    set((state) => {
      const project = cloneProject(state.project);
      project.map.eventBlocks = project.map.eventBlocks.filter((eventBlock) => eventBlock.id !== id);
      cleanProgressionReferences(project, "event", id);
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
            portraitImageId: state.project.player.cutscenePortraitId ?? portraitPresets[0]?.id,
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
      project.cutscenes = project.cutscenes.filter((cutscene) => cutscene.id !== id);
      cleanProgressionReferences(project, "cutscene", id);
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
