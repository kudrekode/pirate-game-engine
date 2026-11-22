import * as THREE from "three";
import type { AssetCreatorEffect } from "../../types/game";

interface EffectVisual {
	object: THREE.Object3D;
	update(phase: number, strength: number): void;
	dispose(): void;
}

const FULL_TURN = Math.PI * 2;

function softParticleTexture(): THREE.DataTexture {
	const size = 32;
	const pixels = new Uint8Array(size * size * 4).fill(255);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const radius = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5);
			pixels[(y * size + x) * 4 + 3] = 255 * Math.max(0, 1 - radius * 2) ** 2;
		}
	}
	const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

function createGlow(color: string, map: THREE.Texture): EffectVisual {
	const object = new THREE.Group();
	const light = new THREE.PointLight(color, 0, 3.75, 2);
	const material = new THREE.SpriteMaterial({
		color,
		map,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		toneMapped: false,
	});
	const sprite = new THREE.Sprite(material);
	object.add(light, sprite);
	return {
		object,
		update(phase, strength) {
			const pulse = 0.9 + 0.1 * Math.sin(phase * FULL_TURN);
			light.intensity = strength * pulse * 4;
			material.opacity = strength * pulse;
			sprite.scale.setScalar(0.9 * pulse);
		},
		dispose() {
			light.dispose();
			material.dispose();
		},
	};
}

function createFog(color: string, map: THREE.Texture): EffectVisual {
	const object = new THREE.Group();
	const clouds = Array.from({ length: 8 }, (_, index) => {
		const material = new THREE.SpriteMaterial({
			color,
			map,
			depthWrite: false,
			toneMapped: false,
		});
		const sprite = new THREE.Sprite(material);
		sprite.scale.set(1.9, 0.55 + (index % 3) * 0.16, 1);
		object.add(sprite);
		return sprite;
	});
	return {
		object,
		update(phase, strength) {
			clouds.forEach((sprite, index) => {
				const angle = FULL_TURN * (index / clouds.length + phase);
				const radius = 0.48 + (index % 3) * 0.2;
				sprite.position.set(
					Math.cos(angle) * radius,
					0.12 + (index % 3) * 0.1 + Math.sin(angle * 2) * 0.08,
					Math.sin(angle) * radius,
				);
				sprite.material.opacity = strength * (0.38 + Math.cos(angle) * 0.12);
			});
		},
		dispose() {
			for (const sprite of clouds) sprite.material.dispose();
		},
	};
}

function createEmbers(color: string, map: THREE.Texture): EffectVisual {
	const count = 32;
	const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
	positions.setUsage(THREE.DynamicDrawUsage);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", positions);
	const material = new THREE.PointsMaterial({
		color,
		map,
		size: 0.09,
		transparent: true,
		depthWrite: false,
		toneMapped: false,
	});
	const object = new THREE.Points(geometry, material);
	object.frustumCulled = false;
	return {
		object,
		update(phase, strength) {
			for (let index = 0; index < count; index++) {
				const age = (phase + index / count) % 1;
				const angle = index * 2.39996 + age * FULL_TURN * 0.5;
				const spread = (0.12 + (index % 5) * 0.04) * (0.5 + age);
				positions.setXYZ(
					index,
					Math.cos(angle) * spread,
					age * (0.8 + (index % 7) * 0.12),
					Math.sin(angle) * spread,
				);
			}
			positions.needsUpdate = true;
			material.opacity = strength;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		},
	};
}

/** Owns only the preview effect resources. Time is elapsed preview seconds. */
export function createAssetPreviewEffect(effect: AssetCreatorEffect) {
	const texture = softParticleTexture();
	const createVisual = {
		glow: createGlow,
		fog: createFog,
		embers: createEmbers,
	};
	const visual = createVisual[effect.type](effect.color, texture);
	const duration = Math.max(0.1, effect.duration);
	const intensity = THREE.MathUtils.clamp(effect.intensity, 0, 1);
	const update = (time: number) => {
		const elapsed = Math.max(time, 0) / duration;
		const phase = effect.loop ? elapsed % 1 : Math.min(elapsed, 1);
		const strength =
			intensity * (effect.loop ? 1 : Math.min(1, (1 - phase) * 4));
		visual.object.visible = strength > 0;
		visual.update(phase, strength);
	};
	update(0);
	return {
		object: visual.object,
		update,
		dispose() {
			visual.object.removeFromParent();
			visual.dispose();
			texture.dispose();
		},
	};
}
