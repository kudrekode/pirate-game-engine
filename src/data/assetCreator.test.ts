import { expect, it } from "vitest";
import { sceneAssets } from "../editor/sections/sceneEditing";
import { resolveThreeCharacterVisual } from "../runtime/three/threeVisuals";
import {
	assetCreatorVariantDraft,
	migrateAssetCreator,
	ZERO_ASSET_VECTOR,
} from "./assetCreator";
import { migrateProject } from "./migrateProject";
import { readProjectJson } from "./projectImport";

it("round trips asset variants, source clips and preview effects without changing base assets", () => {
	const original = migrateProject(undefined);
	const variant = {
		...assetCreatorVariantDraft("mere-ferryman", "Oswin with sword", "Humans"),
		id: "creator-asset-oswin",
		tint: "#a2b4ce",
		scale: 1.2,
		pose: { hand_r: { x: 20, y: 0, z: 0 } },
		attachment: {
			assetId: "weapon-sword-v1",
			socket: "right_hand",
			scale: 1,
			position: ZERO_ASSET_VECTOR,
			rotation: ZERO_ASSET_VECTOR,
		},
		effectId: "fx-custom",
	};
	const project = {
		...original,
		assetCreator: {
			variants: [variant],
			clips: [
				{
					id: "clip-custom",
					name: "Sword",
					loop: false,
					sourceAssetId: "golden-sword-actions-v1",
					sourceClipName: "GoldenSword_Attack_V1",
					keys: [{ bone: "hand_r", time: 0.4, rotation: ZERO_ASSET_VECTOR }],
				},
			],
			effects: [
				{
					id: "fx-custom",
					name: "Ember",
					type: "embers",
					color: "#cc5544",
					intensity: 0.5,
					duration: 2,
					loop: true,
					socket: "right_hand",
				},
			],
		},
	};
	const restored = readProjectJson(JSON.stringify(project));
	expect(restored.assetCreator).toEqual(project.assetCreator);
	expect(sceneAssets(restored)).toContainEqual(
		expect.objectContaining({ id: variant.id, kind: "character" }),
	);
	const originalVisual = resolveThreeCharacterVisual(
		{
			kind: "npc",
			threeVisual: { mode: "asset", assetId: variant.baseAssetId },
		},
		restored.characterAssets,
		restored.assetCreator?.variants,
	);
	const variantVisual = resolveThreeCharacterVisual(
		{ kind: "npc", threeVisual: { mode: "asset", assetId: variant.id } },
		restored.characterAssets,
		restored.assetCreator?.variants,
	);
	expect(variantVisual.asset?.url).toBe(originalVisual.asset?.url);
	expect(variantVisual.asset?.variant?.tint).toBe(variant.tint);
	expect(variantVisual.asset?.attachmentAsset?.id).toBe("weapon-sword-v1");
	expect(originalVisual.asset?.variant).toBeUndefined();
	expect(restored.areas).toEqual(original.areas);
	expect(migrateProject(original).assetCreator).toBeUndefined();
});

it("keeps missing base references and does not populate absent or deleted resources", () => {
	const restored = migrateAssetCreator({
		variants: [
			{ id: "orphan", baseAssetId: "unavailable-glb", scale: 99 },
			{ id: "orphan", baseAssetId: "different" },
		],
		clips: [{ id: "invalid", sourceAssetId: "clip-source" }],
	});
	expect(restored.variants).toMatchObject([
		{ id: "orphan", baseAssetId: "unavailable-glb", scale: 5 },
	]);
	expect(restored.clips).toEqual([]);
	expect(restored.effects).toEqual([]);
});
