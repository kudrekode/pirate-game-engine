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

function successfulPayload(
	heightMetres = 1.82,
	hair: "none" | "quaternius-hair-v0" = "none",
) {
	return {
		assetUrl: "/generated/job/output/mannequin.glb",
		compilationDurationMs: 1250,
		generatedAt: "2026-07-16T12:00:00.000Z",
		manifest: {
			appearance: {
				hair: {
					authoredColor: "#3b2a1f",
					authoredColorSpace: "srgb",
					materialSchemaVersion: "procedural-hair-material-v1",
					materialCount: hair === "none" ? 0 : 1,
					exportedLinearColor:
						hair === "none" ? null : [0.0437, 0.0232, 0.0137],
					exportedRoughness: hair === "none" ? null : 0.72,
					exportedMetallic: hair === "none" ? null : 0,
				},
				face: {
					authoredEyeColor: "#4b5d67",
					authoredEyeColorSpace: "srgb",
					canonicalLinearColor: [0.07, 0.109, 0.135],
					exportedLinearColor: [0.07, 0.109, 0.135],
					exportedMetallic: 0,
					exportedRoughness: 0.48,
					materialCount: 1,
					materialName: "ProceduralEyeMaterial",
					materialSchemaVersion: "procedural-eye-material-v1",
				},
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
			compilerVersion: "procedural-mannequin-blender-v7",
			face: {
				eyeColor: "#4b5d67",
				eyeMeshCount: 2,
				materialCount: 3,
				mouthCentre: [0, 0.17, 1.52],
				noseCentre: [0, 0.18, 1.57],
				noseProjectionMetres: 0.026,
				triangleCount: 148,
				validation: { passed: true, warnings: [] },
				version: "procedural-face-readability-v0",
				vertexCount: 110,
			},
			faceGeometrySemanticHash: "1".repeat(64),
			head: {
				version: "procedural-head-contract-v3",
				bounds: {
					centre: [0, 0.0264, 1.5881],
					dimensions: [0.346707, 0.288124, 0.276179],
					maximum: [0.173, 0.1704, 1.726],
					minimum: [-0.173, -0.1177, 1.45],
				},
				headCentre: [0, 0.0264, 1.5881],
				headDepth: 0.288124,
				headHeight: 0.276179,
				headWidth: 0.346707,
				neckTop: [0, 0, 1.45],
				scalpTop: [0, 0, 1.726],
				symmetryErrorMetres: 0,
				topologyVersion: "procedural-humanoid-v3",
			},
			components: {
				hair: {
					attachmentBone: hair === "none" ? null : "Head",
					componentId: hair,
					materialCount: hair === "none" ? 0 : 1,
					meshCount: hair === "none" ? 0 : 1,
					textureCount: hair === "none" ? 0 : 1,
					triangleCount: hair === "none" ? 0 : 830,
					vertexCount: hair === "none" ? 0 : 466,
				},
			},
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
			materialCount: 3,
			materialSemanticHash: "f".repeat(64),
			meshCount: 5,
			normalizedSemanticHash: "c".repeat(64),
			outputHash: "a".repeat(64),
			recipeHash: "b".repeat(64),
			recipeId: "procedural-mannequin-v0",
			recipeVersion: 6,
			skeletonContract: "golden-humanoid-v0",
			skeletonSignature: "d".repeat(64),
			topology: {
				boundaryEdgeCount: 0,
				connectedComponentCount: 1,
				degenerateFaceCount: 0,
				edgeCount: 8292,
				eulerCharacteristic: 2,
				faceCount: 5528,
				genus: 0,
				manifold: true,
				nonManifoldEdgeCount: 0,
				unreferencedVertexCount: 0,
			},
			topologyVersion: "procedural-humanoid-v3",
			triangleCount: 5676,
			validationVersion: "procedural-mannequin-roundtrip-v8",
			vertexCount: 2876,
		},
		manifestUrl: "/generated/job/output/manifest.json",
		requestId: "11111111-1111-4111-8111-111111111111",
		status: "succeeded" as const,
		validation: {
			passed: true as const,
			version: "procedural-mannequin-roundtrip-v8",
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
				eyeColor: "#4b5d67",
				hairColor: "#3b2a1f",
				skinColor: "#c98f65",
				skinRoughness: 0.72,
			},
			components: { hair: "none" },
			proportions: { ...DEFAULT_PROPORTIONS, height: 1.93 },
			version: 6,
		});
	});

	it("includes the selected registered hairstyle in the compile request", () => {
		const recipe = createDefaultCharacterRecipe();
		recipe.components.hair = "quaternius-hair-v0";
		expect(createProceduralMannequinCompileRequest(recipe).components).toEqual({
			hair: "quaternius-hair-v0",
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
						eyeColor: "#4b5d67",
						hairColor: "#3b2a1f",
						skinColor: "#c98f65",
						skinRoughness: 0.72,
					},
					components: { hair: "none" },
					proportions: DEFAULT_PROPORTIONS,
					version: 6,
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

		recipe.components.hair = "quaternius-hair-v0";
		const wrongHairRequest = vi.fn(
			async () =>
				new Response(JSON.stringify(successfulPayload(1.82, "none")), {
					status: 200,
				}),
		);
		await expect(
			requestProceduralMannequinCompile(recipe, wrongHairRequest),
		).rejects.toThrow("hairstyle component mismatch");
	});
	it("submits authored hair colour and rejects stale compiled colour", async () => {
		const recipe = createDefaultCharacterRecipe();
		recipe.palette.hair = "#BD955B";
		expect(
			createProceduralMannequinCompileRequest(recipe).appearance.hairColor,
		).toBe("#bd955b");
		const stale = vi.fn(
			async () =>
				new Response(JSON.stringify(successfulPayload(1.82)), { status: 200 }),
		);
		await expect(
			requestProceduralMannequinCompile(recipe, stale),
		).rejects.toThrow("mismatched validation metadata");
		recipe.palette.hair = "blond";
		await expect(
			requestProceduralMannequinCompile(recipe, stale),
		).rejects.toThrow("Hair color");
	});
});
