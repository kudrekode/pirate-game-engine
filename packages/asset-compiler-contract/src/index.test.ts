import { createDefaultCharacterRecipe } from "@adventure-game-builder/character-contract";
import { describe, expect, it } from "vitest";
import {
	createNotImplementedCharacterCompileResult,
	validateCharacterCompileRequest,
	validateCharacterCompileResult,
} from ".";

describe("asset compiler contract", () => {
	it("parses valid character compile requests", () => {
		const parsed = validateCharacterCompileRequest({
			version: 1,
			requestId: "request-1",
			recipe: createDefaultCharacterRecipe({ id: "hero", name: "Hero" }),
			outputName: "hero",
			requestedOutputs: ["glb", "assetJson", "recipeJson", "thumbnailPng"],
			compiler: {
				id: "golden-kit-local",
				version: "0.0.0",
				options: { thumbnailSize: 512 },
			},
		});

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.recipe.skeletonId).toBe("humanoid-v1");
		}
	});

	it("represents not-implemented results without fake artifacts", () => {
		const result = createNotImplementedCharacterCompileResult({
			requestId: "request-1",
		});
		const parsed = validateCharacterCompileResult(result);

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value).toMatchObject({
				requestId: "request-1",
				status: "not_implemented",
				artifacts: [],
				errors: ["Character compiler is not implemented."],
			});
		}
	});

	it("parses versioned output descriptors and asset metadata", () => {
		const parsed = validateCharacterCompileResult({
			version: 1,
			status: "succeeded",
			artifacts: [
				{
					version: 1,
					kind: "glb",
					path: "captain/captain.glb",
					mimeType: "model/gltf-binary",
				},
				{
					version: 1,
					kind: "assetJson",
					path: "captain/captain.asset.json",
					mimeType: "application/json",
				},
			],
			validation: [],
			warnings: [],
			errors: [],
			metadata: {
				version: 1,
				category: "character",
				assetId: "captain",
				displayName: "Captain",
				sourceRecipeId: "captain-recipe",
				skeletonId: "humanoid-v1",
				transforms: {
					scale: 1,
					heightOffset: 0,
					rotationOffsetDegrees: 0,
				},
				animationMappings: {
					walk: {
						assetId: "captain-animation-source",
						clipName: "Walk",
					},
				},
				budgets: {
					vertexCount: 1000,
					triangleCount: 800,
					boneCount: 20,
				},
			},
		});

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(
				parsed.value.artifacts.map((artifact) => artifact.version),
			).toEqual([1, 1]);
			expect(parsed.value.metadata?.skeletonId).toBe("humanoid-v1");
		}
	});

	it("rejects fake success without artifacts", () => {
		const parsed = validateCharacterCompileResult({
			version: 1,
			status: "succeeded",
			artifacts: [],
			validation: [],
			warnings: [],
			errors: [],
		});

		expect(parsed.ok).toBe(false);
		expect(parsed.issues).toContainEqual(
			expect.objectContaining({ path: "$.artifacts" }),
		);
	});
});
