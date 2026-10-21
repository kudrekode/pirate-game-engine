import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
	loadGlb,
	skeletonSignature,
} from "./procedural-mannequin-roundtrip.mjs";
import { inspectAnimationSource } from "../animation-retargeting/animation-source-inspection.mjs";
import { GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE } from "./procedural-mannequin-contract.mjs";
export const COMBAT_CLIPS = {
	Attack: { name: "GoldenCombat_Attack_V1", duration: 0.5 },
	Hit: { name: "GoldenCombat_Hit_V1", duration: 1 / 3 },
	Death: { name: "GoldenCombat_Death_V1", duration: 1.35 },
};
// Bundle revision changes timing; the semantic clip names stay stable.
export const POLISHED_COMBAT_CLIPS = {
	Attack: { name: "GoldenCombat_Attack_V1", duration: 0.6 },
	Hit: { name: "GoldenCombat_Hit_V1", duration: 0.45 },
	Death: { name: "GoldenCombat_Death_V1", duration: 1.65 },
};
const MAIN = [
	"pelvis",
	"spine_01",
	"spine_02",
	"spine_03",
	"neck_01",
	"Head",
	...["l", "r"].flatMap((s) =>
		[
			"clavicle",
			"upperarm",
			"lowerarm",
			"hand",
			"thigh",
			"calf",
			"foot",
			"ball",
		].map((n) => `${n}_${s}`),
	),
];
const FINGERS = ["l", "r"].flatMap((s) =>
	["index", "middle", "ring", "pinky", "thumb"].flatMap((f) =>
		[1, 2, 3].map((j) => `${f}_0${j}_${s}`),
	),
);
export function validateCombatTracks(clips, clipSpecs = COMBAT_CLIPS) {
	assert.deepEqual(
		clips.map((c) => c.name).sort(),
		Object.values(clipSpecs)
			.map((c) => c.name)
			.sort(),
	);
	for (const [id, spec] of Object.entries(clipSpecs)) {
		const clip = clips.find((c) => c.name === spec.name);
		assert(Math.abs(clip.duration - spec.duration) < 1e-6, `${id} duration`);
		const expected = [...MAIN, ...(id === "Attack" ? FINGERS : [])].map(
			(n) => `${n}.quaternion`,
		);
		if (id === "Death") expected.push("pelvis.position");
		assert.deepEqual(
			clip.tracks.map((t) => t.name).sort(),
			expected.sort(),
			`${id} exact channel contract`,
		);
		for (const t of clip.tracks) {
			assert(
				[...t.times, ...t.values].every(Number.isFinite),
				`${id}/${t.name} finite values`,
			);
			assert.equal(t.getInterpolation(), THREE.InterpolateLinear);
			assert.equal(t.times[0], 0);
			assert(Math.abs(t.times.at(-1) - clip.duration) < 1e-6);
			for (let i = 1; i < t.times.length; i++)
				assert(t.times[i] > t.times[i - 1]);
		}
	}
}
const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const bones = (root) => {
	const r = [];
	root.traverse((n) => {
		if (n.isBone) r.push(n);
	});
	return r;
};
export async function validateGoldenCombat(
	artifactPath,
	targetPaths = [
		"public/assets/derived/authored-humans/everyday-v1/mannequin.glb",
	],
	clipSpecs = COMBAT_CLIPS,
) {
	const source = await loadGlb(artifactPath);
	validateCombatTracks(source.animations, clipSpecs);
	let meshCount = 0;
	source.scene.traverse((o) => {
		if (o.isMesh) meshCount++;
	});
	assert.equal(meshCount, 0, "Library contains only rig and clips");
	const targets = [];
	for (const input of targetPaths) {
		const targetPath = typeof input === "string" ? input : input.path;
		const heightScale = typeof input === "string" ? 1 : input.heightScale;
		const target = await loadGlb(targetPath);
		const inspection = await inspectAnimationSource(targetPath);
		assert.equal(
			skeletonSignature(inspection).hash,
			GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
			"Golden binds/rest signature",
		);
		target.scene.scale.multiplyScalar(heightScale);
		const reference = bones(target.scene);
		assert.equal(reference.length, 65);
		let restError = 0;
		for (const b of reference) {
			const n = source.scene.getObjectByName(b.name);
			assert(n, `missing ${b.name}`);
			assert.equal(n.parent.name, b.parent.isBone ? b.parent.name : "Armature");
			restError = Math.max(
				restError,
				diff(n.matrix.elements, b.matrix.elements),
			);
		}
		assert(restError < 1e-6, "Exact Golden rest frame");
		const clips = [];
		for (const clip of source.animations) {
			const first = clone(target.scene),
				second = clone(target.scene);
			const firstBones = bones(first),
				secondBones = bones(second);
			const rest = secondBones.map((b) => b.matrix.toArray());
			assert(firstBones.every((b, i) => b !== secondBones[i]));
			const mixer = new THREE.AnimationMixer(first),
				other = new THREE.AnimationMixer(second);
			const action = mixer.clipAction(clip);
			action.setLoop(THREE.LoopOnce, 1);
			action.clampWhenFinished = true;
			action.play();
			const pelvis = first.getObjectByName("pelvis"),
				positions = [],
				floor = [],
				ceiling = [];
			for (let i = 0; i <= 60; i++) {
				mixer.setTime((clip.duration * i) / 60);
				first.updateMatrixWorld(true);
				first.traverse((o) => {
					assert(o.matrixWorld.elements.every(Number.isFinite));
					if (o.isSkinnedMesh) o.skeleton.update();
				});
				positions.push(pelvis.getWorldPosition(new THREE.Vector3()).toArray());
				const bounds = new THREE.Box3().setFromObject(first, true);
				floor.push(bounds.min.y);
				ceiling.push(bounds.max.y);
				assert(
					[...bounds.min.toArray(), ...bounds.max.toArray()].every(
						Number.isFinite,
					),
				);
			}
			const horizontal = [0, 2].map(
				(axis) =>
					Math.max(...positions.map((p) => p[axis])) -
					Math.min(...positions.map((p) => p[axis])),
			);
			assert(
				horizontal.every((v) => v < 1e-6),
				"No horizontal pelvis motion",
			);
			assert(Math.min(...floor) > -0.008, "Full-clip floor clearance");
			if (clip.name === clipSpecs.Death.name) {
				assert(
					floor.at(-1) > -0.008 && floor.at(-1) < 0.04,
					"Grounded final pose",
				);
				assert(ceiling.at(-1) < 0.5, "Final fall remains low to the ground");
			}
			const held = firstBones.map((b) => b.matrix.toArray());
			mixer.update(1);
			first.updateMatrixWorld(true);
			assert(
				firstBones.every((b, i) => diff(b.matrix.elements, held[i]) < 1e-6),
				"Clamped final pose",
			);
			assert(
				secondBones.every((b, i) => diff(b.matrix.elements, rest[i]) === 0),
				"Independent clone remains at rest",
			);
			other.clipAction(clip).play();
			other.update(clip.duration * 0.3);
			mixer.stopAllAction();
			other.stopAllAction();
			first.updateMatrixWorld(true);
			second.updateMatrixWorld(true);
			assert(
				firstBones.every((b, i) => diff(b.matrix.elements, rest[i]) < 1e-6),
				"Rest restoration",
			);
			mixer.uncacheRoot(first);
			other.uncacheRoot(second);
			clips.push({
				name: clip.name,
				duration: clip.duration,
				tracks: clip.tracks.length,
				horizontalRange: horizontal,
				minimumY: Math.min(...floor),
				finalMinimumY: floor.at(-1),
				finalMaximumY: ceiling.at(-1),
				independentClones: true,
				restRestored: true,
				finalPoseHeld: true,
			});
		}
		targets.push({ targetPath, heightScale, restError, clips });
	}
	return {
		rigProfile: "golden-humanoid-v0",
		artifactPath,
		sha256: createHash("sha256")
			.update(await readFile(artifactPath))
			.digest("hex"),
		meshCount,
		targets,
	};
}
