import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import type {
	GameArea,
	GameProject,
	ObjectBehaviour,
	ObjectInstance,
} from "../../types/game";
import { RuntimePanel } from "../RuntimePanel";
import { ThreeRuntimePanel } from "./ThreeRuntimePanel";
// @ts-expect-error Vite raw import used for a source-boundary test.
import threeRuntimeSource from "./ThreeRuntimePanel.tsx?raw";

const runtimeSpies = vi.hoisted(() => ({
	attemptPlayerMove: vi.fn(),
	createRuntimeSession: vi.fn(),
	dismountRuntimeVehicle: vi.fn(),
	runRuntimeObjectBehaviour: vi.fn(),
}));

const phaserSpies = vi.hoisted(() => ({
	Game: vi.fn(),
}));

const threeSpies = vi.hoisted(() => ({
	WebGLRenderer: vi.fn(),
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

vi.mock("../runtimeObjectInteractions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../runtimeObjectInteractions")>();
	return {
		...actual,
		dismountRuntimeVehicle: (
			...args: Parameters<typeof actual.dismountRuntimeVehicle>
		) => {
			runtimeSpies.dismountRuntimeVehicle(...args);
			return actual.dismountRuntimeVehicle(...args);
		},
		runRuntimeObjectBehaviour: (
			...args: Parameters<typeof actual.runRuntimeObjectBehaviour>
		) => {
			runtimeSpies.runRuntimeObjectBehaviour(...args);
			return actual.runRuntimeObjectBehaviour(...args);
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

	class Object3D {
		children: Object3D[] = [];
		castShadow = false;
		position = { set: vi.fn() };
		receiveShadow = false;
		rotation = { y: 0 };
		userData: Record<string, unknown> = {};

		add = vi.fn((...children: Object3D[]) => {
			this.children.push(...children);
		});

		traverse(callback: (child: Object3D) => void) {
			callback(this);
			this.children.forEach((child) => {
				child.traverse(callback);
			});
		}
	}

	class Mesh {
		castShadow = false;
		geometry: Disposable;
		material: Disposable | Disposable[];
		position = { set: vi.fn() };
		receiveShadow = false;
		rotation = { y: 0 };
		userData: Record<string, unknown> = {};

		constructor(geometry: Disposable, material: Disposable | Disposable[]) {
			this.geometry = geometry;
			this.material = material;
		}

		traverse(callback: (child: Mesh) => void) {
			callback(this);
		}
	}

	return {
		ACESFilmicToneMapping: "ACESFilmicToneMapping",
		AmbientLight: class {},
		BoxGeometry: Disposable,
		ConeGeometry: Disposable,
		Color: class {},
		CylinderGeometry: Disposable,
		DirectionalLight: class {
			castShadow = false;
			position = { set: vi.fn() };
			shadow = {
				camera: { far: 0, near: 0 },
				mapSize: { height: 0, width: 0 },
			};
		},
		Fog: class {},
		Group: Object3D,
		HemisphereLight: class {},
		Mesh,
		MeshStandardMaterial: Disposable,
		PCFSoftShadowMap: "PCFSoftShadowMap",
		PerspectiveCamera: class {
			lookAt = vi.fn();
			position = { set: vi.fn() };
		},
		SphereGeometry: Disposable,
		Scene: class {
			background: unknown;
			add = vi.fn();
		},
		WebGLRenderer: class {
			domElement = document.createElement("canvas");
			outputColorSpace: unknown;
			dispose = vi.fn();
			render = vi.fn();
			setClearColor = vi.fn();
			setPixelRatio = vi.fn();
			setSize = vi.fn();
			shadowMap = { enabled: false, type: undefined as unknown };
			toneMapping: unknown;
			toneMappingExposure = 1;

			constructor(...args: unknown[]) {
				threeSpies.WebGLRenderer(...args);
			}
		},
		SRGBColorSpace: "SRGBColorSpace",
	};
});

const boatBehaviour: Extract<ObjectBehaviour, { type: "vehicle" }> = {
	type: "vehicle",
	vehicleType: "boat",
	movementMode: "sail",
	allowedTerrainIds: ["water"],
	dismountAllowedTerrainIds: ["grass"],
	speedMultiplier: 1.5,
};

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

function makeObject(patch: Partial<ObjectInstance> = {}): ObjectInstance {
	return {
		areaId: "area_test",
		blocksMovement: true,
		id: "boat",
		objectDefinitionId: "boat_def",
		x: 1,
		y: 0,
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

function makeBoatProject(areaPatch: Partial<GameArea> = {}): GameProject {
	return makeProject({
		areas: [
			makeArea({
				objects: [makeObject()],
				terrainTiles: [
					{ x: 0, y: 0, tileId: "grass" },
					{ x: 1, y: 0, tileId: "water" },
					{ x: 2, y: 0, tileId: "water" },
					{ x: 0, y: 1, tileId: "grass" },
					{ x: 1, y: 1, tileId: "grass" },
					{ x: 2, y: 1, tileId: "grass" },
					{ x: 0, y: 2, tileId: "grass" },
					{ x: 1, y: 2, tileId: "grass" },
					{ x: 2, y: 2, tileId: "grass" },
				],
				...areaPatch,
			}),
		],
		objects: [
			{
				blocksMovement: true,
				category: "vehicle",
				defaultBehaviour: boatBehaviour,
				heightTiles: 1,
				id: "boat_def",
				name: "Boat",
				widthTiles: 1,
			},
		],
	});
}

beforeEach(() => {
	runtimeSpies.attemptPlayerMove.mockClear();
	runtimeSpies.createRuntimeSession.mockClear();
	runtimeSpies.dismountRuntimeVehicle.mockClear();
	runtimeSpies.runRuntimeObjectBehaviour.mockClear();
	phaserSpies.Game.mockClear();
	threeSpies.WebGLRenderer.mockClear();
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
		expect(screen.getByRole("button", { name: "Follow Player" })).toHaveClass(
			"active",
		);
		expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
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

	it("does not rebuild the Three scene for plain player movement", async () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const rendererCountAfterStartup =
			threeSpies.WebGLRenderer.mock.calls.length;

		fireEvent.keyDown(window, { key: "ArrowRight" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Moved to 1, 0.")).toBeInTheDocument();
		});
		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);
	});

	it("switches to inspect camera without rebuilding the Three scene or blocking gameplay", async () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const canvas = screen.getByLabelText("Three runtime viewport");
		const rendererCountAfterStartup =
			threeSpies.WebGLRenderer.mock.calls.length;

		fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
		expect(screen.getByRole("button", { name: "Inspect" })).toHaveClass(
			"active",
		);
		fireEvent.pointerDown(canvas, {
			altKey: true,
			button: 0,
			clientX: 120,
			clientY: 120,
		});
		fireEvent.pointerMove(canvas, {
			altKey: true,
			buttons: 1,
			clientX: 170,
			clientY: 90,
		});
		fireEvent.pointerUp(canvas, {
			altKey: true,
			button: 0,
			clientX: 170,
			clientY: 90,
		});
		fireEvent.wheel(canvas, { deltaY: -160 });

		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);

		fireEvent.keyDown(window, { key: "ArrowRight" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Moved to 1, 0.")).toBeInTheDocument();
		});
		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);
	});

	it("returns from inspect to follow without rebuilding the Three scene", async () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const rendererCountAfterStartup =
			threeSpies.WebGLRenderer.mock.calls.length;

		fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
		fireEvent.click(screen.getByRole("button", { name: "Follow Player" }));

		expect(screen.getByRole("button", { name: "Follow Player" })).toHaveClass(
			"active",
		);
		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);
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

	it("uses shared vehicle dismount instead of normal interaction while boarded", async () => {
		render(
			<ThreeRuntimePanel onRestart={vi.fn()} project={makeBoatProject()} />,
		);

		fireEvent.keyDown(window, { key: "e" });
		fireEvent.keyDown(window, { key: "ArrowRight" });
		await waitFor(() =>
			expect(screen.getByText("Pos: 1, 0")).toBeInTheDocument(),
		);
		runtimeSpies.dismountRuntimeVehicle.mockClear();
		runtimeSpies.runRuntimeObjectBehaviour.mockClear();

		fireEvent.keyDown(window, { key: "e" });

		await waitFor(() => {
			expect(runtimeSpies.dismountRuntimeVehicle).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Pos: 1, 1")).toBeInTheDocument();
			expect(screen.getByText("Dismounted.")).toBeInTheDocument();
		});
		expect(runtimeSpies.runRuntimeObjectBehaviour).not.toHaveBeenCalled();

		fireEvent.keyDown(window, { key: "ArrowUp" });
		await waitFor(() =>
			expect(screen.getByText("Blocked by object.")).toBeInTheDocument(),
		);
		expect(screen.getByText("Pos: 1, 1")).toBeInTheDocument();
	});

	it("keeps the player boarded when shared vehicle dismount fails", async () => {
		render(
			<ThreeRuntimePanel
				onRestart={vi.fn()}
				project={makeBoatProject({
					terrainTiles: [
						{ x: 0, y: 0, tileId: "water" },
						{ x: 1, y: 0, tileId: "water" },
						{ x: 2, y: 0, tileId: "water" },
						{ x: 0, y: 1, tileId: "water" },
						{ x: 1, y: 1, tileId: "water" },
						{ x: 2, y: 1, tileId: "water" },
						{ x: 0, y: 2, tileId: "water" },
						{ x: 1, y: 2, tileId: "water" },
						{ x: 2, y: 2, tileId: "water" },
					],
				})}
			/>,
		);

		fireEvent.keyDown(window, { key: "e" });
		fireEvent.keyDown(window, { key: "ArrowRight" });
		await waitFor(() =>
			expect(screen.getByText("Pos: 1, 0")).toBeInTheDocument(),
		);
		runtimeSpies.dismountRuntimeVehicle.mockClear();

		fireEvent.keyDown(window, { key: "Enter" });

		await waitFor(() => {
			expect(runtimeSpies.dismountRuntimeVehicle).toHaveBeenCalledTimes(1);
			expect(screen.getByText("No place to dismount.")).toBeInTheDocument();
		});
		expect(screen.getByText("Pos: 1, 0")).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "ArrowRight" });
		await waitFor(() =>
			expect(screen.getByText("Pos: 2, 0")).toBeInTheDocument(),
		);
	});

	it("delegates vehicle dismount to the shared helper", () => {
		expect(threeRuntimeSource).toContain("dismountRuntimeVehicle");
		expect(threeRuntimeSource).not.toContain("findDismountTile");
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
