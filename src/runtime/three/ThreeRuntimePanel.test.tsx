import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import type { GameArea, GameProject } from "../../types/game";
import { RuntimePanel } from "../RuntimePanel";
import { ThreeRuntimePanel } from "./ThreeRuntimePanel";
// @ts-expect-error Vite raw import used for a source-boundary test.
import threeRuntimeSource from "./ThreeRuntimePanel.tsx?raw";

const runtimeSpies = vi.hoisted(() => ({
	attemptPlayerMove: vi.fn(),
	createRuntimeSession: vi.fn(),
}));

const phaserSpies = vi.hoisted(() => ({
	Game: vi.fn(),
}));

vi.mock("../runtimeSession", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../runtimeSession")>();
	return {
		...actual,
		createRuntimeSession: (
			...args: Parameters<typeof actual.createRuntimeSession>
		) => {
			runtimeSpies.createRuntimeSession(...args);
			return actual.createRuntimeSession(...args);
		},
	};
});

vi.mock("../playerMovementTransaction", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../playerMovementTransaction")>();
	return {
		...actual,
		attemptPlayerMove: (
			...args: Parameters<typeof actual.attemptPlayerMove>
		) => {
			runtimeSpies.attemptPlayerMove(...args);
			return actual.attemptPlayerMove(...args);
		},
	};
});

vi.mock("phaser", () => ({
	default: {
		AUTO: "AUTO",
		Display: {
			Color: {
				HexStringToColor: (hex: string) => ({
					color: Number.parseInt(hex.replace("#", ""), 16),
				}),
			},
		},
		Game: class {
			destroy = vi.fn();

			constructor(config: unknown) {
				phaserSpies.Game(config);
			}
		},
		Input: {
			Events: { POINTER_DOWN: "pointerdown" },
			Keyboard: {
				Events: { ANY_KEY_DOWN: "anykeydown" },
				JustDown: vi.fn(() => false),
				KeyCodes: {
					A: 65,
					D: 68,
					E: 69,
					ENTER: 13,
					S: 83,
					SPACE: 32,
					W: 87,
				},
			},
		},
		Scale: {
			CENTER_BOTH: "CENTER_BOTH",
			FIT: "FIT",
		},
		Scene: class {},
	},
}));

vi.mock("three", () => {
	class Disposable {
		dispose = vi.fn();
	}

	class Mesh {
		geometry: Disposable;
		material: Disposable | Disposable[];
		position = { set: vi.fn() };
		userData: Record<string, unknown> = {};

		constructor(geometry: Disposable, material: Disposable | Disposable[]) {
			this.geometry = geometry;
			this.material = material;
		}
	}

	return {
		AmbientLight: class {},
		BoxGeometry: Disposable,
		Color: class {},
		CylinderGeometry: Disposable,
		DirectionalLight: class {
			position = { set: vi.fn() };
		},
		Mesh,
		MeshStandardMaterial: Disposable,
		PerspectiveCamera: class {
			lookAt = vi.fn();
			position = { set: vi.fn() };
		},
		Scene: class {
			background: unknown;
			add = vi.fn();
		},
		WebGLRenderer: class {
			domElement = document.createElement("canvas");
			dispose = vi.fn();
			render = vi.fn();
			setPixelRatio = vi.fn();
			setSize = vi.fn();
		},
	};
});

function makeArea(patch: Partial<GameArea> = {}): GameArea {
	return {
		eventBlocks: [],
		height: 3,
		id: "area_test",
		kind: "outdoor",
		name: "Test Area",
		npcs: [],
		objects: [],
		overlayTiles: [],
		pickups: [],
		structures: [],
		terrainTiles: [
			{ x: 0, y: 0, tileId: "grass" },
			{ x: 1, y: 0, tileId: "grass" },
			{ x: 2, y: 0, tileId: "grass" },
			{ x: 0, y: 1, tileId: "grass" },
			{ x: 1, y: 1, tileId: "grass" },
			{ x: 2, y: 1, tileId: "grass" },
			{ x: 0, y: 2, tileId: "grass" },
			{ x: 1, y: 2, tileId: "grass" },
			{ x: 2, y: 2, tileId: "grass" },
		],
		tileSize: 32,
		width: 3,
		...patch,
	};
}

function makeProject(patch: Partial<GameProject> = {}): GameProject {
	const area = makeArea();
	const project = cloneProject(defaultProject);
	project.activeAreaId = area.id;
	project.areas = [area];
	project.cutscenes = [];
	project.dialogues = [];
	project.gameState = { flags: {}, inventory: {}, variables: {} };
	project.items = [];
	project.npcs = [];
	project.objects = [];
	project.progression = [];
	project.quests = [];
	project.rules = [];
	project.shops = [];
	project.trackedQuestId = undefined;
	project.player = {
		...project.player,
		canWalkOn: ["grass"],
		speed: 6,
	};
	return { ...project, ...patch };
}

beforeEach(() => {
	runtimeSpies.attemptPlayerMove.mockClear();
	runtimeSpies.createRuntimeSession.mockClear();
	phaserSpies.Game.mockClear();
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ThreeRuntimePanel", () => {
	it("renders the 3D runtime shell and creates a runtime session", () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		expect(screen.getByText("3D Runtime Experimental")).toBeInTheDocument();
		expect(screen.getByText("Test Area")).toBeInTheDocument();
		expect(screen.getByLabelText("Three runtime viewport")).toBeInTheDocument();
		expect(runtimeSpies.createRuntimeSession).toHaveBeenCalledTimes(1);
	});

	it("moves with the shared player movement transaction", async () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		fireEvent.keyDown(window, { key: "ArrowRight" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Pos: 1, 0")).toBeInTheDocument();
		});
		expect(screen.getByText("Moved to 1, 0.")).toBeInTheDocument();
	});

	it("reports a blank project startup error without crashing", () => {
		render(
			<ThreeRuntimePanel
				onRestart={vi.fn()}
				project={makeProject({ activeAreaId: "", areas: [] })}
			/>,
		);

		expect(
			screen.getByText("Project must include at least one area."),
		).toBeInTheDocument();
	});

	it("does not import editor store state", () => {
		expect(threeRuntimeSource).not.toContain("useProjectStore");
		expect(threeRuntimeSource).not.toMatch(/from\s+["'][^"']*store/);
	});
});

describe("RuntimePanel play modes", () => {
	it("defaults to Phaser Play 2D and leaves that path available", () => {
		render(<RuntimePanel onClose={vi.fn()} project={makeProject()} />);

		expect(screen.getByRole("button", { name: "Play 2D" })).toHaveClass(
			"selected",
		);
		expect(
			screen.getByRole("button", { name: "Play 3D Experimental" }),
		).toBeInTheDocument();
		expect(phaserSpies.Game).toHaveBeenCalledTimes(1);
	});

	it("switches to the experimental Three.js runtime mode", async () => {
		render(<RuntimePanel onClose={vi.fn()} project={makeProject()} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Play 3D Experimental" }),
		);

		await waitFor(() =>
			expect(screen.getByText("3D Runtime Experimental")).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: "Play 3D Experimental" }),
		).toHaveClass("selected");
		expect(screen.getByLabelText("Three runtime viewport")).toBeInTheDocument();
	});
});
