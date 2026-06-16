import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { defaultProject } from "../data/defaultProject";
import { cloneProject } from "../data/migrateProject";
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
	it("renders from the 3D Preview tab", () => {
		render(<App />);

		fireEvent.click(screen.getByRole("button", { name: "3D Preview" }));

		expect(screen.getByRole("button", { name: "3D Preview" })).toHaveClass(
			"active",
		);
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
});
