// V3 transport checks for exactly the frozen neutral/combined pair.
// Images are decoded by Blender; Node checks skinning and the shared clone path.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cloneThreeVisualAssetRoot } from "../../packages/three-asset-preview/src/index.ts";

globalThis.self ??= globalThis;
globalThis.createImageBitmap ??= async () => ({
	close() {},
	width: 1,
	height: 1,
});
const directory = "test-results/authored-human-v3";
const hash = (data) => createHash("sha256").update(data).digest("hex");
async function load(path) {
	const bytes = await readFile(path);
	const gltf = await new GLTFLoader().parseAsync(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		"",
	);
	return { ...gltf, bytes };
}
const collect = (root, property) => {
	const found = [];
	root.traverse((object) => {
		if (object[property]) found.push(object);
	});
	return found;
};
const difference = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const sourceManifest = JSON.parse(
	await readFile(
		"tools/blender-character/experimental/authored-human-v2/manifest.json",
		"utf8",
	),
);
const legacy = await load(
	"public/assets/derived/procedural-humanoids/mannequin-v0/mannequin.glb",
);
const legacyMesh = collect(legacy.scene, "isSkinnedMesh")[0];
const canonical = await load("test-results/authored-human-v3/neutral.glb");
assert.equal(
	hash(canonical.bytes),
	sourceManifest.localExports["neutral.glb"].sha256,
);
const canonicalMesh = collect(canonical.scene, "isSkinnedMesh")[0];
const clips = [];
for (const file of ["idle", "walk-in-place"]) {
	clips.push(
		(
			await load(
				`public/assets/derived/humanoid-animations/golden-reference-v0/${file}.glb`,
			)
		).animations[0],
	);
}
const report = {
	note: "Transport only. Image decoding stubbed; visual failure is not overridden.",
	cases: {},
};
for (const name of ["dressed-neutral", "combined"]) {
	const gltf = await load(`${directory}/${name}.glb`);
	// V3 stopped at body diagnosis: the freshly exported entire asset must remain V2-identical.
	assert.equal(
		hash(gltf.bytes),
		sourceManifest.localExports[`${name}.glb`].sha256,
	);
	const meshes = collect(gltf.scene, "isSkinnedMesh");
	const bones = collect(gltf.scene, "isBone");
	assert.equal(meshes.length, 5);
	assert.equal(bones.length, 65);
	assert.equal(new Set(meshes.map((m) => m.skeleton)).size, 1);
	let weightError = 0,
		restDifference = 0,
		bindDifference = 0;
	for (const mesh of meshes) {
		const { position, skinWeight, skinIndex, uv, _source_vertex } =
			mesh.geometry.attributes;
		assert(uv && skinIndex && skinWeight && _source_vertex);
		assert(Array.from(position.array).every(Number.isFinite));
		assert.equal(Object.keys(mesh.geometry.morphAttributes).length, 0);
		for (let i = 0; i < skinWeight.count; i++) {
			let sum = 0;
			for (let c = 0; c < 4; c++) {
				const w = skinWeight.getComponent(i, c),
					joint = skinIndex.getComponent(i, c);
				assert(Number.isFinite(w) && w >= 0);
				assert(Number.isInteger(joint) && joint >= 0 && joint < 65);
				sum += w;
			}
			weightError = Math.max(weightError, Math.abs(sum - 1));
		}
		for (const [i, bone] of mesh.skeleton.bones.entries()) {
			const li = legacyMesh.skeleton.bones.findIndex(
				(b) => b.name === bone.name,
			);
			assert(li >= 0);
			const reference = legacyMesh.skeleton.bones[li];
			assert.equal(
				bone.parent.isBone ? bone.parent.name : null,
				reference.parent.isBone ? reference.parent.name : null,
			);
			restDifference = Math.max(
				restDifference,
				difference(bone.matrix.elements, reference.matrix.elements),
			);
			const ci = canonicalMesh.skeleton.bones.findIndex(
				(b) => b.name === bone.name,
			);
			bindDifference = Math.max(
				bindDifference,
				difference(
					mesh.skeleton.boneInverses[i].elements,
					canonicalMesh.skeleton.boneInverses[ci].elements,
				),
			);
		}
	}
	assert(weightError < 1e-6);
	assert(restDifference < 1e-6);
	assert(bindDifference < 1e-6);
	const animation = [];
	for (const clip of clips) {
		const first = cloneThreeVisualAssetRoot(gltf.scene),
			second = cloneThreeVisualAssetRoot(gltf.scene);
		const b1 = collect(first, "isBone"),
			b2 = collect(second, "isBone");
		assert(b1.every((b, i) => b !== b2[i] && b !== bones[i]));
		const untouched = b2.map((b) => b.matrix.toArray());
		assert(
			clip.tracks.every((t) =>
				first.getObjectByName(t.name.slice(0, t.name.lastIndexOf("."))),
			),
		);
		const mixer = new THREE.AnimationMixer(first);
		const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		action.play();
		let moved = false;
		for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
			mixer.setTime(clip.duration * fraction);
			first.updateMatrixWorld(true);
			moved ||= b1.some(
				(b, i) =>
					difference(b.matrix.elements, bones[i].matrix.elements) > 1e-4,
			);
			for (const mesh of collect(first, "isSkinnedMesh")) {
				mesh.skeleton.update();
				const vertex = new THREE.Vector3();
				for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
					mesh.getVertexPosition(i, vertex);
					assert(vertex.toArray().every(Number.isFinite));
				}
			}
			assert(
				b2.every((b, i) => difference(b.matrix.elements, untouched[i]) === 0),
			);
		}
		assert(moved);
		mixer.stopAllAction();
		for (const mesh of collect(first, "isSkinnedMesh")) mesh.skeleton.pose();
		first.updateMatrixWorld(true);
		assert(
			b1.every(
				(b, i) =>
					difference(b.matrix.elements, bones[i].matrix.elements) < 1e-6,
			),
		);
		mixer.uncacheRoot(first);
		animation.push({
			name: clip.name,
			tracks: clip.tracks.length,
			samples: 5,
			cloneIsolated: true,
			restRestored: true,
		});
	}
	report.cases[name] = {
		sha256: hash(gltf.bytes),
		meshes: meshes.length,
		joints: bones.length,
		triangles: meshes.reduce((sum, m) => sum + m.geometry.index.count / 3, 0),
		preservedEntireV2Asset: true,
		weightError,
		restDifference,
		bindDifference,
		animation,
	};
}
await writeFile(
	`${directory}/roundtrip.json`,
	JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
