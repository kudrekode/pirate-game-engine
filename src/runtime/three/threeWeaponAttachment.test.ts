import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";
import { SWORD } from "../../data/sword";
import {
	clearThreeVisualAssetCacheForTests,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";
import {
	createThreeWeaponAttachment,
	resolveCharacterHand,
} from "./threeWeaponAttachment";

afterEach(() => clearThreeVisualAssetCacheForTests());
function actor() {
	const root = new THREE.Group(),
		hand = new THREE.Bone();
	hand.name = "hand_r";
	root.add(hand);
	return { root, hand };
}
it("attaches to each real right hand, follows its hierarchy, reuses one clone on re-equip and preserves shared resources", async () => {
	const geometry = new THREE.BoxGeometry(),
		material = new THREE.MeshStandardMaterial();
	const source = new THREE.Group();
	source.add(new THREE.Mesh(geometry, material));
	const loadAsync = vi.fn(async (_url: string) => ({
		scene: source,
		animations: [],
	}));
	const restore = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync,
	}));
	const a = actor(),
		b = actor(),
		one = createThreeWeaponAttachment(a.root),
		two = createThreeWeaponAttachment(b.root);
	try {
		one.sync(SWORD);
		two.sync(SWORD);
		await new Promise((r) => setTimeout(r, 0));
		expect(one.getStats()).toMatchObject({ attached: true, bone: "hand_r" });
		expect(a.hand.children[0]).not.toBe(b.hand.children[0]);
		const sword = a.hand.children[0];
		a.hand.position.x = 2;
		a.root.updateMatrixWorld(true);
		expect(sword.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(
			2 + SWORD.grip.position[0],
		);
		one.sync(undefined);
		expect(a.hand.children).toHaveLength(0);
		one.sync(SWORD);
		expect(a.hand.children[0]).toBe(sword);
		one.sync(SWORD, true);
		expect(sword.visible).toBe(false);
		one.sync(SWORD);
		expect(sword.visible).toBe(true);
		expect(
			loadAsync.mock.calls.filter(([url]) =>
				String(url).includes("sword-v1.glb"),
			),
		).toHaveLength(1);
		const disposeGeometry = vi.spyOn(geometry, "dispose"),
			disposeMaterial = vi.spyOn(material, "dispose");
		one.dispose();
		one.dispose();
		expect(a.hand.children).toHaveLength(0);
		expect(b.hand.children).toHaveLength(1);
		expect(disposeGeometry).not.toHaveBeenCalled();
		expect(disposeMaterial).not.toHaveBeenCalled();
		one.sync(SWORD);
		expect(a.hand.children).toHaveLength(0);
	} finally {
		one.dispose();
		two.dispose();
		restore();
		geometry.dispose();
		material.dispose();
	}
});
it("does not attach to a missing socket or late-load into a disposed/unequipped actor", async () => {
	const restore = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync: async () => ({ scene: new THREE.Group(), animations: [] }),
	}));
	const a = actor(),
		attachment = createThreeWeaponAttachment(a.root);
	try {
		const fake = new THREE.Group();
		fake.name = "hand_r";
		expect(resolveCharacterHand(fake, "rightHand")).toBeUndefined();
		attachment.sync(SWORD);
		attachment.sync(undefined);
		attachment.dispose();
		await new Promise((r) => setTimeout(r, 0));
		expect(a.hand.children).toHaveLength(0);
	} finally {
		restore();
		attachment.dispose();
	}
});
