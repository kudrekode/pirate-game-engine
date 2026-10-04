import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	subscribeThreePerformanceDiagnosticsEvents,
	type ThreeAssetDiagnosticsEvent,
} from "./threePerformanceDiagnostics";
import {
	clearThreeVisualAssetCacheForTests,
	getThreeVisualAssetCloneType,
	requestThreeVisualAsset,
	requestThreeVisualAssetAnimationClip,
	resolveThreeVisualAssetResourceUrl,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

const assetDefinition: ThreeVisualAssetDefinition = {
	id: "demo_model",
	kind: "glb",
	name: "Demo Model",
	url: "/assets/demo-model.glb",
};

async function flushAssetPromises(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

describe("Three visual asset loader cache", () => {
	beforeEach(() => {
		clearThreeVisualAssetCacheForTests();
	});

	afterEach(() => {
		clearThreeVisualAssetCacheForTests();
	});

	it("resolves registry-scoped dependent resource aliases without changing the glTF URL", () => {
		const definition: ThreeVisualAssetDefinition = {
			...assetDefinition,
			resourceUrlAliases: {
				"T_Eye_Normal_png.png": "T_Eye_Normal.png",
			},
		};

		expect(
			resolveThreeVisualAssetResourceUrl(
				definition,
				"/assets/source/quaternius/T_Eye_Normal_png.png",
			),
		).toBe("/assets/source/quaternius/T_Eye_Normal.png");
		expect(
			resolveThreeVisualAssetResourceUrl(
				definition,
				"/assets/source/quaternius/Superhero_Male_FullBody.bin",
			),
		).toBe("/assets/source/quaternius/Superhero_Male_FullBody.bin");
	});

	it("loads a repeated asset request once and returns cloned instances", async () => {
		const source = new THREE.Group();
		source.name = "cached-source";
		source.add(
			new THREE.Mesh(
				new THREE.BoxGeometry(1, 1, 1),
				new THREE.MeshStandardMaterial(),
			),
		);
		const loadAsync = vi.fn(async () => ({ scene: source }));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();

			expect(loadAsync).toHaveBeenCalledTimes(1);
			expect(loadAsync).toHaveBeenCalledWith("/assets/demo-model.glb");
			const first = requestThreeVisualAsset(assetDefinition);
			const second = requestThreeVisualAsset(assetDefinition);
			expect(first.status).toBe("loaded");
			expect(second.status).toBe("loaded");
			if (first.status !== "loaded" || second.status !== "loaded") {
				throw new Error("Expected loaded asset requests.");
			}
			expect(first.object).not.toBe(second.object);
			expect(first.object).not.toBe(source);

			first.object.position.set(3, 2, 1);
			first.object.rotation.y = Math.PI / 2;
			expect(source.position.x).toBe(0);
			expect(source.position.y).toBe(0);
			expect(source.position.z).toBe(0);
			expect(source.rotation.y).toBe(0);
		} finally {
			restoreLoader();
		}
	});

	it("analyses a loaded root once and reuses that cached analysis for clones", async () => {
		const source = new THREE.Group();
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(2, 4, 2),
			new THREE.MeshStandardMaterial(),
		);
		mesh.position.y = 3;
		source.add(mesh);
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => ({ scene: source })),
		}));

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();

			const first = requestThreeVisualAsset(assetDefinition);
			const second = requestThreeVisualAsset(assetDefinition);
			expect(first.status).toBe("loaded");
			expect(second.status).toBe("loaded");
			if (first.status !== "loaded" || second.status !== "loaded") {
				throw new Error("Expected cached loaded asset requests.");
			}
			expect(first.analysis).toBe(second.analysis);
			expect(first.analysis.bounds).toMatchObject({
				dimensions: { x: 2, y: 4, z: 2 },
				maxY: 5,
				minY: 1,
			});

			mesh.geometry.dispose();
			mesh.material.dispose();
		} finally {
			restoreLoader();
		}
	});

	it("discovers animation clips in cached asset analysis", async () => {
		const source = new THREE.Group();
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => ({
				animations: [new THREE.AnimationClip("Walk", 1.25, [])],
				scene: source,
			})),
		}));

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();

			const loaded = requestThreeVisualAsset(assetDefinition);
			expect(loaded.status).toBe("loaded");
			if (loaded.status !== "loaded") {
				throw new Error("Expected a loaded asset request.");
			}
			expect(loaded.analysis.animationClips).toEqual([
				{ duration: 1.25, name: "Walk", trackCount: 0 },
			]);
		} finally {
			restoreLoader();
		}
	});

	it("returns cached animation clips without creating a rendered clone", async () => {
		const source = new THREE.Group();
		const clip = new THREE.AnimationClip("Walk", 1.25, []);
		const loadAsync = vi.fn(async () => ({
			animations: [clip],
			scene: source,
		}));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));

		try {
			expect(
				requestThreeVisualAssetAnimationClip(assetDefinition, "Walk").status,
			).toBe("loading");
			await flushAssetPromises();

			const animation = requestThreeVisualAssetAnimationClip(
				assetDefinition,
				"Walk",
			);
			expect(animation.status).toBe("loaded");
			if (animation.status !== "loaded") {
				throw new Error("Expected a loaded animation clip.");
			}
			expect(animation.clip).toBe(clip);
			expect(loadAsync).toHaveBeenCalledTimes(1);
			expect(
				requestThreeVisualAssetAnimationClip(assetDefinition, "Missing"),
			).toEqual({ definition: assetDefinition, status: "missing_clip" });
		} finally {
			restoreLoader();
		}
	});

	it("uses SkeletonUtils clones for skinned sources with independent skeletons", async () => {
		const source = new THREE.Group();
		const sourceBone = new THREE.Bone();
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
		const sourceMesh = new THREE.SkinnedMesh(
			geometry,
			new THREE.MeshStandardMaterial(),
		);
		source.add(sourceBone, sourceMesh);
		sourceMesh.bind(new THREE.Skeleton([sourceBone]));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => ({ scene: source })),
		}));

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();

			const first = requestThreeVisualAsset(assetDefinition);
			const second = requestThreeVisualAsset(assetDefinition);
			expect(first.status).toBe("loaded");
			expect(second.status).toBe("loaded");
			if (first.status !== "loaded" || second.status !== "loaded") {
				throw new Error("Expected cached skinned clones.");
			}
			expect(first.cloneType).toBe("skeleton-utils");
			expect(getThreeVisualAssetCloneType(first.analysis)).toBe(
				"skeleton-utils",
			);

			const firstMesh = first.object.getObjectByProperty(
				"isSkinnedMesh",
				true,
			) as THREE.SkinnedMesh;
			const secondMesh = second.object.getObjectByProperty(
				"isSkinnedMesh",
				true,
			) as THREE.SkinnedMesh;
			expect(firstMesh.skeleton).not.toBe(sourceMesh.skeleton);
			expect(secondMesh.skeleton).not.toBe(sourceMesh.skeleton);
			expect(firstMesh.skeleton).not.toBe(secondMesh.skeleton);
			expect(firstMesh.skeleton.bones[0]).not.toBe(
				secondMesh.skeleton.bones[0],
			);
			expect(firstMesh.geometry).toBe(sourceMesh.geometry);
			expect(secondMesh.geometry).toBe(sourceMesh.geometry);
			expect(firstMesh.material).toBe(sourceMesh.material);
			expect(secondMesh.material).toBe(sourceMesh.material);

			firstMesh.skeleton.bones[0].position.x = 4;
			expect(secondMesh.skeleton.bones[0].position.x).toBe(0);
			expect(sourceMesh.skeleton.bones[0].position.x).toBe(0);

			sourceMesh.geometry.dispose();
			sourceMesh.material.dispose();
		} finally {
			restoreLoader();
		}
	});

	it("prepares a standard material once on the cached source without cloning it", async () => {
		const texture = new THREE.Texture();
		const sourceMaterial = new THREE.MeshPhysicalMaterial({
			emissive: 0x334455,
			emissiveMap: texture,
			map: texture,
			metalness: 0.2,
			roughness: 0.7,
		});
		const source = new THREE.Group();
		source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial));
		const definition: ThreeVisualAssetDefinition = {
			...assetDefinition,
			id: "standard_model",
			materialProfile: "standard",
		};
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => ({ scene: source })),
		}));

		try {
			expect(requestThreeVisualAsset(definition).status).toBe("loading");
			await flushAssetPromises();
			const first = requestThreeVisualAsset(definition);
			const second = requestThreeVisualAsset(definition);
			expect(first.status).toBe("loaded");
			expect(second.status).toBe("loaded");
			if (first.status !== "loaded" || second.status !== "loaded") {
				throw new Error("Expected cached standard material clones.");
			}
			const sourceMesh = source.getObjectByProperty(
				"isMesh",
				true,
			) as THREE.Mesh;
			const firstMesh = first.object.getObjectByProperty(
				"isMesh",
				true,
			) as THREE.Mesh;
			const secondMesh = second.object.getObjectByProperty(
				"isMesh",
				true,
			) as THREE.Mesh;
			expect(sourceMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
			expect(sourceMesh.material).not.toBe(sourceMaterial);
			expect(firstMesh.material).toBe(sourceMesh.material);
			expect(secondMesh.material).toBe(sourceMesh.material);
			expect(first.analysis.materialTypes).toEqual(["MeshStandardMaterial"]);
		} finally {
			restoreLoader();
		}
	});

	it("emits diagnostics events for load, cache, and clone lifecycle", async () => {
		const source = new THREE.Group();
		const loadAsync = vi.fn(async () => ({ scene: source }));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));
		const events: ThreeAssetDiagnosticsEvent[] = [];
		const unsubscribe = subscribeThreePerformanceDiagnosticsEvents((event) => {
			events.push(event);
		});

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loaded");

			expect(events.map((event) => event.status)).toEqual([
				"load_start",
				"cache_hit",
				"load_success",
				"cache_hit",
			]);
			expect(events[0]).toMatchObject({
				definitionId: assetDefinition.id,
				url: assetDefinition.url,
			});
		} finally {
			unsubscribe();
			restoreLoader();
		}
	});

	it("records failed loads and keeps returning an error state", async () => {
		const loadError = new Error("load failed");
		const loadAsync = vi.fn(async () => {
			throw loadError;
		});
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();

			const result = requestThreeVisualAsset(assetDefinition);
			const repeatedResult = requestThreeVisualAsset(assetDefinition);
			expect(result.status).toBe("error");
			expect(result.status === "error" ? result.error : undefined).toBe(
				loadError,
			);
			expect(repeatedResult.status).toBe("error");
			expect(loadAsync).toHaveBeenCalledTimes(1);
		} finally {
			restoreLoader();
		}
	});

	it("treats a GLTF with no scene root as an error", async () => {
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync: vi.fn(async () => ({})),
		}));

		try {
			expect(requestThreeVisualAsset(assetDefinition).status).toBe("loading");
			await flushAssetPromises();

			const result = requestThreeVisualAsset(assetDefinition);
			expect(result.status).toBe("error");
			expect(
				result.status === "error" ? result.error : undefined,
			).toBeInstanceOf(Error);
		} finally {
			restoreLoader();
		}
	});

	it("handles missing definitions without starting a load", () => {
		expect(requestThreeVisualAsset(undefined)).toEqual({ status: "missing" });
	});
});
