import { expect, it } from "vitest";
import type { CinematicSequence } from "../../types/game";
import { sampleCinematicCamera } from "./cinematicCamera";

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
