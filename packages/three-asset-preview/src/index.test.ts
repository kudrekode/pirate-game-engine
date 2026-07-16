import * as THREE from "three";
import { describe, expect, test } from "vitest";
import {
	analyzeThreeVisualAssetRoot,
	cloneThreeVisualAssetRoot,
	GOLDEN_REFERENCE_HUMANOID_ASSET,
	GOLDEN_REFERENCE_IDLE_BAKED_ASSET,
	GOLDEN_REFERENCE_WALK_BAKED_ASSET,
	PROCEDURAL_MANNEQUIN_V0_ASSET,
	resolveThreeVisualAssetResourceUrl,
} from "./index";

describe("shared Three asset preview", () => {
	test("keeps Golden Reference resource aliases scoped and suffix-safe", () => {
		expect(
			resolveThreeVisualAssetResourceUrl(
				GOLDEN_REFERENCE_HUMANOID_ASSET,
				"textures/T_Eye_Normal_png.png?cache=1",
			),
		).toBe("textures/T_Eye_Normal.png?cache=1");
		expect(
			resolveThreeVisualAssetResourceUrl(
				GOLDEN_REFERENCE_HUMANOID_ASSET,
				"textures/unrelated.png",
			),
		).toBe("textures/unrelated.png");
	});

	test("maps the procedural mannequin to the canonical offline clips", () => {
		expect(PROCEDURAL_MANNEQUIN_V0_ASSET).toMatchObject({
			animations: GOLDEN_REFERENCE_HUMANOID_ASSET.animations,
			category: "character",
			id: "procedural-mannequin-v0",
			kind: "glb",
			url: expect.stringMatching(
				/procedural-humanoids\/mannequin-v0\/mannequin\.glb$/u,
			),
		});
	});

	test("defines explicit offline-baked animation sources", () => {
		expect(GOLDEN_REFERENCE_HUMANOID_ASSET.animations).toEqual({
			idle: {
				assetId: GOLDEN_REFERENCE_IDLE_BAKED_ASSET.id,
				clipName: "GoldenReference_Idle",
			},
			walk: {
				assetId: GOLDEN_REFERENCE_WALK_BAKED_ASSET.id,
				clipName: "GoldenReference_Walk_InPlace",
			},
		});
		expect(GOLDEN_REFERENCE_IDLE_BAKED_ASSET).toMatchObject({
			animationOnly: true,
			kind: "glb",
			url: expect.stringMatching(/idle\.glb$/u),
		});
		expect(GOLDEN_REFERENCE_WALK_BAKED_ASSET).toMatchObject({
			animationOnly: true,
			kind: "glb",
			url: expect.stringMatching(/walk-in-place\.glb$/u),
		});
	});

	test("reports deterministic mesh and animation analysis", () => {
		const root = new THREE.Group();
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 2, 0], 3),
		);
		root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
		const clip = new THREE.AnimationClip("Idle", 1, []);

		const analysis = analyzeThreeVisualAssetRoot(root, [clip]);

		expect(analysis).toMatchObject({
			animationClips: [{ duration: 1, name: "Idle", trackCount: 0 }],
			bounds: { dimensions: { x: 1, y: 2, z: 0 } },
			materialCount: 1,
			meshCount: 1,
			triangleCount: 1,
			vertexCount: 3,
		});
	});

	test("creates independent skeleton state for skinned clones", () => {
		const root = new THREE.Group();
		const bone = new THREE.Bone();
		bone.name = "pelvis";
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
		);
		geometry.setAttribute(
			"skinIndex",
			new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
		);
		geometry.setAttribute(
			"skinWeight",
			new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
		);
		const mesh = new THREE.SkinnedMesh(
			geometry,
			new THREE.MeshStandardMaterial(),
		);
		mesh.add(bone);
		mesh.bind(new THREE.Skeleton([bone]));
		root.add(mesh);

		const first = cloneThreeVisualAssetRoot(root, "skeleton-utils");
		const second = cloneThreeVisualAssetRoot(root, "skeleton-utils");
		const firstMesh = first.getObjectByProperty(
			"isSkinnedMesh",
			true,
		) as THREE.SkinnedMesh;
		const secondMesh = second.getObjectByProperty(
			"isSkinnedMesh",
			true,
		) as THREE.SkinnedMesh;

		expect(firstMesh.geometry).toBe(secondMesh.geometry);
		expect(firstMesh.skeleton).not.toBe(secondMesh.skeleton);
		expect(firstMesh.skeleton.bones[0]).not.toBe(secondMesh.skeleton.bones[0]);
		firstMesh.skeleton.bones[0].rotation.x = 0.5;
		expect(secondMesh.skeleton.bones[0].rotation.x).toBeCloseTo(0);
	});
});
