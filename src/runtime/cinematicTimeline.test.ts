import { expect, it } from "vitest";
import type { CinematicSequence } from "../types/game";
import {
	getCinematicDuration,
	isCinematicAudioUrl,
	sampleCinematicCues,
} from "./cinematicTimeline";

it("samples independent tracks, favors the latest overlapping cue and uses exclusive ends", () => {
	const sequence: CinematicSequence = {
		areaId: "well",
		shots: [
			{
				durationMs: 1200,
				from: {
					position: { x: 2, y: 4, z: 6 },
					lookAt: { x: 3, y: 2, z: 4 },
				},
			},
		],
		cues: [
			{ type: "subtitle", startMs: 0, durationMs: 1000, text: "Earlier" },
			{
				type: "subtitle",
				startMs: 500,
				durationMs: 900,
				text: "Reply",
				speaker: "A",
			},
			{
				type: "actor",
				startMs: 125,
				durationMs: 600,
				actorId: "a",
				animation: "interact",
			},
			{
				type: "actor",
				startMs: 125,
				durationMs: 100,
				actorId: "a",
				animation: "idle",
			},
			{
				type: "actor",
				startMs: 200,
				durationMs: 300,
				actorId: "b",
				face: { x: 1, z: 2 },
			},
			{
				type: "audio",
				startMs: 200,
				durationMs: 1400,
				url: "/voice.wav",
				offsetMs: 25,
			},
		],
	};
	expect(getCinematicDuration(sequence)).toBe(1600);
	expect(sampleCinematicCues(sequence, -1).actors.size).toBe(0);
	const overlap = sampleCinematicCues(sequence, 210);
	expect(overlap.actors.get("a")?.index).toBe(3);
	expect(overlap.actors.get("b")?.cue.face).toEqual({ x: 1, z: 2 });
	expect(overlap.audio).toBe(sequence.cues?.[5]);
	expect(sampleCinematicCues(sequence, 225).actors.get("a")?.index).toBe(2);
	expect(sampleCinematicCues(sequence, 500).subtitle?.speaker).toBe("A");
	expect(sampleCinematicCues(sequence, 1400).subtitle).toBeUndefined();
	expect(sampleCinematicCues(sequence, 1600).audio).toBeUndefined();
});

it("accepts only unambiguous web audio paths", () => {
	for (const url of ["/assets/voice.ogg", "https://example.com/voice.mp3"])
		expect(isCinematicAudioUrl(url)).toBe(true);
	for (const url of [
		"",
		"audio.wav",
		"//example.com/audio",
		"/\\example.com/audio",
		"/two words",
		"blob:file",
		"http://example.com/audio",
		"https://",
	])
		expect(isCinematicAudioUrl(url)).toBe(false);
});
