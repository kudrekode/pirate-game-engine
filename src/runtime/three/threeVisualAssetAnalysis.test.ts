import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { analyzeThreeVisualAssetRoot } from "./threeVisualAssetAnalysis";

describe("Three visual asset analysis", () => {
	it("captures reusable bounds, dimensions, center, sphere, and ground level", () => {
		const root = new THREE.Group();
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(2, 4, 6),
			new THREE.MeshStandardMaterial(),
		);
		mesh.position.set(1, 3, -2);
		root.add(mesh);

		const analysis = analyzeThreeVisualAssetRoot(root);

		expect(analysis.bounds).toEqual({
			center: { x: 1, y: 3, z: -2 },
			dimensions: { x: 2, y: 4, z: 6 },
			maxY: 5,
			minY: 1,
		});
		expect(analysis.sphere.center).toEqual({ x: 1, y: 3, z: -2 });
		expect(analysis.sphere.radius).toBeCloseTo(Math.sqrt(14));
		expect(analysis).toMatchObject({
			animationClips: [],
			materialCount: 1,
			meshCount: 1,
			skeletonCount: 0,
			skinnedMeshCount: 0,
			textureCount: 0,
		});

		mesh.geometry.dispose();
		mesh.material.dispose();
	});

	it("returns stable zero bounds for an empty source root", () => {
		expect(analyzeThreeVisualAssetRoot(new THREE.Group())).toEqual({
			animationClips: [],
			bounds: {
				center: { x: 0, y: 0, z: 0 },
				dimensions: { x: 0, y: 0, z: 0 },
				maxY: 0,
				minY: 0,
			},
			sphere: { center: { x: 0, y: 0, z: 0 }, radius: 0 },
			materialCount: 0,
			meshCount: 0,
			skeletonCount: 0,
			skinnedMeshCount: 0,
			textureCount: 0,
		});
	});

	it("discovers skinned meshes, skeletons, textures, and animation clips once", () => {
		const root = new THREE.Group();
		const bone = new THREE.Bone();
		const texture = new THREE.Texture();
		const material = new THREE.MeshStandardMaterial({ map: texture });
		const geometry = new THREE.BoxGeometry(1, 2, 1);
		const skinIndices = new Uint16Array(geometry.attributes.position.count * 4);
		const skinWeights = new Float32Array(
			geometry.attributes.position.count * 4,
		);
		for (
			let index = 0;
			index < geometry.attributes.position.count;
			index += 1
		) {
			skinWeights[index * 4] = 1;
		}
		geometry.setAttribute(
			"skinIndex",
			new THREE.Uint16BufferAttribute(skinIndices, 4),
		);
		geometry.setAttribute(
			"skinWeight",
			new THREE.Float32BufferAttribute(skinWeights, 4),
		);
		const mesh = new THREE.SkinnedMesh(geometry, material);
		root.add(bone, mesh);
		mesh.bind(new THREE.Skeleton([bone]));
		const clip = new THREE.AnimationClip("Walk", 1.25, []);

		const analysis = analyzeThreeVisualAssetRoot(root, [clip]);

		expect(analysis).toMatchObject({
			animationClips: [{ duration: 1.25, name: "Walk", trackCount: 0 }],
			materialCount: 1,
			meshCount: 1,
			skeletonCount: 1,
			skinnedMeshCount: 1,
			textureCount: 1,
		});

		mesh.geometry.dispose();
		material.dispose();
		texture.dispose();
	});
});
