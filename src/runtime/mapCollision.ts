import { WORLD_ASSET_TRAVERSAL } from "../data/worldAssetTraversal";
import type {
	GameProject,
	MapSceneAppearance,
	ThreeVisualConfig,
} from "../types/game";

export function blocksMapEntity(
	entity: { scene?: MapSceneAppearance },
	legacyBlocks: boolean,
): boolean {
	return entity.scene?.collision === undefined
		? legacyBlocks
		: entity.scene.collision === "solid";
}

export function getTraversalAssetProfile(
	project: GameProject,
	visual: ThreeVisualConfig,
	includeVariants = true,
) {
	if (visual.mode !== "asset" || !visual.assetId) return;
	const variant = includeVariants
		? project.assetCreator?.variants.find(
				(candidate) => candidate.id === visual.assetId,
			)
		: undefined;
	const id = variant?.baseAssetId ?? visual.assetId;
	if (!Object.getOwnPropertyDescriptor(WORLD_ASSET_TRAVERSAL, id)) return;
	const profile = WORLD_ASSET_TRAVERSAL[id];
	return { profile, variant };
}
