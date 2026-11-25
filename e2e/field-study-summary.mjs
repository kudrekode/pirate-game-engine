import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

// Condense the raw browser evidence while retaining every attempted size and
// phase, including failed routes. Supply separate directories for each repeat.
const {
	positionals: [destination, ...folders],
	values,
} = parseArgs({
	allowPositionals: true,
	options: {
		calibration: { type: "string" },
		"calibration-build": { type: "string" },
		pilot: { type: "string", multiple: true },
	},
});
assert.ok(
	destination && folders.length,
	"Usage: node e2e/field-study-summary.mjs <output.json> <run-folder> [...]",
);
const phases = ["followWalk", "ride", "orbit", "farRide", "farTurn", "farView"];
const r = (value) => Number(value.toFixed(2));
const report = {
	budget: {
		targetHz: 30,
		p95Ms: 33.4,
		p99Ms: 50,
		minimumFramesPerPhase: 30,
		requiredPhases: phases,
	},
	fixtures: {},
	runs: [],
};

function phaseResult(action) {
	const { count, p50, p95, p99, max, over50 } = action.intervals;
	assert.ok(count > 0, "An action completed without frame samples");
	const { renderer, phases } = action.snapshot;
	const { view } = action;
	return {
		frames: count,
		ms: { p50: r(p50), p95: r(p95), p99: r(p99), max: r(max) },
		over50,
		withinBudget: count >= 30 && r(p95) <= 33.4 && r(p99) <= 50,
		mainDraws: view?.draws ?? renderer.drawCalls,
		mainTriangles: view?.triangles ?? renderer.triangles,
		meanFrameCallbackMs: phases.frameCallback.averageMs,
		meanRenderCpuMs: phases.render.averageMs,
		...(action.route && { route: action.route }),
		...(action.position && { position: action.position }),
		...(view && {
			submittedMarkers: [view.minVisibleMarkers, view.maxVisibleMarkers],
			submittedProxyTrees: view.submittedProxyTrees,
			submittedSkinnedRoots: [view.minVisible, view.maxVisible],
			gpuSamples: action.gpuMs.count,
			...(action.gpuMs.count && {
				gpuP50Ms: r(action.gpuMs.p50),
				gpuP95Ms: r(action.gpuMs.p95),
			}),
			shadowFrames: action.shadowFrames,
			shadowDrawsPerUpdate: action.shadowFrames
				? r(action.shadowDraws / action.shadowFrames)
				: null,
			shadowCpuMsPerUpdate:
				view.shadowCpuMsPerUpdate == null ? null : r(view.shadowCpuMsPerUpdate),
		}),
	};
}

for (const folder of folders) {
	for (const file of (await readdir(folder))
		.filter((file) => file.endsWith(".json"))
		.sort()) {
		const data = JSON.parse(await readFile(join(folder, file), "utf8"));
		const { fieldStudy, fixture, id, machine, viewport } = data;
		assert.ok(fieldStudy, `Unexpected result: ${file}`);
		const device = {
			host: machine.host,
			chrome: machine.chrome,
			gpu: machine.gpu.auxAttributes.glRenderer,
			viewport,
			chromiumArgs: machine.chromiumArgs,
			offline: machine.offline,
		};
		report.device ??= device;
		assert.deepEqual(
			report.device,
			device,
			"Different device or viewport in a comparative run",
		);
		if (fieldStudy.surface) {
			const { css, buffer, dpr } = fieldStudy.surface;
			const surface = { css, buffer, dpr };
			report.surface ??= surface;
			assert.deepEqual(
				report.surface,
				surface,
				"Different drawing buffer in a comparative run",
			);
		}
		report.fixtures[id] ??= fixture;
		assert.deepEqual(
			report.fixtures[id],
			fixture,
			"Different content under the same size label",
		);
		const actions = Object.fromEntries(
			Object.entries(data.runtime).map(([name, value]) => [
				name,
				phaseResult(value),
			]),
		);
		const complete =
			data.stage === "complete" && !data.failure && data.errors.length === 0;
		const finalRenderer = data.runtime.farView?.snapshot.renderer;
		const models = data.assets.filter((asset) =>
			/\.(?:glb|gltf)$/.test(asset.path),
		);
		report.runs.push({
			run: basename(folder),
			rawReportWrittenUtc: (await stat(join(folder, file))).mtime.toISOString(),
			scale: id,
			...fieldStudy,
			stage: data.stage,
			...(data.failure && { failure: data.failure }),
			errors: data.errors,
			withinBudget:
				complete && phases.every((name) => actions[name]?.withinBudget),
			actions,
			...(finalRenderer && {
				farResources: {
					geometries: finalRenderer.geometries,
					textures: finalRenderer.textures,
					programs: finalRenderer.programs,
				},
			}),
			...(data.warm && {
				loadMs: { cold: r(data.cold.readyMs), warm: r(data.warm.readyMs) },
				coldBuildMs: {
					scene: data.cold.scene.lastBuildMs,
					terrain: data.cold.terrain.lastDurationMs,
				},
				postGcHeapMiB: {
					play: r(data.playHeap.usedSize / 2 ** 20),
					editor: r(data.editHeap.usedSize / 2 ** 20),
					warmPlay: r(data.warmHeap.usedSize / 2 ** 20),
				},
				modelParses: { cold: data.parses.length, warm: data.warmParses },
				modelRequests: models.length,
				modelEncodedBytes: models.reduce(
					(sum, asset) => sum + asset.encodedBytes,
					0,
				),
			}),
		});
	}
}
assert.ok(report.runs.length, "No browser results found");
for (const file of values.pilot ?? []) {
	const data = JSON.parse(await readFile(file, "utf8"));
	report.setupTrials ??= [];
	report.setupTrials.push({
		run: file.split(/[\\/]/).slice(-2).join("/"),
		stage: data.stage,
		failure: data.failure,
		errors: data.errors,
		fixture: data.fixture,
		...data.fieldStudy,
		actions: Object.fromEntries(
			Object.entries(data.runtime).map(([name, action]) => [
				name,
				phaseResult(action),
			]),
		),
	});
}
if (values.calibration) {
	const data = JSON.parse(await readFile(values.calibration, "utf8"));
	assert.ok(
		values["calibration-build"],
		"Specify the build used for the calibration",
	);
	assert.equal(data.machine.gpu.auxAttributes.glRenderer, report.device.gpu);
	assert.equal(data.machine.chrome, report.device.chrome);
	assert.deepEqual(data.viewport, report.device.viewport);
	assert.equal(data.stage, "complete");
	assert.deepEqual(data.errors, []);
	report.historicalFixtureCalibration = {
		probes: "pacing",
		fixture: data.fixture,
		buildIndexSha256: createHash("sha256")
			.update(await readFile(join(values["calibration-build"], "index.html")))
			.digest("hex"),
		actions: Object.fromEntries(
			Object.entries(data.runtime).map(([name, action]) => [
				name,
				phaseResult(action),
			]),
		),
	};
}
await writeFile(destination, `${JSON.stringify(report, null, "\t")}\n`);
