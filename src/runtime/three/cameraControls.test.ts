import { describe, expect, it } from "vitest";
import {
	clampOrbitCameraState,
	createOrbitCameraState,
	getOrbitCameraBounds,
	getOrbitCameraLookTarget,
	getOrbitCameraPosition,
	panOrbitCamera,
	resetOrbitCameraState,
	rotateOrbitCamera,
	zoomOrbitCamera,
} from "./cameraControls";

const dimensions = { height: 12, width: 16 };

describe("Three orbit camera helpers", () => {
	it("orbits the camera around a stable focus target", () => {
		const bounds = getOrbitCameraBounds(dimensions);
		const initial = createOrbitCameraState("isometric", dimensions, {
			x: 2,
			y: 1,
			z: -3,
		});
		const rotated = rotateOrbitCamera(initial, 80, 0, bounds);

		expect(getOrbitCameraLookTarget(rotated)).toEqual(initial.focus);
		expect(getOrbitCameraPosition(rotated).x).not.toBeCloseTo(
			getOrbitCameraPosition(initial).x,
		);
		expect(rotated.distance).toBeCloseTo(initial.distance);
	});

	it("clamps pitch to avoid camera inversion", () => {
		const bounds = getOrbitCameraBounds(dimensions);
		const initial = createOrbitCameraState("isometric", dimensions);

		const high = rotateOrbitCamera(initial, 0, -10000, bounds);
		const low = rotateOrbitCamera(initial, 0, 10000, bounds);

		expect(high.pitch).toBe(bounds.maxPitch);
		expect(low.pitch).toBe(bounds.minPitch);
	});

	it("clamps zoom distance", () => {
		const bounds = getOrbitCameraBounds(dimensions);
		const initial = createOrbitCameraState("isometric", dimensions);

		const tooClose = zoomOrbitCamera(initial, -10000, bounds);
		const tooFar = zoomOrbitCamera(initial, 10000, bounds);

		expect(tooClose.distance).toBe(bounds.minDistance);
		expect(tooFar.distance).toBe(bounds.maxDistance);
	});

	it("resets to the default isometric camera state", () => {
		const initial = resetOrbitCameraState(dimensions);
		const explicit = createOrbitCameraState("isometric", dimensions);

		expect(initial).toEqual(explicit);
	});

	it("moves focus without changing orbit orientation", () => {
		const initial = createOrbitCameraState("low", dimensions);
		const panned = panOrbitCamera(initial, 120, -80);

		expect(panned.focus).not.toEqual(initial.focus);
		expect(panned.yaw).toBe(initial.yaw);
		expect(panned.pitch).toBe(initial.pitch);
		expect(panned.distance).toBe(initial.distance);
	});

	it("clamps arbitrary camera states safely", () => {
		const bounds = getOrbitCameraBounds(dimensions);
		const clamped = clampOrbitCameraState(
			{
				distance: 100000,
				focus: { x: 1, y: 2, z: 3 },
				pitch: Math.PI,
				yaw: 4,
			},
			bounds,
		);

		expect(clamped.distance).toBe(bounds.maxDistance);
		expect(clamped.pitch).toBe(bounds.maxPitch);
		expect(clamped.focus).toEqual({ x: 1, y: 2, z: 3 });
	});
});
