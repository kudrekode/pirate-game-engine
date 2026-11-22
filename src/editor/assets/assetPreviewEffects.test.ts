import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AssetCreatorEffect } from "../../types/game";
import { createAssetPreviewEffect } from "./assetPreviewEffects";

const embers: AssetCreatorEffect = {
	id: "effect-embers",
	name: "Fire Embers",
	type: "embers",
	color: "#ff9a55",
	intensity: 0.75,
	duration: 2,
	loop: true,
};

describe("asset preview effects", () => {
	it("animates and loops actual ember points", () => {
		const effect = createAssetPreviewEffect(embers);
		try {
			const object = effect.object as THREE.Points;
			const positions = object.geometry.getAttribute("position");
			expect(object).toBeInstanceOf(THREE.Points);
			expect(positions.getY(0)).toBe(0);
			effect.update(1);
			expect(positions.getY(0)).toBeGreaterThan(0);
			effect.update(2);
			expect(positions.getY(0)).toBe(0);
		} finally {
			effect.dispose();
		}
	});

	it("follows a socket parent and expires a one-shot glow", () => {
		const effect = createAssetPreviewEffect({
			...embers,
			type: "glow",
			loop: false,
		});
		try {
			const socket = new THREE.Bone();
			socket.add(effect.object);
			socket.position.set(0.25, 1, 0.5);
			const light = effect.object.children[0] as THREE.PointLight;
			expect(light).toBeInstanceOf(THREE.PointLight);
			expect(light.getWorldPosition(new THREE.Vector3())).toEqual(
				socket.position,
			);
			expect(light.intensity).toBeGreaterThan(0);
			effect.update(2);
			expect(effect.object.visible).toBe(false);
			expect(light.intensity).toBe(0);
			effect.update(0);
			expect(effect.object.visible).toBe(true);
		} finally {
			effect.dispose();
		}
	});

	it("disposes owned GPU resources and detaches the effect", () => {
		const effect = createAssetPreviewEffect(embers);
		const object = effect.object as THREE.Points<
			THREE.BufferGeometry,
			THREE.PointsMaterial
		>;
		const parent = new THREE.Group();
		parent.add(object);
		const dispose = vi.fn();
		object.geometry.addEventListener("dispose", dispose);
		object.material.addEventListener("dispose", dispose);
		object.material.map?.addEventListener("dispose", dispose);
		effect.dispose();
		expect(dispose).toHaveBeenCalledTimes(3);
		expect(parent.children).toHaveLength(0);
	});
});
