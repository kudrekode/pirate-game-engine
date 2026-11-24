import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { AnimationMixer, LoadingManager, PropertyBinding } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
	bakeDirectory,
	extractLocomotionClip,
	locomotionNames,
} from "./golden-locomotion-clips.mjs";

test("installed locomotion delivery clips reproduce every baked key and bind to the Chapter One player", async () => {
	// Image pixels aren't used to bind or sample an animation.
	const loader = new GLTFLoader(
		new LoadingManager().setURLModifier((url) =>
			url.endsWith(".jpg") ? "data:image/jpeg;base64,AA==" : url,
		),
	);
	const priorSelf = globalThis.self;
	const priorBitmap = globalThis.createImageBitmap;
	globalThis.self = globalThis;
	globalThis.createImageBitmap = async () => ({
		width: 1,
		height: 1,
		close() {},
	});
	async function load(bytes) {
		return loader.parseAsync(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
			"",
		);
	}
	try {
		const player = await load(
			await readFile("public/assets/hollow-kingdom/wayfarer.glb"),
		);
		for (const name of locomotionNames) {
			const original = await readFile(join(bakeDirectory, `${name}.glb`));
			const packed = await readFile(join(bakeDirectory, `${name}.clip.glb`));
			assert.deepEqual(packed, extractLocomotionClip(original));
			const full = await load(original);
			const small = await load(packed);
			assert.equal(small.parser.json.meshes, undefined);
			assert.equal(small.parser.json.images, undefined);
			assert.equal(small.animations.length, 1);
			const clip = small.animations[0],
				reference = full.animations[0];
			assert.equal(clip.duration, reference.duration);
			assert.equal(clip.name, reference.name);
			assert.equal(clip.tracks.length, reference.tracks.length);
			for (const [i, track] of clip.tracks.entries()) {
				const ref = reference.tracks[i];
				assert.equal(track.name, ref.name);
				assert.equal(track.getInterpolation(), ref.getInterpolation());
				assert.deepEqual(track.times, ref.times);
				assert.deepEqual(track.values, ref.values);
				assert.ok(
					player.scene.getObjectByName(
						PropertyBinding.parseTrackName(track.name).nodeName,
					),
				);
			}
			function pose(animation) {
				const mixer = new AnimationMixer(player.scene);
				mixer.clipAction(animation).play();
				const matrices = [];
				for (const t of [0, 0.25, 0.5, 0.75, 0.999]) {
					mixer.setTime(animation.duration * t);
					player.scene.updateMatrixWorld(true);
					player.scene.traverse((o) => {
						if (o.isBone) matrices.push(...o.matrixWorld.elements);
					});
				}
				mixer.stopAllAction();
				mixer.uncacheRoot(player.scene);
				assert.ok(matrices.length);
				return matrices;
			}
			assert.deepEqual(pose(clip), pose(reference));
		}
	} finally {
		if (priorSelf === undefined) delete globalThis.self;
		else globalThis.self = priorSelf;
		if (priorBitmap === undefined) delete globalThis.createImageBitmap;
		else globalThis.createImageBitmap = priorBitmap;
	}
});
