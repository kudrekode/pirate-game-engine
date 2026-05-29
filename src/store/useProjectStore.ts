import { create } from "zustand";
import { defaultProject } from "../data/defaultProject";
import { cloneProject, migrateProject } from "../data/migrateProject";
import { backgroundPresets, portraitPresets } from "../data/presets";
import type {
  CameraConfig,
  Cutscene,
  EventBlock,
  GameProject,
  PlayerConfig,
  ProgressionAction,
  ProgressionStep,
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
  setTile: (x: number, y: number, tileId: string) => void;
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

  setTile: (x, y, tileId) =>
    set((state) => {
      const hasTile = state.project.map.tiles.some((tile) => tile.x === x && tile.y === y);
      const tiles = hasTile
        ? state.project.map.tiles.map((tile) =>
            tile.x === x && tile.y === y ? { ...tile, tileId } : tile,
          )
        : [...state.project.map.tiles, { x, y, tileId }];

      return {
        project: {
          ...state.project,
          map: {
            ...state.project.map,
            tiles,
          },
        },
      };
    }),

  addEventBlock: (x, y) => {
    const index = get().project.map.eventBlocks.length + 1;
    const id = makeId("event");

    set((state) => ({
      project: {
        ...state.project,
        map: {
          ...state.project.map,
          eventBlocks: [
            ...state.project.map.eventBlocks,
            {
              id,
              name: `Event ${index}`,
              x,
              y,
              tag: `event_${index}`,
              kind: "trigger",
            },
          ],
        },
      },
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
