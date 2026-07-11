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

		mesh.geometry.dispose();
		mesh.material.dispose();
	});

	it("returns stable zero bounds for an empty source root", () => {
		expect(analyzeThreeVisualAssetRoot(new THREE.Group())).toEqual({
			bounds: {
				center: { x: 0, y: 0, z: 0 },
				dimensions: { x: 0, y: 0, z: 0 },
				maxY: 0,
				minY: 0,
			},
			sphere: { center: { x: 0, y: 0, z: 0 }, radius: 0 },
		});
	});
});
