import * as THREE from "three";
import { describe, expect, test, vi } from "vitest";
import {
	analyzeThreeVisualAssetRoot,
	clearThreeVisualAssetCacheForTests,
	cloneThreeVisualAssetRoot,
	disposeThreeVisualAssetCacheEntry,
	GOLDEN_REFERENCE_HUMANOID_ASSET,
	GOLDEN_REFERENCE_IDLE_BAKED_ASSET,
	GOLDEN_REFERENCE_WALK_BAKED_ASSET,
	PROCEDURAL_MANNEQUIN_V0_ASSET,
	prepareThreeVisualAssetMaterials,
	requestThreeVisualAsset,
	resolveThreeVisualAssetResourceUrl,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./index";

describe("shared Three asset preview", () => {
	test.each([
		["Golden", GOLDEN_REFERENCE_HUMANOID_ASSET, true],
		["Patchbeard", { materialProfile: "standard" as const }, true],
		["procedural", PROCEDURAL_MANNEQUIN_V0_ASSET, false],
	])("preserves authored %s material color, roughness, and metalness", (_, definition, physical) => {
		const material = physical
			? new THREE.MeshPhysicalMaterial({
					color: new THREE.Color().setRGB(0.21, 0.34, 0.55),
					metalness: 0.17,
					roughness: 0.63,
				})
			: new THREE.MeshStandardMaterial({
					color: new THREE.Color().setRGB(0.21, 0.34, 0.55),
					metalness: 0.17,
					roughness: 0.63,
				});
		const root = new THREE.Group();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		root.add(mesh);
		prepareThreeVisualAssetMaterials(root, definition);
		const prepared = mesh.material as THREE.MeshStandardMaterial;
		expect(prepared.color.toArray()).toEqual(material.color.toArray());
		expect(prepared.roughness).toBe(0.63);
		expect(prepared.metalness).toBe(0.17);
	});

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

	test("disposes transient cached geometry, material, and skeleton resources", async () => {
		clearThreeVisualAssetCacheForTests();
		const root = new THREE.Group();
		const bone = new THREE.Bone();
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
		);
		geometry.setAttribute(
			"skinIndex",
			new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4),
		);
		geometry.setAttribute(
			"skinWeight",
			new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
		);
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.SkinnedMesh(geometry, material);
		mesh.add(bone);
		const skeleton = new THREE.Skeleton([bone]);
		mesh.bind(skeleton);
		root.add(mesh);
		const geometryDispose = vi.spyOn(geometry, "dispose");
		const materialDispose = vi.spyOn(material, "dispose");
		const skeletonDispose = vi.spyOn(skeleton, "dispose");
		const definition = {
			id: "transient-test",
			kind: "glb" as const,
			name: "Transient test",
			url: "/transient.glb",
		};
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(
			async () => ({
				loadAsync: async () => ({ animations: [], scene: root }),
			}),
		);
		try {
			const completed = new Promise<void>((resolve) => {
				requestThreeVisualAsset(definition, { onStateChange: resolve });
			});
			await completed;
			expect(disposeThreeVisualAssetCacheEntry(definition)).toBe(true);
			expect(geometryDispose).toHaveBeenCalledOnce();
			expect(materialDispose).toHaveBeenCalledOnce();
			expect(skeletonDispose).toHaveBeenCalledOnce();
			expect(disposeThreeVisualAssetCacheEntry(definition)).toBe(false);
		} finally {
			restoreLoader();
			clearThreeVisualAssetCacheForTests();
		}
	});
});
