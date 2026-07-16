import { createDefaultCharacterRecipe } from "@adventure-game-builder/character-contract";
import { describe, expect, it, vi } from "vitest";
import {
	createProceduralMannequinCompileRequest,
	randomizeProceduralMannequinBody,
	requestProceduralMannequinCompile,
	validateProceduralMannequinBody,
} from "./proceduralMannequinCreator";

const DEFAULT_PROPORTIONS = {
	height: 1.82,
	shoulderWidth: 0.5,
	torsoLength: 0.5,
	armLength: 0.5,
	legLength: 0.5,
	hipWidth: 0.5,
};

function successfulPayload(heightMetres = 1.82) {
	return {
		assetUrl: "/generated/job/output/mannequin.glb",
		compilationDurationMs: 1250,
		generatedAt: "2026-07-16T12:00:00.000Z",
		manifest: {
			appearance: {
				skin: {
					authoredColor: "#c98f65",
					authoredColorSpace: "srgb",
					authoredRoughness: 0.72,
					canonicalLinearColor: [0.584, 0.275, 0.13],
					exportedLinearColor: [0.584, 0.275, 0.13],
					exportedMetallic: 0,
					exportedRoughness: 0.72,
					materialCount: 1,
					materialName: "ProceduralSkinMaterial",
					materialSchemaVersion: "procedural-skin-material-v1",
				},
			},
			animationSet: "golden-reference-v0",
			assetId: "procedural-mannequin-v0",
			bounds: {
				dimensions: { x: 1.62, y: heightMetres, z: 0.32 },
				maxY: heightMetres,
				minY: 0,
			},
			anatomy: {
				armLengthMultiplier: 1,
				armToLegRatio: 1,
				armToTorsoRatio: 1,
				heightScale: heightMetres / 1.82,
				hipWidthMultiplier: 1,
				legLengthMultiplier: 1,
				legToTorsoRatio: 1,
				shoulderToHipRatio: 1,
				shoulderWidthMultiplier: 1,
				torsoLengthMultiplier: 1,
			},
			compilerVersion: "procedural-mannequin-blender-v3",
			deterministicBuild: true,
			generationDurationMs: 1200,
			geometryAndSkinningSemanticHash: "e".repeat(64),
			heightMetres,
			proportions: { ...DEFAULT_PROPORTIONS, height: heightMetres },
			influenceStatistics: {
				maximumInfluences: 4,
				maximumWeightSumError: 0,
				strategy: "analytic-sided-segments-v2",
				unweightedVertexCount: 0,
			},
			jointCount: 65,
			knownLimitations: [],
			materialCount: 1,
			materialSemanticHash: "f".repeat(64),
			meshCount: 1,
			normalizedSemanticHash: "c".repeat(64),
			outputHash: "a".repeat(64),
			recipeHash: "b".repeat(64),
			recipeId: "procedural-mannequin-v0",
			recipeVersion: 3,
			skeletonContract: "golden-humanoid-v0",
			skeletonSignature: "d".repeat(64),
			topology: {
				boundaryEdgeCount: 0,
				connectedComponentCount: 1,
				degenerateFaceCount: 0,
				edgeCount: 8166,
				eulerCharacteristic: 2,
				faceCount: 5444,
				genus: 0,
				manifold: true,
				nonManifoldEdgeCount: 0,
				unreferencedVertexCount: 0,
			},
			topologyVersion: "procedural-humanoid-v1",
			triangleCount: 5444,
			validationVersion: "procedural-mannequin-roundtrip-v4",
			vertexCount: 2724,
		},
		manifestUrl: "/generated/job/output/manifest.json",
		requestId: "11111111-1111-4111-8111-111111111111",
		status: "succeeded" as const,
		validation: {
			passed: true as const,
			version: "procedural-mannequin-roundtrip-v4",
		},
	};
}

describe("procedural mannequin creator client", () => {
	it("validates ranges and cross-parameter anatomy", () => {
		expect(validateProceduralMannequinBody(DEFAULT_PROPORTIONS).ok).toBe(true);
		expect(
			validateProceduralMannequinBody({
				...DEFAULT_PROPORTIONS,
				height: 1.49,
			}).ok,
		).toBe(false);
		const impossible = validateProceduralMannequinBody({
			...DEFAULT_PROPORTIONS,
			armLength: 0,
			torsoLength: 1,
		});
		expect(impossible.ok).toBe(false);
		expect(impossible.issues[0]?.message).toContain("impossibly short");
	});

	it("builds a compile request from all CharacterRecipe body parameters", () => {
		const recipe = createDefaultCharacterRecipe();
		recipe.body.parameters.height = 1.93;
		expect(createProceduralMannequinCompileRequest(recipe)).toEqual({
			appearance: {
				skinColor: "#c98f65",
				skinRoughness: 0.72,
			},
			proportions: { ...DEFAULT_PROPORTIONS, height: 1.93 },
			version: 3,
		});
	});

	it("randomises reproducibly from a deterministic seed and only emits valid recipes", () => {
		const first = randomizeProceduralMannequinBody("captain-42");
		const repeated = randomizeProceduralMannequinBody("captain-42");
		const different = randomizeProceduralMannequinBody("captain-43");
		expect(repeated).toEqual(first);
		expect(different).not.toEqual(first);
		expect(validateProceduralMannequinBody(first).ok).toBe(true);
		for (let index = 0; index < 100; index += 1) {
			expect(
				validateProceduralMannequinBody(
					randomizeProceduralMannequinBody(`range-seed-${index}`),
				).ok,
			).toBe(true);
		}
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
				body: JSON.stringify({
					appearance: {
						skinColor: "#c98f65",
						skinRoughness: 0.72,
					},
					proportions: DEFAULT_PROPORTIONS,
					version: 3,
				}),
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
