import { describe, expect, it } from "vitest";
import {
	advanceThirdPersonMouseLook,
	clampOrbitCameraState,
	createOrbitCameraState,
	createOrbitCameraStateFromView,
	createThirdPersonMouseLookState,
	getOrbitCameraBounds,
	getOrbitCameraLookTarget,
	getOrbitCameraPosition,
	getThirdPersonCameraRig,
	getThirdPersonMouseLookPitchDegrees,
	getThirdPersonMouseLookYawOffsetDegrees,
	panOrbitCamera,
	resetOrbitCameraState,
	resolveCameraRelativeGridDirection,
	rotateOrbitCamera,
	updateThirdPersonMouseLookTarget,
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

	it("changes orbit pitch on vertical drags within editor clamps", () => {
		const bounds = getOrbitCameraBounds(dimensions);
		const initial = createOrbitCameraState("isometric", dimensions);

		const raised = rotateOrbitCamera(initial, 0, -80, bounds);
		const lowered = rotateOrbitCamera(initial, 0, 80, bounds);

		expect(raised.pitch).toBeGreaterThan(initial.pitch);
		expect(lowered.pitch).toBeLessThan(initial.pitch);
		expect((bounds.minPitch * 180) / Math.PI).toBeLessThan(5);
		expect((bounds.maxPitch * 180) / Math.PI).toBeGreaterThan(85);
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

	it("derives orbit state from an existing camera view", () => {
		const bounds = getOrbitCameraBounds(dimensions);
		const original = createOrbitCameraState("isometric", dimensions, {
			x: -1,
			y: 0.5,
			z: 2,
		});
		const derived = createOrbitCameraStateFromView(
			getOrbitCameraPosition(original),
			getOrbitCameraLookTarget(original),
			bounds,
		);

		expect(derived.focus).toEqual(original.focus);
		expect(derived.distance).toBeCloseTo(original.distance);
		expect(derived.pitch).toBeCloseTo(original.pitch);
		expect(derived.yaw).toBeCloseTo(original.yaw);
		expect(getOrbitCameraPosition(derived)).toEqual(
			expect.objectContaining({
				x: expect.closeTo(getOrbitCameraPosition(original).x),
				y: expect.closeTo(getOrbitCameraPosition(original).y),
				z: expect.closeTo(getOrbitCameraPosition(original).z),
			}),
		);
	});

	it("moves focus without changing orbit orientation", () => {
		const initial = createOrbitCameraState("low", dimensions);
		const panned = panOrbitCamera(initial, 120, -80);

		expect(panned.focus).not.toEqual(initial.focus);
		expect(panned.yaw).toBe(initial.yaw);
		expect(panned.pitch).toBe(initial.pitch);
		expect(panned.distance).toBe(initial.distance);
	});

	it("derives a third-person camera rig from a player-centered target", () => {
		const rig = getThirdPersonCameraRig(
			{ x: 2, y: 1, z: -4 },
			{
				distance: 6,
				height: 1.5,
				lookAtHeight: 0.25,
				pitchDegrees: 0,
				yawDegrees: 0,
			},
		);

		expect(rig.lookAt).toEqual({ x: 2, y: 1.25, z: -4 });
		expect(rig.position).toEqual({ x: 2, y: 2.5, z: 2 });
	});

	it("applies third-person yaw and pitch to the follow position", () => {
		const rig = getThirdPersonCameraRig(
			{ x: 0, y: 0, z: 0 },
			{
				distance: 4,
				height: 1,
				lookAtHeight: 0,
				pitchDegrees: 30,
				yawDegrees: 90,
			},
		);

		expect(rig.position.x).toBeCloseTo(Math.cos(Math.PI / 6) * 4);
		expect(rig.position.y).toBeCloseTo(3);
		expect(rig.position.z).toBeCloseTo(0);
	});

	it("maps camera-relative input to grid directions at the default yaw", () => {
		expect(resolveCameraRelativeGridDirection({ x: 0, y: -1 }, 0)).toEqual({
			x: 0,
			y: -1,
		});
		expect(resolveCameraRelativeGridDirection({ x: 0, y: 1 }, 0)).toEqual({
			x: 0,
			y: 1,
		});
		expect(resolveCameraRelativeGridDirection({ x: -1, y: 0 }, 0)).toEqual({
			x: -1,
			y: 0,
		});
		expect(resolveCameraRelativeGridDirection({ x: 1, y: 0 }, 0)).toEqual({
			x: 1,
			y: 0,
		});
	});

	it("maps camera-relative input after a 90 degree orbit", () => {
		expect(resolveCameraRelativeGridDirection({ x: 0, y: -1 }, 90)).toEqual({
			x: -1,
			y: 0,
		});
		expect(resolveCameraRelativeGridDirection({ x: 0, y: 1 }, 90)).toEqual({
			x: 1,
			y: 0,
		});
		expect(resolveCameraRelativeGridDirection({ x: -1, y: 0 }, 90)).toEqual({
			x: 0,
			y: 1,
		});
		expect(resolveCameraRelativeGridDirection({ x: 1, y: 0 }, 90)).toEqual({
			x: 0,
			y: -1,
		});
	});

	it("snaps yaw boundaries deterministically using the grid convention", () => {
		expect(resolveCameraRelativeGridDirection({ x: 0, y: -1 }, 44)).toEqual({
			x: 0,
			y: -1,
		});
		expect(resolveCameraRelativeGridDirection({ x: 0, y: -1 }, 45)).toEqual({
			x: -1,
			y: 0,
		});
		expect(resolveCameraRelativeGridDirection({ x: 0, y: -1 }, -90)).toEqual({
			x: 1,
			y: 0,
		});
	});

	it("updates third-person mouse look yaw and pitch targets from pointer movement", () => {
		const look = updateThirdPersonMouseLookTarget(
			createThirdPersonMouseLookState(),
			100,
			-50,
			20,
			{
				pitchSensitivityDegrees: 0.2,
				yawSensitivityDegrees: 0.25,
			},
		);

		expect(look.targetYawOffsetDegrees).toBeCloseTo(25);
		expect(look.targetPitchOffsetDegrees).toBeCloseTo(10);
		expect(getThirdPersonMouseLookYawOffsetDegrees(look)).toBe(0);
		expect(getThirdPersonMouseLookPitchDegrees(20, look)).toBe(20);
	});

	it("clamps third-person mouse look pitch targets safely", () => {
		const high = updateThirdPersonMouseLookTarget(
			createThirdPersonMouseLookState(),
			0,
			-1000,
			18,
		);
		const low = updateThirdPersonMouseLookTarget(
			createThirdPersonMouseLookState(),
			0,
			1000,
			18,
		);

		expect(high.targetPitchOffsetDegrees).toBe(57);
		expect(low.targetPitchOffsetDegrees).toBe(-28);
	});

	it("smoothly advances third-person mouse look toward target offsets", () => {
		const look = createThirdPersonMouseLookState({
			targetPitchOffsetDegrees: 20,
			targetYawOffsetDegrees: 90,
		});
		const halfway = advanceThirdPersonMouseLook(look, 0.5);
		const complete = advanceThirdPersonMouseLook(look, 1);

		expect(halfway.currentPitchOffsetDegrees).toBe(10);
		expect(halfway.currentYawOffsetDegrees).toBe(45);
		expect(complete.currentPitchOffsetDegrees).toBe(20);
		expect(complete.currentYawOffsetDegrees).toBe(90);
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
