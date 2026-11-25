import { readFile, writeFile } from "node:fs/promises";
import { SourceMap } from "node:module";
import { resolve, sep } from "node:path";
import { startSchedulerTrace } from "./hollow-transition-scheduler.mjs";

// Runs only in the tracing browser. Durations are elapsed main-thread time,
// including driver calls. Nested phases overlap and must not be summed.
export function installTransitionProbe() {
	let trace;
	let phase = "outside renderer submission";
	function event(name, start, duration, details = {}) {
		trace.events.push({ name, start, duration, ...details });
	}
	function timeMethod(object, name, label, details, threshold = 2) {
		const original = object?.[name];
		if (typeof original !== "function") return;
		object[name] = function (...args) {
			if (!trace) return original.apply(this, args);
			const start = performance.now();
			const parentPhase = phase;
			if (
				label === "renderer.render" ||
				label === "renderer.compile" ||
				label === "shadow.render"
			)
				phase = label;
			try {
				return original.apply(this, args);
			} finally {
				const duration = performance.now() - start;
				trace.totals[label] ??= { calls: 0, ms: 0, max: 0 };
				const total = trace.totals[label];
				total.calls++;
				total.ms += duration;
				total.max = Math.max(total.max, duration);
				if (duration >= threshold)
					event(label, start, duration, { phase, ...details?.(args) });
				phase = parentPhase;
			}
		};
	}
	timeMethod(
		HTMLCanvasElement.prototype,
		"getContext",
		"canvas.getContext",
		([kind]) => ({ kind }),
		0,
	);
	for (const name of [
		"compileShader",
		"shaderSource",
		"linkProgram",
		"fenceSync",
		"flush",
		"clientWaitSync",
		"deleteSync",
		"getProgramInfoLog",
		"getShaderInfoLog",
		"getActiveUniform",
		"getActiveAttrib",
		"getAttribLocation",
		"getUniformLocation",
		"createTexture",
		"texStorage2D",
		"texImage2D",
		"texSubImage2D",
		"generateMipmap",
		"bufferData",
		"bufferSubData",
		"deleteTexture",
		"deleteBuffer",
		"deleteProgram",
	])
		timeMethod(WebGL2RenderingContext.prototype, name, `gl.${name}`);
	const parameters = new Map([
		[WebGL2RenderingContext.LINK_STATUS, "LINK_STATUS"],
		[WebGL2RenderingContext.VALIDATE_STATUS, "VALIDATE_STATUS"],
		[WebGL2RenderingContext.ACTIVE_UNIFORMS, "ACTIVE_UNIFORMS"],
		[WebGL2RenderingContext.ACTIVE_ATTRIBUTES, "ACTIVE_ATTRIBUTES"],
		[0x91b1, "COMPLETION_STATUS_KHR"],
	]);
	timeMethod(
		WebGL2RenderingContext.prototype,
		"getProgramParameter",
		"gl.getProgramParameter",
		([, parameter]) => ({
			parameter,
			parameterName: parameters.get(parameter) ?? "other",
		}),
	);
	window.__THREE_DEVTOOLS__.addEventListener(
		"observe",
		({ detail: renderer }) => {
			if (!renderer.isWebGLRenderer) return;
			if (trace) event("renderer.observe", performance.now(), 0);
			const base = "renderer.";
			for (const name of ["compile", "render", "dispose", "forceContextLoss"])
				timeMethod(renderer, name, base + name, undefined, 0);
			timeMethod(renderer.shadowMap, "render", "shadow.render");
			timeMethod(
				renderer.renderLists,
				"dispose",
				"renderLists.dispose",
				undefined,
				0,
			);
		},
	);
	performance.setResourceTimingBufferSize(3000);
	document.addEventListener(
		"click",
		({ target }) => {
			const button = trace && target.closest?.("button");
			if (button)
				event("ui.click", performance.now(), 0, {
					text: button.textContent.trim(),
				});
		},
		true,
	);
	window.beginRidgeTrace = () => {
		trace = {
			start: performance.mark("hollow-ridge-trace-start").startTime,
			events: [],
			totals: {},
			longestFrames: [],
		};
		const state = trace;
		let previous;
		const tick = (timestamp) => {
			if (state !== trace) return;
			if (previous !== undefined)
				state.longestFrames.push({
					start: previous,
					duration: timestamp - previous,
				});
			previous = timestamp;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		const record = (entry) =>
			event("main.longTask", entry.startTime, entry.duration);
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) record(entry);
		});
		observer.observe({ type: "longtask" });
		window.finishRidgeTrace = () => {
			for (const entry of observer.takeRecords()) record(entry);
			observer.disconnect();
			const end = performance.now();
			const start = state.start;
			state.end = end;
			state.resources = performance
				.getEntriesByType("resource")
				.filter(
					(e) =>
						e.responseEnd >= start &&
						e.startTime <= end &&
						/\.glb($|\?)/i.test(e.name),
				)
				.map((e) => ({
					path: new URL(e.name).pathname,
					start: e.startTime,
					duration: e.duration,
					bytes: e.encodedBodySize,
				}));
			state.longestFrames.sort((a, b) => b.duration - a.duration).splice(12);
			state.events.sort((a, b) => a.start - b.start);
			trace = undefined;
			return state;
		};
	};
}

// Retain the raw V8 profile as well as source-mapped hot sampled locations.
// A single native call can hold a JS sample for a long interval. Treat these
// weights as attribution clues and confirm with the elapsed browser phases.
async function summarizeCpu(profile, build, frame, navigationStartMs) {
	const maps = new Map();
	const labels = new Map();
	const parents = new Map();
	for (const node of profile.nodes) {
		for (const child of node.children ?? []) parents.set(child, node.id);
		const { url, functionName, lineNumber, columnNumber } = node.callFrame;
		let label = functionName || "(anonymous)";
		if (/^https?:\/\//.test(url)) {
			const pathname = new URL(url).pathname;
			if (!maps.has(pathname)) {
				const file = resolve(build, `.${pathname}.map`);
				const payload = file.startsWith(build + sep)
					? await readFile(file, "utf8").catch(() => undefined)
					: undefined;
				maps.set(pathname, payload ? new SourceMap(JSON.parse(payload)) : null);
			}
			const location = maps.get(pathname)?.findEntry(lineNumber, columnNumber);
			label += location?.originalSource
				? ` ${location.originalSource}:${location.originalLine + 1}`
				: ` ${pathname}:${lineNumber + 1}:${columnNumber + 1}`;
		}
		labels.set(node.id, label);
	}
	const leaves = new Map();
	const stacks = new Map();
	const frameLeaves = new Map();
	// Inclusive stack samples. A React effect may build terrain or clone a mesh.
	// Keep these overlapping families separate from exclusive leaf samples.
	const families = {
		gltfLoader: /\/GLTFLoader\.js:/,
		threeClone: /\/SkeletonUtils\.js:|\bclone [^,]*\/three\.core\.js:/,
		terrain:
			/\/(?:terrainSurface|terrainMeshGeometry|terrainBlocks|waterPresentation|groundSurfacePresentation)\.[tj]s:/,
		visualMarkers: /\/threeVisualRenderer\.ts:/,
		shaderPreparation: /\/prepareSceneShaders\.ts:/,
		react: /\/react-dom[^,]*\.js:/,
	};
	const inclusiveStackMs = Object.fromEntries(
		Object.keys(families).map((key) => [key, 0]),
	);
	let cursor = profile.startTime / 1000 - navigationStartMs;
	let maxSampleIntervalMs = 0;
	for (const [index, node] of (profile.samples ?? []).entries()) {
		const ms = profile.timeDeltas[index] / 1000;
		const leaf = labels.get(node);
		if (frame && Number.isFinite(cursor)) {
			const inFrame = Math.max(
				0,
				Math.min(cursor + ms, frame.start + frame.duration) -
					Math.max(cursor, frame.start),
			);
			if (inFrame > 0) {
				frameLeaves.set(leaf, (frameLeaves.get(leaf) ?? 0) + inFrame);
				maxSampleIntervalMs = Math.max(maxSampleIntervalMs, ms);
			}
		}
		cursor += ms;
		leaves.set(leaf, (leaves.get(leaf) ?? 0) + ms);
		const chain = [leaf];
		let parent = parents.get(node);
		while (parent) {
			chain.push(labels.get(parent));
			parent = parents.get(parent);
		}
		const allFrames = chain.join(",");
		for (const [name, pattern] of Object.entries(families)) {
			if (pattern.test(allFrames)) inclusiveStackMs[name] += ms;
		}
		const key = chain.slice(0, 14).join(" ← ");
		stacks.set(key, (stacks.get(key) ?? 0) + ms);
	}
	const ranked = (counts) =>
		[...counts].sort((a, b) => b[1] - a[1]).slice(0, 35);
	return {
		samples: profile.samples?.length,
		inclusiveStackMs,
		leafMs: ranked(leaves),
		stackMs: ranked(stacks),
		longestFrame: frame && {
			...frame,
			maxSampleIntervalMs,
			weightedLeafMs: ranked(frameLeaves),
		},
	};
}

export async function traceRidgeTransition(
	page,
	cdp,
	output,
	build,
	run,
	schedulerTrace = false,
) {
	const finishScheduler = schedulerTrace && (await startSchedulerTrace(cdp));
	await cdp.send("Performance.enable");
	const { metrics } = await cdp.send("Performance.getMetrics");
	const navigationStartMs =
		metrics.find((m) => m.name === "NavigationStart")?.value * 1000;
	await cdp.send("Profiler.enable");
	await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
	await cdp.send("Profiler.start");
	await page.evaluate(() => window.beginRidgeTrace());
	try {
		await run();
	} finally {
		const phases = await page.evaluate(() => window.finishRidgeTrace());
		const { profile } = await cdp.send("Profiler.stop");
		await cdp.send("Profiler.disable");
		await cdp.send("Performance.disable");
		const scheduler =
			finishScheduler && (await finishScheduler(output, phases));
		const cpu = await summarizeCpu(
			profile,
			build,
			phases.longestFrames[0],
			navigationStartMs,
		);
		await writeFile(
			resolve(output, "ridge.cpuprofile"),
			JSON.stringify(profile),
		);
		await writeFile(
			resolve(output, "ridge-trace.json"),
			JSON.stringify(
				{ ...phases, cpu, ...(scheduler && { scheduler }) },
				null,
				2,
			),
		);
	}
}
