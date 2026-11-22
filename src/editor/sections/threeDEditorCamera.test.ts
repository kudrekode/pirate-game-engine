import { describe, expect, it } from "vitest";
import {
	getOrbitCameraPosition,
	type OrbitCameraState,
} from "../../runtime/three/cameraControls";
import {
	moveEditorFlyCamera,
	rotateEditorFlyCamera,
} from "./threeDEditorCamera";

const camera: OrbitCameraState = {
	distance: 8,
	focus: { x: 0, y: 0, z: 0 },
	pitch: 0,
	yaw: 0,
};

describe("map editor fly camera", () => {
	it("looks around from a fixed camera position and supports upward views", () => {
		const rotated = rotateEditorFlyCamera(camera, 300, -400, 1.5);
		const position = getOrbitCameraPosition(rotated);
		expect(position.x).toBeCloseTo(0);
		expect(position.y).toBeCloseTo(0);
		expect(position.z).toBeCloseTo(8);
		expect(rotated.focus.x).toBeGreaterThan(position.x);
		expect(rotated.focus.y).toBeGreaterThan(position.y);
		expect(rotated.pitch).toBe(-1.5);
	});

	it("flies along the current view and strafes at right angles", () => {
		const tilted = { ...camera, pitch: Math.PI / 6, yaw: Math.PI / 2 };
		const forward = moveEditorFlyCamera(
			tilted,
			{ forward: 1, right: 0, up: 0 },
			2,
		);
		expect(forward.focus.x).toBeCloseTo(-Math.sqrt(3));
		expect(forward.focus.y).toBeCloseTo(-1);
		expect(forward.focus.z).toBeCloseTo(0);
		const strafe = moveEditorFlyCamera(
			tilted,
			{ forward: 0, right: 1, up: 0 },
			2,
		);
		expect(strafe.focus.x).toBeCloseTo(0);
		expect(strafe.focus.y).toBeCloseTo(0);
		expect(strafe.focus.z).toBeCloseTo(-2);
	});

	it("uses world vertical and maintains speed with simultaneous directions", () => {
		const up = moveEditorFlyCamera(camera, { forward: 0, right: 0, up: 1 }, 4);
		expect(up.focus).toEqual({ x: 0, y: 4, z: 0 });
		const diagonal = moveEditorFlyCamera(
			camera,
			{ forward: 1, right: 1, up: 1 },
			4,
		);
		expect(
			Math.hypot(diagonal.focus.x, diagonal.focus.y, diagonal.focus.z),
		).toBeCloseTo(4);
		expect(
			moveEditorFlyCamera(camera, { forward: 0, right: 0, up: 0 }, 4),
		).toBe(camera);
	});
});
