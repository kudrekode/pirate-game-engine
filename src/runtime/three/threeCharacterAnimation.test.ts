import { PROCEDURAL_MANNEQUIN_V0_ASSET } from "@adventure-game-builder/three-asset-preview";
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
	requestThreeVisualAsset,
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

it("shares a character load but isolates skeletons, transforms and Golden idle/walk mixers", async () => {
	const source = createRenderedCharacter();
	const bone = source.getObjectByName("Hips") as THREE.Bone;
	const geometry = new THREE.BoxGeometry();
	const count = geometry.getAttribute("position").count;
	geometry.setAttribute(
		"skinIndex",
		new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
	);
	const weights = new Float32Array(count * 4);
	for (let index = 0; index < count; index++) weights[index * 4] = 1;
	geometry.setAttribute(
		"skinWeight",
		new THREE.Float32BufferAttribute(weights, 4),
	);
	const material = new THREE.MeshStandardMaterial();
	const mesh = new THREE.SkinnedMesh(geometry, material);
	mesh.bind(new THREE.Skeleton([bone]));
	source.add(mesh);
	const asset = {
		...PROCEDURAL_MANNEQUIN_V0_ASSET,
		id: "character-independent",
		url: "/assets/project-characters/example/character.glb",
	};
	const loadAsync = vi.fn(async (url: string) => ({
		scene: url === asset.url ? source : new THREE.Group(),
		animations: [
			createRootMotionClip("GoldenReference_Idle"),
			createRootMotionClip("GoldenReference_Walk_InPlace"),
		],
	}));
	const restore = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync,
	}));
	const controllers: ReturnType<
		typeof createThreeCharacterAnimationController
	>[] = [];
	try {
		requestThreeVisualAsset(asset);
		requestThreeVisualAsset(asset);
		await flushAssetPromises();
		const first = requestThreeVisualAsset(asset),
			second = requestThreeVisualAsset(asset);
		if (first.status !== "loaded" || second.status !== "loaded")
			throw new Error("Expected clones");
		const a = first.object.getObjectByProperty(
			"isSkinnedMesh",
			true,
		) as THREE.SkinnedMesh;
		const b = second.object.getObjectByProperty(
			"isSkinnedMesh",
			true,
		) as THREE.SkinnedMesh;
		expect(first.cloneType).toBe("skeleton-utils");
		expect(a.skeleton).not.toBe(b.skeleton);
		expect(a.skeleton.bones[0]).not.toBe(b.skeleton.bones[0]);
		expect(a.geometry).toBe(b.geometry);
		expect(a.material).toBe(b.material);
		first.object.position.x = 5;
		expect(second.object.position.x).toBe(0);
		const one = createThreeCharacterAnimationController({
			asset,
			root: first.object,
		});
		const two = createThreeCharacterAnimationController({
			asset,
			root: second.object,
		});
		controllers.push(one, two);
		await flushAssetPromises();
		one.sync({ moving: true, defeated: false });
		one.update(0.5);
		two.update(0.1);
		expect(one.getStats().semanticState).toBe("walk");
		expect(two.getStats().semanticState).toBe("idle");
		expect(a.skeleton.bones[0].position.y).not.toBe(
			b.skeleton.bones[0].position.y,
		);
		expect(bone.position.y).toBe(0);
		expect(
			loadAsync.mock.calls.filter(([url]) => url === asset.url),
		).toHaveLength(1);
		expect(loadAsync).toHaveBeenCalledTimes(3); // one character, two shared clip sources
	} finally {
		controllers.forEach((controller) => {
			controller.dispose();
		});
		restore();
	}
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
