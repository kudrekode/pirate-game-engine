import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnimationMixer, LoadingManager, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createServer } from "vite";

// Stationary rig, no GPU or real-time clock. Sample installed clips on the same
// Three objects and with the same playback preparation as Play. The original
// decoded clips provide the paired control for the corrected gaits.
const loader = new GLTFLoader(
	new LoadingManager().setURLModifier((url) =>
		url.endsWith(".jpg") ? "data:image/jpeg;base64,AA==" : url,
	),
);
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({
	width: 1,
	height: 1,
	close() {},
});
async function load(path) {
	const bytes = await readFile(`public/assets/${path}.glb`);
	return loader.parseAsync(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		"",
	);
}
const round = (n) => Math.round(n * 1e6) / 1e6;

function observe(root, clip, names) {
	const bones = names.map((name) => {
		const bone = root.getObjectByName(name);
		assert.ok(bone?.isBone, name);
		return bone;
	});
	const mixer = new AnimationMixer(root);
	const action = mixer.clipAction(clip).play();
	const cycle = clip.duration;
	mixer.update(0);
	const pose = () => {
		root.updateMatrixWorld(true);
		return bones.map((bone) =>
			new Vector3().setFromMatrixPosition(bone.matrixWorld),
		);
	};
	const at = (time) => {
		mixer.setTime(time);
		return pose();
	};
	const distance = (a, b) => Math.max(...a.map((p, i) => p.distanceTo(b[i])));
	try {
		// Start from rest locally, then run 1,200 actual mixer updates.
		let previous = pose(),
			previousTime = action.time,
			wraps = 0,
			worstStep = 0;
		for (let frame = 0; frame < 1200; frame++) {
			mixer.update(1 / 60);
			const current = pose();
			worstStep = Math.max(worstStep, distance(previous, current));
			if (action.time < previousTime) wraps++;
			previousTime = action.time;
			previous = current;
		}
		const seam = at(cycle),
			epsilon = 0.0001;
		const incoming = at(cycle - epsilon),
			outgoing = at(cycle + epsilon);
		const speed = (a, b, i) => round(a[i].distanceTo(b[i]) / epsilon);
		const seamSpeeds = Object.fromEntries(
			names.map((name, i) => [
				name,
				[speed(incoming, seam, i), speed(seam, outgoing, i)],
			]),
		);
		// Peak magnitude of the acceleration vector, at 240 Hz, over the two
		// source intervals straddling the boundary. Same sample phases in A/B.
		let peakAcceleration = 0;
		const dt = 1 / 240;
		const window = 1 / 30;
		for (let offset = -window; offset <= window + 1e-9; offset += dt) {
			const now = cycle + offset,
				a = at(now - dt),
				b = at(now),
				c = at(now + dt);
			for (const [i, p] of b.entries()) {
				peakAcceleration = Math.max(
					peakAcceleration,
					a[i].add(c[i]).addScaledVector(p, -2).length() / (dt * dt),
				);
			}
		}
		const ref = at(0);
		const keyPoses = Array.from(clip.tracks[0].times, (t) => at(t));
		return {
			keyPoses,
			result: {
				seconds: 20,
				wraps,
				worstStep: round(worstStep),
				endpointDistance: round(distance(ref, at(cycle - 1e-7))),
				peakSeamAcceleration: round(peakAcceleration),
				seamSpeeds,
			},
		};
	} finally {
		mixer.stopAllAction();
		mixer.uncacheRoot(root);
	}
}

const modules = await createServer({
	configFile: false,
	appType: "custom",
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, ws: false, watch: null },
	ssr: { noExternal: ["@adventure-game-builder/three-asset-preview"] },
});
try {
	const { prepareThreeCharacterAnimationClip } = await modules.ssrLoadModule(
		"/src/runtime/three/threeCharacterAnimation.ts",
	);
	const { getThreeVisualAssetDefinition } = await modules.ssrLoadModule(
		"/src/runtime/three/threeVisualAssetRegistry.ts",
	);
	const horse = await load("hollow-kingdom/horse"),
		player = await load("hollow-kingdom/wayfarer");
	const results = {};
	for (const [rig, assetId, state, names] of [
		[player, "mere-wayfarer", "walk", ["pelvis", "foot_l", "foot_r"]],
		[player, "mere-wayfarer", "run", ["pelvis", "foot_l", "foot_r"]],
		[
			horse,
			"mere-horse",
			"walk",
			[
				"Saddle",
				"forePasternL",
				"forePasternR",
				"hindPasternL",
				"hindPasternR",
			],
		],
		[
			horse,
			"mere-horse",
			"run",
			[
				"Saddle",
				"forePasternL",
				"forePasternR",
				"hindPasternL",
				"hindPasternR",
			],
		],
		[player, "mere-wayfarer", "ride", ["pelvis", "foot_l", "foot_r"]],
	]) {
		const asset = getThreeVisualAssetDefinition(assetId);
		const mapping = asset.animations[state];
		const source = getThreeVisualAssetDefinition(mapping.assetId ?? assetId);
		const gltf =
			source.id === assetId
				? rig
				: await load(
						source.url.replace(/^\/assets\//, "").replace(/\.glb$/, ""),
					);
		const clip = gltf.animations.find((clip) => clip.name === mapping.clipName);
		assert.ok(clip);
		const prepared = prepareThreeCharacterAnimationClip(
			source.id,
			clip,
			rig.scene,
		);
		assert.equal(prepared.status, "prepared");
		const before = observe(rig.scene, clip, names),
			after = observe(rig.scene, prepared.clip, names);
		let keyError = 0;
		for (const [i, pose] of before.keyPoses.entries())
			for (const [j, bone] of pose.entries())
				keyError = Math.max(keyError, bone.distanceTo(after.keyPoses[i][j]));
		assert.ok(keyError < 1e-5, `authored key pose changed for ${clip.name}`);
		results[clip.name] = {
			period: clip.duration,
			keyError,
			source: before.result,
			prepared: after.result,
		};
	}
	console.log(JSON.stringify(results, null, 2));
} finally {
	await modules.close();
}
