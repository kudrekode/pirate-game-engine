import { expect, it } from "vitest";
import type { CinematicSequence } from "../../types/game";
import { sampleCinematicCamera, sampleCinematicShot } from "./cinematicCamera";

it("holds the opening pose, eases camera moves, cuts to the next shot and completes", () => {
	const pose = (x: number) => ({
		position: { x, y: 4, z: 7 },
		lookAt: { x, y: 2, z: 3 },
	});
	const sequence: CinematicSequence = {
		areaId: "merewatch",
		shots: [
			{ durationMs: 1000, from: pose(0), to: pose(8) },
			{ durationMs: 500, from: pose(12) },
		],
	};
	expect(sampleCinematicCamera(sequence, -100)).toEqual(pose(0));
	expect(sampleCinematicCamera(sequence, 250)).toEqual(pose(1.25));
	expect(sampleCinematicCamera(sequence, 500)).toEqual(pose(4));
	expect(sampleCinematicCamera(sequence, 1000)).toEqual(pose(12));
	expect(sampleCinematicCamera(sequence, 1499)).toEqual(pose(12));
	expect(sampleCinematicCamera(sequence, 1500)).toBeUndefined();
});

it("applies offsets and linear interpolation and holds the final keyframe under trailing audio", () => {
	const sequence: CinematicSequence = {
		areaId: "merewatch",
		shots: [
			{
				durationMs: 2000,
				from: { position: { x: 1, y: 2, z: 3 }, lookAt: { x: 3, y: 2, z: 4 } },
				to: { position: { x: 5, y: 4, z: 5 }, lookAt: { x: 7, y: 4, z: 8 } },
				ease: "linear",
				fov: 40,
				positionOffset: { x: 1, y: -1, z: 0 },
				lookAtOffset: { x: 0, y: 1, z: 0 },
			},
		],
	};
	expect(sampleCinematicShot(sequence, 500)).toMatchObject({
		shot: { fov: 40 },
		camera: {
			position: { x: 3, y: 1.5, z: 3.5 },
			lookAt: { x: 4, y: 3.5, z: 5 },
		},
	});
	expect(sampleCinematicShot(sequence, 2300, true)?.camera).toEqual({
		position: { x: 6, y: 3, z: 5 },
		lookAt: { x: 7, y: 5, z: 8 },
	});
});
