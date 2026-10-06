import { CLOTHING_SLOTS } from "./clothing-contract.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { inspectAnimationSource } from "../animation-retargeting/animation-source-inspection.mjs";
import {
	loadGlb,
	semanticSnapshot,
	analyzeArtifact,
	skeletonSignature,
} from "./procedural-mannequin-roundtrip.mjs";
import {
	canonicalSrgbHexToLinear,
	GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE,
} from "./procedural-mannequin-contract.mjs";

const hash = (value) =>
	createHash("sha256")
		.update(typeof value === "string" ? value : JSON.stringify(value))
		.digest("hex");
const collect = (root, property) => {
	const items = [];
	root.traverse((o) => {
		if (o[property]) items.push(o);
	});
	return items;
};
const difference = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

export async function validateAuthoredHumanArtifact({
	artifactPath,
	recipe,
	workspaceRoot = process.cwd(),
	cloneRoot = clone,
}) {
	const [gltf, reference, inspection, idle, walk] = await Promise.all([
		loadGlb(artifactPath),
		loadGlb(
			path.join(
				workspaceRoot,
				"public/assets/derived/procedural-humanoids/mannequin-v0/mannequin.glb",
			),
		),
		inspectAnimationSource(artifactPath),
		loadGlb(
			path.join(
				workspaceRoot,
				"public/assets/derived/humanoid-animations/golden-reference-v0/idle.glb",
			),
		),
		loadGlb(
			path.join(
				workspaceRoot,
				"public/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.glb",
			),
		),
	]);
	const root = gltf.scene,
		meshes = collect(root, "isSkinnedMesh"),
		bones = collect(root, "isBone");
	const refBones = new Map(
		collect(reference.scene, "isBone").map((b) => [b.name, b]),
	);
	assert.equal(bones.length, 65);
	assert.equal(new Set(meshes.map((m) => m.skeleton)).size, 1);
	assert.equal(gltf.animations.length, 0);
	for (const bone of bones) {
		const old = refBones.get(bone.name);
		assert(old);
		assert.equal(
			bone.parent.isBone ? bone.parent.name : null,
			old.parent.isBone ? old.parent.name : null,
		);
		assert(
			difference(bone.matrix.elements, old.matrix.elements) < 1e-6,
			`Rest changed: ${bone.name}`,
		);
	}
	const body = meshes.find((m) => m.name.startsWith("SuperHero_Male"));
	assert(body);
	const hair = meshes.filter((m) => m.name.startsWith("V2_Buzzed"));
	assert.equal(hair.length, recipe.components.hair === "none" ? 0 : 1);
	const activeSlots = CLOTHING_SLOTS.filter(
		(slot) => recipe.clothing?.[slot] && recipe.clothing[slot] !== "none",
	);
	const garmentNames = {
		top: "Everyday_Top",
		bottoms: "Everyday_Trousers",
		footwear: "Everyday_Boots",
	};
	const garments = meshes.filter((m) => m.name.startsWith("Everyday_"));
	assert.equal(meshes.length, hair.length + 3 + garments.length);
	for (const slot of CLOTHING_SLOTS) {
		const pieces = garments.filter((m) =>
			m.name.startsWith(garmentNames[slot]),
		);
		assert.equal(
			pieces.length,
			activeSlots.includes(slot) ? 2 : 0,
			`Garment primitives: ${slot}`,
		);
		for (const m of pieces) {
			const factor = m.material.name.endsWith("_edge") ? 0.7 : 1;
			assert(
				difference(
					m.material.color.toArray(),
					canonicalSrgbHexToLinear(recipe.clothing[slot].color).map(
						(v) => v * factor,
					),
				) < 1e-6,
				`Garment tint: ${slot}`,
			);
			assert.equal(m.material.metalness, 0);
			assert(
				Math.abs(m.material.roughness - (slot === "footwear" ? 0.7 : 0.86)) <
					1e-6,
			);
			assert(m.geometry.index.count > 300, `Missing garment surface: ${slot}`);
		}
	}
	const coverage = JSON.parse(
		await readFile(
			path.join(
				workspaceRoot,
				"tools/blender-character/clothing/everyday-v1/coverage.json",
			),
			"utf8",
		),
	);
	const hidden = new Set(activeSlots.flatMap((slot) => coverage.masks[slot]));
	assert.equal(
		body.geometry.index.count / 3,
		coverage.bodyPolygonCount - hidden.size,
		"Body coverage differs from the garment-specific masks",
	);
	let weightError = 0;
	for (const mesh of meshes) {
		const { position, skinWeight, skinIndex, uv } = mesh.geometry.attributes;
		assert(position && skinWeight && skinIndex && uv);
		assert(Array.from(position.array).every(Number.isFinite));
		assert(Array.from(uv.array).every(Number.isFinite));
		assert.equal(Object.keys(mesh.geometry.morphAttributes).length, 0);
		for (let i = 0; i < position.count; i++) {
			let sum = 0;
			for (let j = 0; j < 4; j++) {
				const w = skinWeight.getComponent(i, j),
					index = skinIndex.getComponent(i, j);
				assert(
					Number.isFinite(w) &&
						w >= 0 &&
						w <= 1 &&
						Number.isInteger(index) &&
						index >= 0 &&
						index < 65,
				);
				if (hair.includes(mesh) && w > 0)
					assert.equal(mesh.skeleton.bones[index].name, "Head");
				sum += w;
			}
			weightError = Math.max(weightError, Math.abs(sum - 1));
		}
		for (const [i, bone] of mesh.skeleton.bones.entries()) {
			const bind = bone.matrix.clone();
			for (let parent = bone.parent; parent?.isBone; parent = parent.parent)
				bind.premultiply(parent.matrix);
			assert(
				difference(
					mesh.skeleton.boneInverses[i].elements,
					bind.invert().elements,
				) < 1e-6,
				`Inconsistent bind: ${bone.name}`,
			);
		}
	}
	assert(weightError < 1e-6);
	const signature = skeletonSignature(inspection).hash;
	assert.equal(signature, GOLDEN_HUMANOID_EXPORTED_REST_SIGNATURE);
	root.updateMatrixWorld(true);
	const bounds = new THREE.Box3().setFromObject(
			activeSlots.includes("footwear") ? root : body,
			true,
		),
		size = bounds.getSize(new THREE.Vector3());
	assert(
		Math.abs(size.y - recipe.proportions.height) <
			(activeSlots.includes("footwear") ? 0.01 : 0.002),
		`Height ${size.y}`,
	);
	const bodyMat = body.material;
	assert(bodyMat.map && bodyMat.normalMap, "Authored skin textures missing");
	assert(
		difference(
			bodyMat.color.toArray(),
			canonicalSrgbHexToLinear(recipe.appearance.skin.color),
		) < 1e-6,
	);
	assert(Math.abs(bodyMat.roughness - recipe.appearance.skin.roughness) < 1e-6);
	if (hair.length) {
		assert(hair[0].material.normalMap);
		assert(
			difference(
				hair[0].material.color.toArray(),
				canonicalSrgbHexToLinear(recipe.appearance.hair.color),
			) < 1e-6,
		);
	}
	const animations = [];
	for (const clip of [idle.animations[0], walk.animations[0]]) {
		assert(clip);
		const first = cloneRoot(root),
			second = cloneRoot(root),
			b1 = collect(first, "isBone"),
			b2 = collect(second, "isBone");
		const rest = bones.map((b) => b.matrix.toArray());
		assert(b1.every((b, i) => b !== b2[i] && b !== bones[i]));
		assert(
			clip.tracks.every((t) =>
				first.getObjectByName(t.name.slice(0, t.name.lastIndexOf("."))),
			),
		);
		const mixer = new THREE.AnimationMixer(first);
		mixer.clipAction(clip).play();
		let moved = false;
		for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
			mixer.setTime(clip.duration * fraction);
			first.updateMatrixWorld(true);
			moved ||= b1.some(
				(b, i) => difference(b.matrix.elements, rest[i]) > 0.0001,
			);
			for (const m of collect(first, "isSkinnedMesh")) {
				m.skeleton.update();
				const p = new THREE.Vector3();
				for (let i = 0; i < m.geometry.attributes.position.count; i++) {
					m.getVertexPosition(i, p);
					assert(p.toArray().every(Number.isFinite));
				}
			}
			assert(b2.every((b, i) => difference(b.matrix.elements, rest[i]) === 0));
		}
		assert(moved);
		mixer.stopAllAction();
		first.updateMatrixWorld(true);
		assert(b1.every((b, i) => difference(b.matrix.elements, rest[i]) < 1e-6));
		mixer.uncacheRoot(first);
		animations.push({
			name: clip.name,
			tracks: clip.tracks.length,
			samples: 5,
			cloneIsolated: true,
			restRestored: true,
		});
	}
	const semantic = semanticSnapshot(root),
		artifact = analyzeArtifact(root);
	// Textures are included in the GLB hash; mesh/material/hierarchy hashes drive
	// existing semantic determinism alongside mandatory binary comparison.
	return {
		passed: true,
		checks: {
			clothing: true,
			coverage: true,
			rig: true,
			binds: true,
			weights: true,
			uv: true,
			materials: true,
			hair: true,
			height: true,
			animations: true,
			clones: true,
		},
		animations,
		artifact,
		inspection: { jointCount: 65 },
		skeletonSignature: signature,
		semanticSnapshot: semantic,
		semanticHash: hash(semantic),
		geometrySemanticHash: hash(semantic.meshes),
		materialSemanticHash: hash(semantic.materials),
		faceGeometrySemanticHash: hash(
			semantic.meshes.filter((m) => m.name.startsWith("Eyes")),
		),
		geometry: {
			maximumInfluences: 4,
			maximumWeightSumError: weightError,
			outOfRangeJointCount: 0,
			unweightedVertexCount: 0,
			meshCount: 1,
			vertexCount: body.geometry.attributes.position.count,
			triangleCount: body.geometry.index.count / 3,
			bounds: {
				dimensions: size.toArray(),
				maximumY: bounds.max.y,
				minimumY: bounds.min.y,
			},
		},
		topologyFingerprint: hash(
			meshes.map((m) => {
				const ids = m.geometry.attributes._source_vertex,
					uv = m.geometry.attributes.uv;
				assert(ids);
				return [
					m.name,
					Array.from(m.geometry.index.array, (i) => [
						ids.getX(i),
						uv.getX(i),
						uv.getY(i),
					]),
				];
			}),
		),
		outputHash: createHash("sha256")
			.update(await readFile(artifactPath))
			.digest("hex"),
	};
}
