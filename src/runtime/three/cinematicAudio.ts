import type { CinematicAudioCue } from "../../types/game";

function getCueVolume(cue: CinematicAudioCue, cueElapsedMs: number) {
	const fadeIn = cue.fadeInMs ? cueElapsedMs / cue.fadeInMs : 1;
	const fadeOut = cue.fadeOutMs
		? (cue.durationMs - cueElapsedMs) / cue.fadeOutMs
		: 1;
	return (cue.volume ?? 1) * Math.max(0, Math.min(1, fadeIn, fadeOut));
}

export function createCinematicAudioController(
	onIssue?: (message: string | undefined) => void,
) {
	let cue: CinematicAudioCue | undefined;
	let player: HTMLAudioElement | undefined;
	let disposed = false;

	function stop() {
		const active = player;
		player = undefined;
		if (!active) return;
		active.removeEventListener("error", onMediaError);
		active.pause();
		active.removeAttribute("src");
		active.load();
	}

	function reportIssue(active: HTMLAudioElement) {
		if (player !== active) return;
		stop();
		onIssue?.(
			"The audio cue could not play. Check its source and browser audio settings.",
		);
	}

	function onMediaError(event: Event) {
		if (player && event.currentTarget === player) reportIssue(player);
	}

	return {
		sync(
			next: CinematicAudioCue | undefined,
			elapsedMs: number,
			reseek = false,
		) {
			if (disposed) return;
			const changed = next !== cue;
			if (changed) {
				stop();
				cue = next;
			}
			if (!cue) return;

			const starting = !player && (changed || reseek);
			if (starting) {
				player = new Audio(cue.url);
				player.addEventListener("error", onMediaError);
				onIssue?.(undefined);
			}
			const active = player;
			if (!active) return;
			const cueElapsedMs = Math.max(0, elapsedMs - cue.startMs);
			const volume = getCueVolume(cue, cueElapsedMs);
			if (active.volume !== volume) active.volume = volume;
			if (starting || reseek)
				active.currentTime = ((cue.offsetMs ?? 0) + cueElapsedMs) / 1000;
			// Autoplay rejection and media errors leave the timeline running.
			if (starting || (reseek && active.paused))
				void active.play().catch(() => reportIssue(active));
		},
		dispose() {
			disposed = true;
			stop();
			cue = undefined;
		},
	};
}
