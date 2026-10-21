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

it("prepares a sword variant once, keeps Attack priority and independent controllers, then restores unarmed/locomotion", async () => {
	const clips = ["Idle", "Fist", "Sword", "Hit", "Bow"].map(
		createRootMotionClip,
	);
	const prepareSword = vi.spyOn(clips[2], "clone");
	const prepareBow = vi.spyOn(clips[4], "clone");
	const asset: ThreeVisualAssetDefinition = {
		id: "weapon-actor",
		name: "Actor",
		kind: "glb",
		url: "/actor.glb",
		animations: {
			idle: { clipName: "Idle" },
			attack: { clipName: "Fist" },
			hit: { clipName: "Hit" },
		},
	};
	const swordSource: ThreeVisualAssetDefinition = {
		...asset,
		id: "sword-source",
		url: "/sword-actions.glb",
	};
	const registry = setThreeVisualAssetRegistryForTests([asset, swordSource]);
	const loadAsync = vi.fn(async (_url: string) => ({
		scene: createRenderedCharacter(),
		animations: clips,
	}));
	const loader = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync,
	}));
	const options = {
		asset,
		attackVariants: {
			sword: { assetId: swordSource.id, clipName: "Sword" },
			bow: { assetId: swordSource.id, clipName: "Bow" },
		},
	};
	const one = createThreeCharacterAnimationController({
			...options,
			root: createRenderedCharacter(),
		}),
		two = createThreeCharacterAnimationController({
			...options,
			root: createRenderedCharacter(),
		});
	try {
		await flushAssetPromises();
		for (let i = 0; i < 3; i++) {
			one.triggerAttack("sword");
			expect(one.getStats()).toMatchObject({
				semanticState: "attack",
				activeClip: "Sword",
			});
			one.update(1.1);
		}
		expect(prepareSword).toHaveBeenCalledTimes(1);
		for (let i = 0; i < 3; i++) {
			one.triggerAttack("bow");
			expect(one.getStats().activeClip).toBe("Bow");
			one.update(1.1);
		}
		expect(prepareBow).toHaveBeenCalledTimes(1);
		expect(loadAsync).toHaveBeenCalledTimes(2);
		expect(two.getStats()).toMatchObject({
			semanticState: "idle",
			activeClip: "Idle",
		});
		one.triggerAttack();
		expect(one.getStats().activeClip).toBe("Fist");
		one.triggerHit();
		one.triggerAttack("sword");
		expect(one.getStats().activeClip).toBe("Hit");
		one.update(1.1);
		expect(one.getStats().semanticState).toBe("idle");
		one.sync({ defeated: false, moving: true, airborne: true });
		one.triggerAttack("sword");
		expect(one.getStats().semanticState).toBe("jump");
	} finally {
		one.dispose();
		two.dispose();
		loader();
		registry();
	}
});

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
		// This loader omits the optional combat clips. A missing Attack must
		// never latch a state that cannot receive a mixer finished event.
		one.triggerAttack();
		one.update(1);
		expect(one.getStats().semanticState).toBe("walk");
		one.sync({ moving: false, defeated: false });
		expect(one.getStats().semanticState).toBe("idle");
		expect(a.skeleton.bones[0].position.y).not.toBe(
			b.skeleton.bones[0].position.y,
		);
		expect(bone.position.y).toBe(0);
		expect(
			loadAsync.mock.calls.filter(([url]) => url === asset.url),
		).toHaveLength(1);
		expect(loadAsync).toHaveBeenCalledTimes(6); // character, idle/walk, movement, combat, interactions
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

async function combatFixture(
	run: (
		controllers: ReturnType<typeof createThreeCharacterAnimationController>[],
		load: ReturnType<typeof vi.fn>,
	) => void,
	available = ["Idle", "Walk", "Attack", "Hit", "Dead"],
) {
	const asset: ThreeVisualAssetDefinition = {
		id: "combat-fixture",
		kind: "glb",
		name: "Combat fixture",
		url: "/combat.glb",
		animations: {
			idle: { clipName: "Idle" },
			walk: { clipName: "Walk" },
			attack: { clipName: "Attack" },
			hit: { clipName: "Hit" },
			defeated: { clipName: "Dead" },
		},
	};
	const restoreRegistry = setThreeVisualAssetRegistryForTests([asset]);
	const load = vi.fn(async () => ({
		scene: new THREE.Group(),
		animations: available.map(createRootMotionClip),
	}));
	const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync: load,
	}));
	const controllers = [
		createRenderedCharacter(),
		createRenderedCharacter(),
	].map((root) => createThreeCharacterAnimationController({ asset, root }));
	try {
		await flushAssetPromises();
		run(controllers, load);
	} finally {
		controllers.forEach((c) => {
			c.dispose();
		});
		restoreLoader();
		restoreRegistry();
	}
}

it("returns one-shots to the latest locomotion without replaying an interrupted Attack", async () => {
	await combatFixture(([one, two], load) => {
		one.triggerAttack();
		one.update(0.2);
		expect(one.getStats().semanticState).toBe("attack");
		expect(two.getStats().semanticState).toBe("idle");
		one.triggerHit();
		one.sync({ moving: true, defeated: false });
		expect(one.getStats().semanticState).toBe("hit");
		const count = one.getStats().oneShotActionsTriggered;
		one.triggerAttack();
		expect(one.getStats().oneShotActionsTriggered).toBe(count);
		one.update(1.1);
		expect(one.getStats().semanticState).toBe("walk");
		one.triggerAttack();
		one.sync({ moving: false, defeated: false });
		one.update(1.1);
		expect(one.getStats().semanticState).toBe("idle");
		expect(two.getStats().oneShotActionsTriggered).toBe(0);
		expect(load).toHaveBeenCalledTimes(1);
	});
});
it("restarts accepted Attack and Hit requests but gives death irreversible priority while defeated", async () => {
	await combatFixture(([c]) => {
		c.triggerAttack();
		c.update(0.6);
		c.triggerAttack();
		c.update(0.6);
		expect(c.getStats().semanticState).toBe("attack");
		c.triggerHit();
		c.update(0.6);
		c.triggerHit();
		c.update(0.6);
		expect(c.getStats().semanticState).toBe("hit");
		c.sync({ moving: true, defeated: true });
		expect(c.getDefeatPlayback()).toEqual({ duration: 1, finished: false });
		const count = c.getStats().oneShotActionsTriggered;
		c.triggerAttack();
		c.triggerHit();
		expect(c.getStats().oneShotActionsTriggered).toBe(count);
		c.update(1.1);
		expect(c.getDefeatPlayback()).toEqual({ duration: 1, finished: true });
		c.update(5);
		c.sync({ moving: false, defeated: true });
		expect(c.getStats().semanticState).toBe("defeated");
		expect(c.getDefeatPlayback()?.finished).toBe(true);
		c.dispose();
		c.dispose();
		expect(c.getDefeatPlayback()).toBeUndefined();
	});
});
it("keeps locomotion for absent actions and makes missing Death immediately removable", async () => {
	await combatFixture(
		([c]) => {
			c.sync({ moving: true, defeated: false });
			c.triggerAttack();
			c.triggerHit();
			c.update(3);
			expect(c.getStats().semanticState).toBe("walk");
			c.sync({ moving: false, defeated: true });
			expect(c.getDefeatPlayback()).toBeUndefined();
		},
		["Idle", "Walk"],
	);
});
it("does not defer an unloaded Attack or Hit until its source arrives", async () => {
	const asset: ThreeVisualAssetDefinition = {
		id: "pending",
		name: "Pending",
		kind: "glb",
		url: "/pending.glb",
		animations: {
			idle: { clipName: "Idle" },
			attack: { clipName: "Attack" },
			hit: { clipName: "Hit" },
			defeated: { clipName: "Dead" },
		},
	};
	let resolve!: (value: {
		scene: THREE.Group;
		animations: THREE.AnimationClip[];
	}) => void;
	const registry = setThreeVisualAssetRegistryForTests([asset]);
	const loader = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync: () =>
			new Promise((r) => {
				resolve = r;
			}),
	}));
	const c = createThreeCharacterAnimationController({
		asset,
		root: createRenderedCharacter(),
	});
	try {
		c.triggerAttack();
		c.triggerHit();
		expect(c.getDefeatPlayback()).toBeUndefined();
		await flushAssetPromises();
		resolve({
			scene: new THREE.Group(),
			animations: ["Idle", "Attack", "Hit", "Dead"].map(createRootMotionClip),
		});
		await flushAssetPromises();
		expect(c.getStats().semanticState).toBe("idle");
		expect(c.getStats().oneShotActionsTriggered).toBe(0);
	} finally {
		c.dispose();
		loader();
		registry();
	}
});
it("shares prepared source clips without mutating the cached source", () => {
	const clip = createRootMotionClip("Attack"),
		root = createRenderedCharacter();
	const a = prepareThreeCharacterAnimationClip("shared", clip, root),
		b = prepareThreeCharacterAnimationClip(
			"shared",
			clip,
			createRenderedCharacter(),
		);
	expect(a.status).toBe("prepared");
	expect(b.status).toBe("prepared");
	if (a.status === "prepared" && b.status === "prepared") {
		expect(a.clip).toBe(b.clip);
		expect(a.clip).not.toBe(clip);
	}
	expect(
		resolveCharacterAnimationState({
			moving: true,
			defeated: false,
			attackRequested: true,
			hitRequested: true,
		}),
	).toBe("hit");
});

async function movementController(missing: string[] = []) {
	const states = [
		"idle",
		"walk",
		"run",
		"jump",
		"fall",
		"land",
		"interact",
		"pickup",
		"attack",
		"hit",
		"defeated",
	] as const;
	const asset: ThreeVisualAssetDefinition = {
		id: "movement-test",
		name: "Movement",
		kind: "glb",
		url: "/movement-test.glb",
		animations: Object.fromEntries(
			states.map((state) => [state, { clipName: state }]),
		),
	};
	const restoreRegistry = setThreeVisualAssetRegistryForTests([asset]);
	const loadAsync = vi.fn(async () => ({
		scene: createRenderedCharacter(),
		animations: states
			.filter((state) => !missing.includes(state))
			.map((state) => createRootMotionClip(state)),
	}));
	const restoreLoader = setThreeVisualAssetLoaderFactoryForTests(() => ({
		loadAsync,
	}));
	const controller = createThreeCharacterAnimationController({
		asset,
		root: createRenderedCharacter(),
	});
	await flushAssetPromises();
	return {
		controller,
		loadAsync,
		dispose: () => {
			controller.dispose();
			restoreLoader();
			restoreRegistry();
		},
	};
}
it.each([
	"interact",
	"pickup",
] as const)("plays %s once and returns to current locomotion, with combat and airborne priority", async (action) => {
	const { controller: c, loadAsync, dispose } = await movementController();
	try {
		c.sync({ defeated: false, moving: true, sprinting: true });
		expect(c.triggerInteraction(action)).toBe(true);
		expect(c.getStats().semanticState).toBe(action);
		expect(c.triggerInteraction(action)).toBe(false);
		c.update(1.1);
		expect(c.getStats().semanticState).toBe("run");
		c.triggerAttack();
		expect(c.triggerInteraction(action)).toBe(false);
		c.update(1.1);
		c.triggerInteraction(action);
		c.triggerHit();
		expect(c.getStats().semanticState).toBe("hit");
		c.update(1.1);
		expect(c.getStats().semanticState).toBe("run");
		c.sync({
			defeated: false,
			moving: false,
			airborne: true,
			movementPhase: "jump",
		});
		expect(c.triggerInteraction(action)).toBe(false);
		c.sync({ defeated: false, moving: false });
		c.triggerInteraction(action);
		c.sync({
			defeated: false,
			moving: false,
			airborne: true,
			movementPhase: "fall",
		});
		c.update(1.1);
		c.sync({ defeated: false, moving: false });
		expect(c.getStats().semanticState).toBe("idle");
		c.triggerInteraction(action);
		c.sync({ defeated: true, moving: false });
		expect(c.getStats().semanticState).toBe("defeated");
		expect(loadAsync).toHaveBeenCalledTimes(1);
	} finally {
		dispose();
	}
});
it("does not queue missing interaction clips for later playback", async () => {
	const { controller: c, dispose } = await movementController([
		"interact",
		"pickup",
	]);
	try {
		expect(c.triggerInteraction("interact")).toBe(false);
		expect(c.triggerInteraction("pickup")).toBe(false);
		c.update(2);
		expect(c.getStats().semanticState).toBe("idle");
	} finally {
		dispose();
	}
});
it("crossfades Walk/Run and follows Run to Jump/Fall/Land to latest Run or Idle without reloading", async () => {
	const { controller: c, loadAsync, dispose } = await movementController();
	const fade = vi.spyOn(THREE.AnimationAction.prototype, "crossFadeFrom");
	try {
		const state = (
			moving: boolean,
			sprinting: boolean,
			movementPhase: "grounded" | "jump" | "fall" | "land",
		) => {
			c.sync({
				defeated: false,
				moving,
				sprinting,
				movementPhase,
				airborne: movementPhase === "jump" || movementPhase === "fall",
				movementSpeed: sprinting ? 7.6 : 4.6,
			});
			c.update(0.03);
			return c.getStats().semanticState;
		};
		expect(state(true, false, "grounded")).toBe("walk");
		expect(state(true, true, "grounded")).toBe("run");
		expect(state(true, false, "grounded")).toBe("walk");
		expect(state(false, false, "grounded")).toBe("idle");
		expect(state(true, true, "grounded")).toBe("run");
		expect(state(true, true, "jump")).toBe("jump");
		expect(state(true, true, "fall")).toBe("fall");
		expect(state(true, true, "land")).toBe("land");
		expect(state(true, true, "grounded")).toBe("run");
		c.triggerAttack();
		expect(c.getStats().semanticState).toBe("attack");
		c.update(1.1);
		expect(c.getStats().semanticState).toBe("run");
		state(false, false, "jump");
		c.triggerAttack();
		expect(c.getStats().semanticState).toBe("jump");
		expect(state(false, false, "fall")).toBe("fall");
		expect(state(false, false, "land")).toBe("land");
		expect(state(false, false, "grounded")).toBe("idle");
		expect(fade).toHaveBeenCalledWith(expect.anything(), 0.12, false);
		expect(loadAsync).toHaveBeenCalledTimes(1);
	} finally {
		fade.mockRestore();
		dispose();
	}
});
it("retains combat priority over movement and clamps locomotion playback speed", async () => {
	const { controller: c, dispose } = await movementController();
	const speed = vi.spyOn(
		THREE.AnimationAction.prototype,
		"setEffectiveTimeScale",
	);
	try {
		c.sync({
			defeated: false,
			moving: true,
			sprinting: true,
			movementSpeed: 100,
		});
		expect(speed).toHaveBeenCalledWith(1.2);
		c.triggerAttack();
		c.triggerHit();
		c.sync({
			defeated: false,
			moving: true,
			airborne: true,
			movementPhase: "fall",
		});
		expect(c.getStats().semanticState).toBe("hit");
		c.update(1.1);
		expect(c.getStats().semanticState).toBe("fall");
		c.sync({ defeated: true, moving: true, airborne: true });
		expect(c.getStats().semanticState).toBe("defeated");
	} finally {
		speed.mockRestore();
		dispose();
	}
});
it("uses loaded Walk/Idle fallbacks for missing movement clips and never latches recovery", async () => {
	const { controller: c, dispose } = await movementController([
		"run",
		"jump",
		"fall",
		"land",
	]);
	try {
		c.sync({ defeated: false, moving: true, sprinting: true });
		expect(c.getStats()).toMatchObject({
			semanticState: "run",
			activeLoopingActions: 1,
		});
		c.sync({
			defeated: false,
			moving: false,
			airborne: true,
			movementPhase: "jump",
		});
		c.update(0.5);
		c.sync({
			defeated: false,
			moving: false,
			airborne: true,
			movementPhase: "fall",
		});
		c.update(0.5);
		c.sync({ defeated: false, moving: false, movementPhase: "land" });
		c.update(0.3);
		c.sync({ defeated: false, moving: false, movementPhase: "grounded" });
		expect(c.getStats()).toMatchObject({
			semanticState: "idle",
			activeLoopingActions: 1,
			missingClipCount: 4,
		});
	} finally {
		dispose();
	}
});
