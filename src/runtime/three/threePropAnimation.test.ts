import * as THREE from "three";
import { afterEach, expect, it } from "vitest";
import {
	createThreePropAnimationController,
	interactionFacingYaw,
} from "./threePropAnimation";
import {
	clearThreeVisualAssetCacheForTests,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";
import type { ThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";

afterEach(clearThreeVisualAssetCacheForTests);
const asset: ThreeVisualAssetDefinition = {
	id: "chest-test",
	name: "Chest",
	kind: "glb",
	url: "/chest.glb",
	propAnimations: { open: "open" },
};
function chest() {
	const root = new THREE.Group(),
		lid = new THREE.Object3D();
	lid.name = "lid";
	root.add(lid);
	return { root, lid };
}
it("opens independent props once, clamps the final pose and restores semantic opened without replay", async () => {
	const restore = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync: async () => ({
			scene: chest().root,
			animations: [
				new THREE.AnimationClip("open", 0.3, [
					new THREE.NumberKeyframeTrack("lid.rotation[x]", [0, 0.3], [0, -1.6]),
				]),
			],
		}),
	}));
	const a = chest(),
		b = chest(),
		c = chest();
	const one = createThreePropAnimationController(asset, a.root, false),
		two = createThreePropAnimationController(asset, b.root, false),
		saved = createThreePropAnimationController(asset, c.root, true);
	try {
		await new Promise((r) => setTimeout(r, 0));
		expect(c.lid.rotation.x).toBeCloseTo(-1.6);
		expect(saved.getStats().playCount).toBe(0);
		one.setOpened(true);
		one.update(0.15);
		expect(a.lid.rotation.x).toBeCloseTo(-0.8);
		expect(b.lid.rotation.x).toBe(0);
		one.setOpened(true);
		one.update(0.2);
		expect(a.lid.rotation.x).toBeCloseTo(-1.6);
		expect(one.getStats().playCount).toBe(1);
		one.update(10);
		expect(a.lid.rotation.x).toBeCloseTo(-1.6);
		two.setOpened(true);
		two.update(0.1);
		expect(b.lid.rotation.x).toBeLessThan(0);
		expect(c.lid.rotation.x).toBeCloseTo(-1.6);
	} finally {
		one.dispose();
		two.dispose();
		saved.dispose();
		restore();
	}
});
it("keeps static and missing-clip props usable", async () => {
	const restore = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync: async () => ({ scene: chest().root, animations: [] }),
	}));
	const root = chest().root,
		a = createThreePropAnimationController(
			{ ...asset, propAnimations: undefined },
			root,
			false,
		),
		b = createThreePropAnimationController(asset, chest().root, true);
	a.setOpened(true);
	a.update(1);
	await new Promise((r) => setTimeout(r, 0));
	expect(a.getStats().opened).toBe(true);
	expect(b.getStats().time).toBeUndefined();
	a.dispose();
	b.dispose();
	restore();
});
it("faces the presentation toward the target without changing either coordinate", () => {
	const from = { x: 2, y: 3 },
		to = { x: 4, y: 3 };
	expect(interactionFacingYaw(from, to, 180)).toBeCloseTo(Math.PI / 2);
	expect(interactionFacingYaw(from, { x: 2, y: 1 }, 180)).toBeCloseTo(Math.PI);
	expect(interactionFacingYaw(from, from)).toBeUndefined();
	expect(from).toEqual({ x: 2, y: 3 });
	expect(to).toEqual({ x: 4, y: 3 });
});
