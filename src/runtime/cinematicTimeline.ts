import { isEmbeddedCinematicAudio } from "../data/cinematicAudioImport";
import type {
	CinematicActorCue,
	CinematicAudioCue,
	CinematicSequence,
	CinematicSubtitleCue,
} from "../types/game";

export function isCinematicAudioUrl(value: string): boolean {
	if (value.startsWith("data:")) return isEmbeddedCinematicAudio(value);
	if (/[\\\s]/.test(value)) return false;
	if (value.startsWith("/")) return value.length > 1 && !value.startsWith("//");
	try {
		return new URL(value).protocol === "https:" && value.startsWith("https://");
	} catch {
		return false;
	}
}

export function getCinematicDuration(sequence: CinematicSequence): number {
	let duration = sequence.shots.reduce(
		(total, shot) => total + shot.durationMs,
		0,
	);
	for (const cue of sequence.cues ?? [])
		duration = Math.max(duration, cue.startMs + cue.durationMs);
	return duration;
}

type ActiveActorCue = { cue: CinematicActorCue; index: number };

export type CinematicCueFrame = {
	actors: Map<string, ActiveActorCue>;
	subtitle?: CinematicSubtitleCue;
	audio?: CinematicAudioCue;
};

/** Each track uses its latest active cue, with array order breaking ties. */
export function sampleCinematicCues(
	sequence: CinematicSequence,
	elapsedMs: number,
): CinematicCueFrame {
	const frame: CinematicCueFrame = { actors: new Map() };
	sequence.cues?.forEach((cue, index) => {
		if (elapsedMs < cue.startMs || elapsedMs >= cue.startMs + cue.durationMs)
			return;
		if (cue.type === "actor") {
			const active = frame.actors.get(cue.actorId);
			if (!active || cue.startMs >= active.cue.startMs)
				frame.actors.set(cue.actorId, { cue, index });
		} else if (cue.type === "subtitle") {
			if (!frame.subtitle || cue.startMs >= frame.subtitle.startMs)
				frame.subtitle = cue;
		} else if (!frame.audio || cue.startMs >= frame.audio.startMs) {
			frame.audio = cue;
		}
	});
	return frame;
}
