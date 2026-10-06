// biome-ignore-all lint/suspicious/noExplicitAny: These mutations deliberately exercise malformed persisted input.
import { describe, expect, it } from "vitest";
// @ts-expect-error Direct Node compiler contract, cross-checked with the typed recipe contract.
import { validateClothing } from "../../../tools/blender-character/clothing-contract.mjs";
import {
	AUTHORED_BODY_PRESETS,
	clothingIssues,
	createAuthoredHumanRecipe,
	createDefaultCharacterRecipe,
	everydayClothing,
	noClothing,
	parseCharacterRecipe,
	sameClothing,
	serializeCharacterRecipe,
} from "./index";

describe("first outfit recipe", () => {
	it("round-trips selected revisions, tints and explicit none without dressing older recipes", () => {
		const recipe = createAuthoredHumanRecipe();
		recipe.clothing = everydayClothing();
		if (recipe.clothing.top === "none") throw Error("top");
		recipe.clothing.top.color = "#dddcd5";
		recipe.clothing.footwear = "none";
		const parsed = parseCharacterRecipe(
			JSON.parse(serializeCharacterRecipe(recipe)),
		);
		expect(parsed.ok && parsed.value).toEqual(recipe);
		delete recipe.clothing;
		const old = parseCharacterRecipe(recipe);
		expect(old.ok && old.value.clothing).toBeUndefined();
		expect(createDefaultCharacterRecipe().clothing).toBeUndefined();
		recipe.clothing = noClothing();
		expect(parseCharacterRecipe(recipe).ok).toBe(true);
		expect(sameClothing(undefined, noClothing())).toBe(true);
		expect(sameClothing(everydayClothing(), noClothing())).toBe(false);
	});
	it("keeps UI and compiler rejection rules aligned and accepts all shipped bodies", () => {
		const recipe = createAuthoredHumanRecipe();
		recipe.clothing = everydayClothing();
		if (recipe.geometry?.family !== "authored-human") throw Error("family");
		for (const preset of AUTHORED_BODY_PRESETS) {
			Object.assign(recipe.geometry.values, preset.values);
			expect(clothingIssues(recipe.clothing, recipe.geometry)).toEqual([]);
			expect(validateClothing(recipe.clothing, recipe.geometry)).toEqual([]);
		}
		for (const mutation of [
			(v: any) => (v.clothing.top.revision = "999"),
			(v: any) => (v.clothing.top.componentId = "unknown"),
			(v: any) => (v.clothing.top.color = "red"),
			(v: any) => delete v.clothing.bottoms,
			(v: any) => (v.geometry.family = "legacy-procedural"),
			(v: any) => delete v.geometry.values,
			(v: any) =>
				Object.assign(v.geometry.values, {
					mass: 1,
					athletic: 1,
					broadFrame: 1,
				}),
		]) {
			const changed = structuredClone(recipe);
			mutation(changed);
			expect(parseCharacterRecipe(changed).ok).toBe(false);
			expect(
				validateClothing(changed.clothing, changed.geometry).length,
			).toBeGreaterThan(0);
		}
	});
});
