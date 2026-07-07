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
			expect(asset?.castShadow).toBeUndefined();
			expect(asset?.receiveShadow).toBeUndefined();
		}
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
