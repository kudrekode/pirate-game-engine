import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
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
import threeRuntimeSource from "./ThreeRuntimePanel.tsx?raw";
import { emitThreePerformanceDiagnosticsEvent } from "./threePerformanceDiagnostics";
import {
	clearThreeVisualAssetCacheForTests,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";
import { setThreeVisualAssetRegistryForTests } from "./threeVisualAssetRegistry";

const runtimeSpies = vi.hoisted(() => ({
	attemptPlayerMove: vi.fn(),
	createRuntimeSession: vi.fn(),
	sessionCreated: vi.fn(),
	tickRuntimeNpcs: vi.fn(),
	dismountRuntimeVehicle: vi.fn(),
	runRuntimeObjectBehaviour: vi.fn(),
}));

const phaserSpies = vi.hoisted(() => ({
	Game: vi.fn(),
}));

const threeSpies = vi.hoisted(() => ({
	WebGLRenderer: vi.fn(),
}));

// Presentation pixels/resources have focused tests and a real browser check;
// this mocked-renderer suite owns runtime input, state and scene lifetime.
vi.mock("./groundPresentation", () => ({
	createGroundPresentation: () => ({ apply: vi.fn(), dispose: vi.fn() }),
	createWorldEdgePresentation: () => [],
}));

vi.mock("../runtimeSession", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../runtimeSession")>();
	return {
		...actual,
		createRuntimeSession: (
			...args: Parameters<typeof actual.createRuntimeSession>
		) => {
			runtimeSpies.createRuntimeSession(...args);
			const session = actual.createRuntimeSession(...args);
			runtimeSpies.sessionCreated(session);
			return session;
		},
	};
});

vi.mock("../runtimeNpcTick", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../runtimeNpcTick")>();
	return {
		...actual,
		tickRuntimeNpcs: (...args: Parameters<typeof actual.tickRuntimeNpcs>) => {
			runtimeSpies.tickRuntimeNpcs(...args);
			return actual.tickRuntimeNpcs(...args);
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

	class BufferGeometry extends Disposable {
		computeBoundingSphere = vi.fn();
		setAttribute = vi.fn(() => this);
		setIndex = vi.fn(() => this);
	}

	class Float32BufferAttribute {
		constructor(
			public values: number[],
			public itemSize: number,
		) {}
	}

	class Object3D {
		children: Object3D[] = [];
		castShadow = false;
		position = { set: vi.fn() };
		receiveShadow = false;
		rotation = { y: 0 };
		scale = { setScalar: vi.fn() };
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

		clone() {
			const clone = new Object3D();
			clone.children = [...this.children];
			return clone;
		}
	}

	class Mesh {
		castShadow = false;
		geometry: Disposable;
		material: Disposable | Disposable[];
		position = { set: vi.fn() };
		receiveShadow = false;
		rotation = { y: 0 };
		scale = { setScalar: vi.fn() };
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
		BackSide: "BackSide",
		BoxGeometry: Disposable,
		BufferGeometry,
		ConeGeometry: Disposable,
		Color: class {},
		CylinderGeometry: Disposable,
		DirectionalLight: class {
			castShadow = false;
			position = { copy: vi.fn(), set: vi.fn() };
			shadow = {
				dispose: vi.fn(),
				camera: { far: 0, near: 0 },
				mapSize: { height: 0, set: vi.fn(), width: 0 },
			};
		},
		Fog: class {},
		Float32BufferAttribute,
		Group: Object3D,
		HemisphereLight: class {},
		MathUtils: { degToRad: (degrees: number) => (degrees * Math.PI) / 180 },
		Mesh,
		MeshBasicMaterial: Disposable,
		DoubleSide: 2,
		MeshStandardMaterial: Disposable,
		PCFShadowMap: "PCFShadowMap",
		PCFSoftShadowMap: "PCFSoftShadowMap",
		PerspectiveCamera: class {
			lookAt = vi.fn();
			position = { set: vi.fn() };
		},
		SphereGeometry: Disposable,
		Scene: class {
			background: unknown;
			add = vi.fn();
			remove = vi.fn();
		},
		ShaderMaterial: Disposable,
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
		Vector3: class {
			clone() {
				return this;
			}
			project() {
				return this;
			}
			constructor(
				public x = 0,
				public y = 0,
				public z = 0,
			) {}
		},
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
	clearThreeVisualAssetCacheForTests();
	vi.restoreAllMocks();
});

function runLatestAnimationFrame(): void {
	const calls = vi.mocked(window.requestAnimationFrame).mock.calls;
	const callback = calls[calls.length - 1]?.[0];
	callback?.(performance.now());
}

function getRuntimeDiagnosticsSnapshot() {
	const snapshot =
		window.__THREE_PERF_DIAGNOSTICS__?.getSnapshot("ThreeRuntimePanel");
	if (!snapshot) {
		throw new Error(
			"ThreeRuntimePanel diagnostics snapshot was not registered.",
		);
	}
	return snapshot;
}

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
		expect(screen.getByRole("button", { name: "Smooth terrain" })).toHaveClass(
			"active",
		);
		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(1);
		expect(getRuntimeDiagnosticsSnapshot().raf).toMatchObject({
			activeLoopCount: 1,
			loopCancelCount: 0,
			loopStartCount: 1,
		});
		fireEvent.click(screen.getByRole("button", { name: "Blocky terrain" }));
		expect(screen.getByRole("button", { name: "Blocky terrain" })).toHaveClass(
			"active",
		);
		fireEvent.click(screen.getByRole("button", { name: "Smooth terrain" }));
		expect(screen.getByRole("button", { name: "Smooth terrain" })).toHaveClass(
			"active",
		);
		expect(runtimeSpies.createRuntimeSession).toHaveBeenCalledTimes(1);
	});

	it("requests imported asset rendering for assigned object visuals", async () => {
		clearThreeVisualAssetCacheForTests();
		const restoreRegistry = setThreeVisualAssetRegistryForTests([
			{
				category: "object",
				id: "demo_object",
				kind: "glb",
				name: "Demo Object",
				url: "/assets/demo-object.glb",
			},
		]);
		const loadAsync = vi.fn(() => new Promise<never>(() => undefined));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));
		const project = makeProject({
			areas: [
				makeArea({
					objects: [makeObject({ id: "asset_object", x: 1, y: 1 })],
				}),
			],
			objects: [
				{
					blocksMovement: false,
					category: "misc",
					heightTiles: 1,
					id: "boat_def",
					name: "Asset Object",
					threeVisual: {
						assetId: "demo_object",
						mode: "asset",
						placeholderType: "genericObject",
					},
					widthTiles: 1,
				},
			],
		});

		try {
			render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

			await waitFor(() =>
				expect(loadAsync).toHaveBeenCalledWith("/assets/demo-object.glb"),
			);
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument();
			expect(runtimeSpies.createRuntimeSession).toHaveBeenCalledTimes(1);
		} finally {
			restoreLoader();
			restoreRegistry();
		}
	});

	it("requests player character assets through the shared renderer path", async () => {
		clearThreeVisualAssetCacheForTests();
		const restoreRegistry = setThreeVisualAssetRegistryForTests([
			{
				category: "character",
				id: "demo_player",
				kind: "glb",
				name: "Demo Player",
				url: "/assets/demo-player.glb",
			},
		]);
		const loadAsync = vi.fn(() => new Promise<never>(() => undefined));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));
		const project = makeProject();
		project.player = {
			...project.player,
			threeVisual: { assetId: "demo_player", mode: "asset" },
		};

		try {
			render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

			await waitFor(() =>
				expect(loadAsync).toHaveBeenCalledWith("/assets/demo-player.glb"),
			);
			expect(threeRuntimeSource).toContain("resolveThreeCharacterVisual");
			expect(threeRuntimeSource).toContain("createThreeVisualMarkerGroup(");
			expect(threeRuntimeSource).not.toContain("GLTFLoader");
		} finally {
			restoreLoader();
			restoreRegistry();
		}
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

	it("bridges held diagonal input to subcell session movement and clears it on blur", async () => {
		const project = makeProject();
		project.objects = [
			{
				id: "floor",
				name: "Floor",
				category: "prop",
				widthTiles: 1,
				heightTiles: 1,
				blocksMovement: false,
				threeVisual: { mode: "asset", assetId: "world-floor" },
			},
		];
		project.areas[0].objects = [
			{
				id: "floor",
				objectDefinitionId: "floor",
				areaId: project.areas[0].id,
				x: 2,
				y: 2,
			},
		];
		const saved = JSON.stringify(project);
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: () => new Promise<never>(() => undefined),
		}));
		const now = vi.spyOn(performance, "now").mockReturnValue(1000);
		try {
			render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);
			fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
			fireEvent.keyDown(window, { key: "ArrowDown", code: "ArrowDown" });
			expect(latestSession().playerPosition).toEqual({ x: 0, y: 0 });
			expect(latestSession().traversal?.position.x).toBeCloseTo(0.2);
			now.mockReturnValue(1100);
			await waitFor(() =>
				expect(latestSession().traversal?.position.y).toBeGreaterThan(0.1),
			);
			expect(latestSession().traversal?.position.x).toBeCloseTo(
				0.2 + 0.2 * Math.SQRT1_2,
			);
			fireEvent.blur(window);
			const resting = { ...latestSession().traversal?.position };
			now.mockReturnValue(2000);
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 40));
				runLatestAnimationFrame();
			});
			expect(latestSession().traversal?.position).toEqual(resting);
			expect(JSON.stringify(project)).toBe(saved);
		} finally {
			restoreLoader();
		}
	});

	it("presents inline messages, pauses movement, advances with E and closes with Escape", async () => {
		const project = makeProject();
		project.areas[0].objects.push({
			id: "sign",
			areaId: project.areas[0].id,
			objectDefinitionId: "sign",
			x: 0,
			y: 1,
			interaction: {
				type: "show_message",
				activationMode: "on_interact",
				prompt: "Read sign",
				lines: ["Harbour welcome", "Watch the tide"],
			},
		});
		const saved = JSON.stringify(project);
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);
		await waitFor(() =>
			expect(screen.getByText("E — Read sign")).toBeInTheDocument(),
		);
		fireEvent.keyDown(window, { key: "e" });
		expect(screen.getByRole("dialog")).toHaveTextContent("Harbour welcome");
		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(latestSession().playerPosition).toEqual({ x: 0, y: 0 });
		fireEvent.keyDown(window, { key: "e", repeat: true });
		expect(screen.getByRole("dialog")).toHaveTextContent("Harbour welcome");
		fireEvent.keyDown(window, { key: "e" });
		expect(screen.getByRole("dialog")).toHaveTextContent("Watch the tide");
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(JSON.stringify(project)).toBe(saved);
	});

	it("collects an authored prop through real interaction input without changing editor data", async () => {
		const project = makeProject();
		project.items = [
			{ id: "supplies", name: "Supplies", category: "misc", stackable: true },
		];
		project.areas[0].objects.push({
			id: "sack",
			objectDefinitionId: "sack",
			areaId: project.areas[0].id,
			x: 0,
			y: 1,
			interaction: {
				type: "collect_item",
				activationMode: "on_interact",
				itemId: "supplies",
				quantity: 2,
			},
		});
		const saved = JSON.stringify(project);
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);
		await waitFor(() =>
			expect(screen.getByText("E — Pick up Supplies")).toBeInTheDocument(),
		);
		fireEvent.keyDown(window, { key: "e" });
		expect(latestSession().runtimeState.inventory.items.supplies).toBe(2);
		expect(latestSession().project.areas[0].objects).toHaveLength(0);
		fireEvent.keyDown(window, { key: "e" });
		expect(latestSession().runtimeState.inventory.items.supplies).toBe(2);
		expect(JSON.stringify(project)).toBe(saved);
	});

	it("keeps fixed follow movement grid-relative", async () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		fireEvent.keyDown(window, { key: "w" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
		});
		expect(runtimeSpies.attemptPlayerMove.mock.calls[0]?.[1]).toEqual({
			x: 0,
			y: -1,
		});
	});

	it("uses camera-relative movement in third-person follow mode", async () => {
		const project = makeProject();
		project.camera.three = {
			...project.camera.three,
			style: "thirdPerson",
		};
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

		fireEvent.keyDown(window, { key: "w" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Moved to 0, 1.")).toBeInTheDocument();
		});
		expect(runtimeSpies.attemptPlayerMove.mock.calls[0]?.[1]).toEqual({
			x: 0,
			y: 1,
		});
	});

	it("uses activated third-person mouse look when resolving movement input", async () => {
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const project = makeProject();
		project.camera.three = {
			...project.camera.three,
			style: "thirdPerson",
		};
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const canvas = screen.getByLabelText("Three runtime viewport");
		fireEvent.pointerDown(canvas, { button: 0, clientX: 0, clientY: 120 });
		fireEvent.pointerMove(canvas, {
			clientX: 90 / 0.22,
			clientY: 120,
		});
		now += 1000;
		runLatestAnimationFrame();
		fireEvent.keyDown(window, { key: "w" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Moved to 1, 0.")).toBeInTheDocument();
		});
		expect(runtimeSpies.attemptPlayerMove.mock.calls[0]?.[1]).toEqual({
			x: 1,
			y: 0,
		});
	});

	it("does not use mouse look in fixed follow mode", async () => {
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const canvas = screen.getByLabelText("Three runtime viewport");
		fireEvent.pointerDown(canvas, { button: 0, clientX: 0, clientY: 120 });
		fireEvent.pointerMove(canvas, {
			clientX: 90 / 0.22,
			clientY: 120,
		});
		now += 1000;
		runLatestAnimationFrame();
		fireEvent.keyDown(window, { key: "w" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
		});
		expect(runtimeSpies.attemptPlayerMove.mock.calls[0]?.[1]).toEqual({
			x: 0,
			y: -1,
		});
	});

	it("keeps inspect mode movement grid-relative even with a third-person follow config", async () => {
		const project = makeProject();
		project.camera.three = {
			...project.camera.three,
			style: "thirdPerson",
		};
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

		fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
		fireEvent.keyDown(window, { key: "w" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
		});
		expect(runtimeSpies.attemptPlayerMove.mock.calls[0]?.[1]).toEqual({
			x: 0,
			y: -1,
		});
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
		const rafStartCountAfterStartup =
			getRuntimeDiagnosticsSnapshot().raf.loopStartCount;
		const rafCancelCountAfterStartup =
			getRuntimeDiagnosticsSnapshot().raf.loopCancelCount;

		fireEvent.keyDown(window, { key: "ArrowRight" });

		await waitFor(() => {
			expect(runtimeSpies.attemptPlayerMove).toHaveBeenCalledTimes(1);
			expect(screen.getByText("Moved to 1, 0.")).toBeInTheDocument();
		});
		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);
		expect(getRuntimeDiagnosticsSnapshot().raf.loopStartCount).toBe(
			rafStartCountAfterStartup,
		);
		expect(getRuntimeDiagnosticsSnapshot().raf.loopCancelCount).toBe(
			rafCancelCountAfterStartup,
		);
	});

	it("does not rebuild the Three scene for diagnostic-only asset events", async () => {
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={makeProject()} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const rendererCountAfterStartup =
			threeSpies.WebGLRenderer.mock.calls.length;

		emitThreePerformanceDiagnosticsEvent({
			definitionId: "cached_asset",
			status: "cache_hit",
		});

		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);
	});

	it("does not rebuild the Three scene for non-visual object state changes", async () => {
		const project = makeProject({
			areas: [
				makeArea({
					objects: [
						makeObject({ id: "chest", objectDefinitionId: "chest_def" }),
					],
				}),
			],
			items: [
				{
					category: "currency",
					id: "gold_coin",
					maxStack: 999,
					name: "Gold Coin",
					stackable: true,
				},
			],
			objects: [
				{
					blocksMovement: true,
					category: "container",
					defaultBehaviour: {
						contents: [{ itemId: "gold_coin", quantity: 1 }],
						once: true,
						type: "container",
					},
					heightTiles: 1,
					id: "chest_def",
					name: "Chest",
					widthTiles: 1,
				},
			],
		});
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const rendererCountAfterStartup =
			threeSpies.WebGLRenderer.mock.calls.length;

		fireEvent.keyDown(window, { key: "e" });

		await waitFor(() => {
			expect(runtimeSpies.runRuntimeObjectBehaviour).toHaveBeenCalledTimes(1);
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

	it("uses third-person follow mouse look as transient presentation state only", async () => {
		const project = makeProject();
		project.camera.three = {
			...project.camera.three,
			style: "thirdPerson",
			distance: 8,
			pitchDegrees: 24,
		};
		const projectBefore = JSON.stringify(project);
		render(<ThreeRuntimePanel onRestart={vi.fn()} project={project} />);

		await waitFor(() =>
			expect(
				screen.getByLabelText("Three runtime viewport"),
			).toBeInTheDocument(),
		);
		const canvas = screen.getByLabelText("Three runtime viewport");
		const rendererCountAfterStartup =
			threeSpies.WebGLRenderer.mock.calls.length;
		const rafStartCountAfterStartup =
			getRuntimeDiagnosticsSnapshot().raf.loopStartCount;
		const rafCancelCountAfterStartup =
			getRuntimeDiagnosticsSnapshot().raf.loopCancelCount;

		expect(screen.getByText("Camera - Third-person")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Recenter" }),
		).toBeInTheDocument();
		fireEvent.pointerDown(canvas, { button: 0, clientX: 120, clientY: 120 });
		fireEvent.pointerMove(canvas, {
			clientX: 180,
			clientY: 80,
		});
		fireEvent.wheel(canvas, { deltaY: -220 });
		fireEvent.keyDown(window, { key: "Escape" });
		fireEvent.click(screen.getByRole("button", { name: "Recenter" }));

		expect(JSON.stringify(project)).toBe(projectBefore);
		expect(threeSpies.WebGLRenderer).toHaveBeenCalledTimes(
			rendererCountAfterStartup,
		);
		expect(getRuntimeDiagnosticsSnapshot().raf.loopStartCount).toBe(
			rafStartCountAfterStartup,
		);
		expect(getRuntimeDiagnosticsSnapshot().raf.loopCancelCount).toBe(
			rafCancelCountAfterStartup,
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
		expect(threeRuntimeSource).toContain("createThreeVisualMarkerGroup");
		expect(threeRuntimeSource).not.toContain("GLTFLoader");
	});

	it("coalesces asset-load rebuilds and preserves cached imported resources", () => {
		expect(threeRuntimeSource).toContain("assetStateChangeQueued");
		expect(threeRuntimeSource).toContain(
			"disposeResources: !renderResult.usedAsset",
		);
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
		vi.spyOn(performance, "now").mockReturnValue(latestSession().nextMoveAt);
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
		vi.spyOn(performance, "now").mockReturnValue(latestSession().nextMoveAt);
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

function latestSession(): import("../runtimeSession").RuntimeSessionState {
	return runtimeSpies.sessionCreated.mock.calls.slice(-1)[0]![0];
}

function dialogueProject() {
	const project = makeProject();
	project.areas[0].eventBlocks = [
		{
			id: "speaker",
			name: "Speaker",
			x: 0,
			y: 0,
			kind: "trigger",
			tag: "",
			interaction: {
				type: "start_dialogue",
				dialogueId: "conversation",
				activationMode: "on_interact",
			},
		},
	];
	project.dialogues = [
		{
			id: "conversation",
			name: "Conversation",
			startNodeId: "hello",
			nodes: [
				{
					id: "hello",
					type: "text",
					text: "Welcome traveller",
					nextNodeId: "choice",
				},
				{
					id: "choice",
					type: "choice",
					text: "Choose a path",
					choices: [
						{ id: "accept", text: "Accept the offer", targetNodeId: "reward" },
						{
							id: "hidden",
							text: "Unavailable offer",
							targetNodeId: "reward",
							conditions: [{ type: "flag_is", flag: "hidden", value: true }],
						},
					],
				},
				{
					id: "reward",
					type: "end",
					text: "A deal is made",
					actions: [{ type: "set_flag", flag: "accepted", value: true }],
				},
			],
		},
	];
	return project;
}

describe("Three correctness boundaries", () => {
	it("shows dialogue, advances, filters choices, applies the selected node effect and resumes play", () => {
		render(
			<ThreeRuntimePanel project={dialogueProject()} onRestart={vi.fn()} />,
		);
		fireEvent.keyDown(window, { key: "e" });
		expect(screen.getByText("Welcome traveller")).toBeInTheDocument();
		fireEvent.keyDown(window, { key: "ArrowRight" });
		fireEvent.keyDown(window, { key: " ", code: "Space" });
		expect(latestSession().playerPosition).toEqual({ x: 0, y: 0 });
		expect(latestSession().nextAttackAt).toBe(0);
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("Choose a path")).toBeInTheDocument();
		expect(screen.queryByText("Unavailable offer")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Accept the offer" }));
		expect(screen.getByText("A deal is made")).toBeInTheDocument();
		expect(latestSession().runtimeState.flags.accepted).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "End conversation" }));
		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(latestSession().playerPosition).toEqual({ x: 1, y: 0 });
	});
	it("fails a missing dialogue safely without blocking movement", () => {
		const project = dialogueProject();
		project.dialogues = [];
		render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
		fireEvent.keyDown(window, { key: "e" });
		expect(screen.getByText(/Dialogue missing/)).toBeInTheDocument();
		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(latestSession().playerPosition).toEqual({ x: 1, y: 0 });
	});
	it("gates repeated keydowns by gameplay time without relying on RAF", () => {
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		render(<ThreeRuntimePanel project={makeProject()} onRestart={vi.fn()} />);
		fireEvent.keyDown(window, { key: "ArrowRight" });
		fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
		expect(latestSession().playerPosition).toEqual({ x: 1, y: 0 });
		now += 216;
		fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
		expect(latestSession().playerPosition).toEqual({ x: 2, y: 0 });
	});
	it.each([
		"cutscene",
		"ended",
		"shop",
	] as const)("blocks movement and attacks during %s", (blocked) => {
		const project = makeProject();
		project.cutscenes = [
			{ id: "intro", name: "Intro", text: "Wait", backgroundImageId: "" },
		];
		project.shops = [
			{ id: "store", name: "Store", currencyItemId: "coin", entries: [] },
		];
		project.progression =
			blocked === "cutscene"
				? [
						{
							id: "intro",
							action: { type: "play_cutscene", cutsceneId: "intro" },
						},
					]
				: blocked === "ended"
					? [{ id: "end", action: { type: "end_game" } }]
					: [];
		if (blocked === "shop")
			project.rules = [
				{
					id: "open",
					name: "Open",
					enabled: true,
					runPolicy: "always",
					trigger: { type: "on_game_start" },
					actions: [{ type: "open_shop", shopId: "store" }],
				},
			];
		render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
		fireEvent.keyDown(window, { key: " ", code: "Space" });
		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(latestSession().nextAttackAt).toBe(0);
		expect(latestSession().playerPosition).toEqual({ x: 0, y: 0 });
	});
	it("marks only the gameplay spawn area and grants its once-only quest reward", () => {
		const project = makeProject();
		const spawn = makeArea({
			id: "spawn",
			eventBlocks: [
				{
					id: "start",
					name: "Start",
					tag: "",
					kind: "spawn",
					x: 1,
					y: 1,
				},
			],
		});
		project.areas.push(spawn);
		project.items = [
			{ id: "coin", name: "Coin", category: "currency", stackable: true },
		];
		project.quests = ["area_test", "spawn"].map((areaId) => ({
			id: areaId,
			name: areaId,
			status: "active" as const,
			objectives: [
				{
					id: "visit",
					description: "Visit",
					condition: { type: "enter_area" as const, areaId },
				},
			],
			rewards: [
				{
					type: "item" as const,
					itemId: "coin",
					quantity: areaId === "spawn" ? 1 : 100,
				},
			],
		}));
		project.progression = [
			{
				id: "spawn",
				action: {
					type: "spawn_player",
					areaId: "spawn",
					eventBlockId: "start",
				},
			},
		];
		render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
		expect(latestSession().currentAreaId).toBe("spawn");
		expect(latestSession().runtimeQuestState.enteredAreaIds).toEqual(
			new Set(["spawn"]),
		);
		expect(latestSession().runtimeState.inventory.items.coin).toBe(1);
		expect(project.gameState.inventory).toEqual({});
	});
});

it("runs dialogue node cutscenes and cutscene-end rules before resuming the node", () => {
	const project = dialogueProject();
	project.cutscenes = [
		{ id: "effect", name: "Effect", text: "A vision", backgroundImageId: "" },
	];
	project.dialogues[0].nodes[0].actions = [
		{ type: "play_cutscene", cutsceneId: "effect" },
		{ type: "set_flag", flag: "after_vision", value: true },
	];
	project.rules = [
		{
			id: "after",
			name: "After",
			enabled: true,
			runPolicy: "always",
			trigger: { type: "on_cutscene_end", cutsceneId: "effect" },
			actions: [{ type: "set_flag", flag: "vision_ended", value: true }],
		},
	];
	render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
	fireEvent.keyDown(window, { key: "e" });
	expect(screen.getByText("A vision")).toBeInTheDocument();
	expect(screen.queryByText("Welcome traveller")).not.toBeInTheDocument();
	fireEvent.keyDown(window, { key: " ", code: "Space" });
	expect(latestSession().nextAttackAt).toBe(0);
	fireEvent.click(screen.getByRole("button", { name: "Continue" }));
	expect(screen.getByText("Welcome traveller")).toBeInTheDocument();
	expect(latestSession().runtimeState.flags).toMatchObject({
		vision_ended: true,
		after_vision: true,
	});
});

it.each([
	"missing-start",
	"missing-next",
	"no-choices",
])("safely leaves invalid dialogue path %s", (path) => {
	const project = dialogueProject();
	if (path === "missing-start") project.dialogues[0].startNodeId = "missing";
	if (path === "missing-next")
		project.dialogues[0].nodes = [
			{ id: "hello", type: "text", text: "Hello", nextNodeId: "missing" },
		];
	if (path === "no-choices")
		project.dialogues[0].nodes = [
			{ id: "hello", type: "choice", text: "Hello", choices: [] },
		];
	render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
	fireEvent.keyDown(window, { key: "e" });
	if (path !== "missing-start")
		fireEvent.click(
			screen.getByRole("button", {
				name: path === "missing-next" ? "Next" : "End conversation",
			}),
		);
	expect(latestSession().dialogue).toBeUndefined();
	fireEvent.keyDown(window, { key: "ArrowRight" });
	expect(latestSession().playerPosition).toEqual({ x: 1, y: 0 });
});

it("preserves attack cooldown after a shop modal closes", () => {
	let now = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const project = makeProject();
	project.shops = [
		{ id: "store", name: "Store", currencyItemId: "coin", entries: [] },
	];
	project.rules = [
		{
			id: "open",
			name: "Open",
			enabled: true,
			runPolicy: "always",
			trigger: { type: "on_game_start" },
			actions: [{ type: "open_shop", shopId: "store" }],
		},
	];
	render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	fireEvent.keyDown(window, { key: " ", code: "Space" });
	const deadline = latestSession().nextAttackAt;
	expect(deadline).toBeGreaterThan(now);
	now = deadline - 1;
	fireEvent.keyDown(window, { key: " ", code: "Space", repeat: true });
	expect(latestSession().nextAttackAt).toBe(deadline);
	now = deadline;
	fireEvent.keyDown(window, { key: " ", code: "Space", repeat: true });
	expect(latestSession().nextAttackAt).toBeGreaterThan(deadline);
});

it("waits for the startup cutscene before committing entry and accepting gameplay", () => {
	const project = makeProject();
	project.cutscenes = [
		{ id: "intro", name: "Intro", text: "Welcome", backgroundImageId: "" },
	];
	project.progression = [
		{ id: "intro", action: { type: "play_cutscene", cutsceneId: "intro" } },
	];
	render(<ThreeRuntimePanel project={project} onRestart={vi.fn()} />);
	expect(latestSession().startupPending).toBe(true);
	expect(latestSession().runtimeQuestState.enteredAreaIds.size).toBe(0);
	fireEvent.click(screen.getByRole("button", { name: "Continue" }));
	expect(latestSession().startupPending).toBe(false);
	expect(latestSession().runtimeQuestState.enteredAreaIds).toEqual(
		new Set(["area_test"]),
	);
	fireEvent.keyDown(window, { key: "ArrowRight" });
	expect(latestSession().playerPosition).toEqual({ x: 1, y: 0 });
});

it.each([
	"dialogue",
	"shop",
])("pauses NPC ticks during a %s modal and resumes after closing", (modal) => {
	const intervals = vi.spyOn(window, "setInterval");
	render(<ThreeRuntimePanel project={dialogueProject()} onRestart={vi.fn()} />);
	const tick = intervals.mock.calls.find(
		(call) => call[1] === 500,
	)![0] as () => void;
	if (modal === "dialogue") fireEvent.keyDown(window, { key: "e" });
	else latestSession().activeShopId = "store";
	runtimeSpies.tickRuntimeNpcs.mockClear();
	act(() => tick());
	expect(runtimeSpies.tickRuntimeNpcs).not.toHaveBeenCalled();
	if (modal === "dialogue") {
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		fireEvent.click(screen.getByRole("button", { name: "Accept the offer" }));
		fireEvent.click(screen.getByRole("button", { name: "End conversation" }));
	} else latestSession().activeShopId = undefined;
	act(() => tick());
	expect(runtimeSpies.tickRuntimeNpcs).toHaveBeenCalledTimes(1);
});
