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
export const MOVEMENT_CLIPS = {
	Run: { name: "GoldenMovement_Run_V1", duration: 40 / 60 },
	Jump: { name: "GoldenMovement_Jump_V1", duration: 18 / 60 },
	Fall: { name: "GoldenMovement_Fall_V1", duration: 36 / 60 },
	Land: { name: "GoldenMovement_Land_V1", duration: 13 / 60 },
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
const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const bones = (root) => {
	const r = [];
	root.traverse((o) => {
		if (o.isBone) r.push(o);
	});
	return r;
};
export function validateMovementTracks(clips) {
	assert.deepEqual(
		clips.map((c) => c.name).sort(),
		Object.values(MOVEMENT_CLIPS)
			.map((c) => c.name)
			.sort(),
	);
	for (const [id, spec] of Object.entries(MOVEMENT_CLIPS)) {
		const clip = clips.find((c) => c.name === spec.name);
		assert(Math.abs(clip.duration - spec.duration) < 1e-6, `${id} duration`);
		assert.deepEqual(
			clip.tracks.map((t) => t.name).sort(),
			[
				...MAIN.map((n) => `${n}.quaternion`),
				...(id === "Fall" ? [] : ["pelvis.position"]),
			].sort(),
		);
		for (const t of clip.tracks) {
			assert([...t.times, ...t.values].every(Number.isFinite));
			assert.equal(t.getInterpolation(), THREE.InterpolateLinear);
			assert.equal(t.times[0], 0);
			assert(Math.abs(t.times.at(-1) - spec.duration) < 1e-6);
			for (let i = 1; i < t.times.length; i++)
				assert(t.times[i] > t.times[i - 1]);
			if (t.name === "pelvis.position")
				for (let i = 0; i < t.values.length; i += 3) {
					assert(Math.abs(t.values[i] - t.values[0]) < 1e-6);
					assert(Math.abs(t.values[i + 1] - t.values[1]) < 1e-6);
				}
			if (id === "Run" || id === "Fall")
				assert(
					diff(
						Array.from(t.values.slice(0, t.getValueSize())),
						Array.from(t.values.slice(-t.getValueSize())),
					) < 1e-5,
					`${id} loop seam`,
				);
		}
	}
}
export async function validateGoldenMovement(
	artifactPath,
	targetPaths = [
		"public/assets/derived/authored-humans/everyday-v1/mannequin.glb",
	],
) {
	const source = await loadGlb(artifactPath);
	validateMovementTracks(source.animations);
	let meshCount = 0;
	source.scene.traverse((o) => {
		if (o.isMesh) meshCount++;
	});
	assert.equal(meshCount, 0);
	const targets = [];
	for (const targetPath of targetPaths) {
		const target = await loadGlb(targetPath);
		assert.equal(
			skeletonSignature(await inspectAnimationSource(targetPath)).hash,
			GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
		);
		const reference = bones(target.scene);
		assert.equal(reference.length, 65);
		for (const b of reference) {
			const n = source.scene.getObjectByName(b.name);
			assert(n);
			assert.equal(n.parent.name, b.parent.isBone ? b.parent.name : "Armature");
			assert(
				diff(n.matrix.elements, b.matrix.elements) < 1e-6,
				"Golden rest frame",
			);
		}
		const clips = [];
		for (const clip of source.animations) {
			const actor = clone(target.scene),
				other = clone(target.scene),
				ab = bones(actor),
				ob = bones(other);
			const rest = ob.map((b) => b.matrix.toArray());
			assert(ab.every((b, i) => b !== ob[i]));
			const mixer = new THREE.AnimationMixer(actor);
			const action = mixer.clipAction(clip);
			action.setLoop(THREE.LoopOnce, 1);
			action.clampWhenFinished = true;
			action.play();
			const floor = [],
				positions = [];
			for (let i = 0; i <= 60; i++) {
				mixer.setTime((clip.duration * i) / 60);
				actor.updateMatrixWorld(true);
				actor.traverse((o) => {
					assert(o.matrixWorld.elements.every(Number.isFinite));
					if (o.isSkinnedMesh) o.skeleton.update();
				});
				const bounds = new THREE.Box3().setFromObject(actor, true);
				assert(
					[...bounds.min.toArray(), ...bounds.max.toArray()].every(
						Number.isFinite,
					),
				);
				floor.push(bounds.min.y);
				positions.push(
					actor
						.getObjectByName("pelvis")
						.getWorldPosition(new THREE.Vector3())
						.toArray(),
				);
			}
			const horizontalRange = [0, 2].map(
				(a) =>
					Math.max(...positions.map((p) => p[a])) -
					Math.min(...positions.map((p) => p[a])),
			);
			assert(
				horizontalRange.every((v) => v < 1e-6),
				"No horizontal root motion",
			);
			assert(
				Math.min(...floor) > -0.008,
				`${clip.name} floor clearance: ${Math.min(...floor)}`,
			);
			const held = ab.map((b) => b.matrix.toArray());
			mixer.update(1);
			actor.updateMatrixWorld(true);
			assert(ab.every((b, i) => diff(b.matrix.elements, held[i]) < 1e-6));
			assert(
				ob.every((b, i) => diff(b.matrix.elements, rest[i]) === 0),
				"Independent clone",
			);
			mixer.stopAllAction();
			actor.updateMatrixWorld(true);
			assert(ab.every((b, i) => diff(b.matrix.elements, rest[i]) < 1e-6));
			mixer.uncacheRoot(actor);
			clips.push({
				name: clip.name,
				duration: clip.duration,
				tracks: clip.tracks.length,
				horizontalRange,
				minimumY: Math.min(...floor),
				finalMinimumY: floor.at(-1),
				independentClones: true,
				restRestored: true,
			});
		}
		targets.push({ targetPath, clips });
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
