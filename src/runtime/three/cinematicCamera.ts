import type { CinematicCamera, CinematicSequence } from "../../types/game";
import { advanceCameraFollowRig } from "./visualSmoothing";

export const DEFAULT_CINEMATIC_FOV = 55;

export function cinematicBlend(
	from: CinematicCamera,
	to: CinematicCamera,
	progress: number,
): CinematicCamera {
	const alpha = Math.min(1, Math.max(0, progress));
	return advanceCameraFollowRig(from, to, alpha * alpha * (3 - 2 * alpha));
}

/** A new shot starts with a cut. Camera moves within shots ease at both ends. */
export function sampleCinematicCamera(
	sequence: CinematicSequence,
	elapsedMs: number,
): CinematicCamera | undefined {
	return sampleCinematicShot(sequence, elapsedMs)?.camera;
}

export function sampleCinematicShot(
	sequence: CinematicSequence,
	elapsedMs: number,
	holdLast = false,
) {
	let remaining = Math.max(0, elapsedMs);
	for (const [index, shot] of sequence.shots.entries()) {
		if (
			remaining < shot.durationMs ||
			(holdLast && index === sequence.shots.length - 1)
		) {
			const progress = Math.min(1, remaining / shot.durationMs);
			const pose = !shot.to
				? shot.from
				: shot.ease === "linear"
					? advanceCameraFollowRig(shot.from, shot.to, progress)
					: cinematicBlend(shot.from, shot.to, progress);
			const offset = (
				point: CinematicCamera["position"],
				by: CinematicCamera["position"] | undefined,
			) =>
				by
					? { x: point.x + by.x, y: point.y + by.y, z: point.z + by.z }
					: point;
			return {
				shot,
				camera: {
					position: offset(pose.position, shot.positionOffset),
					lookAt: offset(pose.lookAt, shot.lookAtOffset),
				},
			};
		}
		remaining -= shot.durationMs;
	}
	return undefined;
}
