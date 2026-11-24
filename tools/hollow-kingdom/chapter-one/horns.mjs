import { writeFileSync } from "node:fs";

// Three low reed calls. Slightly mistuned partials and delayed repeats give the
// sound a stone-well resonance without using a recording or sample library.
export function writeHorns(output) {
	const sampleRate = 16_000;
	const sampleCount = 63_200;
	const pcm = Buffer.alloc(44 + sampleCount * 2);
	pcm.write("RIFF", 0);
	pcm.writeUInt32LE(pcm.length - 8, 4);
	pcm.write("WAVEfmt ", 8);
	pcm.writeUInt32LE(16, 16);
	pcm.writeUInt16LE(1, 20);
	pcm.writeUInt16LE(1, 22);
	pcm.writeUInt32LE(sampleRate, 24);
	pcm.writeUInt32LE(sampleRate * 2, 28);
	pcm.writeUInt16LE(2, 32);
	pcm.writeUInt16LE(16, 34);
	pcm.write("data", 36);
	pcm.writeUInt32LE(sampleCount * 2, 40);

	function reed(time, note) {
		if (time <= 0 || time > 1.2) return 0;
		const envelope = Math.min(1, time / 0.12) * (1 - time / 1.2) ** 1.4;
		const phase = 2 * Math.PI * note * time + 0.22 * Math.sin(22 * time);
		return (
			envelope *
			(0.65 * Math.sin(phase) +
				0.26 * Math.sin(phase * 2.01) +
				0.09 * Math.sin(phase * 3.04))
		);
	}
	for (let i = 0; i < sampleCount; i += 1) {
		const time = i / sampleRate;
		let amplitude = 0;
		for (const [start, note] of [
			[0, 91],
			[0.93, 87],
			[1.91, 82],
		]) {
			const local = time - start;
			amplitude +=
				reed(local, note) +
				0.28 * reed(local - 0.22, note) +
				0.14 * reed(local - 0.46, note);
		}
		pcm.writeInt16LE(Math.round(11_600 * amplitude), 44 + i * 2);
	}
	writeFileSync(output, pcm);
}
