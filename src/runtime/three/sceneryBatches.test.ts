import {
	BoxGeometry,
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	PointLight,
	Scene,
	Vector3,
} from "three";
import { expect, it, vi } from "vitest";
import { batchStaticScenery, isStaticSceneryAsset } from "./sceneryBatches";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

function grove() {
	const scene = new Scene();
	const material = new MeshStandardMaterial({ alphaTest: 0.45 });
	const geometry = new BoxGeometry();
	function plant(id: string, x: number) {
		const group = new Group();
		group.position.set(x, 2, 3);
		group.rotation.y = Math.PI / 6;
		group.scale.set(1, 1.5, 0.9);
		const leaves = new Mesh(geometry, material);
		leaves.position.y = 1.2;
		leaves.castShadow = true;
		leaves.receiveShadow = true;
		group.add(leaves);
		scene.add(group);
		return { id, group, leaves };
	}
	return { scene, geometry, material, plant };
}

it("submits nearby copies together with their composed transforms, cutout material and shadow roles", () => {
	const { scene, material, geometry, plant } = grove();
	const plants = [plant("birch-a", 1), plant("birch-b", 4), plant("lone", 23)];
	scene.updateMatrixWorld(true);
	const matrices = plants.map(({ leaves }) => leaves.matrixWorld.clone());
	const result = batchStaticScenery(scene, plants);
	expect(result.stats).toEqual({
		markers: 2,
		instances: 2,
		draws: 1,
		lodTrees: 0,
	});
	expect(scene.children).toEqual([plants[2].group, ...result.roots]);
	const batch = result.roots[0].children[0] as InstancedMesh;
	expect(batch).toBeInstanceOf(InstancedMesh);
	expect(batch.userData.sceneryMarkerIds).toEqual(["birch-a", "birch-b"]);
	expect(batch.geometry).toBe(geometry);
	expect(batch.material).toBe(material);
	expect(batch.castShadow && batch.receiveShadow).toBe(true);
	const transform = new Matrix4();
	for (let i = 0; i < 2; i++) {
		batch.getMatrixAt(i, transform);
		for (const [n, value] of transform.elements.entries())
			expect(value).toBeCloseTo(matrices[i].elements[n], 6);
		expect(
			batch.boundingSphere?.containsPoint(
				new Vector3().setFromMatrixPosition(transform),
			),
		).toBe(true);
	}
	const release = vi.fn();
	batch.addEventListener("dispose", release);
	const disposeGeometry = vi.spyOn(geometry, "dispose");
	const disposeMaterial = vi.spyOn(material, "dispose");
	result.dispose();
	expect(scene.children).toEqual([plants[2].group]);
	expect(release).toHaveBeenCalledOnce();
	expect(disposeGeometry).not.toHaveBeenCalled();
	expect(disposeMaterial).not.toHaveBeenCalled();
});

it("retains complete marker hierarchies for blended leaves, moving or lit nodes, sheared and reflected transforms", () => {
	const { scene, plant } = grove();
	const blended = new MeshStandardMaterial({ transparent: true });
	const cases = [
		(marker: ReturnType<typeof plant>) => {
			marker.group.add(new PointLight());
		},
		(marker: ReturnType<typeof plant>) => {
			marker.leaves.material = blended;
		},
		(marker: ReturnType<typeof plant>) => {
			marker.group.scale.x = -1;
		},
		(marker: ReturnType<typeof plant>) => {
			marker.leaves.rotation.z = Math.PI / 4;
		},
		(marker: ReturnType<typeof plant>) => {
			marker.leaves.morphTargetInfluences = [0];
		},
		(marker: ReturnType<typeof plant>) => {
			marker.group.add(
				new InstancedMesh(marker.leaves.geometry, marker.leaves.material, 2),
			);
		},
	];
	for (const change of cases) {
		const pair = [plant("a", 0), plant("b", 0)];
		for (const marker of pair) change(marker);
		const result = batchStaticScenery(scene, pair);
		expect(result.stats.markers).toBe(0);
		expect(pair.every(({ group }) => group.parent === scene)).toBe(true);
	}
});

it("requires the same shared material and shadow roles for a draw", () => {
	const { scene, plant } = grove();
	const a = plant("a", 1),
		b = plant("b", 2),
		c = plant("c", 3);
	b.leaves.castShadow = false;
	c.leaves.material = a.leaves.material.clone();
	expect(batchStaticScenery(scene, [a, b, c]).stats.draws).toBe(0);
});

it("limits batching to verified built-ins and explicitly marked static environments", () => {
	const asset: ThreeVisualAssetDefinition = {
		id: "mere-spruce",
		name: "Scenery",
		category: "environment",
		kind: "glb",
		url: "/canopy.glb",
	};
	expect(isStaticSceneryAsset(asset)).toBe(true);
	expect(isStaticSceneryAsset({ ...asset, id: "another-tree" })).toBeFalsy();
	expect(
		isStaticSceneryAsset({
			...asset,
			id: "another-tree",
			tags: ["static-scenery"],
		}),
	).toBe(true);
	expect(isStaticSceneryAsset({ ...asset, category: "vehicle" })).toBeFalsy();
	expect(
		isStaticSceneryAsset({ ...asset, propAnimations: { open: "Open" } }),
	).toBeFalsy();
});
