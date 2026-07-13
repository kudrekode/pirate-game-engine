import { describe, expect, it } from "vitest";
import { isHumanoidV1CharacterAssetMetadata } from "./assetStudioContractIntegration";

describe("Asset Studio contract integration", () => {
	it("keeps the game-engine seam limited to compiled character metadata", () => {
		expect(
			isHumanoidV1CharacterAssetMetadata({
				category: "character",
				skeletonId: "humanoid-v1",
			}),
		).toBe(true);
		expect(
			isHumanoidV1CharacterAssetMetadata({
				category: "character",
				skeletonId: "legacy-rig",
			}),
		).toBe(false);
	});
});
