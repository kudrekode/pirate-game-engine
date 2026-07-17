import { describe, expect, it } from "vitest";
import hairManifestSource from "../../../public/assets/derived/procedural-humanoids/mannequin-hair-v0/manifest.json?raw";
import manifestSource from "../../../public/assets/derived/procedural-humanoids/mannequin-v0/manifest.json?raw";
import { getThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";
import {
	resolveThreeCharacterVisual,
	resolveThreeVisualAssetTransform,
} from "./threeVisuals";

const ASSET_ID = "procedural-mannequin-v0";
const HAIR_ASSET_ID = "procedural-mannequin-quaternius-hair-v0";
const manifest = JSON.parse(manifestSource) as {
	animationSet: string;
	deterministicBuild: boolean;
	influenceStatistics: {
		maximumInfluences: number;
		outOfRangeJointCount: number;
		unweightedVertexCount: number;
	};
	jointCount: number;
	materialCount: number;
	meshCount: number;
	recipeHash: string;
	skeletonContract: string;
	skeletonSignature: string;
	topology: { connectedComponentCount: number; manifold: boolean };
	topologyVersion: string;
	triangleCount: number;
	vertexCount: number;
};
const hairManifest = JSON.parse(hairManifestSource) as typeof manifest & {
	components: {
		hair: {
			attachmentBone: string;
			componentId: string;
			materialCount: number;
			meshCount: number;
			textureCount: number;
			triangleCount: number;
			vertexCount: number;
		};
	};
};

describe("Procedural Mannequin V0 compiled artifact", () => {
	it("records the deterministic geometry, rig, and weight contract", () => {
		expect(manifest).toMatchObject({
			animationSet: "golden-reference-v0",
			deterministicBuild: true,
			influenceStatistics: {
				maximumInfluences: 4,
				outOfRangeJointCount: 0,
				unweightedVertexCount: 0,
			},
			jointCount: 65,
			materialCount: 1,
			meshCount: 1,
			skeletonContract: "golden-humanoid-v0",
			topology: { connectedComponentCount: 1, manifold: true },
			topologyVersion: "procedural-humanoid-v1",
			triangleCount: 5444,
			vertexCount: 2724,
		});
		expect(manifest.recipeHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(manifest.skeletonSignature).toBe(
			"24264599feb13a49857540c8efab3e46fcfb2a45cec1a03b8bf90bbd4f74b840",
		);
	});

	it("uses the same registry transform for player and NPC presentation", () => {
		const definition = getThreeVisualAssetDefinition(ASSET_ID);
		if (!definition) throw new Error(`Missing ${ASSET_ID}.`);
		const transform = resolveThreeVisualAssetTransform(
			{
				heightOffset: definition.defaultHeightOffset ?? 0,
				rotationOffset: definition.defaultRotationOffset ?? 0,
				scale: definition.defaultScale ?? 1,
			},
			{
				bounds: {
					center: { x: 0, y: 0.91, z: 0 },
					dimensions: { x: 2, y: 1.82, z: 0.33 },
					maxY: 1.82,
					minY: 0,
				},
			},
		);
		const player = resolveThreeCharacterVisual({
			kind: "player",
			threeVisual: { assetId: ASSET_ID, mode: "asset" },
		});
		const npc = resolveThreeCharacterVisual({
			kind: "npc",
			threeVisual: { assetId: ASSET_ID, mode: "asset" },
		});

		expect(transform.rotationYRadians).toBe(Math.PI);
		expect(transform.scale).toBe(1);
		expect(transform.normalizationOffsetY).toBeCloseTo(0);
		expect(player).toMatchObject({
			assetId: ASSET_ID,
			mode: "asset",
			rotationOffset: 180,
		});
		expect(npc).toMatchObject({
			assetId: ASSET_ID,
			mode: "asset",
			rotationOffset: 180,
		});
	});

	it("records a complete hairstyle artifact without changing the body or rig contract", () => {
		expect(hairManifest).toMatchObject({
			components: {
				hair: {
					attachmentBone: "Head",
					componentId: "quaternius-hair-v0",
					materialCount: 1,
					meshCount: 1,
					textureCount: 2,
					triangleCount: 830,
					vertexCount: 466,
				},
			},
			jointCount: 65,
			materialCount: 2,
			meshCount: 2,
			triangleCount: 6274,
			vertexCount: 3190,
		});
		expect(hairManifest.skeletonSignature).toBe(manifest.skeletonSignature);
		const definition = getThreeVisualAssetDefinition(HAIR_ASSET_ID);
		expect(definition).toMatchObject({
			category: "character",
			id: HAIR_ASSET_ID,
			url: "/assets/derived/procedural-humanoids/mannequin-hair-v0/mannequin.glb",
		});
		for (const kind of ["player", "npc"] as const) {
			expect(
				resolveThreeCharacterVisual({
					kind,
					threeVisual: { assetId: HAIR_ASSET_ID, mode: "asset" },
				}),
			).toMatchObject({ assetId: HAIR_ASSET_ID, mode: "asset" });
		}
	});
});
