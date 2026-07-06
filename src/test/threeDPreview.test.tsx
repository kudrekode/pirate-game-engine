import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { getTerrainHeight } from "../data/terrainHeight";
import { editorSections } from "../editor/sections";
import { MapEditor } from "../editor/sections/MapEditor";
import {
	resolveTerrainBrushFootprint,
	resolveTerrainLine,
	resolveTerrainRectangle,
} from "../editor/sections/terrainBrush";
import { useProjectStore } from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({
	RuntimePanel: () => <div>Runtime mock</div>,
}));

vi.mock("../editor/sections/ThreeDPreview", async () => {
	const { useProjectStore } = await import("../store/useProjectStore");

	return {
		ThreeDPreview: ({
			placementInfo = { active: false },
			terrainHeightTool,
			terrainPaintTileId,
		}: {
			placementInfo?: { active: boolean; label?: string };
			terrainHeightTool?: string;
			terrainPaintTileId?: string;
		}) => {
			const selectFirstNpc = () => {
				const state = useProjectStore.getState();
				const area =
					state.project.areas.find(
						(candidate) => candidate.id === state.project.activeAreaId,
					) ?? state.project.areas[0];
				const npc = area?.npcs[0];
				if (area && npc) {
					state.setEditorSelection({
						type: "npc",
						areaId: area.id,
						id: npc.id,
					});
				}
			};
			const helperText = terrainHeightTool
				? `Height tool: ${terrainHeightTool}. Click or drag terrain to sculpt.`
				: terrainPaintTileId
					? `Click terrain to paint selected terrain type: ${terrainPaintTileId}.`
					: placementInfo.active
						? `${placementInfo.label}. Click terrain to place.`
						: "No placeable selected.";

			return (
				<section aria-label="3D preview viewport">
					<p>{helperText}</p>
					<canvas onPointerUp={selectFirstNpc} />
				</section>
			);
		},
	};
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
	OrbitControls: class {
		enableDamping = false;
		enablePan = false;
		enableZoom = false;
		maxDistance = 0;
		minDistance = 0;
		target = { set: vi.fn() };
		dispose = vi.fn();
		update = vi.fn();
	},
}));

vi.mock("three", () => {
	class Disposable {
		dispose = vi.fn();
	}

	class Object3D {
		castShadow = false;
		children: Object3D[] = [];
		parent: Object3D | null = null;
		position = { set: vi.fn(), y: 0 };
		receiveShadow = false;
		rotation = { y: 0 };
		scale = { setScalar: vi.fn() };
		userData: Record<string, unknown> = {};
		updateMatrixWorld = vi.fn();

		add = vi.fn((...children: Object3D[]) => {
			children.forEach((child) => {
				child.parent = this;
			});
			this.children.push(...children);
		});

		traverse(callback: (child: Object3D) => void) {
			callback(this);
			this.children.forEach((child) => {
				child.traverse(callback);
			});
		}
	}

	class Mesh extends Object3D {
		geometry: Disposable;
		material: Disposable;

		constructor(geometry: Disposable, material: Disposable) {
			super();
			this.geometry = geometry;
			this.material = material;
		}
	}

	return {
		ACESFilmicToneMapping: "ACESFilmicToneMapping",
		AmbientLight: class {},
		BoxGeometry: Disposable,
		Color: class {},
		ConeGeometry: Disposable,
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
		GridHelper: class {},
		Group: Object3D,
		HemisphereLight: class {},
		Mesh,
		MeshStandardMaterial: Disposable,
		PCFSoftShadowMap: "PCFSoftShadowMap",
		Plane: class {},
		PerspectiveCamera: class {
			aspect = 1;
			position = { set: vi.fn() };
			lookAt = vi.fn();
			updateMatrixWorld = vi.fn();
			updateProjectionMatrix = vi.fn();
		},
		Scene: class {
			background: unknown;
			add = vi.fn();
			remove = vi.fn();
			updateMatrixWorld = vi.fn();
		},
		Raycaster: class {
			pointer = { x: 0, y: 0 };
			ray = {
				intersectPlane: vi.fn(
					(_plane: unknown, target: { x: number; z: number }) => {
						target.x = 0;
						target.z = 0;
						return target;
					},
				),
			};
			setFromCamera = vi.fn((pointer: { x: number; y: number }) => {
				this.pointer = { x: pointer.x, y: pointer.y };
			});
			intersectObjects = vi.fn(
				(objects: { userData: Record<string, unknown> }[]) => {
					const point = {
						x: Math.round(this.pointer.x),
						y: 1,
						z: Math.round(-this.pointer.y),
					};
					const npc = objects.find(
						(object) =>
							(
								object.userData.selectionMetadata as
									| { entityType?: string }
									| undefined
							)?.entityType === "npc",
					);
					if (npc) {
						return [{ object: npc, point }];
					}
					const terrain = objects.find(
						(object) =>
							(
								object.userData.selectionMetadata as
									| { entityType?: string }
									| undefined
							)?.entityType === "terrain",
					);
					return terrain ? [{ object: terrain, point }] : [];
				},
			);
		},
		Vector2: class {
			x = 0;
			y = 0;
		},
		Vector3: class {
			x = 0;
			y = 0;
			z = 0;

			constructor(x = 0, y = 0, z = 0) {
				this.x = x;
				this.y = y;
				this.z = z;
			}
		},
		SphereGeometry: Disposable,
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
		},
		SRGBColorSpace: "SRGBColorSpace",
	};
});

const { ThreeDPreview } = await vi.importActual<
	typeof import("../editor/sections/ThreeDPreview")
>("../editor/sections/ThreeDPreview");

function getButtonByText(container: HTMLElement, label: string) {
	const button = Array.from(container.querySelectorAll("button")).find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	expect(button).toBeDefined();
	return button as HTMLButtonElement;
}

function mockPreviewCanvasRect() {
	return vi
		.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
		.mockReturnValue({
			bottom: 240,
			height: 240,
			left: 0,
			right: 320,
			toJSON: () => ({}),
			top: 0,
			width: 320,
			x: 0,
			y: 0,
		});
}

function getPreviewCanvas() {
	const canvas = screen
		.getByLabelText("3D preview viewport")
		.querySelector("canvas");
	expect(canvas).not.toBeNull();
	return canvas as HTMLCanvasElement;
}

function makeThreeTileProject({ withTerrain = true } = {}) {
	const project = cloneProject(defaultProject);
	const area = project.areas[0];
	const width = 3;
	const height = 3;
	project.activeAreaId = area.id;
	project.areas = [
		{
			...area,
			eventBlocks: [],
			height,
			npcs: [],
			objects: [],
			overlayTiles: [],
			pickups: [],
			structures: [],
			terrainHeights: [],
			terrainTiles: withTerrain
				? Array.from({ length: height }).flatMap((_, y) =>
						Array.from({ length: width }).map((__, x) => ({
							tileId: "grass",
							x,
							y,
						})),
					)
				: [],
			width,
		},
	];
	return project;
}

function readActiveTileId(x: number, y: number) {
	const state = useProjectStore.getState();
	const area =
		state.project.areas.find(
			(candidate) => candidate.id === state.project.activeAreaId,
		) ?? state.project.areas[0];
	return area?.terrainTiles.find((tile) => tile.x === x && tile.y === y)
		?.tileId;
}

function readActiveTerrainHeight(x: number, y: number) {
	const state = useProjectStore.getState();
	const area =
		state.project.areas.find(
			(candidate) => candidate.id === state.project.activeAreaId,
		) ?? state.project.areas[0];
	return area ? getTerrainHeight(area, x, y) : 0;
}

function spyOnSetTiles() {
	const setTilesSpy = vi.spyOn(useProjectStore.getState(), "setTiles");
	setTilesSpy.mockClear();
	return setTilesSpy;
}

function spyOnSetTerrainHeights() {
	const setTerrainHeightsSpy = vi.spyOn(
		useProjectStore.getState(),
		"setTerrainHeights",
	);
	setTerrainHeightsSpy.mockClear();
	return setTerrainHeightsSpy;
}

beforeEach(() => {
	useProjectStore.getState().setProject(cloneProject(defaultProject));
	useProjectStore.getState().setMapPaletteSelection({ type: "none" });
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ThreeDPreview", () => {
	it("renders the Map workspace with a 2D/3D view toggle", () => {
		const { container } = render(<MapEditor />);

		expect(getButtonByText(container, "2D View")).toHaveClass("selected");
		expect(container).toHaveTextContent("View: 2D");
		expect(
			container.querySelector('[aria-label="Map editing canvas"]'),
		).not.toBeNull();

		fireEvent.click(getButtonByText(container, "3D View"));

		expect(getButtonByText(container, "3D View")).toHaveClass("selected");
		expect(container).toHaveTextContent("View: 3D");
		expect(
			container.querySelector('[aria-label="3D preview viewport"]'),
		).not.toBeNull();
	}, 15000);

	it("keeps entity placement status visible when switching to 3D view", () => {
		const { container } = render(<MapEditor />);

		const npcButton = screen.getByText("NPC").closest("button");
		expect(npcButton).not.toBeNull();
		fireEvent.click(npcButton as HTMLButtonElement);
		fireEvent.click(getButtonByText(container, "3D View"));

		expect(
			screen.getByText("Tool: Place NPC - Captain Mira"),
		).toBeInTheDocument();
		expect(npcButton).toHaveClass("selected");

		fireEvent.click(getButtonByText(container, "2D View"));
		expect(
			screen.getByText("Tool: Place NPC - Captain Mira"),
		).toBeInTheDocument();
		expect(npcButton).toHaveClass("selected");
	}, 15000);

	it("selecting in embedded 3D updates the shared inspector without leaving 3D view", async () => {
		const rectSpy = vi
			.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				bottom: 240,
				height: 240,
				left: 0,
				right: 320,
				toJSON: () => ({}),
				top: 0,
				width: 320,
				x: 0,
				y: 0,
			});
		const { container } = render(<MapEditor />);
		fireEvent.click(getButtonByText(container, "3D View"));

		const canvas = container
			.querySelector('[aria-label="3D preview viewport"]')
			?.querySelector("canvas");
		expect(canvas).not.toBeNull();
		fireEvent.pointerDown(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});
		fireEvent.pointerUp(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});

		await waitFor(() =>
			expect(useProjectStore.getState().editorSelection).toMatchObject({
				type: "npc",
			}),
		);
		expect(getButtonByText(container, "3D View")).toHaveClass("selected");
		expect(screen.getByLabelText("Faction")).toBeInTheDocument();

		rectSpy.mockRestore();
	}, 15000);

	it("is registered as an editor tab and renders preview controls", () => {
		expect(editorSections).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "three-d-preview",
					label: "3D Preview",
				}),
			]),
		);

		render(<ThreeDPreview />);

		expect(
			screen.getByText(
				"3D Preview is experimental. Entity movement edits the current project; height tools sculpt the current area.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Top" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Isometric" })).toHaveClass(
			"active",
		);
		fireEvent.click(screen.getByRole("button", { name: "Low angle" }));
		expect(screen.getByRole("button", { name: "Low angle" })).toHaveClass(
			"active",
		);
		fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
		expect(screen.getByRole("button", { name: "Isometric" })).toHaveClass(
			"active",
		);
		expect(screen.getByLabelText("Event Blocks")).toBeInTheDocument();
		expect(screen.getByLabelText("3D preview viewport")).toBeInTheDocument();
	});

	it("keeps camera controls as presentation-only editor state", () => {
		render(<ThreeDPreview />);
		const canvas = screen
			.getByLabelText("3D preview viewport")
			.querySelector("canvas");
		expect(canvas).not.toBeNull();
		const projectBefore = JSON.stringify(useProjectStore.getState().project);

		fireEvent.wheel(canvas as HTMLCanvasElement, { deltaY: -300 });
		fireEvent.pointerDown(canvas as HTMLCanvasElement, {
			altKey: true,
			button: 0,
			clientX: 120,
			clientY: 120,
		});
		fireEvent.pointerMove(canvas as HTMLCanvasElement, {
			altKey: true,
			buttons: 1,
			clientX: 180,
			clientY: 80,
		});
		fireEvent.pointerUp(canvas as HTMLCanvasElement, {
			altKey: true,
			button: 0,
			clientX: 180,
			clientY: 80,
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));

		expect(JSON.stringify(useProjectStore.getState().project)).toBe(
			projectBefore,
		);
	});

	it("renders the empty details state when nothing is selected", () => {
		useProjectStore.getState().setEditorSelection(null);

		render(<ThreeDPreview />);

		expect(
			screen.getByText(
				"Click a tile, NPC, object, or marker in the 3D preview to inspect it.",
			),
		).toBeInTheDocument();
	});

	it("starts and stops the experimental 3D walk preview", () => {
		render(<ThreeDPreview />);

		fireEvent.click(
			screen.getByRole("button", { name: "Start 3D Walk Preview" }),
		);

		expect(
			screen.getAllByText("Experimental 3D walk preview — game logic disabled.")
				.length,
		).toBeGreaterThan(0);
		expect(
			screen.getByRole("button", { name: "Stop 3D Walk Preview" }),
		).toBeInTheDocument();
		expect(screen.getByText(/Walk preview at x/)).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "Escape" });

		expect(
			screen.getByRole("button", { name: "Start 3D Walk Preview" }),
		).toBeInTheDocument();
	});

	it("renders terrain details from shared selection", () => {
		useProjectStore.getState().setEditorSelection({
			areaId: "area_main",
			type: "terrain",
			x: 0,
			y: 0,
		});

		render(<ThreeDPreview />);

		expect(screen.getByText("Terrain 0, 0")).toBeInTheDocument();
		expect(screen.getByText("Tile ID")).toBeInTheDocument();
		expect(screen.getByText("grass")).toBeInTheDocument();
		expect(screen.getByText("Height")).toBeInTheDocument();
	});

	it("shows height sculpting controls in the 3D preview", () => {
		render(
			<ThreeDPreview embedded heightToolValue={2} terrainHeightTool="set" />,
		);

		expect(
			screen.getByText("Height tool: set. Click or drag terrain to sculpt."),
		).toBeInTheDocument();
		expect(screen.getByLabelText("3D preview viewport")).toBeInTheDocument();
	});

	it("paints selected terrain in 3D without resetting height", async () => {
		const rectSpy = vi
			.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				bottom: 240,
				height: 240,
				left: 0,
				right: 320,
				toJSON: () => ({}),
				top: 0,
				width: 320,
				x: 0,
				y: 0,
			});
		const project = cloneProject(defaultProject);
		const area =
			project.areas.find(
				(candidate) => candidate.id === project.activeAreaId,
			) ?? project.areas[0];
		const target = {
			x: Math.round((area.width - 1) / 2),
			y: Math.round((area.height - 1) / 2),
		};
		area.terrainHeights = [{ ...target, height: 3 }];
		useProjectStore.getState().setProject(project);
		render(<ThreeDPreview embedded terrainPaintTileId="sand" />);

		expect(
			screen.getByText("Click terrain to paint selected terrain type: sand."),
		).toBeInTheDocument();

		const canvas = screen
			.getByLabelText("3D preview viewport")
			.querySelector("canvas");
		expect(canvas).not.toBeNull();
		fireEvent.pointerMove(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});
		fireEvent.pointerDown(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});
		fireEvent.pointerUp(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});

		await waitFor(() => {
			const nextArea =
				useProjectStore
					.getState()
					.project.areas.find(
						(candidate) => candidate.id === project.activeAreaId,
					) ?? useProjectStore.getState().project.areas[0];
			expect(
				nextArea.terrainTiles.find(
					(tile) => tile.x === target.x && tile.y === target.y,
				)?.tileId,
			).toBe("sand");
			expect(
				nextArea.terrainHeights?.find(
					(tile) => tile.x === target.x && tile.y === target.y,
				)?.height,
			).toBe(3);
		});

		rectSpy.mockRestore();
	});

	it("drag-paints newly entered 3D terrain tiles without duplicate tile updates", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();

		render(<ThreeDPreview embedded terrainPaintTileId="sand" />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 7,
		});
		await waitFor(() => expect(readActiveTileId(1, 1)).toBe("sand"));

		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 160,
			clientY: 120,
			pointerId: 7,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 7,
		});
		await waitFor(() => expect(readActiveTileId(2, 1)).toBe("sand"));

		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 7,
		});
		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 320,
			clientY: 120,
			pointerId: 7,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 0,
			clientY: 120,
			pointerId: 7,
		});

		expect(readActiveTileId(0, 1)).toBe("grass");
		expect(setTilesSpy).toHaveBeenCalledTimes(2);
		expect(setTilesSpy.mock.calls.map(([tiles]) => tiles)).toEqual([
			[{ tileId: "sand", x: 1, y: 1 }],
			[{ tileId: "sand", x: 2, y: 1 }],
		]);
	});

	it("applies the selected 3D paint brush footprint", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();
		const expectedCells = resolveTerrainBrushFootprint({
			bounds: { height: 3, width: 3 },
			center: { x: 1, y: 1 },
			shape: "circle",
			size: 3,
		});

		render(
			<ThreeDPreview
				brushShape="circle"
				brushSize={3}
				embedded
				terrainPaintTileId="sand"
			/>,
		);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 17,
		});

		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTileId(cell.x, cell.y)).toBe("sand");
			});
		});
		expect(readActiveTileId(0, 0)).toBe("grass");
		expect(readActiveTileId(2, 2)).toBe("grass");
		expect(setTilesSpy).toHaveBeenCalledWith(
			expectedCells.map((cell) => ({ ...cell, tileId: "sand" })),
		);
	});

	it("applies 3D height brushes to the resolved footprint", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const expectedCells = resolveTerrainBrushFootprint({
			bounds: { height: 3, width: 3 },
			center: { x: 1, y: 1 },
			shape: "circle",
			size: 3,
		});

		const { rerender } = render(
			<ThreeDPreview
				brushShape="circle"
				brushSize={3}
				embedded
				terrainHeightTool="raise"
			/>,
		);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 18,
		});
		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTerrainHeight(cell.x, cell.y)).toBe(1);
			});
		});
		expect(readActiveTerrainHeight(0, 0)).toBe(0);

		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 18,
		});
		rerender(
			<ThreeDPreview
				brushShape="circle"
				brushSize={3}
				embedded
				terrainHeightTool="lower"
			/>,
		);
		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 19,
		});
		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTerrainHeight(cell.x, cell.y)).toBe(0);
			});
		});

		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 19,
		});
		rerender(
			<ThreeDPreview
				brushShape="circle"
				brushSize={3}
				embedded
				terrainHeightTool="set"
				heightToolValue={2}
			/>,
		);
		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 20,
		});
		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTerrainHeight(cell.x, cell.y)).toBe(2);
			});
		});

		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 20,
		});
		rerender(
			<ThreeDPreview
				brushShape="circle"
				brushSize={3}
				embedded
				terrainHeightTool="flatten"
			/>,
		);
		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 21,
		});
		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTerrainHeight(cell.x, cell.y)).toBe(0);
			});
		});
	});

	it("shows terrain brush preview without mutating project data", () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const projectBefore = JSON.stringify(useProjectStore.getState().project);

		render(
			<ThreeDPreview
				brushShape="circle"
				brushSize={3}
				embedded
				terrainPaintTileId="sand"
			/>,
		);

		fireEvent.pointerMove(getPreviewCanvas(), {
			clientX: 160,
			clientY: 120,
			pointerId: 22,
		});

		expect(JSON.stringify(useProjectStore.getState().project)).toBe(
			projectBefore,
		);
	});

	it("previews a 3D line without mutation and commits the same cells once", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();
		const projectBefore = JSON.stringify(useProjectStore.getState().project);
		const expectedCells = resolveTerrainLine({
			bounds: { height: 3, width: 3 },
			end: { x: 2, y: 1 },
			start: { x: 1, y: 1 },
		});

		render(
			<ThreeDPreview
				embedded
				terrainGesture="line"
				terrainPaintTileId="sand"
			/>,
		);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 23,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 23,
		});

		expect(JSON.stringify(useProjectStore.getState().project)).toBe(
			projectBefore,
		);

		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 320,
			clientY: 120,
			pointerId: 23,
		});

		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTileId(cell.x, cell.y)).toBe("sand");
			});
		});
		expect(setTilesSpy).toHaveBeenCalledTimes(1);
		expect(setTilesSpy).toHaveBeenCalledWith(
			expectedCells.map((cell) => ({ ...cell, tileId: "sand" })),
		);
	});

	it("commits a 3D rectangle as one batched terrain operation", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();
		const expectedCells = resolveTerrainRectangle({
			bounds: { height: 3, width: 3 },
			end: { x: 2, y: 1 },
			start: { x: 1, y: 1 },
		});

		render(
			<ThreeDPreview
				embedded
				terrainGesture="rectangle"
				terrainPaintTileId="sand"
			/>,
		);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 24,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 24,
		});
		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 320,
			clientY: 120,
			pointerId: 24,
		});

		await waitFor(() => {
			expectedCells.forEach((cell) => {
				expect(readActiveTileId(cell.x, cell.y)).toBe("sand");
			});
		});
		expect(setTilesSpy).toHaveBeenCalledTimes(1);
		expect(setTilesSpy).toHaveBeenCalledWith(
			expectedCells.map((cell) => ({ ...cell, tileId: "sand" })),
		);
	});

	it("previews and applies 3D fill from the same connected region", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();
		const projectBefore = JSON.stringify(useProjectStore.getState().project);

		render(
			<ThreeDPreview
				embedded
				terrainGesture="fill"
				terrainPaintTileId="sand"
			/>,
		);

		fireEvent.pointerMove(getPreviewCanvas(), {
			clientX: 160,
			clientY: 120,
			pointerId: 25,
		});

		expect(JSON.stringify(useProjectStore.getState().project)).toBe(
			projectBefore,
		);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 25,
		});

		await waitFor(() => {
			expect(setTilesSpy).toHaveBeenCalledTimes(1);
		});
		const appliedCells = setTilesSpy.mock.calls[0][0];
		expect(appliedCells).toHaveLength(9);
		appliedCells.forEach((cell) => {
			expect(readActiveTileId(cell.x, cell.y)).toBe("sand");
		});
	});

	it("routes 3D smooth height brushes through batched height updates", async () => {
		mockPreviewCanvasRect();
		const project = makeThreeTileProject();
		project.areas[0].terrainHeights = [{ height: 4, x: 1, y: 1 }];
		useProjectStore.getState().setProject(project);
		const setTerrainHeightsSpy = spyOnSetTerrainHeights();

		render(<ThreeDPreview embedded terrainHeightTool="smooth" />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 26,
		});

		await waitFor(() => {
			expect(readActiveTerrainHeight(1, 1)).toBe(3);
		});
		expect(setTerrainHeightsSpy).toHaveBeenCalledTimes(1);
		expect(setTerrainHeightsSpy).toHaveBeenCalledWith([
			{ height: 3, x: 1, y: 1 },
		]);
	});

	it("cancels a 3D shape gesture without applying terrain", () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();

		render(
			<ThreeDPreview
				embedded
				terrainGesture="line"
				terrainPaintTileId="sand"
			/>,
		);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 27,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 27,
		});
		fireEvent.pointerCancel(getPreviewCanvas(), {
			clientX: 320,
			clientY: 120,
			pointerId: 27,
		});
		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 320,
			clientY: 120,
			pointerId: 27,
		});

		expect(setTilesSpy).not.toHaveBeenCalled();
		expect(readActiveTileId(1, 1)).toBe("grass");
		expect(readActiveTileId(2, 1)).toBe("grass");
	});

	it.each([
		[
			"pointer leave",
			(canvas: HTMLCanvasElement) => {
				fireEvent.pointerLeave(canvas, {
					clientX: 160,
					clientY: 120,
					pointerId: 9,
				});
			},
		],
		[
			"pointer cancel",
			(canvas: HTMLCanvasElement) => {
				fireEvent.pointerCancel(canvas, {
					clientX: 160,
					clientY: 120,
					pointerId: 9,
				});
			},
		],
	] as const)("ends a 3D terrain paint stroke on %s", async (_label, endStroke) => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();

		render(<ThreeDPreview embedded terrainPaintTileId="sand" />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 9,
		});
		await waitFor(() => expect(readActiveTileId(1, 1)).toBe("sand"));

		endStroke(getPreviewCanvas());
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 9,
		});

		expect(readActiveTileId(2, 1)).toBe("grass");
		expect(setTilesSpy).toHaveBeenCalledTimes(1);
	});

	it("does not paint terrain for camera or non-primary pointer drags", () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();

		render(<ThreeDPreview embedded terrainPaintTileId="sand" />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			altKey: true,
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 3,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			altKey: true,
			buttons: 1,
			clientX: 240,
			clientY: 80,
			pointerId: 3,
		});
		fireEvent.pointerUp(getPreviewCanvas(), {
			altKey: true,
			button: 0,
			clientX: 240,
			clientY: 80,
			pointerId: 3,
		});
		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 1,
			clientX: 160,
			clientY: 120,
			pointerId: 4,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 4,
			clientX: 320,
			clientY: 120,
			pointerId: 4,
		});
		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 2,
			clientX: 160,
			clientY: 120,
			pointerId: 5,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 2,
			clientX: 320,
			clientY: 120,
			pointerId: 5,
		});

		expect(setTilesSpy).not.toHaveBeenCalled();
		expect(readActiveTileId(1, 1)).toBe("grass");
		expect(readActiveTileId(2, 1)).toBe("grass");
	});

	it("does not start terrain drag painting in selection mode", () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		const setTilesSpy = spyOnSetTiles();

		render(<ThreeDPreview embedded />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 12,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 12,
		});
		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 320,
			clientY: 120,
			pointerId: 12,
		});

		expect(setTilesSpy).not.toHaveBeenCalled();
		expect(readActiveTileId(2, 1)).toBe("grass");
	});

	it("does not let terrain drag painting take over entity placement mode", async () => {
		mockPreviewCanvasRect();
		useProjectStore.getState().setProject(makeThreeTileProject());
		useProjectStore.getState().setMapPaletteSelection({ type: "eventBlock" });
		const setTilesSpy = spyOnSetTiles();

		render(<ThreeDPreview embedded terrainPaintTileId="sand" />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 14,
		});
		fireEvent.pointerUp(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 14,
		});

		await waitFor(() => {
			const area = useProjectStore.getState().project.areas[0];
			expect(area.eventBlocks).toHaveLength(1);
		});
		expect(setTilesSpy).not.toHaveBeenCalled();
		expect(readActiveTileId(1, 1)).toBe("grass");
	});

	it("does not paint when terrain picking has no valid target", () => {
		mockPreviewCanvasRect();
		useProjectStore
			.getState()
			.setProject(makeThreeTileProject({ withTerrain: false }));
		const setTilesSpy = spyOnSetTiles();

		render(<ThreeDPreview embedded terrainPaintTileId="sand" />);

		fireEvent.pointerDown(getPreviewCanvas(), {
			button: 0,
			clientX: 160,
			clientY: 120,
			pointerId: 13,
		});
		fireEvent.pointerMove(getPreviewCanvas(), {
			buttons: 1,
			clientX: 320,
			clientY: 120,
			pointerId: 13,
		});

		expect(setTilesSpy).not.toHaveBeenCalled();
	});

	it("mounts against a blank project without crashing", () => {
		const blankProject = cloneProject(defaultProject);
		blankProject.areas = [];
		blankProject.npcs = [];
		blankProject.objects = [];
		blankProject.items = [];
		blankProject.shops = [];
		blankProject.quests = [];
		blankProject.rules = [];
		useProjectStore.getState().setProject(blankProject);

		render(<ThreeDPreview />);

		expect(
			screen.getByText(
				"3D Preview is experimental. Entity movement edits the current project; height tools sculpt the current area.",
			),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Event Blocks")).toBeInTheDocument();
		expect(screen.getByLabelText("3D preview viewport")).toBeInTheDocument();
	});

	it("clicking a 3D NPC marker selects it without navigating", async () => {
		const onOpenInMapEditor = vi.fn();
		const rectSpy = vi
			.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				bottom: 240,
				height: 240,
				left: 0,
				right: 320,
				toJSON: () => ({}),
				top: 0,
				width: 320,
				x: 0,
				y: 0,
			});
		render(<ThreeDPreview onOpenInMapEditor={onOpenInMapEditor} />);

		const canvas = screen
			.getByLabelText("3D preview viewport")
			.querySelector("canvas");
		expect(canvas).not.toBeNull();
		fireEvent.pointerDown(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});
		fireEvent.pointerUp(canvas as HTMLCanvasElement, {
			clientX: 160,
			clientY: 120,
		});

		await waitFor(() =>
			expect(useProjectStore.getState().editorSelection).toMatchObject({
				type: "npc",
			}),
		);
		expect(onOpenInMapEditor).not.toHaveBeenCalled();
		expect(screen.getAllByText("Captain Mira").length).toBeGreaterThan(0);
		expect(
			screen.getByText("Move mode: drag the selected marker to another tile."),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Open in Map Editor" }));
		expect(onOpenInMapEditor).toHaveBeenCalledTimes(1);

		rectSpy.mockRestore();
	});
});
