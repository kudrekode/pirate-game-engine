import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loadGlb } from "./procedural-mannequin-roundtrip.mjs";
import {
	validateGoldenCombat,
	validateCombatTracks,
	POLISHED_COMBAT_CLIPS,
} from "./golden-combat-roundtrip.mjs";
const artifact =
	"public/assets/derived/humanoid-animations/golden-combat-v1/actions.glb";
test("shipping Golden action library binds unchanged character, restores rest and stays in place", async () => {
	const r = await validateGoldenCombat(artifact);
	assert.equal(r.meshCount, 0);
	assert.equal(r.targets[0].clips.length, 3);
});
test("combat channel contract rejects scale, missing finger channels, extra clips and non-finite values", async () => {
	const { animations } = await loadGlb(artifact);
	for (const mutate of [
		(clips) =>
			clips[0].tracks.push(
				new THREE.VectorKeyframeTrack(
					"pelvis.scale",
					[0, 0.5],
					[1, 1, 1, 1, 1, 1],
				),
			),
		(clips) => clips.find((c) => c.name.includes("Attack")).tracks.pop(),
		(clips) => clips.push(new THREE.AnimationClip("Run", 1, [])),
		(clips) => {
			clips[0].tracks[0].values[0] = NaN;
		},
	]) {
		const copies = animations.map((c) => c.clone());
		mutate(copies);
		assert.throws(() => validateCombatTracks(copies));
	}
});

test("polished bundle preserves Golden binding, ground clearance and isolated playback", async () => {
	const r = await validateGoldenCombat(
		"public/assets/derived/humanoid-animations/golden-combat-v2/actions.glb",
		undefined,
		POLISHED_COMBAT_CLIPS,
	);
	assert.equal(r.meshCount, 0);
	assert.equal(r.targets[0].clips.length, 3);
});

test("polished Attack/Hit keep planted ankles and recover; Death holds its settled pose", async () => {
	const model = await loadGlb(
		"public/assets/derived/authored-humans/everyday-v1/mannequin.glb",
	);
	const library = await loadGlb(
		"public/assets/derived/humanoid-animations/golden-combat-v3/actions.glb",
	);
	for (const name of ["Attack", "Hit", "Death"]) {
		const clip = library.animations.find(
			(c) => c.name === POLISHED_COMBAT_CLIPS[name].name,
		);
		const mixer = new THREE.AnimationMixer(model.scene);
		const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		const sample = (time) => {
			action.reset().play();
			mixer.setTime(time);
			model.scene.updateMatrixWorld(true);
			return ["foot_l", "foot_r", "hand_r", "Head"].map((n) =>
				model.scene.getObjectByName(n).getWorldPosition(new THREE.Vector3()),
			);
		};
		const start = sample(0);
		if (name !== "Death") {
			for (let i = 1; i <= 60; i++) {
				const pose = sample((clip.duration * i) / 60);
				for (const ankle of [0, 1])
					assert(
						pose[ankle].distanceTo(start[ankle]) < 0.003,
						`${name} planted ankle`,
					);
			}
			const end = sample(clip.duration);
			if (name === "Attack") {
				const cadence = sample(0.5);
				for (const joint of [2, 3])
					assert(
						cadence[joint].distanceTo(start[joint]) < 1e-5,
						"500 ms repeat boundary is recovered",
					);
			}
			for (const joint of [2, 3])
				assert(
					end[joint].distanceTo(start[joint]) < 1e-5,
					`${name} authored recovery`,
				);
		} else {
			const settled = sample(1.05);
			const end = sample(clip.duration);
			end.forEach((v, i) =>
				assert(v.distanceTo(settled[i]) < 1e-5, "Final settled hold"),
			);
		}
		mixer.stopAllAction();
		mixer.uncacheRoot(model.scene);
	}
});

test("final cadence revision binds Golden; Hit and Death stay identical to the reviewed candidate", async () => {
	const artifact =
		"public/assets/derived/humanoid-animations/golden-combat-v3/actions.glb";
	await validateGoldenCombat(artifact, undefined, POLISHED_COMBAT_CLIPS);
	const [candidate, final] = await Promise.all([
		loadGlb(
			"public/assets/derived/humanoid-animations/golden-combat-v2/actions.glb",
		),
		loadGlb(artifact),
	]);
	for (const name of ["Hit", "Death"]) {
		const oldClip = candidate.animations.find(
			(c) => c.name === POLISHED_COMBAT_CLIPS[name].name,
		);
		const newClip = final.animations.find((c) => c.name === oldClip.name);
		assert.equal(newClip.duration, oldClip.duration);
		assert.deepEqual(
			newClip.tracks.map((t) => ({
				name: t.name,
				times: [...t.times],
				values: [...t.values],
			})),
			oldClip.tracks.map((t) => ({
				name: t.name,
				times: [...t.times],
				values: [...t.values],
			})),
		);
	}
});
