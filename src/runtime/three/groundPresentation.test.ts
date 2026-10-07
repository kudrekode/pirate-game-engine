import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createProjectFromPreset } from "../../data/projectPresets";
import {
	createGroundPresentation,
	createWorldEdgePresentation,
} from "./groundPresentation";

function area() {
	const result = createProjectFromPreset("blank").areas[0];
	result.width = 3;
	result.height = 2;
	result.terrainTiles = Array.from({ length: 6 }, (_, i) => ({
		x: i % 3,
		y: Math.floor(i / 3),
		tileId: ["grass", "sand", "water"][i % 3],
	}));
	return result;
}

describe("coastal ground presentation", () => {
	it("makes deterministic bounded colour variation and a gradual grass/sand boundary without changing authored data", () => {
		const input = area();
		const before = JSON.stringify(input);
		const first = createGroundPresentation(input);
		const second = createGroundPresentation(input);
		expect(first.texture?.image.data).toEqual(second.texture?.image.data);
		const texture = first.texture;
		if (!texture?.image.data)
			throw new Error("Expected a ground colour texture");
		const data = texture.image.data;
		const size = texture.image.width;
		const at = (x: number) =>
			Array.from(
				data.slice(
					(Math.floor(size / 4) * size + x) * 4,
					(Math.floor(size / 4) * size + x) * 4 + 3,
				),
			);
		const left = at(Math.floor(size / 6));
		const edge = at(Math.floor(size / 3));
		const right = at(Math.floor(size / 2));
		expect(edge[0]).toBeGreaterThan(left[0]);
		expect(edge[0]).toBeLessThan(right[0]);
		expect(at(12)).not.toEqual(at(14));
		expect(size).toBeLessThanOrEqual(1024);
		expect(JSON.stringify(input)).toBe(before);
		const dispose = vi.spyOn(texture, "dispose");
		first.dispose();
		second.dispose();
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("uses continuous world UVs across separate terrain meshes and keeps water material intact", () => {
		const ground = createGroundPresentation(area());
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
		mesh.position.x = 1;
		ground.apply(mesh);
		expect(material.map).toBe(ground.texture);
		const position = mesh.geometry.getAttribute("position");
		const uv = mesh.geometry.getAttribute("uv");
		expect(uv.getX(0)).toBeCloseTo((position.getX(0) + 2.5) / 3);
		const water = new THREE.MeshStandardMaterial({ transparent: true });
		mesh.material = water;
		ground.apply(mesh);
		expect(water.map).toBeNull();
		mesh.geometry.dispose();
		material.dispose();
		water.dispose();
		ground.dispose();
	});

	it("extends only complete flat outdoor borders, never playable terrain or picking", () => {
		const input = area();
		const before = JSON.stringify(input);
		const ground = createGroundPresentation(input);
		const water = new THREE.MeshStandardMaterial({ transparent: true });
		const meshes = createWorldEdgePresentation(input, water, "smooth");
		expect(meshes).toHaveLength(2);
		for (const mesh of meshes) {
			expect(mesh.userData).toMatchObject({
				presentationOnly: true,
				ignoreTerrainPicking: true,
			});
			const positions = mesh.geometry.getAttribute("position");
			for (let i = 0; i < positions.count; i++) {
				expect(
					Math.abs(positions.getX(i)) >= 1.5 ||
						Math.abs(positions.getZ(i)) >= 1,
				).toBe(true);
				expect(Number.isFinite(positions.getY(i))).toBe(true);
			}
			mesh.geometry.dispose();
			if (mesh.material !== water) (mesh.material as THREE.Material).dispose();
		}
		expect(JSON.stringify(input)).toBe(before);
		expect(
			createWorldEdgePresentation(
				{ ...input, terrainHeights: [{ x: 0, y: 0, height: 1 }] },
				water,
				"smooth",
			),
		).toEqual([]);
		expect(
			createWorldEdgePresentation(
				{ ...input, terrainTiles: input.terrainTiles.slice(1) },
				water,
				"smooth",
			),
		).toEqual([]);
		water.dispose();
		ground.dispose();
	});
});
