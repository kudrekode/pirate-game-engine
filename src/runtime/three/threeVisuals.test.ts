import { describe, expect, it } from "vitest";
import type { ObjectBehaviour, ThreeVisualConfig } from "../../types/game";
import {
	composeThreeVisualYaw,
	resolveThreeVisual,
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

	it("keeps V1 asset requests on the placeholder fallback seam", () => {
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
});
