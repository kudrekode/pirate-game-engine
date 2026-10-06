import { describe, expect, it } from "vitest";
import {
	AUTHORED_BODY_PRESETS,
	AUTHORED_FACE_PRESETS,
	createAuthoredHumanRecipe,
	matchingAuthoredPreset,
	parseCharacterRecipe,
	serializeCharacterRecipe,
} from "./index";

describe("authored creator presets", () => {
	for (const body of AUTHORED_BODY_PRESETS)
		for (const face of AUTHORED_FACE_PRESETS) {
			it(`reopens resolved ${body.name}/${face.name} values without a preset dependency`, () => {
				const recipe = createAuthoredHumanRecipe();
				if (recipe.geometry?.family !== "authored-human") throw Error("family");
				recipe.geometry.values = {
					...recipe.geometry.values,
					...body.values,
					...face.values,
				};
				recipe.body.parameters.height = 1.63;
				recipe.palette.hair = "#8b3f27";
				const reopened = parseCharacterRecipe(
					JSON.parse(serializeCharacterRecipe(recipe)),
				);
				expect(reopened.ok).toBe(true);
				if (!reopened.ok) throw Error("invalid recipe");
				expect(reopened.value).toEqual(recipe);
				expect(
					matchingAuthoredPreset(recipe.geometry.values, AUTHORED_BODY_PRESETS)
						?.id,
				).toBe(body.id);
				expect(
					matchingAuthoredPreset(recipe.geometry.values, AUTHORED_FACE_PRESETS)
						?.id,
				).toBe(face.id);
				recipe.geometry.values.mass = 0.37;
				expect(
					matchingAuthoredPreset(recipe.geometry.values, AUTHORED_BODY_PRESETS),
				).toBeUndefined();
				expect(
					matchingAuthoredPreset(recipe.geometry.values, AUTHORED_FACE_PRESETS)
						?.id,
				).toBe(face.id);
			});
		}
});
