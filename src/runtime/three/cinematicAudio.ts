import type { CinematicAudioCue } from "../../types/game";

export function createCinematicAudioController() {
	let cue: CinematicAudioCue | undefined;
	let player: HTMLAudioElement | undefined;
	let disposed = false;

	function stop() {
		if (!player) return;
		player.pause();
		player.removeAttribute("src");
		player.load();
		player = undefined;
	}

	return {
		sync(next: CinematicAudioCue | undefined, elapsedMs: number) {
			if (disposed || next === cue) return;
			stop();
			cue = next;
			if (!cue) return;

			player = new Audio(cue.url);
			player.volume = cue.volume ?? 1;
			player.currentTime =
				((cue.offsetMs ?? 0) + Math.max(0, elapsedMs - cue.startMs)) / 1000;
			// Browser autoplay policy and media errors must leave the timeline running.
			void player.play().catch(() => {});
		},
		dispose() {
			disposed = true;
			stop();
		},
	};
}
