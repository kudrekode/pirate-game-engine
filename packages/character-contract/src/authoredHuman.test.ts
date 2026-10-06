import { describe, expect, it } from "vitest";
import {
	createAuthoredHumanRecipe,
	createDefaultCharacterRecipe,
	parseCharacterRecipe,
	sameCharacterGeometry,
	serializeCharacterRecipe,
} from "./index";

describe("authored human geometry source", () => {
	it("preserves legacy values and round-trips authored identities independently", () => {
		const legacy = createDefaultCharacterRecipe();
		legacy.body.parameters.shoulderWidth = 0.8;
		const parsed = parseCharacterRecipe(
			JSON.parse(serializeCharacterRecipe(legacy)),
		);
		expect(parsed.ok && parsed.value).toEqual(legacy);
		const authored = createAuthoredHumanRecipe();
		if (authored.geometry?.family !== "authored-human") throw Error("family");
		authored.geometry.values.headWidth = -1;
		authored.geometry.values.mass = 1;
		const roundtrip = parseCharacterRecipe(
			JSON.parse(serializeCharacterRecipe(authored)),
		);
		expect(roundtrip.ok && roundtrip.value).toEqual(authored);
		expect(
			sameCharacterGeometry(
				authored.geometry,
				roundtrip.ok ? roundtrip.value.geometry : undefined,
			),
		).toBe(true);
		expect(sameCharacterGeometry(authored.geometry, legacy.geometry)).toBe(
			false,
		);
	});
	it("rejects unproven identities, revision changes, hairstyles and legacy proportions", () => {
		for (const mutate of [
			(r: any) => (r.geometry.baseRevision = "future"),
			(r: any) => (r.geometry.rigProfile = "other"),
			(r: any) => (r.geometry.values.mass = -1),
			(r: any) => (r.geometry.values.nose = Infinity),
			(r: any) => (r.components.hair = "quaternius-hair-long-v1"),
			(r: any) => (r.body.parameters.armLength = 0.7),
		]) {
			const recipe = createAuthoredHumanRecipe();
			mutate(recipe);
			expect(parseCharacterRecipe(recipe).ok).toBe(false);
		}
	});
});
