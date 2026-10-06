// V4 weight-only structural and transport checks for neutral/combined.
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
const directory = "test-results/authored-human-v4/joint-centred-v1";
const baselineDirectory = "test-results/authored-human-v4/baseline";
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
const canonical = await load(`${baselineDirectory}/dressed-neutral.glb`);
assert.equal(
	hash(canonical.bytes),
	sourceManifest.localExports["dressed-neutral.glb"].sha256,
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
	note: "Weight-only transport preservation. Image decoding stubbed; visual acceptance is separate.",
	cases: {},
};
let neutralWeights;
for (const name of ["dressed-neutral", "combined"]) {
	const gltf = await load(`${directory}/${name}.glb`);

	const baseline = await load(`${baselineDirectory}/${name}.glb`);
	assert.equal(
		hash(baseline.bytes),
		sourceManifest.localExports[`${name}.glb`].sha256,
	);
	const sourceMeshes = collect(baseline.scene, "isSkinnedMesh");
	const weightsManifest = JSON.parse(
		await readFile(`${directory}/weights.json`, "utf8"),
	);
	const changedIds = new Set(weightsManifest.changedVertices.map((v) => v.id));
	const toWeights = (mesh, i) => {
		const result = {};
		for (let c = 0; c < 4; c++) {
			const weight = mesh.geometry.attributes.skinWeight.getComponent(i, c);
			if (weight > 0)
				result[
					mesh.skeleton.bones[
						mesh.geometry.attributes.skinIndex.getComponent(i, c)
					].name
				] = weight;
		}
		return result;
	};
	const changed = new Set();
	const weightsBySource = {};
	for (const mesh of collect(gltf.scene, "isSkinnedMesh")) {
		const old = sourceMeshes.find((m) => m.name === mesh.name);
		assert(old, mesh.name);
		assert.deepEqual(
			mesh.geometry.index.array,
			old.geometry.index.array,
			"Triangle topology changed",
		);
		assert.deepEqual(
			Object.keys(mesh.geometry.attributes).sort(),
			Object.keys(old.geometry.attributes).sort(),
		);
		for (const [attribute, data] of Object.entries(mesh.geometry.attributes)) {
			if (!["skinWeight", "skinIndex"].includes(attribute)) {
				assert.deepEqual(
					data.array,
					old.geometry.attributes[attribute].array,
					`${mesh.name}/${attribute} changed`,
				);
			}
		}
		for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
			const after = toWeights(mesh, i),
				before = toWeights(old, i);
			const id = mesh.geometry.attributes._source_vertex.getX(i);
			const error = Math.max(
				...Object.keys({ ...before, ...after }).map((b) =>
					Math.abs((before[b] ?? 0) - (after[b] ?? 0)),
				),
			);
			if (error > 1e-7) {
				assert(
					mesh.name.startsWith("SuperHero_Male"),
					"Edited another mesh's weights",
				);
				assert(
					changedIds.has(id),
					`Weight edit escaped authored region at ${id}`,
				);
				changed.add(id);
			}
			if (mesh.name.startsWith("SuperHero_Male")) weightsBySource[id] = after;
		}
	}
	assert(changed.size > 0 && changed.size === changedIds.size);
	if (neutralWeights)
		assert.deepEqual(
			weightsBySource,
			neutralWeights,
			"Identities do not share the same weights",
		);
	else neutralWeights = weightsBySource;
	const json = gltf.parser.json,
		oldJson = baseline.parser.json;
	for (const field of ["materials", "samplers", "textures", "skins", "nodes"]) {
		assert.deepEqual(json[field], oldJson[field], `${field} changed`);
	}
	const imageHashes = (g) => {
		const binaryStart = 20 + g.bytes.readUInt32LE(12) + 8;
		return g.parser.json.images.map((im) => {
			const v = g.parser.json.bufferViews[im.bufferView];
			return hash(
				g.bytes.subarray(
					binaryStart + (v.byteOffset ?? 0),
					binaryStart + (v.byteOffset ?? 0) + v.byteLength,
				),
			);
		});
	};
	assert.deepEqual(
		imageHashes(gltf),
		imageHashes(baseline),
		"Embedded source materials/images changed",
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
		changedBodyVertices: changed.size,
		preservedNonWeightAttributes: true,
		identicalWeightsAcrossIdentities: true,
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
