import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { applyWorldKitMaterials } from "./worldKitMaterials";

describe("world kit material presentation", () => {
	it("shares each prepared family within a clone, varies instances deterministically and leaves GLTF sources intact", () => {
		const source = new THREE.MeshStandardMaterial({
			name: "leaf-light",
			color: 0x728253,
		});
		const geometry = new THREE.BoxGeometry();
		const root = new THREE.Group();
		root.add(
			new THREE.Mesh(geometry, source),
			new THREE.Mesh(geometry, source),
		);
		const first = root.clone(true);
		const again = root.clone(true);
		const other = root.clone(true);
		const a = applyWorldKitMaterials(first, "world-palm", "palm-a");
		const b = applyWorldKitMaterials(again, "world-palm", "palm-a");
		const c = applyWorldKitMaterials(other, "world-palm", "palm-b");
		const material = (node: THREE.Object3D, i = 0) =>
			(node.children[i] as THREE.Mesh).material as THREE.MeshStandardMaterial;
		expect(material(first)).toBe(material(first, 1));
		expect(material(first)).not.toBe(source);
		expect(material(first).color).toEqual(material(again).color);
		expect(material(first).color).not.toEqual(material(other).color);
		expect(source.color.getHex()).toBe(0x728253);
		const ownedDispose = vi.spyOn(material(first), "dispose");
		const sourceDispose = vi.spyOn(source, "dispose");
		a();
		b();
		c();
		a();
		expect(ownedDispose).toHaveBeenCalledOnce();
		expect(sourceDispose).not.toHaveBeenCalled();
		source.dispose();
		geometry.dispose();
	});

	it("preserves character materials even when their material names match a kit family", () => {
		const source = new THREE.MeshStandardMaterial({ name: "canvas" });
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
		applyWorldKitMaterials(mesh, "project-character", "npc")();
		expect(mesh.material).toBe(source);
		mesh.geometry.dispose();
		source.dispose();
	});
});
