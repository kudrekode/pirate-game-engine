import { afterEach, expect, it, vi } from "vitest";
import type { CinematicAudioCue } from "../../types/game";
import { createCinematicAudioController } from "./cinematicAudio";

function mockAudio(playback = () => Promise.resolve()) {
	class AudioMock {
		url: string;
		volume = 1;
		currentTime = 0;
		paused = true;
		play = vi.fn(() => {
			this.paused = false;
			return playback();
		});
		pause = vi.fn(() => {
			this.paused = true;
		});
		removeAttribute = vi.fn();
		load = vi.fn();
		addEventListener =
			vi.fn<
				(
					type: string,
					listener: (event: { currentTarget: AudioMock }) => void,
				) => void
			>();
		removeEventListener = vi.fn();

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

it("fades one active player with timeline time and only repositions on an explicit seek", () => {
	const players = mockAudio();
	const controller = createCinematicAudioController();
	const fading = { ...voice, fadeInMs: 200, fadeOutMs: 400, volume: 0.8 };
	controller.sync(fading, 1000);
	const [player] = players;
	expect(player.volume).toBe(0);
	controller.sync(fading, 1100);
	expect(player.volume).toBe(0.4);
	expect(player.currentTime).toBe(0.5);
	controller.sync(fading, 1200, true);
	expect(player.volume).toBe(0.8);
	expect(player.currentTime).toBe(0.7);
	expect(player.play).toHaveBeenCalledOnce();
	controller.sync(fading, 1700);
	expect(player.volume).toBe(0.4);
	controller.sync(undefined, 0);
	expect(player.pause).toHaveBeenCalledOnce();
	controller.sync(fading, 1700);
	expect(players[1]).toMatchObject({ currentTime: 1.2, volume: 0.4 });
});

it("releases the player on a media error and ignores autoplay rejection after a stop", async () => {
	let rejectPlayback: (error: Error) => void = () => {};
	const players = mockAudio(
		() =>
			new Promise<void>((_resolve, reject) => {
				rejectPlayback = reject;
			}),
	);
	const onIssue = vi.fn();
	const controller = createCinematicAudioController(onIssue);
	controller.sync(voice, 1300);
	const [first] = players;
	const onError = first.addEventListener.mock.calls[0][1];
	onError({ currentTarget: first });
	expect(first.removeEventListener).toHaveBeenCalledWith("error", onError);
	expect(first.pause).toHaveBeenCalledOnce();
	expect(onIssue).toHaveBeenLastCalledWith(
		expect.stringContaining("could not play"),
	);
	controller.sync(voice, 1300, true);
	controller.sync(undefined, 0);
	onIssue.mockClear();
	rejectPlayback(new Error("Playback aborted"));
	await Promise.resolve();
	expect(onIssue).not.toHaveBeenCalled();
	expect(players[1].pause).toHaveBeenCalledOnce();
});
