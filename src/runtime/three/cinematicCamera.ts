import type { CinematicCamera, CinematicSequence } from "../../types/game";
import { advanceCameraFollowRig } from "./visualSmoothing";

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
	let remaining = Math.max(0, elapsedMs);
	for (const shot of sequence.shots) {
		if (remaining < shot.durationMs)
			return shot.to
				? cinematicBlend(shot.from, shot.to, remaining / shot.durationMs)
				: shot.from;
		remaining -= shot.durationMs;
	}
	return undefined;
}
