import { describe, expect, it } from "vitest";
import {
	advanceThirdPersonMouseLook,
	createThirdPersonMouseLookState,
} from "./cameraControls";
import {
	advanceCameraFollowRig,
	advancePlayerYaw,
	advanceThirdPersonFocus,
	facingToYawRadians,
	getCameraFollowTarget,
	getFrameLerpAlpha,
	getVisualGridPosition,
	getVisualStateTargetPosition,
	gridPositionsEqual,
	resetVisualEntityState,
	settleVisualEntityState,
	startVisualGridMove,
	type VisualEntityState,
} from "./visualSmoothing";

describe("third-person turning and follow", () => {
	it("takes the short arc across wrap and smooths a reversal without snapping", () => {
		const yaw = advancePlayerYaw(Math.PI - 0.1, -Math.PI + 0.1, 16);
		expect(yaw).toBeGreaterThan(Math.PI - 0.1);
		expect(yaw).toBeLessThan(Math.PI + 0.1);
		const reversal = advancePlayerYaw(0, Math.PI, 16);
		expect(reversal).toBeGreaterThan(0);
		expect(reversal).toBeLessThan(Math.PI / 2);
		expect(advancePlayerYaw(1, 2, 0)).toBe(1);
	});

	it("turns faster during sprint, gently in air, and aligns an accepted attack promptly", () => {
		const walk = advancePlayerYaw(0, Math.PI / 2, 16);
		expect(
			advancePlayerYaw(0, Math.PI / 2, 16, { sprinting: true }),
		).toBeGreaterThan(walk);
		expect(
			advancePlayerYaw(0, Math.PI / 2, 16, { sprinting: true, airborne: true }),
		).toBeLessThan(walk);
		expect(
			advancePlayerYaw(0, Math.PI / 2, 100, { attacking: true }),
		).toBeGreaterThan(1.49);
	});

	it("has comparable turn, orbit and focus response at 30, 60 and 120 FPS", () => {
		const results = [30, 60, 120].map((fps) => {
			let yaw = 0;
			let look = createThirdPersonMouseLookState({
				targetYawOffsetDegrees: 90,
				targetPitchOffsetDegrees: 20,
			});
			let focus = {
				position: { x: 0, y: 0, z: 0 },
				lookAt: { x: 0, y: 0, z: 0 },
			};
			for (let i = 0; i < fps / 2; i++) {
				yaw = advancePlayerYaw(yaw, 2, 1000 / fps);
				look = advanceThirdPersonMouseLook(
					look,
					getFrameLerpAlpha(1000 / fps, 30),
				);
				focus = advanceThirdPersonFocus(
					focus,
					{ x: 4, y: 2, z: 6 },
					{ x: 4, y: 3, z: 6 },
					1000 / fps,
					9,
					9,
				);
			}
			return { yaw, focus, look };
		});
		for (const r of results.slice(1)) {
			expect(r.yaw).toBeCloseTo(results[0].yaw, 10);
			expect(r.look.currentYawOffsetDegrees).toBeCloseTo(
				results[0].look.currentYawOffsetDegrees,
				10,
			);
			expect(r.focus.position.y).toBeCloseTo(results[0].focus.position.y, 10);
			expect(r.focus.lookAt.x).toBeCloseTo(results[0].focus.lookAt.x, 10);
		}
	});

	it("initializes around restored support immediately, without old damping coordinates", () => {
		const anchor = { x: 100, y: 2.275, z: -80 };
		const look = { ...anchor, y: anchor.y + 0.3 };
		expect(advanceThirdPersonFocus(null, anchor, look, 16, 9, 9)).toEqual({
			position: anchor,
			lookAt: look,
		});
	});
});

describe("Three visual smoothing helpers", () => {
	it("interpolates presentation position while preserving a discrete target", () => {
		const visual = startVisualGridMove(
			resetVisualEntityState("area", { x: 0, y: 0 }),
			"area",
			{
				durationMs: 200,
				facing: { x: 1, y: 0 },
				from: { x: 0, y: 0 },
				to: { x: 1, y: 0 },
			},
			1000,
		);

		expect(getVisualStateTargetPosition(visual)).toEqual({ x: 1, y: 0 });
		expect(getVisualGridPosition(visual, 1100)).toMatchObject({
			done: false,
			position: { x: 0.5, y: 0 },
		});
	});

	it("continues cleanly from the current visual position when another move starts", () => {
		const first = startVisualGridMove(
			resetVisualEntityState("area", { x: 0, y: 0 }),
			"area",
			{
				durationMs: 200,
				facing: { x: 1, y: 0 },
				from: { x: 0, y: 0 },
				to: { x: 1, y: 0 },
			},
			1000,
		);
		const second = startVisualGridMove(
			first,
			"area",
			{
				durationMs: 200,
				facing: { x: 1, y: 0 },
				from: { x: 1, y: 0 },
				to: { x: 2, y: 0 },
			},
			1100,
		);

		expect(second.motion?.from).toEqual({ x: 0.5, y: 0 });
		expect(getVisualStateTargetPosition(second)).toEqual({ x: 2, y: 0 });
	});

	it("continues from the latest rendered position after an active motion settles for a frame", () => {
		const first = startVisualGridMove(
			resetVisualEntityState("area", { x: 0, y: 0 }),
			"area",
			{
				durationMs: 200,
				facing: { x: 1, y: 0 },
				from: { x: 0, y: 0 },
				to: { x: 1, y: 0 },
			},
			1000,
		);
		const renderedState = settleVisualEntityState(first, 1100);
		const second = startVisualGridMove(
			renderedState,
			"area",
			{
				durationMs: 200,
				facing: { x: 1, y: 0 },
				from: { x: 1, y: 0 },
				to: { x: 2, y: 0 },
			},
			1120,
		);

		expect(renderedState.motion).toBeDefined();
		expect(renderedState.position).toEqual({ x: 0.5, y: 0 });
		expect(second.motion?.from).toEqual({ x: 0.6, y: 0 });
		expect(getVisualStateTargetPosition(second)).toEqual({ x: 2, y: 0 });
	});

	it("snaps to a reset position for teleport or area transition presentation", () => {
		const moving = startVisualGridMove(
			resetVisualEntityState("area_a", { x: 0, y: 0 }),
			"area_a",
			{
				durationMs: 300,
				facing: { x: 0, y: 1 },
				from: { x: 0, y: 0 },
				to: { x: 1, y: 0 },
			},
			0,
		);
		const reset = resetVisualEntityState(
			"area_b",
			{ x: 4, y: 5 },
			moving.facing,
		);

		expect(getVisualGridPosition(reset, 150)).toEqual({
			done: true,
			position: { x: 4, y: 5 },
			progress: 1,
		});
		expect(reset.motion).toBeUndefined();
	});

	it("lets adapter code remove defeated or missing NPC visual state safely", () => {
		const npcVisuals = new Map<string, VisualEntityState>([
			["npc_alive", resetVisualEntityState("area", { x: 1, y: 1 })],
			["npc_defeated", resetVisualEntityState("area", { x: 2, y: 1 })],
		]);
		const visibleNpcIds = new Set(["npc_alive"]);

		for (const npcId of npcVisuals.keys()) {
			if (!visibleNpcIds.has(npcId)) {
				npcVisuals.delete(npcId);
			}
		}

		expect([...npcVisuals.keys()]).toEqual(["npc_alive"]);
	});

	it("settles completed interpolation back to a static visual state", () => {
		const visual = startVisualGridMove(
			resetVisualEntityState("area", { x: 0, y: 0 }),
			"area",
			{
				durationMs: 100,
				facing: { x: 0, y: 1 },
				from: { x: 0, y: 0 },
				to: { x: 0, y: 1 },
			},
			10,
		);

		const settled = settleVisualEntityState(visual, 110);

		expect(settled).toEqual({
			areaId: "area",
			facing: { x: 0, y: 1 },
			position: { x: 0, y: 1 },
		});
	});

	it("derives the camera follow target from the visual player world position", () => {
		const target = getCameraFollowTarget(
			{ x: 0.5, y: 1.25, z: -2 },
			{
				lookOffset: { x: 0, y: 0, z: 0 },
				offset: { x: 4, y: 6, z: 8 },
			},
		);

		expect(target).toEqual({
			lookAt: { x: 0.5, y: 1.25, z: -2 },
			position: { x: 4.5, y: 7.25, z: 6 },
		});
	});

	it("smoothly advances camera position and look target", () => {
		const alpha = getFrameLerpAlpha(16, 9);
		const next = advanceCameraFollowRig(
			{
				lookAt: { x: 0, y: 0, z: 0 },
				position: { x: 0, y: 4, z: 4 },
			},
			{
				lookAt: { x: 10, y: 0, z: 0 },
				position: { x: 10, y: 4, z: 4 },
			},
			alpha,
		);

		expect(alpha).toBeGreaterThan(0);
		expect(alpha).toBeLessThan(1);
		expect(next.position.x).toBeGreaterThan(0);
		expect(next.position.x).toBeLessThan(10);
		expect(next.lookAt.x).toBe(next.position.x);
	});

	it("maps grid facing to a Three yaw for a forward-negative-z marker", () => {
		expect(facingToYawRadians({ x: 0, y: -1 })).toBeCloseTo(0);
		expect(Math.abs(facingToYawRadians({ x: 0, y: 1 }))).toBeCloseTo(Math.PI);
		expect(facingToYawRadians({ x: 1, y: 0 })).toBeCloseTo(-Math.PI / 2);
		expect(gridPositionsEqual({ x: 1, y: 2 }, { x: 1.00001, y: 2 })).toBe(true);
	});
});
