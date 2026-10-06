// Isolated GLB evidence, deliberately separate from the production family validator.
// Usage: node --experimental-strip-types tools/blender-character/validate-authored-human-v2.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cloneThreeVisualAssetRoot } from "../../packages/three-asset-preview/src/index.ts";

const directory = "test-results/authored-human-v2";
globalThis.self ??= globalThis;
// This checks geometry/rig transport; Blender renders decode the real textures.
globalThis.createImageBitmap ??= async () => ({
	close() {},
	width: 1,
	height: 1,
});
const hash = (data) => createHash("sha256").update(data).digest("hex");
async function load(path) {
	const bytes = await readFile(path);
	return {
		...(await new GLTFLoader().parseAsync(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
			"",
		)),
		bytes,
	};
}
const meshes = (root) => {
	const found = [];
	root.traverse((o) => {
		if (o.isSkinnedMesh) found.push(o);
	});
	return found;
};
const bones = (root) => {
	const found = [];
	root.traverse((o) => {
		if (o.isBone) found.push(o);
	});
	return found;
};
const maxDifference = (a, b) =>
	Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const legacy = await load(
	"public/assets/derived/procedural-humanoids/mannequin-v0/mannequin.glb",
);
const canonical = await load(`${directory}/neutral.glb`);
const canonicalBones = bones(canonical.scene);
const legacyBones = new Map(bones(legacy.scene).map((b) => [b.name, b]));
const restDifference = Math.max(
	...canonicalBones.map((b) => {
		const old = legacyBones.get(b.name);
		assert(old, b.name);
		assert.equal(
			b.parent.isBone ? b.parent.name : null,
			old.parent.isBone ? old.parent.name : null,
		);
		return maxDifference(b.matrix.elements, old.matrix.elements);
	}),
);
assert.equal(canonicalBones.length, 65);
assert(restDifference < 1e-6);
const clips = [];
for (const file of ["idle", "walk-in-place"]) {
	const source = await load(
		`public/assets/derived/humanoid-animations/golden-reference-v0/${file}.glb`,
	);
	clips.push(source.animations[0]);
}
const cases = JSON.parse(
	await readFile(`${directory}/targets.json`, "utf8"),
).cases;
const report = {
	note: "Node image decode is stubbed. No browser or visual approval is implied.",
	restDifference,
	cases: {},
};
let referenceTopology;
for (const name of Object.keys(cases)) {
	const gltf = await load(`${directory}/${name}.glb`);
	const root = gltf.scene;
	const items = meshes(root);
	assert.equal(items.length, 5);
	assert.equal(bones(root).length, 65);
	assert.equal(new Set(items.map((m) => m.skeleton)).size, 1);
	// glTF may duplicate source vertices at split-normal boundaries. Compare the
	// preserved canonical IDs, triangles and per-corner UVs, not export dedup order.
	const topology = items.map((m) => {
		const ids = m.geometry.attributes._source_vertex;
		assert(ids, "Missing canonical source IDs");
		const corners = Array.from(m.geometry.index.array, (i) => [
			ids.getX(i),
			m.geometry.attributes.uv.getX(i),
			m.geometry.attributes.uv.getY(i),
		]);
		return {
			name: m.name,
			canonicalVertices: new Set(ids.array).size,
			corners: hash(JSON.stringify(corners)),
		};
	});
	if (!referenceTopology) referenceTopology = topology;
	assert.deepEqual(
		topology,
		referenceTopology,
		"Identity changed topology or UVs",
	);
	let weightError = 0;
	for (const m of items) {
		const { position, skinWeight, skinIndex, uv } = m.geometry.attributes;
		assert(uv && skinIndex && skinWeight);
		assert(Array.from(position.array).every(Number.isFinite));
		assert.equal(
			Object.keys(m.geometry.morphAttributes).length,
			0,
			"Identity must be baked",
		);
		for (let i = 0; i < skinWeight.count; i++) {
			const ws = [
				skinWeight.getX(i),
				skinWeight.getY(i),
				skinWeight.getZ(i),
				skinWeight.getW(i),
			];
			assert(ws.every((w) => w >= 0 && Number.isFinite(w)));
			weightError = Math.max(
				weightError,
				Math.abs(ws.reduce((a, b) => a + b) - 1),
			);
		}
		for (const [i, bone] of m.skeleton.bones.entries()) {
			const canonicalBone = canonicalBones.find((b) => b.name === bone.name);
			assert(
				maxDifference(bone.matrix.elements, canonicalBone.matrix.elements) <
					1e-6,
			);
			const canonicalMesh = meshes(canonical.scene)[0];
			const ci = canonicalMesh.skeleton.bones.findIndex(
				(b) => b.name === bone.name,
			);
			assert(
				maxDifference(
					m.skeleton.boneInverses[i].elements,
					canonicalMesh.skeleton.boneInverses[ci].elements,
				) < 1e-6,
			);
		}
	}
	assert(weightError < 0.001);
	const animation = [];
	for (const clip of clips) {
		const first = cloneThreeVisualAssetRoot(root);
		const second = cloneThreeVisualAssetRoot(root);
		const b1 = bones(first),
			b2 = bones(second),
			sourceBones = bones(root);
		const untouched = b2.map((b) => b.matrix.toArray());
		assert(b1.every((b, i) => b !== b2[i] && b !== sourceBones[i]));
		const missing = clip.tracks.filter(
			(t) => !first.getObjectByName(t.name.slice(0, t.name.lastIndexOf("."))),
		);
		assert.equal(missing.length, 0);
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
					maxDifference(b.matrix.elements, sourceBones[i].matrix.elements) >
					0.0001,
			);
			for (const mesh of meshes(first)) {
				mesh.skeleton.update();
				const v = new THREE.Vector3();
				for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
					mesh.getVertexPosition(i, v);
					assert(v.toArray().every(Number.isFinite));
				}
			}
			assert(
				b2.every(
					(b, i) => maxDifference(b.matrix.elements, untouched[i]) === 0,
				),
			);
		}
		assert(moved, "Clip did not move the character");
		mixer.stopAllAction();
		for (const mesh of meshes(first)) mesh.skeleton.pose();
		first.updateMatrixWorld(true);
		assert(
			b1.every(
				(b, i) =>
					maxDifference(b.matrix.elements, sourceBones[i].matrix.elements) <
					1e-6,
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
		bytes: gltf.bytes.length,
		meshes: items.length,
		triangles: items.reduce((n, m) => n + m.geometry.index.count / 3, 0),
		weightError,
		animation,
	};
}
await writeFile(
	`${directory}/roundtrip.json`,
	JSON.stringify(report, null, 2) + "\n",
);
console.log(
	JSON.stringify({
		cases: Object.keys(report.cases).length,
		restDifference,
		passed: true,
	}),
);
