/** Short, original impact sounds. The context is unlocked by the bout start gesture. */
export function playBladeContact(
	context: AudioContext,
	kind: "steel" | "parry" | "hit",
) {
	if (context.state !== "running") return;
	const now = context.currentTime;
	const partials =
		kind === "hit"
			? [92, 164]
			: kind === "parry"
				? [870, 1384, 2480]
				: [570, 972, 1672];
	for (const [index, frequency] of partials.entries()) {
		const source = context.createOscillator();
		const gain = context.createGain();
		const decay = kind === "parry" ? 0.2 : 0.095;
		source.type = index === 0 ? "triangle" : "sine";
		source.frequency.setValueAtTime(frequency, now);
		source.frequency.exponentialRampToValueAtTime(
			frequency * (kind === "hit" ? 0.45 : 0.94),
			now + decay,
		);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.068 / (index + 1), now + 0.003);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
		source.connect(gain).connect(context.destination);
		source.onended = () => {
			source.disconnect();
			gain.disconnect();
		};
		source.start(now);
		source.stop(now + decay);
	}
}
