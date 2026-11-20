import { afterEach, expect, it, vi } from "vitest";
import type { CinematicAudioCue } from "../../types/game";
import { createCinematicAudioController } from "./cinematicAudio";

function mockAudio(playback = () => Promise.resolve()) {
	class AudioMock {
		url: string;
		volume = 1;
		currentTime = 0;
		play = vi.fn(playback);
		pause = vi.fn();
		removeAttribute = vi.fn();
		load = vi.fn();

		constructor(url: string) {
			this.url = url;
			players.push(this);
		}
	}
	const players: AudioMock[] = [];
	vi.stubGlobal("Audio", AudioMock);
	return players;
}

const voice: CinematicAudioCue = {
	type: "audio",
	startMs: 1000,
	durationMs: 900,
	url: "/audio/watch.ogg",
	volume: 0.35,
	offsetMs: 500,
};

afterEach(() => vi.unstubAllGlobals());

it("starts one sound at the timeline offset and releases it in a gap", () => {
	const players = mockAudio();
	const controller = createCinematicAudioController();
	controller.sync(undefined, 200);
	expect(players).toHaveLength(0);
	controller.sync(voice, 1200);
	controller.sync(voice, 1500);
	expect(players).toHaveLength(1);
	const [player] = players;
	expect(player).toMatchObject({
		url: voice.url,
		volume: voice.volume,
		currentTime: 0.7,
	});
	expect(player.play).toHaveBeenCalledOnce();
	controller.sync(undefined, 1900);
	expect(player.pause).toHaveBeenCalledOnce();
	expect(player.removeAttribute).toHaveBeenCalledWith("src");
	expect(player.load).toHaveBeenCalledOnce();
});

it("switches cues with the same source, handles denied playback and disposes safely", async () => {
	const players = mockAudio(() =>
		Promise.reject(new Error("Autoplay blocked")),
	);
	const controller = createCinematicAudioController();
	const next = { ...voice, startMs: 1400, volume: 0, offsetMs: undefined };
	controller.sync(voice, 1000);
	controller.sync(next, 1400);
	await Promise.resolve();
	controller.sync(next, 1500);
	expect(players).toHaveLength(2);
	expect(players[0].pause).toHaveBeenCalledOnce();
	expect(players[1]).toMatchObject({ currentTime: 0, volume: 0 });
	controller.dispose();
	controller.sync(voice, 1600);
	controller.dispose();
	expect(players[1].pause).toHaveBeenCalledOnce();
	expect(players[1].load).toHaveBeenCalledOnce();
	expect(players).toHaveLength(2);
});
