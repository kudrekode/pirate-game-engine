import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import { cloneProject } from "../../data/migrateProject";
import { useProjectStore } from "../../store/useProjectStore";
import { CameraEditor } from "./CameraEditor";

beforeEach(() => {
	useProjectStore.getState().setProject(cloneProject(defaultProject));
});

describe("CameraEditor", () => {
	it("edits authored Three runtime camera settings without changing Phaser viewport settings", () => {
		render(<CameraEditor />);

		expect(screen.getByText("3D runtime camera")).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Follow style"), {
			target: { value: "thirdPerson" },
		});
		fireEvent.change(screen.getByLabelText("Distance"), {
			target: { value: "11" },
		});
		fireEvent.change(screen.getByLabelText("Pitch degrees"), {
			target: { value: "32" },
		});
		fireEvent.click(
			screen.getByLabelText("Allow runtime orbit in third-person follow"),
		);

		const camera = useProjectStore.getState().project.camera;
		expect(camera.viewportWidthTiles).toBe(
			defaultProject.camera.viewportWidthTiles,
		);
		expect(camera.viewportHeightTiles).toBe(
			defaultProject.camera.viewportHeightTiles,
		);
		expect(camera.three).toMatchObject({
			style: "thirdPerson",
			distance: 11,
			pitchDegrees: 32,
			allowRuntimeOrbit: false,
		});
	});
});
