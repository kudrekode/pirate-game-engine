import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { prepareThreeVisualAssetMaterials } from "./threeVisualAssetMaterialProfile";

function createPhysicalMesh(texture: THREE.Texture): THREE.Mesh {
	return new THREE.Mesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.MeshPhysicalMaterial({
			color: 0x789abc,
			emissive: 0x102030,
			emissiveIntensity: 0.75,
			emissiveMap: texture,
			map: texture,
			metalness: 0.2,
			opacity: 0.8,
			roughness: 0.65,
			side: THREE.DoubleSide,
			transparent: true,
		}),
	);
}

describe("Three visual asset material profiles", () => {
	it("leaves preserve-profile source materials untouched", () => {
		const texture = new THREE.Texture();
		const root = new THREE.Group();
		const mesh = createPhysicalMesh(texture);
		root.add(mesh);

		prepareThreeVisualAssetMaterials(root, { materialProfile: "preserve" });

		expect(mesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
		expect(mesh.material).toBe(mesh.material);
	});

	it("converts supported physical material fields once while preserving texture sharing", () => {
		const texture = new THREE.Texture();
		const root = new THREE.Group();
		const firstMesh = createPhysicalMesh(texture);
		const sharedMaterial = firstMesh.material;
		const secondMesh = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			sharedMaterial,
		);
		root.add(firstMesh, secondMesh);

		prepareThreeVisualAssetMaterials(root, { materialProfile: "standard" });

		expect(firstMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
		expect(secondMesh.material).toBe(firstMesh.material);
		expect(firstMesh.material).not.toBe(sharedMaterial);
		const material = firstMesh.material as THREE.MeshStandardMaterial;
		expect(material.map).toBe(texture);
		expect(material.emissiveMap).toBe(texture);
		expect(material.emissive.getHex()).toBe(0x102030);
		expect(material.emissiveIntensity).toBeCloseTo(0.75);
		expect(material.metalness).toBeCloseTo(0.2);
		expect(material.roughness).toBeCloseTo(0.65);
		expect(material.transparent).toBe(true);
		expect(material.opacity).toBeCloseTo(0.8);
		expect(material.side).toBe(THREE.DoubleSide);
	});

	it("does not alter an unrelated source root", () => {
		const texture = new THREE.Texture();
		const preparedRoot = new THREE.Group();
		const unrelatedRoot = new THREE.Group();
		const preparedMesh = createPhysicalMesh(texture);
		const unrelatedMesh = createPhysicalMesh(texture);
		preparedRoot.add(preparedMesh);
		unrelatedRoot.add(unrelatedMesh);

		prepareThreeVisualAssetMaterials(preparedRoot, {
			materialProfile: "standard",
		});

		expect(preparedMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
		expect(unrelatedMesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
	});
});
