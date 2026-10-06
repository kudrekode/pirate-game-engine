import type { CompiledCharacterAssetMetadataV1 } from "@adventure-game-builder/asset-compiler-contract";
import { HUMANOID_V1_SKELETON_ID } from "@adventure-game-builder/character-contract";

export type GameEngineCharacterAssetMetadata = Pick<
	CompiledCharacterAssetMetadataV1,
	"assetId" | "category" | "displayName" | "skeletonId" | "transforms"
>;

export function isHumanoidV1CharacterAssetMetadata(metadata: {
	category?: string;
	skeletonId?: string;
}): boolean {
	return (
		metadata.category === "character" &&
		metadata.skeletonId === HUMANOID_V1_SKELETON_ID
	);
}
