import type {
	CinematicCue,
	CinematicSequence,
	CinematicShot,
} from "../../types/game";

export function cinematicId(kind: "shot" | "cue") {
	return `${kind}-${crypto.randomUUID()}`;
}

export function getShotStart(sequence: CinematicSequence, index: number) {
	return sequence.shots
		.slice(0, index)
		.reduce((time, shot) => time + shot.durationMs, 0);
}

export function getStoryboardCueIndex(
	sequence: CinematicSequence,
	index: number,
	type: "subtitle" | "actor",
) {
	const shot = sequence.shots[index];
	const cues = sequence.cues ?? [];
	const bound = shot.id
		? cues.findIndex((cue) => cue.type === type && cue.shotId === shot.id)
		: -1;
	if (bound >= 0) return bound;
	const start = getShotStart(sequence, index);
	return cues.findIndex(
		(cue) =>
			cue.type === type &&
			!cue.shotId &&
			cue.startMs >= start &&
			cue.startMs < start + shot.durationMs,
	);
}

export function identifyStoryboard(
	sequence: CinematicSequence,
): CinematicSequence {
	const shots = sequence.shots.map((shot) =>
		shot.id ? shot : { ...shot, id: cinematicId("shot") },
	);
	const cues = sequence.cues?.map((cue) => {
		if (cue.id) return cue;
		let start = 0;
		const owner = shots.find((shot) => {
			const end = start + shot.durationMs;
			const within =
				cue.startMs >= start && cue.startMs + cue.durationMs <= end;
			start = end;
			return within;
		});
		return { ...cue, id: cinematicId("cue"), shotId: cue.shotId ?? owner?.id };
	});
	return { ...sequence, shots, cues };
}

/** Keeps relative timing for storyboard cues and absolute timing for independent tracks. */
export function replaceStoryboard(
	sequence: CinematicSequence,
	shots: CinematicShot[],
): CinematicSequence {
	const previous = new Map(
		sequence.shots.map((shot, index) => [shot.id, { shot, index }]),
	);
	const next = new Map(shots.map((shot, index) => [shot.id, { shot, index }]));
	const updated = { ...sequence, shots };
	const cues = sequence.cues?.flatMap((cue) => {
		if (!cue.shotId) return [cue];
		const before = previous.get(cue.shotId);
		const after = next.get(cue.shotId);
		if (!before) return [cue];
		if (!after) return [];
		const offset = cue.startMs - getShotStart(sequence, before.index);
		if (
			before.index === after.index &&
			offset >= 0 &&
			before.shot.durationMs === after.shot.durationMs &&
			getShotStart(updated, after.index) ===
				getShotStart(sequence, before.index)
		)
			return [cue];
		const localTime = Math.max(0, Math.min(offset, after.shot.durationMs - 1));
		const filledShot =
			offset === 0 && cue.durationMs === before.shot.durationMs;
		return [
			{
				...cue,
				startMs: getShotStart(updated, after.index) + localTime,
				durationMs: filledShot
					? after.shot.durationMs
					: Math.min(cue.durationMs, after.shot.durationMs - localTime),
			},
		];
	});
	return { ...updated, cues };
}

export function duplicateStoryboardShot(
	sequence: CinematicSequence,
	index: number,
) {
	const original = sequence.shots[index];
	const duplicate = { ...original, id: cinematicId("shot") };
	const shots = [...sequence.shots];
	shots.splice(index + 1, 0, duplicate);
	const updated = replaceStoryboard(sequence, shots);
	const copies = sequence.cues
		?.filter((cue) => cue.shotId === original.id)
		.map((cue) => ({
			...cue,
			id: cinematicId("cue"),
			shotId: duplicate.id,
			startMs: cue.startMs + original.durationMs,
		}));
	return copies?.length
		? { ...updated, cues: [...(updated.cues ?? []), ...copies] }
		: updated;
}

export function setStoryboardCue(
	sequence: CinematicSequence,
	index: number,
	type: "subtitle" | "actor",
	value: CinematicCue | undefined,
): CinematicSequence {
	const cues = [...(sequence.cues ?? [])];
	const cueIndex = getStoryboardCueIndex(sequence, index, type);
	if (value) {
		const existing = cues[cueIndex];
		const cue = {
			...value,
			id: existing?.id ?? cinematicId("cue"),
			shotId: sequence.shots[index].id,
		};
		if (existing) cues[cueIndex] = cue;
		else cues.push(cue);
	} else if (cueIndex >= 0) cues.splice(cueIndex, 1);
	return { ...sequence, cues };
}

export function estimateShotDuration(text: string, defaultMs: number) {
	const words = text.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(defaultMs, 750 + words * 380);
}
