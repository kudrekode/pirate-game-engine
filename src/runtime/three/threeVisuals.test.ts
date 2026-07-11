import { describe, expect, it } from "vitest";
import type { ObjectBehaviour, ThreeVisualConfig } from "../../types/game";
import { setThreeVisualAssetRegistryForTests } from "./threeVisualAssetRegistry";
import {
	composeThreeVisualYaw,
	resolveThreeVisual,
	resolveThreeVisualAssetTransform,
	THREE_PLACEHOLDER_VISUAL_OPTIONS,
} from "./threeVisuals";

const boatBehaviour: Extract<ObjectBehaviour, { type: "vehicle" }> = {
	allowedTerrainIds: ["water"],
	dismountAllowedTerrainIds: ["grass"],
	movementMode: "sail",
	type: "vehicle",
	vehicleType: "boat",
};

describe("three visual resolver", () => {
	it("exposes the expected placeholder palette keys", () => {
		expect(
			THREE_PLACEHOLDER_VISUAL_OPTIONS.map((option) => option.value),
		).toEqual([
			"tree",
			"house",
			"marketStall",
			"boat",
			"chest",
			"sign",
			"door",
			"rock",
			"pickup",
			"npc",
			"hostileNpc",
			"genericObject",
			"event",
		]);
	});

	it("prefers authored placeholder visuals over inferred object visuals", () => {
		expect(
			resolveThreeVisual({
				category: "container",
				kind: "object",
				name: "Supply Chest",
				threeVisual: {
					heightOffset: 0.25,
					placeholderType: "tree",
					rotationOffset: 90,
					scale: 1.4,
				},
			}),
		).toMatchObject({
			heightOffset: 0.25,
			placeholderType: "tree",
			rotationOffset: 90,
			scale: 1.4,
			source: "authored",
		});
	});

	it("preserves inferred placeholder visuals when no authored visual exists", () => {
		expect(
			resolveThreeVisual({
				behaviour: boatBehaviour,
				category: "vehicle",
				kind: "object",
				name: "Harbor Boat",
			}),
		).toMatchObject({
			heightOffset: 0,
			placeholderType: "boat",
			rotationOffset: 0,
			scale: 1,
			source: "inferred",
		});
		expect(
			resolveThreeVisual({
				category: "container",
				kind: "object",
				name: "Chest",
			}).placeholderType,
		).toBe("chest");
		expect(
			resolveThreeVisual({
				enemyEnabled: true,
				kind: "npc",
				name: "Raider",
			}).placeholderType,
		).toBe("hostileNpc");
	});

	it("resolves known asset visual assignments to asset mode", () => {
		const restoreRegistry = setThreeVisualAssetRegistryForTests([
			{
				defaultHeightOffset: 0.2,
				defaultRotationOffset: 15,
				defaultScale: 1.5,
				id: "demo_npc",
				kind: "glb",
				name: "Demo NPC",
				url: "/assets/demo-npc.glb",
			},
		]);

		try {
			expect(
				resolveThreeVisual({
					kind: "npc",
					name: "Captain Mira",
					threeVisual: {
						assetId: "demo_npc",
						mode: "asset",
						placeholderType: "npc",
					},
				}),
			).toMatchObject({
				asset: {
					id: "demo_npc",
					url: "/assets/demo-npc.glb",
				},
				assetId: "demo_npc",
				heightOffset: 0.2,
				mode: "asset",
				placeholderType: "npc",
				requestedMode: "asset",
				rotationOffset: 15,
				scale: 1.5,
				source: "authored",
			});
		} finally {
			restoreRegistry();
		}
	});

	it("resolves built-in pirate asset assignments through asset mode", () => {
		expect(
			resolveThreeVisual({
				category: "container",
				kind: "object",
				name: "Chest",
				threeVisual: {
					assetId: "pirate-chest",
					mode: "asset",
					placeholderType: "chest",
				},
			}),
		).toMatchObject({
			asset: {
				id: "pirate-chest",
				url: "/assets/pirate-demo/chest.glb",
			},
			assetId: "pirate-chest",
			mode: "asset",
			placeholderType: "chest",
			requestedMode: "asset",
			scale: 0.22,
			source: "authored",
		});
		expect(
			resolveThreeVisual({
				behaviour: boatBehaviour,
				category: "vehicle",
				kind: "object",
				name: "Boat",
				threeVisual: {
					assetId: "pirate-small-ship",
					mode: "asset",
					placeholderType: "boat",
				},
			}),
		).toMatchObject({
			asset: {
				id: "pirate-small-ship",
				url: "/assets/pirate-demo/ship-pirate-small.glb",
			},
			assetId: "pirate-small-ship",
			mode: "asset",
			placeholderType: "boat",
			requestedMode: "asset",
			scale: 0.12,
			source: "authored",
		});
	});

	it("falls back safely when an asset request has no usable asset id", () => {
		expect(
			resolveThreeVisual({
				kind: "npc",
				name: "Captain Mira",
				threeVisual: {
					mode: "asset",
					placeholderType: "npc",
				},
			}),
		).toMatchObject({
			mode: "placeholder",
			placeholderType: "npc",
			requestedMode: "asset",
			source: "authored",
		});
		expect(
			resolveThreeVisual({
				category: "misc",
				kind: "object",
				name: "Mystery",
				threeVisual: {
					assetId: "missing_asset",
					mode: "asset",
				},
			}),
		).toMatchObject({
			assetId: "missing_asset",
			mode: "placeholder",
			placeholderType: "genericObject",
			requestedMode: "asset",
			source: "authored",
		});
	});

	it("falls back safely for invalid authored config values", () => {
		const invalidConfig = {
			heightOffset: Number.NaN,
			placeholderType: "unknown",
			rotationOffset: Infinity,
			scale: "large",
		} as unknown as ThreeVisualConfig;

		expect(
			resolveThreeVisual({
				category: "misc",
				kind: "object",
				name: "Mystery",
				threeVisual: invalidConfig,
			}),
		).toMatchObject({
			heightOffset: 0,
			placeholderType: "genericObject",
			rotationOffset: 0,
			scale: 1,
		});
	});

	it("composes facing yaw with authored rotation offset", () => {
		expect(
			composeThreeVisualYaw(Math.PI / 2, { rotationOffset: 90 }),
		).toBeCloseTo(Math.PI);
	});

	it("normalises the model before applying resolved registry or author transforms", () => {
		const analysis = {
			bounds: {
				center: { x: 0, y: 1, z: 0 },
				dimensions: { x: 2, y: 4, z: 2 },
				maxY: 3,
				minY: -1,
			},
		};

		expect(
			resolveThreeVisualAssetTransform(
				{ heightOffset: 0.25, rotationOffset: 90, scale: 1.5 },
				analysis,
			),
		).toEqual({
			heightOffset: 0.25,
			normalizationOffsetY: 1,
			rotationYRadians: Math.PI / 2,
			scale: 1.5,
		});
	});

	it("lets authored transforms override registry defaults before asset placement", () => {
		const restoreRegistry = setThreeVisualAssetRegistryForTests([
			{
				defaultHeightOffset: 0.2,
				defaultRotationOffset: 15,
				defaultScale: 1.5,
				id: "demo_npc",
				kind: "glb",
				name: "Demo NPC",
				url: "/assets/demo-npc.glb",
			},
		]);

		try {
			const visual = resolveThreeVisual({
				kind: "npc",
				threeVisual: {
					assetId: "demo_npc",
					heightOffset: 0.8,
					mode: "asset",
					rotationOffset: 60,
					scale: 2,
				},
			});
			expect(visual).toMatchObject({
				heightOffset: 0.8,
				rotationOffset: 60,
				scale: 2,
			});
		} finally {
			restoreRegistry();
		}
	});
});
