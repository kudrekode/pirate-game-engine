import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The benchmark client has no access to the application's mixers. Match two
// independent local bone rotations to the installed clip's authored keys.
// This measures the displayed skeleton even on the uninstrumented reference build.
async function quaternionKeys(path, clipName, boneNames) {
	const bytes = await readFile(`public/assets/${path}.glb`);
	const end = 20 + bytes.readUInt32LE(12);
	const gltf = JSON.parse(bytes.toString("utf8", 20, end));
	const animation = gltf.animations.find((clip) => clip.name === clipName);
	function floats(id) {
		const accessor = gltf.accessors[id],
			view = gltf.bufferViews[accessor.bufferView];
		assert.equal(accessor.componentType, 5126);
		assert.equal(view.byteStride, undefined);
		const width = accessor.type === "SCALAR" ? 1 : 4;
		return Array.from({ length: accessor.count * width }, (_, i) =>
			bytes.readFloatLE(
				end + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 4,
			),
		);
	}
	const tracks = boneNames.map((name) => {
		const channel = animation.channels.find(
			({ target }) =>
				gltf.nodes[target.node].name === name && target.path === "rotation",
		);
		const sampler = animation.samplers[channel.sampler],
			times = floats(sampler.input),
			values = floats(sampler.output);
		const keys = times.map((_, i) => {
			const start =
				sampler.interpolation === "CUBICSPLINE" ? 12 * i + 4 : 4 * i;
			return values.slice(start, start + 4);
		});
		return { times, keys };
	});
	assert.deepEqual(tracks[0].times, tracks[1].times);
	return {
		times: tracks[0].times,
		keys: tracks[0].times.map((_, i) => tracks.map((t) => t.keys[i])),
	};
}

export async function observeGait(page, name, run) {
	const mounted = name === "ride";
	const reference = mounted
		? await quaternionKeys("hollow-kingdom/horse", "HorseWalk", [
				"foreUpper.L",
				"hindThigh.R",
			])
		: await quaternionKeys(
				"derived/humanoid-animations/golden-reference-v0/walk-in-place.clip",
				"GoldenReference_Walk_InPlace",
				["thigh_l", "calf_r"],
			);
	const fixture = JSON.parse(
		await readFile("hollow-kingdom-chapter-one.project.json", "utf8"),
	);
	const { width, height } = fixture.areas.find(
		(area) => area.id === "merewatch",
	);
	await page.evaluate(
		({ mounted, width, height }) => {
			const scene = window.hollowScene.deref();
			const host = document.querySelector(".three-runtime-host");
			const location = JSON.parse(host.dataset.traversal);
			const x = location.x - (width - 1) / 2,
				z = location.y - (height - 1) / 2;
			const humanoids = scene.children.filter((node) =>
				node.getObjectByName("pelvis"),
			);
			const distance = (root) =>
				Math.hypot(root.position.x - x, root.position.z - z);
			const rider = humanoids.sort((a, b) => distance(a) - distance(b))[0];
			if (!rider || distance(rider) > 1)
				throw Error("Player rig missing at the authored traversal position");
			const horse = scene.children.find((node) =>
				node.getObjectByName("Saddle"),
			);
			const bones = mounted
				? [
						horse.getObjectByName("foreUpperL"),
						horse.getObjectByName("hindThighR"),
					]
				: [rider.getObjectByName("thigh_l"), rider.getObjectByName("calf_r")];
			if (bones.some((n) => !n?.isBone)) throw Error("Gait bones missing");
			const pelvis = rider.getObjectByName("pelvis"),
				saddle = horse?.getObjectByName("Saddle");
			const feet = mounted
				? []
				: ["foot_l", "foot_r"].map((name) => rider.getObjectByName(name));
			const rows = [];
			const state = { rows, active: true };
			window.hollowGaitObservation = state;
			const read = (t) => {
				if (!state.active) return;
				const traversal = JSON.parse(host.dataset.traversal);
				const pose = bones.map((b) => b.quaternion.toArray());
				let seatError;
				if (mounted) {
					const p = pelvis.matrixWorld.elements,
						s = saddle.matrixWorld.elements;
					seatError = Math.hypot(
						p[12] - s[12],
						p[13] - s[13] - 0.09 * rider.scale.y,
						p[14] - s[14],
					);
				}
				rows.push({
					t,
					pose,
					moving: traversal.moving,
					x: traversal.x,
					y: traversal.y,
					seatError,
					feet: feet.map((foot) => {
						const m = foot.matrixWorld.elements;
						return [m[12], m[13] - rider.position.y, m[14]];
					}),
				});
				requestAnimationFrame(read);
			};
			requestAnimationFrame(read);
		},
		{ mounted, width, height },
	);
	let rows;
	try {
		await run();
	} finally {
		rows = await page.evaluate(() => {
			const sample = window.hollowGaitObservation;
			sample.active = false;
			delete window.hollowGaitObservation;
			return sample.rows;
		});
	}
	const period = reference.times.at(-1);
	const errors = [];
	let backwards = 0,
		wraps = 0,
		maxStep = 0,
		activeDuration = 0,
		prior;
	for (const row of rows) {
		if (!row.moving) {
			prior = undefined;
			continue;
		}
		const error = reference.keys.map((key) =>
			key.reduce(
				(acc, q, k) =>
					acc +
					(1 - Math.abs(q.reduce((dot, v, j) => dot + v * row.pose[k][j], 0))),
				0,
			),
		);
		const best = Math.min(...error),
			phase = reference.times[error.indexOf(best)] % period;
		errors.push(best);
		// Ignore blends into the gait; reject pose estimates outside the clip.
		if (best > 0.001) {
			prior = undefined;
			continue;
		}
		if (prior) {
			const dt = (row.t - prior.t) / 1000;
			activeDuration += dt;
			let step = phase - prior.phase;
			if (step < -period / 2) {
				step += period;
				wraps++;
			}
			if (step > period / 2) step -= period;
			if (step < -0.05) backwards++;
			maxStep = Math.max(maxStep, Math.abs(step));
		}
		prior = { phase, t: row.t };
	}
	assert.ok(errors.length > 10, "No sustained motion was observed");
	// No force/contact sensors in these clips. Use the lowest 15% of each
	// ankle's observed vertical range as a stance proxy on this straight walk.
	const stanceSpeeds = [];
	if (!mounted)
		for (const i of [0, 1]) {
			const heights = rows.filter((r) => r.moving).map((r) => r.feet[i][1]);
			const low = Math.min(...heights);
			const limit = low + 0.15 * (Math.max(...heights) - low);
			for (let j = 1; j < rows.length; j++) {
				const prev = rows[j - 1],
					next = rows[j];
				const a = prev.feet[i],
					b = next.feet[i];
				if (
					prev.moving &&
					next.moving &&
					a[1] <= limit &&
					b[1] <= limit &&
					next.t > prev.t
				) {
					stanceSpeeds.push(
						(1000 * Math.hypot(a[0] - b[0], a[2] - b[2])) / (next.t - prev.t),
					);
				}
			}
		}
	stanceSpeeds.sort((a, b) => a - b);
	return {
		frames: rows.length,
		movingFrames: errors.length,
		matchingSeconds: activeDuration,
		wraps,
		backwardsOver50ms: backwards,
		largestPhaseStepSeconds: maxStep,
		...(!mounted && {
			stanceSamples: stanceSpeeds.length,
			medianLowAnkleWorldSpeed:
				stanceSpeeds[Math.floor(stanceSpeeds.length / 2)],
		}),
		...(mounted && {
			maxPelvisSeatError: Math.max(...rows.map((r) => r.seatError)),
		}),
	};
}
