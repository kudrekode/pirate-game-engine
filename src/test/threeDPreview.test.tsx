import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
import { editorSections } from "../editor/sections";
import { ThreeDPreview } from "../editor/sections/ThreeDPreview";
import { useProjectStore } from "../store/useProjectStore";

vi.mock("../runtime/RuntimePanel", () => ({
	RuntimePanel: () => <div>Runtime mock</div>,
}));

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

	return {
		AmbientLight: class {},
		BoxGeometry: Disposable,
		Color: class {},
		CylinderGeometry: Disposable,
		DirectionalLight: class {
			position = { set: vi.fn() };
		},
		GridHelper: class {},
		Mesh: class {
			geometry: Disposable;
			material: Disposable;
			position = { set: vi.fn(), y: 0 };
			rotation = { y: 0 };
			userData: Record<string, unknown> = {};

			constructor(geometry: Disposable, material: Disposable) {
				this.geometry = geometry;
				this.material = material;
			}
		},
		MeshStandardMaterial: Disposable,
		PerspectiveCamera: class {
			aspect = 1;
			position = { set: vi.fn() };
			lookAt = vi.fn();
			updateProjectionMatrix = vi.fn();
		},
		Scene: class {
			background: unknown;
			add = vi.fn();
		},
		Raycaster: class {
			setFromCamera = vi.fn();
			intersectObjects = vi.fn(
				(objects: { userData: Record<string, unknown> }[]) => {
					const npc = objects.find(
						(object) =>
							(
								object.userData.selectionMetadata as
									| { entityType?: string }
									| undefined
							)?.entityType === "npc",
					);
					return npc ? [{ object: npc }] : [];
				},
			);
		},
		Vector2: class {
			x = 0;
			y = 0;
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

beforeEach(() => {
	useProjectStore.getState().setProject(cloneProject(defaultProject));
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

describe("ThreeDPreview", () => {
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
			screen.getByText("3D Preview is experimental and read-only."),
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
		expect(screen.getByLabelText("Show event blocks")).toBeInTheDocument();
		expect(screen.getByLabelText("3D preview viewport")).toBeInTheDocument();
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
			screen.getByText("3D Preview is experimental and read-only."),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Show event blocks")).toBeInTheDocument();
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

		fireEvent.click(screen.getByRole("button", { name: "Open in Map Editor" }));
		expect(onOpenInMapEditor).toHaveBeenCalledTimes(1);

		rectSpy.mockRestore();
	});
});
