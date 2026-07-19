import { describe, expect, it } from "vitest";
import goldenReferenceSource from "../../../public/assets/source/quaternius/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf?raw";
import { resolveThreeVisualAssetResourceUrl } from "./threeVisualAssetLoader";
import { getThreeVisualAssetDefinition } from "./threeVisualAssetRegistry";
import {
	resolveThreeCharacterVisual,
	resolveThreeVisualAssetTransform,
} from "./threeVisuals";

const ASSET_ID = "golden-reference-quaternius-superhero-male";

type GltfAccessor = {
	count: number;
	max?: number[];
	min?: number[];
};

type GltfDocument = {
	accessors: GltfAccessor[];
	animations?: unknown[];
	asset: { version: string };
	buffers: { byteLength: number; uri: string }[];
	images: { uri: string }[];
	meshes: {
		name: string;
		primitives: {
			attributes: { POSITION: number };
			indices: number;
			targets?: unknown[];
		}[];
	}[];
	nodes: { mesh?: number; name?: string; skin?: number }[];
	skins: { joints: number[]; name: string }[];
};

const goldenReferenceDocument = JSON.parse(
	goldenReferenceSource,
) as GltfDocument;

describe("Golden Reference Humanoid source fixture", () => {
	it("keeps the vendor glTF source, buffer, and texture URLs resolvable", () => {
		const definition = getThreeVisualAssetDefinition(ASSET_ID);
		if (!definition) {
			throw new Error(`Missing Golden Reference Humanoid asset ${ASSET_ID}.`);
		}
		const document = goldenReferenceDocument;

		expect(definition.kind).toBe("gltf");
		expect(definition.url).toBe(
			"/assets/source/quaternius/Base%20Characters/Godot%20-%20UE/Superhero_Male_FullBody.gltf",
		);
		expect(document.asset.version).toBe("2.0");
		expect(document.buffers).toHaveLength(1);
		expect(document.buffers[0]).toMatchObject({
			byteLength: 720076,
			uri: "Superhero_Male_FullBody.bin",
		});

		expect(document.buffers.map((buffer) => buffer.uri)).toEqual([
			"Superhero_Male_FullBody.bin",
		]);
		for (const image of document.images) {
			const resolvedUrl = resolveThreeVisualAssetResourceUrl(
				definition,
				`${definition.url.slice(0, definition.url.lastIndexOf("/") + 1)}${image.uri}`,
			);
			expect(resolvedUrl).toContain("/assets/source/quaternius/");
			expect(resolvedUrl).not.toContain("_png.png");
		}
	});

	it("records the measured skin, bounds, and absent animation contract", () => {
		const document = goldenReferenceDocument;
		const positionAccessors = document.meshes.flatMap((mesh) =>
			mesh.primitives.map(
				(primitive) => document.accessors[primitive.attributes.POSITION],
			),
		);
		const min = positionAccessors.reduce(
			(current, accessor) =>
				current.map((value, index) =>
					Math.min(value, accessor.min?.[index] ?? 0),
				),
			[Infinity, Infinity, Infinity],
		);
		const max = positionAccessors.reduce(
			(current, accessor) =>
				current.map((value, index) =>
					Math.max(value, accessor.max?.[index] ?? 0),
				),
			[-Infinity, -Infinity, -Infinity],
		);
		const vertexCount = positionAccessors.reduce(
			(total, accessor) => total + accessor.count,
			0,
		);
		const triangleCount = document.meshes
			.flatMap((mesh) => mesh.primitives)
			.reduce(
				(total, primitive) =>
					total + Math.floor(document.accessors[primitive.indices].count / 3),
				0,
			);
		const skin = document.skins[0];
		const boneNames = skin.joints.map((index) => document.nodes[index].name);
		const skinnedMeshCount = document.nodes.filter(
			(node) => node.mesh !== undefined && node.skin !== undefined,
		).length;

		expect(document.meshes.map((mesh) => mesh.name)).toEqual([
			"Face",
			"Face.001",
			"Sphere.005_Retopology.004",
		]);
		expect(skinnedMeshCount).toBe(3);
		expect(skin).toMatchObject({ name: "Armature" });
		expect(boneNames).toHaveLength(65);
		expect(new Set(boneNames).size).toBe(65);
		expect(boneNames).toEqual(
			expect.arrayContaining([
				"root",
				"pelvis",
				"spine_01",
				"Head",
				"hand_l",
				"hand_r",
			]),
		);
		expect(vertexCount).toBe(8483);
		expect(triangleCount).toBe(14318);
		expect(min).toEqual([
			-0.9294325113296509, -0.009509669616818428, -0.16345079243183136,
		]);
		expect(max).toEqual([
			0.9294325113296509, 1.8100767135620117, 0.12803764641284943,
		]);
		expect(document.animations ?? []).toHaveLength(0);
		expect(
			document.meshes
				.flatMap((mesh) => mesh.primitives)
				.flatMap((primitive) => primitive.targets ?? []),
		).toHaveLength(0);
	});

	it("uses the shared character transform for player and NPC assignments", () => {
		const definition = getThreeVisualAssetDefinition(ASSET_ID);
		if (!definition) {
			throw new Error(`Missing Golden Reference Humanoid asset ${ASSET_ID}.`);
		}
		const transform = resolveThreeVisualAssetTransform(
			{
				heightOffset: definition.defaultHeightOffset ?? 0,
				rotationOffset: definition.defaultRotationOffset ?? 0,
				scale: definition.defaultScale ?? 1,
			},
			{
				bounds: {
					center: { x: 0, y: 0.9002835, z: -0.0177066 },
					dimensions: {
						x: 1.8588650226593018,
						y: 1.8195863831788301,
						z: 0.2914884388446808,
					},
					maxY: 1.8100767135620117,
					minY: -0.009509669616818428,
				},
			},
		);
		const playerVisual = resolveThreeCharacterVisual({
			kind: "player",
			threeVisual: { assetId: ASSET_ID, mode: "asset" },
		});
		const npcVisual = resolveThreeCharacterVisual({
			kind: "npc",
			threeVisual: { assetId: ASSET_ID, mode: "asset" },
		});

		expect(transform).toMatchObject({
			normalizationOffsetY: 0.009509669616818428,
			rotationYRadians: Math.PI,
			scale: 0.75,
		});
		expect(playerVisual).toMatchObject({
			assetId: ASSET_ID,
			mode: "asset",
			rotationOffset: 180,
		});
		expect(npcVisual).toMatchObject({
			assetId: ASSET_ID,
			mode: "asset",
			rotationOffset: 180,
		});
	});
});
