import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearThreeCharacterAnimationClipCacheForTests,
	createThreeCharacterAnimationController,
	prepareThreeCharacterAnimationClip,
	resolveCharacterAnimationState,
} from "./threeCharacterAnimation";
import {
	clearThreeVisualAssetCacheForTests,
	setThreeVisualAssetLoaderFactoryForTests,
} from "./threeVisualAssetLoader";
import {
	setThreeVisualAssetRegistryForTests,
	type ThreeVisualAssetDefinition,
} from "./threeVisualAssetRegistry";

function createRenderedCharacter(): THREE.Group {
	const root = new THREE.Group();
	const hips = new THREE.Bone();
	hips.name = "Hips";
	root.add(hips);
	return root;
}

function createRootMotionClip(name: string): THREE.AnimationClip {
	return new THREE.AnimationClip(name, 1, [
		new THREE.VectorKeyframeTrack(
			"Hips.position",
			[0, 0.5, 1],
			[5, 1, 8, 9, 2, 11, 13, 3, 15],
		),
	]);
}

async function flushAssetPromises(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

afterEach(() => {
	clearThreeCharacterAnimationClipCacheForTests();
	clearThreeVisualAssetCacheForTests();
});

describe("Three character animation", () => {
	it("resolves gameplay-neutral animation semantics in priority order", () => {
		expect(
			resolveCharacterAnimationState({ defeated: false, moving: false }),
		).toBe("idle");
		expect(
			resolveCharacterAnimationState({ defeated: false, moving: true }),
		).toBe("walk");
		expect(
			resolveCharacterAnimationState({
				attackRequested: true,
				defeated: false,
				moving: true,
			}),
		).toBe("attack");
		expect(
			resolveCharacterAnimationState({
				attackRequested: true,
				defeated: true,
				moving: true,
			}),
		).toBe("defeated");
	});

	it("binds compatible tracks to the rendered clone and neutralizes horizontal root motion", () => {
		const root = createRenderedCharacter();
		const original = createRootMotionClip("Walk");
		const prepared = prepareThreeCharacterAnimationClip(
			"source",
			original,
			root,
		);

		expect(prepared.status).toBe("prepared");
		if (prepared.status !== "prepared") {
			throw new Error("Expected the compatible clip to be prepared.");
		}
		const track = prepared.clip.tracks[0] as THREE.VectorKeyframeTrack;
		expect(Array.from(track.values)).toEqual([5, 1, 8, 5, 2, 8, 5, 3, 8]);
		expect(
			Array.from((original.tracks[0] as THREE.VectorKeyframeTrack).values),
		).toEqual([5, 1, 8, 9, 2, 11, 13, 3, 15]);

		const incompatible = prepareThreeCharacterAnimationClip(
			"source",
			new THREE.AnimationClip("Broken", 1, [
				new THREE.VectorKeyframeTrack(
					"MissingBone.position",
					[0, 1],
					[0, 0, 0, 1, 0, 0],
				),
			]),
			root,
		);
		expect(incompatible).toMatchObject({ status: "incompatible" });
	});

	it("loads clip sources once, drives a per-clone mixer, and stops it on disposal", async () => {
		const character: ThreeVisualAssetDefinition = {
			animations: {
				attack: { assetId: "character-source", clipName: "Attack" },
				defeated: { assetId: "character-source", clipName: "Dead" },
				idle: { assetId: "character-source", clipName: "Idle" },
				walk: { assetId: "character-source", clipName: "Walk" },
			},
			category: "character",
			id: "character",
			kind: "glb",
			name: "Character",
			url: "/character.glb",
		};
		const source: ThreeVisualAssetDefinition = {
			animationOnly: true,
			category: "character",
			id: "character-source",
			kind: "glb",
			name: "Character source",
			url: "/character-source.glb",
		};
		const restoreRegistry = setThreeVisualAssetRegistryForTests([
			character,
			source,
		]);
		const loadAsync = vi.fn(async () => ({
			animations: [
				createRootMotionClip("Idle"),
				createRootMotionClip("Walk"),
				createRootMotionClip("Attack"),
				createRootMotionClip("Dead"),
			],
			scene: new THREE.Group(),
		}));
		const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
			loadAsync,
		}));

		try {
			const renderedCharacter = createRenderedCharacter();
			const controller = createThreeCharacterAnimationController({
				asset: character,
				root: renderedCharacter,
			});
			await flushAssetPromises();
			controller.update(0.5);

			expect(loadAsync).toHaveBeenCalledTimes(1);
			expect(controller.getStats()).toMatchObject({
				activeLoopingActions: 1,
				loadingSourceCount: 0,
				semanticState: "idle",
				sourceAssetIds: ["character-source"],
			});

			controller.sync({ defeated: false, moving: true });
			controller.update(0.5);
			expect(controller.getStats()).toMatchObject({
				activeLoopingActions: 1,
				loadingSourceCount: 0,
				semanticState: "walk",
				sourceAssetIds: ["character-source"],
			});
			const hips = renderedCharacter.getObjectByName("Hips");
			expect(hips?.position.x).toBe(5);
			expect(hips?.position.z).toBe(8);

			controller.triggerAttack();
			expect(controller.getStats().semanticState).toBe("attack");
			controller.sync({ defeated: true, moving: false });
			expect(controller.getStats().semanticState).toBe("defeated");
			controller.dispose();
			expect(controller.getStats().activeLoopingActions).toBe(0);
		} finally {
			restoreLoader();
			restoreRegistry();
		}
	});
});
