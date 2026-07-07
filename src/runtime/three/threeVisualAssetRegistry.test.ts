import { describe, expect, it } from "vitest";
import {
	getThreeVisualAssetDefinition,
	listThreeVisualAssets,
	setThreeVisualAssetRegistryForTests,
} from "./threeVisualAssetRegistry";

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
