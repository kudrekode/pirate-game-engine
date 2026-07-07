import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearThreeVisualAssetCacheForTests,
	requestThreeVisualAsset,
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
			expect(source.position.x).toBe(0);
			expect(source.position.y).toBe(0);
			expect(source.position.z).toBe(0);
		} finally {
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
