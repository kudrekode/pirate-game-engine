import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

// CDP events measure wall time in Chromium thread slices (which may include
// waits), not GPU execution time. Keep the raw trace for Perfetto/DevTools.
export async function startSchedulerTrace(cdp) {
	const events = [];
	const collect = ({ value }) => {
		for (const item of value) events.push(item);
	};
	cdp.on("Tracing.dataCollected", collect);
	await cdp.send("Tracing.start", {
		categories: "toplevel,blink.user_timing,devtools.timeline,gpu,cc,viz",
		options: "record-as-much-as-possible",
	});
	return async (output, phases) => {
		const complete = new Promise((done) =>
			cdp.once("Tracing.tracingComplete", done),
		);
		await cdp.send("Tracing.end");
		const { dataLossOccurred } = await complete;
		cdp.off("Tracing.dataCollected", collect);
		await writeFile(
			resolve(output, "ridge-chrome-trace.json.gz"),
			gzipSync(JSON.stringify({ traceEvents: events })),
		);
		const marker = events.find((e) => e.name === "hollow-ridge-trace-start");
		const gap = phases.longestFrames[0];
		if (!marker || !gap) return { dataLossOccurred, clockAligned: false };
		const clockOrigin = marker.ts / 1000 - phases.start;
		const start = gap.start + clockOrigin;
		const end = start + gap.duration;
		const processes = new Map();
		const threads = new Map();
		const intervals = new Map();
		for (const e of events) {
			const key = `${e.pid}/${e.tid}`;
			if (e.name === "process_name") processes.set(e.pid, e.args.name);
			if (e.name === "thread_name") threads.set(key, e.args.name);
			if (e.ph !== "X" || !e.dur) continue;
			const lo = Math.max(start, e.ts / 1000);
			const hi = Math.min(end, (e.ts + e.dur) / 1000);
			if (hi <= lo) continue;
			if (!intervals.has(key)) intervals.set(key, []);
			intervals.get(key).push({ lo, hi, name: e.name, category: e.cat });
		}
		const observed = [];
		for (const [key, slices] of intervals) {
			// Union avoids counting nested RunTask/shader/draw slices twice.
			let cursor = start;
			let coveredMs = 0;
			for (const slice of slices.sort((a, b) => a.lo - b.lo)) {
				coveredMs += Math.max(0, slice.hi - Math.max(cursor, slice.lo));
				cursor = Math.max(cursor, slice.hi);
			}
			const [pid] = key.split("/");
			observed.push({
				thread: threads.get(key) ?? key,
				process: processes.get(Number(pid)) ?? pid,
				coveredMs,
				// A renderer-thread WaitForCmd nested inside a WebGL getter
				// distinguishes command-queue waits from JS computation.
				longestGraphicsSlices: slices
					.filter((s) => s.category?.split(",").includes("gpu"))
					.sort((a, b) => b.hi - b.lo - (a.hi - a.lo))
					.slice(0, 10)
					.map(({ name, lo, hi }) => ({ name, elapsedMs: hi - lo })),
				longestSlices: slices
					.sort((a, b) => b.hi - b.lo - (a.hi - a.lo))
					.slice(0, 6)
					.map(({ name, lo, hi }) => ({ name, elapsedMs: hi - lo })),
			});
		}
		return {
			dataLossOccurred,
			clockAligned: true,
			gap,
			threads: observed
				.sort((a, b) => b.coveredMs - a.coveredMs)
				.filter(
					(item, i) =>
						i < 24 ||
						[
							"CrRendererMain",
							"CrGpuMain",
							"Compositor",
							"DedicatedWorker thread",
						].includes(item.thread),
				),
		};
	};
}
