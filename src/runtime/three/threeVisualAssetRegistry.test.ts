import { describe, expect, it } from "vitest";
import {
	getThreeVisualAssetDefinition,
	listThreeVisualAssets,
	setThreeVisualAssetRegistryForTests,
	THREE_VISUAL_ASSET_REGISTRY,
} from "./threeVisualAssetRegistry";

const expectedPirateAssets = [
	{
		id: "pirate-chest",
		name: "Pirate Chest",
		url: "/assets/pirate-demo/chest.glb",
	},
	{
		id: "pirate-barrel",
		name: "Pirate Barrel",
		url: "/assets/pirate-demo/barrel.glb",
	},
	{
		id: "pirate-crate",
		name: "Pirate Crate",
		url: "/assets/pirate-demo/crate.glb",
	},
	{
		id: "pirate-palm",
		name: "Pirate Palm",
		url: "/assets/pirate-demo/palm-straight.glb",
	},
	{
		id: "pirate-rocks",
		name: "Pirate Rocks",
		url: "/assets/pirate-demo/rocks-a.glb",
	},
	{
		id: "pirate-small-ship",
		name: "Pirate Small Ship",
		url: "/assets/pirate-demo/ship-pirate-small.glb",
	},
	{
		id: "pirate-dock",
		name: "Pirate Dock",
		url: "/assets/pirate-demo/structure-platform-dock.glb",
	},
	{
		id: "pirate-flag",
		name: "Pirate Flag",
		url: "/assets/pirate-demo/flag-pirate.glb",
	},
];

describe("Three visual asset registry", () => {
	it("exposes the built-in demo asset", () => {
		expect(listThreeVisualAssets()).toContainEqual({
			category: "object",
			defaultHeightOffset: 0.45,
			defaultScale: 0.45,
			id: "demo-box",
			kind: "glb",
			name: "Demo Box",
			tags: ["demo", "primitive"],
			url: "/assets/demo/Box.glb",
		});
		expect(getThreeVisualAssetDefinition("demo-box")).toMatchObject({
			kind: "glb",
			url: "/assets/demo/Box.glb",
		});
		expect(getThreeVisualAssetDefinition("missing")).toBeUndefined();
	});

	it("exposes the curated pirate demo assets", () => {
		const assets = listThreeVisualAssets();
		expect(assets.map((asset) => asset.id)).toEqual(
			THREE_VISUAL_ASSET_REGISTRY.map((asset) => asset.id),
		);
		expect(assets.map((asset) => asset.id)).toEqual(
			expect.arrayContaining(["demo-box", "pirate-chest", "pirate-small-ship"]),
		);

		const shadowCastingAssetIds = new Set([
			"pirate-chest",
			"pirate-palm",
			"pirate-rocks",
			"pirate-small-ship",
		]);
		for (const expected of expectedPirateAssets) {
			expect(assets).toContainEqual(
				expect.objectContaining({
					...expected,
					kind: "glb",
				}),
			);
			expect(expected.name).toMatch(/\s/);
			expect(getThreeVisualAssetDefinition(expected.id)).toMatchObject({
				kind: "glb",
				url: expected.url,
			});
			const asset = getThreeVisualAssetDefinition(expected.id);
			expect(asset?.castShadow).toBe(
				shadowCastingAssetIds.has(expected.id) ? true : undefined,
			);
			expect(asset?.receiveShadow).toBe(true);
			expect(asset?.tags?.length).toBeGreaterThan(0);
			expect(asset?.defaultScale).toBeGreaterThan(0);
		}
	});

	it("registers the curated skinned pirate character assets", () => {
		const base = getThreeVisualAssetDefinition("pirate-character-base");
		const walk = getThreeVisualAssetDefinition("pirate-character-walk");
		const attack = getThreeVisualAssetDefinition("pirate-character-attack");
		const dead = getThreeVisualAssetDefinition("pirate-character-dead");

		expect(base).toMatchObject({
			category: "character",
			defaultHeightOffset: 0,
			defaultRotationOffset: 180,
			defaultScale: 0.75,
			kind: "glb",
			materialProfile: "standard",
			receiveShadow: false,
			tags: expect.arrayContaining(["base", "skinned"]),
			url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Character_output.glb",
		});
		expect(walk).toMatchObject({
			category: "character",
			defaultHeightOffset: 0,
			defaultRotationOffset: 180,
			defaultScale: 0.75,
			kind: "glb",
			materialProfile: "standard",
			receiveShadow: false,
			tags: expect.arrayContaining(["skinned", "walk"]),
			url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Animation_Walking_withSkin.glb",
		});
		expect(base?.animations).toEqual({
			attack: {
				assetId: "pirate-character-attack",
				clipName: "Armature|Attack|baselayer",
			},
			defeated: {
				assetId: "pirate-character-dead",
				clipName: "Armature|Dead|baselayer",
			},
			walk: {
				assetId: "pirate-character-walk",
				clipName: "Armature|walking_man|baselayer",
			},
		});
		expect(walk?.animations).toEqual(base?.animations);
		expect(attack).toMatchObject({
			animationOnly: true,
			category: "character",
			kind: "glb",
			url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Animation_Attack_withSkin.glb",
		});
		expect(dead).toMatchObject({
			animationOnly: true,
			category: "character",
			kind: "glb",
			url: "/assets/pirate-character/Meshy_AI_Captain_Patchbeard_biped_Animation_Dead_withSkin.glb",
		});
	});

	it("registers the Quaternius Golden Reference Humanoid with offline-baked animations", () => {
		const asset = getThreeVisualAssetDefinition(
			"golden-reference-quaternius-superhero-male",
		);
		const idle = getThreeVisualAssetDefinition(
			"golden-reference-quaternius-idle-baked-v1",
		);
		const walk = getThreeVisualAssetDefinition(
			"golden-reference-quaternius-walk-baked-v1",
		);

		expect(asset).toMatchObject({
			castShadow: true,
			category: "character",
			defaultHeightOffset: 0,
			defaultRotationOffset: 180,
			defaultScale: 0.75,
			kind: "gltf",
			materialProfile: "standard",
			receiveShadow: false,
			resourceUrlAliases: {
				"T_Eye_Normal_png.png": "T_Eye_Normal.png",
				"T_Hair_1_Normal_png.png": "T_Hair_1_Normal.png",
			},
			url: "/assets/source/quaternius/Base%20Characters/Godot%20-%20UE/Superhero_Male_FullBody.gltf",
		});
		expect(asset?.animations).toEqual({
			idle: {
				assetId: "golden-reference-quaternius-idle-baked-v1",
				clipName: "GoldenReference_Idle",
			},
			walk: {
				assetId: "golden-reference-quaternius-walk-baked-v1",
				clipName: "GoldenReference_Walk_InPlace",
			},
		});
		expect(idle).toMatchObject({
			animationOnly: true,
			kind: "glb",
			url: "/assets/derived/humanoid-animations/golden-reference-v0/idle.glb",
		});
		expect(walk).toMatchObject({
			animationOnly: true,
			kind: "glb",
			url: "/assets/derived/humanoid-animations/golden-reference-v0/walk-in-place.glb",
		});
	});

	it("registers the procedural mannequin through the shared character path", () => {
		const mannequin = getThreeVisualAssetDefinition("procedural-mannequin-v0");
		const haired = getThreeVisualAssetDefinition(
			"procedural-mannequin-quaternius-hair-v0",
		);

		expect(mannequin).toMatchObject({
			animations: {
				idle: {
					assetId: "golden-reference-quaternius-idle-baked-v1",
					clipName: "GoldenReference_Idle",
				},
				walk: {
					assetId: "golden-reference-quaternius-walk-baked-v1",
					clipName: "GoldenReference_Walk_InPlace",
				},
			},
			category: "character",
			defaultRotationOffset: 180,
			defaultScale: 1,
			kind: "glb",
			materialProfile: "standard",
			tags: expect.arrayContaining([
				"compiler-generated",
				"procedural",
				"skinned",
			]),
			url: "/assets/derived/procedural-humanoids/mannequin-v0/mannequin.glb",
		});
		expect(haired).toMatchObject({
			animations: mannequin?.animations,
			category: "character",
			defaultScale: 1,
			kind: "glb",
			materialProfile: "standard",
			tags: expect.arrayContaining([
				"compiler-generated",
				"hairstyle-slot-v1",
				"quaternius-hair-v0",
			]),
			url: "/assets/derived/procedural-humanoids/mannequin-hair-v0/mannequin.glb",
		});
	});

	it("looks up registered asset definitions by stable id", () => {
		const restoreRegistry = setThreeVisualAssetRegistryForTests([
			{
				category: "character",
				id: "demo_character",
				kind: "glb",
				name: "Demo Character",
				url: "/assets/demo-character.glb",
			},
		]);

		try {
			expect(listThreeVisualAssets().map((asset) => asset.id)).toEqual([
				"demo_character",
			]);
			expect(getThreeVisualAssetDefinition("demo_character")).toMatchObject({
				kind: "glb",
				url: "/assets/demo-character.glb",
			});
			expect(getThreeVisualAssetDefinition("unknown")).toBeUndefined();
		} finally {
			restoreRegistry();
		}
	});
});
