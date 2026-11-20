import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadGlb } from "./procedural-mannequin-roundtrip.mjs";
import {
	validateGoldenInteraction,
	validateInteractionTracks,
} from "./golden-interaction-roundtrip.mjs";
const artifact =
	"public/assets/derived/humanoid-animations/golden-interaction-v1/actions.glb";
test("installed Interact/Pickup library round-trips with Golden rest, finite deformation, recovery and isolated clones", async () => {
	const report = await validateGoldenInteraction(artifact);
	assert.equal(report.targets[0].clips.length, 2);
	assert.equal(report.meshCount, 0);
});
test("interaction channel contract rejects missing clips and horizontal root travel", async () => {
	const { animations } = await loadGlb(artifact);
	assert.throws(() => validateInteractionTracks(animations.slice(1)));
	const broken = animations.map((c) => c.clone());
	broken[0].tracks.find((t) => t.name === "pelvis.position").values[3] += 0.1;
	assert.throws(() => validateInteractionTracks(broken));
});
test("the installed Kenney chest uses an independent real lid clip with a stable held-open pose", async () => {
	const source = await loadGlb("public/assets/pirate-demo/crate.glb");
	assert.deepEqual(
		source.animations.map((c) => c.name),
		["open", "close", "open-close"],
	);
	const clip = source.animations.find((c) => c.name === "open");
	assert(Math.abs(clip.duration - 0.3) < 1e-6);
	assert.deepEqual(
		clip.tracks.map((t) => t.name),
		["lid.quaternion"],
	);
	const a = clone(source.scene),
		b = clone(source.scene),
		lid = a.getObjectByName("lid"),
		other = b.getObjectByName("lid");
	const closed = other.quaternion.clone();
	const mixer = new THREE.AnimationMixer(a),
		action = mixer.clipAction(clip);
	action.setLoop(THREE.LoopOnce, 1);
	action.clampWhenFinished = true;
	action.play();
	mixer.update(0.15);
	assert(lid.quaternion.angleTo(closed) > 0.1);
	assert(other.quaternion.equals(closed));
	mixer.update(0.2);
	const final = lid.quaternion.clone();
	mixer.update(1);
	assert(lid.quaternion.equals(final));
	assert(lid.quaternion.angleTo(closed) > 0.5);
	mixer.stopAllAction();
	mixer.uncacheRoot(a);
});
