import { describe, expect, it } from "vitest";
import {
	getThreeVisualAssetDefinition,
	listThreeVisualAssets,
	setThreeVisualAssetRegistryForTests,
} from "./threeVisualAssetRegistry";

describe("Three visual asset registry", () => {
	it("starts with no built-in demo assets until a legal model is added", () => {
		expect(listThreeVisualAssets()).toEqual([]);
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
