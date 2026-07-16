import { createDefaultCharacterRecipe } from "@adventure-game-builder/character-contract";
import { describe, expect, it, vi } from "vitest";
import {
	createProceduralMannequinCompileRequest,
	requestProceduralMannequinCompile,
	validateProceduralMannequinHeight,
} from "./proceduralMannequinCreator";

function successfulPayload(heightMetres = 1.82) {
	return {
		assetUrl: "/generated/job/output/mannequin.glb",
		compilationDurationMs: 1250,
		generatedAt: "2026-07-16T12:00:00.000Z",
		manifest: {
			animationSet: "golden-reference-v0",
			assetId: "procedural-mannequin-v0",
			bounds: {
				dimensions: { x: 1.62, y: heightMetres, z: 0.32 },
				maxY: heightMetres,
				minY: 0,
			},
			compilerVersion: "procedural-mannequin-blender-v0",
			deterministicBuild: true,
			generationDurationMs: 1200,
			heightMetres,
			influenceStatistics: {
				maximumInfluences: 1,
				unweightedVertexCount: 0,
			},
			jointCount: 65,
			knownLimitations: [],
			materialCount: 1,
			meshCount: 1,
			normalizedSemanticHash: "c".repeat(64),
			outputHash: "a".repeat(64),
			recipeHash: "b".repeat(64),
			recipeId: "procedural-mannequin-v0",
			recipeVersion: 0,
			skeletonContract: "golden-humanoid-v0",
			triangleCount: 1108,
			validationVersion: "procedural-mannequin-roundtrip-v1",
			vertexCount: 648,
		},
		manifestUrl: "/generated/job/output/manifest.json",
		requestId: "11111111-1111-4111-8111-111111111111",
		status: "succeeded" as const,
		validation: {
			passed: true as const,
			version: "procedural-mannequin-roundtrip-v1",
		},
	};
}

describe("procedural mannequin creator client", () => {
	it("validates the compiler height range", () => {
		expect(validateProceduralMannequinHeight(1.5).ok).toBe(true);
		expect(validateProceduralMannequinHeight(2.1).ok).toBe(true);
		expect(validateProceduralMannequinHeight(1.49).ok).toBe(false);
		expect(validateProceduralMannequinHeight(Number.NaN).ok).toBe(false);
	});

	it("builds a compile request from the existing CharacterRecipe height", () => {
		const recipe = createDefaultCharacterRecipe();
		recipe.body.parameters.height = 1.93;
		expect(createProceduralMannequinCompileRequest(recipe)).toEqual({
			heightMetres: 1.93,
			version: 1,
		});
	});

	it("waits for a validated compile completion", async () => {
		const recipe = createDefaultCharacterRecipe();
		recipe.body.parameters.height = 1.82;
		const request = vi.fn(
			async () =>
				new Response(JSON.stringify(successfulPayload()), {
					status: 200,
				}),
		);

		await expect(
			requestProceduralMannequinCompile(recipe, request),
		).resolves.toMatchObject({
			status: "succeeded",
			manifest: { heightMetres: 1.82 },
		});
		expect(request).toHaveBeenCalledWith(
			"/__asset-studio/procedural-mannequin/compile",
			expect.objectContaining({
				body: JSON.stringify({ heightMetres: 1.82, version: 1 }),
				method: "POST",
			}),
		);
	});

	it("rejects endpoint and manifest validation failures", async () => {
		const recipe = createDefaultCharacterRecipe();
		recipe.body.parameters.height = 1.82;
		const failedRequest = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						error: "synthetic compiler failure",
						status: "failed",
					}),
					{ status: 500 },
				),
		);
		await expect(
			requestProceduralMannequinCompile(recipe, failedRequest),
		).rejects.toThrow("synthetic compiler failure");

		const mismatched = successfulPayload(1.9);
		const mismatchedRequest = vi.fn(
			async () => new Response(JSON.stringify(mismatched), { status: 200 }),
		);
		await expect(
			requestProceduralMannequinCompile(recipe, mismatchedRequest),
		).rejects.toThrow("mismatched validation metadata");
	});
});
