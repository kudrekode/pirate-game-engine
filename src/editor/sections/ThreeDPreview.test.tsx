import { describe, expect, it } from "vitest";
import { defaultProject } from "../../data/defaultProject";
import {
	setThreeVisualAssetRegistryForTests,
	type ThreeVisualAssetDefinition,
} from "../../runtime/three/threeVisualAssetRegistry";
import { createPlayerSpawnPreviewMarker } from "./ThreeDPreview";

const playerAsset: ThreeVisualAssetDefinition = {
	category: "character",
	defaultHeightOffset: 0.2,
	defaultRotationOffset: 90,
	defaultScale: 1.1,
	id: "demo-player",
	kind: "glb",
	name: "Demo Player",
	url: "/assets/demo-player.glb",
};

describe("player spawn preview marker", () => {
	it("uses the authored player visual while retaining the spawn marker identity", () => {
		const restoreRegistry = setThreeVisualAssetRegistryForTests([playerAsset]);
		const area = defaultProject.areas.find(
			(candidate) => candidate.id === "area_main",
		);
		if (!area) {
			throw new Error("Expected the Main Area.");
		}

		try {
			const marker = createPlayerSpawnPreviewMarker(
				area,
				{
					...defaultProject.player,
					threeVisual: { assetId: "demo-player", mode: "asset" },
				},
				"smooth",
			);

			expect(marker).toMatchObject({
				id: "spawn_start",
				kind: "event",
				visual: {
					assetId: "demo-player",
					mode: "asset",
					placeholderType: "player",
				},
				visualType: "player",
			});
		} finally {
			restoreRegistry();
		}
	});
});
