import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";
import type { ArrowProjectile } from "../projectileRuntime";
import { createThreeArrowPresentation } from "./threeArrowPresentation";
import {
	clearThreeVisualAssetCacheForTests,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";

afterEach(() => clearThreeVisualAssetCacheForTests());
it("prewarms one arrow asset, reuses world groups for shots and disposes locally without touching cached geometry", async () => {
	const scene = new THREE.Scene(),
		source = new THREE.Group(),
		geometry = new THREE.BoxGeometry(),
		material = new THREE.MeshStandardMaterial();
	source.add(new THREE.Mesh(geometry, material));
	const loadAsync = vi.fn(async () => ({ scene: source, animations: [] }));
	const restore = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync,
	}));
	const presentation = createThreeArrowPresentation(scene, { x: -10, z: -5 });
	try {
		await new Promise((r) => setTimeout(r, 0));
		expect(presentation.getStats()).toEqual({ pooled: 3, visible: 0 });
		const groups = [...scene.children],
			arrow: ArrowProjectile = {
				id: 1,
				position: { x: 13, y: 1, z: 8 },
				previous: { x: 12, y: 1, z: 8 },
				direction: { x: 1, y: 0, z: 0 },
				speed: 28,
				remainingRange: 40,
				remainingMs: 1500,
				damage: 32,
				weapon: "bow",
				sourceActor: "player",
			};
		for (let i = 0; i < 10; i++) {
			presentation.sync([arrow]);
			presentation.sync([]);
		}
		presentation.sync([arrow]);
		expect(scene.children).toEqual(groups);
		expect(groups[0].position.toArray()).toEqual([3, 1, 3]);
		expect(
			new THREE.Vector3(0, 0, 1).applyQuaternion(groups[0].quaternion).x,
		).toBeCloseTo(1);
		expect(loadAsync).toHaveBeenCalledTimes(1);
		const dispose = vi.spyOn(geometry, "dispose");
		presentation.dispose();
		expect(scene.children).toHaveLength(0);
		expect(dispose).not.toHaveBeenCalled();
	} finally {
		presentation.dispose();
		restore();
		geometry.dispose();
		material.dispose();
	}
});
